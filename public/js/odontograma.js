// =====================================================================
// Odontograma interactivo (seccion H del F033). Paradigma "paleta de
// herramientas -> pintar": se activa una herramienta en la paleta y se
// aplica con clics sobre el diagrama. SVG inline generado por JS, sin
// librerias externas. INMUTABLE: cada "Registrar nuevo odontograma" crea
// una version nueva en el servidor; nunca se edita una version ya guardada.
// Comparte pacienteActual / pacienteId / usuarioActual, declarados en paciente.js.
// =====================================================================

// -----------------------------------------------------------------
// Catalogo de hallazgos - simbologia EXACTA de la seccion K del F033
// (SNS-MSP/HCU-form.033/2021), mas "implante" como unico hallazgo
// adicional fuera de esa simbologia (fuera_simbologia_f033 = 1).
// -----------------------------------------------------------------
const HALLAZGOS = {
    // ROJO - patologia actual / por realizar
    caries: { etiqueta: 'Caries', grupo: 'rojo', nivel: 'superficie', color: 'rojo' },
    sellante_necesario: { etiqueta: 'Sellante necesario', grupo: 'rojo', nivel: 'superficie', color: 'rojo' },
    extraccion_indicada: { etiqueta: 'Extracción indicada', grupo: 'rojo', nivel: 'pieza', color: 'rojo' },
    endodoncia_indicada: { etiqueta: 'Endodoncia por realizar', grupo: 'rojo', nivel: 'pieza', color: 'rojo' },
    corona_indicada: { etiqueta: 'Corona indicada', grupo: 'rojo', nivel: 'pieza', color: 'rojo' },
    protesis_fija_indicada: { etiqueta: 'Prótesis fija indicada', grupo: 'rojo', nivel: 'tramo', color: 'rojo' },
    protesis_removible_indicada: { etiqueta: 'Prótesis removible indicada', grupo: 'rojo', nivel: 'tramo', color: 'rojo' },
    protesis_total_indicada: { etiqueta: 'Prótesis total indicada', grupo: 'rojo', nivel: 'tramo', color: 'rojo' },

    // AZUL - tratamiento realizado
    obturado: { etiqueta: 'Obturado', grupo: 'azul', nivel: 'superficie', color: 'azul' },
    sellante_realizado: { etiqueta: 'Sellante realizado', grupo: 'azul', nivel: 'superficie', color: 'azul' },
    perdida_caries: { etiqueta: 'Pérdida por caries', grupo: 'azul', nivel: 'pieza', color: 'azul' },
    endodoncia_realizada: { etiqueta: 'Endodoncia realizada', grupo: 'azul', nivel: 'pieza', color: 'azul' },
    corona_realizada: { etiqueta: 'Corona realizada', grupo: 'azul', nivel: 'pieza', color: 'azul' },
    protesis_fija_realizada: { etiqueta: 'Prótesis fija realizada', grupo: 'azul', nivel: 'tramo', color: 'azul' },
    protesis_removible_realizada: { etiqueta: 'Prótesis removible realizada', grupo: 'azul', nivel: 'tramo', color: 'azul' },
    protesis_total_realizada: { etiqueta: 'Prótesis total realizada', grupo: 'azul', nivel: 'tramo', color: 'azul' },

    // OTROS (segun F033: perdida otra causa es siempre azul; ausente es neutro)
    perdida_otra_causa: { etiqueta: 'Pérdida (otra causa)', grupo: 'otros', nivel: 'pieza', color: 'azul' },
    ausente: { etiqueta: 'Ausente', grupo: 'otros', nivel: 'pieza', color: 'neutro' },

    // ADICIONALES (fuera de la simbologia K; se listan en observaciones al imprimir el F033 en Fase 3B)
    implante_indicado: { etiqueta: 'Implante indicado', grupo: 'adicionales', nivel: 'pieza', color: 'rojo', fueraSimbologia: true },
    implante_realizado: { etiqueta: 'Implante realizado', grupo: 'adicionales', nivel: 'pieza', color: 'azul', fueraSimbologia: true }
};

const ETIQUETAS_ESPECIALES = { movilidad: 'Movilidad (1-4)', recesion: 'Recesión (1-4)', borrar: 'Borrar hallazgo' };

const GRUPOS_PALETA = [
    { id: 'rojo', titulo: 'Patología actual · Rojo', codigos: ['caries', 'sellante_necesario', 'extraccion_indicada', 'endodoncia_indicada', 'corona_indicada', 'protesis_fija_indicada', 'protesis_removible_indicada', 'protesis_total_indicada'] },
    { id: 'azul', titulo: 'Tratamiento realizado · Azul', codigos: ['obturado', 'sellante_realizado', 'perdida_caries', 'endodoncia_realizada', 'corona_realizada', 'protesis_fija_realizada', 'protesis_removible_realizada', 'protesis_total_realizada'] },
    { id: 'otros', titulo: 'Otros', codigos: ['perdida_otra_causa', 'ausente'] },
    { id: 'adicionales', titulo: 'Adicionales', subtitulo: 'Se detallan en observaciones al imprimir el F033', codigos: ['implante_indicado', 'implante_realizado'] },
    { id: 'herramientas', titulo: 'Herramientas', especiales: ['movilidad', 'recesion', 'borrar'] }
];

// Fila superior de "Acceso rapido": herramientas mas usadas + el Borrador,
// siempre visible junto con su presencia normal al final de la paleta.
const ACCESO_RAPIDO = ['caries', 'obturado', 'ausente', 'extraccion_indicada', 'borrar'];

// Los 4 estados que excluyen cualquier otro hallazgo en la misma pieza.
const ESTADOS_EXCLUSIVOS_PIEZA = ['ausente', 'perdida_caries', 'perdida_otra_causa', 'extraccion_indicada'];

// Hallazgos incompatibles con cada categoria de protesis (tramo): las piezas
// cubiertas por el tramo no admiten estos hallazgos mientras el tramo exista.
// Fija SI admite endodoncia y corona (compatibles clinicamente); total y
// removible no admiten ninguno de los tratamientos/patologias de superficie
// ni corona/endodoncia/implante.
const PROTESIS_HALLAZGOS_INCOMPATIBLES = {
    protesis_total: ['caries', 'obturado', 'sellante_necesario', 'sellante_realizado', 'corona_indicada', 'corona_realizada', 'endodoncia_indicada', 'endodoncia_realizada', 'implante_indicado', 'implante_realizado'],
    protesis_removible: ['caries', 'obturado', 'sellante_necesario', 'sellante_realizado', 'corona_indicada', 'corona_realizada', 'endodoncia_indicada', 'endodoncia_realizada', 'implante_indicado', 'implante_realizado'],
    protesis_fija: ['caries', 'sellante_necesario', 'sellante_realizado']
};

function categoriaTramo(codigo) {
    if (codigo.startsWith('protesis_fija')) return 'protesis_fija';
    if (codigo.startsWith('protesis_removible')) return 'protesis_removible';
    if (codigo.startsWith('protesis_total')) return 'protesis_total';
    return null;
}

// Sentinela de superficie (no es una cara real) para la zona de clic
// invisible sobre el asterisco de sellante, dibujado fuera del cuerpo de
// la pieza (ver dibujarSellantesSiHay). Solo la herramienta "borrar" la usa.
const SUPERFICIE_SELLANTE_HIT = 'sellante_hit';

