// =====================================================================
// Pagos y caja (Fase 4B). Un pago registrado es INMUTABLE: no existe
// PUT ni DELETE. Solo un admin puede anularlo con motivo (queda visible
// tachado y excluido de todos los totales); una correccion es anular +
// registrar de nuevo. El numero de recibo (REC-AAAA-####) se asigna en la
// misma transaccion que inserta el pago. Ver docs/fase-4b.md.
// =====================================================================
const express = require('express');
const db = require('../db/conexion');
const { requiereSesion, requierePermiso } = require('../middleware/auth');
const { ahoraLocal } = require('../utils/fechaLocal');
const { generarNumeroRecibo } = require('../utils/numeroRecibo');
const { montoEnLetras } = require('../utils/montoEnLetras');
const { redondear, hoyIso, pagosDelPlanPago, resumenFinancieroPaciente, saldosGlobales, cuotasVencidas } = require('../utils/finanzas');

const router = express.Router();
router.use(requiereSesion);

// Metodos ACTIVOS: los unicos admitidos en pagos nuevos. Desde la
// especificacion de facturacion SRI (docs/fase-2-facturacion.md) la
// tarjeta se separa en credito/debito (codigos SRI 19 y 16) y 'otro' se
// retira por no ser facturable. Los pagos antiguos con 'tarjeta' u
// 'otro' se conservan intactos y se siguen mostrando (HISTORICOS).
const METODOS_ACTIVOS = ['efectivo', 'transferencia', 'tarjeta_credito', 'tarjeta_debito'];
const METODOS_HISTORICOS = ['tarjeta', 'otro'];
const METODOS = [...METODOS_ACTIVOS, ...METODOS_HISTORICOS];
const ETIQUETAS_METODO = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia (Banco Pichincha)',
    tarjeta_credito: 'Tarjeta de crédito',
    tarjeta_debito: 'Tarjeta de débito',
    tarjeta: 'Tarjeta',
    otro: 'Otro'
};
const METODOS_CON_REFERENCIA = ['transferencia', 'tarjeta_credito', 'tarjeta_debito', 'tarjeta'];

const SELECT_PAGO_BASE = `
    SELECT pg.*,
           pa.nombres AS paciente_nombres, pa.apellidos AS paciente_apellidos,
           pa.cedula AS paciente_cedula, pa.numero_historia AS paciente_historia,
           u.nombre AS registrado_por_nombre, ua.nombre AS anulado_por_nombre,
           d.nombre_completo AS doctor_nombre,
           pp.descripcion AS plan_pago_descripcion
    FROM pagos pg
    JOIN pacientes pa ON pa.id = pg.paciente_id
    LEFT JOIN usuarios u ON u.id = pg.registrado_por
    LEFT JOIN usuarios ua ON ua.id = pg.anulado_por
    LEFT JOIN doctores d ON d.id = pg.doctor_id
    LEFT JOIN planes_pago pp ON pp.id = pg.plan_pago_id
`;

function esFechaIso(valor) {
    return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !isNaN(new Date(valor + 'T00:00:00').getTime());
}

// Un metodo historico solo aparece en las vistas cuando el periodo tiene
// pagos con el (asi los dias viejos siguen cuadrando y los nuevos no
// cargan columnas muertas).
function metodosVisibles(pagos) {
    const presentes = new Set(pagos.map((p) => p.metodo));
    return METODOS.filter((m) => METODOS_ACTIVOS.includes(m) || presentes.has(m));
}

function totalesPorMetodo(pagos) {
    const totales = {};
    METODOS.forEach((m) => { totales[m] = { metodo: m, etiqueta: ETIQUETAS_METODO[m], total: 0, cantidad: 0 }; });
    let total = 0;
    let cantidad = 0;
    let anulados = 0;
    pagos.forEach((p) => {
        if (p.anulado) { anulados++; return; }
        totales[p.metodo].total = redondear(totales[p.metodo].total + Number(p.monto));
        totales[p.metodo].cantidad++;
        total = redondear(total + Number(p.monto));
        cantidad++;
    });
    const visibles = metodosVisibles(pagos);
    return { por_metodo: visibles.map((m) => totales[m]), total, cantidad, anulados };
}

