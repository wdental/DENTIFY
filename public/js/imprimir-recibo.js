// =====================================================================
// Recibo de pago imprimible (Fase 4B): media hoja A5 con el membrete
// World Dental, numero de recibo secuencial (REC-AAAA-####), paciente,
// concepto, monto en cifras y en letras, metodo, fecha y quien registro.
// Un pago anulado tambien se puede imprimir, con la marca "ANULADO".
// =====================================================================

(async () => {
    const parametros = new URLSearchParams(window.location.search);
    const id = parametros.get('id');
    if (!id) { mostrarErrorImpresion('Falta el identificador del pago en la URL'); return; }

    try {
        const pago = await api.get(`/api/pagos/${id}`);
        document.title = `Dentify - Recibo ${pago.numero_recibo}`;
        renderizarRecibo(pago);
    } catch (error) {
        mostrarErrorImpresion('No se pudo cargar el recibo: ' + error.message);
    }
})();

function renderizarRecibo(pago) {
    const fechaLarga = new Date(pago.fecha_pago + 'T00:00:00').toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });
    const registrado = new Date(pago.fecha_creacion.replace(' ', 'T')).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const vinculo = pago.plan_pago_id
        ? `Abono al plan de cuotas: ${escaparHtmlImpresion(pago.plan_pago_descripcion || '#' + pago.plan_pago_id)}`
        : pago.plan_id ? `Abono al plan de tratamiento #${pago.plan_id}` : 'Pago al contado';

    document.getElementById('contenido-impresion').innerHTML = `
        <div class="hoja-wd hoja-wd--a5">
            ${membreteWorldDental()}
            ${pago.anulado ? `<div class="wd-aviso-anulado">RECIBO ANULADO — ${escaparHtmlImpresion(pago.motivo_anulacion || '')}</div>` : ''}
            <div class="recibo-cabecera">
                <h1 class="wd-titulo-doc recibo-titulo">Recibo de pago</h1>
                <div class="recibo-numero">${escaparHtmlImpresion(pago.numero_recibo)}</div>
            </div>

            <table class="recibo-tabla">
                <tr><th>Fecha</th><td>${fechaLarga}</td></tr>
                <tr><th>Recibido de</th><td>${escaparHtmlImpresion(pago.paciente_apellidos)} ${escaparHtmlImpresion(pago.paciente_nombres)}${pago.paciente_cedula ? ` · C.I. ${escaparHtmlImpresion(pago.paciente_cedula)}` : ''}</td></tr>
                <tr><th>Historia clínica</th><td>${escaparHtmlImpresion(pago.paciente_historia || '—')}</td></tr>
                <tr><th>Concepto</th><td>${escaparHtmlImpresion(pago.concepto)}<div class="recibo-vinculo">${vinculo}</div></td></tr>
                <tr><th>Método de pago</th><td>${escaparHtmlImpresion(pago.metodo_etiqueta)}${pago.referencia ? ` · Ref. ${escaparHtmlImpresion(pago.referencia)}` : ''}</td></tr>
                ${pago.doctor_nombre ? `<tr><th>Atendió</th><td>${escaparHtmlImpresion(pago.doctor_nombre)}</td></tr>` : ''}
            </table>

            <div class="recibo-monto">
                <div class="recibo-monto__cifra">${dineroImpresion(pago.monto)}</div>
                <div class="recibo-monto__letras">Son: ${escaparHtmlImpresion(pago.monto_en_letras)}</div>
            </div>

            <div class="wd-firmas-fila recibo-firmas">
                <div class="wd-firma-bloque">
                    <div class="wd-firma-bloque__vacio"></div>
                    <div class="wd-firma-bloque__linea"></div>
                    <div class="wd-firma-bloque__etiqueta">Recibí conforme — World Dental</div>
                    <div class="wd-firma-bloque__nombre">${escaparHtmlImpresion(pago.registrado_por_nombre || '')}</div>
                </div>
            </div>

            <div class="wd-pie-verificacion">Registrado en Dentify el ${registrado} por ${escaparHtmlImpresion(pago.registrado_por_nombre || '')} · Documento interno, no sustituye a la factura</div>
        </div>
    `;
}