// -----------------------------------------------------------------
// Denticion (nomenclatura FDI) y geometria del diagrama
// -----------------------------------------------------------------
const FILAS_ODONTOGRAMA = [
    { tipo: 'permanente', arcada: 'superior', piezas: ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'] },
    { tipo: 'temporal', arcada: 'superior', piezas: ['55', '54', '53', '52', '51', '61', '62', '63', '64', '65'] },
    { tipo: 'temporal', arcada: 'inferior', piezas: ['85', '84', '83', '82', '81', '71', '72', '73', '74', '75'] },
    { tipo: 'permanente', arcada: 'inferior', piezas: ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'] }
];

// Tamanos compactados para que las 16 piezas de una arcada permanente
// quepan sin scroll horizontal en escritorio (>=1280px) y tablet horizontal
// (1024px, donde la paleta ya se apila arriba y el centro toma todo el ancho).
const TAMANO_PERMANENTE = 27;
const RADIO_EXTERNO_TEMPORAL = 13;
const RADIO_INTERNO_TEMPORAL = 5;
const ESPACIO_ENTRE_PIEZAS = 2;
const MARGEN_LATERAL = 18;

// Bandas verticales reservadas alrededor de cada pieza (ver renderizarSvgOdontograma)
const HOLGURA = 4;
const ALTURA_NUMERO = 14;
const ALTURA_FILA_CAJA = 13;
// Banda "interior" (lado oclusal, hacia la otra arcada): sellante y, si
// coincide en la misma pieza, endodoncia (que se dibuja ahi en vez de sobre
// la pieza para no chocar con la corona). ALTURA_BANDA_SELLANTE debe cubrir
// el peor caso: dos simbolos apilados (ver DISTANCIA_BANDA_INFERIOR / PASO_APILADO).
const ALTURA_BANDA_SELLANTE = 24;
const DISTANCIA_BANDA_INFERIOR = 9; // borde de la pieza -> centro del primer simbolo (fijo y constante)
const PASO_APILADO = 12;            // separacion entre el primer y el segundo simbolo, si ambos coinciden

const ETIQUETAS_SUPERFICIE_BASE = { oclusal: 'Oclusal', mesial: 'Mesial', distal: 'Distal', vestibular: 'Vestibular', completa: 'Pieza completa' };

function etiquetaSuperficie(superficie, arcada) {
    if (superficie === 'lingual_palatino') return arcada === 'superior' ? 'Palatino' : 'Lingual';
    return ETIQUETAS_SUPERFICIE_BASE[superficie] || superficie;
}

function anchoUnidad(fila) {
    return fila.tipo === 'permanente' ? TAMANO_PERMANENTE : RADIO_EXTERNO_TEMPORAL * 2;
}

function anchoFila(fila) {
    const unidad = anchoUnidad(fila);
    return fila.piezas.length * (unidad + ESPACIO_ENTRE_PIEZAS) - ESPACIO_ENTRE_PIEZAS;
}

const ANCHO_MAXIMO_FILA = Math.max(...FILAS_ODONTOGRAMA.map(anchoFila));
const ANCHO_SVG = MARGEN_LATERAL * 2 + ANCHO_MAXIMO_FILA;
const CENTRO_X = ANCHO_SVG / 2;

function esPiezaTemporal(pieza) {
    return ['5', '6', '7', '8'].includes(String(pieza)[0]);
}

function esPiezaAusente(pieza) {
    const fila = filaPiezaCompleta(pieza);
    return !!(fila && fila.hallazgo === 'ausente');
}

function extentoExterior(fila) {
    // Banda donde va el numero (+ MOV/REC si es permanente), del lado
    // "afuera" de la boca: arriba en la arcada superior, abajo en la inferior.
    return fila.tipo === 'permanente'
        ? HOLGURA + ALTURA_NUMERO + HOLGURA + ALTURA_FILA_CAJA + ALTURA_FILA_CAJA
        : HOLGURA + ALTURA_NUMERO;
}

function extentoInterior() {
    // Banda del asterisco de sellante, del lado "adentro" de la boca
    // (hacia la otra arcada), igual para piezas permanentes y temporales.
    return HOLGURA + ALTURA_BANDA_SELLANTE;
}

// -----------------------------------------------------------------
// Estado
// -----------------------------------------------------------------
let doctoresParaOdontograma = [];
let versionesOdontograma = [];
let odontogramaActivo = null;   // {odontograma, piezas}
let piezasVisibles = [];        // piezas de la version que se esta mostrando (activa, historica o en edicion)
let arcadaPorPieza = {};        // 'pieza' -> 'superior' | 'inferior'
let modoEdicion = false;
let versionViendoId = 'activo'; // 'activo' o el id de una version historica
let herramientaActiva = null;   // codigo de HALLAZGOS, o 'movilidad'|'recesion'|'borrar', o null
let tramoEnProgreso = null;     // {codigo, piezaInicio} mientras se espera el segundo clic de un tramo
let valorSeleccionadoEspecial = null; // 1-4, valor actual para movilidad/recesion

FILAS_ODONTOGRAMA.forEach((fila) => {
    fila.piezas.forEach((pieza) => { arcadaPorPieza[pieza] = fila.arcada; });
});

// -----------------------------------------------------------------
// Carga inicial (llamada desde paciente.js)
// -----------------------------------------------------------------
async function cargarOdontograma() {
    try {
        doctoresParaOdontograma = await api.get('/api/doctores');
    } catch (e) {
        doctoresParaOdontograma = [];
    }

    await recargarDatosOdontograma();
    construirLayoutOdontograma();
    if (typeof actualizarSugerenciasHigiene === 'function') actualizarSugerenciasHigiene();

    if (!odontogramaActivo.odontograma) {
        // Paciente sin ningun odontograma: entra directo en edicion de un
        // INICIAL, sin exigir el clic en "Registrar nuevo odontograma".
        iniciarNuevaVersionOdontograma('inicial', true);
    } else {
        mostrarVersionActiva();
    }

    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape' && herramientaActiva) activarHerramienta(null);
    });
}

const ETIQUETAS_TIPO_ODONTOGRAMA = { inicial: 'Inicial', evolucion: 'Evolución', alta: 'Alta' };

async function recargarDatosOdontograma() {
    try {
        const [activo, versiones] = await Promise.all([
            api.get(`/api/odontograma/${pacienteId}/activo`),
            api.get(`/api/odontograma/${pacienteId}/versiones`)
        ]);
        odontogramaActivo = activo;
        versionesOdontograma = versiones;
        marcarCompletitud('odontograma', !!activo.odontograma);
    } catch (error) {
        document.getElementById('seccion-odontograma').innerHTML = `<div class="alerta alerta--error">Error al cargar el odontograma: ${error.message}</div>`;
    }
}

// -----------------------------------------------------------------
// Layout de tres zonas: paleta / centro (odontograma + leyenda) / CPO
// -----------------------------------------------------------------
function construirLayoutOdontograma() {
    const contenedor = document.getElementById('seccion-odontograma');
    const tieneOdontogramas = !!odontogramaActivo.odontograma;
    const etiquetaBotonNuevo = tieneOdontogramas ? 'Registrar odontograma de evolución' : 'Registrar nuevo odontograma';
    const etiquetaActiva = tieneOdontogramas ? `${ETIQUETAS_TIPO_ODONTOGRAMA[odontogramaActivo.odontograma.tipo] || 'Evolución'} (activa) — ${formatearFecha(odontogramaActivo.odontograma.fecha_registro)}` : 'Versión activa (vacía)';

    contenedor.innerHTML = `
        <div class="odontograma-barra">
            <select id="selector-version-odontograma" onchange="cambiarVersionOdontograma(this.value)">
                <option value="activo">${etiquetaActiva}</option>
                ${versionesOdontograma.filter((v) => !v.es_version_activa).map((v) => `
                    <option value="${v.id}">${ETIQUETAS_TIPO_ODONTOGRAMA[v.tipo] || 'Evolución'} — ${formatearFecha(v.fecha_registro)} · ${v.doctor_nombre || 'Sin doctor'}</option>
                `).join('')}
            </select>
            <button type="button" class="btn btn-primario btn-sm" id="btn-nueva-version-odontograma" onclick="iniciarNuevaVersionOdontograma()">${etiquetaBotonNuevo}</button>
            <button type="button" class="btn btn-secundario btn-sm oculto" id="btn-cancelar-version-odontograma" onclick="cancelarNuevaVersionOdontograma()">Cancelar edición</button>
            <button type="button" class="btn btn-primario btn-sm oculto" id="btn-guardar-version-odontograma" onclick="guardarNuevaVersionOdontograma()">Guardar nueva versión</button>
            <button type="button" class="btn btn-secundario btn-sm" onclick="window.print()">Imprimir vista actual</button>
        </div>
        <div id="odontograma-form-nueva-version" class="form-grid oculto" style="margin-bottom: 14px;">
            <div class="campo">
                <label for="odo-doctor">Doctor que registra</label>
                <select id="odo-doctor">
                    <option value="">Sin especificar</option>
                    ${doctoresParaOdontograma.map((d) => `<option value="${d.id}">${d.nombre_completo}</option>`).join('')}
                </select>
            </div>
            <div class="campo" id="odo-tipo-envoltura">
                <label for="odo-tipo">Tipo de odontograma</label>
                <select id="odo-tipo">
                    <option value="evolucion">Evolución</option>
                    <option value="alta">Alta</option>
                </select>
            </div>
            <div class="campo campo--ancho">
                <label for="odo-observaciones">Observaciones de esta version</label>
                <input type="text" id="odo-observaciones" placeholder="Ej. Control de rutina, primera valoracion...">
            </div>
        </div>
        <div id="odontograma-marca-agua-envoltura"></div>

        <div class="odonto-layout">
            <aside class="odonto-paleta" id="odonto-paleta" aria-disabled="true">
                ${construirPaleta()}
            </aside>

            <div class="odonto-centro">
                <div class="flex-entre">
                    <div class="odonto-hint" id="odonto-hint"></div>
                    <div class="odonto-contadores">
                        <span class="odonto-contador-hallazgos" id="odonto-contador-hallazgos">0 hallazgos</span>
                        <span class="odonto-contador-cpo" id="odonto-contador-cpo"></span>
                    </div>
                </div>
                <div class="odontograma-envoltorio">
                    <svg id="odontograma-svg" class="odontograma-svg"></svg>
                </div>
                ${construirLeyenda()}
                <div class="odonto-regla-f033">
                    Regla del Formulario 033: una vez registrado, el odontograma no puede ser alterado (repintados, tachados, aumentos).
                    En Dentify cada cambio genera una versión nueva con autor y fecha.
                </div>
            </div>

            <div class="odonto-columna-derecha">
                <aside class="odonto-panel-lateral" id="odonto-panel-evoluciones">
                    <p class="texto-secundario">Cargando evoluciones...</p>
                </aside>
                <aside class="odonto-panel-lateral odonto-panel-resumen" id="odonto-panel-resumen">
                    <p class="texto-secundario">Cargando resumen...</p>
                </aside>
            </div>
        </div>
    `;

    document.getElementById('odontograma-svg').addEventListener('click', manejarClicOdontograma);
    document.getElementById('odontograma-svg').addEventListener('dblclick', manejarDobleClicOdontograma);
    document.getElementById('odontograma-svg').addEventListener('mouseover', manejarHoverOdontograma);
    document.getElementById('odontograma-svg').addEventListener('mouseout', manejarHoverSalida);
    document.getElementById('odonto-paleta').addEventListener('click', manejarClicPaleta);

    // Si la cuenta con sesion iniciada esta vinculada a un doctor, se
    // precarga como valor por defecto en "Doctor que registra" (el usuario
    // puede cambiarlo igual antes de guardar).
    if (typeof usuarioActual !== 'undefined' && usuarioActual && usuarioActual.doctor_id && doctoresParaOdontograma.some((d) => d.id === usuarioActual.doctor_id)) {
        document.getElementById('odo-doctor').value = usuarioActual.doctor_id;
    }

    // Seccion P: panel compacto de las ultimas evoluciones (evoluciones.js)
    if (typeof cargarPanelEvolucionesLateral === 'function') cargarPanelEvolucionesLateral();
    if (typeof cargarPanelResumenPaciente === 'function') cargarPanelResumenPaciente();
}

