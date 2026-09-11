// =====================================================================
// Plan de tratamiento derivado del odontograma (Fase 4A). Un plan en
// borrador/presentado es editable; al aceptarse con firma queda
// inmutable (contenido_final + hash + PNG en disco, igual que
// consentimientos.js). Panel derecho del odontograma + subseccion
// completa en la ficha del paciente. Comparte pacienteActual / pacienteId
// / usuarioActual (paciente.js) y piezasVisibles / modoEdicion (odontograma.js).
// =====================================================================

let planVigente = null;       // plan en borrador/presentado, o el aceptado/en_curso mas reciente
let planesHistorial = [];
let itemPlanCatalogo = [];

const ETIQUETAS_ESTADO_PLAN = {
    borrador: 'Borrador', presentado: 'Presentado', aceptado: 'Aceptado',
    rechazado: 'Rechazado', en_curso: 'En curso', finalizado: 'Finalizado'
};

document.addEventListener('DOMContentLoaded', () => {
    const btnGenerar = document.getElementById('btn-generar-plan');
    if (!btnGenerar) return; // pagina sin ficha de paciente

    btnGenerar.addEventListener('click', () => generarPlanTratamiento());

    document.getElementById('cerrar-modal-item-plan').addEventListener('click', cerrarModalItemPlan);
    document.getElementById('cancelar-modal-item-plan').addEventListener('click', cerrarModalItemPlan);
    document.getElementById('item-plan-buscar').addEventListener('input', filtrarCatalogoItemPlan);
    document.getElementById('item-plan-tratamiento').addEventListener('change', seleccionarTratamientoItemPlan);
    document.getElementById('btn-agregar-item-plan').addEventListener('click', agregarItemPlan);

    document.getElementById('cerrar-modal-presentar-plan').addEventListener('click', () => document.getElementById('modal-presentar-plan').classList.remove('abierto'));
    document.getElementById('cancelar-modal-presentar-plan').addEventListener('click', () => document.getElementById('modal-presentar-plan').classList.remove('abierto'));
    document.getElementById('btn-confirmar-presentar-plan').addEventListener('click', confirmarPresentarPlan);

    document.getElementById('cancelar-modal-rechazar-plan').addEventListener('click', () => document.getElementById('modal-rechazar-plan').classList.remove('abierto'));
    document.getElementById('btn-confirmar-rechazar-plan').addEventListener('click', confirmarRechazarPlan);

    document.getElementById('btn-cancelar-kiosko-plan').addEventListener('click', () => document.getElementById('kiosko-firma-plan').classList.add('oculto'));
    document.getElementById('btn-confirmar-firma-plan').addEventListener('click', confirmarFirmaPlan);

    cargarPlanTab();
});

