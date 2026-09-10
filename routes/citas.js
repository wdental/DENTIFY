// =====================================================================
// Rutas de citas (agenda). Cada creacion/edicion/cancelacion dispara
// una sincronizacion best-effort hacia Google Calendar (ver utils/sincronizacion.js).
// =====================================================================
const express = require('express');
const db = require('../db/conexion');
const sincronizacion = require('../utils/sincronizacion');
const { requiereSesion, requiereAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requiereSesion);

const ESTADOS_VALIDOS = ['pendiente', 'confirmada', 'atendida', 'cancelada', 'no_asistio'];
const DURACION_DEFECTO_MIN = 30;

// -----------------------------------------------------------------
// Horario de la clinica: uniforme todos los dias (incluido domingo),
// 07:00-21:00. El domingo solo conserva la etiqueta informativa
// "Bajo cita previa" en el front-end, sin restringir el rango horario.
// (getDay(): 0 = domingo, 1..6 = lunes..sabado)
// -----------------------------------------------------------------
const HORARIO_UNICO = { inicio: '07:00', fin: '21:00' };
const HORARIO_CLINICA = {
    0: HORARIO_UNICO,
    1: HORARIO_UNICO,
    2: HORARIO_UNICO,
    3: HORARIO_UNICO,
    4: HORARIO_UNICO,
    5: HORARIO_UNICO,
    6: HORARIO_UNICO
};

function minutosDesdeHHMM(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

function sumarMinutosHHMM(hhmm, minutos) {
    const total = minutosDesdeHHMM(hhmm) + minutos;
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function horarioDelDia(fecha) {
    const diaSemana = new Date(fecha + 'T00:00:00').getDay();
    return HORARIO_CLINICA[diaSemana];
}

function validarHorarioClinica(fecha, horaInicio, horaFin) {
    const horario = horarioDelDia(fecha);
    if (!horario) return 'Fecha invalida';

    const inicioMin = minutosDesdeHHMM(horaInicio);
    const finMin = minutosDesdeHHMM(horaFin);
    const aperturaMin = minutosDesdeHHMM(horario.inicio);
    const cierreMin = minutosDesdeHHMM(horario.fin);

    if (inicioMin >= finMin) return 'La hora de fin debe ser posterior a la hora de inicio';
    if (inicioMin < aperturaMin || finMin > cierreMin) {
        return `Fuera del horario de atencion (${horario.inicio} - ${horario.fin})`;
    }
    return null;
}

function seSolapan(inicioA, finA, inicioB, finB) {
    return minutosDesdeHHMM(inicioA) < minutosDesdeHHMM(finB) && minutosDesdeHHMM(inicioB) < minutosDesdeHHMM(finA);
}

function finEfectivo(cita) {
    return cita.hora_fin || sumarMinutosHHMM(cita.hora_inicio, DURACION_DEFECTO_MIN);
}

// Conflicto de sillon: mismo sillon, misma fecha, horas solapadas. Siempre bloquea.
function buscarConflictoSillon(fecha, sillon, horaInicio, horaFin, idExcluir) {
    if (!sillon) return null;
    const candidatas = db.prepare(`
        SELECT c.*, p.nombres AS paciente_nombres, p.apellidos AS paciente_apellidos
        FROM citas c JOIN pacientes p ON p.id = c.paciente_id
        WHERE c.fecha = ? AND c.sillon = ? AND c.estado != 'cancelada' AND c.id != ?
    `).all(fecha, sillon, idExcluir || 0);

    return candidatas.find((c) => seSolapan(horaInicio, horaFin, c.hora_inicio, finEfectivo(c))) || null;
}

// Conflicto de doctor: mismo doctor, misma fecha, horas solapadas, sillon distinto (o alguno sin sillon).
// No bloquea de forma definitiva: se permite continuar solo si es admin y confirma (forzar = true).
function buscarConflictoDoctor(doctorId, fecha, sillon, horaInicio, horaFin, idExcluir) {
    if (!doctorId) return null;
    const candidatas = db.prepare(`
        SELECT c.*, p.nombres AS paciente_nombres, p.apellidos AS paciente_apellidos
        FROM citas c JOIN pacientes p ON p.id = c.paciente_id
        WHERE c.fecha = ? AND c.doctor_id = ? AND c.estado != 'cancelada' AND c.id != ?
    `).all(fecha, doctorId, idExcluir || 0);

    return candidatas.find((c) => {
        if (sillon && c.sillon && Number(c.sillon) === Number(sillon)) return false; // eso ya lo cubre el conflicto de sillon
        return seSolapan(horaInicio, horaFin, c.hora_inicio, finEfectivo(c));
    }) || null;
}

function validarDatosCita(datos) {
    if (!datos.paciente_id) return 'Debe seleccionar un paciente';
    if (!datos.doctor_id) return 'Debe seleccionar un doctor';
    if (!datos.fecha) return 'La fecha es obligatoria';
    if (!datos.hora_inicio) return 'La hora de inicio es obligatoria';
    if (datos.estado && !ESTADOS_VALIDOS.includes(datos.estado)) return 'Estado invalido';
    return null;
}

// -----------------------------------------------------------------
// GET /api/citas - lista de citas por rango de fechas (y/o filtro doctor/paciente)
// -----------------------------------------------------------------
router.get('/', (req, res) => {
    const { doctor_id, paciente_id } = req.query;
    let { desde, hasta } = req.query;

    if (!desde && !hasta && !paciente_id) {
        desde = new Date().toISOString().slice(0, 10);
        hasta = desde;
    } else {
        desde = desde || '0001-01-01';
        hasta = hasta || '9999-12-31';
    }

    let sql = `
        SELECT c.*, p.nombres AS paciente_nombres, p.apellidos AS paciente_apellidos, p.numero_historia
        FROM citas c
        JOIN pacientes p ON p.id = c.paciente_id
        WHERE c.fecha BETWEEN ? AND ?
    `;
    const parametros = [desde, hasta];

    if (doctor_id) {
        sql += ' AND c.doctor_id = ?';
        parametros.push(doctor_id);
    }
    if (paciente_id) {
        sql += ' AND c.paciente_id = ?';
        parametros.push(paciente_id);
    }

    sql += ' ORDER BY c.fecha, c.hora_inicio';

    res.json(db.prepare(sql).all(...parametros));
});

// GET /api/citas/:id
router.get('/:id', (req, res) => {
    const cita = db.prepare(`
        SELECT c.*, p.nombres AS paciente_nombres, p.apellidos AS paciente_apellidos
        FROM citas c JOIN pacientes p ON p.id = c.paciente_id
        WHERE c.id = ?
    `).get(req.params.id);
    if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });
    res.json(cita);
});

