// =====================================================================
// Rutas de pacientes: CRUD, busqueda, documentos adjuntos
// =====================================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db/conexion');
const { requiereSesion, requierePermiso, usuarioTienePermiso } = require('../middleware/auth');
const { generarNumeroHistoria } = require('../utils/numeroHistoria');

const router = express.Router();
router.use(requiereSesion);

const CARPETA_UPLOADS = path.join(__dirname, '..', 'uploads', 'pacientes');

// Configuracion de multer: guarda en /uploads/pacientes/{id}/
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const carpetaPaciente = path.join(CARPETA_UPLOADS, String(req.params.id));
        fs.mkdirSync(carpetaPaciente, { recursive: true });
        cb(null, carpetaPaciente);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const nombreSeguro = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${timestamp}-${nombreSeguro}`);
    }
});

const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    fileFilter: (req, file, cb) => {
        if (TIPOS_PERMITIDOS.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de archivo no permitido. Solo PDF e imagenes.'));
        }
    }
});

function calcularEdad(fechaNacimiento) {
    if (!fechaNacimiento) return null;
    const hoy = new Date();
    const nacimiento = new Date(fechaNacimiento);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const mes = hoy.getMonth() - nacimiento.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
        edad--;
    }
    return edad;
}

function validarCedula(cedula) {
    if (!cedula) return true; // opcional
    return /^\d{10}$/.test(cedula);
}

// -----------------------------------------------------------------
// GET /api/pacientes - listado con busqueda y filtro
// -----------------------------------------------------------------
router.get('/', requierePermiso('pacientes.ver'), (req, res) => {
    const { q, origen } = req.query;
    const incluirInactivos = req.query.incluirInactivos === '1' && usuarioTienePermiso(req.session.usuario, 'pacientes.eliminar');

    let sql = 'SELECT * FROM pacientes WHERE 1=1';
    const parametros = [];

    if (!incluirInactivos) {
        sql += ' AND activo = 1';
    }

    if (q) {
        sql += ' AND (nombres LIKE ? OR apellidos LIKE ? OR cedula LIKE ? OR numero_historia LIKE ?)';
        const buscar = `%${q}%`;
        parametros.push(buscar, buscar, buscar, buscar);
    }

    if (origen) {
        sql += ' AND origen = ?';
        parametros.push(origen);
    }

    sql += ' ORDER BY apellidos, nombres';

    const pacientes = db.prepare(sql).all(...parametros).map((p) => ({
        ...p,
        edad: calcularEdad(p.fecha_nacimiento)
    }));

    res.json(pacientes);
});

// -----------------------------------------------------------------
// GET /api/pacientes/:id - ficha completa de un paciente
// -----------------------------------------------------------------
router.get('/:id', requierePermiso('pacientes.ver'), (req, res) => {
    const paciente = db.prepare('SELECT * FROM pacientes WHERE id = ?').get(req.params.id);
    if (!paciente) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
    }
    paciente.edad = calcularEdad(paciente.fecha_nacimiento);
    res.json(paciente);
});

// -----------------------------------------------------------------
// POST /api/pacientes - crear paciente nuevo
// -----------------------------------------------------------------
router.post('/', requierePermiso('pacientes.gestionar'), (req, res) => {
    const datos = req.body;

    if (!datos.nombres || !datos.apellidos) {
        return res.status(400).json({ error: 'Nombres y apellidos son obligatorios' });
    }
    if (!validarCedula(datos.cedula)) {
        return res.status(400).json({ error: 'La cedula debe tener 10 digitos' });
    }
    if (datos.cedula) {
        const existente = db.prepare('SELECT id FROM pacientes WHERE cedula = ?').get(datos.cedula);
        if (existente) {
            return res.status(400).json({ error: 'Ya existe un paciente registrado con esa cedula' });
        }
    }

    const numeroHistoria = generarNumeroHistoria();

    const resultado = db.prepare(`
        INSERT INTO pacientes (
            numero_historia, nombres, apellidos, cedula, fecha_nacimiento, sexo,
            telefono, whatsapp, email, direccion, origen,
            alergias, antecedentes_medicos, antecedentes_odontologicos, medicamentos_actuales,
            notas, activo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
        numeroHistoria,
        datos.nombres,
        datos.apellidos,
        datos.cedula || null,
        datos.fecha_nacimiento || null,
        datos.sexo || null,
        datos.telefono || null,
        datos.whatsapp || null,
        datos.email || null,
        datos.direccion || null,
        datos.origen || null,
        datos.alergias || null,
        datos.antecedentes_medicos || null,
        datos.antecedentes_odontologicos || null,
        datos.medicamentos_actuales || null,
        datos.notas || null
    );

    res.json({ ok: true, id: resultado.lastInsertRowid, numero_historia: numeroHistoria });
});

