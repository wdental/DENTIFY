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

// Cada fila de higiene oral simplificada examina UNA pieza del trio, segun
// disponibilidad en el odontograma activo: la titular; si ausente/perdida/
// extraccion indicada, la primera alterna; si tampoco existe, la temporal
// (ver piezaSugeridaParaTrio() / ESTADOS_EXCLUSIVOS_PIEZA en odontograma.js).
const PIEZAS_HIGIENE = [
    { trio: ['16', '17', '55'] },
    { trio: ['11', '21', '51'] },
    { trio: ['26', '27', '65'] },
    { trio: ['36', '37', '75'] },
    { trio: ['31', '41', '71'] },
    { trio: ['46', '47', '85'] }
];

let fichaClinicaActual = null;
let examenSinPatologiaAparente = false;
let cpoModoManual = false; // true mientras el usuario edita J con "Ajustar manualmente"
let cpoBaseAutomatica = null; // ultimo valor autocalculado cargado, para detectar si el usuario realmente cambio algo
let cpoEsAutomatico = true; // false cuando J muestra un valor ajustado manualmente y guardado (no el autocalculo)
let cpoErrorAutomatico = false; // true si la ultima consulta a /cpo-sugerido fallo (para no mostrar "0" como si fuera el calculo real)

// -----------------------------------------------------------------
// Arranque: se ejecuta cuando la pestana existe (paciente.js ya cargo
// pacienteActual antes de llamar cargarFichaClinica desde su propio flujo)
// -----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    construirGrillaEstados('grilla-antecedentes-personales', ANTECEDENTES_PERSONALES);
    construirGrillaEstados('grilla-antecedentes-familiares', ANTECEDENTES_FAMILIARES);
    construirListaEstomatognatico();
    construirTablaHigiene();
    inicializarAvisoDeSalida();
    inicializarRangosVitales();
    inicializarBotonesCpoManual();
    inicializarSeccionExamenes();
});

// -----------------------------------------------------------------
// D / E - Antecedentes: estados explicitos Si / No / sin registrar (nunca
// checkboxes). "Sin registrar" es el estado inicial, distinto de "No".
// -----------------------------------------------------------------
function construirGrillaEstados(contenedorId, items) {
    const contenedor = document.getElementById(contenedorId);
    contenedor.innerHTML = items.map((item) => `
        <div class="antecedente-item" data-codigo="${item.codigo}" data-estado="">
            <div class="antecedente-item__fila">
                <span class="antecedente-item__etiqueta">${item.etiqueta}</span>
                <div class="antecedente-item__botones" role="group">
                    <button type="button" class="antecedente-boton antecedente-boton--si" data-valor="si">Sí</button>
                    <button type="button" class="antecedente-boton antecedente-boton--no" data-valor="no">No</button>
                </div>
            </div>
            ${item.conTexto ? `<div class="check-item__extra oculto" data-extra-de="${item.codigo}"><input type="text" data-codigo-texto="${item.codigo}" placeholder="Especificar..."></div>` : ''}
        </div>
    `).join('');
    contenedor.addEventListener('click', manejarClicEstadoAntecedente);
}

function manejarClicEstadoAntecedente(evento) {
    const boton = evento.target.closest('.antecedente-boton');
    if (!boton) return;
    const item = boton.closest('.antecedente-item');
    const nuevoValor = item.dataset.estado === boton.dataset.valor ? '' : boton.dataset.valor;
    aplicarEstadoAntecedente(item, nuevoValor);
    marcarCambioPendiente('secciones');
}

function aplicarEstadoAntecedente(item, valor) {
    item.dataset.estado = valor;
    item.querySelectorAll('.antecedente-boton').forEach((b) => {
        b.classList.toggle('antecedente-boton--activo', b.dataset.valor === valor);
    });
    const extra = item.parentElement.querySelector(`[data-extra-de="${item.dataset.codigo}"]`);
    if (extra) extra.classList.toggle('oculto', valor !== 'si');
}

function marcarTodoNoAntecedentes(prefijo) {
    const contenedorId = prefijo === 'personales' ? 'grilla-antecedentes-personales' : 'grilla-antecedentes-familiares';
    document.querySelectorAll(`#${contenedorId} .antecedente-item`).forEach((item) => {
        if (item.dataset.estado === '') aplicarEstadoAntecedente(item, 'no');
    });
    marcarCambioPendiente('secciones');
}