// Total valido abonado a un plan de cuotas (mismo criterio que el cronograma:
// pagos con plan_pago_id + pagos directos al plan de tratamiento ligado).
function totalPagadoPlanPago(planPagoId) {
    const planPago = db.prepare('SELECT * FROM planes_pago WHERE id = ?').get(planPagoId);
    const pagosValidos = db.prepare('SELECT * FROM pagos WHERE paciente_id = ? AND anulado = 0').all(planPago.paciente_id);
    return redondear(pagosDelPlanPago(planPago, pagosValidos).reduce((s, p) => s + Number(p.monto), 0));
}

// -----------------------------------------------------------------
// GET /api/pagos/metodos - catalogo de metodos (etiquetas para el front)
// -----------------------------------------------------------------
router.get('/metodos', (req, res) => {
    res.json(METODOS_ACTIVOS.map((m) => ({ valor: m, etiqueta: ETIQUETAS_METODO[m] })));
});

// -----------------------------------------------------------------
// GET /api/pagos/caja/dia?fecha=YYYY-MM-DD - todos los pagos del dia
// (incluidos los anulados, marcados) + totales por metodo sin anulados.
// -----------------------------------------------------------------
router.get('/caja/dia', requierePermiso('caja.ver'), (req, res) => {
    const fecha = esFechaIso(req.query.fecha) ? req.query.fecha : hoyIso();
    const pagos = db.prepare(`${SELECT_PAGO_BASE} WHERE pg.fecha_pago = ? ORDER BY pg.id`).all(fecha);
    res.json({ fecha, pagos, totales: totalesPorMetodo(pagos), metodos_visibles: metodosVisibles(pagos), etiquetas_metodo: ETIQUETAS_METODO });
});

// -----------------------------------------------------------------
// GET /api/pagos/caja/mes?mes=YYYY-MM - totales por dia y por metodo
// -----------------------------------------------------------------
router.get('/caja/mes', requierePermiso('caja.ver'), (req, res) => {
    const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || '')) ? req.query.mes : hoyIso().slice(0, 7);
    const pagos = db.prepare('SELECT fecha_pago, metodo, monto, anulado FROM pagos WHERE substr(fecha_pago, 1, 7) = ? ORDER BY fecha_pago, id').all(mes);

    const porDia = {};
    pagos.forEach((p) => {
        if (!porDia[p.fecha_pago]) {
            porDia[p.fecha_pago] = { fecha: p.fecha_pago, total: 0, cantidad: 0, anulados: 0 };
            METODOS.forEach((m) => { porDia[p.fecha_pago][m] = 0; });
        }
        const dia = porDia[p.fecha_pago];
        if (p.anulado) { dia.anulados++; return; }
        dia[p.metodo] = redondear(dia[p.metodo] + Number(p.monto));
        dia.total = redondear(dia.total + Number(p.monto));
        dia.cantidad++;
    });

    res.json({ mes, dias: Object.values(porDia), totales: totalesPorMetodo(pagos), metodos_visibles: metodosVisibles(pagos), etiquetas_metodo: ETIQUETAS_METODO });
});

// -----------------------------------------------------------------
// GET /api/pagos/vencidas - cuotas vencidas de toda la clinica
// -----------------------------------------------------------------
router.get('/vencidas', requierePermiso('caja.ver'), (req, res) => {
    res.json(cuotasVencidas());
});

// -----------------------------------------------------------------
// GET /api/pagos/indicadores - tarjetas del dashboard
// -----------------------------------------------------------------
router.get('/indicadores', requierePermiso('caja.ver'), (req, res) => {
    res.json(calcularIndicadores());
});

function calcularIndicadores() {
    const mes = hoyIso().slice(0, 7);
    const ingresosMes = db.prepare(
        'SELECT COALESCE(SUM(monto), 0) AS total, COUNT(*) AS cantidad FROM pagos WHERE anulado = 0 AND substr(fecha_pago, 1, 7) = ?'
    ).get(mes);
    const saldos = saldosGlobales();
    const vencidas = cuotasVencidas();
    return {
        saldos_pendientes: saldos,
        ingresos_mes: { total: redondear(ingresosMes.total), cantidad: ingresosMes.cantidad, mes },
        cuotas_vencidas: { pacientes: vencidas.pacientes, monto: vencidas.monto, cuotas: vencidas.filas.length }
    };
}

