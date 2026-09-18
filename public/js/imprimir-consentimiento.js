// =====================================================================
// Vista de impresion de un consentimiento informado firmado (Fase 3C).
// Muestra siempre el documento tal como quedo firmado (contenido_final es
// inmutable). Si el consentimiento fue revocado, o si esta pagina abre
// directamente el acto de revocacion, se imprimen AMBOS documentos en
// orden cronologico (original primero).
// =====================================================================

(async () => {
    const parametros = new URLSearchParams(window.location.search);
    const pacienteId = parametros.get('pacienteId');
    const id = parametros.get('id');
    if (!pacienteId || !id) { mostrarErrorCarga('Faltan datos en la URL'); return; }

    try {
        const [paciente, consentimiento] = await Promise.all([
            api.get(`/api/pacientes/${pacienteId}`),
            api.get(`/api/consentimientos/${pacienteId}/${id}`)
        ]);
        document.title = `Dentify - Consentimiento - ${paciente.apellidos} ${paciente.nombres}`;
        renderizarImpresion(paciente, consentimiento);
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

function paginaDocumento(paciente, c) {
    const esRevocacion = c.decision === 'revocacion';
    const titulo = esRevocacion ? `Revocación de consentimiento — ${c.plantilla_nombre || ''}` : (c.plantilla_nombre || 'Consentimiento informado');
    const urlFirmaPaciente = `/api/consentimientos/${paciente.id}/${c.id}/firma/paciente`;
    const urlFirmaDoctor = c.firma_doctor_path ? `/api/consentimientos/${paciente.id}/${c.id}/firma/doctor` : null;
    const fechaHora = new Date(c.fecha_firma).toLocaleString('es-EC', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const hashCorto = (c.hash_documento || '').slice(0, 12);

    return `
        <div class="hoja-wd">
            ${membreteWorldDental()}
            <h1 class="wd-titulo-doc">${titulo}</h1>
            ${c.estado === 'anulado' ? `<div class="wd-aviso-anulado">ANULADO — ${c.motivo_anulacion || ''} (por ${c.anulado_por_nombre || '—'}, ${formatearFecha((c.anulado_en || '').slice(0, 10))})</div>` : ''}
            <div class="wd-cuerpo-doc">${c.contenido_final}</div>
            <div class="wd-firmas-fila">
                ${bloqueFirma(c.es_representante ? 'Firma del representante legal' : (esRevocacion ? 'Firma' : 'Firma del paciente'), urlFirmaPaciente, c.firmante_nombre, c.firmante_cedula)}
                ${urlFirmaDoctor ? bloqueFirma('Firma del doctor', urlFirmaDoctor, c.doctor_nombre, c.doctor_registro_prof) : ''}
            </div>
            <p class="wd-fecha-firma">Firmado el ${fechaHora}</p>
            <div class="wd-pie-verificacion">Documento generado por Dentify — verificación: ${hashCorto}</div>
        </div>
    `;
}

function renderizarImpresion(paciente, consentimiento) {
    const documentos = [];
    if (consentimiento.origen) documentos.push(consentimiento.origen);
    documentos.push(consentimiento);
    if (consentimiento.revocacion) documentos.push(consentimiento.revocacion);

    document.getElementById('contenido-impresion').innerHTML = documentos.map((c) => paginaDocumento(paciente, c)).join('');
}
