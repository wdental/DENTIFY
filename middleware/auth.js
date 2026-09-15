// =====================================================================
// Middlewares de autenticacion y autorizacion
//
// La autorizacion fina va por PERMISOS por usuario (tabla
// permisos_usuario + catalogo en utils/permisos.js). El rol "admin"
// implica todos los permisos. Los permisos se leen de la base en cada
// verificacion (consulta trivial en SQLite): asi un cambio de permisos
// aplica de inmediato, sin esperar a que el usuario cierre sesion.
// =====================================================================
const db = require('../db/conexion');
const { TODOS_LOS_PERMISOS } = require('../utils/permisos');

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

// Permisos vigentes de un usuario (por id + rol). Admin: todos.
function permisosDeUsuario(usuario) {
    if (!usuario) return [];
    if (usuario.rol === 'admin') return [...TODOS_LOS_PERMISOS];
    return db.prepare('SELECT permiso FROM permisos_usuario WHERE usuario_id = ? ORDER BY permiso')
        .all(usuario.id).map((f) => f.permiso);
}

function usuarioTienePermiso(usuario, ...permisos) {
    if (!usuario) return false;
    if (usuario.rol === 'admin') return true;
    const propios = permisosDeUsuario(usuario);
    return permisos.some((p) => propios.includes(p));
}

// requierePermiso('caja.ver') — o varios: pasa si el usuario tiene AL
// MENOS UNO de los permisos indicados (ademas de sesion activa).
function requierePermiso(...permisos) {
    return function (req, res, next) {
        const usuario = req.session && req.session.usuario;
        if (!usuario) {
            return res.status(401).json({ error: 'Debe iniciar sesion para continuar' });
        }
        if (usuarioTienePermiso(usuario, ...permisos)) {
            return next();
        }
        return res.status(403).json({ error: 'Su usuario no tiene permiso para esta accion' });
    };
}

// Protege paginas HTML: si no hay sesion, redirige al login
function protegerPagina(req, res, next) {
    if (req.session && req.session.usuario) {
        return next();
    }
    return res.redirect('/login.html');
}

// Protege una pagina HTML que ademas exige un permiso: sin sesion va al
// login; con sesion pero sin permiso, al panel principal.
function protegerPaginaConPermiso(...permisos) {
    return function (req, res, next) {
        const usuario = req.session && req.session.usuario;
        if (!usuario) {
            return res.redirect('/login.html');
        }
        if (permisos.length === 0 || usuarioTienePermiso(usuario, ...permisos)) {
            return next();
        }
        return res.redirect('/index.html');
    };
}

module.exports = {
    requiereSesion, requiereAdmin, requierePermiso,
    protegerPagina, protegerPaginaConPermiso,
    permisosDeUsuario, usuarioTienePermiso
};