// -----------------------------------------------------------------
// PUT /api/pacientes/:id - editar paciente
// -----------------------------------------------------------------
router.put('/:id', requierePermiso('pacientes.gestionar'), (req, res) => {
    const id = Number(req.params.id);
    const datos = req.body;

    const existente = db.prepare('SELECT * FROM pacientes WHERE id = ?').get(id);
    if (!existente) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
    }
    if (!datos.nombres || !datos.apellidos) {
        return res.status(400).json({ error: 'Nombres y apellidos son obligatorios' });
    }
    if (!validarCedula(datos.cedula)) {
        return res.status(400).json({ error: 'La cedula debe tener 10 digitos' });
    }
    if (datos.cedula) {
        const duplicado = db.prepare('SELECT id FROM pacientes WHERE cedula = ? AND id != ?').get(datos.cedula, id);
        if (duplicado) {
            return res.status(400).json({ error: 'Ya existe otro paciente registrado con esa cedula' });
        }
    }

    db.prepare(`
        UPDATE pacientes SET
            nombres = ?, apellidos = ?, cedula = ?, fecha_nacimiento = ?, sexo = ?,
            telefono = ?, whatsapp = ?, email = ?, direccion = ?, origen = ?,
            alergias = ?, antecedentes_medicos = ?, antecedentes_odontologicos = ?, medicamentos_actuales = ?,
            notas = ?
        WHERE id = ?
    `).run(
        datos.nombres,
        datos.apellidos,
        datos.cedula || null,
        datos.fecha_nacimiento || null,
        datos.sexo || null,
        datos.telefono || null,
        datos.whatsapp || null,
        datos.email || null,
        datos.direccion || null,
        datos.origen || null,
        datos.alergias || null,
        datos.antecedentes_medicos || null,
        datos.antecedentes_odontologicos || null,
        datos.medicamentos_actuales || null,
        datos.notas || null,
        id
    );

    res.json({ ok: true });
});

// -----------------------------------------------------------------
// DELETE /api/pacientes/:id - eliminacion logica (solo admin)
// -----------------------------------------------------------------
router.delete('/:id', requierePermiso('pacientes.eliminar'), (req, res) => {
    const id = Number(req.params.id);
    const existente = db.prepare('SELECT id FROM pacientes WHERE id = ?').get(id);
    if (!existente) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
    }
    db.prepare('UPDATE pacientes SET activo = 0 WHERE id = ?').run(id);
    res.json({ ok: true });
});

// -----------------------------------------------------------------
// PUT /api/pacientes/:id/restaurar - revierte la eliminacion logica (solo admin)
// -----------------------------------------------------------------
router.put('/:id/restaurar', requierePermiso('pacientes.eliminar'), (req, res) => {
    const id = Number(req.params.id);
    const existente = db.prepare('SELECT id FROM pacientes WHERE id = ?').get(id);
    if (!existente) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
    }
    db.prepare('UPDATE pacientes SET activo = 1 WHERE id = ?').run(id);
    res.json({ ok: true });
});

// -----------------------------------------------------------------
// DOCUMENTOS DEL PACIENTE
// -----------------------------------------------------------------

// GET /api/pacientes/:id/documentos
router.get('/:id/documentos', requierePermiso('pacientes.ver'), (req, res) => {
    const documentos = db.prepare(
        'SELECT * FROM documentos_pacientes WHERE paciente_id = ? ORDER BY fecha_subida DESC'
    ).all(req.params.id);
    res.json(documentos);
});

// POST /api/pacientes/:id/documentos - subir archivo
router.post('/:id/documentos', requierePermiso('pacientes.gestionar'), upload.single('archivo'), (req, res) => {
    const pacienteId = Number(req.params.id);
    const paciente = db.prepare('SELECT id FROM pacientes WHERE id = ?').get(pacienteId);
    if (!paciente) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
    }
    if (!req.file) {
        return res.status(400).json({ error: 'No se recibio ningun archivo' });
    }

    const resultado = db.prepare(`
        INSERT INTO documentos_pacientes (paciente_id, nombre_original, nombre_archivo, tipo, tamano, subido_por)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        pacienteId,
        req.file.originalname,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        req.session.usuario.id
    );

    res.json({ ok: true, id: resultado.lastInsertRowid });
});

// GET /api/pacientes/:id/documentos/:docId/descargar
router.get('/:id/documentos/:docId/descargar', requierePermiso('pacientes.ver'), (req, res) => {
    const doc = db.prepare(
        'SELECT * FROM documentos_pacientes WHERE id = ? AND paciente_id = ?'
    ).get(req.params.docId, req.params.id);

    if (!doc) {
        return res.status(404).json({ error: 'Documento no encontrado' });
    }

    const rutaArchivo = path.join(CARPETA_UPLOADS, String(req.params.id), doc.nombre_archivo);
    if (!fs.existsSync(rutaArchivo)) {
        return res.status(404).json({ error: 'El archivo ya no existe en el servidor' });
    }

    res.download(rutaArchivo, doc.nombre_original);
});

// DELETE /api/pacientes/:id/documentos/:docId
router.delete('/:id/documentos/:docId', requierePermiso('pacientes.gestionar'), (req, res) => {
    const doc = db.prepare(
        'SELECT * FROM documentos_pacientes WHERE id = ? AND paciente_id = ?'
    ).get(req.params.docId, req.params.id);

    if (!doc) {
        return res.status(404).json({ error: 'Documento no encontrado' });
    }

    const rutaArchivo = path.join(CARPETA_UPLOADS, String(req.params.id), doc.nombre_archivo);
    if (fs.existsSync(rutaArchivo)) {
        fs.unlinkSync(rutaArchivo);
    }

    db.prepare('DELETE FROM documentos_pacientes WHERE id = ?').run(req.params.docId);
    res.json({ ok: true });
});

module.exports = router;
