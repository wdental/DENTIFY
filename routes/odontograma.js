// =====================================================================
// Rutas del odontograma (Fase 3A, seccion H del F033). El odontograma es
// INMUTABLE: cada registro crea una nueva version (transaccion), nunca se
// actualiza una version ya guardada. Las versiones anteriores quedan
// disponibles solo para lectura.
// =====================================================================
const express = require('express');
const db = require('../db/conexion');
const { requiereSesion } = require('../middleware/auth');

const router = express.Router();
router.use(requiereSesion);

const SUPERFICIES_VALIDAS = ['oclusal', 'mesial', 'distal', 'vestibular', 'lingual_palatino', 'completa'];
const PATRON_TRAMO = /^tramo_a_(\d{2})$/;

function esPiezaTemporal(pieza) {
    return ['5', '6', '7', '8'].includes(String(pieza)[0]);
}

// Arcada por numero FDI: cuadrantes 1,2 (permanente) y 5,6 (temporal) = superior;
// cuadrantes 3,4 (permanente) y 7,8 (temporal) = inferior.
function arcadaDePieza(pieza) {
    const cuadrante = String(pieza)[0];
    return ['1', '2', '5', '6'].includes(cuadrante) ? 'superior' : 'inferior';
}

function validarPiezas(piezas) {
    if (!Array.isArray(piezas)) return 'Las piezas deben ser una lista';
    for (const p of piezas) {
        if (!p.pieza) return 'Cada pieza requiere un numero FDI';

        const coincideTramo = typeof p.superficie === 'string' && PATRON_TRAMO.exec(p.superficie);
        if (p.superficie && !SUPERFICIES_VALIDAS.includes(p.superficie) && !coincideTramo) {
            return `Superficie invalida: ${p.superficie}`;
        }
        if (coincideTramo && arcadaDePieza(p.pieza) !== arcadaDePieza(coincideTramo[1])) {
            return `El tramo entre la pieza ${p.pieza} y la pieza ${coincideTramo[1]} debe estar en la misma arcada`;
        }
        if (p.color_tipo && !['rojo', 'azul', 'neutro'].includes(p.color_tipo)) return `Color invalido: ${p.color_tipo}`;
        if (p.movilidad !== undefined && p.movilidad !== null && (p.movilidad < 0 || p.movilidad > 4)) return 'Movilidad debe estar entre 0 y 4';
        if (p.recesion !== undefined && p.recesion !== null && (p.recesion < 0 || p.recesion > 4)) return 'Recesion debe estar entre 0 y 4';
    }
    return null;
}

function cargarPiezas(odontogramaId) {
    return db.prepare('SELECT * FROM odontograma_piezas WHERE odontograma_id = ?').all(odontogramaId);
}

// -----------------------------------------------------------------
// GET /api/odontograma/:pacienteId/versiones - listado para el selector
// -----------------------------------------------------------------
router.get('/:pacienteId/versiones', (req, res) => {
    const versiones = db.prepare(`
        SELECT o.id, o.fecha_registro, o.es_version_activa, o.observaciones,
               d.nombre_completo AS doctor_nombre, u.nombre AS creado_por_nombre
        FROM odontogramas o
        LEFT JOIN doctores d ON d.id = o.doctor_id
        LEFT JOIN usuarios u ON u.id = o.creado_por
        WHERE o.paciente_id = ?
        ORDER BY o.fecha_registro DESC
    `).all(req.params.pacienteId);

    res.json(versiones);
});

// -----------------------------------------------------------------
// GET /api/odontograma/:pacienteId/activo - version activa + piezas
// -----------------------------------------------------------------
router.get('/:pacienteId/activo', (req, res) => {
    const odontograma = db.prepare(`
        SELECT o.*, d.nombre_completo AS doctor_nombre, u.nombre AS creado_por_nombre
        FROM odontogramas o
        LEFT JOIN doctores d ON d.id = o.doctor_id
        LEFT JOIN usuarios u ON u.id = o.creado_por
        WHERE o.paciente_id = ? AND o.es_version_activa = 1
    `).get(req.params.pacienteId);

    if (!odontograma) return res.json({ odontograma: null, piezas: [] });

    res.json({ odontograma, piezas: cargarPiezas(odontograma.id) });
});