// -----------------------------------------------------------------
// POST /api/citas - crear cita
// -----------------------------------------------------------------
router.post('/', async (req, res) => {
    const datos = req.body;
    const errorValidacion = validarDatosCita(datos);
    if (errorValidacion) return res.status(400).json({ error: errorValidacion });

    const paciente = db.prepare('SELECT id FROM pacientes WHERE id = ? AND activo = 1').get(datos.paciente_id);
    if (!paciente) return res.status(400).json({ error: 'Paciente no encontrado' });

    const doctor = db.prepare('SELECT * FROM doctores WHERE id = ?').get(datos.doctor_id);
    if (!doctor) return res.status(400).json({ error: 'Doctor no encontrado' });

    const horaFin = datos.hora_fin || sumarMinutosHHMM(datos.hora_inicio, DURACION_DEFECTO_MIN);

    const errorHorario = validarHorarioClinica(datos.fecha, datos.hora_inicio, horaFin);
    if (errorHorario) return res.status(400).json({ error: errorHorario });

    const conflictoSillon = buscarConflictoSillon(datos.fecha, datos.sillon, datos.hora_inicio, horaFin, null);
    if (conflictoSillon) {
        return res.status(409).json({
            error: `El sillon ${datos.sillon} ya esta ocupado de ${conflictoSillon.hora_inicio} a ${finEfectivo(conflictoSillon)} (${conflictoSillon.paciente_apellidos} ${conflictoSillon.paciente_nombres})`
        });
    }

    const conflictoDoctor = buscarConflictoDoctor(datos.doctor_id, datos.fecha, datos.sillon, datos.hora_inicio, horaFin, null);
    if (conflictoDoctor) {
        const puedeForzar = req.session.usuario.rol === 'admin';
        if (!(datos.forzar && puedeForzar)) {
            return res.status(409).json({
                error: `${doctor.nombre_completo} ya tiene otra cita de ${conflictoDoctor.hora_inicio} a ${finEfectivo(conflictoDoctor)} (sillon ${conflictoDoctor.sillon || 'sin asignar'})`,
                advertencia: true,
                puedeForzar
            });
        }
    }

    const resultado = db.prepare(`
        INSERT INTO citas (paciente_id, doctor_id, doctor_nombre, sillon, fecha, hora_inicio, hora_fin, motivo, estado, notas, sync_estado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')
    `).run(
        datos.paciente_id,
        datos.doctor_id,
        doctor.nombre_completo,
        datos.sillon || null,
        datos.fecha,
        datos.hora_inicio,
        horaFin,
        datos.motivo || null,
        datos.estado || 'pendiente',
        datos.notas || null
    );

    const citaId = resultado.lastInsertRowid;
    const resultadoSync = await sincronizacion.sincronizarCita(citaId);

    const citaCreada = db.prepare('SELECT * FROM citas WHERE id = ?').get(citaId);
    res.json({ ok: true, id: citaId, sync_estado: citaCreada.sync_estado, sync: resultadoSync });
});