// -----------------------------------------------------------------
// GET /api/pagos/paciente/:pacienteId - historial completo + resumen
// financiero (cuentas exigibles, saldo, planes de cuotas con cronograma).
// -----------------------------------------------------------------
router.get('/paciente/:pacienteId', requierePermiso('caja.ver'), (req, res) => {
    const paciente = db.prepare('SELECT id FROM pacientes WHERE id = ?').get(req.params.pacienteId);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    const pagos = db.prepare(`${SELECT_PAGO_BASE} WHERE pg.paciente_id = ? ORDER BY pg.fecha_pago DESC, pg.id DESC`).all(paciente.id);
    const resumen = resumenFinancieroPaciente(paciente.id);
    res.json({ pagos, resumen, etiquetas_metodo: ETIQUETAS_METODO });
});

// GET /api/pagos/paciente/:pacienteId/resumen - solo el resumen (panel derecho, modal)
router.get('/paciente/:pacienteId/resumen', requierePermiso('caja.ver'), (req, res) => {
    const paciente = db.prepare('SELECT id FROM pacientes WHERE id = ?').get(req.params.pacienteId);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json(resumenFinancieroPaciente(paciente.id));
});

// GET /api/pagos/paciente/:pacienteId/conceptos-sugeridos - items pendientes
// del plan aceptado/en_curso para autocompletar el concepto del pago.
router.get('/paciente/:pacienteId/conceptos-sugeridos', requierePermiso('caja.ver'), (req, res) => {
    const plan = db.prepare(
        "SELECT id, estado, total FROM planes_tratamiento WHERE paciente_id = ? AND estado IN ('aceptado', 'en_curso') ORDER BY id DESC LIMIT 1"
    ).get(req.params.pacienteId);
    if (!plan) return res.json({ plan: null, items: [] });

    const items = db.prepare(`
        SELECT id, piezas, descripcion, precio, estado_item FROM plan_items
        WHERE plan_id = ? AND estado_item != 'descartado' ORDER BY fase, orden, id
    `).all(plan.id);
    res.json({ plan, items });
});

// -----------------------------------------------------------------
// GET /api/pagos/:id - un pago con todo lo necesario para el recibo
// -----------------------------------------------------------------
router.get('/:id', requierePermiso('caja.ver'), (req, res) => {
    const pago = db.prepare(`${SELECT_PAGO_BASE} WHERE pg.id = ?`).get(req.params.id);
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
    pago.monto_en_letras = montoEnLetras(pago.monto);
    pago.metodo_etiqueta = ETIQUETAS_METODO[pago.metodo] || pago.metodo;
    res.json(pago);
});

