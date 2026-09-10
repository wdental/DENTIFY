// =====================================================================
// Ficha clinica odontologica (Formulario 033 MSP Ecuador), secciones
// B, C, D, E, F, G, I, J. La seccion H (odontograma) vive en odontograma.js.
// Comparte pacienteActual / pacienteId / usuarioActual, declarados en paciente.js.
// =====================================================================

const ANTECEDENTES_PERSONALES = [
    { codigo: 'alergia_antibiotico', etiqueta: '1. Alergia a antibiótico' },
    { codigo: 'alergia_anestesia', etiqueta: '2. Alergia a anestesia' },
    { codigo: 'hemorragias', etiqueta: '3. Hemorragias' },
    { codigo: 'vih_sida', etiqueta: '4. VIH/SIDA' },
    { codigo: 'tuberculosis', etiqueta: '5. Tuberculosis' },
    { codigo: 'asma', etiqueta: '6. Asma' },
    { codigo: 'diabetes', etiqueta: '7. Diabetes' },
    { codigo: 'hipertension', etiqueta: '8. Hipertensión arterial' },
    { codigo: 'enf_cardiaca', etiqueta: '9. Enfermedad cardíaca' },
    { codigo: 'otro', etiqueta: '10. Otro', conTexto: true }
];

const ANTECEDENTES_FAMILIARES = [
    { codigo: 'cardiopatia', etiqueta: '1. Cardiopatía' },
    { codigo: 'hipertension', etiqueta: '2. Hipertensión arterial' },
    { codigo: 'enf_cerebrovascular', etiqueta: '3. Enf. C. vascular' },
    { codigo: 'endocrino_metabolico', etiqueta: '4. Endócrino metabólico' },
    { codigo: 'cancer', etiqueta: '5. Cáncer' },
    { codigo: 'tuberculosis', etiqueta: '6. Tuberculosis' },
    { codigo: 'enf_mental', etiqueta: '7. Enf. mental' },
    { codigo: 'enf_infecciosa', etiqueta: '8. Enf. infecciosa' },
    { codigo: 'malformacion', etiqueta: '9. Malformación' },
    { codigo: 'otro', etiqueta: '10. Otro', conTexto: true }
];

const EXAMEN_ESTOMATOGNATICO_ITEMS = [
    { num: 1, etiqueta: 'Labios' },
    { num: 2, etiqueta: 'Mejillas' },
    { num: 3, etiqueta: 'Maxilar superior' },
    { num: 4, etiqueta: 'Maxilar inferior' },
    { num: 5, etiqueta: 'Lengua' },
    { num: 6, etiqueta: 'Paladar' },
    { num: 7, etiqueta: 'Piso de la boca' },
    { num: 8, etiqueta: 'Carrillos' },
    { num: 9, etiqueta: 'Glándulas salivales' },
    { num: 10, etiqueta: 'Orofaringe' },
    { num: 11, etiqueta: 'A.T.M.' },
    { num: 12, etiqueta: 'Ganglios' },
    { num: 13, etiqueta: 'Otros' }
];

const PIEZAS_HIGIENE = [
    { etiqueta: '16 / 17 / 55' },
    { etiqueta: '11 / 21 / 51' },
    { etiqueta: '26 / 27 / 65' },
    { etiqueta: '36 / 37 / 75' },
    { etiqueta: '31 / 41 / 71' },
    { etiqueta: '46 / 47 / 85' }
];

let fichaClinicaActual = null;

// -----------------------------------------------------------------
// Arranque: se ejecuta cuando la pestana existe (paciente.js ya cargo
// pacienteActual antes de llamar cargarFichaClinica desde su propio flujo)
// -----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    construirGrillaChecks('grilla-antecedentes-personales', ANTECEDENTES_PERSONALES);
    construirGrillaChecks('grilla-antecedentes-familiares', ANTECEDENTES_FAMILIARES);
    construirListaEstomatognatico();
    construirTablaHigiene();
    inicializarAvisoDeSalida();
});

function construirGrillaChecks(contenedorId, items) {
    const contenedor = document.getElementById(contenedorId);
    contenedor.innerHTML = items.map((item) => `
        <div>
            <label class="check-item">
                <input type="checkbox" data-codigo="${item.codigo}">
                ${item.etiqueta}
            </label>
            ${item.conTexto ? `<div class="check-item__extra"><input type="text" data-codigo-texto="${item.codigo}" placeholder="Especificar..."></div>` : ''}
        </div>
    `).join('');
}