// -----------------------------------------------------------------
// Panel "Resumen del paciente" (columna derecha, bajo Evoluciones):
// diagnosticos CIE-10 activos, alerta medica si existe, y un placeholder
// para el plan de tratamiento (Fase 4). Consulta directamente la API en
// vez de depender de variables globales de otros archivos (diagnosticos.js/
// ficha-clinica.js), para no depender del orden en que cada uno termine
// de cargar.
// -----------------------------------------------------------------
async function cargarPanelResumenPaciente() {
    const panel = document.getElementById('odonto-panel-resumen');
    if (!panel) return;

    let diagnosticosHtml = '<p class="texto-secundario mb-0">Sin diagnósticos registrados.</p>';
    try {
        const diagnosticos = await api.get(`/api/diagnosticos/${pacienteId}`);
        if (diagnosticos.length > 0) {
            diagnosticosHtml = diagnosticos.map((d) => `
                <div class="resumen-diagnostico">
                    <span class="resumen-diagnostico__codigo">${d.codigo_cie10}</span>
                    <span class="resumen-diagnostico__descripcion">${d.descripcion}</span>
                    <span class="resumen-diagnostico__tipo resumen-diagnostico__tipo--${d.tipo.toLowerCase()}">${d.tipo}</span>
                </div>
            `).join('');
        }
    } catch (error) {
        diagnosticosHtml = '<p class="texto-secundario mb-0">Error al cargar diagnósticos.</p>';
    }

    let alertaHtml = '';
    try {
        const alertas = await api.get(`/api/ficha-clinica/${pacienteId}/alertas`);
        if (alertas.tieneAlertas) {
            alertaHtml = `<div class="resumen-alerta-medica">${alertas.etiquetas.join(' · ').toUpperCase()}</div>`;
        }
    } catch (error) {
        // silencioso: la alerta principal ya se muestra en el banner de la ficha
    }

    let consentimientosHtml = '<p class="resumen-consentimientos mb-0 texto-secundario">Sin consentimientos vigentes.</p>';
    try {
        const consentimientos = await api.get(`/api/consentimientos/${pacienteId}`);
        const vigentes = consentimientos.filter((c) => c.estado === 'aceptado').length;
        consentimientosHtml = `<p class="resumen-consentimientos mb-0"><a href="#" onclick="cambiarPestanaReal('panel-consentimientos'); return false;">${vigentes} consentimiento${vigentes === 1 ? '' : 's'} aceptado${vigentes === 1 ? '' : 's'} vigente${vigentes === 1 ? '' : 's'} →</a></p>`;
    } catch (error) {
        // silencioso
    }

    panel.innerHTML = `
        <h4>Resumen del paciente</h4>
        ${alertaHtml}
        <div class="resumen-diagnosticos-lista">${diagnosticosHtml}</div>
        ${consentimientosHtml}
        <p class="resumen-plan-placeholder">Plan de tratamiento — disponible en próxima fase</p>
    `;
}

function construirPaleta() {
    const accesoRapido = `
        <div class="odonto-grupo odonto-grupo--acceso-rapido">
            <div class="odonto-grupo__titulo">Acceso rápido</div>
            <div class="odonto-grupo__botones odonto-grupo__botones--grid">
                ${ACCESO_RAPIDO.map((id) => botonPaleta(id, id === 'borrar' ? ETIQUETAS_ESPECIALES[id] : HALLAZGOS[id].etiqueta, true)).join('')}
            </div>
        </div>
    `;

    return accesoRapido + GRUPOS_PALETA.map((grupo) => `
        <div class="odonto-grupo odonto-grupo--${grupo.id}">
            <div class="odonto-grupo__titulo">${grupo.titulo}</div>
            ${grupo.subtitulo ? `<div class="odonto-grupo__subtitulo">${grupo.subtitulo}</div>` : ''}
            <div class="odonto-grupo__botones odonto-grupo__botones--grid">
                ${(grupo.codigos || []).map((codigo) => botonPaleta(codigo, HALLAZGOS[codigo].etiqueta)).join('')}
                ${(grupo.especiales || []).map((id) => botonPaleta(id, ETIQUETAS_ESPECIALES[id])).join('')}
            </div>
            ${grupo.id === 'herramientas' ? '<div id="odonto-selector-valor-envoltura"></div>' : ''}
        </div>
    `).join('');
}

function botonPaleta(id, etiqueta, esAccesoRapido) {
    return `
        <button type="button" class="paleta-boton ${esAccesoRapido ? 'paleta-boton--acceso-rapido' : ''}" data-herramienta="${id}" title="${etiqueta}" aria-label="${etiqueta}">
            <span class="paleta-boton__icono">${iconoPaletaPorCodigo(id)}</span>
            <span class="paleta-boton__texto">${etiqueta}</span>
        </button>
    `;
}

function construirLeyenda() {
    const item = (codigo) => `<div class="odontograma-leyenda__item">${iconoPaletaPorCodigo(codigo)}<span>${HALLAZGOS[codigo].etiqueta}</span></div>`;
    return `
        <div class="odontograma-leyenda">
            <div class="odontograma-leyenda__titulo">Simbología (sección K del Formulario 033)</div>
            <div class="odontograma-leyenda__columnas">
                <div>${GRUPOS_PALETA[0].codigos.map(item).join('')}</div>
                <div>${GRUPOS_PALETA[1].codigos.map(item).join('')}</div>
            </div>
            <div class="odontograma-leyenda__fila-extra">
                ${GRUPOS_PALETA[2].codigos.map(item).join('')}
                ${GRUPOS_PALETA[3].codigos.map(item).join('')}
            </div>
        </div>
    `;
}

// -----------------------------------------------------------------
// Cambiar entre version activa / historicas (solo lectura)
// -----------------------------------------------------------------
function cambiarVersionOdontograma(valor) {
    versionViendoId = valor;
    if (valor === 'activo') {
        mostrarVersionActiva();
    } else {
        mostrarVersionHistorica(Number(valor));
    }
}

function mostrarVersionActiva() {
    modoEdicion = false;
    piezasVisibles = odontogramaActivo.piezas || [];
    document.getElementById('odontograma-marca-agua-envoltura').innerHTML = '';
    sincronizarUiModo();
}

async function mostrarVersionHistorica(id) {
    try {
        const version = await api.get(`/api/odontograma/version/${id}`);
        modoEdicion = false;
        piezasVisibles = version.piezas || [];
        document.getElementById('odontograma-marca-agua-envoltura').innerHTML = `
            <div class="odontograma-marca-agua">Versión histórica — ${formatearFecha(version.odontograma.fecha_registro)} · ${version.odontograma.doctor_nombre || 'Sin doctor'} · Solo lectura</div>
        `;
        sincronizarUiModo();
    } catch (error) {
        alert('No se pudo cargar esa version: ' + error.message);
    }
}

// -----------------------------------------------------------------
// Registrar nueva version (inmutable al guardar)
// -----------------------------------------------------------------
function iniciarNuevaVersionOdontograma(tipoForzado, esAutomatico) {
    if (!esAutomatico && !confirm('Va a registrar un nuevo odontograma. Al guardar, esta version quedara fija y no podra editarse despues (se creara una nueva version para cualquier cambio futuro). ¿Continuar?')) {
        return;
    }

    modoEdicion = true;
    // Copia de trabajo de la version activa (sin ids, para no confundir con filas guardadas)
    piezasVisibles = (odontogramaActivo.piezas || []).map((p) => ({
        pieza: p.pieza, superficie: p.superficie, hallazgo: p.hallazgo,
        color_tipo: p.color_tipo, movilidad: p.movilidad, recesion: p.recesion,
        fuera_simbologia_f033: !!p.fuera_simbologia_f033
    }));

    document.getElementById('selector-version-odontograma').value = 'activo';
    document.getElementById('selector-version-odontograma').disabled = true;
    document.getElementById('btn-nueva-version-odontograma').classList.add('oculto');
    document.getElementById('btn-cancelar-version-odontograma').classList.remove('oculto');
    document.getElementById('btn-guardar-version-odontograma').classList.remove('oculto');
    document.getElementById('odontograma-form-nueva-version').classList.remove('oculto');

    const esInicial = tipoForzado === 'inicial';
    document.getElementById('odo-tipo-envoltura').classList.toggle('oculto', esInicial);
    document.getElementById('odo-tipo').value = 'evolucion';

    document.getElementById('odontograma-marca-agua-envoltura').innerHTML = esInicial
        ? '<div class="odontograma-marca-agua">Este paciente aún no tiene un odontograma registrado. Está editando el odontograma INICIAL — aún no se ha guardado: use "Guardar nueva versión" para registrarlo.</div>'
        : '<div class="odontograma-marca-agua">Editando nueva versión — aun no guardada</div>';

    if (typeof marcarCambioPendiente === 'function') marcarCambioPendiente('odontograma');
    sincronizarUiModo();
}

function cancelarNuevaVersionOdontograma() {
    modoEdicion = false;
    document.getElementById('selector-version-odontograma').disabled = false;
    document.getElementById('btn-nueva-version-odontograma').classList.remove('oculto');
    document.getElementById('btn-cancelar-version-odontograma').classList.add('oculto');
    document.getElementById('btn-guardar-version-odontograma').classList.add('oculto');
    document.getElementById('odontograma-form-nueva-version').classList.add('oculto');
    if (typeof limpiarCambioPendiente === 'function') limpiarCambioPendiente('odontograma');
    mostrarVersionActiva();
}

async function guardarNuevaVersionOdontograma() {
    if (!confirm('Esta accion creara una nueva version inmutable del odontograma. La version anterior quedara archivada, disponible solo para consulta. ¿Guardar ahora?')) {
        return;
    }

    const esInicial = document.getElementById('odo-tipo-envoltura').classList.contains('oculto');
    const datos = {
        doctor_id: document.getElementById('odo-doctor').value || null,
        observaciones: document.getElementById('odo-observaciones').value.trim() || null,
        piezas: piezasVisibles,
        tipo: esInicial ? 'inicial' : document.getElementById('odo-tipo').value
    };

    try {
        await api.post(`/api/odontograma/${pacienteId}`, datos);
        modoEdicion = false;
        if (typeof limpiarCambioPendiente === 'function') limpiarCambioPendiente('odontograma');
        await recargarDatosOdontograma();
        construirLayoutOdontograma();
        mostrarVersionActiva();
        if (typeof refrescarCpoTrasNuevaVersionOdontograma === 'function') await refrescarCpoTrasNuevaVersionOdontograma();
        if (typeof actualizarSugerenciasHigiene === 'function') actualizarSugerenciasHigiene();
    } catch (error) {
        alert('No se pudo guardar el odontograma: ' + error.message);
    }
}

function hayEdicionOdontogramaPendiente() {
    return !!modoEdicion;
}

