// =====================================================================
// Logica del panel principal (dashboard)
// =====================================================================

const ETIQUETAS_ESTADO_DASH = {
    pendiente: 'Agendada',
    confirmada: 'Confirmada',
    atendida: 'Atendida',
    no_asistio: 'No asistió',
    cancelada: 'Cancelada'
};

const CLASE_ESTADO_DASH = {
    pendiente: '',
    confirmada: 'insignia--dorado',
    atendida: 'insignia--verde',
    no_asistio: 'insignia--rojo',
    cancelada: ''
};

let citasHoyActuales = [];
let menuEstadoFlotante = null;

(async () => {
    const usuario = await inicializarSidebar();
    if (!usuario) return;

    await cargarResumenDashboard();

    document.getElementById('lista-citas-hoy').addEventListener('click', manejarClicCitasHoy);
    document.addEventListener('click', cerrarMenuEstado);
    window.addEventListener('scroll', cerrarMenuEstado, true);
    window.addEventListener('resize', cerrarMenuEstado);
})();

async function cargarResumenDashboard() {
    try {
        const resumen = await api.get('/api/dashboard/resumen');

        document.getElementById('valor-total-activos').textContent = resumen.totalActivos;
        document.getElementById('valor-nuevos-mes').textContent = resumen.nuevosMes;
        document.getElementById('valor-citas-hoy').textContent = resumen.citasHoy.length;
        document.getElementById('valor-noshows-mes').textContent = resumen.noShowsMes;
        document.getElementById('fecha-hoy-dashboard').textContent = formatearFechaConDia(new Date().toISOString().slice(0, 10));
        dibujarIndicadoresFinancieros(resumen.finanzas);
        dibujarIndicadoresLaboratorio(resumen.laboratorio);

        dibujarGraficoOrigen(resumen.distribucionOrigen);
        dibujarCitasHoy(resumen.citasHoy);
    } catch (error) {
        console.error('Error al cargar el resumen del panel:', error);
    }
}

// Fase 4C: trabajos en laboratorio y deuda con los laboratorios. La
// deuda es un EGRESO de la clinica, no se mezcla con los ingresos.
function dibujarIndicadoresLaboratorio(laboratorio) {
    if (!laboratorio) return;

    document.getElementById('valor-en-laboratorio-dash').textContent = laboratorio.en_laboratorio;
    document.getElementById('nota-en-laboratorio-dash').textContent = laboratorio.atrasados > 0
        ? `${laboratorio.atrasados} atrasado(s) · ver bandeja →`
        : 'Trabajos enviados, pendientes de recibir';

    document.getElementById('valor-deuda-laboratorios').textContent = '$' + Number(laboratorio.por_pagar_total || 0).toFixed(2);
    document.getElementById('nota-deuda-laboratorios').textContent =
        `${laboratorio.por_pagar_cantidad} trabajo(s) sin pagar · ver cuentas →`;
}