function construirListaEstomatognatico() {
    const contenedor = document.getElementById('lista-examen-estomatognatico');
    contenedor.innerHTML = EXAMEN_ESTOMATOGNATICO_ITEMS.map((item) => `
        <div style="border-bottom: 1px solid var(--gris-claro); padding: 10px 0;">
            <label class="check-item">
                <input type="checkbox" data-item="${item.num}" onchange="alternarDescripcionEstomatognatico(${item.num})">
                ${item.num}. ${item.etiqueta} — con patología
            </label>
            <div class="check-item__extra oculto" id="descripcion-envoltura-${item.num}">
                <input type="text" id="descripcion-item-${item.num}" placeholder="Describir la patología (region ${item.num})">
            </div>
        </div>
    `).join('');
}

function alternarDescripcionEstomatognatico(num) {
    const marcado = document.querySelector(`#lista-examen-estomatognatico input[data-item="${num}"]`).checked;
    document.getElementById(`descripcion-envoltura-${num}`).classList.toggle('oculto', !marcado);
}

function construirTablaHigiene() {
    const cuerpo = document.getElementById('cuerpo-tabla-higiene');
    cuerpo.innerHTML = PIEZAS_HIGIENE.map((fila, indice) => `
        <tr>
            <td>${fila.etiqueta}</td>
            <td><select id="higiene-placa-${indice}" onchange="recalcularHigiene()">${opcionesNumericas(0, 3)}</select></td>
            <td><select id="higiene-calculo-${indice}" onchange="recalcularHigiene()">${opcionesNumericas(0, 3)}</select></td>
            <td><select id="higiene-gingivitis-${indice}" onchange="recalcularHigiene()">${opcionesNumericas(0, 1)}</select></td>
        </tr>
    `).join('');
}

function opcionesNumericas(desde, hasta) {
    let html = '';
    for (let i = desde; i <= hasta; i++) html += `<option value="${i}">${i}</option>`;
    return html;
}

function recalcularHigiene() {
    let placa = 0, calculo = 0, gingivitis = 0;
    PIEZAS_HIGIENE.forEach((_, indice) => {
        placa += Number(document.getElementById(`higiene-placa-${indice}`).value || 0);
        calculo += Number(document.getElementById(`higiene-calculo-${indice}`).value || 0);
        gingivitis += Number(document.getElementById(`higiene-gingivitis-${indice}`).value || 0);
    });
    document.getElementById('total-placa').textContent = placa;
    document.getElementById('total-calculo').textContent = calculo;
    document.getElementById('total-gingivitis').textContent = gingivitis;
}

function recalcularCpo() {
    const permC = Number(document.getElementById('cpo-perm-c').value || 0);
    const permP = Number(document.getElementById('cpo-perm-p').value || 0);
    const permO = Number(document.getElementById('cpo-perm-o').value || 0);
    document.getElementById('cpo-perm-total').textContent = permC + permP + permO;

    const tempC = Number(document.getElementById('cpo-temp-c').value || 0);
    const tempE = Number(document.getElementById('cpo-temp-e').value || 0);
    const tempO = Number(document.getElementById('cpo-temp-o').value || 0);
    document.getElementById('cpo-temp-total').textContent = tempC + tempE + tempO;
}

