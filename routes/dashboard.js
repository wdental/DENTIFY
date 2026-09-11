// =====================================================================
// Rutas del dashboard inicial: indicadores generales
// =====================================================================
const express = require('express');
const db = require('../db/conexion');
const { requiereSesion } = require('../middleware/auth');

const router = express.Router();
router.use(requiereSesion);

// GET /api/dashboard/resumen
router.get('/resumen', (req, res) => {
    const totalActivos = db.prepare('SELECT COUNT(*) AS total FROM pacientes WHERE activo = 1').get().total;

    const primerDiaMes = new Date();
    primerDiaMes.setDate(1);
    const inicioMes = primerDiaMes.toISOString().slice(0, 10);

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

    const hoy = new Date().toISOString().slice(0, 10);
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

    res.json({
        totalActivos,
        nuevosMes,
        distribucionOrigen,
        citasHoy,
        noShowsMes
    });
});

module.exports = router;
