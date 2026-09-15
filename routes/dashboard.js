// =====================================================================
// Rutas del dashboard inicial: indicadores generales
// =====================================================================
const express = require('express');
const db = require('../db/conexion');
const { requiereSesion, usuarioTienePermiso } = require('../middleware/auth');
const { calcularIndicadores } = require('./pagos');
const { hoyLocal, inicioMesLocal } = require('../utils/fechaLocal');

const router = express.Router();
router.use(requiereSesion);

// GET /api/dashboard/resumen — cada bloque se incluye solo si el usuario
// tiene el permiso del area (admin implica todos); las tarjetas de areas
// sin permiso llegan como null y el panel no las dibuja.
router.get('/resumen', (req, res) => {
    const usuario = req.session.usuario;
    const respuesta = {
        totalActivos: null, nuevosMes: null, distribucionOrigen: null,
        citasHoy: null, noShowsMes: null, finanzas: null, laboratorio: null
    };

    // Fechas de "hoy" y "este mes" segun el reloj LOCAL del servidor, no UTC:
    // con toISOString(), a partir de las 19:00 en Ecuador el panel mostraba las
    // citas de MAÑANA y "nuevos este mes" se saltaba el dia 1.
    const inicioMes = inicioMesLocal();

    if (usuarioTienePermiso(usuario, 'pacientes.ver')) {
        respuesta.totalActivos = db.prepare('SELECT COUNT(*) AS total FROM pacientes WHERE activo = 1').get().total;
        respuesta.nuevosMes = db.prepare(
            'SELECT COUNT(*) AS total FROM pacientes WHERE activo = 1 AND date(fecha_registro) >= date(?)'
        ).get(inicioMes).total;
        respuesta.distribucionOrigen = db.prepare(`
            SELECT COALESCE(origen, 'Sin especificar') AS origen, COUNT(*) AS total
            FROM pacientes
            WHERE activo = 1
            GROUP BY origen
            ORDER BY total DESC
        `).all();
    }

    if (usuarioTienePermiso(usuario, 'agenda.ver')) {
        const hoy = hoyLocal();
        respuesta.citasHoy = db.prepare(`
            SELECT c.id, c.hora_inicio, c.hora_fin, c.estado, c.doctor_nombre, c.sillon,
                   p.id AS paciente_id, p.nombres AS paciente_nombres, p.apellidos AS paciente_apellidos
            FROM citas c
            JOIN pacientes p ON p.id = c.paciente_id
            WHERE c.fecha = ?
            ORDER BY c.hora_inicio
        `).all(hoy);

        respuesta.noShowsMes = db.prepare(`
            SELECT COUNT(*) AS total FROM citas
            WHERE estado = 'no_asistio' AND date(fecha) >= date(?)
        `).get(inicioMes).total;
    }

    // Fase 4B: saldos pendientes, ingresos del mes y cuotas vencidas
    if (usuarioTienePermiso(usuario, 'caja.ver')) {
        respuesta.finanzas = calcularIndicadores();
    }

    // Fase 4C: trabajos en laboratorio (con cuantos van atrasados) y lo que
    // la clinica le debe a los laboratorios. Es un EGRESO: no se mezcla con
    // los ingresos de `finanzas`.
    if (usuarioTienePermiso(usuario, 'laboratorio.ver')) {
        const trabajosEnLaboratorio = db.prepare(
            "SELECT COUNT(*) AS total FROM trabajos_laboratorio WHERE estado = 'enviado'"
        ).get().total;
        const trabajosAtrasados = db.prepare(
            "SELECT COUNT(*) AS total FROM trabajos_laboratorio WHERE estado = 'enviado' AND fecha_estimada IS NOT NULL AND fecha_estimada < date('now', 'localtime')"
        ).get().total;
        // Lo que se le debe a los laboratorios es la suma de SALDOS (costo menos
        // los abonos validos), no de costos: un trabajo puede estar abonado en
        // parte. Ver routes/laboratorio.js.
        const deudaLaboratorios = db.prepare(`
            SELECT COALESCE(SUM(saldo), 0) AS total, COUNT(*) AS cantidad FROM (
                SELECT t.costo - COALESCE((SELECT SUM(pl.monto) FROM pagos_laboratorio pl
                                            WHERE pl.trabajo_id = t.id AND pl.anulado = 0), 0) AS saldo
                FROM trabajos_laboratorio t
                WHERE t.estado != 'cancelado'
            ) WHERE saldo > 0
        `).get();

        respuesta.laboratorio = {
            en_laboratorio: trabajosEnLaboratorio,
            atrasados: trabajosAtrasados,
            por_pagar_total: deudaLaboratorios.total,
            por_pagar_cantidad: deudaLaboratorios.cantidad
        };
    }

    res.json(respuesta);
});

module.exports = router;
