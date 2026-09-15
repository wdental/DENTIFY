// =====================================================================
// Trabajos enviados a laboratorio (Fase 4C). Pantalla de uso diario:
// bandeja de trabajos, cuentas por pagar y catalogo de laboratorios.
//
// El costo del laboratorio es un EGRESO interno: no genera recibo ni
// entra en Caja (que son los ingresos de los pacientes). Ver
// routes/laboratorio.js y docs/fase-4c.md.
// =====================================================================

let usuarioLaboratorio = null;
let laboratoriosCache = [];
let doctoresCache = [];
let trabajosActuales = [];
let cuentasActuales = { grupos: [], total_general: 0 };
let seleccionCuentas = new Set();
let documentosPacienteCache = [];
let documentosSeleccionados = new Set();
let temporizadorBusquedaPacienteLab = null;
let temporizadorBusquedaTrabajo = null;
let accionMotivoPendiente = null;

const ETIQUETAS_METODO_LAB = {
    efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', otro: 'Otro'
};

const ETIQUETAS_MOTIVO_ENVIO = {
    inicial: 'Envío inicial', prueba: 'Prueba en boca', ajuste: 'Ajuste',
    reparacion: 'Reparación', otro: 'Otro'
};

(async () => {
    usuarioLaboratorio = await inicializarSidebar();
    if (!usuarioLaboratorio) return;

    if (tienePermiso(usuarioLaboratorio, 'catalogos.laboratorios')) {
        document.getElementById('pestana-laboratorios').classList.remove('oculto');
    }

    document.querySelectorAll('.pestana').forEach((boton) => {
        boton.addEventListener('click', () => {
            document.querySelectorAll('.pestana').forEach((b) => b.classList.toggle('activa', b === boton));
            document.querySelectorAll('.panel-pestana').forEach((p) => p.classList.toggle('activo', p.id === boton.dataset.panel));
        });
    });

    document.getElementById('btn-nuevo-trabajo').addEventListener('click', () => abrirModalTrabajo(null));
    if (!tienePermiso(usuarioLaboratorio, 'laboratorio.gestionar')) {
        document.getElementById('btn-nuevo-trabajo').classList.add('oculto');
    }
    document.getElementById('cerrar-modal-trabajo').addEventListener('click', cerrarModalTrabajo);
    document.getElementById('cancelar-modal-trabajo').addEventListener('click', cerrarModalTrabajo);
    document.getElementById('form-trabajo').addEventListener('submit', guardarTrabajo);
    document.getElementById('tl-buscar-paciente').addEventListener('input', buscarPacientesLaboratorio);
    ['tl-cantidad', 'tl-costo-unitario'].forEach((id) => {
        document.getElementById(id).addEventListener('input', actualizarTotalTrabajo);
    });

    document.getElementById('cerrar-modal-abonos').addEventListener('click', () => cerrarModal('modal-abonos'));
    document.getElementById('cerrar-modal-abonos-pie').addEventListener('click', () => cerrarModal('modal-abonos'));
    document.getElementById('cerrar-modal-estado').addEventListener('click', cerrarModalEstado);
    document.getElementById('cancelar-modal-estado').addEventListener('click', cerrarModalEstado);
    document.getElementById('form-estado-trabajo').addEventListener('submit', confirmarCambioEstado);

    document.getElementById('cerrar-modal-reenvio').addEventListener('click', () => cerrarModal('modal-reenvio'));
    document.getElementById('cancelar-modal-reenvio').addEventListener('click', () => cerrarModal('modal-reenvio'));
    document.getElementById('form-reenvio').addEventListener('submit', guardarReenvio);

    document.getElementById('cerrar-modal-pago-lab').addEventListener('click', () => cerrarModal('modal-pago-laboratorio'));
    document.getElementById('cancelar-modal-pago-lab').addEventListener('click', () => cerrarModal('modal-pago-laboratorio'));
    document.getElementById('form-pago-laboratorio').addEventListener('submit', guardarPagoLaboratorio);
    document.getElementById('btn-marcar-pagados').addEventListener('click', abrirModalPagoLaboratorio);

    document.getElementById('btn-nuevo-laboratorio').addEventListener('click', () => abrirModalLaboratorio(null));
    document.getElementById('cerrar-modal-laboratorio').addEventListener('click', () => cerrarModal('modal-laboratorio'));
    document.getElementById('cancelar-modal-laboratorio').addEventListener('click', () => cerrarModal('modal-laboratorio'));
    document.getElementById('form-laboratorio').addEventListener('submit', guardarLaboratorio);

    document.getElementById('cancelar-modal-motivo-lab').addEventListener('click', () => cerrarModal('modal-motivo-lab'));
    document.getElementById('confirmar-modal-motivo-lab').addEventListener('click', confirmarMotivo);

    document.getElementById('filtro-estado-trabajo').addEventListener('change', cargarTrabajos);
    document.getElementById('filtro-laboratorio-trabajo').addEventListener('change', cargarTrabajos);
    document.getElementById('filtro-busqueda-trabajo').addEventListener('input', () => {
        clearTimeout(temporizadorBusquedaTrabajo);
        temporizadorBusquedaTrabajo = setTimeout(cargarTrabajos, 300);
    });

    const campoMes = document.getElementById('filtro-mes-pagos-lab');
    campoMes.value = fechaHoyIso().slice(0, 7);
    campoMes.addEventListener('change', cargarPagosRealizados);

    ['tl-fecha-envio', 'tl-fecha-estimada', 'te-fecha', 'te-fecha-estimada', 'tr-fecha-envio', 'tr-fecha-estimada', 'pl-fecha']
        .forEach((id) => vincularFechaLegible(id, id + '-legible'));

    await cargarCatalogos();

    // Se abre el modal en cuanto estan los catalogos que necesita (no se
    // espera a las listas: quien llega desde la ficha viene a registrar un
    // trabajo, no a mirar la bandeja).
    manejarLlegadaDesdeFicha();

    await Promise.all([cargarResumen(), cargarTrabajos(), cargarCuentas(), cargarPagosRealizados(), cargarLaboratorios()]);
})();

