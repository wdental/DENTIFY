// =====================================================================
// Middlewares de autenticacion y autorizacion por rol
// =====================================================================

function requiereSesion(req, res, next) {
    if (req.session && req.session.usuario) {
        return next();
    }
    return res.status(401).json({ error: 'Debe iniciar sesion para continuar' });
}

function requiereAdmin(req, res, next) {
    if (req.session && req.session.usuario && req.session.usuario.rol === 'admin') {
        return next();
    }
    return res.status(403).json({ error: 'Esta accion requiere permisos de administrador' });
}

// Protege paginas HTML: si no hay sesion, redirige al login
function protegerPagina(req, res, next) {
    if (req.session && req.session.usuario) {
        return next();
    }
    return res.redirect('/login.html');
}

module.exports = { requiereSesion, requiereAdmin, protegerPagina };