// -----------------------------------------------------------------
// Carga general de la ficha clinica (llamada desde paciente.js)
// -----------------------------------------------------------------
async function cargarFichaClinica() {
    try {
        fichaClinicaActual = await api.get(`/api/ficha-clinica/${pacienteId}`);
    } catch (error) {
        console.error('Error al cargar la ficha clinica:', error);
        return;
    }

    const embarazadaEnvoltura = document.getElementById('fc-embarazada-envoltura');
    embarazadaEnvoltura.classList.toggle('oculto', pacienteActual.sexo !== 'F');

    const motivo = fichaClinicaActual.motivo_consulta_json || {};
    document.getElementById('fc-motivo-texto').value = motivo.texto || '';
    document.getElementById('fc-embarazada').value = motivo.embarazada || '';
    marcarCompletitud('motivo-consulta', !!motivo.texto);

    const enfermedad = fichaClinicaActual.enfermedad_actual_json || {};
    document.getElementById('fc-enfermedad-texto').value = enfermedad.texto || '';
    marcarCompletitud('enfermedad-actual', !!enfermedad.texto);

    aplicarAntecedentes('antecedentes-personales', ANTECEDENTES_PERSONALES, fichaClinicaActual.antecedentes_personales_json || {});
    aplicarAntecedentes('antecedentes-familiares', ANTECEDENTES_FAMILIARES, fichaClinicaActual.antecedentes_familiares_json || {});

    const vitales = fichaClinicaActual.constantes_vitales_json || {};
    document.getElementById('fc-temperatura').value = vitales.temperatura ?? '';
    document.getElementById('fc-pulso').value = vitales.pulso ?? '';
    document.getElementById('fc-frecuencia-respiratoria').value = vitales.frecuencia_respiratoria ?? '';
    document.getElementById('fc-presion-arterial').value = vitales.presion_arterial || '';
    marcarCompletitud('constantes-vitales', !!(vitales.temperatura || vitales.pulso || vitales.presion_arterial));

    const examen = (fichaClinicaActual.examen_estomatognatico_json || {}).items || {};
    let algunItemConPatologia = false;
    EXAMEN_ESTOMATOGNATICO_ITEMS.forEach((item) => {
        const dato = examen[item.num];
        const checkbox = document.querySelector(`#lista-examen-estomatognatico input[data-item="${item.num}"]`);
        checkbox.checked = !!(dato && dato.patologia);
        document.getElementById(`descripcion-item-${item.num}`).value = (dato && dato.descripcion) || '';
        document.getElementById(`descripcion-envoltura-${item.num}`).classList.toggle('oculto', !checkbox.checked);
        if (checkbox.checked) algunItemConPatologia = true;
    });
    marcarCompletitud('examen-estomatognatico', algunItemConPatologia);

    const indicadores = fichaClinicaActual.indicadores_salud_bucal_json || {};
    const higiene = indicadores.higiene || [];
    PIEZAS_HIGIENE.forEach((_, indice) => {
        const fila = higiene[indice] || {};
        document.getElementById(`higiene-placa-${indice}`).value = fila.placa ?? 0;
        document.getElementById(`higiene-calculo-${indice}`).value = fila.calculo ?? 0;
        document.getElementById(`higiene-gingivitis-${indice}`).value = fila.gingivitis ?? 0;
    });
    recalcularHigiene();
    document.getElementById('fc-enf-periodontal').value = indicadores.periodontal || '';
    document.getElementById('fc-oclusion').value = indicadores.oclusion || '';
    document.getElementById('fc-fluorosis').value = indicadores.fluorosis || 'ninguna';
    marcarCompletitud('indicadores-salud-bucal', !!(indicadores.periodontal || indicadores.oclusion));

    const cpo = fichaClinicaActual.indices_cpo_json || {};
    const permanente = cpo.permanente || {};
    const temporal = cpo.temporal || {};
    document.getElementById('cpo-perm-c').value = permanente.c ?? '';
    document.getElementById('cpo-perm-p').value = permanente.p ?? '';
    document.getElementById('cpo-perm-o').value = permanente.o ?? '';
    document.getElementById('cpo-temp-c').value = temporal.c ?? '';
    document.getElementById('cpo-temp-e').value = temporal.e ?? '';
    document.getElementById('cpo-temp-o').value = temporal.o ?? '';
    recalcularCpo();
    marcarCompletitud('indices-cpo', cpo.permanente !== undefined || cpo.temporal !== undefined);

    await actualizarBannerAlertaMedica();
}

function aplicarAntecedentes(prefijo, catalogo, datos) {
    const marcados = new Set(datos.marcados || []);
    catalogo.forEach((item) => {
        const checkbox = document.querySelector(`#grilla-${prefijo} input[data-codigo="${item.codigo}"]`);
        checkbox.checked = marcados.has(item.codigo);
        if (item.conTexto) {
            const campoTexto = document.querySelector(`#grilla-${prefijo} input[data-codigo-texto="${item.codigo}"]`);
            campoTexto.value = datos.otro_texto || '';
        }
    });
    const observacionesId = prefijo === 'antecedentes-personales' ? 'fc-personales-observaciones' : 'fc-familiares-observaciones';
    document.getElementById(observacionesId).value = datos.observaciones || '';
    marcarCompletitud(prefijo, marcados.size > 0 || !!datos.observaciones);
}

