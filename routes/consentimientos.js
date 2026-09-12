// =====================================================================
// Consentimientos informados con firma capturada en pantalla (Fase 3C).
// Un consentimiento FIRMADO es inmutable: el contenido se resuelve y se
// congela en el servidor al momento de la firma (contenido_final), nunca
// se recibe como texto libre del cliente - solo {procedimiento_detalle}
// y {piezas} son editables por el usuario, el resto sale de la base de
// datos (paciente, doctor) para que el documento firmado sea confiable.
// =====================================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db/conexion');
const { requiereSesion, requiereAdmin } = require('../middleware/auth');
const { ahoraLocal, hoyLocal } = require('../utils/fechaLocal');
const { resolverMarcadores, construirClausulaRepresentante, BLOQUES_DECISION, textoRevocacion, calcularEdad } = require('../utils/plantillas');

const router = express.Router();
router.use(requiereSesion);

const CARPETA_UPLOADS = path.join(__dirname, '..', 'uploads', 'pacientes');

function carpetaFirmas(pacienteId) {
    const carpeta = path.join(CARPETA_UPLOADS, String(pacienteId), 'firmas');
    fs.mkdirSync(carpeta, { recursive: true });
    return carpeta;
}

// Decodifica un data URL "data:image/png;base64,...." y lo guarda como PNG.
// Devuelve la ruta RELATIVA (para guardar en la BD), nunca la absoluta.
function guardarFirmaPng(pacienteId, nombreArchivo, dataUrl) {
    const base64 = String(dataUrl).replace(/^data:image\/png;base64,/, '');
    const carpeta = carpetaFirmas(pacienteId);
    fs.writeFileSync(path.join(carpeta, nombreArchivo), Buffer.from(base64, 'base64'));
    return path.join(String(pacienteId), 'firmas', nombreArchivo).split(path.sep).join('/');
}

function sha256(texto) {
    return crypto.createHash('sha256').update(texto, 'utf8').digest('hex');
}

function formatearFechaLarga(iso) {
    return new Date(iso).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });
}

const SELECT_BASE = `
    SELECT c.*, p.nombre AS plantilla_nombre, p.procedimiento_asociado,
           doc.nombre_completo AS doctor_nombre, doc.registro_profesional AS doctor_registro_prof,
           u.nombre AS creado_por_nombre, ua.nombre AS anulado_por_nombre
    FROM consentimientos c
    LEFT JOIN plantillas_documento p ON p.id = c.plantilla_id
    LEFT JOIN doctores doc ON doc.id = c.doctor_id
    LEFT JOIN usuarios u ON u.id = c.creado_por
    LEFT JOIN usuarios ua ON ua.id = c.anulado_por
`;

// -----------------------------------------------------------------
// GET /api/consentimientos/:pacienteId - historial completo
// -----------------------------------------------------------------
router.get('/:pacienteId', (req, res) => {
    const filas = db.prepare(`${SELECT_BASE} WHERE c.paciente_id = ? ORDER BY c.id DESC`).all(req.params.pacienteId);
    res.json(filas);
});

// -----------------------------------------------------------------
// GET /api/consentimientos/:pacienteId/:id - uno (ver / imprimir), con su
// consentimiento de origen o su revocacion vinculada si existen
// -----------------------------------------------------------------
router.get('/:pacienteId/:id', (req, res) => {
    const fila = db.prepare(`${SELECT_BASE} WHERE c.paciente_id = ? AND c.id = ?`).get(req.params.pacienteId, req.params.id);
    if (!fila) return res.status(404).json({ error: 'Consentimiento no encontrado' });

    if (fila.consentimiento_origen_id) {
        fila.origen = db.prepare(`${SELECT_BASE} WHERE c.id = ?`).get(fila.consentimiento_origen_id);
    }
    const revocacion = db.prepare(`${SELECT_BASE} WHERE c.consentimiento_origen_id = ?`).get(fila.id);
    if (revocacion) fila.revocacion = revocacion;

    res.json(fila);
});