// -----------------------------------------------------------------
// G - Examen estomatognatico: boton "Sin patologia aparente" colapsa/
// atenua los 13 items; se desactiva solo si luego se marca una patologia.
// -----------------------------------------------------------------
function construirListaEstomatognatico() {
    const contenedor = document.getElementById('lista-examen-estomatognatico');
    contenedor.innerHTML = `
        <button type="button" class="btn btn-secundario btn-sm" id="btn-sin-patologia-aparente" onclick="alternarSinPatologiaAparente()">Sin patología aparente</button>
        <div id="lista-examen-estomatognatico-items">
            ${EXAMEN_ESTOMATOGNATICO_ITEMS.map((item) => `
                <div style="border-bottom: 1px solid var(--gris-claro); padding: 10px 0;">
                    <label class="check-item">
                        <input type="checkbox" data-item="${item.num}" onchange="alternarDescripcionEstomatognatico(${item.num})">
                        ${item.num}. ${item.etiqueta} — con patología
                    </label>
                    <div class="check-item__extra oculto" id="descripcion-envoltura-${item.num}">
                        <input type="text" id="descripcion-item-${item.num}" placeholder="Describir la patología (region ${item.num})">
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function alternarDescripcionEstomatognatico(num) {
    const marcado = document.querySelector(`#lista-examen-estomatognatico input[data-item="${num}"]`).checked;
    document.getElementById(`descripcion-envoltura-${num}`).classList.toggle('oculto', !marcado);
    if (marcado && examenSinPatologiaAparente) {
        aplicarSinPatologiaAparente(false);
    }
    marcarCambioPendiente('secciones');
}

function alternarSinPatologiaAparente() {
    aplicarSinPatologiaAparente(!examenSinPatologiaAparente);
    if (examenSinPatologiaAparente) {
        EXAMEN_ESTOMATOGNATICO_ITEMS.forEach((item) => {
            document.querySelector(`#lista-examen-estomatognatico input[data-item="${item.num}"]`).checked = false;
            document.getElementById(`descripcion-item-${item.num}`).value = '';
            document.getElementById(`descripcion-envoltura-${item.num}`).classList.add('oculto');
        });
    }
    marcarCambioPendiente('secciones');
}

function aplicarSinPatologiaAparente(valor) {
    examenSinPatologiaAparente = valor;
    document.getElementById('btn-sin-patologia-aparente').classList.toggle('btn-primario', valor);
    document.getElementById('btn-sin-patologia-aparente').classList.toggle('btn-secundario', !valor);
    document.getElementById('lista-examen-estomatognatico-items').classList.toggle('estomatognatico-items--atenuado', valor);
}

function construirTablaHigiene() {
    const cuerpo = document.getElementById('cuerpo-tabla-higiene');
    cuerpo.innerHTML = PIEZAS_HIGIENE.map((fila, indice) => `
        <tr data-indice-higiene="${indice}">
            <td class="higiene-celda-pieza">
                <select id="higiene-pieza-${indice}" onchange="onCambiarPiezaHigiene(${indice})">
                    ${fila.trio.map((p) => `<option value="${p}">${p}</option>`).join('')}
                </select>
                <span class="higiene-raya oculto" id="higiene-raya-${indice}">—</span>
            </td>
            <td><select id="higiene-placa-${indice}" onchange="recalcularHigiene()">${opcionesNumericas(0, 3)}</select></td>
            <td><select id="higiene-calculo-${indice}" onchange="recalcularHigiene()">${opcionesNumericas(0, 3)}</select></td>
            <td><select id="higiene-gingivitis-${indice}" onchange="recalcularHigiene()">${opcionesNumericas(0, 1)}</select></td>
        </tr>
    `).join('');
    actualizarSugerenciasHigiene();
}

function opcionesNumericas(desde, hasta) {
    let html = '<option value="">—</option>';
    for (let i = desde; i <= hasta; i++) html += `<option value="${i}">${i}</option>`;
    return html;
}

// Estados que hacen que una pieza se considere NO disponible para examinar
// (misma lista clinica que ESTADOS_EXCLUSIVOS_PIEZA de odontograma.js).
const ESTADOS_PIEZA_NO_DISPONIBLE_HIGIENE = ['ausente', 'perdida_caries', 'perdida_otra_causa', 'extraccion_indicada'];

// Una pieza se considera disponible si no hay odontograma activo (no hay
// informacion para descartarla: se asume presente, titular por defecto) o
// si el odontograma activo no la marca con un hallazgo excluyente.
function piezaDisponibleEnOdontograma(pieza) {
    if (typeof odontogramaActivo === 'undefined' || !odontogramaActivo || !odontogramaActivo.odontograma) return true;
    const piezas = odontogramaActivo.piezas || [];
    const excluida = piezas.some((f) => f.pieza === pieza && f.superficie === 'completa' && ESTADOS_PIEZA_NO_DISPONIBLE_HIGIENE.includes(f.hallazgo));
    return !excluida;
}

function piezaSugeridaParaTrio(trio) {
    return trio.find((pieza) => piezaDisponibleEnOdontograma(pieza)) || null;
}

// Recalcula, para cada fila, cual pieza del trio sugerir (resaltada, con
// tooltip) y deshabilita la fila si ninguna del trio esta disponible (queda
// con raya, fuera del promedio). Respeta la eleccion manual ya hecha por el
// examinador (guardada en el <select>) mientras esa pieza siga disponible.
function actualizarSugerenciasHigiene() {
    PIEZAS_HIGIENE.forEach((fila, indice) => {
        const select = document.getElementById(`higiene-pieza-${indice}`);
        const raya = document.getElementById(`higiene-raya-${indice}`);
        if (!select) return;
        const sugerida = piezaSugeridaParaTrio(fila.trio);

        [...select.options].forEach((op) => {
            const disponible = piezaDisponibleEnOdontograma(op.value);
            op.classList.toggle('higiene-opcion-sugerida', op.value === sugerida);
            op.textContent = op.value === sugerida ? `${op.value} (sugerida)` : op.value;
        });

        const eleccionActual = select.dataset.eleccionManual === '1' ? select.value : null;
        const eleccionValida = eleccionActual && fila.trio.includes(eleccionActual) && piezaDisponibleEnOdontograma(eleccionActual);
        const valorFinal = eleccionValida ? eleccionActual : sugerida;

        if (!valorFinal) {
            select.value = fila.trio[0];
            select.disabled = true;
            select.classList.add('oculto');
            if (raya) raya.classList.remove('oculto');
            ['placa', 'calculo', 'gingivitis'].forEach((prefijo) => {
                const sel = document.getElementById(`higiene-${prefijo}-${indice}`);
                sel.value = '';
                sel.disabled = true;
            });
        } else {
            select.value = valorFinal;
            select.disabled = false;
            select.classList.remove('oculto');
            select.title = valorFinal === sugerida ? 'Pieza sugerida según odontograma' : '';
            select.classList.toggle('higiene-select-sugerida', valorFinal === sugerida);
            if (raya) raya.classList.add('oculto');
            ['placa', 'calculo', 'gingivitis'].forEach((prefijo) => {
                document.getElementById(`higiene-${prefijo}-${indice}`).disabled = false;
            });
        }
    });
    recalcularHigiene();
}

function onCambiarPiezaHigiene(indice) {
    const select = document.getElementById(`higiene-pieza-${indice}`);
    select.dataset.eleccionManual = '1';
    actualizarSugerenciasHigiene();
    marcarCambioPendiente('secciones');
}

// Segun el instructivo del F033, el total de higiene oral simplificada es el
// PROMEDIO por columna (suma / piezas efectivamente examinadas); las "—"
// (sin registrar o sin pieza disponible del trio) no cuentan en el divisor.
// Se muestra con un decimal, o "—" si ninguna pieza de esa columna fue examinada.
function recalcularHigiene() {
    const promediarColumna = (prefijo) => {
        let suma = 0, examinadas = 0;
        PIEZAS_HIGIENE.forEach((_, indice) => {
            const campo = document.getElementById(`higiene-${prefijo}-${indice}`);
            if (campo.disabled || campo.value === '') return;
            suma += Number(campo.value);
            examinadas++;
        });
        return examinadas > 0 ? (suma / examinadas).toFixed(1) : '—';
    };
    document.getElementById('total-placa').textContent = promediarColumna('placa');
    document.getElementById('total-calculo').textContent = promediarColumna('calculo');
    document.getElementById('total-gingivitis').textContent = promediarColumna('gingivitis');
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
    ['fc-temperatura', 'fc-pulso', 'fc-frecuencia-respiratoria', 'fc-presion-arterial'].forEach(revisarRangoVital);

    const examenData = fichaClinicaActual.examen_estomatognatico_json || {};
    const examen = examenData.items || {};
    let algunItemConPatologia = false;
    EXAMEN_ESTOMATOGNATICO_ITEMS.forEach((item) => {
        const dato = examen[item.num];
        const checkbox = document.querySelector(`#lista-examen-estomatognatico input[data-item="${item.num}"]`);
        checkbox.checked = !!(dato && dato.patologia);
        document.getElementById(`descripcion-item-${item.num}`).value = (dato && dato.descripcion) || '';
        document.getElementById(`descripcion-envoltura-${item.num}`).classList.toggle('oculto', !checkbox.checked);
        if (checkbox.checked) algunItemConPatologia = true;
    });
    aplicarSinPatologiaAparente(!!examenData.sin_patologia_aparente && !algunItemConPatologia);
    marcarCompletitud('examen-estomatognatico', algunItemConPatologia || examenSinPatologiaAparente);

    const indicadores = fichaClinicaActual.indicadores_salud_bucal_json || {};
    const higiene = indicadores.higiene || [];
    PIEZAS_HIGIENE.forEach((filaDef, indice) => {
        const fila = higiene[indice] || {};
        document.getElementById(`higiene-placa-${indice}`).value = fila.placa ?? '';
        document.getElementById(`higiene-calculo-${indice}`).value = fila.calculo ?? '';
        document.getElementById(`higiene-gingivitis-${indice}`).value = fila.gingivitis ?? '';
        const select = document.getElementById(`higiene-pieza-${indice}`);
        if (fila.pieza_examinada && filaDef.trio.includes(fila.pieza_examinada)) {
            select.value = fila.pieza_examinada;
            select.dataset.eleccionManual = '1';
        } else {
            delete select.dataset.eleccionManual;
        }
    });
    actualizarSugerenciasHigiene();
    document.getElementById('fc-enf-periodontal').value = indicadores.periodontal || '';
    document.getElementById('fc-oclusion').value = indicadores.oclusion || '';
    document.getElementById('fc-fluorosis').value = indicadores.fluorosis || '';
    marcarCompletitud('indicadores-salud-bucal', !!(indicadores.periodontal || indicadores.oclusion));

    await cargarIndicesCpo();

    const examenesSolicitados = fichaClinicaActual.examenes_solicitados_json || {};
    document.getElementById('fc-examen-biometria').checked = !!examenesSolicitados.biometria;
    document.getElementById('fc-examen-quimica').checked = !!examenesSolicitados.quimica_sanguinea;
    document.getElementById('fc-examen-rx').checked = !!examenesSolicitados.rayos_x;
    document.getElementById('fc-examen-otros').checked = !!examenesSolicitados.otros;
    document.getElementById('fc-examen-otros-texto').value = examenesSolicitados.otros_texto || '';
    document.getElementById('fc-examenes-detalle').value = examenesSolicitados.detalle || '';
    marcarCompletitud('examenes-solicitados', !!(examenesSolicitados.biometria || examenesSolicitados.quimica_sanguinea || examenesSolicitados.rayos_x || examenesSolicitados.otros || examenesSolicitados.detalle));

    documentosPacienteCache = null;
    toggleSeccionInformeExamenes();
    const examenesInforme = fichaClinicaActual.examenes_informe_json || {};
    marcarCompletitud('examenes-informe', TIPOS_EXAMEN.some((t) => examenesInforme[t.clave] && (examenesInforme[t.clave].texto || (examenesInforme[t.clave].documento_ids || []).length)));

    const profesional = fichaClinicaActual.profesional_responsable_json || {};
    await cargarProfesionalResponsable(profesional);
    marcarCompletitud('profesional-responsable', !!profesional.doctor_id);

    await actualizarBannerAlertaMedica();
}

function aplicarAntecedentes(prefijo, catalogo, datos) {
    const estados = datos.estados || {};
    catalogo.forEach((item) => {
        const contenedorId = `grilla-${prefijo}`;
        const fila = document.querySelector(`#${contenedorId} .antecedente-item[data-codigo="${item.codigo}"]`);
        aplicarEstadoAntecedente(fila, estados[item.codigo] || '');
        if (item.conTexto) {
            const campoTexto = document.querySelector(`#${contenedorId} input[data-codigo-texto="${item.codigo}"]`);
            campoTexto.value = datos.otro_texto || '';
        }
    });
    const observacionesId = prefijo === 'antecedentes-personales' ? 'fc-personales-observaciones' : 'fc-familiares-observaciones';
    document.getElementById(observacionesId).value = datos.observaciones || '';
    const hayRegistrado = Object.keys(estados).length > 0;
    marcarCompletitud(prefijo, hayRegistrado || !!datos.observaciones);
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
    const estados = {};
    let otroTexto = '';
    catalogo.forEach((item) => {
        const fila = document.querySelector(`#grilla-${prefijo} .antecedente-item[data-codigo="${item.codigo}"]`);
        if (fila.dataset.estado === 'si' || fila.dataset.estado === 'no') estados[item.codigo] = fila.dataset.estado;
        if (item.conTexto) {
            otroTexto = document.querySelector(`#grilla-${prefijo} input[data-codigo-texto="${item.codigo}"]`).value.trim();
        }
    });
    return {
        estados,
        otro_texto: otroTexto || null,
        observaciones: document.getElementById(observacionesId).value.trim() || null
    };
}

// Rangos de referencia en adultos (F033); en niños varian segun la edad,
// ver nota fija en la seccion. Solo resaltan el campo (borde ambar), nunca
// bloquean el guardado.
const RANGOS_VITALES = {
    'fc-temperatura': { min: 36.1, max: 37.2 },
    'fc-pulso': { min: 60, max: 100 },
    'fc-frecuencia-respiratoria': { min: 12, max: 20 }
};

function inicializarRangosVitales() {
    Object.keys(RANGOS_VITALES).forEach((id) => {
        document.getElementById(id).addEventListener('input', () => revisarRangoVital(id));
    });
    document.getElementById('fc-presion-arterial').addEventListener('input', () => revisarRangoVital('fc-presion-arterial'));
}

function revisarRangoVital(id) {
    const campo = document.getElementById(id);
    let fueraDeRango = false;
    if (id === 'fc-presion-arterial') {
        const coincide = /^(\d{2,3})\s*\/\s*(\d{2,3})$/.exec(campo.value.trim());
        if (coincide) fueraDeRango = Number(coincide[1]) >= 120 || Number(coincide[2]) >= 80;
    } else {
        const rango = RANGOS_VITALES[id];
        const valor = campo.value === '' ? null : Number(campo.value);
        if (rango && valor !== null) fueraDeRango = valor < rango.min || valor > rango.max;
    }
    campo.classList.toggle('campo--fuera-rango', fueraDeRango);
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
    return { items, sin_patologia_aparente: examenSinPatologiaAparente };
}

function valorHigieneONulo(id) {
    const valor = document.getElementById(id).value;
    return valor === '' ? null : Number(valor);
}

function recopilarIndicadoresSaludBucal() {
    const higiene = PIEZAS_HIGIENE.map((filaDef, indice) => {
        const selectPieza = document.getElementById(`higiene-pieza-${indice}`);
        return {
            pieza_examinada: selectPieza.disabled ? null : selectPieza.value,
            placa: valorHigieneONulo(`higiene-placa-${indice}`),
            calculo: valorHigieneONulo(`higiene-calculo-${indice}`),
            gingivitis: valorHigieneONulo(`higiene-gingivitis-${indice}`)
        };
    });
    return {
        higiene,
        periodontal: document.getElementById('fc-enf-periodontal').value || null,
        oclusion: document.getElementById('fc-oclusion').value || null,
        fluorosis: document.getElementById('fc-fluorosis').value || null
    };
}

// -----------------------------------------------------------------
// L - Pedido de examenes complementarios. M (informe) queda condicionada a
// L: aparece solo si hay al menos un examen marcado, con un bloque de
// informe por cada examen marcado (ver toggleSeccionInformeExamenes()).
// -----------------------------------------------------------------
const TIPOS_EXAMEN = [
    { clave: 'biometria', checkboxId: 'fc-examen-biometria', etiqueta: 'Biometría' },
    { clave: 'quimica_sanguinea', checkboxId: 'fc-examen-quimica', etiqueta: 'Química sanguínea' },
    { clave: 'rayos_x', checkboxId: 'fc-examen-rx', etiqueta: 'Rayos X' },
    { clave: 'otros', checkboxId: 'fc-examen-otros', etiqueta: 'Otros' }
];

let documentosPacienteCache = null;

function recopilarExamenesSolicitados() {
    return {
        biometria: document.getElementById('fc-examen-biometria').checked,
        quimica_sanguinea: document.getElementById('fc-examen-quimica').checked,
        rayos_x: document.getElementById('fc-examen-rx').checked,
        otros: document.getElementById('fc-examen-otros').checked,
        otros_texto: document.getElementById('fc-examen-otros-texto').value.trim() || null,
        detalle: document.getElementById('fc-examenes-detalle').value.trim() || null
    };
}

function inicializarSeccionExamenes() {
    TIPOS_EXAMEN.forEach((tipo) => {
        document.getElementById(tipo.checkboxId).addEventListener('change', (evento) => manejarCambioExamenSolicitado(tipo, evento));
    });
}

// Al desmarcar un examen que ya tiene informe registrado en M, los datos se
// CONSERVAN (solo se ocultan): se pide confirmacion informativa. Si el
// usuario cancela, se re-marca el checkbox.
function manejarCambioExamenSolicitado(tipo, evento) {
    const checkbox = evento.target;
    if (!checkbox.checked) {
        const informe = (fichaClinicaActual && fichaClinicaActual.examenes_informe_json) || {};
        const tieneInforme = informe[tipo.clave] && (informe[tipo.clave].fecha || informe[tipo.clave].texto || (informe[tipo.clave].documento_ids || []).length);
        if (tieneInforme && !confirm(`Ya hay un informe de "${tipo.etiqueta}" registrado en la sección M. Al desmarcar este examen, el bloque se oculta pero el informe NO se elimina: reaparecerá si vuelve a marcar el examen. ¿Continuar?`)) {
            checkbox.checked = true;
            return;
        }
    }
    toggleSeccionInformeExamenes();
    marcarCambioPendiente('secciones');
}

// M permanece oculta mientras L no tenga ningun examen marcado; si hay al
// menos uno, muestra un bloque de informe solo por cada examen marcado.
function toggleSeccionInformeExamenes() {
    const marcados = TIPOS_EXAMEN.filter((tipo) => document.getElementById(tipo.checkboxId).checked);
    const seccion = document.getElementById('seccion-examenes-informe');
    seccion.classList.toggle('oculto', marcados.length === 0);
    if (marcados.length === 0) {
        seccion.removeAttribute('open');
        return;
    }

    const contenedor = document.getElementById('fc-informe-bloques');
    const informeActual = (fichaClinicaActual && fichaClinicaActual.examenes_informe_json) || {};
    const bloquesExistentes = new Set([...contenedor.children].map((el) => el.dataset.tipoExamen));
    const clavesMarcadas = new Set(marcados.map((t) => t.clave));

    // Quita bloques de examenes que ya no estan marcados (sus datos siguen
    // intactos en fichaClinicaActual.examenes_informe_json hasta guardar).
    [...contenedor.children].forEach((el) => {
        if (!clavesMarcadas.has(el.dataset.tipoExamen)) el.remove();
    });

    marcados.forEach((tipo) => {
        if (bloquesExistentes.has(tipo.clave)) return;
        const datos = informeActual[tipo.clave] || {};
        const bloque = document.createElement('div');
        bloque.className = 'informe-examen-bloque';
        bloque.dataset.tipoExamen = tipo.clave;
        bloque.innerHTML = `
            <h4 class="informe-examen-bloque__titulo">${tipo.etiqueta}</h4>
            <div class="form-grid">
                <div class="campo">
                    <label for="fc-informe-fecha-${tipo.clave}">Fecha del informe</label>
                    <input type="date" id="fc-informe-fecha-${tipo.clave}" value="${datos.fecha || ''}" onchange="sincronizarFechaLegible('fc-informe-fecha-${tipo.clave}', 'fc-informe-fecha-legible-${tipo.clave}'); marcarCambioPendiente('secciones')">
                    <span class="fecha-legible" id="fc-informe-fecha-legible-${tipo.clave}"></span>
                </div>
            </div>
            <div class="campo campo--ancho">
                <label for="fc-informe-texto-${tipo.clave}">Resultado / informe</label>
                <textarea id="fc-informe-texto-${tipo.clave}" rows="3" onchange="marcarCambioPendiente('secciones')">${datos.texto || ''}</textarea>
            </div>
            <div class="campo campo--ancho">
                <label>Adjuntar documentos ya subidos (pestaña Documentos)</label>
                <div id="fc-informe-documentos-${tipo.clave}"><p class="texto-secundario mb-0">Cargando...</p></div>
            </div>
        `;
        contenedor.appendChild(bloque);
        sincronizarFechaLegible(`fc-informe-fecha-${tipo.clave}`, `fc-informe-fecha-legible-${tipo.clave}`);
        cargarDocumentosParaInforme(tipo.clave, datos.documento_ids || []);
    });
}

// -----------------------------------------------------------------
// M - Informe de examenes (reutiliza los documentos ya subidos en la
// pestaña Documentos: aqui solo se referencian, no se sube un archivo
// aparte). Un bloque de informe (fecha/texto/documentos) por examen
// marcado en L.
// -----------------------------------------------------------------
async function cargarDocumentosParaInforme(claveExamen, documentoIdsSeleccionados) {
    const contenedor = document.getElementById(`fc-informe-documentos-${claveExamen}`);
    if (!contenedor) return;
    try {
        if (!documentosPacienteCache) documentosPacienteCache = await api.get(`/api/pacientes/${pacienteId}/documentos`);
        const documentos = documentosPacienteCache;
        if (documentos.length === 0) {
            contenedor.innerHTML = '<p class="texto-secundario mb-0">Sin documentos subidos todavía. Suba el informe desde la pestaña Documentos y selecciónelo aquí.</p>';
            return;
        }
        const seleccionados = new Set(documentoIdsSeleccionados || []);
        contenedor.innerHTML = documentos.map((doc) => `
            <label class="check-item">
                <input type="checkbox" data-documento-informe="${doc.id}" onchange="marcarCambioPendiente('secciones')" ${seleccionados.has(doc.id) ? 'checked' : ''}>
                ${doc.nombre_original}
            </label>
        `).join('');
    } catch (error) {
        contenedor.innerHTML = '<p class="texto-secundario mb-0">Error al cargar documentos.</p>';
    }
}

// Recolecta M completo: preserva (sin cambios) el informe de cualquier
// examen que tenga datos guardados pero no este actualmente marcado en L
// (bloque oculto, no borrado), y toma del DOM el de cada examen marcado.
function recopilarExamenesInforme() {
    const informeAnterior = (fichaClinicaActual && fichaClinicaActual.examenes_informe_json) || {};
    const marcados = new Set(TIPOS_EXAMEN.filter((tipo) => document.getElementById(tipo.checkboxId).checked).map((t) => t.clave));
    const resultado = {};

    TIPOS_EXAMEN.forEach((tipo) => {
        if (marcados.has(tipo.clave)) {
            const documentoIds = [...document.querySelectorAll(`#fc-informe-documentos-${tipo.clave} input[data-documento-informe]:checked`)]
                .map((el) => Number(el.dataset.documentoInforme));
            const fechaEl = document.getElementById(`fc-informe-fecha-${tipo.clave}`);
            const textoEl = document.getElementById(`fc-informe-texto-${tipo.clave}`);
            resultado[tipo.clave] = {
                fecha: fechaEl ? (fechaEl.value || null) : null,
                texto: textoEl ? (textoEl.value.trim() || null) : null,
                documento_ids: documentoIds
            };
        } else if (informeAnterior[tipo.clave]) {
            resultado[tipo.clave] = informeAnterior[tipo.clave]; // conservado, oculto
        }
    });
    return resultado;
}

// -----------------------------------------------------------------
// O - Datos del profesional responsable: autollenado desde el doctor
// seleccionado; editable libremente hasta que ya tenga datos, desde
// donde solo un admin puede modificarlo (ver routes/ficha-clinica.js).
// -----------------------------------------------------------------
async function cargarProfesionalResponsable(profesional) {
    const select = document.getElementById('fc-profesional-doctor');
    const doctores = typeof cargarDoctoresParaEvolucion === 'function' ? await cargarDoctoresParaEvolucion() : (doctoresParaEvolucion || []);
    select.innerHTML = '<option value="">Sin especificar</option>' +
        doctores.map((d) => `<option value="${d.id}">${d.nombre_completo}</option>`).join('');

    const yaTieneDatos = !!profesional.doctor_id;
    select.value = profesional.doctor_id || '';
    select.disabled = yaTieneDatos && usuarioActual.rol !== 'admin';
    document.getElementById('fc-profesional-aviso-admin').classList.toggle('oculto', !(yaTieneDatos && usuarioActual.rol !== 'admin'));

    actualizarVistaProfesionalResponsable();
    select.addEventListener('change', actualizarVistaProfesionalResponsable);

    document.getElementById('fc-profesional-fecha-apertura').textContent = fichaClinicaActual.fecha_creacion
        ? formatearFechaConDia(fichaClinicaActual.fecha_creacion.slice(0, 10))
        : '—';
}

function actualizarVistaProfesionalResponsable() {
    const select = document.getElementById('fc-profesional-doctor');
    const doctor = doctoresParaEvolucion.find((d) => String(d.id) === select.value);
    document.getElementById('fc-profesional-registro').textContent = doctor && doctor.registro_profesional ? doctor.registro_profesional : '—';
}

function recopilarProfesionalResponsable() {
    const select = document.getElementById('fc-profesional-doctor');
    if (select.disabled) return null; // no admin y ya bloqueado: no reenviar (el servidor lo rechazaria igual)
    return {
        doctor_id: select.value || null,
        fecha_apertura: fichaClinicaActual.fecha_creacion || new Date().toISOString()
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

    // El modo automatico es el estado normal. Aunque el usuario haya pulsado
    // "Ajustar manualmente", si al momento de guardar los valores son
    // identicos al ultimo calculo automatico cargado, NO se marca como
    // ajuste manual (evita que J quede "congelado" con el valor automatico
    // duplicado solo porque alguien abrio el modo de edicion sin cambiar nada).
    const coincideConAutomatico = cpoBaseAutomatica && cpoValoresIguales(
        { permanente: datos.permanente, temporal: datos.temporal },
        cpoBaseAutomatica
    );

    if (cpoModoManual && !coincideConAutomatico) {
        datos.ajustado_manualmente = true;
        datos.ajustado_por = usuarioActual.nombre;
        datos.ajustado_en = new Date().toISOString();
    } else {
        datos.ajustado_manualmente = false;
        datos.ajustado_por = null;
        datos.ajustado_en = null;
    }
    return datos;
}

function cpoValoresIguales(a, b) {
    return a.permanente.c === b.permanente.c && a.permanente.p === b.permanente.p && a.permanente.o === b.permanente.o &&
        a.temporal.c === b.temporal.c && a.temporal.e === b.temporal.e && a.temporal.o === b.temporal.o;
}

// -----------------------------------------------------------------
// J - Indices CPO-ceo: fuente unica (se elimino el panel lateral del
// odontograma). Solo lectura por defecto, mostrando el autocalculo
// derivado del odontograma activo; "Ajustar manualmente" habilita la
// edicion y "Restaurar calculo automatico" vuelve al valor derivado.
// -----------------------------------------------------------------
async function cargarIndicesCpo() {
    const cpo = fichaClinicaActual.indices_cpo_json || {};
    cpoEsAutomatico = !cpo.ajustado_manualmente;
    if (cpo.ajustado_manualmente) {
        aplicarValoresCpo(cpo.permanente || {}, cpo.temporal || {});
        cpoModoManual = false;
        actualizarEstadoUiCpo(true, cpo.ajustado_por, cpo.ajustado_en);
    } else {
        await cargarCpoAutomatico();
        cpoModoManual = false;
        actualizarEstadoUiCpo(false);
    }
    actualizarAvisoEstadoOdontogramaEnCpo();
    marcarCompletitud('indices-cpo', cpo.permanente !== undefined || cpo.temporal !== undefined);
}

async function cargarCpoAutomatico() {
    try {
        const sugerido = await api.get(`/api/odontograma/${pacienteId}/cpo-sugerido`);
        aplicarValoresCpo(sugerido.permanente, sugerido.temporal);
        cpoBaseAutomatica = { permanente: { ...sugerido.permanente }, temporal: { ...sugerido.temporal }, existeOdontograma: sugerido.existeOdontograma !== false };
        cpoErrorAutomatico = false;
    } catch (error) {
        aplicarValoresCpo({}, {});
        cpoBaseAutomatica = null;
        cpoErrorAutomatico = true;
    }
    actualizarAvisoEstadoOdontogramaEnCpo();
}

// Nota visible en J sobre el estado del odontograma que origina el
// autocalculo: sin odontograma registrado, edicion sin guardar (J siempre
// refleja la ultima version GUARDADA, nunca una edicion en curso), o un
// fallo real al consultar el autocalculo (para no confundir un error con
// un resultado de "0" legitimo).
function actualizarAvisoEstadoOdontogramaEnCpo() {
    const aviso = document.getElementById('cpo-aviso-estado-odontograma');
    if (!aviso) return;
    aviso.classList.remove('cpo-aviso-estado-odontograma--pendiente');

    if (!cpoEsAutomatico) {
        aviso.classList.add('oculto');
        return;
    }

    const hayEdicionPendiente = typeof hayEdicionOdontogramaPendiente === 'function' && hayEdicionOdontogramaPendiente();

    if (cpoErrorAutomatico) {
        aviso.textContent = 'No se pudo calcular el CPO-ceo automático (falló la consulta al odontograma). Reintente recargando la ficha.';
        aviso.classList.add('cpo-aviso-estado-odontograma--pendiente');
        aviso.classList.remove('oculto');
    } else if (cpoBaseAutomatica && cpoBaseAutomatica.existeOdontograma === false) {
        // Sin version guardada: aun si hay una edicion en curso (odontograma
        // inicial auto-abierto), no hay "ultima guardada" con la que contrastar.
        aviso.textContent = 'Sin odontograma registrado para este paciente.';
        aviso.classList.remove('oculto');
    } else if (hayEdicionPendiente) {
        aviso.textContent = 'Hay una edición del odontograma sin guardar: estos índices reflejan la última versión GUARDADA, no la edición en curso.';
        aviso.classList.add('cpo-aviso-estado-odontograma--pendiente');
        aviso.classList.remove('oculto');
    } else {
        aviso.classList.add('oculto');
    }
}

function aplicarValoresCpo(permanente, temporal) {
    document.getElementById('cpo-perm-c').value = permanente.c ?? 0;
    document.getElementById('cpo-perm-p').value = permanente.p ?? 0;
    document.getElementById('cpo-perm-o').value = permanente.o ?? 0;
    document.getElementById('cpo-temp-c').value = temporal.c ?? 0;
    document.getElementById('cpo-temp-e').value = temporal.e ?? 0;
    document.getElementById('cpo-temp-o').value = temporal.o ?? 0;
    recalcularCpo();
}

function actualizarEstadoUiCpo(ajustadoManualmente, ajustadoPor, ajustadoEn) {
    const inputs = ['cpo-perm-c', 'cpo-perm-p', 'cpo-perm-o', 'cpo-temp-c', 'cpo-temp-e', 'cpo-temp-o'];
    const enEdicion = cpoModoManual;
    inputs.forEach((id) => { document.getElementById(id).disabled = !enEdicion; });
    document.getElementById('btn-cpo-ajustar').classList.toggle('oculto', enEdicion);
    document.getElementById('btn-cpo-restaurar').classList.toggle('oculto', !enEdicion && !ajustadoManualmente);
    document.getElementById('btn-cpo-usar-sugerido').classList.toggle('oculto', !enEdicion);

    const aviso = document.getElementById('cpo-aviso-manual');
    if (ajustadoManualmente && !enEdicion) {
        aviso.textContent = `Ajustado manualmente por ${ajustadoPor || '—'} el ${ajustadoEn ? formatearFecha(ajustadoEn.slice(0, 10)) : '—'}`;
        aviso.classList.remove('oculto');
    } else if (enEdicion) {
        aviso.textContent = 'Editando manualmente — use "Guardar ficha clínica" para registrar el ajuste.';
        aviso.classList.remove('oculto');
    } else {
        aviso.classList.add('oculto');
    }
}

function iniciarAjusteManualCpo() {
    if (!confirm('Esto le permite sobrescribir el cálculo automático de CPO-ceo. Los valores dejarán de actualizarse solos con el odontograma hasta que use "Restaurar cálculo automático". ¿Continuar?')) {
        return;
    }
    cpoModoManual = true;
    cpoEsAutomatico = false;
    actualizarEstadoUiCpo(false);
    actualizarAvisoEstadoOdontogramaEnCpo();
    marcarCambioPendiente('secciones');
}

async function restaurarCpoAutomatico() {
    cpoEsAutomatico = true;
    await cargarCpoAutomatico();
    cpoModoManual = false;
    actualizarEstadoUiCpo(false);
    marcarCambioPendiente('secciones');
}

function inicializarBotonesCpoManual() {
    document.getElementById('btn-cpo-ajustar').addEventListener('click', iniciarAjusteManualCpo);
    document.getElementById('btn-cpo-restaurar').addEventListener('click', restaurarCpoAutomatico);
}

async function usarCpoSugerido() {
    try {
        const sugerido = await api.get(`/api/odontograma/${pacienteId}/cpo-sugerido`);
        aplicarValoresCpo(sugerido.permanente, sugerido.temporal);
        marcarCambioPendiente('secciones'); // .value= no dispara 'input', se marca a mano
    } catch (error) {
        alert('No se pudo calcular el sugerido: ' + error.message);
    }
}

// Llamado desde odontograma.js tras guardar una nueva version, para que J
// refleje el nuevo calculo derivado si no esta ajustado manualmente.
async function refrescarCpoTrasNuevaVersionOdontograma() {
    if (cpoModoManual || (fichaClinicaActual && fichaClinicaActual.indices_cpo_json && fichaClinicaActual.indices_cpo_json.ajustado_manualmente)) return;
    await cargarCpoAutomatico();
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
        const examenesSolicitados = recopilarExamenesSolicitados();
        const examenesInforme = recopilarExamenesInforme();
        const profesional = recopilarProfesionalResponsable();

        await Promise.all([
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/motivo-consulta`, motivo),
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/enfermedad-actual`, enfermedad),
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/antecedentes-personales`, personales),
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/antecedentes-familiares`, familiares),
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/constantes-vitales`, vitales),
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/examen-estomatognatico`, examen),
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/indicadores-salud-bucal`, indicadores),
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/indices-cpo`, cpo),
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/examenes-solicitados`, examenesSolicitados),
            api.put(`/api/ficha-clinica/${pacienteId}/seccion/examenes-informe`, examenesInforme),
            ...(profesional ? [api.put(`/api/ficha-clinica/${pacienteId}/seccion/profesional-responsable`, profesional)] : [])
        ]);

        marcarCompletitud('motivo-consulta', !!motivo.texto);
        marcarCompletitud('enfermedad-actual', !!enfermedad.texto);
        marcarCompletitud('antecedentes-personales', Object.keys(personales.estados).length > 0 || !!personales.observaciones);
        marcarCompletitud('antecedentes-familiares', Object.keys(familiares.estados).length > 0 || !!familiares.observaciones);
        marcarCompletitud('constantes-vitales', !!(vitales.temperatura || vitales.pulso || vitales.presion_arterial));
        marcarCompletitud('examen-estomatognatico', Object.values(examen.items).some((i) => i.patologia) || examen.sin_patologia_aparente);
        marcarCompletitud('indicadores-salud-bucal', !!(indicadores.periodontal || indicadores.oclusion));
        marcarCompletitud('indices-cpo', true);
        marcarCompletitud('examenes-solicitados', !!(examenesSolicitados.biometria || examenesSolicitados.quimica_sanguinea || examenesSolicitados.rayos_x || examenesSolicitados.otros || examenesSolicitados.detalle));
        marcarCompletitud('examenes-informe', TIPOS_EXAMEN.some((t) => examenesInforme[t.clave] && (examenesInforme[t.clave].texto || (examenesInforme[t.clave].documento_ids || []).length)));
        if (profesional) marcarCompletitud('profesional-responsable', !!profesional.doctor_id);

        fichaClinicaActual.antecedentes_personales_json = personales;
        fichaClinicaActual.indices_cpo_json = cpo;
        fichaClinicaActual.examenes_solicitados_json = examenesSolicitados;
        fichaClinicaActual.examenes_informe_json = examenesInforme;
        if (profesional) fichaClinicaActual.profesional_responsable_json = profesional;
        cpoModoManual = false;
        actualizarEstadoUiCpo(cpo.ajustado_manualmente, cpo.ajustado_por, cpo.ajustado_en);
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
    if (origen === 'odontograma' && typeof actualizarAvisoEstadoOdontogramaEnCpo === 'function') actualizarAvisoEstadoOdontogramaEnCpo();
}

function limpiarCambioPendiente(origen) {
    cambiosSinGuardar[origen] = false;
    actualizarIndicadorCambiosPendientes();
    if (origen === 'odontograma' && typeof actualizarAvisoEstadoOdontogramaEnCpo === 'function') actualizarAvisoEstadoOdontogramaEnCpo();
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
