// =====================================================================
// Utilidades compartidas por las vistas de impresion de la Fase 4B
// (recibo de pago y cierre de caja): membrete World Dental (el mismo de
// consentimientos y planes de tratamiento) y formato de dinero.
// =====================================================================

function membreteWorldDental() {
    return `
        <div class="wd-membrete">
            <div class="wd-membrete__marca">World <span>Dental</span></div>
            <div class="wd-membrete__direccion">
                Vital Center, Piso 2 · José Joaquín de Olmedo N2-33 y Luisa Proaño<br>
                Conocoto, Quito, Ecuador
            </div>
        </div>
        <div class="wd-membrete__regla"></div>
    `;
}

function dineroImpresion(valor) {
    return '$' + Number(valor || 0).toFixed(2);
}

function escaparHtmlImpresion(texto) {
    return String(texto == null ? '' : texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mostrarErrorImpresion(mensaje) {
    document.getElementById('contenido-impresion').innerHTML =
        `<p class="no-imprimir" style="padding:40px; text-align:center; color:var(--rojo-alerta);">${mensaje}</p>`;
}
