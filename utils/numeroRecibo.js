// =====================================================================
// Generador de numero de recibo de pago: REC-AAAA-####
// Secuencial por anio (tabla contador_recibos), mismo patron que
// numeroHistoria.js. Debe llamarse DENTRO de la transaccion que inserta
// el pago para que el numero y el pago queden atomicos. Un numero nunca
// se reutiliza: un pago anulado conserva el suyo.
// =====================================================================
const db = require('../db/conexion');

function generarNumeroRecibo(fechaPagoIso) {
    const anio = Number(String(fechaPagoIso || '').slice(0, 4)) || new Date().getFullYear();

    const fila = db.prepare('SELECT ultimo_numero FROM contador_recibos WHERE anio = ?').get(anio);
    let siguiente;
    if (fila) {
        siguiente = fila.ultimo_numero + 1;
        db.prepare('UPDATE contador_recibos SET ultimo_numero = ? WHERE anio = ?').run(siguiente, anio);
    } else {
        siguiente = 1;
        db.prepare('INSERT INTO contador_recibos (anio, ultimo_numero) VALUES (?, ?)').run(anio, siguiente);
    }

    return `REC-${anio}-${String(siguiente).padStart(4, '0')}`;
}

module.exports = { generarNumeroRecibo };