// -----------------------------------------------------------------
// GET /api/consentimientos/:pacienteId/:id/firma/:quien - sirve la imagen
// PNG de la firma (quien = 'paciente' | 'doctor'), con la misma sesion
// autenticada que el resto de la app (nunca estatico/publico).
// -----------------------------------------------------------------
router.get('/:pacienteId/:id/firma/:quien', (req, res) => {
    const columna = req.params.quien === 'doctor' ? 'firma_doctor_path' : 'firma_paciente_path';
    const fila = db.prepare(`SELECT ${columna} AS ruta FROM consentimientos WHERE id = ? AND paciente_id = ?`)
        .get(req.params.id, req.params.pacienteId);
    if (!fila || !fila.ruta) return res.status(404).end();
    res.sendFile(path.join(CARPETA_UPLOADS, fila.ruta));
});

// -----------------------------------------------------------------
// POST /api/consentimientos/:pacienteId - genera y firma un consentimiento
// nuevo (decision: 'aceptado' | 'rechazado')
// -----------------------------------------------------------------
router.post('/:pacienteId', (req, res) => {
    const pacienteId = Number(req.params.pacienteId);
    const paciente = db.prepare('SELECT * FROM pacientes WHERE id = ?').get(pacienteId);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    const {
        plantilla_id, decision, procedimiento_detalle, piezas,
        doctor_id, firma_paciente, firma_doctor,
        representante_nombre, representante_cedula
    } = req.body;

    const plantilla = db.prepare('SELECT * FROM plantillas_documento WHERE id = ? AND activo = 1').get(plantilla_id);
    if (!plantilla) return res.status(400).json({ error: 'Plantilla no encontrada o inactiva' });

    if (!['aceptado', 'rechazado'].includes(decision)) {
        return res.status(400).json({ error: 'Decision invalida' });
    }
    if (!firma_paciente) {
        return res.status(400).json({ error: 'Se requiere la firma del paciente' });
    }
    if (!paciente.fecha_nacimiento) {
        return res.status(400).json({ error: 'El paciente no tiene fecha de nacimiento registrada; regístrela antes de generar el consentimiento' });
    }

    const edad = calcularEdad(paciente.fecha_nacimiento);
    const esMenor = edad !== null && edad < 18;

    if (esMenor) {
        if (!representante_nombre || !representante_nombre.trim()) {
            return res.status(400).json({ error: 'El paciente es menor de edad: se requiere el nombre del representante legal' });
        }
        if (!representante_cedula || !/^\d{10}$/.test(representante_cedula)) {
            return res.status(400).json({ error: 'La cédula del representante legal debe tener 10 dígitos' });
        }
    }

    let doctor = null;
    if (doctor_id) {
        doctor = db.prepare('SELECT * FROM doctores WHERE id = ?').get(doctor_id);
        if (!doctor) return res.status(400).json({ error: 'Doctor no encontrado' });
    }

    const nombrePaciente = `${paciente.nombres} ${paciente.apellidos}`;
    const firmanteEsRepresentante = esMenor;
    const firmanteNombre = firmanteEsRepresentante ? representante_nombre.trim() : nombrePaciente;
    const firmanteCedula = firmanteEsRepresentante ? representante_cedula.trim() : (paciente.cedula || '');

    const datos = {
        paciente_nombre: nombrePaciente,
        paciente_cedula: paciente.cedula || 'Sin registrar',
        paciente_edad: edad,
        representante_nombre: firmanteEsRepresentante ? representante_nombre.trim() : '',
        representante_cedula: firmanteEsRepresentante ? representante_cedula.trim() : '',
        representante_clausula: construirClausulaRepresentante(esMenor, representante_nombre, representante_cedula),
        doctor_nombre: doctor ? doctor.nombre_completo : 'Sin especificar',
        doctor_registro: doctor && doctor.registro_profesional ? doctor.registro_profesional : 'Sin especificar',
        fecha: formatearFechaLarga(hoyLocal()),
        piezas: (piezas || '').trim() || 'No aplica',
        procedimiento_detalle: (procedimiento_detalle || '').trim() || 'Sin observaciones adicionales.'
    };

    const contenidoFinal = resolverMarcadores(plantilla.contenido, datos) + BLOQUES_DECISION[decision];
    const hash = sha256(contenidoFinal);

    const transaccion = db.transaction(() => {
        const resultado = db.prepare(`
            INSERT INTO consentimientos (
                paciente_id, plantilla_id, contenido_final, decision, estado,
                firma_paciente_path, firma_doctor_path, firmante_nombre, firmante_cedula,
                es_representante, doctor_id, hash_documento, creado_por
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            pacienteId, plantilla.id, contenidoFinal, decision, decision,
            'PENDIENTE', firma_doctor ? 'PENDIENTE' : null, firmanteNombre, firmanteCedula || null,
            firmanteEsRepresentante ? 1 : 0, doctor_id || null, hash, req.session.usuario.id
        );
        const id = resultado.lastInsertRowid;

        const rutaFirmaPaciente = guardarFirmaPng(pacienteId, `consentimiento_${id}_paciente.png`, firma_paciente);
        const rutaFirmaDoctor = firma_doctor ? guardarFirmaPng(pacienteId, `consentimiento_${id}_doctor.png`, firma_doctor) : null;

        db.prepare('UPDATE consentimientos SET firma_paciente_path = ?, firma_doctor_path = ? WHERE id = ?')
            .run(rutaFirmaPaciente, rutaFirmaDoctor, id);

        return id;
    });

    const id = transaccion();
    res.json({ ok: true, id });
});

// -----------------------------------------------------------------
// POST /api/consentimientos/:pacienteId/:id/revocar - registra la
// revocacion como un consentimiento NUEVO vinculado al original (que
// permanece intacto), y marca el original como 'revocado'.
// -----------------------------------------------------------------
router.post('/:pacienteId/:id/revocar', (req, res) => {
    const pacienteId = Number(req.params.pacienteId);
    const origen = db.prepare(`${SELECT_BASE} WHERE c.paciente_id = ? AND c.id = ?`).get(pacienteId, req.params.id);
    if (!origen) return res.status(404).json({ error: 'Consentimiento no encontrado' });
    if (origen.estado !== 'aceptado') {
        return res.status(400).json({ error: 'Solo se puede revocar un consentimiento en estado "aceptado"' });
    }

    const { firma_paciente } = req.body;
    if (!firma_paciente) return res.status(400).json({ error: 'Se requiere la firma del paciente para revocar' });

    const contenidoFinal = textoRevocacion(origen.plantilla_nombre || 'este procedimiento', formatearFechaLarga(origen.fecha_firma));
    const hash = sha256(contenidoFinal);

    const transaccion = db.transaction(() => {
        const resultado = db.prepare(`
            INSERT INTO consentimientos (
                paciente_id, plantilla_id, contenido_final, decision, estado,
                firma_paciente_path, firmante_nombre, firmante_cedula, es_representante,
                doctor_id, hash_documento, consentimiento_origen_id, creado_por
            ) VALUES (?, ?, ?, 'revocacion', 'revocado', ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            pacienteId, origen.plantilla_id, contenidoFinal,
            'PENDIENTE', origen.firmante_nombre, origen.firmante_cedula,
            origen.es_representante, origen.doctor_id, hash, origen.id, req.session.usuario.id
        );
        const id = resultado.lastInsertRowid;

        const rutaFirma = guardarFirmaPng(pacienteId, `consentimiento_${id}_paciente.png`, firma_paciente);
        db.prepare('UPDATE consentimientos SET firma_paciente_path = ? WHERE id = ?').run(rutaFirma, id);
        db.prepare("UPDATE consentimientos SET estado = 'revocado' WHERE id = ?").run(origen.id);

        return id;
    });

    const id = transaccion();
    res.json({ ok: true, id });
});

// -----------------------------------------------------------------
// PUT /api/consentimientos/:id/anular - solo admin. Borrado logico: el
// consentimiento sigue existiendo y visible, marcado como anulado.
// -----------------------------------------------------------------
router.put('/:id/anular', requiereAdmin, (req, res) => {
    const consentimiento = db.prepare('SELECT id, estado FROM consentimientos WHERE id = ?').get(req.params.id);
    if (!consentimiento) return res.status(404).json({ error: 'Consentimiento no encontrado' });
    if (consentimiento.estado === 'anulado') return res.status(400).json({ error: 'Este consentimiento ya está anulado' });

    const { motivo } = req.body;
    if (!motivo || !motivo.trim()) return res.status(400).json({ error: 'Debe indicar el motivo de la anulación' });

    db.prepare("UPDATE consentimientos SET estado = 'anulado', motivo_anulacion = ?, anulado_por = ?, anulado_en = ? WHERE id = ?")
        .run(motivo.trim(), req.session.usuario.id, ahoraLocal(), req.params.id);

    res.json({ ok: true });
});

module.exports = router;
