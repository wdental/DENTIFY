// =====================================================================
// Planes de cuotas (Fase 4B): acuerdo de entrada + N cuotas mensuales
// (ortodoncia u otros). El cronograma no se persiste: se calcula en
// utils/finanzas.js contra los pagos validos vinculados (pagos.plan_pago_id).
// Un acuerdo no se edita una vez creado (para no reescribir un cronograma
// contra el que ya hay pagos): se cancela (solo admin, con motivo) y se
// crea otro. Se marca "completado" solo al registrar el pago que lo cubre.
// =====================================================================
const express = require('express');
const db = require('../db/conexion');
const { requiereSesion, requierePermiso } = require('../middleware/auth');
const { redondear, calcularCronograma, pagosDelPlanPago } = require('../utils/finanzas');

const router = express.Router();
router.use(requiereSesion);

const SELECT_PLAN_PAGO = `
    SELECT pp.*, u.nombre AS creado_por_nombre, pt.estado AS plan_estado, pt.total AS plan_total
    FROM planes_pago pp
    LEFT JOIN usuarios u ON u.id = pp.creado_por
    LEFT JOIN planes_tratamiento pt ON pt.id = pp.plan_id
`;

function cargarConCronograma(id) {
    const planPago = db.prepare(`${SELECT_PLAN_PAGO} WHERE pp.id = ?`).get(id);
    if (!planPago) return null;
    const pagosPaciente = db.prepare(`
        SELECT pg.*, u.nombre AS registrado_por_nombre FROM pagos pg
        LEFT JOIN usuarios u ON u.id = pg.registrado_por
        WHERE pg.paciente_id = ? ORDER BY pg.fecha_pago, pg.id
    `).all(planPago.paciente_id);
    // Incluye los anulados (para mostrarlos tachados) pero solo los validos abonan
    const vinculados = pagosPaciente.filter((p) => p.plan_pago_id === planPago.id || (planPago.plan_id && p.plan_id === planPago.plan_id && !p.plan_pago_id));
    planPago.pagos = vinculados;
    planPago.cronograma = calcularCronograma(planPago, pagosDelPlanPago(planPago, vinculados.filter((p) => !p.anulado)));
    return planPago;
}

// GET /api/planes-pago/paciente/:pacienteId - todos los acuerdos del paciente
router.get('/paciente/:pacienteId', requierePermiso('caja.ver'), (req, res) => {
    const filas = db.prepare(`${SELECT_PLAN_PAGO} WHERE pp.paciente_id = ? ORDER BY pp.id DESC`).all(req.params.pacienteId);
    res.json(filas.map((f) => cargarConCronograma(f.id)));
});

// GET /api/planes-pago/:id - uno con cronograma y pagos
router.get('/:id', requierePermiso('caja.ver'), (req, res) => {
    const planPago = cargarConCronograma(req.params.id);
    if (!planPago) return res.status(404).json({ error: 'Plan de cuotas no encontrado' });
    res.json(planPago);
});

