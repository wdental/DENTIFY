// =====================================================================
// Caja (Fase 4B): vista Dia (pagos de la fecha agrupados por metodo, con
// totales) y vista Mes (totales por dia y por metodo). Los pagos anulados
// se muestran tachados y no suman. "Cerrar caja del dia" abre la vista
// de impresion del resumen (informativa, no bloquea nada).
// =====================================================================

const ORDEN_METODOS_CAJA = ['efectivo', 'transferencia', 'tarjeta', 'otro'];

function dineroCaja(valor) {
    return '$' + Number(valor || 0).toFixed(2);
}

function fechaLocalHoyCaja() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escaparHtmlCaja(texto) {
    return String(texto == null ? '' : texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

(async () => {
    const usuario = await inicializarSidebar();
    if (!usuario) return;

    document.querySelectorAll('.pestana').forEach((boton) => {
        boton.addEventListener('click', () => {
            document.querySelectorAll('.pestana').forEach((b) => b.classList.toggle('activa', b === boton));
            document.querySelectorAll('.panel-pestana').forEach((p) => p.classList.toggle('activo', p.id === boton.dataset.panel));
        });
    });

    const parametros = new URLSearchParams(window.location.search);
    const campoFecha = document.getElementById('caja-fecha');
    campoFecha.value = /^\d{4}-\d{2}-\d{2}$/.test(parametros.get('fecha') || '') ? parametros.get('fecha') : fechaLocalHoyCaja();
    campoFecha.max = fechaLocalHoyCaja();
    vincularFechaLegible('caja-fecha', 'caja-fecha-legible', true);
    campoFecha.addEventListener('change', cargarCajaDia);
    document.getElementById('btn-caja-hoy').addEventListener('click', () => {
        campoFecha.value = fechaLocalHoyCaja();
        sincronizarFechaLegible('caja-fecha', 'caja-fecha-legible', true);
        cargarCajaDia();
    });
    document.getElementById('btn-cerrar-caja').addEventListener('click', () => {
        window.open(`/imprimir-cierre-caja.html?fecha=${campoFecha.value}`, '_blank');
    });

    const campoMes = document.getElementById('caja-mes');
    campoMes.value = fechaLocalHoyCaja().slice(0, 7);
    campoMes.max = fechaLocalHoyCaja().slice(0, 7);
    campoMes.addEventListener('change', cargarCajaMes);
    document.getElementById('btn-caja-mes-actual').addEventListener('click', () => {
        campoMes.value = fechaLocalHoyCaja().slice(0, 7);
        cargarCajaMes();
    });

    await cargarCajaDia();
    await cargarCajaMes();
})();

// -----------------------------------------------------------------
// Vista Dia
// -----------------------------------------------------------------
async function cargarCajaDia() {
    const contenedor = document.getElementById('caja-dia-contenido');
    const fecha = document.getElementById('caja-fecha').value;
    if (!fecha) return;
    contenedor.innerHTML = '<p class="texto-secundario">Cargando...</p>';

    try {
        const datos = await api.get(`/api/pagos/caja/dia?fecha=${fecha}`);
        contenedor.innerHTML = renderTotalesCaja(datos.totales, `${datos.totales.cantidad} pago${datos.totales.cantidad === 1 ? '' : 's'} válido${datos.totales.cantidad === 1 ? '' : 's'}${datos.totales.anulados ? ` · ${datos.totales.anulados} anulado${datos.totales.anulados === 1 ? '' : 's'}` : ''}`)
            + renderPagosPorMetodo(datos.pagos, datos.etiquetas_metodo);
    } catch (error) {
        contenedor.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

function renderTotalesCaja(totales, notaGeneral) {
    return `
        <div class="caja-totales">
            <div class="caja-totales__bloque caja-totales__bloque--general">
                <div class="caja-totales__etiqueta">Total general</div>
                <div class="caja-totales__valor">${dineroCaja(totales.total)}</div>
                <div class="caja-totales__nota">${notaGeneral}</div>
            </div>
            ${totales.por_metodo.map((m) => `
                <div class="caja-totales__bloque">
                    <div class="caja-totales__etiqueta">${escaparHtmlCaja(m.etiqueta)}</div>
                    <div class="caja-totales__valor">${dineroCaja(m.total)}</div>
                    <div class="caja-totales__nota">${m.cantidad} pago${m.cantidad === 1 ? '' : 's'}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderPagosPorMetodo(pagos, etiquetas) {
    if (!pagos || pagos.length === 0) {
        return '<p class="texto-secundario mb-0">No hay pagos registrados en esta fecha.</p>';
    }

    return ORDEN_METODOS_CAJA.map((metodo) => {
        const delMetodo = pagos.filter((p) => p.metodo === metodo);
        if (delMetodo.length === 0) return '';
        const subtotal = delMetodo.filter((p) => !p.anulado).reduce((s, p) => s + Number(p.monto), 0);
        return `
            <div class="caja-grupo-metodo">
                <div class="caja-grupo-metodo__titulo">
                    ${escaparHtmlCaja(etiquetas[metodo] || metodo)}
                    <span>Subtotal ${dineroCaja(subtotal)}</span>
                </div>
                <div class="tabla-envoltorio">
                    <table>
                        <thead><tr><th>Recibo</th><th>Paciente</th><th>Concepto</th><th>Referencia</th><th>Registró</th><th>Monto</th><th></th></tr></thead>
                        <tbody>
                            ${delMetodo.map((p) => `
                                <tr class="${p.anulado ? 'fila-pago-anulada' : ''}">
                                    <td style="white-space:nowrap;">${p.numero_recibo}</td>
                                    <td><a href="/paciente.html?id=${p.paciente_id}">${escaparHtmlCaja(p.paciente_apellidos)} ${escaparHtmlCaja(p.paciente_nombres)}</a></td>
                                    <td>${escaparHtmlCaja(p.concepto)}${p.anulado ? `<div class="pago-anulado-motivo">Anulado: ${escaparHtmlCaja(p.motivo_anulacion)}</div>` : ''}</td>
                                    <td>${escaparHtmlCaja(p.referencia || '—')}</td>
                                    <td>${escaparHtmlCaja(p.registrado_por_nombre || '')}</td>
                                    <td><strong>${dineroCaja(p.monto)}</strong></td>
                                    <td><a class="btn-texto" href="/imprimir-recibo.html?id=${p.id}" target="_blank">Recibo</a></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }).join('');
}

// -----------------------------------------------------------------
// Vista Mes
// -----------------------------------------------------------------
async function cargarCajaMes() {
    const contenedor = document.getElementById('caja-mes-contenido');
    const mes = document.getElementById('caja-mes').value;
    if (!mes) return;
    contenedor.innerHTML = '<p class="texto-secundario">Cargando...</p>';

    try {
        const datos = await api.get(`/api/pagos/caja/mes?mes=${mes}`);
        const [anio, numeroMes] = mes.split('-').map(Number);
        const nombreMesCrudo = new Date(anio, numeroMes - 1, 1).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' });
        const nombreMes = nombreMesCrudo.charAt(0).toUpperCase() + nombreMesCrudo.slice(1);

        let tablaHtml = '<p class="texto-secundario mb-0">No hay pagos registrados en este mes.</p>';
        if (datos.dias.length > 0) {
            tablaHtml = `
                <div class="tabla-envoltorio">
                    <table>
                        <thead>
                            <tr>
                                <th>Día</th>
                                ${ORDEN_METODOS_CAJA.map((m) => `<th>${escaparHtmlCaja(datos.etiquetas_metodo[m])}</th>`).join('')}
                                <th>Pagos</th><th>Total del día</th><th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${datos.dias.map((d) => `
                                <tr>
                                    <td>${formatearFechaConDia(d.fecha)}</td>
                                    ${ORDEN_METODOS_CAJA.map((m) => `<td>${d[m] > 0 ? dineroCaja(d[m]) : '<span class="texto-secundario">—</span>'}</td>`).join('')}
                                    <td>${d.cantidad}${d.anulados ? ` <span class="texto-secundario">(+${d.anulados} anulado${d.anulados === 1 ? '' : 's'})</span>` : ''}</td>
                                    <td><strong>${dineroCaja(d.total)}</strong></td>
                                    <td><a class="btn-texto" href="/caja.html?fecha=${d.fecha}">Ver día</a></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        contenedor.innerHTML = `
            <h3>${nombreMes}</h3>
            ${renderTotalesCaja(datos.totales, `${datos.totales.cantidad} pago${datos.totales.cantidad === 1 ? '' : 's'} válido${datos.totales.cantidad === 1 ? '' : 's'} en ${datos.dias.length} día${datos.dias.length === 1 ? '' : 's'}`)}
            ${tablaHtml}
        `;
    } catch (error) {
        contenedor.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}