// -----------------------------------------------------------------
// Carga de la pestaña "Plan de tratamiento"
// -----------------------------------------------------------------
async function cargarPlanTab() {
    const contenedorVigente = document.getElementById('plan-tratamiento-vigente');
    const contenedorHistorial = document.getElementById('historial-planes-tratamiento');
    if (!contenedorVigente) return;

    try {
        planesHistorial = await api.get(`/api/planes-tratamiento/${pacienteId}`);
    } catch (error) {
        contenedorHistorial.innerHTML = `<p class="texto-secundario">Error al cargar historial: ${error.message}</p>`;
        planesHistorial = [];
    }

    const enBorrador = planesHistorial.find((p) => ['borrador', 'presentado'].includes(p.estado));
    const enCurso = planesHistorial.find((p) => ['aceptado', 'en_curso'].includes(p.estado));
    const idVigente = enBorrador ? enBorrador.id : (enCurso ? enCurso.id : null);

    if (!idVigente) {
        planVigente = null;
        contenedorVigente.innerHTML = '<p class="texto-secundario">Este paciente no tiene un plan de tratamiento vigente.</p>';
        document.getElementById('btn-generar-plan').classList.remove('oculto');
    } else {
        try {
            planVigente = await api.get(`/api/planes-tratamiento/${pacienteId}/${idVigente}`);
            document.getElementById('btn-generar-plan').classList.toggle('oculto', !!enBorrador || !!enCurso);
            contenedorVigente.innerHTML = renderPlanVigente(planVigente);
            vincularEdicionInlinePlan();
        } catch (error) {
            contenedorVigente.innerHTML = `<p class="texto-secundario">Error al cargar el plan: ${error.message}</p>`;
        }
    }

    contenedorHistorial.innerHTML = planesHistorial.length === 0
        ? '<p class="texto-secundario">Sin planes de tratamiento registrados.</p>'
        : planesHistorial.map((p) => `
            <div class="evolucion-compacta">
                <div class="evolucion-compacta__cabecera">
                    <span>Plan #${p.id} · ${ETIQUETAS_ESTADO_PLAN[p.estado] || p.estado}</span>
                    <span>${formatearFecha((p.fecha_creacion || '').slice(0, 10))}</span>
                </div>
                <div class="evolucion-compacta__texto">
                    Total: $${Number(p.total).toFixed(2)}
                    ${p.estado === 'aceptado' || p.estado === 'en_curso' || p.estado === 'finalizado' ? ` · <a href="/imprimir-plan.html?pacienteId=${pacienteId}&id=${p.id}" target="_blank">Imprimir</a>` : ''}
                </div>
            </div>
        `).join('');
}

