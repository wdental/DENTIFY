// =====================================================================
// Utilidades compartidas de formato de fecha (solo presentacion).
// La base de datos y la API siempre manejan fechas ISO (YYYY-MM-DD);
// estas funciones se usan unicamente para mostrarlas al usuario.
// =====================================================================

const MESES_ABREV_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_SEMANA_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// dd/mm/aaaa, ej. 12/09/2026. Es el UNICO formato de fecha del sistema:
// el mismo que muestran los campos donde se escribe (ver campo-fecha.js),
// para que nunca haya que adivinar si un 09/12 es septiembre o diciembre.
function formatearFecha(fechaIso) {
    if (!fechaIso) return '';
    const d = new Date(String(fechaIso).slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return fechaIso;

    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    return `${dia}/${mes}/${anio}`;
}

// dia de la semana en minusculas + fecha, ej. "sábado, 12/09/2026"
function formatearFechaConDia(fechaIso) {
    if (!fechaIso) return '';
    const d = new Date(String(fechaIso).slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return fechaIso;

    return `${DIAS_SEMANA_ES[d.getDay()]}, ${formatearFecha(fechaIso)}`;
}

// Fecha de un Date en ISO (YYYY-MM-DD) segun el reloj LOCAL del equipo.
// No usar toISOString(): esa es la fecha UTC y en Ecuador (UTC-5) a partir
// de las 19:00 ya devuelve el dia siguiente, de modo que la agenda abriria
// en "mañana" y un registro hecho de noche naceria fechado mal. La clinica
// atiende hasta las 21:00, asi que la diferencia es de uso diario.
function fechaIsoLocal(fecha) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Fecha de HOY en ISO (YYYY-MM-DD) segun el reloj local.
function fechaHoyIso() {
    return fechaIsoLocal(new Date());
}

// Marca de tiempo local 'YYYY-MM-DD HH:MM:SS', en el mismo formato que
// usan los DEFAULT de la base (datetime('now','localtime')). Para los
// campos de auditoria que se arman en el navegador.
function ahoraLocalIso() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${fechaIsoLocal(d)} ${hh}:${mm}:${ss}`;
}

// -----------------------------------------------------------------
// Ata un input de fecha a un <span class="fecha-legible"> que muestra la
// fecha con el DIA DE LA SEMANA, actualizado en vivo. El formato numerico
// ya lo muestra el propio campo en dd/mm/aaaa (ver campo-fecha.js), asi
// que este span aporta lo que el numero no dice: si cae domingo.
// -----------------------------------------------------------------

// Vuelve a pintar el span a partir del valor actual del input. Llamar
// tambien manualmente despues de asignar input.value por JS (asignar
// .value no dispara 'input'/'change').
function sincronizarFechaLegible(idInput, idSpan) {
    const input = document.getElementById(idInput);
    const span = document.getElementById(idSpan);
    if (!input || !span) return;
    if (!input.value) { span.textContent = ''; return; }
    // Siempre con el dia de la semana: el numero ya lo muestra el campo.
    span.textContent = formatearFechaConDia(input.value);
}

// Ata los listeners de actualizacion en vivo y pinta el valor inicial.
// Llamar una vez al inicializar la pantalla.
function vincularFechaLegible(idInput, idSpan) {
    const input = document.getElementById(idInput);
    if (!input) return;
    const actualizar = () => sincronizarFechaLegible(idInput, idSpan);
    input.addEventListener('input', actualizar);
    input.addEventListener('change', actualizar);
    actualizar();
}
