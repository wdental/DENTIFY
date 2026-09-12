// =====================================================================
// Fecha y hora LOCALES del servidor, en el mismo formato con el que la
// base de datos pone sus valores por defecto (datetime('now','localtime')).
//
// Existe para no volver a usar new Date().toISOString(): eso devuelve UTC
// y en Ecuador (UTC-5), a partir de las 19:00, ya es el dia siguiente. Con
// la clinica atendiendo hasta las 21:00, un registro hecho de noche
// quedaba fechado "mañana" — visible, por ejemplo, en "anulada el ..." de
// una evolucion o un pago.
//
// Se pregunta a SQLite en vez de calcularlo en JS para que coincida
// exactamente con los DEFAULT del esquema.
// =====================================================================
const db = require('../db/conexion');

// 'YYYY-MM-DD HH:MM:SS'
function ahoraLocal() {
    return db.prepare("SELECT datetime('now', 'localtime') AS valor").get().valor;
}

// 'YYYY-MM-DD'
function hoyLocal() {
    return db.prepare("SELECT date('now', 'localtime') AS valor").get().valor;
}

// 'YYYY-MM-01' del mes en curso
function inicioMesLocal() {
    return db.prepare("SELECT date('now', 'localtime', 'start of month') AS valor").get().valor;
}

module.exports = { ahoraLocal, hoyLocal, inicioMesLocal };