// -----------------------------------------------------------------
// POST /api/planes-pago - crear acuerdo (admin y asistencial)
// body: { paciente_id, plan_id?, descripcion, monto_total, entrada,
//         numero_cuotas, monto_cuota, dia_pago_mes, fecha_inicio, notas }
// -----------------------------------------------------------------
router.post('/', requierePermiso('caja.registrar'), (req, res) => {
    const b = req.body || {};
    const pacienteId = Number(b.paciente_id);
    const paciente = db.prepare('SELECT id FROM pacientes WHERE id = ?').get(pacienteId);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    const descripcion = String(b.descripcion || '').trim();
    if (!descripcion) return res.status(400).json({ error: 'Debe indicar una descripción del acuerdo (ej. "Ortodoncia")' });

    const montoTotal = redondear(b.monto_total);
    const entrada = redondear(b.entrada || 0);
    const numeroCuotas = parseInt(b.numero_cuotas, 10);
    const montoCuota = redondear(b.monto_cuota);
    const diaPago = parseInt(b.dia_pago_mes, 10);
    const fechaInicio = String(b.fecha_inicio || '').slice(0, 10);

    if (!(montoTotal > 0)) return res.status(400).json({ error: 'El monto total debe ser mayor que cero' });
    if (entrada < 0) return res.status(400).json({ error: 'La entrada no puede ser negativa' });
    if (entrada >= montoTotal) return res.status(400).json({ error: 'La entrada debe ser menor que el monto total' });
    if (!(numeroCuotas >= 1) || numeroCuotas > 120) return res.status(400).json({ error: 'El número de cuotas debe estar entre 1 y 120' });
    if (!(montoCuota > 0)) return res.status(400).json({ error: 'El monto de la cuota debe ser mayor que cero' });
    if (!(diaPago >= 1 && diaPago <= 28)) return res.status(400).json({ error: 'El día de pago debe estar entre 1 y 28' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicio) || isNaN(new Date(fechaInicio + 'T00:00:00').getTime())) {
        return res.status(400).json({ error: 'Fecha de inicio no válida' });
    }

    // La ultima cuota absorbe la diferencia; debe quedar > 0
    const aFinanciar = redondear(montoTotal - entrada);
    const ultimaCuota = redondear(aFinanciar - redondear(montoCuota * (numeroCuotas - 1)));
    if (ultimaCuota <= 0) {
        return res.status(400).json({ error: `Las cuotas superan el monto a financiar ($${aFinanciar.toFixed(2)}). Reduzca el monto de cuota o el número de cuotas.` });
    }

    let planId = null;
    if (b.plan_id) {
        const plan = db.prepare('SELECT id, estado FROM planes_tratamiento WHERE id = ? AND paciente_id = ?').get(b.plan_id, pacienteId);
        if (!plan) return res.status(400).json({ error: 'Plan de tratamiento no válido para este paciente' });
        if (!['aceptado', 'en_curso'].includes(plan.estado)) {
            return res.status(400).json({ error: 'Solo se puede vincular un plan de cuotas a un plan de tratamiento aceptado o en curso' });
        }
        const yaExiste = db.prepare("SELECT id FROM planes_pago WHERE plan_id = ? AND estado = 'activo'").get(plan.id);
        if (yaExiste) return res.status(400).json({ error: 'Ese plan de tratamiento ya tiene un plan de cuotas activo' });
        planId = plan.id;
    }

    const resultado = db.prepare(`
        INSERT INTO planes_pago (paciente_id, plan_id, descripcion, monto_total, entrada, numero_cuotas, monto_cuota,
                                 dia_pago_mes, fecha_inicio, notas, creado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(pacienteId, planId, descripcion, montoTotal, entrada, numeroCuotas, montoCuota, diaPago, fechaInicio,
        String(b.notas || '').trim() || null, req.session.usuario.id);

    res.status(201).json(cargarConCronograma(resultado.lastInsertRowid));
});

// -----------------------------------------------------------------
// PUT /api/planes-pago/:id/cancelar - solo admin, con motivo. Los pagos
// ya registrados contra el acuerdo permanecen intactos (son inmutables).
// -----------------------------------------------------------------
router.put('/:id/cancelar', requierePermiso('caja.cancelar_cuotas'), (req, res) => {
    const planPago = db.prepare('SELECT id, estado FROM planes_pago WHERE id = ?').get(req.params.id);
    if (!planPago) return res.status(404).json({ error: 'Plan de cuotas no encontrado' });
    if (planPago.estado !== 'activo') return res.status(400).json({ error: 'Solo se puede cancelar un plan de cuotas activo' });

    const motivo = String((req.body || {}).motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'Debe indicar el motivo de la cancelación' });

    db.prepare("UPDATE planes_pago SET estado = 'cancelado', motivo_cancelacion = ? WHERE id = ?").run(motivo, planPago.id);
    res.json({ ok: true });
});

module.exports = router;
