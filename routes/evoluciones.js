// =====================================================================
// Evoluciones por sesion (Fase 3B, seccion P del F033). Registro legal:
// INMUTABLE una vez guardada (no se edita ni se borra). Un error se
// corrige con una nueva evolucion aclaratoria. Solo admin puede anular una
// (borrado logico: queda visible tachada con motivo).
// =====================================================================
const express = require('express');
const db = require('../db/conexion');
const { requiereSesion, requiereAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requiereSesion);

function cargarEvoluciones(pacienteId, limite) {
    const sql = `
        SELECT e.*, doc.nombre_completo AS doctor_nombre,
               u.nombre AS creado_por_nombre, ua.nombre AS anulado_por_nombre,
               c.fecha AS cita_fecha, c.hora_inicio AS cita_hora_inicio,
               fp.firma_data AS firma_paciente, fd.firma_data AS firma_doctor
        FROM evoluciones e
        LEFT JOIN doctores doc ON doc.id = e.doctor_id
        LEFT JOIN usuarios u ON u.id = e.creado_por
        LEFT JOIN usuarios ua ON ua.id = e.anulado_por
        LEFT JOIN citas c ON c.id = e.cita_id
        LEFT JOIN firmas fp ON fp.documento_tipo = 'evolucion_paciente' AND fp.documento_id = e.id
        LEFT JOIN firmas fd ON fd.documento_tipo = 'evolucion_doctor' AND fd.documento_id = e.id
        WHERE e.paciente_id = ?
        ORDER BY e.numero_sesion DESC
        ${limite ? 'LIMIT ?' : ''}
    `;
    return limite ? db.prepare(sql).all(pacienteId, limite) : db.prepare(sql).all(pacienteId);
}

function parsearFilaEvolucion(fila) {
    let piezas = [];
    try { piezas = fila.piezas_tratadas_json ? JSON.parse(fila.piezas_tratadas_json) : []; } catch (e) { piezas = []; }
    return { ...fila, piezas_tratadas: piezas };
}

// -----------------------------------------------------------------
// GET /api/evoluciones/:pacienteId - historial completo, orden cronologico
// inverso (mas reciente primero). ?limite=N para el panel compacto.
// -----------------------------------------------------------------
router.get('/:pacienteId', (req, res) => {
    const limite = req.query.limite ? Number(req.query.limite) : null;
    const filas = cargarEvoluciones(req.params.pacienteId, limite);
    res.json(filas.map(parsearFilaEvolucion));
});

// -----------------------------------------------------------------
// GET /api/evoluciones/:pacienteId/cita-del-dia?fecha=YYYY-MM-DD - busca
// una cita atendida de ese paciente en esa fecha, para ofrecer vincularla.
// -----------------------------------------------------------------
router.get('/:pacienteId/cita-del-dia', (req, res) => {
    const fecha = req.query.fecha;
    if (!fecha) return res.json(null);

    const cita = db.prepare(`
        SELECT id, fecha, hora_inicio, doctor_id, doctor_nombre, motivo
        FROM citas
        WHERE paciente_id = ? AND fecha = ? AND estado = 'atendida'
        ORDER BY hora_inicio ASC
        LIMIT 1
    `).get(req.params.pacienteId, fecha);

    res.json(cita || null);
});

// -----------------------------------------------------------------
// POST /api/evoluciones/:pacienteId - registra una nueva sesion (INMUTABLE)
// -----------------------------------------------------------------
router.post('/:pacienteId', (req, res) => {
    const paciente = db.prepare('SELECT id FROM pacientes WHERE id = ?').get(req.params.pacienteId);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    const {
        fecha, doctor_id, diagnosticos_complicaciones, procedimientos,
        prescripciones, piezas_tratadas, es_alta, cita_id,
        firma_paciente, firma_doctor
    } = req.body;

    if (!procedimientos || !procedimientos.trim()) {
        return res.status(400).json({ error: 'Los procedimientos realizados son obligatorios' });
    }

    // Registro legal e inmutable: exige ambas firmas al momento de crear la
    // evolucion (no hay ruta de edicion posterior donde agregarlas despues).
    if (!firma_paciente || !firma_doctor) {
        return res.status(400).json({ error: 'Se requiere la firma del paciente y del doctor para registrar la evolución' });
    }

    if (doctor_id) {
        const doctor = db.prepare('SELECT id FROM doctores WHERE id = ?').get(doctor_id);
        if (!doctor) return res.status(400).json({ error: 'Doctor no encontrado' });
    }

    if (cita_id) {
        const cita = db.prepare('SELECT id FROM citas WHERE id = ? AND paciente_id = ?').get(cita_id, req.params.pacienteId);
        if (!cita) return res.status(400).json({ error: 'La cita indicada no pertenece a este paciente' });
    }

    const transaccion = db.transaction(() => {
        const filaMax = db.prepare('SELECT MAX(numero_sesion) AS maximo FROM evoluciones WHERE paciente_id = ?').get(req.params.pacienteId);
        const numeroSesion = (filaMax.maximo || 0) + 1;

        const resultado = db.prepare(`
            INSERT INTO evoluciones (
                paciente_id, numero_sesion, fecha, doctor_id, diagnosticos_complicaciones,
                procedimientos, prescripciones, piezas_tratadas_json, es_alta, cita_id, creado_por
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            req.params.pacienteId,
            numeroSesion,
            fecha || new Date().toISOString(),
            doctor_id || null,
            (diagnosticos_complicaciones || '').trim() || null,
            procedimientos.trim(),
            (prescripciones || '').trim() || null,
            JSON.stringify(Array.isArray(piezas_tratadas) ? piezas_tratadas : []),
            es_alta ? 1 : 0,
            cita_id || null,
            req.session.usuario.id
        );

        const evolucionId = resultado.lastInsertRowid;
        const insertarFirma = db.prepare('INSERT INTO firmas (paciente_id, documento_tipo, documento_id, firma_data) VALUES (?, ?, ?, ?)');
        insertarFirma.run(req.params.pacienteId, 'evolucion_paciente', evolucionId, firma_paciente);
        insertarFirma.run(req.params.pacienteId, 'evolucion_doctor', evolucionId, firma_doctor);

        return evolucionId;
    });

    const id = transaccion();
    res.json({ ok: true, id });
});

// -----------------------------------------------------------------
// PUT /api/evoluciones/:id/anular - solo admin. Borrado logico: la
// evolucion sigue existiendo y visible, marcada como anulada con motivo.
// -----------------------------------------------------------------
router.put('/:id/anular', requiereAdmin, (req, res) => {
    const evolucion = db.prepare('SELECT id, anulada FROM evoluciones WHERE id = ?').get(req.params.id);
    if (!evolucion) return res.status(404).json({ error: 'Evolucion no encontrada' });
    if (evolucion.anulada) return res.status(400).json({ error: 'Esta evolucion ya esta anulada' });

    const { motivo } = req.body;
    if (!motivo || !motivo.trim()) return res.status(400).json({ error: 'Debe indicar el motivo de la anulacion' });

    db.prepare('UPDATE evoluciones SET anulada = 1, motivo_anulacion = ?, anulado_por = ?, anulado_en = ? WHERE id = ?')
        .run(motivo.trim(), req.session.usuario.id, new Date().toISOString(), req.params.id);

    res.json({ ok: true });
});

module.exports = router;
