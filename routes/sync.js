// =====================================================================
// Rutas de estado y control de la sincronizacion con Google Calendar
// =====================================================================
const express = require('express');
const db = require('../db/conexion');
const sincronizacion = require('../utils/sincronizacion');
const googleCalendar = require('../utils/googleCalendar');
const { requiereSesion, requierePermiso } = require('../middleware/auth');

const router = express.Router();
router.use(requiereSesion);

// GET /api/sync/estado - para el indicador discreto en la agenda
router.get('/estado', (req, res) => {
    res.json({
        ...sincronizacion.obtenerEstado(),
        credencialesConfiguradas: googleCalendar.credencialesDisponibles()
    });
});

// POST /api/sync/ejecutar - forzar sincronizacion ahora (solo admin)
router.post('/ejecutar', requierePermiso('sistema.sync'), async (req, res) => {
    const resultado = await sincronizacion.procesarColaPendientes();
    res.json({ ok: true, ...resultado, estado: sincronizacion.obtenerEstado() });
});

// GET /api/sync/log - ultimas entradas del log (solo admin)
router.get('/log', requierePermiso('sistema.sync'), (req, res) => {
    const registros = db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 50').all();
    res.json(registros);
});

module.exports = router;