function marcarCompletitud(seccion, completo) {
    const punto = document.getElementById(`punto-${seccion}`);
    if (punto) punto.classList.toggle('seccion-clinica__punto--completo', !!completo);
}

// -----------------------------------------------------------------
// Recoleccion de datos por seccion (sin guardar - eso lo hace el boton
// unico "Guardar ficha clinica", ver mas abajo)
// -----------------------------------------------------------------
function recopilarMotivoConsulta() {
    return {
        texto: document.getElementById('fc-motivo-texto').value.trim(),
        embarazada: document.getElementById('fc-embarazada').value || null
    };
}

function recopilarEnfermedadActual() {
    return { texto: document.getElementById('fc-enfermedad-texto').value.trim() };
}

function recopilarAntecedentesPersonales() {
    return leerAntecedentes('antecedentes-personales', ANTECEDENTES_PERSONALES, 'fc-personales-observaciones');
}

function recopilarAntecedentesFamiliares() {
    return leerAntecedentes('antecedentes-familiares', ANTECEDENTES_FAMILIARES, 'fc-familiares-observaciones');
}

function leerAntecedentes(prefijo, catalogo, observacionesId) {
    const marcados = [];
    let otroTexto = '';
    catalogo.forEach((item) => {
        const checkbox = document.querySelector(`#grilla-${prefijo} input[data-codigo="${item.codigo}"]`);
        if (checkbox.checked) marcados.push(item.codigo);
        if (item.conTexto) {
            otroTexto = document.querySelector(`#grilla-${prefijo} input[data-codigo-texto="${item.codigo}"]`).value.trim();
        }
    });
    return {
        marcados,
        otro_texto: otroTexto || null,
        observaciones: document.getElementById(observacionesId).value.trim() || null
    };
}

function recopilarConstantesVitales() {
    return {
        temperatura: valorNumericoONulo('fc-temperatura'),
        pulso: valorNumericoONulo('fc-pulso'),
        frecuencia_respiratoria: valorNumericoONulo('fc-frecuencia-respiratoria'),
        presion_arterial: document.getElementById('fc-presion-arterial').value.trim() || null
    };
}

function valorNumericoONulo(id) {
    const valor = document.getElementById(id).value;
    return valor === '' ? null : Number(valor);
}

function recopilarExamenEstomatognatico() {
    const items = {};
    EXAMEN_ESTOMATOGNATICO_ITEMS.forEach((item) => {
        const marcado = document.querySelector(`#lista-examen-estomatognatico input[data-item="${item.num}"]`).checked;
        const descripcion = document.getElementById(`descripcion-item-${item.num}`).value.trim();
        if (marcado || descripcion) {
            items[item.num] = { patologia: marcado, descripcion: descripcion || null };
        }
    });
    return { items };
}

function recopilarIndicadoresSaludBucal() {
    const higiene = PIEZAS_HIGIENE.map((_, indice) => ({
        placa: Number(document.getElementById(`higiene-placa-${indice}`).value || 0),
        calculo: Number(document.getElementById(`higiene-calculo-${indice}`).value || 0),
        gingivitis: Number(document.getElementById(`higiene-gingivitis-${indice}`).value || 0)
    }));
    return {
        higiene,
        periodontal: document.getElementById('fc-enf-periodontal').value || null,
        oclusion: document.getElementById('fc-oclusion').value || null,
        fluorosis: document.getElementById('fc-fluorosis').value || 'ninguna'
    };
}

function recopilarIndicesCpo() {
    const datos = {
        permanente: {
            c: Number(document.getElementById('cpo-perm-c').value || 0),
            p: Number(document.getElementById('cpo-perm-p').value || 0),
            o: Number(document.getElementById('cpo-perm-o').value || 0)
        },
        temporal: {
            c: Number(document.getElementById('cpo-temp-c').value || 0),
            e: Number(document.getElementById('cpo-temp-e').value || 0),
            o: Number(document.getElementById('cpo-temp-o').value || 0)
        }
    };
    datos.permanente.total = datos.permanente.c + datos.permanente.p + datos.permanente.o;
    datos.temporal.total = datos.temporal.c + datos.temporal.e + datos.temporal.o;
    return datos;
}

