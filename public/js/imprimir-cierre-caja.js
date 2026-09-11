// =====================================================================
// Cierre de caja del dia (Fase 4B): resumen imprimible en A4 con el
// membrete World Dental, totales por metodo, cantidad de transacciones,
// detalle de pagos (los anulados tachados, sin sumar) y espacio para la
// firma de quien cierra. Es informativo: deja constancia impresa, no
// bloquea registrar pagos posteriores con esa fecha.
// =====================================================================

const ORDEN_METODOS_CIERRE = ['efectivo', 'transferencia', 'tarjeta', 'otro'];

(async () => {
    const parametros = new URLSearchParams(window.location.search);
    const fecha = parametros.get('fecha');
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { mostrarErrorImpresion('Falta la fecha en la URL'); return; }

    try {
        const [datos, sesion] = await Promise.all([
            api.get(`/api/pagos/caja/dia?fecha=${fecha}`),
            api.get('/api/auth/yo')
        ]);
        document.title = `Dentify - Cierre de caja ${formatearFecha(fecha)}`;
        renderizarCierre(datos, sesion.usuario);
    } catch (error) {
        mostrarErrorImpresion('No se pudo cargar el cierre de caja: ' + error.message);
    }
})();

function renderizarCierre(datos, usuario) {
    const generado = new Date().toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const totales = datos.totales;

    const gruposHtml = ORDEN_METODOS_CIERRE.map((metodo) => {
        const delMetodo = datos.pagos.filter((p) => p.metodo === metodo);
        if (delMetodo.length === 0) return '';
        const subtotal = delMetodo.filter((p) => !p.anulado).reduce((s, p) => s + Number(p.monto), 0);
        return `
            <div class="cierre-subtitulo">${escaparHtmlImpresion(datos.etiquetas_metodo[metodo])}</div>
            <table class="tabla-cierre">
                <thead><tr><th>Recibo</th><th>Paciente</th><th>Concepto</th><th>Referencia</th><th>Registró</th><th class="num">Monto</th></tr></thead>
                <tbody>
                    ${delMetodo.map((p) => `
                        <tr class="${p.anulado ? 'anulado' : ''}">
                            <td>${p.numero_recibo}</td>
                            <td>${escaparHtmlImpresion(p.paciente_apellidos)} ${escaparHtmlImpresion(p.paciente_nombres)}</td>
                            <td>${escaparHtmlImpresion(p.concepto)}${p.anulado ? ` (ANULADO: ${escaparHtmlImpresion(p.motivo_anulacion)})` : ''}</td>
                            <td>${escaparHtmlImpresion(p.referencia || '—')}</td>
                            <td>${escaparHtmlImpresion(p.registrado_por_nombre || '')}</td>
                            <td class="num">${dineroImpresion(p.monto)}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot><tr><td colspan="5">Subtotal ${escaparHtmlImpresion(datos.etiquetas_metodo[metodo])} (sin anulados)</td><td class="num">${dineroImpresion(subtotal)}</td></tr></tfoot>
            </table>
        `;
    }).join('');

    document.getElementById('contenido-impresion').innerHTML = `
        <div class="hoja-wd">
            ${membreteWorldDental()}
            <h1 class="wd-titulo-doc">Cierre de caja del día</h1>
            <p style="text-align:center; margin:-10px 0 10px 0; font-size:11px;">${formatearFechaConDia(datos.fecha)}</p>

            <div class="cierre-resumen">
                <div class="cierre-resumen__bloque cierre-resumen__bloque--total">
                    <div class="cierre-resumen__etiqueta">Total general</div>
                    <div class="cierre-resumen__valor">${dineroImpresion(totales.total)}</div>
                    <div class="cierre-resumen__nota">${totales.cantidad} transacción${totales.cantidad === 1 ? '' : 'es'} válida${totales.cantidad === 1 ? '' : 's'}${totales.anulados ? ` · ${totales.anulados} anulada${totales.anulados === 1 ? '' : 's'}` : ''}</div>
                </div>
                ${totales.por_metodo.map((m) => `
                    <div class="cierre-resumen__bloque">
                        <div class="cierre-resumen__etiqueta">${escaparHtmlImpresion(m.etiqueta)}</div>
                        <div class="cierre-resumen__valor">${dineroImpresion(m.total)}</div>
                        <div class="cierre-resumen__nota">${m.cantidad} transacción${m.cantidad === 1 ? '' : 'es'}</div>
                    </div>
                `).join('')}
            </div>

            ${datos.pagos.length === 0 ? '<p style="text-align:center; color:var(--texto-secundario);">No se registraron pagos en esta fecha.</p>' : gruposHtml}

            <div class="wd-firmas-fila cierre-firmas">
                <div class="wd-firma-bloque">
                    <div class="wd-firma-bloque__vacio"></div>
                    <div class="wd-firma-bloque__linea"></div>
                    <div class="wd-firma-bloque__etiqueta">Cierra la caja</div>
                    <div class="wd-firma-bloque__nombre">${escaparHtmlImpresion(usuario ? usuario.nombre : '')}</div>
                </div>
                <div class="wd-firma-bloque">
                    <div class="wd-firma-bloque__vacio"></div>
                    <div class="wd-firma-bloque__linea"></div>
                    <div class="wd-firma-bloque__etiqueta">Revisa / recibe</div>
                    <div class="wd-firma-bloque__nombre">&nbsp;</div>
                </div>
            </div>

            <div class="wd-pie-verificacion">Generado por Dentify el ${generado} · Documento interno de control de caja</div>
        </div>
    `;
}