// -----------------------------------------------------------------
// Estado de la UI segun modo (edicion habilitada / solo lectura)
// -----------------------------------------------------------------
function sincronizarUiModo() {
    activarHerramienta(null);
    const paleta = document.getElementById('odonto-paleta');
    if (paleta) paleta.setAttribute('aria-disabled', modoEdicion ? 'false' : 'true');
    renderizarSvgOdontograma();
    actualizarContadorHallazgos();
    actualizarCpoEnVivo();
    if (typeof actualizarAvisoEstadoOdontogramaEnCpo === 'function') actualizarAvisoEstadoOdontogramaEnCpo();
    if (typeof actualizarSugerenciasHigiene === 'function') actualizarSugerenciasHigiene();
}

// -----------------------------------------------------------------
// Herramienta activa / hint / selector de valor especial
// -----------------------------------------------------------------
function manejarClicPaleta(evento) {
    const boton = evento.target.closest('.paleta-boton');
    if (!boton || document.getElementById('odonto-paleta').getAttribute('aria-disabled') === 'true') return;
    const id = boton.dataset.herramienta;
    activarHerramienta(id === herramientaActiva ? null : id);
}

function activarHerramienta(id) {
    herramientaActiva = id;
    tramoEnProgreso = null;
    valorSeleccionadoEspecial = null;
    document.querySelectorAll('.paleta-boton').forEach((b) => b.classList.toggle('paleta-boton--activa', b.dataset.herramienta === id));
    actualizarSelectorValorEspecial();
    actualizarHintPredeterminado();
    renderizarSvgOdontograma();
}

function actualizarSelectorValorEspecial() {
    const envoltura = document.getElementById('odonto-selector-valor-envoltura');
    if (!envoltura) return;
    if (herramientaActiva !== 'movilidad' && herramientaActiva !== 'recesion') {
        envoltura.innerHTML = '';
        return;
    }
    envoltura.innerHTML = `
        <div class="odonto-selector-valor">
            ${[1, 2, 3, 4].map((v) => `<button type="button" class="odonto-selector-valor__opcion ${valorSeleccionadoEspecial === v ? 'odonto-selector-valor__opcion--activa' : ''}" data-valor="${v}">${v}</button>`).join('')}
        </div>
    `;
    envoltura.querySelectorAll('button[data-valor]').forEach((boton) => {
        boton.addEventListener('click', () => {
            valorSeleccionadoEspecial = Number(boton.dataset.valor);
            actualizarSelectorValorEspecial();
        });
    });
}

function actualizarHintPredeterminado() {
    const hint = document.getElementById('odonto-hint');
    if (!hint) return;
    if (!modoEdicion) {
        actualizarHint('Seleccione "Registrar nuevo odontograma" para habilitar la paleta de hallazgos.', false);
    } else if (!herramientaActiva) {
        actualizarHint('Clic en una superficie del diente para hallazgos por cara, o en el número de la pieza para los que afectan a toda la pieza.', false);
    } else {
        const meta = HALLAZGOS[herramientaActiva];
        const etiqueta = meta ? meta.etiqueta : ETIQUETAS_ESPECIALES[herramientaActiva];
        actualizarHint(`Herramienta activa: ${etiqueta}. Presione ESC o vuelva a hacer clic en la herramienta para desactivar.`, true);
    }
}

function actualizarHint(texto, activa) {
    const hint = document.getElementById('odonto-hint');
    if (!hint) return;
    hint.textContent = texto;
    hint.classList.toggle('odonto-hint--activa', !!activa);
}

function actualizarContadorHallazgos() {
    const contador = document.getElementById('odonto-contador-hallazgos');
    if (!contador) return;
    const n = piezasVisibles.filter((f) => f.hallazgo || (f.movilidad !== null && f.movilidad !== undefined) || (f.recesion !== null && f.recesion !== undefined)).length;
    contador.textContent = `${n} hallazgo${n === 1 ? '' : 's'}`;
}

// -----------------------------------------------------------------
// Lectura / escritura de piezasVisibles (estado en memoria)
// -----------------------------------------------------------------
function filaSuperficie(pieza, superficie) {
    return piezasVisibles.find((f) => f.pieza === pieza && f.superficie === superficie && f.hallazgo);
}

function filaPiezaCompleta(pieza) {
    return piezasVisibles.find((f) => f.pieza === pieza && f.superficie === 'completa' && f.hallazgo);
}

// Hallazgos de pieza completa (superficie 'completa') que SI pueden coexistir
// entre si en la misma pieza porque son clinicamente independientes (p.ej.
// corona y endodoncia). Cada grupo internamente sigue siendo "reemplazo
// directo" (indicado <-> realizado). Los 4 estados exclusivos (ausente,
// perdidas, extraccion) no entran aqui: su exclusividad total ya la maneja
// autorizarAplicacionHallazgo()/limpiarPiezaCompleta().
const GRUPOS_PIEZA_DIRECTOS = {
    corona: ['corona_indicada', 'corona_realizada'],
    endodoncia: ['endodoncia_indicada', 'endodoncia_realizada'],
    implante: ['implante_indicado', 'implante_realizado']
};

function grupoDePiezaCodigo(codigo) {
    for (const [grupo, codigos] of Object.entries(GRUPOS_PIEZA_DIRECTOS)) {
        if (codigos.includes(codigo)) return grupo;
    }
    return codigo;
}

function filaPiezaPorGrupo(pieza, grupo) {
    return piezasVisibles.find((f) => f.pieza === pieza && f.superficie === 'completa' && f.hallazgo && grupoDePiezaCodigo(f.hallazgo) === grupo);
}

function filaAnotacion(pieza) {
    return piezasVisibles.find((f) => f.pieza === pieza && f.superficie === 'completa' && !f.hallazgo && ((f.movilidad !== null && f.movilidad !== undefined) || (f.recesion !== null && f.recesion !== undefined)));
}

function esFilaTramo(fila) {
    return typeof fila.superficie === 'string' && fila.superficie.startsWith('tramo_a_');
}

function finDeTramo(fila) {
    return fila.superficie.slice('tramo_a_'.length);
}

function filaDeOdontogramaPorPieza(pieza) {
    return FILAS_ODONTOGRAMA.find((f) => f.piezas.includes(pieza));
}

// Todas las piezas fisicamente cubiertas por un tramo (no solo sus dos
// extremos): si ambas piezas viven en la misma fila del diagrama, son las
// piezas entre ellas inclusive; si no, se asume solo las dos (caso raro).
function piezasCubiertasPorTramo(piezaInicio, piezaFin) {
    const filaInicio = filaDeOdontogramaPorPieza(piezaInicio);
    const filaFin = filaDeOdontogramaPorPieza(piezaFin);
    if (!filaInicio || filaInicio !== filaFin) return [piezaInicio, piezaFin];
    const idxInicio = filaInicio.piezas.indexOf(piezaInicio);
    const idxFin = filaInicio.piezas.indexOf(piezaFin);
    const [desde, hasta] = idxInicio <= idxFin ? [idxInicio, idxFin] : [idxFin, idxInicio];
    return filaInicio.piezas.slice(desde, hasta + 1);
}

function tramosQueCubrenPieza(pieza) {
    return piezasVisibles.filter((f) => esFilaTramo(f) && piezasCubiertasPorTramo(f.pieza, finDeTramo(f)).includes(pieza));
}

function establecerHallazgoSuperficie(pieza, superficie, codigo) {
    piezasVisibles = piezasVisibles.filter((f) => !(f.pieza === pieza && f.superficie === superficie && f.hallazgo));
    if (codigo) {
        const meta = HALLAZGOS[codigo];
        piezasVisibles.push({ pieza, superficie, hallazgo: codigo, color_tipo: meta.color, movilidad: null, recesion: null, fuera_simbologia_f033: !!meta.fueraSimbologia });
    }
}

function establecerHallazgoPieza(pieza, codigo, grupo) {
    const g = grupo || grupoDePiezaCodigo(codigo);
    piezasVisibles = piezasVisibles.filter((f) => !(f.pieza === pieza && f.superficie === 'completa' && f.hallazgo && grupoDePiezaCodigo(f.hallazgo) === g));
    if (codigo) {
        const meta = HALLAZGOS[codigo];
        piezasVisibles.push({ pieza, superficie: 'completa', hallazgo: codigo, color_tipo: meta.color, movilidad: null, recesion: null, fuera_simbologia_f033: !!meta.fueraSimbologia });
    }
}

function establecerAnotacionPieza(pieza, movilidad, recesion) {
    piezasVisibles = piezasVisibles.filter((f) => !(f.pieza === pieza && f.superficie === 'completa' && !f.hallazgo));
    if (movilidad !== null || recesion !== null) {
        piezasVisibles.push({ pieza, superficie: 'completa', hallazgo: null, color_tipo: null, movilidad, recesion, fuera_simbologia_f033: false });
    }
}

function establecerTramo(codigo, piezaInicio, piezaFin) {
    piezasVisibles = piezasVisibles.filter((f) => !(f.pieza === piezaInicio && esFilaTramo(f)));
    const meta = HALLAZGOS[codigo];
    piezasVisibles.push({ pieza: piezaInicio, superficie: `tramo_a_${piezaFin}`, hallazgo: codigo, color_tipo: meta.color, movilidad: null, recesion: null, fuera_simbologia_f033: false });
}