function dibujarCitasHoy(citas) {
    citasHoyActuales = citas || [];
    const contenedor = document.getElementById('lista-citas-hoy');

    if (citasHoyActuales.length === 0) {
        contenedor.innerHTML = '<p class="texto-secundario mb-0">No hay citas programadas para hoy.</p>';
        return;
    }

    contenedor.innerHTML = `
        <div class="tabla-envoltorio">
            <table>
                <thead>
                    <tr><th>Hora</th><th>Paciente</th><th>Doctor</th><th>Sillón</th><th>Estado</th></tr>
                </thead>
                <tbody>
                    ${citasHoyActuales.map((c) => `
                        <tr>
                            <td>${c.hora_inicio}${c.hora_fin ? ' - ' + c.hora_fin : ''}</td>
                            <td><a href="/paciente.html?id=${c.paciente_id}">${c.paciente_apellidos} ${c.paciente_nombres}</a></td>
                            <td>${c.doctor_nombre || 'Sin doctor'}</td>
                            <td>${c.sillon ? 'Sillón ' + c.sillon : '-'}</td>
                            <td>
                                <button type="button" class="insignia insignia--boton ${CLASE_ESTADO_DASH[c.estado] || ''}" data-cita-id="${c.id}">
                                    ${ETIQUETAS_ESTADO_DASH[c.estado] || c.estado} <span class="estado-selector__flecha">&#9662;</span>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// -----------------------------------------------------------------
// Cambio de estado rapido desde el panel (misma API que la Agenda,
// por lo que dispara la sincronizacion con Google Calendar igual).
// El menu se ancla al <body> con position:fixed para no quedar
// recortado por el overflow-x:auto de la tabla.
// -----------------------------------------------------------------
function manejarClicCitasHoy(evento) {
    const boton = evento.target.closest('button[data-cita-id]');
    if (!boton) return;
    evento.stopPropagation();

    const citaId = Number(boton.dataset.citaId);
    const cita = citasHoyActuales.find((c) => c.id === citaId);
    if (!cita) return;

    abrirMenuEstado(boton, cita);
}

function obtenerMenuFlotante() {
    if (menuEstadoFlotante) return menuEstadoFlotante;

    menuEstadoFlotante = document.createElement('div');
    menuEstadoFlotante.className = 'estado-menu oculto';
    document.body.appendChild(menuEstadoFlotante);

    menuEstadoFlotante.addEventListener('click', (evento) => {
        const opcion = evento.target.closest('.estado-menu__opcion');
        if (!opcion) return;
        evento.stopPropagation();

        const citaId = Number(menuEstadoFlotante.dataset.citaId);
        const nuevoEstado = opcion.dataset.valor;
        cerrarMenuEstado();

        if (!opcion.classList.contains('estado-menu__opcion--activa')) {
            cambiarEstadoCitaHoy(citaId, nuevoEstado);
        }
    });

    return menuEstadoFlotante;
}

function abrirMenuEstado(boton, cita) {
    const menu = obtenerMenuFlotante();
    const mismaCitaYaAbierta = !menu.classList.contains('oculto') && Number(menu.dataset.citaId) === cita.id;
    cerrarMenuEstado();
    if (mismaCitaYaAbierta) return;

    menu.dataset.citaId = cita.id;
    menu.innerHTML = Object.entries(ETIQUETAS_ESTADO_DASH).map(([valor, etiqueta]) => `
        <button type="button" class="estado-menu__opcion ${valor === cita.estado ? 'estado-menu__opcion--activa' : ''}" data-valor="${valor}">${etiqueta}</button>
    `).join('');

    const rect = boton.getBoundingClientRect();
    menu.classList.remove('oculto');
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left}px`;

    // Si se sale de la ventana por abajo, abrir hacia arriba
    const alturaMenu = menu.getBoundingClientRect().height;
    if (rect.bottom + 4 + alturaMenu > window.innerHeight) {
        menu.style.top = `${rect.top - alturaMenu - 4}px`;
    }
}

function cerrarMenuEstado() {
    if (menuEstadoFlotante) menuEstadoFlotante.classList.add('oculto');
}

async function cambiarEstadoCitaHoy(citaId, nuevoEstado) {
    const mensajeDiv = document.getElementById('mensaje-dashboard');
    mensajeDiv.innerHTML = '';
    try {
        const cita = await api.get(`/api/citas/${citaId}`);
        await api.put(`/api/citas/${citaId}`, {
            paciente_id: cita.paciente_id,
            doctor_id: cita.doctor_id,
            sillon: cita.sillon,
            fecha: cita.fecha,
            hora_inicio: cita.hora_inicio,
            hora_fin: cita.hora_fin,
            motivo: cita.motivo,
            notas: cita.notas,
            estado: nuevoEstado
        });
        await cargarResumenDashboard();
    } catch (error) {
        mensajeDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

// -----------------------------------------------------------------
// Tarjetas financieras (Fase 4B): saldos pendientes, ingresos del mes
// y cuotas vencidas. Solo cuentan pagos validos (no anulados).
// -----------------------------------------------------------------
function dibujarIndicadoresFinancieros(finanzas) {
    if (!finanzas) return;
    const dinero = (v) => '$' + Number(v || 0).toFixed(2);
    const plural = (n, singular, pluralTxt) => `${n} ${n === 1 ? singular : pluralTxt}`;

    document.getElementById('valor-saldos-pendientes').textContent = dinero(finanzas.saldos_pendientes.total);
    document.getElementById('nota-saldos-pendientes').textContent =
        finanzas.saldos_pendientes.pacientes === 0
            ? 'Ningún paciente con saldo pendiente'
            : `${plural(finanzas.saldos_pendientes.pacientes, 'paciente', 'pacientes')} con saldo pendiente`;

    document.getElementById('valor-ingresos-mes').textContent = dinero(finanzas.ingresos_mes.total);
    document.getElementById('nota-ingresos-mes').textContent =
        `${plural(finanzas.ingresos_mes.cantidad, 'pago válido', 'pagos válidos')} en el mes en curso`;

    document.getElementById('valor-cuotas-vencidas').textContent = dinero(finanzas.cuotas_vencidas.monto);
    document.getElementById('nota-cuotas-vencidas').innerHTML =
        finanzas.cuotas_vencidas.cuotas === 0
            ? 'Sin cuotas vencidas'
            : `${plural(finanzas.cuotas_vencidas.cuotas, 'cuota vencida', 'cuotas vencidas')} · ${plural(finanzas.cuotas_vencidas.pacientes, 'paciente', 'pacientes')} &rarr;`;
}

function dibujarGraficoOrigen(datos) {
    const contenedor = document.getElementById('grafico-origen');

    if (!datos || datos.length === 0) {
        contenedor.innerHTML = '<p class="texto-secundario">Aun no hay datos suficientes.</p>';
        return;
    }

    const maximo = Math.max(...datos.map((d) => d.total), 1);

    contenedor.innerHTML = datos.map((d) => {
        const alturaPorcentaje = Math.round((d.total / maximo) * 100);
        return `
            <div class="grafico-barras__columna">
                <div class="grafico-barras__valor">${d.total}</div>
                <div class="grafico-barras__barra" style="height: ${alturaPorcentaje}%;"></div>
                <div class="grafico-barras__etiqueta">${d.origen}</div>
            </div>
        `;
    }).join('');
}