function renderPlanVigente(plan) {
    const editable = ['borrador', 'presentado'].includes(plan.estado);
    const pendientes = plan.items.filter((it) => it.estado_item === 'pendiente').length;
    const realizados = plan.items.filter((it) => it.estado_item === 'realizado').length;

    const filasHtml = plan.items.map((it) => `
        <tr>
            <td>${it.fase_etiqueta || ('Fase ' + it.fase)}</td>
            <td>${it.piezas || '—'}</td>
            <td>
                ${editable
                    ? `<input type="text" class="plan-item-descripcion" data-item="${it.id}" value="${it.descripcion.replace(/"/g, '&quot;')}">`
                    : it.descripcion}
            </td>
            <td>
                ${editable
                    ? `<input type="text" class="plan-item-precio" data-item="${it.id}" value="${Number(it.precio).toFixed(2)}" style="width:80px;">`
                    : '$' + Number(it.precio).toFixed(2)}
            </td>
            <td><span class="insignia ${it.estado_item === 'realizado' ? 'insignia--verde' : it.estado_item === 'descartado' ? 'insignia--rojo' : 'insignia--dorado'}">${it.estado_item}</span></td>
            <td>${editable ? `<button type="button" class="btn-texto" onclick="quitarItemPlan(${it.id})">Quitar</button>` : ''}</td>
        </tr>
    `).join('');

    let botonesAccion = '';
    if (plan.estado === 'borrador') {
        botonesAccion = `
            <button type="button" class="btn btn-secundario btn-sm" onclick="abrirModalItemPlan()">+ Agregar tratamiento</button>
            <button type="button" class="btn btn-primario btn-sm" onclick="abrirModalPresentarPlan()">Presentar al paciente</button>
            <button type="button" class="btn btn-peligro btn-sm" onclick="abrirModalRechazarPlan()">Rechazar</button>
        `;
    } else if (plan.estado === 'presentado') {
        botonesAccion = `
            <button type="button" class="btn btn-secundario btn-sm" onclick="abrirModalItemPlan()">+ Agregar tratamiento</button>
            <button type="button" class="btn btn-primario btn-sm" onclick="abrirKioskoFirmaPlan()">Aceptar y firmar</button>
            <button type="button" class="btn btn-peligro btn-sm" onclick="abrirModalRechazarPlan()">Rechazar</button>
        `;
    } else if (plan.estado === 'aceptado' || plan.estado === 'en_curso') {
        botonesAccion = `
            <a class="btn btn-secundario btn-sm" href="/imprimir-plan.html?pacienteId=${pacienteId}&id=${plan.id}" target="_blank">Imprimir</a>
            <button type="button" class="btn btn-secundario btn-sm" onclick="crearNuevaVersionPlan(${plan.id})">Crear nueva versión</button>
            ${pendientes === 0 ? `<button type="button" class="btn btn-primario btn-sm" onclick="finalizarPlan(${plan.id})">Marcar finalizado</button>` : ''}
        `;
    }

    return `
        <div class="flex-entre" style="margin-bottom:10px;">
            <span class="insignia insignia--dorado">${ETIQUETAS_ESTADO_PLAN[plan.estado] || plan.estado}</span>
            <strong>Total: $${Number(plan.total).toFixed(2)}</strong>
        </div>
        ${plan.estado === 'aceptado' || plan.estado === 'en_curso' ? `<p class="texto-secundario mb-0">${realizados} realizado(s) · ${pendientes} pendiente(s)</p>` : ''}
        ${editable ? `
            <div class="campo campo--ancho" style="margin-top:10px;">
                <label>Condiciones</label>
                <textarea id="plan-condiciones-input">${plan.condiciones || ''}</textarea>
                <button type="button" class="btn-texto" onclick="guardarCondicionesPlan(${plan.id})">Guardar condiciones</button>
            </div>
        ` : (plan.condiciones ? `<p><strong>Condiciones:</strong> ${plan.condiciones}</p>` : '')}
        <div class="tabla-envoltorio" style="margin-top:10px;">
            <table>
                <thead><tr><th>Fase</th><th>Pieza(s)</th><th>Tratamiento</th><th>Precio</th><th>Estado</th><th></th></tr></thead>
                <tbody>${filasHtml}</tbody>
            </table>
        </div>
        ${editable ? '<p class="seccion-clinica__ayuda">Los cambios de precio/descripción se guardan al presionar Tab o hacer clic fuera del campo.</p>' : ''}
        <div class="flex-entre" style="margin-top:14px; gap:8px; flex-wrap:wrap;">${botonesAccion}</div>
    `;
}

function vincularEdicionInlinePlan() {
    document.querySelectorAll('.plan-item-descripcion').forEach((input) => {
        input.addEventListener('change', () => guardarEdicionItemPlan(input.dataset.item));
    });
    document.querySelectorAll('.plan-item-precio').forEach((input) => {
        input.addEventListener('change', () => guardarEdicionItemPlan(input.dataset.item));
    });
}

async function guardarEdicionItemPlan(itemId) {
    const descripcionInput = document.querySelector(`.plan-item-descripcion[data-item="${itemId}"]`);
    const precioInput = document.querySelector(`.plan-item-precio[data-item="${itemId}"]`);
    try {
        await api.put(`/api/planes-tratamiento/${pacienteId}/${planVigente.id}/items/${itemId}`, {
            descripcion: descripcionInput.value.trim(),
            precio: precioInput.value
        });
        await cargarPlanTab();
        if (typeof cargarPanelResumenPaciente === 'function') await cargarPanelResumenPaciente();
    } catch (error) {
        document.getElementById('mensaje-plan-tratamiento').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

async function quitarItemPlan(itemId) {
    if (!confirm('¿Quitar esta línea del plan?')) return;
    try {
        await api.del(`/api/planes-tratamiento/${pacienteId}/${planVigente.id}/items/${itemId}`);
        await cargarPlanTab();
        if (typeof cargarPanelResumenPaciente === 'function') await cargarPanelResumenPaciente();
    } catch (error) {
        document.getElementById('mensaje-plan-tratamiento').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

async function guardarCondicionesPlan(planId) {
    const condiciones = document.getElementById('plan-condiciones-input').value;
    try {
        await api.put(`/api/planes-tratamiento/${pacienteId}/${planId}`, { condiciones });
        await cargarPlanTab();
    } catch (error) {
        document.getElementById('mensaje-plan-tratamiento').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

async function generarPlanTratamiento(odontogramaId, silencioso) {
    const mensajeDiv = document.getElementById('mensaje-plan-tratamiento');
    if (mensajeDiv) mensajeDiv.innerHTML = '';
    try {
        await api.post(`/api/planes-tratamiento/${pacienteId}/generar`, odontogramaId ? { odontograma_id: odontogramaId } : {});
        await cargarPlanTab();
        if (typeof cargarPanelResumenPaciente === 'function') await cargarPanelResumenPaciente();
    } catch (error) {
        if (silencioso) return; // sugerencia automatica: si falla, no molestar al usuario
        if (mensajeDiv) mensajeDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
        else alert('No se pudo generar el plan: ' + error.message);
    }
}

// -----------------------------------------------------------------
// Agregar linea manual desde el catalogo
// -----------------------------------------------------------------
async function abrirModalItemPlan() {
    document.getElementById('error-modal-item-plan').innerHTML = '';
    document.getElementById('item-plan-buscar').value = '';
    document.getElementById('item-plan-piezas').value = '';
    document.getElementById('item-plan-precio').value = '';
    document.getElementById('item-plan-descripcion').value = '';
    document.getElementById('item-plan-fase').value = 1;
    document.getElementById('item-plan-fase-etiqueta').value = '';

    try {
        itemPlanCatalogo = await api.get('/api/tratamientos?activo=1');
        renderizarOpcionesCatalogoItemPlan(itemPlanCatalogo);
    } catch (error) {
        itemPlanCatalogo = [];
    }

    document.getElementById('modal-item-plan').classList.add('abierto');
}

function cerrarModalItemPlan() {
    document.getElementById('modal-item-plan').classList.remove('abierto');
}

function renderizarOpcionesCatalogoItemPlan(lista) {
    document.getElementById('item-plan-tratamiento').innerHTML = lista.map((t) =>
        `<option value="${t.id}" data-precio="${t.precio}">${t.nombre} — $${Number(t.precio).toFixed(2)}</option>`
    ).join('');
}

function filtrarCatalogoItemPlan() {
    const texto = document.getElementById('item-plan-buscar').value.trim().toLowerCase();
    const filtrado = texto ? itemPlanCatalogo.filter((t) => t.nombre.toLowerCase().includes(texto)) : itemPlanCatalogo;
    renderizarOpcionesCatalogoItemPlan(filtrado);
}

function seleccionarTratamientoItemPlan() {
    const select = document.getElementById('item-plan-tratamiento');
    const opcion = select.selectedOptions[0];
    if (!opcion) return;
    document.getElementById('item-plan-descripcion').value = opcion.textContent.split(' — $')[0];
    document.getElementById('item-plan-precio').value = opcion.dataset.precio;
}

async function agregarItemPlan() {
    const errorDiv = document.getElementById('error-modal-item-plan');
    errorDiv.innerHTML = '';
    const select = document.getElementById('item-plan-tratamiento');
    const descripcion = document.getElementById('item-plan-descripcion').value.trim();
    const precio = document.getElementById('item-plan-precio').value;

    if (!descripcion) { errorDiv.innerHTML = '<div class="alerta alerta--error">Seleccione un tratamiento o escriba una descripción</div>'; return; }

    try {
        await api.post(`/api/planes-tratamiento/${pacienteId}/${planVigente.id}/items`, {
            tratamiento_id: select.value || null,
            piezas: document.getElementById('item-plan-piezas').value,
            descripcion,
            precio,
            fase: Number(document.getElementById('item-plan-fase').value) || 1,
            fase_etiqueta: document.getElementById('item-plan-fase-etiqueta').value
        });
        cerrarModalItemPlan();
        await cargarPlanTab();
        if (typeof cargarPanelResumenPaciente === 'function') await cargarPanelResumenPaciente();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

// -----------------------------------------------------------------
// Presentar / rechazar
// -----------------------------------------------------------------
function abrirModalPresentarPlan() {
    document.getElementById('error-modal-presentar-plan').innerHTML = '';
    document.getElementById('presentar-plan-condiciones').value = planVigente.condiciones || '';
    document.getElementById('modal-presentar-plan').classList.add('abierto');
}

async function confirmarPresentarPlan() {
    const errorDiv = document.getElementById('error-modal-presentar-plan');
    try {
        await api.put(`/api/planes-tratamiento/${pacienteId}/${planVigente.id}`, { condiciones: document.getElementById('presentar-plan-condiciones').value });
        await api.post(`/api/planes-tratamiento/${pacienteId}/${planVigente.id}/presentar`);
        document.getElementById('modal-presentar-plan').classList.remove('abierto');
        await cargarPlanTab();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

function abrirModalRechazarPlan() {
    document.getElementById('error-modal-rechazar-plan').innerHTML = '';
    document.getElementById('rechazar-plan-motivo').value = '';
    document.getElementById('modal-rechazar-plan').classList.add('abierto');
}

async function confirmarRechazarPlan() {
    const errorDiv = document.getElementById('error-modal-rechazar-plan');
    try {
        await api.post(`/api/planes-tratamiento/${pacienteId}/${planVigente.id}/rechazar`, { motivo: document.getElementById('rechazar-plan-motivo').value });
        document.getElementById('modal-rechazar-plan').classList.remove('abierto');
        await cargarPlanTab();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

// -----------------------------------------------------------------
// Aceptar y firmar (kiosko a pantalla completa, mismo patron que
// consentimientos.js)
// -----------------------------------------------------------------
function abrirKioskoFirmaPlan() {
    const esMenor = pacienteActual && pacienteActual.fecha_nacimiento && calcularEdadCliente(pacienteActual.fecha_nacimiento) < 18;

    document.getElementById('kiosko-plan-subtitulo').textContent = `${pacienteActual.nombres} ${pacienteActual.apellidos} — Total: $${Number(planVigente.total).toFixed(2)}`;
    document.getElementById('kiosko-plan-documento').innerHTML = renderizarVistaPlanParaFirma(planVigente);
    document.getElementById('kiosko-plan-representante-block').classList.toggle('oculto', !esMenor);
    document.getElementById('kiosko-plan-etiqueta-firmante').textContent = esMenor ? 'Firma del representante legal *' : 'Firma del paciente *';
    document.getElementById('kiosko-plan-representante-nombre').value = '';
    document.getElementById('kiosko-plan-representante-cedula').value = '';
    document.getElementById('error-kiosko-plan').innerHTML = '';

    document.getElementById('kiosko-firma-plan').classList.remove('oculto');
    inicializarFirmaCanvas('plan-firma-paciente');
    limpiarFirmaCanvas('plan-firma-paciente');
}

function calcularEdadCliente(fechaNacimiento) {
    const hoy = new Date();
    const nacimiento = new Date(fechaNacimiento);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const mes = hoy.getMonth() - nacimiento.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
    return edad;
}

function renderizarVistaPlanParaFirma(plan) {
    const filas = plan.items.map((it) => `
        <tr><td>${it.fase_etiqueta || ('Fase ' + it.fase)}</td><td>${it.piezas || '—'}</td><td>${it.descripcion}</td><td>$${Number(it.precio).toFixed(2)}</td></tr>
    `).join('');
    return `
        <p><strong>Paciente:</strong> ${pacienteActual.nombres} ${pacienteActual.apellidos}</p>
        <table class="tabla-plan-impreso">
            <thead><tr><th>Fase</th><th>Pieza(s)</th><th>Tratamiento</th><th>Precio</th></tr></thead>
            <tbody>${filas}</tbody>
        </table>
        <p class="tabla-plan-impreso__total"><strong>Total: $${Number(plan.total).toFixed(2)}</strong></p>
        ${plan.condiciones ? `<p><strong>Condiciones:</strong> ${plan.condiciones}</p>` : ''}
        <h4>Declaración y firma</h4>
        <p>Acepto el plan de tratamiento propuesto, sus fases y su costo.</p>
    `;
}

async function confirmarFirmaPlan() {
    const errorDiv = document.getElementById('error-kiosko-plan');
    errorDiv.innerHTML = '';
    const firma = obtenerFirmaDataUrl('plan-firma-paciente');
    if (!firma) { errorDiv.innerHTML = '<div class="alerta alerta--error">Se requiere la firma</div>'; return; }

    try {
        await api.post(`/api/planes-tratamiento/${pacienteId}/${planVigente.id}/aceptar`, {
            firma_paciente: firma,
            representante_nombre: document.getElementById('kiosko-plan-representante-nombre').value,
            representante_cedula: document.getElementById('kiosko-plan-representante-cedula').value
        });
        document.getElementById('kiosko-firma-plan').classList.add('oculto');
        await cargarPlanTab();
        if (typeof cargarPanelResumenPaciente === 'function') await cargarPanelResumenPaciente();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

// -----------------------------------------------------------------
// Nueva version / finalizar
// -----------------------------------------------------------------
async function crearNuevaVersionPlan(planId) {
    if (!confirm('El plan aceptado permanecerá intacto. Se creará una nueva versión en borrador con los ítems pendientes para seguir editando. ¿Continuar?')) return;
    try {
        await api.post(`/api/planes-tratamiento/${pacienteId}/${planId}/nueva-version`);
        await cargarPlanTab();
    } catch (error) {
        document.getElementById('mensaje-plan-tratamiento').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

async function finalizarPlan(planId) {
    if (!confirm('¿Marcar este plan como finalizado?')) return;
    try {
        await api.put(`/api/planes-tratamiento/${pacienteId}/${planId}/finalizar`);
        await cargarPlanTab();
    } catch (error) {
        document.getElementById('mensaje-plan-tratamiento').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

// -----------------------------------------------------------------
// Resumen compacto para el panel derecho del odontograma
// -----------------------------------------------------------------
async function obtenerResumenPlanHtml() {
    try {
        const planes = await api.get(`/api/planes-tratamiento/${pacienteId}`);
        const vigente = planes.find((p) => ['borrador', 'presentado', 'aceptado', 'en_curso'].includes(p.estado));
        if (!vigente) {
            return '<p class="resumen-plan-placeholder">Sin plan de tratamiento vigente.</p>';
        }
        const detalle = ['aceptado', 'en_curso'].includes(vigente.estado)
            ? await api.get(`/api/planes-tratamiento/${pacienteId}/${vigente.id}`)
            : null;
        const pendientes = detalle ? detalle.items.filter((it) => it.estado_item === 'pendiente').length : null;
        return `
            <p class="mb-0"><a href="#" onclick="cambiarPestanaReal('panel-plan-tratamiento'); return false;">
                Plan de tratamiento: ${ETIQUETAS_ESTADO_PLAN[vigente.estado] || vigente.estado} · $${Number(vigente.total).toFixed(2)}
                ${pendientes !== null ? ` · ${pendientes} pendiente(s)` : ''} →
            </a></p>
        `;
    } catch (error) {
        return '<p class="resumen-plan-placeholder">Error al cargar el plan de tratamiento.</p>';
    }
}

// -----------------------------------------------------------------
// Sugerencia automatica al guardar una version de odontograma con
// hallazgos rojos, si el paciente no tiene ya un plan en borrador
// -----------------------------------------------------------------
async function sugerirPlanTrasGuardarOdontograma(odontogramaId, piezasGuardadas) {
    const tieneRojos = (piezasGuardadas || []).some((p) => p.color_tipo === 'rojo' && p.hallazgo);
    if (!tieneRojos) return;

    try {
        const planesExistentes = await api.get(`/api/planes-tratamiento/${pacienteId}`);
        if (planesExistentes.some((p) => ['borrador', 'presentado'].includes(p.estado))) return;
    } catch (error) {
        return;
    }

    if (confirm('Este odontograma tiene hallazgos en rojo (patología pendiente). ¿Generar un plan de tratamiento provisional a partir de esta versión?')) {
        await generarPlanTratamiento(odontogramaId, true);
    }
}

// -----------------------------------------------------------------
// Cierre del ciclo con evoluciones (Fase 4A, punto 5): al registrar una
// evolucion con piezas tratadas, se ofrece marcar realizados los items
// pendientes del plan que coincidan, y luego precargar la conversion de
// hallazgos en un nuevo odontograma de evolucion. Siempre con confirmacion.
// -----------------------------------------------------------------
async function manejarCierrePlanTrasEvolucion(evolucionId, piezas) {
    if (!piezas || piezas.length === 0) return;

    let pendientes;
    try {
        pendientes = await api.get(`/api/planes-tratamiento/${pacienteId}/pendientes-por-pieza?piezas=${piezas.join(',')}`);
    } catch (error) {
        return;
    }
    if (!pendientes || pendientes.length === 0) return;

    const lista = pendientes.map((p) => `- ${p.descripcion} (pieza ${p.piezas})`).join('\n');
    if (!confirm(`Hay ítems pendientes del plan de tratamiento que coinciden con las piezas tratadas:\n${lista}\n\n¿Marcarlos como realizados?`)) return;

    let ultimoResultado = null;
    for (const item of pendientes) {
        try {
            ultimoResultado = await api.put(`/api/planes-tratamiento/${pacienteId}/${item.plan_id}/items/${item.id}/marcar-realizado`, { evolucion_id: evolucionId });
        } catch (error) {
            // continua con los demas items aunque uno falle
        }
    }

    if (confirm('¿Registrar un odontograma de evolución convirtiendo estos hallazgos a su estado "realizado"? Podrá revisar los cambios antes de guardar.')) {
        if (typeof precargarConversionOdontograma === 'function') {
            precargarConversionOdontograma(pendientes);
        } else {
            alert('Abra la sección "Ficha clínica" → Odontograma para registrar la conversión manualmente.');
        }
    }

    if (ultimoResultado && ultimoResultado.todosResueltos) {
        if (confirm('Todos los ítems del plan de tratamiento están resueltos. ¿Marcar el plan como finalizado?')) {
            try {
                await api.put(`/api/planes-tratamiento/${pacienteId}/${pendientes[0].plan_id}/finalizar`);
            } catch (error) {
                alert('No se pudo finalizar el plan: ' + error.message);
            }
        }
    }

    if (typeof cargarPlanTab === 'function') await cargarPlanTab();
    if (typeof cargarPanelResumenPaciente === 'function') await cargarPanelResumenPaciente();
}

const CONVERSION_HALLAZGO_REALIZADO = {
    caries: 'obturado',
    endodoncia_indicada: 'endodoncia_realizada',
    extraccion_indicada: 'perdida_caries',
    corona_indicada: 'corona_realizada',
    sellante_necesario: 'sellante_realizado',
    implante_indicado: 'implante_realizado',
    protesis_fija_indicada: 'protesis_fija_realizada',
    protesis_removible_indicada: 'protesis_removible_realizada',
    protesis_total_indicada: 'protesis_total_realizada'
};

// Precarga en el odontograma (modo edicion) la conversion de los hallazgos
// resueltos por una evolucion. El doctor revisa y guarda como cualquier
// otra version (pasa por las validaciones de exclusion normales).
function precargarConversionOdontograma(items) {
    if (typeof iniciarNuevaVersionOdontograma !== 'function' || typeof cambiarPestanaReal !== 'function') {
        return;
    }
    cambiarPestanaReal('panel-ficha-clinica');
    iniciarNuevaVersionOdontograma('evolucion', true);

    items.forEach((item) => {
        const piezaPrincipal = String(item.piezas || '').split('-')[0].trim();
        const nuevoHallazgo = CONVERSION_HALLAZGO_REALIZADO[item.hallazgo_origen];
        if (!nuevoHallazgo) return;
        piezasVisibles.forEach((fila) => {
            if (fila.pieza !== piezaPrincipal || fila.hallazgo !== item.hallazgo_origen) return;
            fila.hallazgo = nuevoHallazgo;
            fila.color_tipo = 'azul';
        });
    });

    if (typeof renderizarSvgOdontograma === 'function') renderizarSvgOdontograma();
    if (typeof actualizarContadorHallazgos === 'function') actualizarContadorHallazgos();
}
