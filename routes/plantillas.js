// =====================================================================
// Rutas de plantillas de documento (Fase 3C). Lectura para cualquier
// usuario logueado (para poder generar un consentimiento); creacion,
// edicion y desactivacion solo para admin. Editar una plantilla NUNCA
// altera los consentimientos ya firmados (estos guardan su propio
// contenido_final, resuelto de forma permanente al momento de firmar).
// =====================================================================
const express = require('express');
const db = require('../db/conexion');
const { requiereSesion, requierePermiso, usuarioTienePermiso } = require('../middleware/auth');

const router = express.Router();
router.use(requiereSesion);

const TIPOS_VALIDOS = ['consentimiento', 'certificado', 'otro'];

// GET /api/plantillas?tipo=consentimiento&incluirInactivas=1
router.get('/', (req, res) => {
    const incluirInactivas = req.query.incluirInactivas === '1' && usuarioTienePermiso(req.session.usuario, 'catalogos.plantillas');
    const condiciones = [];
    const parametros = [];
    if (!incluirInactivas) condiciones.push('activo = 1');
    if (req.query.tipo) { condiciones.push('tipo = ?'); parametros.push(req.query.tipo); }
    const sql = `SELECT * FROM plantillas_documento ${condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : ''} ORDER BY nombre`;
    res.json(db.prepare(sql).all(...parametros));
});

// GET /api/plantillas/:id
router.get('/:id', (req, res) => {
    const plantilla = db.prepare('SELECT * FROM plantillas_documento WHERE id = ?').get(req.params.id);
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });
    res.json(plantilla);
});

// POST /api/plantillas - solo admin
router.post('/', requierePermiso('catalogos.plantillas'), (req, res) => {
    const { nombre, tipo, procedimiento_asociado, contenido } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    if (!TIPOS_VALIDOS.includes(tipo)) return res.status(400).json({ error: 'Tipo invalido' });
    if (!contenido || !contenido.trim()) return res.status(400).json({ error: 'El contenido es obligatorio' });

    const resultado = db.prepare(
        'INSERT INTO plantillas_documento (nombre, tipo, procedimiento_asociado, contenido, activo, creado_por) VALUES (?, ?, ?, ?, 1, ?)'
    ).run(nombre.trim(), tipo, (procedimiento_asociado || '').trim() || null, contenido, req.session.usuario.id);

    res.json({ ok: true, id: resultado.lastInsertRowid });
});

// PUT /api/plantillas/:id - solo admin. No afecta consentimientos ya firmados
// (contenido_final ya quedo resuelto e independiente en cada uno).
router.put('/:id', requierePermiso('catalogos.plantillas'), (req, res) => {
    const plantilla = db.prepare('SELECT id FROM plantillas_documento WHERE id = ?').get(req.params.id);
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const { nombre, tipo, procedimiento_asociado, contenido, activo } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    if (!TIPOS_VALIDOS.includes(tipo)) return res.status(400).json({ error: 'Tipo invalido' });
    if (!contenido || !contenido.trim()) return res.status(400).json({ error: 'El contenido es obligatorio' });

    db.prepare(
        'UPDATE plantillas_documento SET nombre = ?, tipo = ?, procedimiento_asociado = ?, contenido = ?, activo = ? WHERE id = ?'
    ).run(nombre.trim(), tipo, (procedimiento_asociado || '').trim() || null, contenido, activo !== undefined ? (activo ? 1 : 0) : 1, req.params.id);

    res.json({ ok: true });
});

module.exports = router;
