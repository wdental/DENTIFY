// =====================================================================
// Rutas del dashboard inicial: indicadores generales
// =====================================================================
const express = require('express');
const db = require('../db/conexion');
const { requiereSesion } = require('../middleware/auth');
const { calcularIndicadores } = require('./pagos');
const { hoyLocal, inicioMesLocal } = require('../utils/fechaLocal');

const router = express.Router();
router.use(requiereSesion);

// GET /api/dashboard/resumen
router.get('/resumen', (req, res) => {
    const totalActivos = db.prepare('SELECT COUNT(*) AS total FROM pacientes WHERE activo = 1').get().total;

    // Fechas de "hoy" y "este mes" segun el reloj LOCAL del servidor, no UTC:
    // con toISOString(), a partir de las 19:00 en Ecuador el panel mostraba las
    // citas de MAÑANA y "nuevos este mes" se saltaba el dia 1.
    const inicioMes = inicioMesLocal();

    const nuevosMes = db.prepare(
        'SELECT COUNT(*) AS total FROM pacientes WHERE activo = 1 AND date(fecha_registro) >= date(?)'
    ).get(inicioMes).total;

    const distribucionOrigen = db.prepare(`
        SELECT COALESCE(origen, 'Sin especificar') AS origen, COUNT(*) AS total
        FROM pacientes
        WHERE activo = 1
        GROUP BY origen
        ORDER BY total DESC
    `).all();

    const hoy = hoyLocal();
    const citasHoy = db.prepare(`
        SELECT c.id, c.hora_inicio, c.hora_fin, c.estado, c.doctor_nombre, c.sillon,
               p.id AS paciente_id, p.nombres AS paciente_nombres, p.apellidos AS paciente_apellidos
        FROM citas c
        JOIN pacientes p ON p.id = c.paciente_id
        WHERE c.fecha = ?
        ORDER BY c.hora_inicio
    `).all(hoy);

    const noShowsMes = db.prepare(`
        SELECT COUNT(*) AS total FROM citas
        WHERE estado = 'no_asistio' AND date(fecha) >= date(?)
    `).get(inicioMes).total;

    // Fase 4B: saldos pendientes, ingresos del mes y cuotas vencidas
    const finanzas = calcularIndicadores();

    // Fase 4C: trabajos en laboratorio (con cuantos van atrasados) y lo que
    // la clinica le debe a los laboratorios. Es un EGRESO: no se mezcla con
    // los ingresos de `finanzas`.
    const trabajosEnLaboratorio = db.prepare(
        "SELECT COUNT(*) AS total FROM trabajos_laboratorio WHERE estado = 'enviado'"
    ).get().total;
    const trabajosAtrasados = db.prepare(
        "SELECT COUNT(*) AS total FROM trabajos_laboratorio WHERE estado = 'enviado' AND fecha_estimada IS NOT NULL AND fecha_estimada < date('now', 'localtime')"
    ).get().total;
    const deudaLaboratorios = db.prepare(
        "SELECT COALESCE(SUM(costo), 0) AS total, COUNT(*) AS cantidad FROM trabajos_laboratorio WHERE pagado = 0 AND estado != 'cancelado' AND costo > 0"
    ).get();

    const laboratorio = {
        en_laboratorio: trabajosEnLaboratorio,
        atrasados: trabajosAtrasados,
        por_pagar_total: deudaLaboratorios.total,
        por_pagar_cantidad: deudaLaboratorios.cantidad
    };

    res.json({
        totalActivos,
        nuevosMes,
        distribucionOrigen,
        citasHoy,
        noShowsMes,
        finanzas,
        laboratorio
    });
});

module.exports = router;
