// =====================================================================
// Generador de numero de orden de laboratorio: LAB-AAAA-####
// Secuencial por anio (tabla contador_ordenes_laboratorio), mismo patron
// que numeroRecibo.js / numeroHistoria.js. Debe llamarse DENTRO de la
// transaccion que inserta el trabajo para que el numero y el trabajo
// queden atomicos. Un numero nunca se reutiliza: un trabajo cancelado
// conserva el suyo (el laboratorio ya lo tiene anotado).
// =====================================================================
const db = require('../db/conexion');

function generarNumeroOrdenLaboratorio(fechaIso) {
    const anio = Number(String(fechaIso || '').slice(0, 4)) || new Date().getFullYear();

    const fila = db.prepare('SELECT ultimo_numero FROM contador_ordenes_laboratorio WHERE anio = ?').get(anio);
    let siguiente;
    if (fila) {
        siguiente = fila.ultimo_numero + 1;
        db.prepare('UPDATE contador_ordenes_laboratorio SET ultimo_numero = ? WHERE anio = ?').run(siguiente, anio);
    } else {
        siguiente = 1;
        db.prepare('INSERT INTO contador_ordenes_laboratorio (anio, ultimo_numero) VALUES (?, ?)').run(anio, siguiente);
    }

    return `LAB-${anio}-${String(siguiente).padStart(4, '0')}`;
}

module.exports = { generarNumeroOrdenLaboratorio };