// -----------------------------------------------------------------
// POST /api/pagos - registrar un pago (admin y asistencial)
// body: { paciente_id, concepto, monto, metodo, referencia, fecha_pago,
//         doctor_id, plan_id, plan_item_id, plan_pago_id }
// -----------------------------------------------------------------
router.post('/', requierePermiso('caja.registrar'), (req, res) => {
    const b = req.body || {};
    const pacienteId = Number(b.paciente_id);
    const paciente = db.prepare('SELECT id, activo FROM pacientes WHERE id = ?').get(pacienteId);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    const concepto = String(b.concepto || '').trim();
    if (!concepto) return res.status(400).json({ error: 'Debe indicar el concepto del pago' });

    const monto = redondear(b.monto);
    if (!(monto > 0)) return res.status(400).json({ error: 'El monto debe ser mayor que cero' });
    if (monto > 999999999) return res.status(400).json({ error: 'El monto es demasiado grande' });

    const metodo = String(b.metodo || '').toLowerCase();
    if (!METODOS_ACTIVOS.includes(metodo)) {
        return res.status(400).json({ error: METODOS_HISTORICOS.includes(metodo)
            ? 'Ese método ya no se usa para pagos nuevos: elija efectivo, transferencia o tarjeta de crédito/débito'
            : 'Método de pago no válido' });
    }

    const fechaPago = b.fecha_pago ? String(b.fecha_pago).slice(0, 10) : hoyIso();
    if (!esFechaIso(fechaPago)) return res.status(400).json({ error: 'Fecha de pago no válida' });
    if (fechaPago > hoyIso()) return res.status(400).json({ error: 'La fecha de pago no puede ser futura' });

    const referencia = METODOS_CON_REFERENCIA.includes(metodo) ? (String(b.referencia || '').trim() || null) : null;

    let doctorId = null;
    if (b.doctor_id) {
        const doctor = db.prepare('SELECT id FROM doctores WHERE id = ?').get(b.doctor_id);
        if (!doctor) return res.status(400).json({ error: 'Doctor no válido' });
        doctorId = doctor.id;
    }

    // Vinculos opcionales: el plan de cuotas manda sobre el plan de
    // tratamiento (si el acuerdo esta ligado a un plan, el pago hereda ese
    // plan_id para que el saldo del plan tambien lo refleje).
    let planPagoId = null;
    let planId = null;
    let planItemId = null;

    if (b.plan_pago_id) {
        const planPago = db.prepare('SELECT * FROM planes_pago WHERE id = ? AND paciente_id = ?').get(b.plan_pago_id, pacienteId);
        if (!planPago) return res.status(400).json({ error: 'Plan de cuotas no válido para este paciente' });
        if (planPago.estado !== 'activo') return res.status(400).json({ error: 'El plan de cuotas no está activo' });
        planPagoId = planPago.id;
        planId = planPago.plan_id || null;
    } else if (b.plan_id) {
        const plan = db.prepare('SELECT id, estado FROM planes_tratamiento WHERE id = ? AND paciente_id = ?').get(b.plan_id, pacienteId);
        if (!plan) return res.status(400).json({ error: 'Plan de tratamiento no válido para este paciente' });
        if (!['aceptado', 'en_curso', 'finalizado'].includes(plan.estado)) {
            return res.status(400).json({ error: 'Solo se pueden vincular pagos a un plan aceptado, en curso o finalizado' });
        }
        planId = plan.id;
        if (b.plan_item_id) {
            const item = db.prepare('SELECT id FROM plan_items WHERE id = ? AND plan_id = ?').get(b.plan_item_id, planId);
            if (!item) return res.status(400).json({ error: 'El tratamiento indicado no pertenece a ese plan' });
            planItemId = item.id;
        }
    }

    const transaccion = db.transaction(() => {
        const numeroRecibo = generarNumeroRecibo(fechaPago);
        const resultado = db.prepare(`
            INSERT INTO pagos (numero_recibo, paciente_id, plan_id, plan_item_id, plan_pago_id, concepto, monto, metodo,
                               referencia, fecha_pago, registrado_por, doctor_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(numeroRecibo, pacienteId, planId, planItemId, planPagoId, concepto, monto, metodo,
            referencia, fechaPago, req.session.usuario.id, doctorId);

        // Si el acuerdo de cuotas quedo totalmente cubierto, se marca completado
        if (planPagoId && totalPagadoPlanPago(planPagoId) >= redondear(db.prepare('SELECT monto_total FROM planes_pago WHERE id = ?').get(planPagoId).monto_total)) {
            db.prepare("UPDATE planes_pago SET estado = 'completado' WHERE id = ?").run(planPagoId);
        }
        return resultado.lastInsertRowid;
    });

    const id = transaccion();
    const pago = db.prepare(`${SELECT_PAGO_BASE} WHERE pg.id = ?`).get(id);
    pago.monto_en_letras = montoEnLetras(pago.monto);
    pago.metodo_etiqueta = ETIQUETAS_METODO[pago.metodo];
    res.status(201).json(pago);
});

// -----------------------------------------------------------------
// PUT /api/pagos/:id/anular - solo admin. Anulacion logica con motivo:
// el pago sigue existiendo (tachado) y conserva su numero de recibo.
// Si abonaba un plan de cuotas ya completado, este vuelve a "activo".
// -----------------------------------------------------------------
router.put('/:id/anular', requierePermiso('caja.anular'), (req, res) => {
    const pago = db.prepare('SELECT id, anulado, plan_pago_id FROM pagos WHERE id = ?').get(req.params.id);
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
    if (pago.anulado) return res.status(400).json({ error: 'Este pago ya está anulado' });

    const motivo = String((req.body || {}).motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'Debe indicar el motivo de la anulación' });

    const transaccion = db.transaction(() => {
        db.prepare('UPDATE pagos SET anulado = 1, motivo_anulacion = ?, anulado_por = ?, anulado_en = ? WHERE id = ?')
            .run(motivo, req.session.usuario.id, ahoraLocal(), pago.id);
        if (pago.plan_pago_id) {
            const planPago = db.prepare('SELECT monto_total, estado FROM planes_pago WHERE id = ?').get(pago.plan_pago_id);
            if (planPago && planPago.estado === 'completado' && totalPagadoPlanPago(pago.plan_pago_id) < redondear(planPago.monto_total)) {
                db.prepare("UPDATE planes_pago SET estado = 'activo' WHERE id = ?").run(pago.plan_pago_id);
            }
        }
    });
    transaccion();

    res.json({ ok: true });
});

module.exports = router;
module.exports.calcularIndicadores = calcularIndicadores;
