// =====================================================================
// Generador de numero de historia clinica: WD-AAAA-####
// Secuencial por anio, usando la tabla contador_historias
// =====================================================================
const db = require('../db/conexion');

function generarNumeroHistoria() {
    const anioActual = new Date().getFullYear();

    const transaccion = db.transaction(() => {
        const fila = db.prepare('SELECT ultimo_numero FROM contador_historias WHERE anio = ?').get(anioActual);

        let siguienteNumero;
        if (fila) {
            siguienteNumero = fila.ultimo_numero + 1;
            db.prepare('UPDATE contador_historias SET ultimo_numero = ? WHERE anio = ?').run(siguienteNumero, anioActual);
        } else {
            siguienteNumero = 1;
            db.prepare('INSERT INTO contador_historias (anio, ultimo_numero) VALUES (?, ?)').run(anioActual, siguienteNumero);
        }

        return siguienteNumero;
    });

    const numero = transaccion();
    return `WD-${anioActual}-${String(numero).padStart(4, '0')}`;
}

module.exports = { generarNumeroHistoria };
