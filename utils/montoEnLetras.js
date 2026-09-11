// =====================================================================
// Convierte un monto en USD a letras para el recibo impreso, en el
// formato habitual de los comprobantes ecuatorianos:
//   125.50 -> "CIENTO VEINTICINCO DÓLARES CON 50/100"
//   21.00  -> "VEINTIÚN DÓLARES CON 00/100"
//   1.00   -> "UN DÓLAR CON 00/100"
// Soporta hasta 999 999 999.99.
// =====================================================================

const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const ESPECIALES = {
    10: 'DIEZ', 11: 'ONCE', 12: 'DOCE', 13: 'TRECE', 14: 'CATORCE', 15: 'QUINCE',
    16: 'DIECISÉIS', 17: 'DIECISIETE', 18: 'DIECIOCHO', 19: 'DIECINUEVE',
    20: 'VEINTE', 21: 'VEINTIÚN', 22: 'VEINTIDÓS', 23: 'VEINTITRÉS', 24: 'VEINTICUATRO',
    25: 'VEINTICINCO', 26: 'VEINTISÉIS', 27: 'VEINTISIETE', 28: 'VEINTIOCHO', 29: 'VEINTINUEVE'
};
const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function menorQueCien(n) {
    if (n < 10) return UNIDADES[n];
    if (n < 30) return ESPECIALES[n];
    const decena = Math.floor(n / 10);
    const unidad = n % 10;
    return unidad === 0 ? DECENAS[decena] : `${DECENAS[decena]} Y ${UNIDADES[unidad]}`;
}

function menorQueMil(n) {
    if (n === 100) return 'CIEN';
    const centena = Math.floor(n / 100);
    const resto = n % 100;
    if (centena === 0) return menorQueCien(resto);
    return resto === 0 ? CENTENAS[centena] : `${CENTENAS[centena]} ${menorQueCien(resto)}`;
}

function enteroEnLetras(n) {
    if (n === 0) return 'CERO';
    const millones = Math.floor(n / 1000000);
    const miles = Math.floor((n % 1000000) / 1000);
    const resto = n % 1000;
    const partes = [];
    if (millones > 0) partes.push(millones === 1 ? 'UN MILLÓN' : `${menorQueMil(millones)} MILLONES`);
    if (miles > 0) partes.push(miles === 1 ? 'MIL' : `${menorQueMil(miles)} MIL`);
    if (resto > 0) partes.push(menorQueMil(resto));
    return partes.join(' ');
}

function montoEnLetras(monto) {
    const valor = Math.round(Number(monto) * 100) / 100;
    const entero = Math.floor(valor);
    const centavos = Math.round((valor - entero) * 100);
    const moneda = entero === 1 ? 'DÓLAR' : 'DÓLARES';
    return `${enteroEnLetras(entero)} ${moneda} CON ${String(centavos).padStart(2, '0')}/100`;
}

module.exports = { montoEnLetras };