// Si se llega desde la pestaña Laboratorio de la ficha con
// ?paciente_id=X&nuevo=1, abre el modal con el paciente ya fijado (mismo
// patron que "Nueva cita" desde la ficha hacia la agenda).
function manejarLlegadaDesdeFicha() {
    const parametros = new URLSearchParams(window.location.search);
    if (parametros.get('nuevo') !== '1' || !parametros.get('paciente_id')) return;

    abrirModalTrabajo(null, {
        pacienteId: Number(parametros.get('paciente_id')),
        pacienteNombre: parametros.get('paciente_nombre') || 'Paciente seleccionado'
    });
    window.history.replaceState({}, '', '/laboratorio.html');
}

// -----------------------------------------------------------------
// Utilidades
// -----------------------------------------------------------------
function escaparLab(texto) {
    return String(texto == null ? '' : texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dineroLab(valor) {
    return '$' + Number(valor || 0).toFixed(2);
}

function cerrarModal(id) {
    document.getElementById(id).classList.remove('abierto');
}

function mostrarMensajeLab(texto, tipo) {
    const div = document.getElementById('mensaje-laboratorio');
    div.innerHTML = `<div class="alerta alerta--${tipo || 'exito'}">${escaparLab(texto)}</div>`;
    setTimeout(() => { div.innerHTML = ''; }, 5000);
}

async function cargarCatalogos() {
    try {
        [laboratoriosCache, doctoresCache] = await Promise.all([
            api.get('/api/laboratorio/laboratorios'),
            api.get('/api/doctores')
        ]);
    } catch (error) {
        laboratoriosCache = [];
        doctoresCache = [];
    }

    const activos = laboratoriosCache.filter((l) => l.activo);
    document.getElementById('tl-laboratorio').innerHTML = '<option value="">Seleccione...</option>' +
        activos.map((l) => `<option value="${l.id}">${escaparLab(l.nombre)}</option>`).join('');
    document.getElementById('filtro-laboratorio-trabajo').innerHTML = '<option value="">Todos</option>' +
        laboratoriosCache.map((l) => `<option value="${l.id}">${escaparLab(l.nombre)}</option>`).join('');
    document.getElementById('tl-doctor').innerHTML = '<option value="">Sin especificar</option>' +
        doctoresCache.map((d) => `<option value="${d.id}">${escaparLab(d.nombre_completo)}</option>`).join('');

    try {
        const tipos = await api.get('/api/laboratorio/tipos-sugeridos');
        document.getElementById('tl-tipos-sugeridos').innerHTML = tipos.map((t) => `<option value="${escaparLab(t)}">`).join('');
    } catch (error) { /* el campo sigue siendo texto libre */ }
}

async function cargarResumen() {
    try {
        const resumen = await api.get('/api/laboratorio/resumen');
        document.getElementById('valor-en-laboratorio').textContent = resumen.en_laboratorio;
        document.getElementById('valor-atrasados').textContent = resumen.atrasados;
        document.getElementById('valor-por-pagar').textContent = dineroLab(resumen.por_pagar_total);
        document.getElementById('nota-por-pagar').textContent =
            `${resumen.por_pagar_cantidad} trabajo(s) · ${resumen.laboratorios_con_deuda} laboratorio(s)`;
    } catch (error) { /* las tarjetas quedan en "-" */ }
}

// -----------------------------------------------------------------
// Bandeja de trabajos
// -----------------------------------------------------------------
async function cargarTrabajos() {
    const contenedor = document.getElementById('lista-trabajos');
    const estado = document.getElementById('filtro-estado-trabajo').value;
    const laboratorio = document.getElementById('filtro-laboratorio-trabajo').value;
    const busqueda = document.getElementById('filtro-busqueda-trabajo').value.trim();

    const parametros = [];
    if (estado === 'vivos') parametros.push('vivos=1');
    else if (estado) parametros.push('estado=' + estado);
    if (laboratorio) parametros.push('laboratorio_id=' + laboratorio);
    if (busqueda) parametros.push('busqueda=' + encodeURIComponent(busqueda));

    try {
        trabajosActuales = await api.get('/api/laboratorio/trabajos?' + parametros.join('&'));
        contenedor.innerHTML = trabajosActuales.length === 0
            ? '<p class="texto-secundario">No hay trabajos que coincidan con el filtro.</p>'
            : `<div class="tabla-envoltorio"><table>
                    <thead><tr>
                        <th>N° orden</th><th>Paciente</th><th>Trabajo</th><th>Laboratorio</th>
                        <th>Estado</th><th>Fechas</th><th>Costo</th><th></th>
                    </tr></thead>
                    <tbody>${trabajosActuales.map(filaTrabajo).join('')}</tbody>
               </table></div>`;
    } catch (error) {
        contenedor.innerHTML = `<p class="texto-secundario">Error al cargar: ${escaparLab(error.message)}</p>`;
    }
}

function insigniaEstado(t) {
    const clase = t.estado === 'instalado' ? 'insignia--verde'
        : t.estado === 'cancelado' ? 'insignia--rojo'
        : t.atrasado || t.cita_en_riesgo ? 'insignia--rojo' : 'insignia--dorado';
    return `<span class="insignia ${clase}">${escaparLab(t.estado_etiqueta)}</span>`;
}

function filaTrabajo(t) {
    const alerta = t.atrasado
        ? '<div class="trabajo-alerta">Atrasado: pasó la fecha prometida</div>'
        : t.cita_en_riesgo
            ? `<div class="trabajo-alerta">Cita de instalación el ${formatearFecha(t.cita_fecha)} y no ha llegado</div>`
            : '';

    const fechas = [
        t.fecha_envio ? `Envío: ${formatearFecha(t.fecha_envio)}` : null,
        t.fecha_estimada ? `Prometido: ${formatearFecha(t.fecha_estimada)}` : null,
        t.fecha_recepcion ? `Recibido: ${formatearFecha(t.fecha_recepcion)}` : null,
        t.fecha_instalacion ? `Instalado: ${formatearFecha(t.fecha_instalacion)}` : null
    ].filter(Boolean).join('<br>') || '<span class="texto-secundario">—</span>';

    const pago = insigniaPago(t);

    return `
        <tr class="${t.estado === 'cancelado' ? 'fila-anulada' : ''}">
            <td><strong>${escaparLab(t.numero_orden)}</strong>
                ${t.total_envios > 1 ? `<div class="dinero-detalle">${t.total_envios} envíos · último: ${escaparLab(t.motivo_envio_actual_etiqueta || '')}</div>` : ''}</td>
            <td><a href="/paciente.html?id=${t.paciente_id}">${escaparLab(t.paciente_apellidos)} ${escaparLab(t.paciente_nombres)}</a>
                <div class="texto-secundario">${escaparLab(t.paciente_historia || '')}</div></td>
            <td>${escaparLab(t.tipo_trabajo)}
                ${t.piezas ? `<div class="texto-secundario">Piezas: ${escaparLab(t.piezas)}</div>` : ''}
                ${t.color ? `<div class="texto-secundario">Color: ${escaparLab(t.color)}</div>` : ''}</td>
            <td>${escaparLab(t.laboratorio_nombre)}</td>
            <td>${insigniaEstado(t)}${alerta}</td>
            <td class="texto-secundario">${fechas}</td>
            <td>
                ${Number(t.costo) > 0 ? `<strong>${dineroLab(t.costo)}</strong>` : '<span class="texto-secundario">—</span>'}
                ${t.cantidad > 1 ? `<div class="dinero-detalle">${t.cantidad} × ${dineroLab(t.costo_unitario)}</div>` : ''}
                ${t.abonado > 0 ? `<div class="dinero-detalle">abonado ${dineroLab(t.abonado)} · saldo ${dineroLab(t.saldo)}</div>` : ''}
                <div>${pago}</div>
            </td>
            <td class="celda-acciones">${accionesTrabajo(t)}</td>
        </tr>
    `;
}

function insigniaPago(t) {
    if (t.estado === 'cancelado' || Number(t.costo) <= 0) return '';
    if (t.estado_pago === 'pagado') return '<span class="insignia insignia--verde">Pagado</span>';
    if (t.estado_pago === 'parcial') return '<span class="insignia insignia--dorado">Abonado en parte</span>';
    return '<span class="insignia insignia--dorado">Por pagar</span>';
}

function accionesTrabajo(t) {
    const acciones = [];
    const puedeGestionar = tienePermiso(usuarioLaboratorio, 'laboratorio.gestionar');
    acciones.push(`<button type="button" class="btn-texto" onclick="imprimirOrden(${t.id})">Imprimir orden</button>`);

    if (puedeGestionar) {
        if (t.estado === 'por_enviar') acciones.push(`<button type="button" class="btn-texto" onclick="abrirModalEstado(${t.id}, 'enviado')">Enviar</button>`);
        if (t.estado === 'enviado') acciones.push(`<button type="button" class="btn-texto" onclick="abrirModalEstado(${t.id}, 'recibido')">Recibir</button>`);
        if (t.estado === 'recibido') {
            acciones.push(`<button type="button" class="btn-texto" onclick="abrirModalEstado(${t.id}, 'instalado')">Entregar al paciente</button>`);
        }
        // Un trabajo ya entregado puede volver al laboratorio por una
        // reparacion: sigue siendo la misma orden.
        if (t.estado === 'recibido' || t.estado === 'instalado') {
            acciones.push(`<button type="button" class="btn-texto" onclick="abrirModalReenvio(${t.id})">Reenviar</button>`);
        }
        if (t.estado !== 'cancelado') acciones.push(`<button type="button" class="btn-texto" onclick="abrirModalTrabajo(${t.id})">Editar</button>`);
    }
    acciones.push(`<button type="button" class="btn-texto" onclick="abrirModalAbonos(${t.id})">Ver detalle</button>`);
    if (tienePermiso(usuarioLaboratorio, 'laboratorio.cancelar') && t.estado !== 'cancelado' && t.abonado === 0) {
        acciones.push(`<button type="button" class="btn-texto" style="color:var(--rojo-alerta);" onclick="pedirMotivo('cancelar', ${t.id})">Cancelar</button>`);
    }
    return acciones.join(' ');
}

function imprimirOrden(id) {
    window.open(`/imprimir-orden-laboratorio.html?id=${id}`, '_blank');
}

// -----------------------------------------------------------------
// Modal de trabajo (alta y edicion)
// -----------------------------------------------------------------
async function abrirModalTrabajo(id, prefijo) {
    document.getElementById('error-modal-trabajo').innerHTML = '';
    document.getElementById('form-trabajo').reset();
    document.getElementById('tl-id').value = '';
    document.getElementById('tl-paciente-id').value = '';
    document.getElementById('tl-paciente-texto').textContent = '';
    document.getElementById('tl-resultados-paciente').classList.add('oculto');
    document.getElementById('tl-cita').innerHTML = '<option value="">Sin vincular</option>';
    documentosSeleccionados = new Set();
    documentosPacienteCache = [];
    document.getElementById('tl-documentos').innerHTML = '<p class="texto-secundario mb-0">Seleccione un paciente.</p>';
    document.getElementById('tl-envoltura-paciente').classList.remove('oculto');

    const hoy = fechaHoyIso();
    document.getElementById('tl-fecha-envio').max = hoy;

    if (id) {
        try {
            const t = await api.get(`/api/laboratorio/trabajos/${id}`);
            document.getElementById('titulo-modal-trabajo').textContent = `Editar trabajo ${t.numero_orden}`;
            document.getElementById('tl-id').value = t.id;
            document.getElementById('tl-laboratorio').value = t.laboratorio_id;
            document.getElementById('tl-doctor').value = t.doctor_id || '';
            document.getElementById('tl-tipo').value = t.tipo_trabajo;
            document.getElementById('tl-descripcion').value = t.descripcion || '';
            document.getElementById('tl-piezas').value = t.piezas || '';
            document.getElementById('tl-color').value = t.color || '';
            document.getElementById('tl-indicaciones').value = t.indicaciones || '';
            document.getElementById('tl-cantidad').value = t.cantidad || 1;
            document.getElementById('tl-costo-unitario').value = Number(t.costo_unitario) > 0 ? t.costo_unitario : '';
            document.getElementById('tl-fecha-envio').value = t.fecha_envio || '';
            document.getElementById('tl-fecha-estimada').value = t.fecha_estimada || '';
            document.getElementById('tl-notas').value = t.notas || '';
            documentosSeleccionados = new Set(t.documentos_ids || []);
            await seleccionarPacienteLaboratorio(t.paciente_id, `${t.paciente_apellidos} ${t.paciente_nombres}`, t.cita_id);
        } catch (error) {
            mostrarMensajeLab('No se pudo cargar el trabajo: ' + error.message, 'error');
            return;
        }
    } else {
        document.getElementById('titulo-modal-trabajo').textContent = 'Nuevo trabajo de laboratorio';
        document.getElementById('tl-fecha-envio').value = hoy;
        if (prefijo && prefijo.pacienteId) {
            document.getElementById('tl-envoltura-paciente').classList.add('oculto');
            await seleccionarPacienteLaboratorio(prefijo.pacienteId, prefijo.pacienteNombre || '', null);
        }
    }

    ['tl-fecha-envio', 'tl-fecha-estimada'].forEach((campo) => sincronizarFechaLegible(campo, campo + '-legible'));
    actualizarTotalTrabajo();
    document.getElementById('modal-trabajo').classList.add('abierto');
}

function cerrarModalTrabajo() {
    cerrarModal('modal-trabajo');
}

// El total no se escribe: es cantidad x costo unitario (el servidor lo
// recalcula igual, este es solo el reflejo en pantalla).
function actualizarTotalTrabajo() {
    const cantidad = Number(document.getElementById('tl-cantidad').value) || 1;
    const unitario = Number(document.getElementById('tl-costo-unitario').value) || 0;
    document.getElementById('tl-costo-total').textContent = dineroLab(cantidad * unitario);
}

function buscarPacientesLaboratorio() {
    clearTimeout(temporizadorBusquedaPacienteLab);
    const texto = document.getElementById('tl-buscar-paciente').value.trim();
    const resultados = document.getElementById('tl-resultados-paciente');
    if (!texto) { resultados.classList.add('oculto'); return; }

    temporizadorBusquedaPacienteLab = setTimeout(async () => {
        try {
            const pacientes = await api.get(`/api/pacientes?q=${encodeURIComponent(texto)}`);
            resultados.innerHTML = pacientes.length === 0
                ? '<div class="texto-secundario">Sin resultados</div>'
                : pacientes.slice(0, 8).map((p) => `
                    <div onclick="seleccionarPacienteLaboratorio(${p.id}, '${escaparLab(p.apellidos + ' ' + p.nombres).replace(/'/g, "\\'")}', null)">
                        ${escaparLab(p.apellidos)} ${escaparLab(p.nombres)} <span class="texto-secundario">(${escaparLab(p.numero_historia || '')})</span>
                    </div>`).join('');
            resultados.classList.remove('oculto');
        } catch (error) {
            resultados.classList.add('oculto');
        }
    }, 300);
}

async function seleccionarPacienteLaboratorio(pacienteId, nombre, citaIdSeleccionada) {
    document.getElementById('tl-paciente-id').value = pacienteId;
    document.getElementById('tl-paciente-texto').textContent = nombre ? `Paciente seleccionado: ${nombre}` : '';
    document.getElementById('tl-buscar-paciente').value = '';
    document.getElementById('tl-resultados-paciente').classList.add('oculto');

    // Documentos ya subidos del paciente (fotos/escaneos): se referencian,
    // no se suben de nuevo desde aqui.
    try {
        documentosPacienteCache = await api.get(`/api/pacientes/${pacienteId}/documentos`);
    } catch (error) {
        documentosPacienteCache = [];
    }
    renderizarDocumentosSeleccionables();

    // Citas del paciente, para vincular la de instalacion prevista.
    try {
        const citas = await api.get(`/api/citas?paciente_id=${pacienteId}`);
        const hoy = fechaHoyIso();
        const futuras = citas.filter((c) => c.fecha >= hoy && c.estado !== 'cancelada').slice(0, 12);
        document.getElementById('tl-cita').innerHTML = '<option value="">Sin vincular</option>' +
            futuras.map((c) => `<option value="${c.id}">${formatearFecha(c.fecha)} · ${escaparLab(c.hora_inicio)}${c.motivo ? ' · ' + escaparLab(c.motivo) : ''}</option>`).join('');
        if (citaIdSeleccionada) document.getElementById('tl-cita').value = citaIdSeleccionada;
    } catch (error) {
        document.getElementById('tl-cita').innerHTML = '<option value="">Sin vincular</option>';
    }
}

function renderizarDocumentosSeleccionables() {
    const contenedor = document.getElementById('tl-documentos');
    if (documentosPacienteCache.length === 0) {
        contenedor.innerHTML = '<p class="texto-secundario mb-0">El paciente no tiene documentos subidos. Súbalos en la pestaña Documentos de su ficha.</p>';
        return;
    }
    contenedor.innerHTML = documentosPacienteCache.map((d) => `
        <label class="documento-seleccionable">
            <input type="checkbox" value="${d.id}" ${documentosSeleccionados.has(d.id) ? 'checked' : ''}
                   onchange="alternarDocumento(${d.id}, this.checked)">
            <span>${escaparLab(d.nombre_original)}</span>
            <span class="texto-secundario">${formatearFecha((d.fecha_subida || '').slice(0, 10))}</span>
        </label>
    `).join('');
}

function alternarDocumento(id, marcado) {
    if (marcado) documentosSeleccionados.add(id); else documentosSeleccionados.delete(id);
}

async function guardarTrabajo(evento) {
    evento.preventDefault();
    const errorDiv = document.getElementById('error-modal-trabajo');
    errorDiv.innerHTML = '';

    const id = document.getElementById('tl-id').value;
    const pacienteId = document.getElementById('tl-paciente-id').value;
    if (!pacienteId) {
        errorDiv.innerHTML = '<div class="alerta alerta--error">Seleccione el paciente.</div>';
        return;
    }

    const datos = {
        paciente_id: Number(pacienteId),
        laboratorio_id: Number(document.getElementById('tl-laboratorio').value) || null,
        doctor_id: document.getElementById('tl-doctor').value || null,
        tipo_trabajo: document.getElementById('tl-tipo').value.trim(),
        descripcion: document.getElementById('tl-descripcion').value.trim(),
        piezas: document.getElementById('tl-piezas').value.trim(),
        color: document.getElementById('tl-color').value.trim(),
        indicaciones: document.getElementById('tl-indicaciones').value.trim(),
        fecha_envio: document.getElementById('tl-fecha-envio').value || null,
        fecha_estimada: document.getElementById('tl-fecha-estimada').value || null,
        cita_id: document.getElementById('tl-cita').value || null,
        documentos_ids: Array.from(documentosSeleccionados),
        cantidad: document.getElementById('tl-cantidad').value || 1,
        costo_unitario: document.getElementById('tl-costo-unitario').value || 0,
        notas: document.getElementById('tl-notas').value.trim()
    };

    try {
        let resultado;
        if (id) {
            await api.put(`/api/laboratorio/trabajos/${id}`, datos);
            mostrarMensajeLab('Trabajo actualizado.');
        } else {
            resultado = await api.post('/api/laboratorio/trabajos', datos);
            mostrarMensajeLab(`Trabajo ${resultado.numero_orden} registrado.`);
        }
        cerrarModalTrabajo();
        await refrescarTodo();
        if (resultado) {
            const imprimir = await confirmarAccion({
                titulo: 'Orden de trabajo registrada',
                mensaje: `Se registró la orden ${resultado.numero_orden}. Puede imprimirla para enviarla con el trabajo al laboratorio.`,
                confirmar: 'Imprimir orden',
                cancelar: 'Después'
            });
            if (imprimir) imprimirOrden(resultado.id);
        }
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${escaparLab(error.message)}</div>`;
    }
}

// -----------------------------------------------------------------
// Avance de estado
// -----------------------------------------------------------------
let estadoPendiente = null;

function abrirModalEstado(trabajoId, estado) {
    const trabajo = trabajosActuales.find((t) => t.id === trabajoId);
    estadoPendiente = { trabajoId, estado };

    const titulos = { enviado: 'Registrar envío', recibido: 'Registrar recepción', instalado: 'Registrar instalación' };
    const etiquetas = { enviado: 'Fecha de envío', recibido: 'Fecha de recepción', instalado: 'Fecha de instalación' };

    document.getElementById('titulo-modal-estado').textContent = titulos[estado] || 'Registrar';
    document.getElementById('subtitulo-modal-estado').textContent = trabajo
        ? `${trabajo.numero_orden} · ${trabajo.tipo_trabajo} · ${trabajo.paciente_apellidos} ${trabajo.paciente_nombres}` : '';
    document.getElementById('te-fecha-etiqueta').textContent = etiquetas[estado] || 'Fecha';
    document.getElementById('error-modal-estado').innerHTML = '';

    const hoy = fechaHoyIso();
    const campoFecha = document.getElementById('te-fecha');
    campoFecha.max = hoy;
    campoFecha.value = hoy;
    sincronizarFechaLegible('te-fecha', 'te-fecha-legible');

    const envolturaEstimada = document.getElementById('te-envoltura-estimada');
    envolturaEstimada.classList.toggle('oculto', estado !== 'enviado');
    document.getElementById('te-fecha-estimada').value = (trabajo && trabajo.fecha_estimada) || '';
    sincronizarFechaLegible('te-fecha-estimada', 'te-fecha-estimada-legible');

    document.getElementById('modal-estado-trabajo').classList.add('abierto');
}

function cerrarModalEstado() {
    cerrarModal('modal-estado-trabajo');
    estadoPendiente = null;
}

async function confirmarCambioEstado(evento) {
    evento.preventDefault();
    if (!estadoPendiente) return;
    const errorDiv = document.getElementById('error-modal-estado');
    errorDiv.innerHTML = '';

    const cuerpo = {
        estado: estadoPendiente.estado,
        fecha: document.getElementById('te-fecha').value
    };
    if (estadoPendiente.estado === 'enviado') {
        cuerpo.fecha_estimada = document.getElementById('te-fecha-estimada').value || null;
    }

    try {
        await api.put(`/api/laboratorio/trabajos/${estadoPendiente.trabajoId}/estado`, cuerpo);
        cerrarModalEstado();
        mostrarMensajeLab('Trabajo actualizado.');
        await refrescarTodo();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${escaparLab(error.message)}</div>`;
    }
}

// -----------------------------------------------------------------
// Reenvio por ajuste
// -----------------------------------------------------------------
function abrirModalReenvio(trabajoId) {
    const trabajo = trabajosActuales.find((t) => t.id === trabajoId);
    document.getElementById('error-modal-reenvio').innerHTML = '';
    document.getElementById('form-reenvio').reset();
    document.getElementById('tr-trabajo-id').value = trabajoId;
    document.getElementById('tr-costo').value = 0;
    document.getElementById('tr-motivo').value = trabajo && trabajo.estado === 'instalado' ? 'reparacion' : 'ajuste';

    const hoy = fechaHoyIso();
    document.getElementById('tr-fecha-envio').max = hoy;
    document.getElementById('tr-fecha-envio').value = hoy;
    ['tr-fecha-envio', 'tr-fecha-estimada'].forEach((campo) => sincronizarFechaLegible(campo, campo + '-legible'));

    if (trabajo) {
        document.querySelector('#modal-reenvio h2').textContent =
            `Reenviar ${trabajo.numero_orden} (envío ${(trabajo.total_envios || 1) + 1})`;
    }
    document.getElementById('modal-reenvio').classList.add('abierto');
}

async function guardarReenvio(evento) {
    evento.preventDefault();
    const errorDiv = document.getElementById('error-modal-reenvio');
    errorDiv.innerHTML = '';
    const id = document.getElementById('tr-trabajo-id').value;

    try {
        const resultado = await api.post(`/api/laboratorio/trabajos/${id}/envios`, {
            motivo: document.getElementById('tr-motivo').value,
            fecha_envio: document.getElementById('tr-fecha-envio').value,
            fecha_estimada: document.getElementById('tr-fecha-estimada').value || null,
            costo_adicional: document.getElementById('tr-costo').value || 0,
            notas: document.getElementById('tr-indicaciones').value.trim()
        });
        cerrarModal('modal-reenvio');
        mostrarMensajeLab(`Envío ${resultado.numero_envio} registrado en la orden ${resultado.numero_orden}.`);
        await refrescarTodo();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${escaparLab(error.message)}</div>`;
    }
}

// -----------------------------------------------------------------
// Cuentas por pagar
// -----------------------------------------------------------------
async function cargarCuentas() {
    const contenedor = document.getElementById('lista-cuentas');
    try {
        cuentasActuales = await api.get('/api/laboratorio/cuentas-por-pagar');
        seleccionCuentas = new Set();
        actualizarBotonPagar();

        if (cuentasActuales.grupos.length === 0) {
            contenedor.innerHTML = '<p class="texto-secundario">No hay trabajos pendientes de pago.</p>';
            return;
        }

        contenedor.innerHTML = cuentasActuales.grupos.map(grupoCuentaHtml).join('') +
            `<p class="total-cuentas">Total adeudado a laboratorios: <strong>${dineroLab(cuentasActuales.total_general)}</strong></p>`;
    } catch (error) {
        contenedor.innerHTML = `<p class="texto-secundario">Error al cargar: ${escaparLab(error.message)}</p>`;
    }
}

function grupoCuentaHtml(grupo) {
    const puedePagar = tienePermiso(usuarioLaboratorio, 'laboratorio.pagar');
    return `
        <div class="tarjeta" style="margin-bottom:16px;">
            <div class="flex-entre">
                <h3 class="mb-0">${escaparLab(grupo.laboratorio_nombre)}</h3>
                <strong>${dineroLab(grupo.total)}</strong>
            </div>
            ${grupo.laboratorio_datos_transferencia ? `<p class="texto-secundario mb-0">${escaparLab(grupo.laboratorio_datos_transferencia)}</p>` : ''}
            <div class="tabla-envoltorio" style="margin-top:10px;">
                <table>
                    <thead><tr>
                        ${puedePagar ? '<th></th>' : ''}
                        <th>N° orden</th><th>Paciente</th><th>Trabajo</th><th>Recibido</th>
                        <th>Total</th><th>Abonado</th><th>Saldo</th>
                    </tr></thead>
                    <tbody>
                        ${grupo.trabajos.map((t) => `
                            <tr>
                                ${puedePagar ? `<td><input type="checkbox" value="${t.id}" onchange="alternarCuenta(${t.id}, this.checked)"></td>` : ''}
                                <td>${escaparLab(t.numero_orden)}</td>
                                <td>${escaparLab(t.paciente_apellidos)} ${escaparLab(t.paciente_nombres)}</td>
                                <td>${escaparLab(t.tipo_trabajo)}${t.piezas ? ` <span class="texto-secundario">(${escaparLab(t.piezas)})</span>` : ''}</td>
                                <td class="texto-secundario">${t.fecha_recepcion ? formatearFecha(t.fecha_recepcion) : '—'}</td>
                                <td>${dineroLab(t.costo)}${t.cantidad > 1 ? `<div class="dinero-detalle">${t.cantidad} × ${dineroLab(t.costo_unitario)}</div>` : ''}</td>
                                <td>${t.abonado > 0 ? dineroLab(t.abonado) : '<span class="texto-secundario">—</span>'}</td>
                                <td><strong>${dineroLab(t.saldo)}</strong></td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function alternarCuenta(trabajoId, marcado) {
    if (marcado) seleccionCuentas.add(trabajoId); else seleccionCuentas.delete(trabajoId);
    actualizarBotonPagar();
}

function actualizarBotonPagar() {
    const boton = document.getElementById('btn-marcar-pagados');
    const puedePagar = tienePermiso(usuarioLaboratorio, 'laboratorio.pagar') && seleccionCuentas.size > 0;
    boton.classList.toggle('oculto', !puedePagar);
    if (puedePagar) {
        boton.textContent = seleccionCuentas.size === 1 ? 'Registrar abono' : `Abonar a ${seleccionCuentas.size} trabajos`;
    }
}

function abrirModalPagoLaboratorio() {
    if (seleccionCuentas.size === 0) return;

    // Un pago corresponde a UN laboratorio: si la seleccion mezcla varios,
    // se avisa en vez de registrar algo incoherente con su factura.
    const seleccionados = [];
    cuentasActuales.grupos.forEach((g) => g.trabajos.forEach((t) => { if (seleccionCuentas.has(t.id)) seleccionados.push(t); }));
    const laboratorios = new Set(seleccionados.map((t) => t.laboratorio_id));
    if (laboratorios.size > 1) {
        mostrarMensajeLab('Seleccione trabajos de un solo laboratorio: cada pago corresponde a una factura.', 'error');
        return;
    }

    const total = seleccionados.reduce((suma, t) => suma + t.saldo, 0);
    document.getElementById('resumen-pago-lab').innerHTML =
        `${escaparLab(seleccionados[0].laboratorio_nombre)} · ${seleccionados.length} trabajo(s) · saldo <strong>${dineroLab(total)}</strong>`;

    document.getElementById('error-modal-pago-lab').innerHTML = '';
    document.getElementById('form-pago-laboratorio').reset();

    // Un abono parcial solo tiene sentido sobre un trabajo concreto; con
    // varios seleccionados se abona el saldo completo de cada uno (el caso
    // de la factura mensual del laboratorio).
    const unico = seleccionados.length === 1 ? seleccionados[0] : null;
    document.getElementById('pl-envoltura-monto').classList.toggle('oculto', !unico);
    if (unico) {
        const campoMonto = document.getElementById('pl-monto');
        campoMonto.value = unico.saldo.toFixed(2);
        campoMonto.max = unico.saldo;
        document.getElementById('pl-monto-ayuda').textContent =
            `Saldo pendiente: ${dineroLab(unico.saldo)}. Puede abonar menos.`;
    }
    document.getElementById('pl-metodo').value = 'transferencia';
    const hoy = fechaHoyIso();
    document.getElementById('pl-fecha').max = hoy;
    document.getElementById('pl-fecha').value = hoy;
    sincronizarFechaLegible('pl-fecha', 'pl-fecha-legible');

    document.getElementById('modal-pago-laboratorio').classList.add('abierto');
}

async function guardarPagoLaboratorio(evento) {
    evento.preventDefault();
    const errorDiv = document.getElementById('error-modal-pago-lab');
    errorDiv.innerHTML = '';

    try {
        const ids = Array.from(seleccionCuentas);
        const cuerpo = {
            trabajo_ids: ids,
            fecha: document.getElementById('pl-fecha').value,
            metodo: document.getElementById('pl-metodo').value,
            referencia: document.getElementById('pl-referencia').value.trim(),
            notas: document.getElementById('pl-notas').value.trim()
        };
        // Monto explicito solo en el caso de un unico trabajo (abono parcial).
        if (ids.length === 1 && !document.getElementById('pl-envoltura-monto').classList.contains('oculto')) {
            cuerpo.montos = { [ids[0]]: document.getElementById('pl-monto').value };
        }

        const resultado = await api.post('/api/laboratorio/pagos', cuerpo);
        cerrarModal('modal-pago-laboratorio');
        mostrarMensajeLab(`Abono registrado: ${resultado.cantidad} trabajo(s) por ${dineroLab(resultado.total)}.`);
        await refrescarTodo();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${escaparLab(error.message)}</div>`;
    }
}

async function cargarPagosRealizados() {
    const contenedor = document.getElementById('lista-pagos-realizados');
    const mes = document.getElementById('filtro-mes-pagos-lab').value;
    try {
        const datos = await api.get(`/api/laboratorio/pagos-realizados?mes=${mes}`);
        if (datos.pagos.length === 0) {
            contenedor.innerHTML = '<p class="texto-secundario">No hay pagos a laboratorios registrados en este mes.</p>';
            return;
        }
        contenedor.innerHTML = `
            <div class="tabla-envoltorio"><table>
                <thead><tr><th>Fecha</th><th>Laboratorio</th><th>N° orden</th><th>Trabajo</th><th>Método</th><th>Factura</th><th>Abono</th><th></th></tr></thead>
                <tbody>
                    ${datos.pagos.map((p) => `
                        <tr class="${p.anulado ? 'fila-anulada' : ''}">
                            <td>${formatearFecha(p.fecha)}</td>
                            <td>${escaparLab(p.laboratorio_nombre)}</td>
                            <td>${escaparLab(p.numero_orden)}</td>
                            <td>${escaparLab(p.tipo_trabajo)}</td>
                            <td>${escaparLab(ETIQUETAS_METODO_LAB[p.metodo] || p.metodo || '')}</td>
                            <td class="texto-secundario">${escaparLab(p.referencia || '—')}</td>
                            <td>${dineroLab(p.monto)}</td>
                            <td>${!p.anulado && tienePermiso(usuarioLaboratorio, 'laboratorio.pagar')
                                ? `<button type="button" class="btn-texto" style="color:var(--rojo-alerta);" onclick="pedirMotivo('anular-abono', ${p.id})">Anular</button>`
                                : p.anulado ? `<span class="texto-secundario">anulado</span>` : ''}</td>
                        </tr>`).join('')}
                </tbody>
            </table></div>
            <p class="total-cuentas">Total abonado en el mes: <strong>${dineroLab(datos.total)}</strong></p>`;
    } catch (error) {
        contenedor.innerHTML = `<p class="texto-secundario">Error al cargar: ${escaparLab(error.message)}</p>`;
    }
}

// -----------------------------------------------------------------
// Abonos de un trabajo: detalle de lo pagado y anulacion (solo admin)
// -----------------------------------------------------------------
async function abrirModalAbonos(trabajoId) {
    const contenedor = document.getElementById('lista-abonos');
    document.getElementById('resumen-abonos').innerHTML = '';
    document.getElementById('lista-envios').innerHTML = '';
    contenedor.innerHTML = '<p class="texto-secundario">Cargando...</p>';
    document.getElementById('modal-abonos').classList.add('abierto');

    try {
        const t = await api.get(`/api/laboratorio/trabajos/${trabajoId}`);
        document.getElementById('titulo-modal-abonos').textContent = `Detalle de ${t.numero_orden}`;
        document.getElementById('resumen-abonos').innerHTML = `
            <div class="alerta" style="margin-bottom:12px;">
                ${escaparLab(t.laboratorio_nombre)} · ${escaparLab(t.tipo_trabajo)}<br>
                Total <strong>${dineroLab(t.costo)}</strong> · abonado <strong>${dineroLab(t.abonado)}</strong> ·
                saldo <strong>${dineroLab(t.saldo)}</strong> (${escaparLab(t.estado_pago_etiqueta)})
            </div>`;

        const envios = document.getElementById('lista-envios');
        envios.innerHTML = (t.envios || []).length === 0
            ? '<p class="texto-secundario">Todavía no ha salido al laboratorio.</p>'
            : `<div class="tabla-envoltorio"><table>
                    <thead><tr><th>#</th><th>Motivo</th><th>Enviado</th><th>Prometido</th><th>Recibido</th><th>Costo extra</th><th>Qué se pidió</th></tr></thead>
                    <tbody>
                        ${t.envios.map((e) => `
                            <tr>
                                <td><strong>${e.numero}</strong></td>
                                <td>${escaparLab(e.motivo_etiqueta)}</td>
                                <td>${e.fecha_envio ? formatearFecha(e.fecha_envio) : '<span class="texto-secundario">—</span>'}</td>
                                <td class="texto-secundario">${e.fecha_estimada ? formatearFecha(e.fecha_estimada) : '—'}</td>
                                <td>${e.fecha_recepcion ? formatearFecha(e.fecha_recepcion) : '<span class="insignia insignia--dorado">en laboratorio</span>'}</td>
                                <td>${Number(e.costo_adicional) > 0 ? dineroLab(e.costo_adicional) : '<span class="texto-secundario">—</span>'}</td>
                                <td class="celda-texto-plantilla">${escaparLab(e.notas || '—')}</td>
                            </tr>`).join('')}
                    </tbody>
               </table></div>`;

        contenedor.innerHTML = (t.abonos || []).length === 0
            ? '<p class="texto-secundario">Todavía no hay abonos registrados.</p>'
            : `<div class="tabla-envoltorio"><table>
                    <thead><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Factura</th><th>Registró</th><th></th></tr></thead>
                    <tbody>
                        ${t.abonos.map((a) => `
                            <tr class="${a.anulado ? 'fila-anulada' : ''}">
                                <td>${formatearFecha(a.fecha)}</td>
                                <td>${dineroLab(a.monto)}</td>
                                <td>${escaparLab(ETIQUETAS_METODO_LAB[a.metodo] || a.metodo)}</td>
                                <td class="texto-secundario">${escaparLab(a.referencia || '—')}</td>
                                <td class="texto-secundario">${escaparLab(a.registrado_por_nombre || '—')}</td>
                                <td>${!a.anulado && tienePermiso(usuarioLaboratorio, 'laboratorio.pagar')
                                    ? `<button type="button" class="btn-texto" style="color:var(--rojo-alerta);" onclick="pedirMotivo('anular-abono', ${a.id})">Anular</button>`
                                    : a.anulado ? `<span class="texto-secundario">${escaparLab(a.motivo_anulacion || 'anulado')}</span>` : ''}</td>
                            </tr>`).join('')}
                    </tbody>
               </table></div>`;
    } catch (error) {
        contenedor.innerHTML = `<p class="texto-secundario">Error al cargar: ${escaparLab(error.message)}</p>`;
    }
}

// -----------------------------------------------------------------
// Catalogo de laboratorios (solo admin)
// -----------------------------------------------------------------
async function cargarLaboratorios() {
    const contenedor = document.getElementById('lista-laboratorios');
    if (!contenedor || !tienePermiso(usuarioLaboratorio, 'catalogos.laboratorios')) return;
    try {
        laboratoriosCache = await api.get('/api/laboratorio/laboratorios');
        contenedor.innerHTML = `
            <div class="tabla-envoltorio"><table>
                <thead><tr><th>Nombre</th><th>Contacto</th><th>Teléfono</th><th>Email</th><th>Dirección</th><th>Transferencia</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                    ${laboratoriosCache.map((l) => `
                        <tr class="${l.activo ? '' : 'fila-anulada'}">
                            <td><strong>${escaparLab(l.nombre)}</strong></td>
                            <td>${escaparLab(l.contacto || '—')}</td>
                            <td>${escaparLab(l.telefono || '—')}</td>
                            <td>${escaparLab(l.email || '—')}</td>
                            <td>${escaparLab(l.direccion || '—')}</td>
                            <td class="texto-secundario">${escaparLab(l.datos_transferencia || '—')}</td>
                            <td>${l.activo ? '<span class="insignia insignia--verde">Activo</span>' : '<span class="insignia">Inactivo</span>'}</td>
                            <td><button type="button" class="btn-texto" onclick="abrirModalLaboratorio(${l.id})">Editar</button></td>
                        </tr>`).join('')}
                </tbody>
            </table></div>`;
    } catch (error) {
        contenedor.innerHTML = `<p class="texto-secundario">Error al cargar: ${escaparLab(error.message)}</p>`;
    }
}

function abrirModalLaboratorio(id) {
    document.getElementById('error-modal-laboratorio').innerHTML = '';
    document.getElementById('form-laboratorio').reset();
    document.getElementById('lb-id').value = '';

    if (id) {
        const lab = laboratoriosCache.find((l) => l.id === id);
        if (!lab) return;
        document.getElementById('titulo-modal-laboratorio').textContent = 'Editar laboratorio';
        document.getElementById('lb-id').value = lab.id;
        document.getElementById('lb-nombre').value = lab.nombre;
        document.getElementById('lb-contacto').value = lab.contacto || '';
        document.getElementById('lb-telefono').value = lab.telefono || '';
        document.getElementById('lb-email').value = lab.email || '';
        document.getElementById('lb-direccion').value = lab.direccion || '';
        document.getElementById('lb-transferencia').value = lab.datos_transferencia || '';
        document.getElementById('lb-notas').value = lab.notas || '';
        document.getElementById('lb-activo').value = lab.activo ? '1' : '0';
    } else {
        document.getElementById('titulo-modal-laboratorio').textContent = 'Nuevo laboratorio';
    }
    document.getElementById('modal-laboratorio').classList.add('abierto');
}

async function guardarLaboratorio(evento) {
    evento.preventDefault();
    const errorDiv = document.getElementById('error-modal-laboratorio');
    errorDiv.innerHTML = '';
    const id = document.getElementById('lb-id').value;

    const datos = {
        nombre: document.getElementById('lb-nombre').value.trim(),
        contacto: document.getElementById('lb-contacto').value.trim(),
        telefono: document.getElementById('lb-telefono').value.trim(),
        email: document.getElementById('lb-email').value.trim(),
        direccion: document.getElementById('lb-direccion').value.trim(),
        datos_transferencia: document.getElementById('lb-transferencia').value.trim(),
        notas: document.getElementById('lb-notas').value.trim(),
        activo: Number(document.getElementById('lb-activo').value)
    };

    try {
        if (id) {
            await api.put(`/api/laboratorio/laboratorios/${id}`, datos);
        } else {
            await api.post('/api/laboratorio/laboratorios', datos);
        }
        cerrarModal('modal-laboratorio');
        mostrarMensajeLab('Laboratorio guardado.');
        await cargarCatalogos();
        await cargarLaboratorios();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${escaparLab(error.message)}</div>`;
    }
}

// -----------------------------------------------------------------
// Motivo (cancelar trabajo / anular abono) - ambas acciones son de admin
// -----------------------------------------------------------------
function pedirMotivo(accion, trabajoId) {
    accionMotivoPendiente = { accion, trabajoId };
    document.getElementById('motivo-lab').value = '';
    document.getElementById('error-modal-motivo-lab').innerHTML = '';
    document.getElementById('titulo-modal-motivo-lab').textContent =
        accion === 'cancelar' ? 'Cancelar trabajo' : 'Anular abono';
    document.getElementById('subtitulo-modal-motivo-lab').textContent = accion === 'cancelar'
        ? 'El trabajo queda registrado como cancelado, con su número de orden y su motivo.'
        : 'El abono queda tachado y fuera del saldo, conservando su registro. El trabajo vuelve a contar lo que se le debe al laboratorio.';
    document.getElementById('modal-motivo-lab').classList.add('abierto');
}

async function confirmarMotivo() {
    if (!accionMotivoPendiente) return;
    const errorDiv = document.getElementById('error-modal-motivo-lab');
    const motivo = document.getElementById('motivo-lab').value.trim();
    if (!motivo) {
        errorDiv.innerHTML = '<div class="alerta alerta--error">Debe indicar el motivo.</div>';
        return;
    }

    const { accion, trabajoId } = accionMotivoPendiente;
    const ruta = accion === 'cancelar'
        ? `/api/laboratorio/trabajos/${trabajoId}/cancelar`
        : `/api/laboratorio/pagos/${trabajoId}/anular`;

    try {
        await api.put(ruta, { motivo });
        cerrarModal('modal-motivo-lab');
        accionMotivoPendiente = null;
        mostrarMensajeLab(accion === 'cancelar' ? 'Trabajo cancelado.' : 'Abono anulado.');
        cerrarModal('modal-abonos');
        await refrescarTodo();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${escaparLab(error.message)}</div>`;
    }
}

async function refrescarTodo() {
    await Promise.all([cargarResumen(), cargarTrabajos(), cargarCuentas(), cargarPagosRealizados()]);
}
