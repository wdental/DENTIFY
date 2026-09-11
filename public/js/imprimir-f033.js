// =====================================================================
// Vista de impresion del Formulario 033 (SNS-MSP/HCU-form.033/2021).
// Toma SIEMPRE los datos ya guardados (nunca borradores en edicion) via
// las mismas API que el resto de la app. Reutiliza el renderizador SVG
// del odontograma (public/js/odontograma.js, cargado en esta pagina sin
// su interfaz interactiva) para dibujar la seccion H con los mismos
// simbolos que se ven en pantalla.
// =====================================================================

// Catalogos duplicados de ficha-clinica.js (esa pantalla no se carga aqui
// para no disparar su propia construccion de UI interactiva).
const ANTECEDENTES_PERSONALES_IMPRESION = [
    { codigo: 'alergia_antibiotico', etiqueta: '1. Alergia a antibiótico', conTexto: false },
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

const ANTECEDENTES_FAMILIARES_IMPRESION = [
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

const EXAMEN_ESTOMATOGNATICO_ITEMS_IMPRESION = [
    { num: 1, etiqueta: 'Labios' }, { num: 2, etiqueta: 'Mejillas' },
    { num: 3, etiqueta: 'Maxilar superior' }, { num: 4, etiqueta: 'Maxilar inferior' },
    { num: 5, etiqueta: 'Lengua' }, { num: 6, etiqueta: 'Paladar' },
    { num: 7, etiqueta: 'Piso de la boca' }, { num: 8, etiqueta: 'Carrillos' },
    { num: 9, etiqueta: 'Glándulas salivales' }, { num: 10, etiqueta: 'Orofaringe' },
    { num: 11, etiqueta: 'A.T.M.' }, { num: 12, etiqueta: 'Ganglios' }, { num: 13, etiqueta: 'Otros' }
];

const PIEZAS_HIGIENE_IMPRESION = [
    ['16', '17', '55'], ['11', '21', '51'], ['26', '27', '65'],
    ['36', '37', '75'], ['31', '41', '71'], ['46', '47', '85']
];

// Marca en negrita/subrayado la pieza efectivamente examinada dentro del
// trio (la guardada en pieza_examinada); si no se examino ninguna, el trio
// se muestra tal cual, sin marca.
function trioConPiezaMarcada(trio, piezaExaminada) {
    return trio.map((p) => (p === piezaExaminada ? `<u><strong>${p}</strong></u>` : p)).join(' / ');
}

const RAYA = '<span class="f033-raya">—</span>';

(async () => {
    const parametros = new URLSearchParams(window.location.search);
    const pacienteId = parametros.get('id');
    if (!pacienteId) { mostrarErrorCarga('Falta el identificador del paciente en la URL'); return; }

    try {
        const [paciente, ficha, odontogramaResp, diagnosticos, evoluciones, doctores, versionesOdontograma] = await Promise.all([
            api.get(`/api/pacientes/${pacienteId}`),
            api.get(`/api/ficha-clinica/${pacienteId}`),
            api.get(`/api/odontograma/${pacienteId}/activo`),
            api.get(`/api/diagnosticos/${pacienteId}`),
            api.get(`/api/evoluciones/${pacienteId}`),
            api.get('/api/doctores'),
            api.get(`/api/odontograma/${pacienteId}/versiones`)
        ]);

        // Se imprime SIEMPRE el odontograma inicial (linea base fija) junto al
        // actual (evolucion/alta activa), para poder comparar lo encontrado en
        // la primera consulta contra el estado presente - si el paciente aun
        // no tiene ninguna evolucion, el activo Y el inicial son la misma
        // version y solo se muestra un diagrama (ver bloqueH).
        let odontogramaInicialResp = null;
        const versionInicial = (versionesOdontograma || []).find((v) => v.tipo === 'inicial');
        if (versionInicial && (!odontogramaResp.odontograma || versionInicial.id !== odontogramaResp.odontograma.id)) {
            odontogramaInicialResp = await api.get(`/api/odontograma/version/${versionInicial.id}`);
        }

        document.title = `Dentify - F033 - ${paciente.apellidos} ${paciente.nombres}`;
        renderizarImpresion({ paciente, ficha, odontogramaResp, odontogramaInicialResp, diagnosticos, evoluciones, doctores });
    } catch (error) {
        mostrarErrorCarga('No se pudo cargar el formulario: ' + error.message);
    }
})();

function mostrarErrorCarga(mensaje) {
    document.getElementById('contenido-impresion').innerHTML = `<div class="alerta alerta--error no-imprimir" style="margin:30px;">${mensaje}</div>`;
}

function renderizarImpresion(datos) {
    const { paciente, ficha } = datos;
    const contenedor = document.getElementById('contenido-impresion');

    contenedor.innerHTML = paginaUno(datos) + paginaDos(datos);

    // Ahora que los <svg> ya existen en el DOM, se reutiliza el renderizador
    // real del odontograma (odontograma.js) para dibujar cada version con
    // exactamente los mismos simbolos - el inicial (si es distinto del
    // activo) y el actual, uno a la vez (ambos comparten el estado global
    // piezasVisibles, por eso se renderizan en dos pasos secuenciales).
    modoEdicion = false;
    herramientaActiva = null;
    tramoEnProgreso = null;

    if (datos.odontogramaInicialResp && typeof renderizarSvgOdontograma === 'function') {
        piezasVisibles = datos.odontogramaInicialResp.piezas || [];
        renderizarSvgOdontograma(document.getElementById('odontograma-svg-inicial'));
    }
    piezasVisibles = (datos.odontogramaResp && datos.odontogramaResp.piezas) || [];
    if (typeof renderizarSvgOdontograma === 'function') {
        renderizarSvgOdontograma(document.getElementById('odontograma-svg-actual'));
    }
}

// -----------------------------------------------------------------
// PAGINA 1
// -----------------------------------------------------------------
function paginaUno(datos) {
    const { paciente, ficha, odontogramaResp, odontogramaInicialResp } = datos;
    return `
        <div class="hoja-f033">
            ${encabezadoForma(1)}
            ${bloqueEncabezadoA(paciente)}
            ${bloqueB(ficha)}
            ${bloqueC(ficha)}
            ${bloqueDE(ficha)}
            ${bloqueF(ficha)}
            ${bloqueG(ficha)}
            ${bloqueH(odontogramaResp, odontogramaInicialResp)}
            ${bloqueI(ficha)}
            ${bloqueJ(ficha)}
            ${bloqueK()}
            ${pieDePagina(paciente, 1)}
        </div>
    `;
}

function encabezadoForma(numeroPagina) {
    return `
        <div class="f033-encabezado-forma">
            <div>
                <div class="f033-marca">WORLD <span>DENTAL</span></div>
                <div style="font-size:8px; color:var(--texto-secundario);">Establecimiento de salud — Quito, Ecuador</div>
            </div>
            <div class="f033-titulo-forma">
                <strong>FORMULARIO ÚNICO DE ATENCIÓN EN ODONTOLOGÍA</strong>
                SNS-MSP / HCU-form.033/2021 — ODONTOLOGÍA (${numeroPagina})
            </div>
        </div>
    `;
}

function condicionEdad(fechaNacimiento) {
    if (!fechaNacimiento) return { tipo: null, valor: null };
    const nacimiento = new Date(fechaNacimiento + 'T00:00:00');
    const hoy = new Date();
    let anios = hoy.getFullYear() - nacimiento.getFullYear();
    let meses = hoy.getMonth() - nacimiento.getMonth();
    let dias = hoy.getDate() - nacimiento.getDate();
    if (dias < 0) { meses--; }
    if (meses < 0) { anios--; meses += 12; }
    if (anios >= 1) return { tipo: 'A', valor: anios };
    if (meses >= 1) return { tipo: 'M', valor: meses };
    const diasTotales = Math.max(0, Math.floor((hoy - nacimiento) / 86400000));
    return { tipo: 'D', valor: diasTotales };
}

function bloqueEncabezadoA(paciente) {
    const cond = condicionEdad(paciente.fecha_nacimiento);
    const marcaCondicion = (letra) => cond.tipo === letra ? `<strong>[${letra}: ${cond.valor}]</strong>` : letra;
    return `
        <div class="f033-seccion">
            <div class="f033-seccion__titulo">A. Datos de identificación</div>
            <div class="f033-seccion__cuerpo">
                <div class="f033-fila">
                    <div class="f033-campo"><strong>Historia clínica:</strong> ${paciente.numero_historia}</div>
                    <div class="f033-campo"><strong>Apellidos:</strong> ${paciente.apellidos}</div>
                    <div class="f033-campo"><strong>Nombres:</strong> ${paciente.nombres}</div>
                </div>
                <div class="f033-fila">
                    <div class="f033-campo"><strong>Cédula:</strong> ${paciente.cedula || RAYA}</div>
                    <div class="f033-campo"><strong>Sexo:</strong> ${{ F: 'Femenino', M: 'Masculino', O: 'Otro' }[paciente.sexo] || RAYA}</div>
                    <div class="f033-campo"><strong>Fecha de nacimiento:</strong> ${paciente.fecha_nacimiento ? formatearFecha(paciente.fecha_nacimiento) : RAYA}</div>
                    <div class="f033-campo"><strong>Edad:</strong> ${marcaCondicion('H')} — ${marcaCondicion('D')} — ${marcaCondicion('M')} — ${marcaCondicion('A')}</div>
                </div>
            </div>
        </div>
    `;
}

function bloqueB(ficha) {
    const motivo = ficha.motivo_consulta_json || {};
    const embarazada = motivo.embarazada === 'si' ? 'Sí' : motivo.embarazada === 'no' ? 'No' : RAYA;
    return `
        <div class="f033-seccion">
            <div class="f033-seccion__titulo">B. Motivo de consulta</div>
            <div class="f033-seccion__cuerpo">
                <p style="margin:0;">${motivo.texto ? `"${motivo.texto}"` : RAYA}</p>
                <p style="margin:4px 0 0 0;"><strong>Embarazada:</strong> ${embarazada}</p>
            </div>
        </div>
    `;
}

function bloqueC(ficha) {
    const enfermedad = ficha.enfermedad_actual_json || {};
    return `
        <div class="f033-seccion">
            <div class="f033-seccion__titulo">C. Enfermedad o problema actual</div>
            <div class="f033-seccion__cuerpo"><p style="margin:0;">${enfermedad.texto || RAYA}</p></div>
        </div>
    `;
}

function textoAntecedentesImpresion(catalogo, datos) {
    const estados = (datos && datos.estados) || {};
    const filas = catalogo.map((item) => {
        const estado = estados[item.codigo];
        let valor;
        if (estado === 'si') {
            valor = 'Sí' + (item.conTexto && datos.otro_texto ? `: ${datos.otro_texto}` : '');
        } else if (estado === 'no') {
            valor = 'No';
        } else {
            valor = RAYA;
        }
        return `<li>${item.etiqueta}: ${valor}</li>`;
    }).join('');
    const observaciones = datos && datos.observaciones ? `<p style="margin:4px 0 0 0;"><strong>Observaciones:</strong> ${datos.observaciones}</p>` : '';
    return `<ul class="f033-lista-simple">${filas}</ul>${observaciones}`;
}

function bloqueDE(ficha) {
    return `
        <div class="f033-seccion">
            <div class="f033-seccion__titulo">D. Antecedentes patológicos personales</div>
            <div class="f033-seccion__cuerpo">${textoAntecedentesImpresion(ANTECEDENTES_PERSONALES_IMPRESION, ficha.antecedentes_personales_json)}</div>
        </div>
        <div class="f033-seccion">
            <div class="f033-seccion__titulo">E. Antecedentes patológicos familiares</div>
            <div class="f033-seccion__cuerpo">${textoAntecedentesImpresion(ANTECEDENTES_FAMILIARES_IMPRESION, ficha.antecedentes_familiares_json)}</div>
        </div>
    `;
}

function bloqueF(ficha) {
    const v = ficha.constantes_vitales_json || {};
    return `
        <div class="f033-seccion">
            <div class="f033-seccion__titulo">F. Constantes vitales</div>
            <div class="f033-seccion__cuerpo f033-fila">
                <div class="f033-campo"><strong>Temperatura:</strong> ${v.temperatura ?? RAYA} °C</div>
                <div class="f033-campo"><strong>Pulso:</strong> ${v.pulso ?? RAYA} lpm</div>
                <div class="f033-campo"><strong>Frec. respiratoria:</strong> ${v.frecuencia_respiratoria ?? RAYA} rpm</div>
                <div class="f033-campo"><strong>Presión arterial:</strong> ${v.presion_arterial || RAYA} mmHg</div>
            </div>
        </div>
    `;
}

function bloqueG(ficha) {
    const examenData = ficha.examen_estomatognatico_json || {};
    let cuerpo;
    if (examenData.sin_patologia_aparente) {
        cuerpo = '<p style="margin:0;"><strong>Sin patología aparente.</strong></p>';
    } else {
        const items = examenData.items || {};
        const conPatologia = EXAMEN_ESTOMATOGNATICO_ITEMS_IMPRESION.filter((it) => items[it.num] && items[it.num].patologia);
        cuerpo = conPatologia.length === 0
            ? `<p style="margin:0;">${RAYA} Sin hallazgos registrados</p>`
            : `<ul class="f033-lista-simple">${conPatologia.map((it) => `<li>${it.num}. ${it.etiqueta}: ${items[it.num].descripcion || RAYA}</li>`).join('')}</ul>`;
    }
    return `
        <div class="f033-seccion">
            <div class="f033-seccion__titulo">G. Examen del sistema estomatognático</div>
            <div class="f033-seccion__cuerpo">${cuerpo}</div>
        </div>
    `;
}

// Imprime SIEMPRE el odontograma actual (evolucion/alta activa); ademas,
// si el paciente ya tiene evoluciones (el inicial dejo de ser el activo),
// imprime tambien el odontograma INICIAL como linea base fija para poder
// comparar contra el estado presente - a pedido de uso real, antes solo se
// imprimia la version activa y se perdia el registro visual de lo que el
// paciente presento en su primera consulta.
function bloqueH(odontogramaResp, odontogramaInicialResp) {
    const odontogramaActual = odontogramaResp && odontogramaResp.odontograma;
    const metaActual = odontogramaActual
        ? `${ETIQUETAS_TIPO_ODONTOGRAMA[odontogramaActual.tipo] || 'Evolución'} — ${formatearFecha((odontogramaActual.fecha_registro || '').slice(0, 10))}${odontogramaActual.doctor_nombre ? ' · ' + odontogramaActual.doctor_nombre : ''}`
        : 'Sin odontograma registrado';

    const odontogramaInicial = odontogramaInicialResp && odontogramaInicialResp.odontograma;
    const columnaActual = `
        <p class="f033-odontograma-subtitulo">${odontogramaInicial ? 'Odontograma actual (evolución)' : 'Odontograma'} — ${metaActual}</p>
        <div class="f033-odontograma-svg-envoltura">
            <svg id="odontograma-svg-actual" class="odontograma-svg"></svg>
        </div>
    `;

    // Sin evolucion todavia (el activo ES el inicial): un solo diagrama a
    // ancho completo, igual que antes de este ajuste.
    if (!odontogramaInicial) {
        return `
            <div class="f033-seccion">
                <div class="f033-seccion__titulo">H. Odontograma</div>
                <div class="f033-seccion__cuerpo">${columnaActual}</div>
            </div>
        `;
    }

    // Con evolucion: el inicial (linea base fija) y el actual lado a lado,
    // para poder comparar lo encontrado en la primera consulta contra el
    // estado presente sin perder ese registro visual.
    const columnaInicial = `
        <p class="f033-odontograma-subtitulo">Odontograma inicial — ${formatearFecha((odontogramaInicial.fecha_registro || '').slice(0, 10))}${odontogramaInicial.doctor_nombre ? ' · ' + odontogramaInicial.doctor_nombre : ''}</p>
        <div class="f033-odontograma-svg-envoltura">
            <svg id="odontograma-svg-inicial" class="odontograma-svg"></svg>
        </div>
    `;

    return `
        <div class="f033-seccion">
            <div class="f033-seccion__titulo">H. Odontograma</div>
            <div class="f033-seccion__cuerpo">
                <div class="f033-odontograma-doble">
                    <div class="f033-odontograma-columna">${columnaInicial}</div>
                    <div class="f033-odontograma-columna">${columnaActual}</div>
                </div>
            </div>
        </div>
    `;
}

function promedioColumnaImpresion(higiene, campo) {
    let suma = 0, contados = 0;
    (higiene || []).forEach((fila) => {
        const valor = fila ? fila[campo] : null;
        if (valor === null || valor === undefined) return;
        suma += Number(valor);
        contados++;
    });
    return contados > 0 ? (suma / contados).toFixed(1) : RAYA;
}

function bloqueI(ficha) {
    const indicadores = ficha.indicadores_salud_bucal_json || {};
    const higiene = indicadores.higiene || [];
    const filas = PIEZAS_HIGIENE_IMPRESION.map((trio, indice) => {
        const fila = higiene[indice] || {};
        const etiqueta = fila.pieza_examinada ? trioConPiezaMarcada(trio, fila.pieza_examinada) : trio.join(' / ');
        return `<tr><td>${etiqueta}</td><td>${fila.placa ?? RAYA}</td><td>${fila.calculo ?? RAYA}</td><td>${fila.gingivitis ?? RAYA}</td></tr>`;
    }).join('');
    const etiquetasNivel = { leve: 'Leve', moderada: 'Moderada', severa: 'Severa', ninguna: 'Ninguna' };
    return `
        <div class="f033-seccion">
            <div class="f033-seccion__titulo">I. Indicadores de salud bucal</div>
            <div class="f033-seccion__cuerpo">
                <table class="f033-tabla">
                    <thead><tr><th>Piezas</th><th>Placa</th><th>Cálculo</th><th>Gingivitis</th></tr></thead>
                    <tbody>${filas}</tbody>
                    <tfoot><tr><td><strong>Promedio</strong></td><td>${promedioColumnaImpresion(higiene, 'placa')}</td><td>${promedioColumnaImpresion(higiene, 'calculo')}</td><td>${promedioColumnaImpresion(higiene, 'gingivitis')}</td></tr></tfoot>
                </table>
                <div class="f033-fila" style="margin-top:5px;">
                    <div class="f033-campo"><strong>Enf. periodontal:</strong> ${etiquetasNivel[indicadores.periodontal] || RAYA}</div>
                    <div class="f033-campo"><strong>Oclusión (Angle):</strong> ${indicadores.oclusion ? 'Clase ' + indicadores.oclusion : RAYA}</div>
                    <div class="f033-campo"><strong>Fluorosis:</strong> ${etiquetasNivel[indicadores.fluorosis] || RAYA}</div>
                </div>
            </div>
        </div>
    `;
}

function bloqueJ(ficha) {
    const cpo = ficha.indices_cpo_json || {};
    const p = cpo.permanente || {};
    const t = cpo.temporal || {};
    return `
        <div class="f033-seccion">
            <div class="f033-seccion__titulo">J. Índices CPO-ceo ${cpo.ajustado_manualmente ? '(ajustado manualmente)' : '(autocálculo)'}</div>
            <div class="f033-seccion__cuerpo">
                <table class="f033-tabla">
                    <thead><tr><th>Índice</th><th>C/c</th><th>P/e</th><th>O/o</th><th>Total</th></tr></thead>
                    <tbody>
                        <tr><td>D — Permanente</td><td>${p.c ?? 0}</td><td>${p.p ?? 0}</td><td>${p.o ?? 0}</td><td>${p.total ?? 0}</td></tr>
                        <tr><td>d — Temporal</td><td>${t.c ?? 0}</td><td>${t.e ?? 0}</td><td>${t.o ?? 0}</td><td>${t.total ?? 0}</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function bloqueK() {
    const leyenda = typeof construirLeyenda === 'function' ? construirLeyenda() : '';
    return `
        <div class="f033-seccion">
            <div class="f033-seccion__titulo">K. Simbología del odontograma</div>
            <div class="f033-seccion__cuerpo">${leyenda}</div>
        </div>
    `;
}

// -----------------------------------------------------------------
// PAGINA 2
// -----------------------------------------------------------------
function paginaDos(datos) {
    const { paciente } = datos;
    return `
        <div class="hoja-f033">
            ${encabezadoForma(2)}
            ${bloqueL(datos.ficha)}
            ${bloqueM(datos.ficha)}
            ${bloqueN(datos.diagnosticos)}
            ${bloqueO(datos.ficha, datos.doctores)}
            ${bloqueP(datos.evoluciones)}
            ${bloqueObservaciones(datos)}
            ${pieDePagina(paciente, 2)}
        </div>
    `;
}

function bloqueL(ficha) {
    const l = ficha.examenes_solicitados_json || {};
    const marcados = [];
    if (l.biometria) marcados.push('Biometría');
    if (l.quimica_sanguinea) marcados.push('Química sanguínea');
    if (l.rayos_x) marcados.push('Rayos X');
    if (l.otros) marcados.push('Otros' + (l.otros_texto ? `: ${l.otros_texto}` : ''));
    return `
        <div class="f033-seccion">
            <div class="f033-seccion__titulo">L. Pedido de exámenes complementarios</div>
            <div class="f033-seccion__cuerpo">
                <p style="margin:0 0 4px 0;">${marcados.length ? marcados.join(' · ') : RAYA}</p>
                ${l.detalle ? `<p style="margin:0;"><strong>Detalle:</strong> ${l.detalle}</p>` : ''}
            </div>
        </div>
    `;
}

const ETIQUETAS_TIPO_EXAMEN_IMPRESION = { biometria: 'Biometría', quimica_sanguinea: 'Química sanguínea', rayos_x: 'Rayos X', otros: 'Otros' };

// M solo se puebla con los informes que realmente existen (tienen fecha,
// texto o documentos adjuntos), sin importar si el examen sigue marcado en
// L (los datos se conservan aunque el usuario lo haya desmarcado despues).
function bloqueM(ficha) {
    const m = ficha.examenes_informe_json || {};
    const bloques = Object.keys(ETIQUETAS_TIPO_EXAMEN_IMPRESION)
        .map((clave) => [clave, m[clave]])
        .filter(([, datos]) => datos && (datos.fecha || datos.texto || (datos.documento_ids || []).length))
        .map(([clave, datos]) => `
            <div class="f033-informe-examen">
                <strong>${ETIQUETAS_TIPO_EXAMEN_IMPRESION[clave] || clave}${datos.fecha ? ' — ' + formatearFecha(datos.fecha) : ''}</strong>
                <p style="margin:2px 0 0 0;">${datos.texto || RAYA}</p>
            </div>
        `);
    return `
        <div class="f033-seccion">
            <div class="f033-seccion__titulo">M. Informe de exámenes</div>
            <div class="f033-seccion__cuerpo">${bloques.length ? bloques.join('') : `<p style="margin:0;">${RAYA}</p>`}</div>
        </div>
    `;
}

function bloqueN(diagnosticos) {
    const filas = (diagnosticos || []).map((d) => `
        <tr>
            <td>${d.codigo_cie10}</td>
            <td>${d.descripcion}</td>
            <td>${d.tipo}</td>
            <td>${formatearFecha((d.fecha_pre || '').slice(0, 10))}${d.fecha_def ? ' → DEF ' + formatearFecha(d.fecha_def.slice(0, 10)) : ''}</td>
            <td>${d.doctor_nombre || RAYA}</td>
        </tr>
    `).join('');
    return `
        <div class="f033-seccion">
            <div class="f033-seccion__titulo">N. Diagnóstico</div>
            <div class="f033-seccion__cuerpo">
                ${diagnosticos && diagnosticos.length ? `
                    <table class="f033-tabla">
                        <thead><tr><th>CIE-10</th><th>Descripción</th><th>Tipo</th><th>Fecha</th><th>Doctor</th></tr></thead>
                        <tbody>${filas}</tbody>
                    </table>
                ` : `<p style="margin:0;">${RAYA} Sin diagnósticos registrados</p>`}
            </div>
        </div>
    `;
}

function bloqueO(ficha, doctores) {
    const o = ficha.profesional_responsable_json || {};
    const doctor = doctores.find((d) => String(d.id) === String(o.doctor_id));
    return `
        <div class="f033-seccion">
            <div class="f033-seccion__titulo">O. Datos del profesional responsable</div>
            <div class="f033-seccion__cuerpo">
                <div class="f033-fila">
                    <div class="f033-campo"><strong>Nombre:</strong> ${doctor ? doctor.nombre_completo : RAYA}</div>
                    <div class="f033-campo"><strong>Registro profesional:</strong> ${doctor && doctor.registro_profesional ? doctor.registro_profesional : RAYA}</div>
                    <div class="f033-campo"><strong>Apertura de la ficha:</strong> ${o.fecha_apertura ? formatearFecha(o.fecha_apertura.slice(0, 10)) : (ficha.fecha_creacion ? formatearFecha(ficha.fecha_creacion.slice(0, 10)) : RAYA)}</div>
                </div>
                <div class="f033-firma-espacio">
                    ${o.firma ? `<img src="${o.firma}" class="f033-firma-img" alt="Firma del profesional">` : ''}
                    Firma y sello del profesional
                </div>
            </div>
        </div>
    `;
}

function bloqueP(evoluciones) {
    const sesiones = (evoluciones || []).map((ev) => `
        <div class="f033-sesion ${ev.anulada ? 'f033-sesion--anulada' : ''}">
            <div class="f033-sesion__cabecera">
                <span>Sesión ${ev.numero_sesion}${ev.es_alta ? ' — ALTA' : ''} · ${formatearFecha((ev.fecha || '').slice(0, 10))}</span>
                <span>${ev.doctor_nombre || RAYA}</span>
            </div>
            <div class="f033-sesion__cuerpo">
                ${ev.diagnosticos_complicaciones ? `<p style="margin:2px 0;"><strong>Diagnóstico/complicaciones:</strong> ${ev.diagnosticos_complicaciones}</p>` : ''}
                <p style="margin:2px 0;"><strong>Procedimientos:</strong> ${ev.procedimientos}</p>
                ${ev.prescripciones ? `<p style="margin:2px 0;"><strong>Prescripciones:</strong> ${ev.prescripciones}</p>` : ''}
                ${ev.piezas_tratadas && ev.piezas_tratadas.length ? `<p style="margin:2px 0;"><strong>Piezas:</strong> ${ev.piezas_tratadas.join(', ')}</p>` : ''}
            </div>
            ${ev.anulada ? `<p style="margin:2px 0; font-style:italic;">Anulada — motivo: ${ev.motivo_anulacion}</p>` : ''}
            <div class="f033-firmas-fila">
                <div class="f033-firma-espacio" style="width:45%;">
                    ${ev.firma_paciente ? `<img src="${ev.firma_paciente}" class="f033-firma-img" alt="Firma del paciente">` : ''}
                    Firma del paciente
                </div>
                <div class="f033-firma-espacio" style="width:45%;">
                    ${ev.firma_doctor ? `<img src="${ev.firma_doctor}" class="f033-firma-img" alt="Firma del doctor">` : ''}
                    Firma y sello del doctor
                </div>
            </div>
        </div>
    `).join('');
    return `
        <div class="f033-seccion">
            <div class="f033-seccion__titulo">P. Tratamiento — evoluciones por sesión</div>
            <div class="f033-seccion__cuerpo">
                ${sesiones || `<p style="margin:0;">${RAYA} Sin evoluciones registradas</p>`}
            </div>
        </div>
    `;
}

function bloqueObservaciones(datos) {
    const items = [];
    const piezas = (datos.odontogramaResp && datos.odontogramaResp.piezas) || [];
    piezas.filter((p) => p.fuera_simbologia_f033 && p.hallazgo).forEach((p) => {
        const meta = typeof HALLAZGOS !== 'undefined' ? HALLAZGOS[p.hallazgo] : null;
        items.push(`Pieza ${p.pieza}: ${meta ? meta.etiqueta.toLowerCase() : p.hallazgo}`);
    });
    const odontograma = datos.odontogramaResp && datos.odontogramaResp.odontograma;
    if (odontograma && odontograma.observaciones) {
        items.push(`Observaciones de la versión del odontograma: ${odontograma.observaciones}`);
    }
    if (items.length === 0) return '';
    return `
        <div class="f033-seccion">
            <div class="f033-seccion__titulo">Observaciones</div>
            <div class="f033-seccion__cuerpo"><ul class="f033-lista-simple">${items.map((t) => `<li>${t}</li>`).join('')}</ul></div>
        </div>
    `;
}

function pieDePagina(paciente, numeroPagina) {
    return `
        <div class="f033-pie">
            <span>SNS-MSP / HCU-form.033/2021 — ODONTOLOGÍA (${numeroPagina})</span>
            <span>${paciente.apellidos} ${paciente.nombres} — ${paciente.numero_historia}</span>
        </div>
    `;
}
