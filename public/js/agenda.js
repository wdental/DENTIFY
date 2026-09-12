// =====================================================================
// Logica de la agenda: vista dia (por sillon, franjas de 15 min),
// vista semana (resumen), crear/editar/cancelar citas, validacion de
// horario y solapamientos, e indicador de sincronizacion con Google
// Calendar. Toda escritura pasa por /api/citas, que dispara el motor
// de sincronizacion en utils/sincronizacion.js (sin tocar ese motor).
// =====================================================================

let usuarioSesion = null;
let doctoresActivos = [];
let fechaSeleccionada = fechaHoyIso();
let vistaActual = 'dia';
let pacienteSeleccionado = null;
let temporizadorBusquedaPaciente = null;

const SLOT_MIN = 15;
const ALTURA_SLOT_PX = 16;
const DURACION_DEFECTO_MIN = 30;
const SILLONES = [1, 2];

// Debe reflejar routes/citas.js (HORARIO_CLINICA): horario uniforme
// todos los dias, incluido domingo. getDay(): 0 = domingo.
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

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const ETIQUETAS_ESTADO = {
    pendiente: 'Agendada',
    confirmada: 'Confirmada',
    atendida: 'Atendida',
    cancelada: 'Cancelada',
    no_asistio: 'No asistió'
};

const ETIQUETAS_SYNC = {
    sincronizada: { texto: 'Sincronizada', clase: '' },
    pendiente: { texto: 'Sincronizando...', clase: 'insignia--dorado' },
    error: { texto: 'Error de sincronizacion', clase: 'insignia--rojo' },
    no_aplica: { texto: 'Sin calendario', clase: '' }
};

