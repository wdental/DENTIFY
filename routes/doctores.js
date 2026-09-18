// =====================================================================
// Rutas de doctores: listado (todos los usuarios) y CRUD (solo admin)
// =====================================================================
const express = require('express');
const db = require('../db/conexion');
const googleCalendar = require('../utils/googleCalendar');
const { requiereSesion, requierePermiso, usuarioTienePermiso } = require('../middleware/auth');

const router = express.Router();
router.use(requiereSesion);

// GET /api/doctores - lista de doctores (activos por defecto)
// Los usuarios no admin solo ven doctores activos (para asignar citas)
router.get('/', (req, res) => {
    const incluirInactivos = req.query.incluirInactivos === '1' && usuarioTienePermiso(req.session.usuario, 'catalogos.doctores');

    const sql = incluirInactivos
        ? 'SELECT * FROM doctores ORDER BY nombre_completo'
        : 'SELECT * FROM doctores WHERE activo = 1 ORDER BY nombre_completo';

    res.json(db.prepare(sql).all());
});

// GET /api/doctores/:id
router.get('/:id', (req, res) => {
    const doctor = db.prepare('SELECT * FROM doctores WHERE id = ?').get(req.params.id);
    if (!doctor) return res.status(404).json({ error: 'Doctor no encontrado' });
    res.json(doctor);
});

router.use(requierePermiso('catalogos.doctores'));

// POST /api/doctores - crear doctor
router.post('/', (req, res) => {
    const { nombre_completo, titulo, registro_profesional, calendario_google_id } = req.body;

    if (!nombre_completo || !nombre_completo.trim()) {
        return res.status(400).json({ error: 'El nombre completo es obligatorio' });
    }

    if (registro_profesional) {
        const existente = db.prepare('SELECT id FROM doctores WHERE registro_profesional = ?').get(registro_profesional);
        if (existente) {
            return res.status(400).json({ error: 'Ya existe un doctor con ese numero de registro' });
        }
    }

    const resultado = db.prepare(`
        INSERT INTO doctores (nombre_completo, titulo, registro_profesional, calendario_google_id, activo)
        VALUES (?, ?, ?, ?, 1)
    `).run(
        nombre_completo.trim(),
        titulo || null,
        registro_profesional || null,
        calendario_google_id || null
    );

    res.json({ ok: true, id: resultado.lastInsertRowid });
});

// PUT /api/doctores/:id - editar doctor (datos, calendario, activo)
router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const existente = db.prepare('SELECT * FROM doctores WHERE id = ?').get(id);
    if (!existente) return res.status(404).json({ error: 'Doctor no encontrado' });

    const { nombre_completo, titulo, registro_profesional, calendario_google_id, activo } = req.body;

    if (nombre_completo !== undefined && !nombre_completo.trim()) {
        return res.status(400).json({ error: 'El nombre completo es obligatorio' });
    }

    if (registro_profesional) {
        const duplicado = db.prepare(
            'SELECT id FROM doctores WHERE registro_profesional = ? AND id != ?'
        ).get(registro_profesional, id);
        if (duplicado) {
            return res.status(400).json({ error: 'Ya existe otro doctor con ese numero de registro' });
        }
    }

    db.prepare(`
        UPDATE doctores SET
            nombre_completo = ?, titulo = ?, registro_profesional = ?, calendario_google_id = ?, activo = ?
        WHERE id = ?
    `).run(
        nombre_completo !== undefined ? nombre_completo.trim() : existente.nombre_completo,
        titulo !== undefined ? (titulo || null) : existente.titulo,
        registro_profesional !== undefined ? (registro_profesional || null) : existente.registro_profesional,
        calendario_google_id !== undefined ? (calendario_google_id || null) : existente.calendario_google_id,
        activo !== undefined ? (activo ? 1 : 0) : existente.activo,
        id
    );

    res.json({ ok: true });
});

// POST /api/doctores/probar-conexion - valida que la cuenta de servicio
// tenga acceso al calendario indicado (no requiere guardar antes)
router.post('/probar-conexion', async (req, res) => {
    const { calendario_google_id } = req.body;

    if (!calendario_google_id || !calendario_google_id.trim()) {
        return res.status(400).json({ ok: false, error: 'Ingrese un ID de calendario para probar la conexion' });
    }

    try {
        const info = await googleCalendar.probarConexion(calendario_google_id.trim());
        res.json({ ok: true, resumen: info.summary || calendario_google_id, zonaHoraria: info.timeZone });
    } catch (error) {
        res.status(400).json({ ok: false, error: googleCalendar.interpretarError(error) });
    }
});

module.exports = router;