async function usarCpoSugerido() {
    try {
        const sugerido = await api.get(`/api/odontograma/${pacienteId}/cpo-sugerido`);
        document.getElementById('cpo-perm-c').value = sugerido.permanente.c;
        document.getElementById('cpo-perm-p').value = sugerido.permanente.p;
        document.getElementById('cpo-perm-o').value = sugerido.permanente.o;
        document.getElementById('cpo-temp-c').value = sugerido.temporal.c;
        document.getElementById('cpo-temp-e').value = sugerido.temporal.e;
        document.getElementById('cpo-temp-o').value = sugerido.temporal.o;
        recalcularCpo();
        marcarCambioPendiente('secciones'); // .value= no dispara 'input', se marca a mano
    } catch (error) {
        alert('No se pudo calcular el sugerido: ' + error.message);
    }
}

// -----------------------------------------------------------------
// Guardado UNIFICADO: un solo boton flotante guarda las 8 secciones
// (B, C, D, E, F, G, I, J) de una vez. El odontograma (H) conserva su
// propio "Guardar nueva version" (acto formal de versionado aparte).
// -----------------------------------------------------------------
async function guardarFichaCompleta() {
    const boton = document.getElementById('btn-guardar-ficha-flotante');
    if (boton) boton.disabled = true;

    try {
        const motivo = recopilarMotivoConsulta();
        const enfermedad = recopilarEnfermedadActual();
        const personales = recopilarAntecedentesPersonales();
        const familiares = recopilarAntecedentesFamiliares();
        const vitales = recopilarConstantesVitales();
        const examen = recopilarExamenEstomatognatico();
        const indicadores = recopilarIndicadoresSaludBucal();
        const cpo = recopilarIndicesCpo();

        await Promise.all([
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/motivo-consulta`, motivo),
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/enfermedad-actual`, enfermedad),
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/antecedentes-personales`, personales),
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/antecedentes-familiares`, familiares),
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/constantes-vitales`, vitales),
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/examen-estomatognatico`, examen),
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/indicadores-salud-bucal`, indicadores),
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/indices-cpo`, cpo)
        ]);

        marcarCompletitud('motivo-consulta', !!motivo.texto);
        marcarCompletitud('enfermedad-actual', !!enfermedad.texto);
        marcarCompletitud('antecedentes-personales', personales.marcados.length > 0 || !!personales.observaciones);
        marcarCompletitud('antecedentes-familiares', familiares.marcados.length > 0 || !!familiares.observaciones);
        marcarCompletitud('constantes-vitales', !!(vitales.temperatura || vitales.pulso || vitales.presion_arterial));
        marcarCompletitud('examen-estomatognatico', Object.values(examen.items).some((i) => i.patologia));
        marcarCompletitud('indicadores-salud-bucal', !!(indicadores.periodontal || indicadores.oclusion));
        marcarCompletitud('indices-cpo', true);

        fichaClinicaActual.antecedentes_personales_json = personales;
        await actualizarBannerAlertaMedica();

        limpiarCambioPendiente('secciones');
        mostrarConfirmacionGuardado();
    } catch (error) {
        alert('Ocurrió un error al guardar la ficha clínica: ' + error.message);
    } finally {
        if (boton) boton.disabled = false;
    }
}

function mostrarConfirmacionGuardado() {
    const confirmacion = document.getElementById('confirmacion-guardado-ficha');
    if (!confirmacion) return;
    confirmacion.classList.remove('oculto');
    setTimeout(() => confirmacion.classList.add('oculto'), 2500);
}

// -----------------------------------------------------------------
// Cambios sin guardar: secciones B-J (delegacion de eventos) + el
// odontograma en edicion (marcado desde odontograma.js). Dispara el
// aviso de salida al cambiar de pestaña interna, navegar a otra pagina
// o cerrar el navegador (beforeunload).
// -----------------------------------------------------------------
const cambiosSinGuardar = { secciones: false, odontograma: false };
let callbackSalidaPendiente = null;