// -----------------------------------------------------------------
// Utilidades de tiempo
// -----------------------------------------------------------------
function minutosDesdeHHMM(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

function minutosAHHMM(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function sumarMinutos(hhmm, minutos) {
    return minutosAHHMM(minutosDesdeHHMM(hhmm) + minutos);
}

function horarioDelDia(fechaStr) {
    const diaSemana = new Date(fechaStr + 'T00:00:00').getDay();
    return HORARIO_CLINICA[diaSemana];
}

function esDomingo(fechaStr) {
    return new Date(fechaStr + 'T00:00:00').getDay() === 0;
}

function formatoFechaLarga(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    return `${NOMBRES_DIA[d.getDay()]} ${formatearFecha(fechaStr)}`;
}

function inicioSemana(fechaStr) {
    const d = new Date(fechaStr + 'T00:00:00');
    const dia = d.getDay();
    const diff = dia === 0 ? -6 : 1 - dia;
    d.setDate(d.getDate() + diff);
    return fechaIsoLocal(d);
}

function sumarDias(fechaStr, dias) {
    const d = new Date(fechaStr + 'T00:00:00');
    d.setDate(d.getDate() + dias);
    return fechaIsoLocal(d);
}

// -----------------------------------------------------------------
// Arranque
// -----------------------------------------------------------------
(async () => {
    usuarioSesion = await inicializarSidebar();
    if (!usuarioSesion) return;

    if (usuarioSesion.rol === 'admin') {
        document.getElementById('btn-sincronizar-ahora').classList.remove('oculto');
        document.getElementById('panel-sync-admin').classList.remove('oculto');
    }

    document.getElementById('campo-fecha-agenda').value = fechaSeleccionada;

    await cargarDoctores();
    await cargarVistaActual();
    await actualizarIndicadorSync();

    document.getElementById('campo-fecha-agenda').addEventListener('change', (e) => {
        fechaSeleccionada = e.target.value;
        cargarVistaActual();
    });
    document.getElementById('btn-periodo-anterior').addEventListener('click', () => cambiarPeriodo(-1));
    document.getElementById('btn-periodo-siguiente').addEventListener('click', () => cambiarPeriodo(1));
    document.getElementById('btn-hoy').addEventListener('click', () => {
        fechaSeleccionada = fechaHoyIso();
        document.getElementById('campo-fecha-agenda').value = fechaSeleccionada;
        cargarVistaActual();
    });
    document.getElementById('filtro-doctor-agenda').addEventListener('change', cargarVistaActual);

    document.getElementById('btn-vista-dia').addEventListener('click', () => cambiarVista('dia'));
    document.getElementById('btn-vista-semana').addEventListener('click', () => cambiarVista('semana'));

    document.getElementById('btn-nueva-cita').addEventListener('click', () => abrirModalNuevaCita());
    document.getElementById('cerrar-modal-cita').addEventListener('click', cerrarModalCita);
    document.getElementById('cancelar-modal-cita').addEventListener('click', cerrarModalCita);
    document.getElementById('form-cita').addEventListener('submit', (e) => guardarCita(e, false));

    document.getElementById('c-buscar-paciente').addEventListener('input', buscarPacientesEnVivo);

    document.getElementById('btn-sincronizar-ahora').addEventListener('click', sincronizarAhora);
    vincularFechaLegible('c-fecha', 'c-fecha-legible');

    // Refrescar el indicador de sincronizacion periodicamente
    setInterval(actualizarIndicadorSync, 60 * 1000);

    manejarLlegadaDesdeFicha();
})();

// Si se llega desde la ficha del paciente con ?paciente_id=X&nueva=1, precarga el modal
function manejarLlegadaDesdeFicha() {
    const parametros = new URLSearchParams(window.location.search);
    const pacienteId = parametros.get('paciente_id');
    const nueva = parametros.get('nueva');

    if (pacienteId && nueva === '1') {
        abrirModalNuevaCita({
            pacienteId: Number(pacienteId),
            pacienteNombre: parametros.get('paciente_nombre') || 'Paciente seleccionado'
        });
        window.history.replaceState({}, '', '/agenda.html');
    }
}

function cambiarVista(vista) {
    vistaActual = vista;
    document.getElementById('btn-vista-dia').classList.toggle('activo', vista === 'dia');
    document.getElementById('btn-vista-semana').classList.toggle('activo', vista === 'semana');
    document.getElementById('vista-dia').classList.toggle('oculto', vista !== 'dia');
    document.getElementById('vista-semana').classList.toggle('oculto', vista !== 'semana');
    cargarVistaActual();
}

function cambiarPeriodo(delta) {
    if (vistaActual === 'dia') {
        fechaSeleccionada = sumarDias(fechaSeleccionada, delta);
    } else {
        fechaSeleccionada = sumarDias(fechaSeleccionada, delta * 7);
    }
    document.getElementById('campo-fecha-agenda').value = fechaSeleccionada;
    cargarVistaActual();
}

function cargarVistaActual() {
    actualizarEtiquetaFecha();
    return vistaActual === 'dia' ? cargarDia() : cargarSemana();
}

function actualizarEtiquetaFecha() {
    document.getElementById('fecha-seleccionada-legible').textContent = formatearFechaConDia(fechaSeleccionada);
}

// -----------------------------------------------------------------
// Doctores
// -----------------------------------------------------------------
async function cargarDoctores() {
    try {
        doctoresActivos = await api.get('/api/doctores');

        const selectFiltro = document.getElementById('filtro-doctor-agenda');
        const selectFormulario = document.getElementById('c-doctor');

        const opciones = doctoresActivos.map((d) => `<option value="${d.id}">${d.nombre_completo}</option>`).join('');

        selectFiltro.innerHTML = '<option value="">Todos los doctores</option>' + opciones;
        selectFormulario.innerHTML = opciones;
    } catch (error) {
        document.getElementById('mensaje-agenda').innerHTML = `<div class="alerta alerta--error">Error al cargar doctores: ${error.message}</div>`;
    }
}

// -----------------------------------------------------------------
// VISTA DIA
// -----------------------------------------------------------------
async function cargarDia() {
    const contenedor = document.getElementById('agenda-dia-contenedor');
    const avisoDomingo = document.getElementById('aviso-domingo');
    avisoDomingo.classList.toggle('oculto', !esDomingo(fechaSeleccionada));

    const doctorId = document.getElementById('filtro-doctor-agenda').value;
    contenedor.innerHTML = '<p class="texto-secundario">Cargando citas...</p>';

    const parametros = new URLSearchParams({ desde: fechaSeleccionada, hasta: fechaSeleccionada });
    if (doctorId) parametros.set('doctor_id', doctorId);

    try {
        const citas = await api.get(`/api/citas?${parametros.toString()}`);
        renderizarVistaDia(citas);
    } catch (error) {
        contenedor.innerHTML = `<div class="alerta alerta--error">Error al cargar citas: ${error.message}</div>`;
    }
}

function renderizarVistaDia(citas) {
    const contenedor = document.getElementById('agenda-dia-contenedor');
    const horario = horarioDelDia(fechaSeleccionada);
    const inicioMin = minutosDesdeHHMM(horario.inicio);
    const finMin = minutosDesdeHHMM(horario.fin);
    const totalSlots = (finMin - inicioMin) / SLOT_MIN;
    const alturaTotal = totalSlots * ALTURA_SLOT_PX;

    const porSillon = { 1: [], 2: [] };
    const sinSillon = [];
    citas.forEach((c) => {
        if (SILLONES.includes(Number(c.sillon))) porSillon[Number(c.sillon)].push(c);
        else sinSillon.push(c);
    });

    let etiquetasHora = '';
    for (let m = inicioMin; m <= finMin; m += 60) {
        const top = ((m - inicioMin) / SLOT_MIN) * ALTURA_SLOT_PX;
        etiquetasHora += `<div class="agenda-dia__hora" style="top:${top}px;">${minutosAHHMM(m)}</div>`;
    }

    const gridBg = `repeating-linear-gradient(to bottom, var(--gris-claro) 0, var(--gris-claro) 1px, transparent 1px, transparent ${ALTURA_SLOT_PX * 4}px)`;

    contenedor.innerHTML = `
        <div class="agenda-dia__encabezado">
            <div class="agenda-dia__gutter-espaciador"></div>
            ${SILLONES.map((num) => `<div class="agenda-dia__columna-titulo">Sillón ${num}</div>`).join('')}
        </div>
        <div class="agenda-dia__cuerpo">
            <div class="agenda-dia__gutter" style="height:${alturaTotal}px;">${etiquetasHora}</div>
            ${SILLONES.map((num) => `
                <div class="agenda-dia__columna-envoltura">
                    <div class="agenda-dia__columna" data-sillon="${num}" style="height:${alturaTotal}px; background-image:${gridBg};"></div>
                </div>
            `).join('')}
        </div>
        ${sinSillon.length > 0 ? `
            <div class="agenda-dia__sin-sillon">
                <strong>Sin sillón asignado:</strong>
                ${sinSillon.map((c) => `<span class="cita-chip cita-chip--${c.estado}" onclick="abrirModalEdicion(${c.id})">${c.hora_inicio} · ${c.paciente_apellidos} ${c.paciente_nombres}</span>`).join('')}
            </div>
        ` : ''}
    `;

    SILLONES.forEach((num) => {
        const columna = contenedor.querySelector(`.agenda-dia__columna[data-sillon="${num}"]`);

        porSillon[num].forEach((c) => {
            columna.appendChild(crearBloqueCita(c, inicioMin));
        });

        columna.addEventListener('click', (evento) => {
            if (evento.target.closest('.cita-bloque')) return;
            const rect = columna.getBoundingClientRect();
            const offsetY = evento.clientY - rect.top + columna.parentElement.parentElement.scrollTop;
            let minutosOffset = Math.floor(offsetY / ALTURA_SLOT_PX) * SLOT_MIN;
            minutosOffset = Math.max(0, Math.min(minutosOffset, finMin - inicioMin - SLOT_MIN));
            const horaClick = minutosAHHMM(inicioMin + minutosOffset);
            abrirModalNuevaCita({ fecha: fechaSeleccionada, horaInicio: horaClick, sillon: num });
        });
    });
}

function crearBloqueCita(c, inicioMin) {
    const duracionMin = c.hora_fin
        ? minutosDesdeHHMM(c.hora_fin) - minutosDesdeHHMM(c.hora_inicio)
        : DURACION_DEFECTO_MIN;

    const top = ((minutosDesdeHHMM(c.hora_inicio) - inicioMin) / SLOT_MIN) * ALTURA_SLOT_PX;
    const alto = Math.max((duracionMin / SLOT_MIN) * ALTURA_SLOT_PX - 2, ALTURA_SLOT_PX - 2);

    const div = document.createElement('div');
    div.className = `cita-bloque cita-bloque--${c.estado}`;
    div.style.top = `${top}px`;
    div.style.height = `${alto}px`;
    div.title = `${c.hora_inicio} · ${c.paciente_apellidos} ${c.paciente_nombres} · ${c.doctor_nombre || 'Sin doctor'}${c.motivo ? ' · ' + c.motivo : ''} (${ETIQUETAS_ESTADO[c.estado]})`;
    div.innerHTML = `
        <div class="cita-bloque__hora">${c.hora_inicio}</div>
        <div class="cita-bloque__paciente">${c.paciente_apellidos} ${c.paciente_nombres}</div>
        <div class="cita-bloque__detalle">${c.doctor_nombre || 'Sin doctor'}${c.motivo ? ' · ' + c.motivo : ''}</div>
    `;
    div.addEventListener('click', (evento) => {
        evento.stopPropagation();
        abrirModalEdicion(c.id);
    });
    return div;
}

// -----------------------------------------------------------------
// VISTA SEMANA
// -----------------------------------------------------------------
async function cargarSemana() {
    const resumenDiv = document.getElementById('semana-resumen');
    const grillaDiv = document.getElementById('semana-grilla');
    resumenDiv.innerHTML = '<p class="texto-secundario mb-0">Cargando resumen semanal...</p>';
    grillaDiv.innerHTML = '';

    const lunes = inicioSemana(fechaSeleccionada);
    const domingo = sumarDias(lunes, 6);
    const doctorId = document.getElementById('filtro-doctor-agenda').value;

    const parametros = new URLSearchParams({ desde: lunes, hasta: domingo });
    if (doctorId) parametros.set('doctor_id', doctorId);

    try {
        const citas = await api.get(`/api/citas?${parametros.toString()}`);
        renderizarVistaSemana(lunes, domingo, citas);
    } catch (error) {
        resumenDiv.innerHTML = `<div class="alerta alerta--error">Error al cargar la semana: ${error.message}</div>`;
    }
}

function renderizarVistaSemana(lunes, domingo, citas) {
    const total = citas.length;
    const atendidas = citas.filter((c) => c.estado === 'atendida').length;
    const noShows = citas.filter((c) => c.estado === 'no_asistio').length;
    const pctAtendidas = total ? Math.round((atendidas / total) * 100) : 0;
    const pctNoShow = total ? Math.round((noShows / total) * 100) : 0;

    document.getElementById('semana-resumen').innerHTML = `
        <div class="semana-resumen__titulo">Semana del ${formatoFechaLarga(lunes)} al ${formatoFechaLarga(domingo)}</div>
        <div class="semana-resumen__stats">
            <div><span class="semana-resumen__valor">${total}</span><span class="semana-resumen__etiqueta">Citas totales</span></div>
            <div><span class="semana-resumen__valor">${pctAtendidas}%</span><span class="semana-resumen__etiqueta">Atendidas</span></div>
            <div><span class="semana-resumen__valor">${pctNoShow}%</span><span class="semana-resumen__etiqueta">No-shows</span></div>
        </div>
    `;

    const dias = [];
    for (let i = 0; i < 7; i++) dias.push(sumarDias(lunes, i));

    document.getElementById('semana-grilla').innerHTML = dias.map((fecha) => {
        const citasDelDia = citas.filter((c) => c.fecha === fecha);
        const conteoPorEstado = {};
        citasDelDia.forEach((c) => { conteoPorEstado[c.estado] = (conteoPorEstado[c.estado] || 0) + 1; });

        const esHoy = fecha === fechaHoyIso();
        const domingoDia = esDomingo(fecha);

        return `
            <div class="semana-dia ${domingoDia ? 'semana-dia--domingo' : ''} ${esHoy ? 'semana-dia--hoy' : ''}" onclick="irADia('${fecha}')">
                <div class="semana-dia__fecha">${formatoFechaLarga(fecha)}</div>
                <div class="semana-dia__total">${citasDelDia.length}</div>
                <div class="semana-dia__desglose">
                    ${Object.entries(conteoPorEstado).map(([estado, cantidad]) => `
                        <span class="semana-dia__punto semana-dia__punto--${estado}" title="${ETIQUETAS_ESTADO[estado]}">${cantidad}</span>
                    `).join('') || '<span class="texto-secundario">Sin citas</span>'}
                </div>
            </div>
        `;
    }).join('');
}

function irADia(fecha) {
    fechaSeleccionada = fecha;
    document.getElementById('campo-fecha-agenda').value = fecha;
    cambiarVista('dia');
}

// -----------------------------------------------------------------
// Modal crear / editar cita
// -----------------------------------------------------------------
function abrirModalNuevaCita(prefijo) {
    prefijo = prefijo || {};
    document.getElementById('titulo-modal-cita').textContent = 'Nueva cita';
    document.getElementById('form-cita').reset();
    document.getElementById('c-id').value = '';
    document.getElementById('error-modal-cita').innerHTML = '';
    eliminarBotonBorrar();

    if (prefijo.pacienteId) {
        document.getElementById('c-paciente-id').value = prefijo.pacienteId;
        document.getElementById('c-buscar-paciente').value = '';
        document.getElementById('paciente-seleccionado-texto').textContent = `Paciente seleccionado: ${prefijo.pacienteNombre || ''}`;
        pacienteSeleccionado = { id: prefijo.pacienteId };
        actualizarAlertaMedicaModal(prefijo.pacienteId);
    } else {
        document.getElementById('c-paciente-id').value = '';
        document.getElementById('c-buscar-paciente').value = '';
        document.getElementById('paciente-seleccionado-texto').textContent = '';
        pacienteSeleccionado = null;
        actualizarAlertaMedicaModal(null);
    }
    document.getElementById('resultados-paciente').classList.add('oculto');

    document.getElementById('c-fecha').value = prefijo.fecha || fechaSeleccionada;
    sincronizarFechaLegible('c-fecha', 'c-fecha-legible');
    document.getElementById('c-hora-inicio').value = prefijo.horaInicio || '';
    document.getElementById('c-sillon').value = prefijo.sillon || 1;
    document.getElementById('c-duracion').value = '30';
    document.getElementById('c-estado').value = 'pendiente';

    document.getElementById('modal-cita').classList.add('abierto');
}

async function abrirModalEdicion(citaId) {
    document.getElementById('error-modal-cita').innerHTML = '';
    try {
        const cita = await api.get(`/api/citas/${citaId}`);

        document.getElementById('titulo-modal-cita').textContent = 'Editar cita';
        document.getElementById('c-id').value = cita.id;
        document.getElementById('c-paciente-id').value = cita.paciente_id;
        document.getElementById('c-buscar-paciente').value = '';
        document.getElementById('paciente-seleccionado-texto').textContent =
            `Paciente seleccionado: ${cita.paciente_apellidos} ${cita.paciente_nombres}`;
        document.getElementById('resultados-paciente').classList.add('oculto');
        actualizarAlertaMedicaModal(cita.paciente_id);
        document.getElementById('c-doctor').value = cita.doctor_id || '';

        const selectSillon = document.getElementById('c-sillon');
        if (cita.sillon && !SILLONES.includes(Number(cita.sillon))) {
            selectSillon.insertAdjacentHTML('beforeend', `<option value="${cita.sillon}">Sillón ${cita.sillon} (legado)</option>`);
        }
        selectSillon.value = cita.sillon || 1;

        document.getElementById('c-fecha').value = cita.fecha;
        sincronizarFechaLegible('c-fecha', 'c-fecha-legible');
        document.getElementById('c-hora-inicio').value = cita.hora_inicio;

        const duracionMin = cita.hora_fin
            ? minutosDesdeHHMM(cita.hora_fin) - minutosDesdeHHMM(cita.hora_inicio)
            : DURACION_DEFECTO_MIN;
        const selectDuracion = document.getElementById('c-duracion');
        if (![...selectDuracion.options].some((o) => Number(o.value) === duracionMin)) {
            selectDuracion.insertAdjacentHTML('beforeend', `<option value="${duracionMin}">${duracionMin} min</option>`);
        }
        selectDuracion.value = duracionMin;

        document.getElementById('c-motivo').value = cita.motivo || '';
        document.getElementById('c-notas').value = cita.notas || '';
        document.getElementById('c-estado').value = cita.estado;

        agregarBotonBorrar(cita.id);

        document.getElementById('modal-cita').classList.add('abierto');
    } catch (error) {
        document.getElementById('mensaje-agenda').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

function agregarBotonBorrar(citaId) {
    eliminarBotonBorrar();
    if (usuarioSesion.rol !== 'admin') return;
    const acciones = document.querySelector('#form-cita .flex-entre');
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.id = 'btn-eliminar-cita-modal';
    boton.className = 'btn btn-peligro';
    boton.textContent = 'Eliminar cita';
    boton.addEventListener('click', () => eliminarCita(citaId));
    acciones.insertBefore(boton, acciones.firstChild);
}

function eliminarBotonBorrar() {
    const existente = document.getElementById('btn-eliminar-cita-modal');
    if (existente) existente.remove();
}

function cerrarModalCita() {
    document.getElementById('modal-cita').classList.remove('abierto');
}

async function guardarCita(evento, forzar) {
    if (evento) evento.preventDefault();
    const errorDiv = document.getElementById('error-modal-cita');
    errorDiv.innerHTML = '';

    const pacienteId = document.getElementById('c-paciente-id').value;
    if (!pacienteId) {
        errorDiv.innerHTML = '<div class="alerta alerta--error">Seleccione un paciente de la lista</div>';
        return;
    }

    const horaInicio = document.getElementById('c-hora-inicio').value;
    const duracion = Number(document.getElementById('c-duracion').value);

    const datos = {
        paciente_id: Number(pacienteId),
        doctor_id: Number(document.getElementById('c-doctor').value),
        sillon: Number(document.getElementById('c-sillon').value) || null,
        fecha: document.getElementById('c-fecha').value,
        hora_inicio: horaInicio,
        hora_fin: horaInicio ? sumarMinutos(horaInicio, duracion) : null,
        motivo: document.getElementById('c-motivo').value.trim() || null,
        notas: document.getElementById('c-notas').value.trim() || null,
        estado: document.getElementById('c-estado').value
    };
    if (forzar) datos.forzar = true;

    const id = document.getElementById('c-id').value;

    try {
        if (id) {
            await api.put(`/api/citas/${id}`, datos);
        } else {
            await api.post('/api/citas', datos);
        }
        cerrarModalCita();
        await cargarVistaActual();
        await actualizarIndicadorSync();
    } catch (error) {
        if (error.data && error.data.advertencia && error.data.puedeForzar) {
            if (confirm(`${error.message}\n\n¿Continuar de todas formas?`)) {
                return guardarCita(null, true);
            }
            return;
        }
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

async function eliminarCita(citaId) {
    if (!confirm('¿Eliminar esta cita? Tambien se eliminara el evento de Google Calendar si existe.')) return;
    try {
        await api.del(`/api/citas/${citaId}`);
        cerrarModalCita();
        await cargarVistaActual();
        await actualizarIndicadorSync();
    } catch (error) {
        document.getElementById('mensaje-agenda').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

// -----------------------------------------------------------------
// Buscador de pacientes (en vivo)
// -----------------------------------------------------------------
function buscarPacientesEnVivo() {
    clearTimeout(temporizadorBusquedaPaciente);
    const texto = document.getElementById('c-buscar-paciente').value.trim();
    const resultadosDiv = document.getElementById('resultados-paciente');

    if (!texto) {
        resultadosDiv.classList.add('oculto');
        return;
    }

    temporizadorBusquedaPaciente = setTimeout(async () => {
        try {
            const pacientes = await api.get(`/api/pacientes?q=${encodeURIComponent(texto)}`);

            if (pacientes.length === 0) {
                resultadosDiv.innerHTML = '<div class="texto-secundario">Sin resultados</div>';
            } else {
                resultadosDiv.innerHTML = pacientes.slice(0, 8).map((p) => `
                    <div onclick="seleccionarPaciente(${p.id}, '${escaparComillas(p.apellidos)} ${escaparComillas(p.nombres)}')">
                        ${p.apellidos} ${p.nombres} <span class="texto-secundario">(${p.numero_historia})</span>
                    </div>
                `).join('');
            }
            resultadosDiv.classList.remove('oculto');
        } catch (error) {
            resultadosDiv.classList.add('oculto');
        }
    }, 250);
}

function escaparComillas(texto) {
    return (texto || '').replace(/'/g, "\\'");
}

function seleccionarPaciente(id, nombreCompleto) {
    document.getElementById('c-paciente-id').value = id;
    document.getElementById('paciente-seleccionado-texto').textContent = `Paciente seleccionado: ${nombreCompleto}`;
    document.getElementById('c-buscar-paciente').value = '';
    document.getElementById('resultados-paciente').classList.add('oculto');
    actualizarAlertaMedicaModal(id);
}

// -----------------------------------------------------------------
// Alerta medica del paciente seleccionado (antecedentes de riesgo del F033)
// -----------------------------------------------------------------
async function actualizarAlertaMedicaModal(pacienteId) {
    const banner = document.getElementById('banner-alerta-medica-modal');
    if (!pacienteId) {
        banner.classList.add('oculto');
        return;
    }
    try {
        const alertas = await api.get(`/api/ficha-clinica/${pacienteId}/alertas`);
        if (alertas.tieneAlertas) {
            document.getElementById('banner-alerta-medica-modal-texto').textContent = alertas.etiquetas.join(' · ').toUpperCase();
            banner.classList.remove('oculto');
        } else {
            banner.classList.add('oculto');
        }
    } catch (error) {
        banner.classList.add('oculto');
    }
}

// -----------------------------------------------------------------
// Indicador de sincronizacion
// -----------------------------------------------------------------
async function actualizarIndicadorSync() {
    const indicador = document.getElementById('sync-indicador');
    const texto = document.getElementById('sync-indicador-texto');

    try {
        const estado = await api.get('/api/sync/estado');

        indicador.classList.remove('sync-indicador--pendiente', 'sync-indicador--error');

        if (estado.pendientes === 0) {
            texto.textContent = 'Google Calendar al día';
        } else {
            texto.textContent = `${estado.pendientes} pendiente${estado.pendientes === 1 ? '' : 's'}`;
            indicador.classList.add(estado.ultimoResultado === 'con_errores' ? 'sync-indicador--error' : 'sync-indicador--pendiente');
        }

        if (usuarioSesion.rol === 'admin') {
            actualizarPanelAdmin(estado);
        }
    } catch (error) {
        texto.textContent = 'Estado no disponible';
    }
}

function actualizarPanelAdmin(estado) {
    const resumen = document.getElementById('sync-panel-resumen');
    const erroresDiv = document.getElementById('sync-panel-errores');

    const ultimaEjecucionTexto = estado.ultimaEjecucion
        ? `Ultima ejecucion: ${estado.ultimaEjecucion} (${estado.ultimoResultado || 'sin datos'})`
        : 'Aun no se ha ejecutado la sincronizacion';

    const credencialesTexto = estado.credencialesConfiguradas
        ? ''
        : ' &middot; <strong>No se encontro google-credentials.json</strong>';

    resumen.innerHTML = `${ultimaEjecucionTexto} &middot; ${estado.pendientes} pendiente(s) en cola${credencialesTexto}`;

    if (!estado.erroresRecientes || estado.erroresRecientes.length === 0) {
        erroresDiv.innerHTML = '<p class="texto-secundario mb-0">Sin errores recientes.</p>';
        return;
    }

    erroresDiv.innerHTML = estado.erroresRecientes.map((e) => `
        <div class="sync-panel__error">
            <time>${e.fecha}${e.cita_id ? ` &middot; Cita #${e.cita_id}` : ''}</time>
            ${e.mensaje}
        </div>
    `).join('');
}

async function sincronizarAhora() {
    const boton = document.getElementById('btn-sincronizar-ahora');
    boton.disabled = true;
    boton.textContent = 'Sincronizando...';

    try {
        await api.post('/api/sync/ejecutar');
        await cargarVistaActual();
        await actualizarIndicadorSync();
    } catch (error) {
        document.getElementById('mensaje-agenda').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    } finally {
        boton.disabled = false;
        boton.textContent = 'Sincronizar ahora';
    }
}
