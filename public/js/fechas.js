// =====================================================================
// Utilidades compartidas de formato de fecha (solo presentacion).
// La base de datos y la API siempre manejan fechas ISO (YYYY-MM-DD);
// estas funciones se usan unicamente para mostrarlas al usuario.
// =====================================================================

const MESES_ABREV_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_SEMANA_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// dd/mmm/yyyy en minusculas, ej. 09/sep/2026
function formatearFecha(fechaIso) {
    if (!fechaIso) return '';
    const d = new Date(String(fechaIso).slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return fechaIso;

    const dia = String(d.getDate()).padStart(2, '0');
    const mes = MESES_ABREV_ES[d.getMonth()];
    const anio = d.getFullYear();
    return `${dia}/${mes}/${anio}`;
}

// dia de la semana en minusculas + fecha formateada, ej. "martes, 09/sep/2026"
function formatearFechaConDia(fechaIso) {
    if (!fechaIso) return '';
    const d = new Date(String(fechaIso).slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return fechaIso;

    return `${DIAS_SEMANA_ES[d.getDay()]}, ${formatearFecha(fechaIso)}`;
}
