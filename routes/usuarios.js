// =====================================================================
// Rutas de gestion de usuarios (solo administrador)
// =====================================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/conexion');
const { requiereSesion, requierePermiso } = require('../middleware/auth');
const { CATALOGO_PERMISOS, PERMISOS_ASISTENCIAL_HISTORICO, esPermisoValido } = require('../utils/permisos');

const router = express.Router();

router.use(requiereSesion, requierePermiso('sistema.usuarios'));

// Valida y normaliza una lista de permisos enviada por el cliente.
// Devuelve null si algo no es valido.
function normalizarPermisos(lista) {
    if (!Array.isArray(lista)) return null;
    const unicos = [...new Set(lista.map((p) => String(p)))];
    return unicos.every(esPermisoValido) ? unicos : null;
}

function guardarPermisos(usuarioId, permisos) {
    const transaccion = db.transaction(() => {
        db.prepare('DELETE FROM permisos_usuario WHERE usuario_id = ?').run(usuarioId);
        const insertar = db.prepare('INSERT INTO permisos_usuario (usuario_id, permiso) VALUES (?, ?)');
        permisos.forEach((p) => insertar.run(usuarioId, p));
    });
    transaccion();
}

// GET /api/usuarios/catalogo-permisos - catalogo para pintar las casillas
router.get('/catalogo-permisos', (req, res) => {
    res.json({ catalogo: CATALOGO_PERMISOS, asistencial_historico: PERMISOS_ASISTENCIAL_HISTORICO });
});

// GET /api/usuarios - lista todos los usuarios (con sus permisos)
router.get('/', (req, res) => {
    const usuarios = db.prepare(`
        SELECT u.id, u.nombre, u.usuario, u.rol, u.activo, u.fecha_creacion,
               u.doctor_id, d.nombre_completo AS doctor_nombre
        FROM usuarios u
        LEFT JOIN doctores d ON d.id = u.doctor_id
        ORDER BY u.nombre
    `).all();
    const leerPermisos = db.prepare('SELECT permiso FROM permisos_usuario WHERE usuario_id = ? ORDER BY permiso');
    usuarios.forEach((u) => {
        u.permisos = u.rol === 'admin' ? [] : leerPermisos.all(u.id).map((f) => f.permiso);
    });
    res.json(usuarios);
});

// POST /api/usuarios - crear usuario nuevo (con sus permisos si es asistencial)
router.post('/', (req, res) => {
    const { nombre, usuario, password, rol, doctor_id, permisos } = req.body;

    if (!nombre || !usuario || !password || !rol) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }
    if (!['admin', 'asistencial'].includes(rol)) {
        return res.status(400).json({ error: 'Rol invalido' });
    }
    if (rol === 'admin' && req.session.usuario.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo un administrador puede crear otro administrador' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'La clave debe tener al menos 6 caracteres' });
    }

    // Si no llegan casillas (p. ej. un script antiguo), el asistencial queda
    // con lo que ese rol podia hacer historicamente; un admin no lleva filas.
    let permisosNuevos = [];
    if (rol === 'asistencial') {
        permisosNuevos = permisos === undefined ? [...PERMISOS_ASISTENCIAL_HISTORICO] : normalizarPermisos(permisos);
        if (permisosNuevos === null) {
            return res.status(400).json({ error: 'La lista de permisos no es valida' });
        }
    }

    const existente = db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(usuario);
    if (existente) {
        return res.status(400).json({ error: 'Ese nombre de usuario ya existe' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const transaccion = db.transaction(() => {
        const resultado = db.prepare(
            'INSERT INTO usuarios (nombre, usuario, password_hash, rol, activo, doctor_id) VALUES (?, ?, ?, ?, 1, ?)'
        ).run(nombre, usuario, passwordHash, rol, doctor_id || null);
        const id = resultado.lastInsertRowid;
        const insertar = db.prepare('INSERT INTO permisos_usuario (usuario_id, permiso) VALUES (?, ?)');
        permisosNuevos.forEach((p) => insertar.run(id, p));
        return id;
    });

    res.json({ ok: true, id: transaccion() });
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
    // Cambiar roles (subir a admin o bajar a un admin) queda reservado al
    // rol admin, aunque otro usuario tenga el permiso sistema.usuarios.
    if (rol && rol !== existente.rol && req.session.usuario.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo un administrador puede cambiar el rol de un usuario' });
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

// PUT /api/usuarios/:id/permisos - reemplaza los permisos de un asistencial
router.put('/:id/permisos', (req, res) => {
    const id = Number(req.params.id);
    const existente = db.prepare('SELECT id, rol FROM usuarios WHERE id = ?').get(id);
    if (!existente) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (existente.rol === 'admin') {
        return res.status(400).json({ error: 'Un administrador tiene todos los permisos; no se editan casillas' });
    }

    const permisos = normalizarPermisos((req.body || {}).permisos);
    if (permisos === null) {
        return res.status(400).json({ error: 'La lista de permisos no es valida' });
    }

    guardarPermisos(id, permisos);
    res.json({ ok: true, permisos });
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
