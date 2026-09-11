// =====================================================================
// Pagos, abonos y planes de cuotas en la ficha del paciente (Fase 4B).
// Pestaña "Pagos": resumen financiero (saldo pendiente por cuenta),
// planes de cuotas con cronograma en vivo, historial de pagos con recibo
// imprimible y anulacion solo-admin. Comparte pacienteId / usuarioActual /
// pacienteActual (paciente.js) y cambiarPestanaReal.
// =====================================================================

let datosPagosPaciente = null;      // { pagos, resumen, etiquetas_metodo }
let planesCuotasPaciente = [];      // planes de cuotas con cronograma
let conceptosSugeridosPago = { plan: null, items: [] };
let doctoresParaPago = [];
let pagoAAnular = null;
let planCuotasACancelar = null;
let ultimoPagoRegistrado = null;

const ETIQUETAS_ESTADO_CUOTA = { pagada: 'Pagada', parcial: 'Parcial', vencida: 'Vencida', por_vencer: 'Por vencer' };
const CLASE_ESTADO_CUOTA = { pagada: 'insignia--verde', parcial: 'insignia--dorado', vencida: 'insignia--rojo', por_vencer: '' };
const ETIQUETAS_ESTADO_PLAN_CUOTAS = { activo: 'Activo', completado: 'Completado', cancelado: 'Cancelado' };

function dineroPago(valor) {
    return '$' + Number(valor || 0).toFixed(2);
}

function fechaLocalHoyPago() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escaparHtmlPago(texto) {
    return String(texto == null ? '' : texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
    const btnRegistrar = document.getElementById('btn-registrar-pago');
    if (!btnRegistrar) return; // pagina sin ficha de paciente

    btnRegistrar.addEventListener('click', abrirModalRegistrarPago);
    document.getElementById('cerrar-modal-registrar-pago').addEventListener('click', cerrarModalRegistrarPago);
    document.getElementById('cancelar-modal-registrar-pago').addEventListener('click', cerrarModalRegistrarPago);
    document.getElementById('form-registrar-pago').addEventListener('submit', guardarPago);
    document.getElementById('pg-metodo').addEventListener('change', actualizarCampoReferenciaPago);
    document.getElementById('pg-vinculo').addEventListener('change', actualizarConceptosSugeridosPago);
    document.getElementById('pg-concepto').addEventListener('input', autocompletarMontoDesdeConcepto);
    vincularFechaLegible('pg-fecha', 'pg-fecha-legible');

    document.getElementById('cerrar-modal-pago-registrado').addEventListener('click', () => {
        document.getElementById('modal-pago-registrado').classList.remove('abierto');
    });
    document.getElementById('btn-imprimir-recibo-registrado').addEventListener('click', () => {
        if (ultimoPagoRegistrado) abrirReciboPago(ultimoPagoRegistrado.id);
    });

    document.getElementById('cancelar-modal-anular-pago').addEventListener('click', () => {
        document.getElementById('modal-anular-pago').classList.remove('abierto');
    });
    document.getElementById('confirmar-modal-anular-pago').addEventListener('click', confirmarAnularPago);

    document.getElementById('btn-crear-plan-cuotas').addEventListener('click', abrirModalPlanCuotas);
    document.getElementById('cerrar-modal-plan-cuotas').addEventListener('click', cerrarModalPlanCuotas);
    document.getElementById('cancelar-modal-plan-cuotas').addEventListener('click', cerrarModalPlanCuotas);
    document.getElementById('form-plan-cuotas').addEventListener('submit', guardarPlanCuotas);
    ['pc-monto-total', 'pc-entrada', 'pc-cuotas'].forEach((id) => {
        document.getElementById(id).addEventListener('input', recalcularMontoCuotaSugerido);
    });
    document.getElementById('pc-plan').addEventListener('change', sugerirMontoDesdePlanTratamiento);
    vincularFechaLegible('pc-fecha-inicio', 'pc-fecha-inicio-legible');

    document.getElementById('cancelar-modal-cancelar-plan-cuotas').addEventListener('click', () => {
        document.getElementById('modal-cancelar-plan-cuotas').classList.remove('abierto');
    });
    document.getElementById('confirmar-modal-cancelar-plan-cuotas').addEventListener('click', confirmarCancelarPlanCuotas);

    cargarPagosTab();
});

