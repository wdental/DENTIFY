// =====================================================================
// Diagnosticos CIE-10 (Fase 3B, seccion N del F033). Hasta 6 por paciente,
// cada uno inicia en PRE (presuntivo) y puede promoverse a DEF (definitivo)
// conservando la fecha de cada estado para trazabilidad.
// =====================================================================
const express = require('express');
const db = require('../db/conexion');
const { requiereSesion } = require('../middleware/auth');

const router = express.Router();
router.use(requiereSesion);

const MAXIMO_DIAGNOSTICOS = 6;

// -----------------------------------------------------------------
// GET /api/diagnosticos/:pacienteId - diagnosticos activos del paciente
// -----------------------------------------------------------------
router.get('/:pacienteId', (req, res) => {
    const diagnosticos = db.prepare(`
        SELECT d.*, doc.nombre_completo AS doctor_nombre
        FROM diagnosticos d
        LEFT JOIN doctores doc ON doc.id = d.doctor_id
        WHERE d.paciente_id = ? AND d.activo = 1
        ORDER BY d.fecha_creacion ASC
    `).all(req.params.pacienteId);

    res.json(diagnosticos);
});

// -----------------------------------------------------------------
// POST /api/diagnosticos/:pacienteId - registra un nuevo diagnostico
// -----------------------------------------------------------------
router.post('/:pacienteId', (req, res) => {
    const paciente = db.prepare('SELECT id FROM pacientes WHERE id = ?').get(req.params.pacienteId);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    const { descripcion, codigo_cie10, tipo, doctor_id } = req.body;
    if (!descripcion || !descripcion.trim()) return res.status(400).json({ error: 'La descripcion es obligatoria' });
    if (!codigo_cie10 || !codigo_cie10.trim()) return res.status(400).json({ error: 'El codigo CIE-10 es obligatorio' });
    const tipoFinal = tipo === 'DEF' ? 'DEF' : 'PRE';

    const totalActivos = db.prepare('SELECT COUNT(*) AS total FROM diagnosticos WHERE paciente_id = ? AND activo = 1')
        .get(req.params.pacienteId).total;
    if (totalActivos >= MAXIMO_DIAGNOSTICOS) {
        return res.status(400).json({ error: `Ya se registraron el maximo de ${MAXIMO_DIAGNOSTICOS} diagnosticos para esta ficha` });
    }

    if (doctor_id) {
        const doctor = db.prepare('SELECT id FROM doctores WHERE id = ?').get(doctor_id);
        if (!doctor) return res.status(400).json({ error: 'Doctor no encontrado' });
    }

    const ahora = new Date().toISOString();
    const resultado = db.prepare(`
        INSERT INTO diagnosticos (paciente_id, descripcion, codigo_cie10, tipo, doctor_id, fecha_pre, fecha_def, creado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        req.params.pacienteId,
        descripcion.trim(),
        codigo_cie10.trim(),
        tipoFinal,
        doctor_id || null,
        ahora,
        tipoFinal === 'DEF' ? ahora : null,
        req.session.usuario.id
    );

    res.json({ ok: true, id: resultado.lastInsertRowid });
});

// -----------------------------------------------------------------
// PUT /api/diagnosticos/:id/promover - pasa un diagnostico de PRE a DEF
// -----------------------------------------------------------------
router.put('/:id/promover', (req, res) => {
    const diagnostico = db.prepare('SELECT * FROM diagnosticos WHERE id = ? AND activo = 1').get(req.params.id);
    if (!diagnostico) return res.status(404).json({ error: 'Diagnostico no encontrado' });
    if (diagnostico.tipo === 'DEF') return res.status(400).json({ error: 'Este diagnostico ya es definitivo' });

    db.prepare('UPDATE diagnosticos SET tipo = ?, fecha_def = ? WHERE id = ?')
        .run('DEF', new Date().toISOString(), req.params.id);

    res.json({ ok: true });
});

// -----------------------------------------------------------------
// DELETE /api/diagnosticos/:id - corrige un error de registro (borrado
// logico; no es un acto clinico como la evolucion, asi que se permite)
// -----------------------------------------------------------------
router.delete('/:id', (req, res) => {
    const diagnostico = db.prepare('SELECT id FROM diagnosticos WHERE id = ? AND activo = 1').get(req.params.id);
    if (!diagnostico) return res.status(404).json({ error: 'Diagnostico no encontrado' });

    db.prepare('UPDATE diagnosticos SET activo = 0 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

module.exports = router;