// -----------------------------------------------------------------
// GET /api/odontograma/version/:id - version especifica, solo lectura
// -----------------------------------------------------------------
router.get('/version/:id', (req, res) => {
    const odontograma = db.prepare(`
        SELECT o.*, d.nombre_completo AS doctor_nombre, u.nombre AS creado_por_nombre
        FROM odontogramas o
        LEFT JOIN doctores d ON d.id = o.doctor_id
        LEFT JOIN usuarios u ON u.id = o.creado_por
        WHERE o.id = ?
    `).get(req.params.id);

    if (!odontograma) return res.status(404).json({ error: 'Version no encontrada' });

    res.json({ odontograma, piezas: cargarPiezas(odontograma.id) });
});

// -----------------------------------------------------------------
// GET /api/odontograma/:pacienteId/cpo-sugerido - autocalculo desde la
// version activa (caries=C/c, perdidas=P/e, obturados=O/o por pieza,
// con prioridad perdida > caries > obturado si una pieza tiene varias)
// -----------------------------------------------------------------
router.get('/:pacienteId/cpo-sugerido', (req, res) => {
    const odontograma = db.prepare(
        'SELECT id FROM odontogramas WHERE paciente_id = ? AND es_version_activa = 1'
    ).get(req.params.pacienteId);

    const sugerido = { permanente: { c: 0, p: 0, o: 0 }, temporal: { c: 0, e: 0, o: 0 } };
    if (!odontograma) return res.json(sugerido);

    const piezas = cargarPiezas(odontograma.id);
    const porPieza = {};
    piezas.forEach((fila) => {
        if (!fila.hallazgo) return;
        if (!porPieza[fila.pieza]) porPieza[fila.pieza] = new Set();
        porPieza[fila.pieza].add(fila.hallazgo);
    });

    Object.entries(porPieza).forEach(([pieza, hallazgos]) => {
        const temporal = esPiezaTemporal(pieza);
        const destino = temporal ? sugerido.temporal : sugerido.permanente;

        if (hallazgos.has('perdida_caries') || hallazgos.has('ausente')) {
            temporal ? destino.e++ : destino.p++;
        } else if (hallazgos.has('caries')) {
            destino.c++;
        } else if (hallazgos.has('obturado')) {
            destino.o++;
        }
    });

    sugerido.permanente.total = sugerido.permanente.c + sugerido.permanente.p + sugerido.permanente.o;
    sugerido.temporal.total = sugerido.temporal.c + sugerido.temporal.e + sugerido.temporal.o;

    res.json(sugerido);
});

// -----------------------------------------------------------------
// POST /api/odontograma/:pacienteId - registra una NUEVA version
// (inmutable: desactiva la version anterior, nunca la modifica)
// -----------------------------------------------------------------
router.post('/:pacienteId', (req, res) => {
    const paciente = db.prepare('SELECT id FROM pacientes WHERE id = ?').get(req.params.pacienteId);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    const { doctor_id, observaciones, piezas } = req.body;
    const errorValidacion = validarPiezas(piezas || []);
    if (errorValidacion) return res.status(400).json({ error: errorValidacion });

    if (doctor_id) {
        const doctor = db.prepare('SELECT id FROM doctores WHERE id = ?').get(doctor_id);
        if (!doctor) return res.status(400).json({ error: 'Doctor no encontrado' });
    }

    const transaccion = db.transaction(() => {
        db.prepare('UPDATE odontogramas SET es_version_activa = 0 WHERE paciente_id = ? AND es_version_activa = 1')
            .run(req.params.pacienteId);

        const resultado = db.prepare(`
            INSERT INTO odontogramas (paciente_id, doctor_id, observaciones, creado_por, es_version_activa)
            VALUES (?, ?, ?, ?, 1)
        `).run(req.params.pacienteId, doctor_id || null, observaciones || null, req.session.usuario.id);

        const odontogramaId = resultado.lastInsertRowid;

        const insertarPieza = db.prepare(`
            INSERT INTO odontograma_piezas (odontograma_id, pieza, superficie, hallazgo, color_tipo, movilidad, recesion, fuera_simbologia_f033)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const p of (piezas || [])) {
            insertarPieza.run(
                odontogramaId,
                String(p.pieza),
                p.superficie || 'completa',
                p.hallazgo || null,
                p.color_tipo || null,
                p.movilidad === undefined ? null : p.movilidad,
                p.recesion === undefined ? null : p.recesion,
                p.fuera_simbologia_f033 ? 1 : 0
            );
        }

        return odontogramaId;
    });

    const odontogramaId = transaccion();
    res.json({ ok: true, id: odontogramaId });
});

module.exports = router;
