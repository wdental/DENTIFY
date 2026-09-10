// =====================================================================
// Motor de sincronizacion Dentify -> Google Calendar
//
// Principio central: la operacion local SIEMPRE se completa, sin
// importar si Google esta disponible. Cada intento de sincronizacion
// es "best effort": si falla, se registra en sync_pendientes y se
// reintenta automaticamente (cada 5 minutos y al iniciar el servidor).
// =====================================================================
const db = require('../db/conexion');
const googleCalendar = require('./googleCalendar');

const INTERVALO_REINTENTO_MS = 5 * 60 * 1000; // 5 minutos
const RETRASO_INICIAL_MS = 15 * 1000; // esperar a que el servidor arranque

// -----------------------------------------------------------------
// Registro (log) y metadatos de la ultima ejecucion
// -----------------------------------------------------------------
function registrarLog(nivel, mensaje, citaId = null) {
    db.prepare('INSERT INTO sync_log (nivel, mensaje, cita_id) VALUES (?, ?, ?)').run(nivel, mensaje, citaId);
    // Evitar que el log crezca indefinidamente: conservar los ultimos 200 registros
    db.prepare(`
        DELETE FROM sync_log WHERE id NOT IN (
            SELECT id FROM sync_log ORDER BY id DESC LIMIT 200
        )
    `).run();
}

function actualizarUltimaEjecucion(resultado) {
    db.prepare(`
        INSERT INTO sync_meta (id, ultima_ejecucion, ultimo_resultado)
        VALUES (1, datetime('now', 'localtime'), ?)
        ON CONFLICT(id) DO UPDATE SET ultima_ejecucion = excluded.ultima_ejecucion, ultimo_resultado = excluded.ultimo_resultado
    `).run(resultado);
}

// -----------------------------------------------------------------
// Cola de pendientes
// -----------------------------------------------------------------
function encolarPendiente(citaId, operacion, errorMensaje, payload) {
    const existente = db.prepare(
        'SELECT * FROM sync_pendientes WHERE cita_id = ? AND operacion = ?'
    ).get(citaId, operacion);

    if (existente) {
        db.prepare(`
            UPDATE sync_pendientes
            SET intentos = intentos + 1, ultimo_error = ?, fecha_ultimo_intento = datetime('now', 'localtime'),
                payload_json = COALESCE(?, payload_json)
            WHERE id = ?
        `).run(errorMensaje, payload ? JSON.stringify(payload) : null, existente.id);
    } else {
        db.prepare(`
            INSERT INTO sync_pendientes (cita_id, operacion, payload_json, intentos, ultimo_error, fecha_ultimo_intento)
            VALUES (?, ?, ?, 1, ?, datetime('now', 'localtime'))
        `).run(citaId, operacion, payload ? JSON.stringify(payload) : null, errorMensaje);
    }
}

function limpiarPendientes(citaId, operacion) {
    db.prepare('DELETE FROM sync_pendientes WHERE cita_id = ? AND operacion = ?').run(citaId, operacion);
}

// -----------------------------------------------------------------
// Reconciliacion de una cita: crea el evento si no existe, lo
// actualiza si ya existe. Es idempotente y segura de reintentar.
// -----------------------------------------------------------------
async function sincronizarCita(citaId) {
    const cita = db.prepare('SELECT * FROM citas WHERE id = ?').get(citaId);
    if (!cita) {
        limpiarPendientes(citaId, 'sincronizar');
        return { ok: true, motivo: 'cita_inexistente' };
    }

    const doctor = cita.doctor_id ? db.prepare('SELECT * FROM doctores WHERE id = ?').get(cita.doctor_id) : null;

    if (!doctor || !doctor.activo || !doctor.calendario_google_id) {
        db.prepare("UPDATE citas SET sync_estado = 'no_aplica' WHERE id = ?").run(citaId);
        limpiarPendientes(citaId, 'sincronizar');
        return { ok: true, motivo: 'no_aplica' };
    }

    const paciente = db.prepare('SELECT * FROM pacientes WHERE id = ?').get(cita.paciente_id);
    if (!paciente) {
        db.prepare("UPDATE citas SET sync_estado = 'error' WHERE id = ?").run(citaId);
        return { ok: false, motivo: 'paciente_inexistente' };
    }

    const evento = googleCalendar.construirEvento(cita, paciente);

    try {
        if (cita.google_event_id) {
            try {
                await googleCalendar.actualizarEvento(doctor.calendario_google_id, cita.google_event_id, evento);
            } catch (error) {
                const codigo = googleCalendar.obtenerCodigoError(error);
                if (codigo === 404 || codigo === 410) {
                    // El evento ya no existe en Google (borrado manualmente): se recrea
                    const nuevoId = await googleCalendar.crearEvento(doctor.calendario_google_id, evento);
                    db.prepare('UPDATE citas SET google_event_id = ? WHERE id = ?').run(nuevoId, citaId);
                } else {
                    throw error;
                }
            }
        } else {
            const nuevoId = await googleCalendar.crearEvento(doctor.calendario_google_id, evento);
            db.prepare('UPDATE citas SET google_event_id = ? WHERE id = ?').run(nuevoId, citaId);
        }

        db.prepare("UPDATE citas SET sync_estado = 'sincronizada' WHERE id = ?").run(citaId);
        limpiarPendientes(citaId, 'sincronizar');
        return { ok: true };
    } catch (error) {
        const mensaje = googleCalendar.interpretarError(error);
        db.prepare("UPDATE citas SET sync_estado = 'error' WHERE id = ?").run(citaId);
        encolarPendiente(citaId, 'sincronizar', mensaje);
        registrarLog('error', `No se pudo sincronizar la cita #${citaId}: ${mensaje}`, citaId);
        return { ok: false, motivo: mensaje };
    }
}

