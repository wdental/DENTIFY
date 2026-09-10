// =====================================================================
// Integracion con Google Calendar (cuenta de servicio)
// Sincronizacion UNIDIRECCIONAL: Dentify -> Google. Google nunca
// modifica datos de Dentify.
// =====================================================================
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const RUTA_CREDENCIALES = path.join(__dirname, '..', 'google-credentials.json');
const ZONA_HORARIA = 'America/Guayaquil';

function credencialesDisponibles() {
    return fs.existsSync(RUTA_CREDENCIALES);
}

let clienteCache = null;

// Devuelve un cliente de Calendar autenticado con la cuenta de servicio.
// Se reconstruye si antes no habia credenciales (permite agregar el
// archivo google-credentials.json sin reiniciar el servidor).
function obtenerCliente() {
    if (!credencialesDisponibles()) {
        throw new Error(
            'No se encontro el archivo google-credentials.json en la raiz del proyecto. ' +
            'Configure la cuenta de servicio de Google para habilitar la sincronizacion.'
        );
    }
    if (clienteCache) return clienteCache;

    const auth = new google.auth.GoogleAuth({
        keyFile: RUTA_CREDENCIALES,
        scopes: ['https://www.googleapis.com/auth/calendar']
    });

    clienteCache = google.calendar({ version: 'v3', auth });
    return clienteCache;
}

// Construye el objeto de evento de Google a partir de una cita y un
// paciente. NUNCA debe incluir datos sensibles (cedula, telefono,
// notas clinicas, etc.), solo lo minimo indispensable.
function construirEvento(cita, paciente) {
    const titulo = construirTitulo(cita, paciente);
    const inicio = combinarFechaHora(cita.fecha, cita.hora_inicio);
    const fin = combinarFechaHora(cita.fecha, cita.hora_fin || sumarMinutos(cita.hora_inicio, 30));

    const evento = {
        summary: titulo,
        description: 'Gestionado desde Dentify. Detalles en el sistema.',
        start: { dateTime: inicio, timeZone: ZONA_HORARIA },
        end: { dateTime: fin, timeZone: ZONA_HORARIA }
    };

    if (cita.estado === 'cancelada' || cita.estado === 'no_asistio') {
        evento.colorId = '8'; // Graphite (gris) en la paleta de Google Calendar
    }

    return evento;
}

function construirNombrePaciente(paciente) {
    const primerNombre = (paciente.nombres || '').trim().split(/\s+/)[0] || 'Paciente';
    const apellido = (paciente.apellidos || '').trim();
    const inicialApellido = apellido ? `${apellido.charAt(0).toUpperCase()}.` : '';
    return `${primerNombre} ${inicialApellido}`.trim();
}

function construirTitulo(cita, paciente) {
    const nombrePaciente = construirNombrePaciente(paciente);
    const motivo = cita.motivo && cita.motivo.trim() ? cita.motivo.trim() : 'Cita';
    const sillon = cita.sillon ? ` (Sillón ${cita.sillon})` : '';
    let titulo = `${motivo} — ${nombrePaciente}${sillon}`;

    if (cita.estado === 'cancelada') titulo = `[CANCELADA] ${titulo}`;
    else if (cita.estado === 'no_asistio') titulo = `[NO ASISTIÓ] ${titulo}`;

    return titulo;
}

function combinarFechaHora(fecha, hora) {
    return `${fecha}T${hora}:00`;
}

function sumarMinutos(hora, minutos) {
    const [h, m] = hora.split(':').map(Number);
    const total = h * 60 + m + minutos;
    const hh = String(Math.floor((total % (24 * 60)) / 60)).padStart(2, '0');
    const mm = String(total % 60).padStart(2, '0');
    return `${hh}:${mm}`;
}

// -----------------------------------------------------------------
// Operaciones sobre eventos
// -----------------------------------------------------------------

async function crearEvento(calendarioId, evento) {
    const calendar = obtenerCliente();
    const respuesta = await calendar.events.insert({ calendarId: calendarioId, requestBody: evento });
    return respuesta.data.id;
}

async function actualizarEvento(calendarioId, eventId, evento) {
    const calendar = obtenerCliente();
    await calendar.events.patch({ calendarId: calendarioId, eventId, requestBody: evento });
}

async function eliminarEvento(calendarioId, eventId) {
    const calendar = obtenerCliente();
    try {
        await calendar.events.delete({ calendarId: calendarioId, eventId });
    } catch (error) {
        // Si el evento ya no existe en Google, se considera eliminado
        const codigo = obtenerCodigoError(error);
        if (codigo === 404 || codigo === 410 || codigo === 'notFound' || codigo === 'gone') return;
        throw error;
    }
}

// Verifica que la cuenta de servicio tenga acceso al calendario indicado
async function probarConexion(calendarioId) {
    const calendar = obtenerCliente();
    const respuesta = await calendar.calendars.get({ calendarId: calendarioId });
    return respuesta.data; // { id, summary, timeZone, ... }
}

function obtenerCodigoError(error) {
    return error?.code ?? error?.response?.status ?? error?.status ?? null;
}

// Traduce errores tecnicos a mensajes entendibles para el usuario
function interpretarError(error) {
    if (!credencialesDisponibles()) {
        return 'No se encontro el archivo google-credentials.json. Configure la cuenta de servicio de Google.';
    }
    const codigo = obtenerCodigoError(error);
    if (codigo === 404) return 'No se encontro el calendario. Verifique que el ID sea correcto.';
    if (codigo === 403) return 'La cuenta de servicio no tiene acceso a este calendario. Compartalo con su correo (ver README).';
    if (codigo === 401) return 'Las credenciales de la cuenta de servicio no son validas.';
    return error?.message || 'Error desconocido al conectar con Google Calendar.';
}

module.exports = {
    credencialesDisponibles,
    construirEvento,
    crearEvento,
    actualizarEvento,
    eliminarEvento,
    probarConexion,
    interpretarError,
    obtenerCodigoError
};