// -----------------------------------------------------------------
// Interaccion: clic / doble clic / hover sobre el SVG
// -----------------------------------------------------------------
function manejarClicOdontograma(evento) {
    if (!modoEdicion || !herramientaActiva) return;

    const zona = evento.target.closest('[data-pieza]');
    if (!zona) return;

    const pieza = zona.dataset.pieza;
    const superficie = zona.dataset.superficie;
    const caja = zona.dataset.caja;

    if (herramientaActiva === 'borrar') {
        manejarBorrado(pieza, superficie, caja);
        finalizarCambio();
        return;
    }

    if (superficie === SUPERFICIE_SELLANTE_HIT) return; // esta zona solo sirve para borrar el asterisco

    if (herramientaActiva === 'movilidad' || herramientaActiva === 'recesion') {
        if (esPiezaTemporal(pieza)) return; // no aplica a piezas temporales, igual que en el F033
        if (!valorSeleccionadoEspecial) { actualizarHint('Elija primero un valor (1-4) junto a la paleta.', true); return; }
        const exclusiva = tienePiezaExclusiva(pieza);
        if (exclusiva) { alert(mensajeBloqueoExclusion(pieza, exclusiva)); return; }
        aplicarValorEspecial(pieza, herramientaActiva, valorSeleccionadoEspecial);
        finalizarCambio();
        return;
    }

    const meta = HALLAZGOS[herramientaActiva];
    if (!meta) return;

    if (meta.nivel === 'superficie') {
        if (!superficie || superficie === 'completa') return; // exige clic en una cara especifica
        const actual = filaSuperficie(pieza, superficie);
        const codigoDestino = actual && actual.hallazgo === herramientaActiva ? null : herramientaActiva;
        if (codigoDestino && !autorizarAplicacionHallazgo(pieza, codigoDestino)) return;
        establecerHallazgoSuperficie(pieza, superficie, codigoDestino);
        finalizarCambio();
    } else if (meta.nivel === 'pieza') {
        const grupo = grupoDePiezaCodigo(herramientaActiva);
        const actual = filaPiezaPorGrupo(pieza, grupo);
        const codigoDestino = actual && actual.hallazgo === herramientaActiva ? null : herramientaActiva;
        if (codigoDestino && !autorizarAplicacionHallazgo(pieza, codigoDestino)) return;
        establecerHallazgoPieza(pieza, codigoDestino, grupo);
        finalizarCambio();
    } else if (meta.nivel === 'tramo') {
        manejarClicTramo(pieza);
        finalizarCambio();
    }
}

// -----------------------------------------------------------------
// Reglas de exclusion clinica entre hallazgos (ver tambien la validacion
// espejo en el servidor, routes/odontograma.js -> validarExclusiones).
// -----------------------------------------------------------------
function tienePiezaExclusiva(pieza) {
    const fila = piezasVisibles.find((f) => f.pieza === pieza && f.superficie === 'completa' && ESTADOS_EXCLUSIVOS_PIEZA.includes(f.hallazgo));
    return fila ? fila.hallazgo : null;
}

function tieneOtrosHallazgos(pieza, ignorarExclusiva) {
    return piezasVisibles.some((f) => {
        if (f.pieza !== pieza || esFilaTramo(f)) return false;
        if (ignorarExclusiva && f.superficie === 'completa' && f.hallazgo && ESTADOS_EXCLUSIVOS_PIEZA.includes(f.hallazgo)) return false;
        return !!f.hallazgo || (f.movilidad !== null && f.movilidad !== undefined) || (f.recesion !== null && f.recesion !== undefined);
    });
}

function mensajeBloqueoExclusion(pieza, codigoExclusivo) {
    return `La pieza ${pieza} está marcada como ${etiquetaHallazgo(codigoExclusivo).toLowerCase()}. Quite ese hallazgo para registrar otros.`;
}

function etiquetaHallazgo(codigo) {
    const meta = HALLAZGOS[codigo];
    return meta ? meta.etiqueta : codigo;
}

// Devuelve el tramo (fila) que cubre la pieza y es incompatible con
// codigoNuevo, o null si no hay conflicto de protesis.
function tramoIncompatibleEnPieza(pieza, codigoNuevo) {
    for (const tramo of tramosQueCubrenPieza(pieza)) {
        const categoria = categoriaTramo(tramo.hallazgo);
        const incompatibles = PROTESIS_HALLAZGOS_INCOMPATIBLES[categoria] || [];
        if (incompatibles.includes(codigoNuevo)) return tramo;
    }
    return null;
}

// Devuelve true si el hallazgo puede aplicarse; false si se bloqueo o el
// usuario cancelo la confirmacion. Si corresponde, limpia primero los
// demas hallazgos de la pieza (con confirmacion del usuario).
function autorizarAplicacionHallazgo(pieza, codigoNuevo) {
    const tramoConflicto = tramoIncompatibleEnPieza(pieza, codigoNuevo);
    if (tramoConflicto) {
        alert(`La pieza ${pieza} está cubierta por "${etiquetaHallazgo(tramoConflicto.hallazgo)}" (${tramoConflicto.pieza}–${finDeTramo(tramoConflicto)}), que no admite este hallazgo. Quite la prótesis para registrarlo.`);
        return false;
    }

    const exclusivaActual = tienePiezaExclusiva(pieza);
    const nuevoEsExclusivo = ESTADOS_EXCLUSIVOS_PIEZA.includes(codigoNuevo);

    if (exclusivaActual && exclusivaActual !== codigoNuevo) {
        if (!nuevoEsExclusivo) {
            alert(mensajeBloqueoExclusion(pieza, exclusivaActual));
            return false;
        }
        if (!confirm(`Esto eliminará los demás hallazgos de la pieza ${pieza}. ¿Continuar?`)) return false;
        limpiarPiezaCompleta(pieza);
        return true;
    }

    if (nuevoEsExclusivo && tieneOtrosHallazgos(pieza, true)) {
        if (!confirm(`Esto eliminará los demás hallazgos de la pieza ${pieza}. ¿Continuar?`)) return false;
        limpiarPiezaCompleta(pieza);
        return true;
    }

    return true;
}

function manejarClicTramo(pieza) {
    const meta = HALLAZGOS[herramientaActiva];

    if (!tramoEnProgreso) {
        const exclusiva = tienePiezaExclusiva(pieza);
        if (exclusiva) { alert(mensajeBloqueoExclusion(pieza, exclusiva)); return; }
        tramoEnProgreso = { codigo: herramientaActiva, piezaInicio: pieza };
        actualizarHint(`"${meta.etiqueta}": pieza inicial ${pieza} seleccionada. Ahora seleccione la pieza final.`, true);
        return;
    }

    const inicio = tramoEnProgreso.piezaInicio;
    if (pieza === inicio) {
        tramoEnProgreso = null;
        actualizarHintPredeterminado();
        return;
    }
    if (arcadaPorPieza[pieza] !== arcadaPorPieza[inicio]) {
        alert('Ambas piezas del tramo deben pertenecer a la misma arcada.');
        return;
    }

    if (!autorizarNuevoTramo(tramoEnProgreso.codigo, inicio, pieza)) {
        tramoEnProgreso = null;
        actualizarHintPredeterminado();
        return;
    }

    establecerTramo(tramoEnProgreso.codigo, inicio, pieza);
    tramoEnProgreso = null;
    actualizarHintPredeterminado();
}

// -----------------------------------------------------------------
// Reglas de exclusion de protesis (ver PROTESIS_HALLAZGOS_INCOMPATIBLES):
// las piezas cubiertas por un tramo nuevo no pueden tener hallazgos
// incompatibles con esa categoria, y dos tramos no pueden solaparse.
// -----------------------------------------------------------------
function autorizarNuevoTramo(codigo, piezaInicio, piezaFin) {
    const cubiertas = piezasCubiertasPorTramo(piezaInicio, piezaFin);

    for (const p of cubiertas) {
        const exclusiva = tienePiezaExclusiva(p);
        if (exclusiva) { alert(mensajeBloqueoExclusion(p, exclusiva)); return false; }
    }

    const tramosSolapados = piezasVisibles.filter((f) => {
        if (!esFilaTramo(f)) return false;
        const cubiertasExistente = piezasCubiertasPorTramo(f.pieza, finDeTramo(f));
        return cubiertasExistente.some((p) => cubiertas.includes(p));
    });
    if (tramosSolapados.length > 0) {
        if (!confirm('Ya existe una prótesis en una o más piezas de este tramo. Esto la reemplazará. ¿Continuar?')) return false;
        piezasVisibles = piezasVisibles.filter((f) => !tramosSolapados.includes(f));
    }

    const categoria = categoriaTramo(codigo);
    const incompatibles = PROTESIS_HALLAZGOS_INCOMPATIBLES[categoria] || [];
    const filasIncompatibles = piezasVisibles.filter((f) => cubiertas.includes(f.pieza) && f.hallazgo && incompatibles.includes(f.hallazgo));
    if (filasIncompatibles.length > 0) {
        if (!confirm('Esto eliminará los hallazgos incompatibles de las piezas del tramo. ¿Continuar?')) return false;
        piezasVisibles = piezasVisibles.filter((f) => !filasIncompatibles.includes(f));
    }

    return true;
}

// El borrador debe poder quitar CUALQUIER hallazgo haciendo clic donde esta
// dibujado: si el clic especifico (superficie/asterisco de sellante) no
// tenia nada, se intenta a nivel de pieza completa (ausente, corona,
// endodoncia, implante, perdidas...) y por ultimo el tramo que cubra la
// pieza (con confirmacion, ya que afecta piezas vecinas).
function manejarBorrado(pieza, superficie, caja) {
    if (caja === 'movilidad' || caja === 'recesion') {
        const anot = filaAnotacion(pieza);
        if (!anot) return;
        const movilidad = caja === 'movilidad' ? null : anot.movilidad;
        const recesion = caja === 'recesion' ? null : anot.recesion;
        establecerAnotacionPieza(pieza, movilidad, recesion);
        return;
    }

    if (superficie === SUPERFICIE_SELLANTE_HIT) {
        piezasVisibles = piezasVisibles.filter((f) => !(f.pieza === pieza && (f.hallazgo === 'sellante_necesario' || f.hallazgo === 'sellante_realizado')));
        return;
    }

    if (superficie && superficie !== 'completa') {
        const habiaHallazgo = piezasVisibles.some((f) => f.pieza === pieza && f.superficie === superficie && f.hallazgo);
        if (habiaHallazgo) {
            piezasVisibles = piezasVisibles.filter((f) => !(f.pieza === pieza && f.superficie === superficie && f.hallazgo));
            return;
        }
    }

    const teniaHallazgoPieza = piezasVisibles.some((f) => f.pieza === pieza && f.superficie === 'completa' && f.hallazgo);
    if (teniaHallazgoPieza) {
        piezasVisibles = piezasVisibles.filter((f) => !(f.pieza === pieza && f.superficie === 'completa' && f.hallazgo));
        return;
    }

    borrarTramoDePieza(pieza);
}