// -----------------------------------------------------------------
// Carga de la pestaña
// -----------------------------------------------------------------
async function cargarPagosTab() {
    const contenedorResumen = document.getElementById('resumen-financiero-paciente');
    if (!contenedorResumen) return;

    try {
        [datosPagosPaciente, planesCuotasPaciente] = await Promise.all([
            api.get(`/api/pagos/paciente/${pacienteId}`),
            api.get(`/api/planes-pago/paciente/${pacienteId}`)
        ]);
    } catch (error) {
        contenedorResumen.innerHTML = `<div class="alerta alerta--error">Error al cargar los pagos: ${error.message}</div>`;
        return;
    }

    renderResumenFinanciero(datosPagosPaciente.resumen);
    renderPlanesCuotas(planesCuotasPaciente);
    renderHistorialPagos(datosPagosPaciente.pagos);

    // Refresca el saldo del panel "Resumen del paciente" del odontograma si ya esta pintado
    const panelResumen = document.getElementById('odonto-panel-resumen');
    if (panelResumen && panelResumen.querySelector('.resumen-saldo')) {
        panelResumen.querySelector('.resumen-saldo').outerHTML = await obtenerResumenPagosHtml();
    }
}

function renderResumenFinanciero(resumen) {
    const contenedor = document.getElementById('resumen-financiero-paciente');
    const saldoClase = resumen.saldo > 0 ? 'resumen-financiero__saldo--pendiente' : 'resumen-financiero__saldo--al-dia';

    const cuentasHtml = resumen.cuentas.length === 0
        ? '<p class="texto-secundario mb-0">Sin cuentas exigibles: el paciente no tiene un plan de tratamiento aceptado ni un plan de cuotas activo. Los pagos se registran al contado.</p>'
        : `
            <div class="tabla-envoltorio">
                <table>
                    <thead><tr><th>Cuenta</th><th>Total</th><th>Pagado</th><th>Saldo</th></tr></thead>
                    <tbody>
                        ${resumen.cuentas.map((c) => `
                            <tr>
                                <td>
                                    ${c.tipo === 'plan_pago'
                                        ? `Plan de cuotas: ${escaparHtmlPago(c.descripcion)}${c.plan_id && !String(c.descripcion).includes('#' + c.plan_id) ? ` <span class="texto-secundario">(plan de tratamiento #${c.plan_id})</span>` : ''}`
                                        : `<a href="#" onclick="cambiarPestanaReal('panel-plan-tratamiento'); return false;">${escaparHtmlPago(c.descripcion)}</a> <span class="texto-secundario">(${c.estado_plan === 'en_curso' ? 'en curso' : c.estado_plan})</span>`}
                                </td>
                                <td>${dineroPago(c.total)}</td>
                                <td>${dineroPago(c.pagado)}</td>
                                <td><strong>${dineroPago(c.saldo)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

    contenedor.innerHTML = `
        <div class="resumen-financiero">
            <div class="resumen-financiero__bloque">
                <div class="resumen-financiero__etiqueta">Saldo pendiente</div>
                <div class="resumen-financiero__saldo ${saldoClase}">${dineroPago(resumen.saldo)}</div>
                <div class="resumen-financiero__nota">${resumen.saldo > 0 ? 'Planes aceptados y cuotas por cobrar' : 'Al día'}</div>
            </div>
            <div class="resumen-financiero__bloque">
                <div class="resumen-financiero__etiqueta">Total exigible</div>
                <div class="resumen-financiero__valor">${dineroPago(resumen.total_exigible)}</div>
            </div>
            <div class="resumen-financiero__bloque">
                <div class="resumen-financiero__etiqueta">Pagado (vinculado)</div>
                <div class="resumen-financiero__valor">${dineroPago(resumen.total_pagado)}</div>
            </div>
            <div class="resumen-financiero__bloque">
                <div class="resumen-financiero__etiqueta">Pagos al contado</div>
                <div class="resumen-financiero__valor">${dineroPago(resumen.pagos_al_contado)}</div>
            </div>
        </div>
        ${cuentasHtml}
    `;
}

function renderPlanesCuotas(planes) {
    const contenedor = document.getElementById('lista-planes-cuotas');
    if (!planes || planes.length === 0) {
        contenedor.innerHTML = '<p class="texto-secundario mb-0">Este paciente no tiene planes de cuotas.</p>';
        return;
    }

    contenedor.innerHTML = planes.map((pp) => {
        const cr = pp.cronograma;
        const esAdmin = usuarioActual && usuarioActual.rol === 'admin';
        const claseEstado = pp.estado === 'activo' ? 'insignia--dorado' : pp.estado === 'completado' ? 'insignia--verde' : 'insignia--rojo';
        return `
            <details class="plan-cuotas" ${pp.estado === 'activo' ? 'open' : ''}>
                <summary class="plan-cuotas__cabecera">
                    <span>
                        <strong>${escaparHtmlPago(pp.descripcion)}</strong>
                        <span class="insignia ${claseEstado}" style="margin-left:8px;">${ETIQUETAS_ESTADO_PLAN_CUOTAS[pp.estado] || pp.estado}</span>
                        ${pp.plan_id && !String(pp.descripcion).includes('#' + pp.plan_id) ? `<span class="texto-secundario" style="margin-left:8px;">Plan de tratamiento #${pp.plan_id}</span>` : ''}
                    </span>
                    <span class="plan-cuotas__resumen">
                        Total ${dineroPago(pp.monto_total)} · Pagado ${dineroPago(cr.total_pagado)} · <strong>Saldo ${dineroPago(cr.saldo)}</strong>
                        ${cr.cuotas_vencidas > 0 ? `<span class="insignia insignia--rojo" style="margin-left:8px;">${cr.cuotas_vencidas} vencida${cr.cuotas_vencidas === 1 ? '' : 's'} · ${dineroPago(cr.monto_vencido)}</span>` : ''}
                    </span>
                </summary>
                <div class="plan-cuotas__detalle">
                    <p class="texto-secundario" style="font-size:0.8rem;">
                        Entrada ${dineroPago(pp.entrada)} · ${pp.numero_cuotas} cuota${pp.numero_cuotas === 1 ? '' : 's'} de ${dineroPago(pp.monto_cuota)} · día ${pp.dia_pago_mes} de cada mes · inicio ${formatearFecha(pp.fecha_inicio)}
                        ${pp.notas ? ` · ${escaparHtmlPago(pp.notas)}` : ''}
                        ${pp.estado === 'cancelado' && pp.motivo_cancelacion ? ` · <span style="color:var(--rojo-alerta);">Cancelado: ${escaparHtmlPago(pp.motivo_cancelacion)}</span>` : ''}
                    </p>
                    <div class="tabla-envoltorio">
                        <table class="tabla-cronograma">
                            <thead><tr><th>Cuota</th><th>Fecha esperada</th><th>Monto</th><th>Pagado</th><th>Saldo</th><th>Estado</th></tr></thead>
                            <tbody>
                                ${cr.items.map((it) => `
                                    <tr class="${it.vencida ? 'fila-cuota-vencida' : ''}">
                                        <td>${it.etiqueta}</td>
                                        <td>${formatearFecha(it.fecha_esperada)}</td>
                                        <td>${dineroPago(it.monto)}</td>
                                        <td>${dineroPago(it.pagado)}</td>
                                        <td>${dineroPago(it.saldo)}</td>
                                        <td>
                                            <span class="insignia ${CLASE_ESTADO_CUOTA[it.estado] || ''}">${ETIQUETAS_ESTADO_CUOTA[it.estado] || it.estado}</span>
                                            ${it.vencida ? `<span class="texto-secundario" style="font-size:0.75rem; margin-left:6px;">${it.dias_atraso} día${it.dias_atraso === 1 ? '' : 's'} de atraso</span>` : ''}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    ${cr.excedente > 0 ? `<p class="texto-secundario mb-0" style="margin-top:8px; font-size:0.8rem;">Excedente pagado sobre el acuerdo: ${dineroPago(cr.excedente)}</p>` : ''}
                    <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
                        ${pp.estado === 'activo' ? `<button type="button" class="btn btn-primario btn-sm" onclick="abrirModalRegistrarPago(${pp.id})">Registrar abono a este plan</button>` : ''}
                        ${pp.estado === 'activo' && esAdmin ? `<button type="button" class="btn btn-peligro btn-sm" onclick="abrirModalCancelarPlanCuotas(${pp.id})">Cancelar plan de cuotas</button>` : ''}
                    </div>
                </div>
            </details>
        `;
    }).join('');
}

function renderHistorialPagos(pagos) {
    const contenedor = document.getElementById('lista-pagos');
    if (!pagos || pagos.length === 0) {
        contenedor.innerHTML = '<p class="texto-secundario mb-0">Este paciente aún no tiene pagos registrados.</p>';
        return;
    }
    const etiquetas = datosPagosPaciente.etiquetas_metodo || {};
    const esAdmin = usuarioActual && usuarioActual.rol === 'admin';

    contenedor.innerHTML = `
        <div class="tabla-envoltorio">
            <table>
                <thead>
                    <tr><th>Recibo</th><th>Fecha</th><th>Concepto</th><th>Vínculo</th><th>Método</th><th>Monto</th><th>Registró</th><th></th></tr>
                </thead>
                <tbody>
                    ${pagos.map((p) => `
                        <tr class="${p.anulado ? 'fila-pago-anulada' : ''}">
                            <td style="white-space:nowrap;">${p.numero_recibo}</td>
                            <td style="white-space:nowrap;">${formatearFecha(p.fecha_pago)}</td>
                            <td>
                                ${escaparHtmlPago(p.concepto)}
                                ${p.anulado ? `<div class="pago-anulado-motivo">Anulado por ${escaparHtmlPago(p.anulado_por_nombre || '')}: ${escaparHtmlPago(p.motivo_anulacion)}</div>` : ''}
                            </td>
                            <td>${describirVinculoPago(p)}</td>
                            <td>${etiquetas[p.metodo] || p.metodo}${p.referencia ? `<div class="texto-secundario" style="font-size:0.75rem;">Ref. ${escaparHtmlPago(p.referencia)}</div>` : ''}</td>
                            <td><strong>${dineroPago(p.monto)}</strong></td>
                            <td>${escaparHtmlPago(p.registrado_por_nombre || '')}${p.doctor_nombre ? `<div class="texto-secundario" style="font-size:0.75rem;">${escaparHtmlPago(p.doctor_nombre)}</div>` : ''}</td>
                            <td style="white-space:nowrap;">
                                <button type="button" class="btn-texto" onclick="abrirReciboPago(${p.id})">Recibo</button>
                                ${esAdmin && !p.anulado ? `<button type="button" class="btn-texto" style="color: var(--rojo-alerta);" onclick="abrirModalAnularPago(${p.id})">Anular</button>` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function describirVinculoPago(p) {
    if (p.plan_pago_id) return `Plan de cuotas: ${escaparHtmlPago(p.plan_pago_descripcion || '#' + p.plan_pago_id)}`;
    if (p.plan_id) return `Plan de tratamiento #${p.plan_id}`;
    return '<span class="texto-secundario">Al contado</span>';
}

function abrirReciboPago(id) {
    window.open(`/imprimir-recibo.html?id=${id}`, '_blank');
}

// -----------------------------------------------------------------
// Registrar pago
// -----------------------------------------------------------------
async function abrirModalRegistrarPago(planPagoIdPreseleccionado) {
    const errorDiv = document.getElementById('error-modal-registrar-pago');
    errorDiv.innerHTML = '';
    document.getElementById('form-registrar-pago').reset();
    document.getElementById('pg-fecha').value = fechaLocalHoyPago();
    sincronizarFechaLegible('pg-fecha', 'pg-fecha-legible');
    document.getElementById('pg-fecha').max = fechaLocalHoyPago();
    actualizarCampoReferenciaPago();

    try {
        const [resumen, conceptos, doctores] = await Promise.all([
            api.get(`/api/pagos/paciente/${pacienteId}/resumen`),
            api.get(`/api/pagos/paciente/${pacienteId}/conceptos-sugeridos`),
            doctoresParaPago.length ? Promise.resolve(doctoresParaPago) : api.get('/api/doctores')
        ]);
        doctoresParaPago = doctores;
        conceptosSugeridosPago = conceptos;
        planesCuotasPaciente = resumen.planes_pago;

        const selectDoctor = document.getElementById('pg-doctor');
        selectDoctor.innerHTML = '<option value="">Sin especificar</option>' +
            doctores.map((d) => `<option value="${d.id}">${escaparHtmlPago(d.nombre_completo)}</option>`).join('');
        if (usuarioActual && usuarioActual.doctor_id && doctores.some((d) => d.id === usuarioActual.doctor_id)) {
            selectDoctor.value = usuarioActual.doctor_id;
        }

        // Opciones de vinculo: planes de cuotas activos, planes de tratamiento
        // aceptados/en_curso (no cubiertos por un plan de cuotas), sin vincular.
        const selectVinculo = document.getElementById('pg-vinculo');
        const opciones = [];
        resumen.cuentas.forEach((c) => {
            if (c.tipo === 'plan_pago') {
                opciones.push({ valor: `pp:${c.id}`, texto: `Plan de cuotas: ${c.descripcion} — saldo ${dineroPago(c.saldo)}` });
            } else {
                opciones.push({ valor: `pt:${c.id}`, texto: `${c.descripcion} (${c.estado_plan === 'en_curso' ? 'en curso' : 'aceptado'}) — saldo ${dineroPago(c.saldo)}` });
            }
        });
        opciones.push({ valor: '', texto: 'Sin vincular (pago al contado)' });
        selectVinculo.innerHTML = opciones.map((o) => `<option value="${o.valor}">${escaparHtmlPago(o.texto)}</option>`).join('');
        if (planPagoIdPreseleccionado && opciones.some((o) => o.valor === `pp:${planPagoIdPreseleccionado}`)) {
            selectVinculo.value = `pp:${planPagoIdPreseleccionado}`;
        } else {
            selectVinculo.value = opciones[0].valor; // por defecto: vincular a la primera cuenta exigible
        }

        // Resumen financiero arriba del modal (solo si hay cuentas exigibles)
        const bloqueResumen = document.getElementById('resumen-financiero-modal');
        if (resumen.cuentas.length > 0) {
            bloqueResumen.classList.remove('oculto');
            bloqueResumen.innerHTML = `
                <div><span>Total exigible</span><strong>${dineroPago(resumen.total_exigible)}</strong></div>
                <div><span>Total pagado</span><strong>${dineroPago(resumen.total_pagado)}</strong></div>
                <div class="resumen-financiero-modal__saldo"><span>Saldo pendiente</span><strong>${dineroPago(resumen.saldo)}</strong></div>
            `;
        } else {
            bloqueResumen.classList.add('oculto');
            bloqueResumen.innerHTML = '';
        }

        actualizarConceptosSugeridosPago();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }

    document.getElementById('modal-registrar-pago').classList.add('abierto');
    document.getElementById('pg-concepto').focus();
}

function cerrarModalRegistrarPago() {
    document.getElementById('modal-registrar-pago').classList.remove('abierto');
}

function actualizarCampoReferenciaPago() {
    const metodo = document.getElementById('pg-metodo').value;
    const campo = document.getElementById('campo-pg-referencia');
    campo.classList.toggle('oculto', !['transferencia', 'tarjeta'].includes(metodo));
    document.querySelector('#campo-pg-referencia label').textContent =
        metodo === 'tarjeta' ? 'Nro. de voucher / referencia' : 'Nro. de comprobante de transferencia';
}

// Sugerencias de concepto: items del plan aceptado (si el vinculo es un plan
// de tratamiento o un plan de cuotas ligado a el) o las cuotas pendientes
// del cronograma (si el vinculo es un plan de cuotas).
function actualizarConceptosSugeridosPago() {
    const vinculo = document.getElementById('pg-vinculo').value;
    const datalist = document.getElementById('pg-conceptos-sugeridos');
    const ayuda = document.getElementById('pg-concepto-ayuda');
    const sugerencias = [];

    if (vinculo.startsWith('pp:')) {
        const pp = planesCuotasPaciente.find((p) => p.id === Number(vinculo.slice(3)));
        if (pp && pp.cronograma) {
            pp.cronograma.items.filter((it) => it.saldo > 0).forEach((it) => {
                sugerencias.push({ texto: `${it.etiqueta} — ${pp.descripcion}`, monto: it.saldo });
            });
        }
    }
    if (vinculo.startsWith('pt:') || (vinculo.startsWith('pp:') && conceptosSugeridosPago.plan)) {
        conceptosSugeridosPago.items.forEach((it) => {
            sugerencias.push({ texto: `${it.descripcion}${it.piezas ? ' (pieza ' + it.piezas + ')' : ''}`, monto: it.precio, plan_item_id: it.id, estado: it.estado_item });
        });
    }

    datalist.innerHTML = sugerencias.map((s) => `<option value="${escaparHtmlPago(s.texto)}"></option>`).join('');
    datalist.dataset.sugerencias = JSON.stringify(sugerencias);
    ayuda.textContent = sugerencias.length > 0
        ? 'Puede elegir una sugerencia del plan (se precarga el monto) o escribir un concepto libre.'
        : 'Texto libre.';
}

function autocompletarMontoDesdeConcepto() {
    const datalist = document.getElementById('pg-conceptos-sugeridos');
    let sugerencias = [];
    try { sugerencias = JSON.parse(datalist.dataset.sugerencias || '[]'); } catch (e) { sugerencias = []; }
    const texto = document.getElementById('pg-concepto').value;
    const coincidencia = sugerencias.find((s) => s.texto === texto);
    const campoMonto = document.getElementById('pg-monto');
    if (coincidencia) {
        campoMonto.value = Number(coincidencia.monto).toFixed(2);
        campoMonto.dataset.planItemId = coincidencia.plan_item_id || '';
    } else {
        campoMonto.dataset.planItemId = '';
    }
}

async function guardarPago(evento) {
    evento.preventDefault();
    const errorDiv = document.getElementById('error-modal-registrar-pago');
    errorDiv.innerHTML = '';
    const boton = document.getElementById('btn-guardar-pago');

    const vinculo = document.getElementById('pg-vinculo').value;
    const datos = {
        paciente_id: Number(pacienteId),
        concepto: document.getElementById('pg-concepto').value.trim(),
        monto: Number(document.getElementById('pg-monto').value),
        metodo: document.getElementById('pg-metodo').value,
        referencia: document.getElementById('pg-referencia').value.trim() || null,
        fecha_pago: document.getElementById('pg-fecha').value,
        doctor_id: document.getElementById('pg-doctor').value || null,
        plan_id: vinculo.startsWith('pt:') ? Number(vinculo.slice(3)) : null,
        plan_pago_id: vinculo.startsWith('pp:') ? Number(vinculo.slice(3)) : null,
        plan_item_id: vinculo.startsWith('pt:') && document.getElementById('pg-monto').dataset.planItemId
            ? Number(document.getElementById('pg-monto').dataset.planItemId) : null
    };

    if (!datos.concepto) { errorDiv.innerHTML = '<div class="alerta alerta--error">Debe indicar el concepto del pago</div>'; return; }
    if (!(datos.monto > 0)) { errorDiv.innerHTML = '<div class="alerta alerta--error">El monto debe ser mayor que cero</div>'; return; }

    boton.disabled = true;
    try {
        const pago = await api.post('/api/pagos', datos);
        ultimoPagoRegistrado = pago;
        cerrarModalRegistrarPago();
        document.getElementById('detalle-pago-registrado').innerHTML = `
            <p class="mb-0">Recibo <strong>${pago.numero_recibo}</strong> · ${formatearFecha(pago.fecha_pago)}</p>
            <p class="mb-0">${escaparHtmlPago(pago.concepto)}</p>
            <p class="mb-0"><strong>${dineroPago(pago.monto)}</strong> · ${escaparHtmlPago(pago.metodo_etiqueta)}</p>
            <p class="texto-secundario mb-0" style="font-size:0.8rem; margin-top:8px;">${escaparHtmlPago(pago.monto_en_letras)}</p>
        `;
        document.getElementById('modal-pago-registrado').classList.add('abierto');
        await cargarPagosTab();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    } finally {
        boton.disabled = false;
    }
}

// -----------------------------------------------------------------
// Anular pago (solo admin)
// -----------------------------------------------------------------
function abrirModalAnularPago(id) {
    pagoAAnular = (datosPagosPaciente.pagos || []).find((p) => p.id === id);
    if (!pagoAAnular) return;
    document.getElementById('error-modal-anular-pago').innerHTML = '';
    document.getElementById('anular-pago-motivo').value = '';
    document.getElementById('detalle-anular-pago').innerHTML =
        `<strong>${pagoAAnular.numero_recibo}</strong> · ${formatearFecha(pagoAAnular.fecha_pago)} · ${escaparHtmlPago(pagoAAnular.concepto)} · <strong>${dineroPago(pagoAAnular.monto)}</strong>`;
    document.getElementById('modal-anular-pago').classList.add('abierto');
}

async function confirmarAnularPago() {
    const errorDiv = document.getElementById('error-modal-anular-pago');
    errorDiv.innerHTML = '';
    const motivo = document.getElementById('anular-pago-motivo').value.trim();
    if (!motivo) { errorDiv.innerHTML = '<div class="alerta alerta--error">Debe indicar el motivo de la anulación</div>'; return; }
    try {
        await api.put(`/api/pagos/${pagoAAnular.id}/anular`, { motivo });
        document.getElementById('modal-anular-pago').classList.remove('abierto');
        document.getElementById('mensaje-pagos').innerHTML =
            `<div class="alerta alerta--exito">Pago ${pagoAAnular.numero_recibo} anulado. Queda visible tachado y ya no suma en saldos ni en caja.</div>`;
        await cargarPagosTab();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

// -----------------------------------------------------------------
// Plan de cuotas
// -----------------------------------------------------------------
async function abrirModalPlanCuotas() {
    const errorDiv = document.getElementById('error-modal-plan-cuotas');
    errorDiv.innerHTML = '';
    document.getElementById('form-plan-cuotas').reset();
    document.getElementById('pc-entrada').value = '0';
    document.getElementById('pc-cuotas').value = '12';
    document.getElementById('pc-dia-pago').value = '15';
    document.getElementById('pc-fecha-inicio').value = fechaLocalHoyPago();
    sincronizarFechaLegible('pc-fecha-inicio', 'pc-fecha-inicio-legible');

    // Planes de tratamiento aceptados/en_curso sin plan de cuotas activo
    const select = document.getElementById('pc-plan');
    select.innerHTML = '<option value="">Sin vincular</option>';
    try {
        const resumen = await api.get(`/api/pagos/paciente/${pacienteId}/resumen`);
        resumen.cuentas.filter((c) => c.tipo === 'plan_tratamiento').forEach((c) => {
            const opcion = document.createElement('option');
            opcion.value = c.id;
            opcion.textContent = `${c.descripcion} — total ${dineroPago(c.total)}, pagado ${dineroPago(c.pagado)}`;
            opcion.dataset.total = c.total;
            opcion.dataset.pagado = c.pagado;
            select.appendChild(opcion);
        });
        if (select.options.length > 1) {
            select.selectedIndex = 1;
            sugerirMontoDesdePlanTratamiento();
        }
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }

    recalcularMontoCuotaSugerido();
    document.getElementById('modal-plan-cuotas').classList.add('abierto');
}

function cerrarModalPlanCuotas() {
    document.getElementById('modal-plan-cuotas').classList.remove('abierto');
}

function sugerirMontoDesdePlanTratamiento() {
    const select = document.getElementById('pc-plan');
    const opcion = select.options[select.selectedIndex];
    if (!opcion || !opcion.value) return;
    document.getElementById('pc-monto-total').value = Number(opcion.dataset.total).toFixed(2);
    // Lo ya pagado al plan de tratamiento se propone como entrada
    if (Number(opcion.dataset.pagado) > 0) document.getElementById('pc-entrada').value = Number(opcion.dataset.pagado).toFixed(2);
    if (!document.getElementById('pc-descripcion').value) document.getElementById('pc-descripcion').value = `Cuotas del plan de tratamiento #${opcion.value}`;
    recalcularMontoCuotaSugerido();
}

function recalcularMontoCuotaSugerido() {
    const total = Number(document.getElementById('pc-monto-total').value) || 0;
    const entrada = Number(document.getElementById('pc-entrada').value) || 0;
    const cuotas = parseInt(document.getElementById('pc-cuotas').value, 10) || 0;
    const campo = document.getElementById('pc-monto-cuota');
    const ayuda = document.getElementById('pc-monto-cuota-ayuda');
    if (total > entrada && cuotas > 0) {
        const sugerido = Math.floor(((total - entrada) / cuotas) * 100) / 100;
        campo.value = sugerido.toFixed(2);
        ayuda.textContent = `(${total.toFixed(2)} − ${entrada.toFixed(2)}) ÷ ${cuotas} = ${sugerido.toFixed(2)}. Puede ajustarlo; la última cuota absorbe la diferencia.`;
    } else {
        ayuda.textContent = 'Se calcula como (total − entrada) ÷ cuotas; puede ajustarlo.';
    }
}

async function guardarPlanCuotas(evento) {
    evento.preventDefault();
    const errorDiv = document.getElementById('error-modal-plan-cuotas');
    errorDiv.innerHTML = '';
    const datos = {
        paciente_id: Number(pacienteId),
        plan_id: document.getElementById('pc-plan').value || null,
        descripcion: document.getElementById('pc-descripcion').value.trim(),
        monto_total: Number(document.getElementById('pc-monto-total').value),
        entrada: Number(document.getElementById('pc-entrada').value) || 0,
        numero_cuotas: parseInt(document.getElementById('pc-cuotas').value, 10),
        monto_cuota: Number(document.getElementById('pc-monto-cuota').value),
        dia_pago_mes: parseInt(document.getElementById('pc-dia-pago').value, 10),
        fecha_inicio: document.getElementById('pc-fecha-inicio').value,
        notas: document.getElementById('pc-notas').value.trim() || null
    };
    try {
        await api.post('/api/planes-pago', datos);
        cerrarModalPlanCuotas();
        document.getElementById('mensaje-pagos').innerHTML = '<div class="alerta alerta--exito">Plan de cuotas creado. Registre la entrada y cada cuota con "Registrar abono a este plan".</div>';
        await cargarPagosTab();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

function abrirModalCancelarPlanCuotas(id) {
    planCuotasACancelar = id;
    document.getElementById('error-modal-cancelar-plan-cuotas').innerHTML = '';
    document.getElementById('cancelar-plan-cuotas-motivo').value = '';
    document.getElementById('modal-cancelar-plan-cuotas').classList.add('abierto');
}

async function confirmarCancelarPlanCuotas() {
    const errorDiv = document.getElementById('error-modal-cancelar-plan-cuotas');
    errorDiv.innerHTML = '';
    const motivo = document.getElementById('cancelar-plan-cuotas-motivo').value.trim();
    if (!motivo) { errorDiv.innerHTML = '<div class="alerta alerta--error">Debe indicar el motivo</div>'; return; }
    try {
        await api.put(`/api/planes-pago/${planCuotasACancelar}/cancelar`, { motivo });
        document.getElementById('modal-cancelar-plan-cuotas').classList.remove('abierto');
        await cargarPagosTab();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

// -----------------------------------------------------------------
// Linea de saldo para el panel "Resumen del paciente" del odontograma
// -----------------------------------------------------------------
async function obtenerResumenPagosHtml() {
    try {
        const resumen = await api.get(`/api/pagos/paciente/${pacienteId}/resumen`);
        const clase = resumen.saldo > 0 ? 'resumen-saldo--pendiente' : 'resumen-saldo--al-dia';
        const texto = resumen.cuentas.length === 0
            ? 'Sin saldo pendiente (sin cuentas exigibles)'
            : `Saldo pendiente: ${dineroPago(resumen.saldo)}${resumen.saldo <= 0 ? ' · al día' : ''}`;
        return `<p class="resumen-saldo ${clase} mb-0"><a href="#" onclick="cambiarPestanaReal('panel-pagos'); return false;">${texto} →</a></p>`;
    } catch (error) {
        return '<p class="resumen-saldo mb-0 texto-secundario">Error al cargar el saldo.</p>';
    }
}
