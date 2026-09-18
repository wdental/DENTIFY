// =====================================================================
// Vista de impresion de un plan de tratamiento ACEPTADO (Fase 4A). Solo
// imprime planes ya firmados: el contenido_final quedo congelado en el
// servidor al momento de la aceptacion (igual que un consentimiento).
// =====================================================================

(async () => {
    const parametros = new URLSearchParams(window.location.search);
    const pacienteId = parametros.get('pacienteId');
    const id = parametros.get('id');
    if (!pacienteId || !id) { mostrarErrorCarga('Faltan datos en la URL'); return; }

    try {
        const [paciente, plan] = await Promise.all([
            api.get(`/api/pacientes/${pacienteId}`),
            api.get(`/api/planes-tratamiento/${pacienteId}/${id}`)
        ]);
        if (!plan.contenido_final) { mostrarErrorCarga('Este plan aún no ha sido firmado.'); return; }
        document.title = `Dentify - Plan de tratamiento - ${paciente.apellidos} ${paciente.nombres}`;
        renderizarImpresion(paciente, plan);
    } catch (error) {
        mostrarErrorCarga('No se pudo cargar el documento: ' + error.message);
    }
})();

function mostrarErrorCarga(mensaje) {
    document.getElementById('contenido-impresion').innerHTML = `<p class="no-imprimir" style="padding:40px; text-align:center; color:var(--rojo-alerta);">${mensaje}</p>`;
}

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

function bloqueFirma(etiqueta, urlImagen, nombre, cedula) {
    return `
        <div class="wd-firma-bloque">
            ${urlImagen ? `<img src="${urlImagen}" class="wd-firma-bloque__img" alt="${etiqueta}">` : '<div class="wd-firma-bloque__vacio"></div>'}
            <div class="wd-firma-bloque__linea"></div>
            <div class="wd-firma-bloque__etiqueta">${etiqueta}</div>
            <div class="wd-firma-bloque__nombre">${nombre || '—'}${cedula ? ' · C.I. ' + cedula : ''}</div>
        </div>
    `;
}

function renderizarImpresion(paciente, plan) {
    const urlFirmaPaciente = `/api/planes-tratamiento/${paciente.id}/${plan.id}/firma/paciente`;
    const fechaHora = new Date(plan.fecha_aceptado).toLocaleString('es-EC', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const hashCorto = (plan.hash_documento || '').slice(0, 12);

    document.getElementById('contenido-impresion').innerHTML = `
        <div class="hoja-wd">
            ${membreteWorldDental()}
            <h1 class="wd-titulo-doc">Plan de tratamiento</h1>
            <div class="wd-cuerpo-doc">${plan.contenido_final}</div>
            <div class="wd-firmas-fila">
                ${bloqueFirma(plan.es_representante ? 'Firma del representante legal' : 'Firma del paciente', urlFirmaPaciente, plan.firmante_nombre, plan.firmante_cedula)}
            </div>
            <p class="wd-fecha-firma">Firmado el ${fechaHora}</p>
            <div class="wd-pie-verificacion">Documento generado por Dentify — verificación: ${hashCorto}</div>
        </div>
    `;
}