function borrarTramoDePieza(pieza) {
    const fila = piezasVisibles.find((f) => esFilaTramo(f) && piezasCubiertasPorTramo(f.pieza, finDeTramo(f)).includes(pieza));
    if (!fila) return;
    if (!confirm(`¿Eliminar la prótesis del tramo ${fila.pieza}–${finDeTramo(fila)}?`)) return;
    piezasVisibles = piezasVisibles.filter((f) => f !== fila);
}

function manejarDobleClicOdontograma(evento) {
    if (!modoEdicion || herramientaActiva !== 'borrar') return;
    const zona = evento.target.closest('[data-pieza]');
    if (!zona) return;
    limpiarPiezaCompleta(zona.dataset.pieza);
    finalizarCambio();
}

function limpiarPiezaCompleta(pieza) {
    piezasVisibles = piezasVisibles.filter((f) => {
        if (f.pieza === pieza) return false;
        if (esFilaTramo(f) && piezasCubiertasPorTramo(f.pieza, finDeTramo(f)).includes(pieza)) return false;
        return true;
    });
}

function aplicarValorEspecial(pieza, tipo, valor) {
    const anot = filaAnotacion(pieza) || {};
    const movilidad = tipo === 'movilidad' ? valor : (anot.movilidad ?? null);
    const recesion = tipo === 'recesion' ? valor : (anot.recesion ?? null);
    establecerAnotacionPieza(pieza, movilidad, recesion);
}

function finalizarCambio() {
    renderizarSvgOdontograma();
    actualizarContadorHallazgos();
    actualizarCpoEnVivo();
    if (typeof actualizarAvisoEstadoOdontogramaEnCpo === 'function') actualizarAvisoEstadoOdontogramaEnCpo();
    if (typeof actualizarSugerenciasHigiene === 'function') actualizarSugerenciasHigiene();
}

function manejarHoverOdontograma(evento) {
    if (!modoEdicion || !herramientaActiva) return;
    limpiarHoverPrevio();
    const zona = evento.target.closest('[data-pieza]');
    if (!zona) return;
    if (zona.dataset.superficie === SUPERFICIE_SELLANTE_HIT && herramientaActiva !== 'borrar') return;
    zona.classList.add(`odonto-zona-hover--${colorHoverHerramienta()}`);
    zona.setAttribute('data-hover-aplicado', '1');
}

function manejarHoverSalida() {
    limpiarHoverPrevio();
}

function limpiarHoverPrevio() {
    document.querySelectorAll('[data-hover-aplicado]').forEach((el) => {
        el.classList.remove('odonto-zona-hover--rojo', 'odonto-zona-hover--azul', 'odonto-zona-hover--neutro', 'odonto-zona-hover--dorado');
        el.removeAttribute('data-hover-aplicado');
    });
}

function colorHoverHerramienta() {
    if (herramientaActiva === 'borrar') return 'rojo';
    if (herramientaActiva === 'movilidad' || herramientaActiva === 'recesion') return 'dorado';
    const meta = HALLAZGOS[herramientaActiva];
    return meta ? meta.color : 'dorado';
}

// -----------------------------------------------------------------
// Autocalculo CPO-ceo en vivo (a partir de piezasVisibles en memoria)
// -----------------------------------------------------------------
function calcularCpoEnVivo() {
    const resultado = { permanente: { c: 0, p: 0, o: 0 }, temporal: { c: 0, e: 0, o: 0 } };
    const porPieza = {};
    piezasVisibles.forEach((f) => {
        if (!f.hallazgo) return;
        if (!porPieza[f.pieza]) porPieza[f.pieza] = new Set();
        porPieza[f.pieza].add(f.hallazgo);
    });

    Object.entries(porPieza).forEach(([pieza, hallazgos]) => {
        const temporal = esPiezaTemporal(pieza);
        const destino = temporal ? resultado.temporal : resultado.permanente;
        // El implante (indicado/realizado) no altera los indices CPO-ceo.
        if (hallazgos.has('perdida_caries') || hallazgos.has('ausente')) {
            temporal ? destino.e++ : destino.p++;
        } else if (hallazgos.has('caries')) {
            destino.c++;
        } else if (hallazgos.has('obturado')) {
            destino.o++;
        }
    });

    resultado.permanente.total = resultado.permanente.c + resultado.permanente.p + resultado.permanente.o;
    resultado.temporal.total = resultado.temporal.c + resultado.temporal.e + resultado.temporal.o;
    return resultado;
}

function actualizarCpoEnVivo() {
    const linea = document.getElementById('odonto-contador-cpo');
    if (!linea) return;
    if (!modoEdicion) { linea.textContent = ''; return; }
    const cpo = calcularCpoEnVivo();
    linea.textContent = `CPO permanente C:${cpo.permanente.c} P:${cpo.permanente.p} O:${cpo.permanente.o} · ceo temporal c:${cpo.temporal.c} e:${cpo.temporal.e} o:${cpo.temporal.o}`;
}

// -----------------------------------------------------------------
// Construccion del SVG del diagrama
// -----------------------------------------------------------------
function renderizarSvgOdontograma() {
    // Cada fila reserva, de su lado "afuera" de la boca, la banda del numero
    // (+ MOV/REC si es permanente) y, de su lado "adentro", la banda del
    // asterisco de sellante - ver extentoExterior()/extentoInterior().
    let cursorY = 10;
    const posicionesY = [];
    FILAS_ODONTOGRAMA.forEach((fila) => {
        const half = anchoUnidad(fila) / 2;
        const arriba = fila.arcada === 'superior' ? extentoExterior(fila) : extentoInterior();
        cursorY += arriba + half;
        posicionesY.push(cursorY);
        const abajo = fila.arcada === 'superior' ? extentoInterior() : extentoExterior(fila);
        cursorY += half + abajo;
    });
    const alturaSvg = cursorY + 10;

    const piezaPosiciones = {};
    let contenido = '';

    FILAS_ODONTOGRAMA.forEach((fila, indiceFila) => {
        const unidad = anchoUnidad(fila);
        const half = unidad / 2;
        const anchoFilaPx = anchoFila(fila);
        const inicioX = CENTRO_X - anchoFilaPx / 2 + unidad / 2;
        const cy = posicionesY[indiceFila];
        const etiquetaArriba = fila.arcada === 'superior';

        contenido += `<line class="odonto-linea-media" x1="${CENTRO_X}" y1="${cy - half - 4}" x2="${CENTRO_X}" y2="${cy + half + 4}"></line>`;

        // Posiciones Y de numero / MOV / REC (lado exterior) y sellante/endodoncia (interior)
        const yNumero = etiquetaArriba ? cy - half - HOLGURA - ALTURA_NUMERO + 9 : cy + half + HOLGURA + ALTURA_NUMERO - 3;
        const signoInterior = etiquetaArriba ? 1 : -1;
        const ySellante = cy + signoInterior * (half + DISTANCIA_BANDA_INFERIOR);
        const signo = etiquetaArriba ? -1 : 1;
        const yMov = yNumero + signo * (HOLGURA + ALTURA_FILA_CAJA);
        const yRec = yMov + signo * ALTURA_FILA_CAJA;

        if (fila.tipo === 'permanente') {
            contenido += dibujarRotuloFila('MOV', 2, yMov);
            contenido += dibujarRotuloFila('REC', 2, yRec);
        }

        fila.piezas.forEach((pieza, indicePieza) => {
            const cx = inicioX + indicePieza * (unidad + ESPACIO_ENTRE_PIEZAS);
            const esMitadIzquierda = indicePieza < fila.piezas.length / 2;
            piezaPosiciones[pieza] = { cx, cy, arcada: fila.arcada, tipo: fila.tipo };

            contenido += fila.tipo === 'permanente'
                ? piezaCuadrado(pieza, cx, cy, TAMANO_PERMANENTE, fila.arcada, esMitadIzquierda)
                : piezaCirculo(pieza, cx, cy, RADIO_EXTERNO_TEMPORAL, RADIO_INTERNO_TEMPORAL, fila.arcada, esMitadIzquierda);

            contenido += dibujarSimboloSiHay(pieza, cx, cy, unidad, fila.tipo);
            contenido += dibujarEtiquetaPieza(pieza, cx, yNumero);
            contenido += dibujarBandaInferiorSiHay(pieza, cx, ySellante, signoInterior);

            if (fila.tipo === 'permanente') {
                contenido += dibujarCajaMovRec(pieza, cx, yMov, 'movilidad');
                contenido += dibujarCajaMovRec(pieza, cx, yRec, 'recesion');
            }
        });
    });

    contenido += dibujarTramos(piezaPosiciones);
    contenido += dibujarSeleccionTramo(piezaPosiciones);

    const svg = document.getElementById('odontograma-svg');
    svg.setAttribute('viewBox', `0 0 ${ANCHO_SVG} ${alturaSvg}`);
    svg.setAttribute('width', ANCHO_SVG);
    svg.setAttribute('data-modo-lectura', modoEdicion ? '0' : '1');
    svg.innerHTML = contenido;
}

function piezaCuadrado(pieza, cx, cy, s, arcada, esMitadIzquierda) {
    const m = s * 0.32;
    const half = s / 2;
    const x0 = cx - half, y0 = cy - half, x1 = cx + half, y1 = cy + half;
    const ix0 = x0 + m, iy0 = y0 + m, ix1 = x1 - m, iy1 = y1 - m;

    // Vestibular siempre hacia el exterior de la boca: arriba en la arcada
    // superior, abajo en la inferior. Mesial siempre hacia la linea media.
    const zonas = [
        { superficie: arcada === 'superior' ? 'vestibular' : 'lingual_palatino', pts: [[x0, y0], [x1, y0], [ix1, iy0], [ix0, iy0]] },
        { superficie: esMitadIzquierda ? 'mesial' : 'distal', pts: [[x1, y0], [x1, y1], [ix1, iy1], [ix1, iy0]] },
        { superficie: arcada === 'superior' ? 'lingual_palatino' : 'vestibular', pts: [[x1, y1], [x0, y1], [ix0, iy1], [ix1, iy1]] },
        { superficie: esMitadIzquierda ? 'distal' : 'mesial', pts: [[x0, y1], [x0, y0], [ix0, iy0], [ix0, iy1]] },
        { superficie: 'oclusal', pts: [[ix0, iy0], [ix1, iy0], [ix1, iy1], [ix0, iy1]] }
    ];

    return zonas.map((z) => {
        const d = `M${z.pts.map((p) => p.join(',')).join(' L')} Z`;
        const centroide = [z.pts.reduce((s, p) => s + p[0], 0) / 4, z.pts.reduce((s, p) => s + p[1], 0) / 4];
        return trazarZona(pieza, z.superficie, d, centroide);
    }).join('');
}

