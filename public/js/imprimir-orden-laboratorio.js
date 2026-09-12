// =====================================================================
// Orden de trabajo de laboratorio imprimible (Fase 4C): media hoja A5
// con el membrete World Dental, numero secuencial LAB-AAAA-####, lo que
// el laboratorio necesita para trabajar y la fecha en que se lo pide.
//
// IMPORTANTE: la orden sale de la clinica, asi que NO lleva datos
// sensibles del paciente (sin cedula, sin telefono, sin notas clinicas)
// - misma regla que los eventos que se envian a Google Calendar. Solo el
// nombre, para que el laboratorio pueda identificar el caso.
// =====================================================================

(async () => {
    const parametros = new URLSearchParams(window.location.search);
    const id = parametros.get('id');
    if (!id) { mostrarErrorImpresion('Falta el identificador del trabajo en la URL'); return; }

    try {
        const trabajo = await api.get(`/api/laboratorio/trabajos/${id}`);
        document.title = `Dentify - Orden ${trabajo.numero_orden}`;
        renderizarOrden(trabajo);
    } catch (error) {
        mostrarErrorImpresion('No se pudo cargar la orden: ' + error.message);
    }
})();

function renderizarOrden(t) {
    const fechaEnvio = t.fecha_envio ? formatearFecha(t.fecha_envio) : '—';
    const fechaEstimada = t.fecha_estimada ? formatearFecha(t.fecha_estimada) : '—';

    document.getElementById('contenido-impresion').innerHTML = `
        <div class="hoja-wd hoja-wd--a5">
            ${membreteWorldDental()}
            ${t.estado === 'cancelado' ? `<div class="wd-aviso-anulado">ORDEN CANCELADA — ${escaparHtmlImpresion(t.motivo_cancelacion || '')}</div>` : ''}
            <div class="recibo-cabecera">
                <h1 class="wd-titulo-doc recibo-titulo">Orden de trabajo</h1>
                <div class="recibo-numero">${escaparHtmlImpresion(t.numero_orden)}</div>
            </div>

            <table class="recibo-tabla">
                <tr><th>Laboratorio</th><td>${escaparHtmlImpresion(t.laboratorio_nombre)}${t.laboratorio_contacto ? ` · ${escaparHtmlImpresion(t.laboratorio_contacto)}` : ''}</td></tr>
                <tr><th>Paciente</th><td>${escaparHtmlImpresion(t.paciente_apellidos)} ${escaparHtmlImpresion(t.paciente_nombres)}</td></tr>
                <tr><th>Doctor</th><td>${escaparHtmlImpresion(t.doctor_nombre || '—')}</td></tr>
                <tr><th>Trabajo</th><td>${escaparHtmlImpresion(t.tipo_trabajo)}${t.descripcion ? `<div class="recibo-vinculo">${escaparHtmlImpresion(t.descripcion)}</div>` : ''}</td></tr>
                <tr><th>Piezas</th><td>${escaparHtmlImpresion(t.piezas || '—')}</td></tr>
                <tr><th>Color / tono</th><td>${escaparHtmlImpresion(t.color || '—')}</td></tr>
                <tr><th>Fecha de envío</th><td>${fechaEnvio}</td></tr>
                <tr><th>Entrega solicitada</th><td>${fechaEstimada}</td></tr>
                ${t.trabajo_padre_numero ? `<tr><th>Ajuste de</th><td>${escaparHtmlImpresion(t.trabajo_padre_numero)}</td></tr>` : ''}
            </table>

            ${t.indicaciones ? `
                <div class="orden-lab-indicaciones">
                    <h2 class="wd-subtitulo-doc">Indicaciones</h2>
                    <p>${escaparHtmlImpresion(t.indicaciones).replace(/\n/g, '<br>')}</p>
                </div>` : ''}

            <div class="wd-firmas-fila recibo-firmas">
                <div class="wd-firma-bloque">
                    <div class="wd-firma-bloque__vacio"></div>
                    <div class="wd-firma-bloque__linea"></div>
                    <div class="wd-firma-bloque__etiqueta">Entregado por — World Dental</div>
                </div>
                <div class="wd-firma-bloque">
                    <div class="wd-firma-bloque__vacio"></div>
                    <div class="wd-firma-bloque__linea"></div>
                    <div class="wd-firma-bloque__etiqueta">Recibido por — Laboratorio</div>
                </div>
            </div>

            <div class="wd-pie-verificacion">Orden generada en Dentify${t.creado_por_nombre ? ' por ' + escaparHtmlImpresion(t.creado_por_nombre) : ''} · Documento interno de trabajo</div>
        </div>
    `;
}