function marcarCambioPendiente(origen) {
    cambiosSinGuardar[origen] = true;
    actualizarIndicadorCambiosPendientes();
}

function limpiarCambioPendiente(origen) {
    cambiosSinGuardar[origen] = false;
    actualizarIndicadorCambiosPendientes();
}

function hayCambiosSinGuardar() {
    return cambiosSinGuardar.secciones || cambiosSinGuardar.odontograma;
}

function actualizarIndicadorCambiosPendientes() {
    const badge = document.getElementById('badge-cambios-pendientes');
    if (badge) badge.classList.toggle('oculto', !hayCambiosSinGuardar());
}

function mostrarDialogoSalida(callbackNavegar) {
    callbackSalidaPendiente = callbackNavegar;
    document.getElementById('modal-salida-sin-guardar').classList.add('abierto');
}

function cerrarDialogoSalida() {
    document.getElementById('modal-salida-sin-guardar').classList.remove('abierto');
    callbackSalidaPendiente = null;
}

function inicializarAvisoDeSalida() {
    const panelFicha = document.getElementById('panel-ficha-clinica');
    panelFicha.addEventListener('input', manejarPosibleCambioFicha);
    panelFicha.addEventListener('change', manejarPosibleCambioFicha);

    document.getElementById('btn-guardar-ficha-flotante').addEventListener('click', guardarFichaCompleta);

    document.getElementById('btn-salida-cancelar').addEventListener('click', cerrarDialogoSalida);

    document.getElementById('btn-salida-sin-guardar').addEventListener('click', () => {
        const callback = callbackSalidaPendiente;
        limpiarCambioPendiente('secciones');
        if (typeof hayEdicionOdontogramaPendiente === 'function' && hayEdicionOdontogramaPendiente()) {
            cancelarNuevaVersionOdontograma();
        }
        cerrarDialogoSalida();
        if (callback) callback();
    });

    document.getElementById('btn-salida-guardar').addEventListener('click', async () => {
        const callback = callbackSalidaPendiente;
        await guardarFichaCompleta();
        const odontogramaPendiente = typeof hayEdicionOdontogramaPendiente === 'function' && hayEdicionOdontogramaPendiente();
        cerrarDialogoSalida();
        if (odontogramaPendiente) {
            alert('Se guardaron los cambios de la ficha. El odontograma en edición no se guarda automáticamente: use "Guardar nueva versión" o "Cancelar edición" en la sección H antes de salir.');
            return;
        }
        if (callback) callback();
    });

    // Enlaces que navegan a otra pagina (sidebar, "Volver al listado", etc.)
    document.addEventListener('click', (evento) => {
        if (!hayCambiosSinGuardar()) return;
        const enlace = evento.target.closest('a[href]');
        if (!enlace || enlace.target === '_blank') return;
        const href = enlace.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
        evento.preventDefault();
        evento.stopImmediatePropagation();
        mostrarDialogoSalida(() => { window.location.href = href; });
    }, true);

    window.addEventListener('beforeunload', (evento) => {
        if (!hayCambiosSinGuardar()) return;
        evento.preventDefault();
        evento.returnValue = '';
    });
}

function manejarPosibleCambioFicha(evento) {
    if (evento.target.closest('#seccion-odontograma')) return; // el odontograma tiene su propio aviso
    marcarCambioPendiente('secciones');
}

// -----------------------------------------------------------------
// Banner de alerta medica (cabecera de la ficha). Usa el mismo endpoint
// que el modal de citas en la Agenda, para tener una sola fuente de verdad
// del catalogo de antecedentes que disparan la alerta (ver routes/ficha-clinica.js).
// -----------------------------------------------------------------
async function actualizarBannerAlertaMedica() {
    const banner = document.getElementById('banner-alerta-medica');
    try {
        const alertas = await api.get(`/api/ficha-clinica/${pacienteId}/alertas`);
        if (alertas.tieneAlertas) {
            document.getElementById('banner-alerta-medica-texto').textContent = alertas.etiquetas.join(' · ').toUpperCase();
            banner.classList.remove('oculto');
        } else {
            banner.classList.add('oculto');
        }
    } catch (error) {
        banner.classList.add('oculto');
    }
}