function piezaCirculo(pieza, cx, cy, rExt, rInt, arcada, esMitadIzquierda) {
    const rMedio = (rExt + rInt) / 2;
    const sector = (superficie, anguloInicio, anguloFin) => {
        const d = sectorAnular(cx, cy, rInt, rExt, anguloInicio, anguloFin);
        const anguloMedioRad = ((anguloInicio + anguloFin) / 2) * Math.PI / 180;
        const centroide = [cx + rMedio * Math.cos(anguloMedioRad), cy + rMedio * Math.sin(anguloMedioRad)];
        return trazarZona(pieza, superficie, d, centroide);
    };

    let svg = '';
    svg += sector(arcada === 'superior' ? 'vestibular' : 'lingual_palatino', 225, 315);
    svg += sector(esMitadIzquierda ? 'mesial' : 'distal', -45, 45);
    svg += sector(arcada === 'superior' ? 'lingual_palatino' : 'vestibular', 45, 135);
    svg += sector(esMitadIzquierda ? 'distal' : 'mesial', 135, 225);
    svg += trazarZona(pieza, 'oclusal', null, [cx, cy], `<circle data-pieza="${pieza}" data-superficie="oclusal" cx="${cx}" cy="${cy}" r="${rInt}"></circle>`);
    return svg;
}

function trazarZona(pieza, superficie, path, centroide, svgPersonalizado) {
    const fila = filaSuperficie(pieza, superficie);
    // El relleno de superficie aplica UNICAMENTE a caries (rojo) y obturado
    // (azul); el sellante se representa con un asterisco bajo el diente
    // (ver dibujarSellantesSiHay), nunca como relleno sobre la superficie.
    const claseColor = fila && (fila.hallazgo === 'caries' || fila.hallazgo === 'obturado') ? ` pieza-zona--${fila.color_tipo}` : '';
    const claseAtenuada = esPiezaAusente(pieza) ? ' pieza-zona--atenuada' : '';
    const clase = `${claseColor}${claseAtenuada}`;

    if (svgPersonalizado) {
        return svgPersonalizado.replace('<circle ', `<circle class="pieza-zona${clase}" `);
    }
    return `<path class="pieza-zona${clase}" data-pieza="${pieza}" data-superficie="${superficie}" d="${path}"></path>`;
}

function sectorAnular(cx, cy, rInt, rExt, anguloInicioDeg, anguloFinDeg) {
    const punto = (r, deg) => {
        const rad = (deg * Math.PI) / 180;
        return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
    };
    const [x0, y0] = punto(rExt, anguloInicioDeg);
    const [x1, y1] = punto(rExt, anguloFinDeg);
    const [x2, y2] = punto(rInt, anguloFinDeg);
    const [x3, y3] = punto(rInt, anguloInicioDeg);
    return `M${x0},${y0} A${rExt},${rExt} 0 0 1 ${x1},${y1} L${x2},${y2} A${rInt},${rInt} 0 0 0 ${x3},${y3} Z`;
}

function dibujarSimboloSiHay(pieza, cx, cy, tamano, tipo) {
    // Puede haber mas de un hallazgo de pieza completa a la vez (p.ej.
    // corona y endodoncia, clinicamente compatibles: ver GRUPOS_PIEZA_DIRECTOS).
    // La endodoncia se dibuja aparte, en la banda bajo la pieza (ver
    // dibujarBandaInferiorSiHay), para no chocar con el contorno de la corona.
    const filas = piezasVisibles.filter((f) => f.pieza === pieza && f.superficie === 'completa' && f.hallazgo &&
        f.hallazgo !== 'endodoncia_indicada' && f.hallazgo !== 'endodoncia_realizada');
    return filas.map((f) => dibujarSimboloPieza(f.hallazgo, cx, cy, tamano, f.color_tipo, tipo)).join('');
}

function dibujarSimboloPieza(codigo, cx, cy, tamano, colorClase, tipo) {
    const half = tamano / 2;
    switch (codigo) {
        case 'extraccion_indicada':
        case 'perdida_caries':
            return lineaX(cx, cy, half, colorClase);
        case 'perdida_otra_causa':
            return circuloX(cx, cy, half * 0.85, colorClase);
        case 'ausente':
            // Letra A grande y protagonista; la pieza en si se atenua via
            // la clase pieza-zona--atenuada aplicada en trazarZona().
            return `<text class="pieza-texto-simbolo color-${colorClase}" x="${cx}" y="${cy + tamano * 0.3}" font-size="${tamano * 0.95}" font-weight="900">A</text>`;
        case 'endodoncia_indicada':
            return `<polygon class="pieza-simbolo-contorno color-${colorClase}" points="${cx},${cy - half} ${cx - half},${cy + half} ${cx + half},${cy + half}"></polygon>`;
        case 'endodoncia_realizada':
            return `<polygon class="pieza-simbolo-relleno color-${colorClase}" points="${cx},${cy - half} ${cx - half},${cy + half} ${cx + half},${cy + half}"></polygon>`;
        case 'corona_indicada':
        case 'corona_realizada':
            return dobleContorno(cx, cy, tamano, colorClase, tipo === 'temporal');
        case 'implante_indicado':
        case 'implante_realizado':
            return simboloImplante(cx, cy, tamano, colorClase);
        default:
            return '';
    }
}

function lineaX(cx, cy, half, colorClase) {
    return `<line class="pieza-simbolo-contorno color-${colorClase}" x1="${cx - half}" y1="${cy - half}" x2="${cx + half}" y2="${cy + half}"></line>
            <line class="pieza-simbolo-contorno color-${colorClase}" x1="${cx + half}" y1="${cy - half}" x2="${cx - half}" y2="${cy + half}"></line>`;
}

function circuloX(cx, cy, r, colorClase) {
    return `<circle class="pieza-simbolo-contorno color-${colorClase}" cx="${cx}" cy="${cy}" r="${r}"></circle>
            <line class="pieza-simbolo-contorno color-${colorClase}" x1="${cx - r * 0.7}" y1="${cy - r * 0.7}" x2="${cx + r * 0.7}" y2="${cy + r * 0.7}"></line>
            <line class="pieza-simbolo-contorno color-${colorClase}" x1="${cx + r * 0.7}" y1="${cy - r * 0.7}" x2="${cx - r * 0.7}" y2="${cy + r * 0.7}"></line>`;
}

function dobleContorno(cx, cy, tamano, colorClase, esCircular) {
    // Contorno doble concentrico fino, pegado a la pieza (no un marco grueso
    // tipo seleccion). En piezas temporales se dibuja como doble circulo.
    const outer = tamano * 1.06, inner = tamano * 0.8;
    if (esCircular) {
        return `<circle class="pieza-simbolo-fino color-${colorClase}" cx="${cx}" cy="${cy}" r="${outer / 2}"></circle>
                <circle class="pieza-simbolo-fino color-${colorClase}" cx="${cx}" cy="${cy}" r="${inner / 2}"></circle>`;
    }
    return `<rect class="pieza-simbolo-fino color-${colorClase}" x="${cx - outer / 2}" y="${cy - outer / 2}" width="${outer}" height="${outer}"></rect>
            <rect class="pieza-simbolo-fino color-${colorClase}" x="${cx - inner / 2}" y="${cy - inner / 2}" width="${inner}" height="${inner}"></rect>`;
}

// Banda "bajo la pieza" (lado oclusal/interior): asterisco(s) de sellante y,
// si la pieza tambien tiene endodoncia, su triangulo pequeño apilado justo
// despues (mas lejos de la pieza que el sellante). Si solo hay endodoncia
// (sin sellante), el triangulo toma la posicion mas cercana.
function dibujarBandaInferiorSiHay(pieza, cx, ySlot0, signoInterior) {
    const conSellante = piezasVisibles.filter((f) => f.pieza === pieza && (f.hallazgo === 'sellante_necesario' || f.hallazgo === 'sellante_realizado'));
    const filaEndo = piezasVisibles.find((f) => f.pieza === pieza && f.superficie === 'completa' && (f.hallazgo === 'endodoncia_indicada' || f.hallazgo === 'endodoncia_realizada'));

    if (conSellante.length === 0 && !filaEndo) {
        // Zona de clic invisible minima igual, para que el borrador siempre
        // tenga algo que alcanzar en esta banda (ver manejarBorrado).
        return `<rect class="odonto-simbolo-hit" data-pieza="${pieza}" data-superficie="${SUPERFICIE_SELLANTE_HIT}" x="${cx - 10}" y="${ySlot0 - 7}" width="20" height="14"></rect>`;
    }

    const paso = 11;
    const anchoHit = Math.max(20, conSellante.length * paso + 8);
    const haySegundoSlot = conSellante.length > 0 && !!filaEndo;
    const altoHit = haySegundoSlot ? PASO_APILADO + 14 : 14;
    const centroHit = haySegundoSlot ? ySlot0 + (signoInterior * PASO_APILADO) / 2 : ySlot0;

    let svg = `<rect class="odonto-simbolo-hit" data-pieza="${pieza}" data-superficie="${SUPERFICIE_SELLANTE_HIT}" x="${cx - anchoHit / 2}" y="${centroHit - altoHit / 2}" width="${anchoHit}" height="${altoHit}"></rect>`;

    if (conSellante.length > 0) {
        const inicioX = cx - ((conSellante.length - 1) * paso) / 2;
        svg += conSellante.map((f, i) => dibujarAsterisco(inicioX + i * paso, ySlot0, f.color_tipo, 5)).join('');
    }
    if (filaEndo) {
        const yEndo = conSellante.length > 0 ? ySlot0 + signoInterior * PASO_APILADO : ySlot0;
        svg += dibujarSimboloPieza(filaEndo.hallazgo, cx, yEndo, 13, filaEndo.color_tipo);
    }
    return svg;
}

