// =====================================================================
// Rutas de gestion de usuarios (solo administrador)
// =====================================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/conexion');
const { requiereSesion, requiereAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requiereSesion, requiereAdmin);

// GET /api/usuarios - lista todos los usuarios
router.get('/', (req, res) => {
    const usuarios = db.prepare(`
        SELECT u.id, u.nombre, u.usuario, u.rol, u.activo, u.fecha_creacion,
               u.doctor_id, d.nombre_completo AS doctor_nombre
        FROM usuarios u
        LEFT JOIN doctores d ON d.id = u.doctor_id
        ORDER BY u.nombre
    `).all();
    res.json(usuarios);
});

// POST /api/usuarios - crear usuario nuevo
router.post('/', (req, res) => {
    const { nombre, usuario, password, rol, doctor_id } = req.body;

    if (!nombre || !usuario || !password || !rol) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }
    if (!['admin', 'asistencial'].includes(rol)) {
        return res.status(400).json({ error: 'Rol invalido' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'La clave debe tener al menos 6 caracteres' });
    }

    const existente = db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(usuario);
    if (existente) {
        return res.status(400).json({ error: 'Ese nombre de usuario ya existe' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const resultado = db.prepare(
        'INSERT INTO usuarios (nombre, usuario, password_hash, rol, activo, doctor_id) VALUES (?, ?, ?, ?, 1, ?)'
    ).run(nombre, usuario, passwordHash, rol, doctor_id || null);

    res.json({ ok: true, id: resultado.lastInsertRowid });
});

// PUT /api/usuarios/:id - editar datos, rol, estado activo o doctor vinculado
router.put('/:id', (req, res) => {
    const { nombre, rol, activo, doctor_id } = req.body;
    const id = Number(req.params.id);

    const existente = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    if (!existente) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (rol && !['admin', 'asistencial'].includes(rol)) {
        return res.status(400).json({ error: 'Rol invalido' });
    }

    db.prepare('UPDATE usuarios SET nombre = ?, rol = ?, activo = ?, doctor_id = ? WHERE id = ?').run(
        nombre ?? existente.nombre,
        rol ?? existente.rol,
        activo !== undefined ? (activo ? 1 : 0) : existente.activo,
        doctor_id !== undefined ? (doctor_id || null) : existente.doctor_id,
        id
    );

    res.json({ ok: true });
});

// PUT /api/usuarios/:id/password - cambiar clave
router.put('/:id/password', (req, res) => {
    const { password } = req.body;
    const id = Number(req.params.id);

    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'La clave debe tener al menos 6 caracteres' });
    }

    const existente = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(id);
    if (!existente) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(passwordHash, id);

    res.json({ ok: true });
});

module.exports = router;