// -----------------------------------------------------------------
// Eliminacion de un evento remoto (la cita local ya fue borrada, por
// eso se reciben directamente los identificadores necesarios).
// -----------------------------------------------------------------
async function eliminarEventoRemoto(citaId, googleEventId, calendarioGoogleId) {
    if (!googleEventId || !calendarioGoogleId) return { ok: true, motivo: 'no_aplica' };

    try {
        await googleCalendar.eliminarEvento(calendarioGoogleId, googleEventId);
        registrarLog('info', `Evento de la cita #${citaId} eliminado de Google Calendar`, citaId);
        return { ok: true };
    } catch (error) {
        const mensaje = googleCalendar.interpretarError(error);
        encolarPendiente(citaId, 'eliminar', mensaje, { googleEventId, calendarioGoogleId });
        registrarLog('error', `No se pudo eliminar el evento de la cita #${citaId}: ${mensaje}`, citaId);
        return { ok: false, motivo: mensaje };
    }
}

// -----------------------------------------------------------------
// Procesa toda la cola de pendientes (reintentos)
// -----------------------------------------------------------------
async function procesarColaPendientes() {
    const pendientes = db.prepare('SELECT * FROM sync_pendientes ORDER BY fecha_creacion ASC').all();
    let exitosos = 0;
    let fallidos = 0;

    for (const pendiente of pendientes) {
        if (pendiente.operacion === 'sincronizar') {
            const resultado = await sincronizarCita(pendiente.cita_id);
            if (resultado.ok) exitosos++; else fallidos++;
        } else if (pendiente.operacion === 'eliminar') {
            let payload = null;
            try { payload = pendiente.payload_json ? JSON.parse(pendiente.payload_json) : null; } catch (e) { payload = null; }

            if (!payload) {
                db.prepare('DELETE FROM sync_pendientes WHERE id = ?').run(pendiente.id);
                continue;
            }

            try {
                await googleCalendar.eliminarEvento(payload.calendarioGoogleId, payload.googleEventId);
                db.prepare('DELETE FROM sync_pendientes WHERE id = ?').run(pendiente.id);
                registrarLog('info', `Evento pendiente de la cita #${pendiente.cita_id} eliminado en el reintento`, pendiente.cita_id);
                exitosos++;
            } catch (error) {
                const mensaje = googleCalendar.interpretarError(error);
                db.prepare(`
                    UPDATE sync_pendientes SET intentos = intentos + 1, ultimo_error = ?, fecha_ultimo_intento = datetime('now', 'localtime')
                    WHERE id = ?
                `).run(mensaje, pendiente.id);
                registrarLog('error', `Reintento fallido al eliminar el evento de la cita #${pendiente.cita_id}: ${mensaje}`, pendiente.cita_id);
                fallidos++;
            }
        }
    }

    actualizarUltimaEjecucion(fallidos === 0 ? 'ok' : 'con_errores');
    if (pendientes.length > 0) {
        registrarLog('info', `Reintento de sincronizacion: ${exitosos} resuelto(s), ${fallidos} pendiente(s)`);
    }

    return { procesados: pendientes.length, exitosos, fallidos };
}

// -----------------------------------------------------------------
// Consulta de estado (para el indicador en la interfaz)
// -----------------------------------------------------------------
function obtenerEstado() {
    const pendientes = db.prepare('SELECT COUNT(*) AS total FROM sync_pendientes').get().total;
    const meta = db.prepare('SELECT * FROM sync_meta WHERE id = 1').get();
    const erroresRecientes = db.prepare(
        "SELECT * FROM sync_log WHERE nivel = 'error' ORDER BY id DESC LIMIT 10"
    ).all();

    return {
        pendientes,
        ultimaEjecucion: meta ? meta.ultima_ejecucion : null,
        ultimoResultado: meta ? meta.ultimo_resultado : null,
        erroresRecientes
    };
}

// -----------------------------------------------------------------
// Programador: reintenta automaticamente cada 5 minutos y al iniciar
// -----------------------------------------------------------------
let intervaloActivo = null;

function iniciarProgramador() {
    if (intervaloActivo) return;

    setTimeout(() => {
        procesarColaPendientes().catch((error) => {
            registrarLog('error', `Error inesperado al procesar la cola de sincronizacion: ${error.message}`);
        });
    }, RETRASO_INICIAL_MS);

    intervaloActivo = setInterval(() => {
        procesarColaPendientes().catch((error) => {
            registrarLog('error', `Error inesperado al procesar la cola de sincronizacion: ${error.message}`);
        });
    }, INTERVALO_REINTENTO_MS);
}

module.exports = {
    sincronizarCita,
    eliminarEventoRemoto,
    procesarColaPendientes,
    obtenerEstado,
    iniciarProgramador,
    registrarLog
};
