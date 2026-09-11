// =====================================================================
// Rutas de autenticacion: login, logout, usuario actual
// =====================================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/conexion');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
        return res.status(400).json({ error: 'Usuario y clave son obligatorios' });
    }

    const fila = db.prepare('SELECT * FROM usuarios WHERE usuario = ? AND activo = 1').get(usuario);

    if (!fila || !bcrypt.compareSync(password, fila.password_hash)) {
        return res.status(401).json({ error: 'Usuario o clave incorrectos' });
    }

    req.session.usuario = {
        id: fila.id,
        nombre: fila.nombre,
        usuario: fila.usuario,
        rol: fila.rol,
        doctor_id: fila.doctor_id || null
    };

    res.json({ ok: true, usuario: req.session.usuario });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ ok: true });
    });
});

// GET /api/auth/yo - devuelve el usuario en sesion (o null)
router.get('/yo', (req, res) => {
    res.json({ usuario: req.session.usuario || null });
});

module.exports = router;