function simboloImplante(cx, cy, tamano, colorClase) {
    const half = tamano / 2;
    let hilos = '';
    for (let i = -1; i <= 1; i++) {
        const y = cy + i * half * 0.35;
        hilos += `<line class="pieza-simbolo-contorno color-${colorClase}" x1="${cx - 4}" y1="${y - 2}" x2="${cx + 4}" y2="${y + 2}"></line>`;
    }
    return `<circle class="pieza-simbolo-contorno color-${colorClase}" cx="${cx}" cy="${cy - half}" r="3"></circle>
            <line class="pieza-simbolo-contorno color-${colorClase}" x1="${cx}" y1="${cy - half + 3}" x2="${cx}" y2="${cy + half}"></line>
            ${hilos}`;
}

function dibujarAsterisco(x, y, colorClase, radio) {
    radio = radio || 6;
    return [0, 60, 120].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const dx = radio * Math.cos(rad), dy = radio * Math.sin(rad);
        return `<line class="pieza-simbolo-contorno color-${colorClase}" x1="${x - dx}" y1="${y - dy}" x2="${x + dx}" y2="${y + dy}"></line>`;
    }).join('');
}

function dibujarEtiquetaPieza(pieza, cx, yNumero) {
    return `<rect class="odonto-numero-hit" data-pieza="${pieza}" data-superficie="completa" x="${cx - 14}" y="${yNumero - 10}" width="28" height="13"></rect>
            <text class="pieza-numero" x="${cx}" y="${yNumero}">${pieza}</text>`;
}

function dibujarCajaMovRec(pieza, cx, y, tipoCaja) {
    const lado = 12;
    const anot = filaAnotacion(pieza);
    const valor = anot && anot[tipoCaja] !== null && anot[tipoCaja] !== undefined ? anot[tipoCaja] : '';
    const titulo = tipoCaja === 'movilidad' ? 'Movilidad' : 'Recesión';
    return `
        <rect class="pieza-caja" data-pieza="${pieza}" data-superficie="completa" data-caja="${tipoCaja}" x="${cx - lado / 2}" y="${y - lado / 2}" width="${lado}" height="${lado}"><title>${titulo}</title></rect>
        <text class="pieza-caja-texto" x="${cx}" y="${y + lado / 2 - 2.5}">${valor}</text>
    `;
}

function dibujarRotuloFila(texto, x, y) {
    return `<text class="odonto-rotulo-fila" x="${x}" y="${y + 3}">${texto}</text>`;
}

// -----------------------------------------------------------------
// Tramos (protesis fija / removible / total): conectores entre dos piezas
// -----------------------------------------------------------------
function dibujarTramos(piezaPosiciones) {
    let svg = '';
    piezasVisibles.forEach((f) => {
        if (!esFilaTramo(f)) return;
        const posInicio = piezaPosiciones[f.pieza];
        const posFin = piezaPosiciones[finDeTramo(f)];
        if (!posInicio || !posFin) return;
        svg += dibujarSimboloTramo(f.hallazgo, posInicio, posFin, f.color_tipo);
    });
    return svg;
}

function dibujarSimboloTramo(codigo, posA, posB, colorClase) {
    // Trazo fino claramente SEPARADO de las piezas (fuera de su silueta, del
    // lado "interior"/oclusal, el mismo que usa el sellante — nunca chocan
    // porque un tramo excluye el sellante en sus piezas cubiertas). Empieza y
    // termina exactamente en los limites del tramo: el borde exterior de la
    // primera pieza y el de la ultima, nunca mas alla (no monta piezas vecinas).
    const half = (posA.tipo === 'permanente' ? TAMANO_PERMANENTE : RADIO_EXTERNO_TEMPORAL * 2) / 2;
    const signo = posA.arcada === 'superior' ? 1 : -1;
    const GAP_TRAMO = 4;
    const y = posA.cy + signo * (half + GAP_TRAMO);
    const xIni = Math.min(posA.cx, posB.cx) - half;
    const xFin = Math.max(posA.cx, posB.cx) + half;
    const claseLinea = `odonto-tramo-linea color-${colorClase}`;

    if (codigo.startsWith('protesis_fija')) {
        const s = 7;
        return `<line class="${claseLinea}" x1="${xIni}" y1="${y}" x2="${xFin}" y2="${y}"></line>
                <rect class="pieza-simbolo-contorno color-${colorClase}" x="${xIni - s / 2}" y="${y - s / 2}" width="${s}" height="${s}"></rect>
                <rect class="pieza-simbolo-contorno color-${colorClase}" x="${xFin - s / 2}" y="${y - s / 2}" width="${s}" height="${s}"></rect>`;
    }
    if (codigo.startsWith('protesis_removible')) {
        return `<line class="${claseLinea}" x1="${xIni}" y1="${y}" x2="${xFin}" y2="${y}"></line>
                <path class="pieza-simbolo-contorno color-${colorClase}" d="M${xIni + 5},${y - 5} Q${xIni},${y} ${xIni + 5},${y + 5}"></path>
                <path class="pieza-simbolo-contorno color-${colorClase}" d="M${xFin - 5},${y - 5} Q${xFin},${y} ${xFin - 5},${y + 5}"></path>`;
    }
    if (codigo.startsWith('protesis_total')) {
        return `<line class="${claseLinea}" x1="${xIni}" y1="${y - 2}" x2="${xFin}" y2="${y - 2}"></line>
                <line class="${claseLinea}" x1="${xIni}" y1="${y + 2}" x2="${xFin}" y2="${y + 2}"></line>`;
    }
    return '';
}

function dibujarSeleccionTramo(piezaPosiciones) {
    if (!tramoEnProgreso) return '';
    const pos = piezaPosiciones[tramoEnProgreso.piezaInicio];
    if (!pos) return '';
    const r = (pos.tipo === 'permanente' ? TAMANO_PERMANENTE : RADIO_EXTERNO_TEMPORAL * 2) / 2 + 5;
    return `<rect class="odonto-pieza-seleccionada" x="${pos.cx - r}" y="${pos.cy - r}" width="${r * 2}" height="${r * 2}" rx="5"></rect>`;
}

// -----------------------------------------------------------------
// Iconos en miniatura para la paleta y la leyenda
// -----------------------------------------------------------------
function iconoPaletaPorCodigo(id) {
    const cx = 13, cy = 13;

    if (id === 'movilidad') return cajaIcono('M');
    if (id === 'recesion') return cajaIcono('R');
    if (id === 'borrar') {
        return `<svg viewBox="0 0 26 26" width="24" height="24"><rect x="5" y="9" width="16" height="10" rx="2" fill="var(--gris-claro)" stroke="var(--gris-calido)"></rect><line x1="5" y1="9" x2="21" y2="19" stroke="var(--negro)" stroke-width="1.5"></line></svg>`;
    }

    const meta = HALLAZGOS[id];
    if (!meta) return '';

    if (meta.nivel === 'superficie') {
        if (id === 'sellante_necesario' || id === 'sellante_realizado') {
            // Asterisco BAJO el diente (nunca sobre la superficie), como en el instructivo del F033.
            return `<svg viewBox="0 0 26 26" width="24" height="24"><rect x="6" y="2" width="14" height="14" rx="2" fill="none" stroke="var(--gris-claro)"></rect>${dibujarAsterisco(13, 21, meta.color, 4)}</svg>`;
        }
        return `<svg viewBox="0 0 26 26" width="24" height="24"><rect x="4" y="4" width="18" height="18" rx="2" class="pieza-zona--${meta.color}"></rect></svg>`;
    }
    if (meta.nivel === 'tramo') {
        // Miniatura propia y centrada (no reutiliza dibujarSimboloTramo: esa
        // funcion posiciona el trazo relativo al borde real de una pieza del
        // diagrama, coordenadas que no caben en el viewBox de 26x26 del icono).
        return `<svg viewBox="0 0 26 26" width="24" height="24">${iconoMiniaturaTramo(id, meta.color)}</svg>`;
    }
    return `<svg viewBox="0 0 26 26" width="24" height="24">${dibujarSimboloPieza(id, cx, cy, 16, meta.color)}</svg>`;
}

function iconoMiniaturaTramo(id, colorClase) {
    const y = 15, xIni = 4, xFin = 22;
    const claseLinea = `odonto-tramo-linea color-${colorClase}`;
    if (id.startsWith('protesis_fija')) {
        const s = 6;
        return `<line class="${claseLinea}" x1="${xIni}" y1="${y}" x2="${xFin}" y2="${y}"></line>
                <rect class="pieza-simbolo-contorno color-${colorClase}" x="${xIni - s / 2}" y="${y - s / 2}" width="${s}" height="${s}"></rect>
                <rect class="pieza-simbolo-contorno color-${colorClase}" x="${xFin - s / 2}" y="${y - s / 2}" width="${s}" height="${s}"></rect>`;
    }
    if (id.startsWith('protesis_removible')) {
        return `<line class="${claseLinea}" x1="${xIni}" y1="${y}" x2="${xFin}" y2="${y}"></line>
                <path class="pieza-simbolo-contorno color-${colorClase}" d="M${xIni + 4},${y - 4} Q${xIni},${y} ${xIni + 4},${y + 4}"></path>
                <path class="pieza-simbolo-contorno color-${colorClase}" d="M${xFin - 4},${y - 4} Q${xFin},${y} ${xFin - 4},${y + 4}"></path>`;
    }
    if (id.startsWith('protesis_total')) {
        return `<line class="${claseLinea}" x1="${xIni}" y1="${y - 2}" x2="${xFin}" y2="${y - 2}"></line>
                <line class="${claseLinea}" x1="${xIni}" y1="${y + 2}" x2="${xFin}" y2="${y + 2}"></line>`;
    }
    return '';
}

function cajaIcono(letra) {
    return `<svg viewBox="0 0 26 26" width="24" height="24"><rect x="5" y="5" width="16" height="16" rx="2" fill="none" stroke="var(--dorado)" stroke-width="1.5"></rect><text x="13" y="17" text-anchor="middle" font-size="11" font-weight="700" fill="var(--dorado)">${letra}</text></svg>`;
}