// -----------------------------------------------------------------
// PUT /api/citas/:id - editar / reagendar / cambiar estado
// -----------------------------------------------------------------
router.put('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const citaAnterior = db.prepare('SELECT * FROM citas WHERE id = ?').get(id);
    if (!citaAnterior) return res.status(404).json({ error: 'Cita no encontrada' });

    const datos = req.body;
    const errorValidacion = validarDatosCita(datos);
    if (errorValidacion) return res.status(400).json({ error: errorValidacion });

    const paciente = db.prepare('SELECT id FROM pacientes WHERE id = ?').get(datos.paciente_id);
    if (!paciente) return res.status(400).json({ error: 'Paciente no encontrado' });

    const doctor = db.prepare('SELECT * FROM doctores WHERE id = ?').get(datos.doctor_id);
    if (!doctor) return res.status(400).json({ error: 'Doctor no encontrado' });

    const horaFin = datos.hora_fin || sumarMinutosHHMM(datos.hora_inicio, DURACION_DEFECTO_MIN);
    const estadosSinValidarHorario = ['cancelada']; // permite archivar/cancelar sin volver a chocar con el horario

    if (!estadosSinValidarHorario.includes(datos.estado)) {
        const errorHorario = validarHorarioClinica(datos.fecha, datos.hora_inicio, horaFin);
        if (errorHorario) return res.status(400).json({ error: errorHorario });

        const conflictoSillon = buscarConflictoSillon(datos.fecha, datos.sillon, datos.hora_inicio, horaFin, id);
        if (conflictoSillon) {
            return res.status(409).json({
                error: `El sillon ${datos.sillon} ya esta ocupado de ${conflictoSillon.hora_inicio} a ${finEfectivo(conflictoSillon)} (${conflictoSillon.paciente_apellidos} ${conflictoSillon.paciente_nombres})`
            });
        }

        const conflictoDoctor = buscarConflictoDoctor(datos.doctor_id, datos.fecha, datos.sillon, datos.hora_inicio, horaFin, id);
        if (conflictoDoctor) {
            const puedeForzar = req.session.usuario.rol === 'admin';
            if (!(datos.forzar && puedeForzar)) {
                return res.status(409).json({
                    error: `${doctor.nombre_completo} ya tiene otra cita de ${conflictoDoctor.hora_inicio} a ${finEfectivo(conflictoDoctor)} (sillon ${conflictoDoctor.sillon || 'sin asignar'})`,
                    advertencia: true,
                    puedeForzar
                });
            }
        }
    }

    const cambioDoctor = Number(datos.doctor_id) !== citaAnterior.doctor_id;

    // Si cambia el doctor, el evento anterior debe eliminarse del calendario anterior
    if (cambioDoctor && citaAnterior.google_event_id && citaAnterior.doctor_id) {
        const doctorAnterior = db.prepare('SELECT * FROM doctores WHERE id = ?').get(citaAnterior.doctor_id);
        if (doctorAnterior && doctorAnterior.calendario_google_id) {
            await sincronizacion.eliminarEventoRemoto(id, citaAnterior.google_event_id, doctorAnterior.calendario_google_id);
        }
    }

    db.prepare(`
        UPDATE citas SET
            paciente_id = ?, doctor_id = ?, doctor_nombre = ?, sillon = ?, fecha = ?, hora_inicio = ?,
            hora_fin = ?, motivo = ?, estado = ?, notas = ?
            ${cambioDoctor ? ', google_event_id = NULL' : ''}
        WHERE id = ?
    `).run(
        datos.paciente_id,
        datos.doctor_id,
        doctor.nombre_completo,
        datos.sillon || null,
        datos.fecha,
        datos.hora_inicio,
        horaFin,
        datos.motivo || null,
        datos.estado || citaAnterior.estado,
        datos.notas || null,
        id
    );

    const resultadoSync = await sincronizacion.sincronizarCita(id);

    const citaActualizada = db.prepare('SELECT * FROM citas WHERE id = ?').get(id);
    res.json({ ok: true, sync_estado: citaActualizada.sync_estado, sync: resultadoSync });
});

// -----------------------------------------------------------------
// DELETE /api/citas/:id - eliminar (solo admin)
// -----------------------------------------------------------------
router.delete('/:id', requiereAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const cita = db.prepare('SELECT * FROM citas WHERE id = ?').get(id);
    if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });

    let calendarioGoogleId = null;
    if (cita.google_event_id && cita.doctor_id) {
        const doctor = db.prepare('SELECT calendario_google_id FROM doctores WHERE id = ?').get(cita.doctor_id);
        calendarioGoogleId = doctor ? doctor.calendario_google_id : null;
    }

    try {
        db.prepare('DELETE FROM citas WHERE id = ?').run(id);
    } catch (error) {
        // Nunca debe tumbar el servidor por una restriccion de la base de
        // datos (p.ej. una referencia desde otra tabla): se responde con un
        // error claro en vez de una excepcion no controlada.
        return res.status(400).json({ error: 'No se pudo eliminar la cita: ' + error.message });
    }

    if (cita.google_event_id && calendarioGoogleId) {
        await sincronizacion.eliminarEventoRemoto(id, cita.google_event_id, calendarioGoogleId);
    }

    res.json({ ok: true });
});

module.exports = router;
