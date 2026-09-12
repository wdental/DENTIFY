// =====================================================================
// Evoluciones por sesion (Fase 3B, seccion P del F033). Registro legal
// INMUTABLE: se crea, nunca se edita ni se borra (solo un admin puede
// anularla logicamente, con motivo). Panel compacto en la columna derecha
// del odontograma (ultimas 3) + subseccion completa en la ficha clinica
// (orden cronologico inverso). Comparte pacienteActual / pacienteId /
// usuarioActual, declarados en paciente.js.
// =====================================================================

let doctoresParaEvolucion = [];
let modoAltaEnCurso = false;
let evolucionAAnular = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-nueva-evolucion').addEventListener('click', () => abrirModalEvolucion(false));
    document.getElementById('btn-registrar-alta').addEventListener('click', () => abrirModalEvolucion(true));
    document.getElementById('cerrar-modal-evolucion').addEventListener('click', cerrarModalEvolucion);
    document.getElementById('cancelar-modal-evolucion').addEventListener('click', cerrarModalEvolucion);
    document.getElementById('form-evolucion').addEventListener('submit', guardarEvolucion);
    document.getElementById('btn-sin-complicaciones').addEventListener('click', () => {
        document.getElementById('ev-diagnostico-complicaciones').value = 'No presenta complicaciones';
    });
    document.getElementById('ev-fecha').addEventListener('change', () => {
        avisarSiFechaFutura();
        revisarCitaDelDia();
    });
    vincularFechaLegible('ev-fecha', 'ev-fecha-legible');
    // El campo sigue aceptando texto libre (una pieza atendida que no
    // estaba registrada como hallazgo se escribe a mano); al cambiarlo se
    // vuelve a pintar que fichas quedan marcadas.
    document.getElementById('ev-piezas').addEventListener('input', renderizarPiezasConHallazgos);

    document.getElementById('cancelar-modal-anular').addEventListener('click', cerrarModalAnular);
    document.getElementById('confirmar-modal-anular').addEventListener('click', confirmarAnulacion);

    cargarEvolucionesCompletas();
});

async function cargarDoctoresParaEvolucion() {
    if (doctoresParaEvolucion.length > 0) return doctoresParaEvolucion;
    try {
        doctoresParaEvolucion = await api.get('/api/doctores');
    } catch (e) {
        doctoresParaEvolucion = [];
    }
    return doctoresParaEvolucion;
}

// -----------------------------------------------------------------
// Panel compacto (columna derecha del odontograma) - ultimas 3 sesiones
// -----------------------------------------------------------------
async function cargarPanelEvolucionesLateral() {
    const panel = document.getElementById('odonto-panel-evoluciones');
    if (!panel) return;
    try {
        const evoluciones = await api.get(`/api/evoluciones/${pacienteId}?limite=3`);
        panel.innerHTML = `
            <h4>Evoluciones</h4>
            ${evoluciones.length === 0 ? '<p class="texto-secundario">Aún no hay evoluciones registradas.</p>' : evoluciones.map(itemEvolucionCompacta).join('')}
            <button type="button" class="btn btn-secundario btn-sm" style="width:100%; margin-top:6px;" onclick="abrirModalEvolucion(false)">+ Nueva evolución</button>
        `;
    } catch (error) {
        panel.innerHTML = '<h4>Evoluciones</h4><p class="texto-secundario">Error al cargar.</p>';
    }
}

function itemEvolucionCompacta(ev) {
    return `
        <div class="evolucion-compacta ${ev.es_alta ? 'evolucion-compacta--alta' : ''}">
            <div class="evolucion-compacta__cabecera">
                <span>Sesión ${ev.numero_sesion}${ev.es_alta ? ' · ALTA' : ''}</span>
                <span>${formatearFecha(ev.fecha.slice(0, 10))}</span>
            </div>
            <div class="evolucion-compacta__texto">${ev.anulada ? '<s>' + (ev.procedimientos || '') + '</s> (anulada)' : (ev.procedimientos || '')}</div>
        </div>
    `;
}

// -----------------------------------------------------------------
// Subseccion completa (seccion P de la ficha) - orden cronologico inverso
// -----------------------------------------------------------------
async function cargarEvolucionesCompletas() {
    const contenedor = document.getElementById('lista-evoluciones-completa');
    try {
        const evoluciones = await api.get(`/api/evoluciones/${pacienteId}`);
        marcarCompletitud('evoluciones', evoluciones.length > 0);
        if (evoluciones.length === 0) {
            contenedor.innerHTML = '<p class="texto-secundario">Aún no hay evoluciones registradas para este paciente.</p>';
            return;
        }
        contenedor.innerHTML = evoluciones.map(filaEvolucionCompleta).join('');
    } catch (error) {
        contenedor.innerHTML = `<p class="texto-secundario">Error al cargar evoluciones: ${error.message}</p>`;
    }
}

function filaEvolucionCompleta(ev) {
    const puedeAnular = usuarioActual.rol === 'admin' && !ev.anulada;
    const claseTachado = ev.anulada ? 'evolucion-anulada' : '';
    return `
        <div class="evolucion-sesion ${claseTachado}">
            <div class="flex-entre">
                <h4 class="mb-0">Sesión ${ev.numero_sesion}${ev.es_alta ? ' — ALTA' : ''} · ${formatearFecha(ev.fecha.slice(0, 10))}</h4>
                ${puedeAnular ? `<button type="button" class="btn-texto" style="color:var(--rojo-alerta);" onclick="abrirModalAnular(${ev.id})">Anular</button>` : ''}
            </div>
            <p class="texto-secundario mb-0">${ev.doctor_nombre || 'Sin doctor especificado'} ${ev.cita_id ? `· vinculada a la cita de ${formatearFecha((ev.cita_fecha || '').slice(0, 10))} ${ev.cita_hora_inicio || ''}` : ''}</p>
            ${ev.diagnosticos_complicaciones ? `<p><strong>Diagnóstico/complicaciones:</strong> ${ev.diagnosticos_complicaciones}</p>` : ''}
            <p><strong>Procedimientos:</strong> ${ev.procedimientos}</p>
            ${ev.prescripciones ? `<p><strong>Prescripciones:</strong> ${ev.prescripciones}</p>` : ''}
            ${ev.piezas_tratadas && ev.piezas_tratadas.length ? `<p><strong>Piezas tratadas:</strong> ${ev.piezas_tratadas.join(', ')}</p>` : ''}
            ${ev.firma_paciente && ev.firma_doctor ? `
                <div class="evolucion-firmas">
                    <div><img src="${ev.firma_paciente}" alt="Firma del paciente" class="evolucion-firmas__img"><span>Paciente</span></div>
                    <div><img src="${ev.firma_doctor}" alt="Firma del doctor" class="evolucion-firmas__img"><span>Doctor</span></div>
                </div>
            ` : ''}
            ${ev.anulada ? `<p class="evolucion-anulada__motivo">Anulada por ${ev.anulado_por_nombre || '—'} el ${formatearFecha((ev.anulado_en || '').slice(0, 10))} — motivo: ${ev.motivo_anulacion}</p>` : ''}
        </div>
    `;
}

// -----------------------------------------------------------------
// Modal nueva evolucion / ALTA
// -----------------------------------------------------------------
async function abrirModalEvolucion(esAlta) {
    modoAltaEnCurso = !!esAlta;
    document.getElementById('error-modal-evolucion').innerHTML = '';
    document.getElementById('aviso-cita-evolucion').classList.add('oculto');
    document.getElementById('titulo-modal-evolucion').textContent = esAlta ? 'Registrar ALTA' : 'Nueva evolución';
    document.getElementById('form-evolucion').reset();
    document.getElementById('ev-cita-id').value = '';
    document.getElementById('ev-es-alta').value = esAlta ? '1' : '0';
    document.getElementById('ev-piezas').disabled = false;
    const avisoSeguimientoPrevio = document.getElementById('aviso-seguimiento-evolucion');
    if (avisoSeguimientoPrevio) avisoSeguimientoPrevio.remove();
    // Se limpia siempre al abrir; abrirModalEvolucionParaSeguimiento() (ver
    // seguimiento.js) vuelve a asignarlo justo despues de llamar a esta
    // funcion, para el caso del flujo guiado de evolucion+odontograma.
    if (typeof odontogramaIdPendienteEvolucion !== 'undefined') odontogramaIdPendienteEvolucion = null;

    // Una evolucion documenta una sesion que YA ocurrio: la fecha puede
    // ser anterior (una sesion que se carga despues), nunca futura. El
    // tope se calcula con el reloj local, no con UTC (ver fechaHoyIso).
    const hoy = fechaHoyIso();
    const campoFecha = document.getElementById('ev-fecha');
    campoFecha.max = hoy;
    campoFecha.value = hoy;
    sincronizarFechaLegible('ev-fecha', 'ev-fecha-legible');

    if (esAlta) {
        document.getElementById('ev-procedimientos').value = 'ALTA';
    }

    const doctores = await cargarDoctoresParaEvolucion();
    document.getElementById('ev-doctor').innerHTML = '<option value="">Sin especificar</option>' +
        doctores.map((d) => `<option value="${d.id}">${d.nombre_completo}</option>`).join('');
    // Si la cuenta con sesion iniciada esta vinculada a un doctor, se
    // precarga como valor por defecto (el usuario puede cambiarlo igual).
    if (usuarioActual && usuarioActual.doctor_id && doctores.some((d) => d.id === usuarioActual.doctor_id)) {
        document.getElementById('ev-doctor').value = usuarioActual.doctor_id;
    }

    await revisarCitaDelDia();
    renderizarPiezasConHallazgos();

    inicializarFirmaCanvas('ev-firma-paciente');
    inicializarFirmaCanvas('ev-firma-doctor');
    limpiarFirmaCanvas('ev-firma-paciente');
    limpiarFirmaCanvas('ev-firma-doctor');

    document.getElementById('modal-evolucion').classList.add('abierto');
}

function cerrarModalEvolucion() {
    document.getElementById('modal-evolucion').classList.remove('abierto');
    if (typeof limpiarSeguimientoSiPendiente === 'function') limpiarSeguimientoSiPendiente();
}

async function revisarCitaDelDia() {
    const fecha = document.getElementById('ev-fecha').value;
    const aviso = document.getElementById('aviso-cita-evolucion');
    if (!fecha) { aviso.classList.add('oculto'); return; }
    try {
        const cita = await api.get(`/api/evoluciones/${pacienteId}/cita-del-dia?fecha=${fecha}`);
        if (cita) {
            document.getElementById('ev-cita-id').value = cita.id;
            aviso.innerHTML = `Hay una cita atendida ese día (${cita.hora_inicio}${cita.doctor_nombre ? ' · ' + cita.doctor_nombre : ''}). Se vinculará automáticamente. <button type="button" class="btn-texto" onclick="document.getElementById('ev-cita-id').value=''; this.closest('.alerta').classList.add('oculto');">No vincular</button>`;
            aviso.classList.remove('oculto');
            if (cita.doctor_id && !document.getElementById('ev-doctor').value) {
                document.getElementById('ev-doctor').value = cita.doctor_id;
            }
        } else {
            document.getElementById('ev-cita-id').value = '';
            aviso.classList.add('oculto');
        }
    } catch (error) {
        aviso.classList.add('oculto');
    }
}

async function guardarEvolucion(evento) {
    evento.preventDefault();
    const errorDiv = document.getElementById('error-modal-evolucion');
    errorDiv.innerHTML = '';

    const firmaPaciente = obtenerFirmaDataUrl('ev-firma-paciente');
    const firmaDoctor = obtenerFirmaDataUrl('ev-firma-doctor');
    if (!firmaPaciente || !firmaDoctor) {
        errorDiv.innerHTML = '<div class="alerta alerta--error">Se requiere la firma del paciente y del doctor para guardar la evolución.</div>';
        return;
    }

    const fecha = document.getElementById('ev-fecha').value;
    if (!fecha) {
        errorDiv.innerHTML = '<div class="alerta alerta--error">Indique la fecha de la sesión.</div>';
        return;
    }
    if (fecha > fechaHoyIso()) {
        errorDiv.innerHTML = '<div class="alerta alerta--error">La fecha no puede ser futura: una evolución documenta una sesión ya realizada.</div>';
        return;
    }

    const piezasTexto = document.getElementById('ev-piezas').value.trim();
    const piezas = piezasTexto ? piezasTexto.split(',').map((p) => p.trim()).filter(Boolean) : [];

    const datos = {
        fecha,
        doctor_id: document.getElementById('ev-doctor').value || null,
        diagnosticos_complicaciones: document.getElementById('ev-diagnostico-complicaciones').value.trim(),
        procedimientos: document.getElementById('ev-procedimientos').value.trim(),
        prescripciones: document.getElementById('ev-prescripciones').value.trim(),
        piezas_tratadas: piezas,
        es_alta: document.getElementById('ev-es-alta').value === '1',
        cita_id: document.getElementById('ev-cita-id').value || null,
        odontograma_id: typeof odontogramaIdPendienteEvolucion !== 'undefined' ? odontogramaIdPendienteEvolucion : null,
        firma_paciente: firmaPaciente,
        firma_doctor: firmaDoctor
    };

    try {
        const resultado = await api.post(`/api/evoluciones/${pacienteId}`, datos);
        if (typeof limpiarSeguimientoSiPendiente === 'function') limpiarSeguimientoSiPendiente();
        cerrarModalEvolucion();
        await cargarEvolucionesCompletas();
        if (typeof cargarPanelEvolucionesLateral === 'function') await cargarPanelEvolucionesLateral();
        if (typeof cargarSeguimientoTab === 'function') await cargarSeguimientoTab();
        if (typeof manejarCierrePlanTrasEvolucion === 'function') await manejarCierrePlanTrasEvolucion(resultado.id, piezas);

        if (datos.es_alta) {
            const tieneAlta = versionesOdontograma && versionesOdontograma.some((v) => v.tipo === 'alta');
            const activaEsAlta = odontogramaActivo && odontogramaActivo.odontograma && odontogramaActivo.odontograma.tipo === 'alta';
            if (!tieneAlta && !activaEsAlta) {
                await avisar({
                    titulo: 'Evolución de ALTA registrada',
                    mensaje: 'Si corresponde, registre también un odontograma de tipo "Alta" en la sección H.',
                    boton: 'Entendido'
                });
            }
        }
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

// -----------------------------------------------------------------
// Fecha: una evolucion nunca puede quedar en el futuro. El input ya lleva
// max=hoy (bloquea el calendario), pero un valor escrito a mano lo saltea,
// asi que se avisa en vivo y se vuelve a validar al guardar y en el
// servidor (routes/evoluciones.js).
// -----------------------------------------------------------------
function avisarSiFechaFutura() {
    const errorDiv = document.getElementById('error-modal-evolucion');
    const fecha = document.getElementById('ev-fecha').value;
    if (fecha && fecha > fechaHoyIso()) {
        errorDiv.innerHTML = '<div class="alerta alerta--error">La fecha no puede ser futura: una evolución documenta una sesión ya realizada.</div>';
    } else {
        errorDiv.innerHTML = '';
    }
}

// -----------------------------------------------------------------
// Piezas con hallazgos pendientes (en rojo) del odontograma ACTIVO.
// Se muestran como fichas para marcar con un clic lo que se trato en la
// sesion, en vez de escribir los numeros FDI de memoria. Es solo una
// ayuda de seleccion: el campo sigue admitiendo texto libre para una
// pieza atendida que no estaba registrada como hallazgo (ej. un
// accidente), y las fichas se desactivan en el flujo guiado de
// "Evolución de tratamiento" (ahi las piezas vienen del odontograma que
// se acaba de guardar y estan bloqueadas a proposito).
// -----------------------------------------------------------------
function hayOdontogramaActivo() {
    return typeof odontogramaActivo !== 'undefined' && !!odontogramaActivo && !!odontogramaActivo.odontograma;
}

function etiquetaHallazgoDePieza(fila) {
    const base = (typeof HALLAZGOS !== 'undefined' && HALLAZGOS[fila.hallazgo])
        ? HALLAZGOS[fila.hallazgo].etiqueta
        : fila.hallazgo;
    if (!fila.superficie || fila.superficie === 'completa') return base;
    const arcada = (typeof arcadaPorPieza !== 'undefined' && arcadaPorPieza) ? arcadaPorPieza[fila.pieza] : null;
    const superficie = typeof etiquetaSuperficie === 'function' ? etiquetaSuperficie(fila.superficie, arcada) : fila.superficie;
    return `${base} (${String(superficie).toLowerCase()})`;
}

function piezasConHallazgoPendiente() {
    if (!hayOdontogramaActivo() || !odontogramaActivo.piezas) return [];
    const porPieza = {};
    odontogramaActivo.piezas
        .filter((p) => p.color_tipo === 'rojo' && p.hallazgo)
        .forEach((p) => {
            if (!porPieza[p.pieza]) porPieza[p.pieza] = [];
            const etiqueta = etiquetaHallazgoDePieza(p);
            if (!porPieza[p.pieza].includes(etiqueta)) porPieza[p.pieza].push(etiqueta);
        });
    return Object.keys(porPieza)
        .sort((a, b) => Number(a) - Number(b))
        .map((pieza) => ({ pieza, hallazgos: porPieza[pieza] }));
}

function piezasTratadasSeleccionadas() {
    return document.getElementById('ev-piezas').value.split(',').map((p) => p.trim()).filter(Boolean);
}

function escaparHtmlEvolucion(texto) {
    return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderizarPiezasConHallazgos() {
    const contenedor = document.getElementById('ev-piezas-hallazgos');
    if (!contenedor) return;

    if (!hayOdontogramaActivo()) {
        contenedor.innerHTML = '<p class="seccion-clinica__ayuda mb-0">Este paciente todavía no tiene un odontograma registrado.</p>';
        return;
    }

    const grupos = piezasConHallazgoPendiente();
    if (grupos.length === 0) {
        contenedor.innerHTML = '<p class="seccion-clinica__ayuda mb-0">El odontograma activo no tiene hallazgos pendientes (en rojo).</p>';
        return;
    }

    const bloqueado = document.getElementById('ev-piezas').disabled;
    const seleccionadas = piezasTratadasSeleccionadas();
    const fichas = grupos.map((g) => {
        const activa = seleccionadas.includes(g.pieza);
        const detalle = escaparHtmlEvolucion(g.hallazgos.join(' · '));
        return `
            <button type="button" class="pieza-hallazgo ${activa ? 'pieza-hallazgo--activa' : ''}" ${bloqueado ? 'disabled' : ''}
                    onclick="alternarPiezaTratada('${escaparHtmlEvolucion(g.pieza)}')" title="Pieza ${escaparHtmlEvolucion(g.pieza)} — ${detalle}">
                <span class="pieza-hallazgo__numero">${activa ? '✓ ' : ''}${escaparHtmlEvolucion(g.pieza)}</span>
                <span class="pieza-hallazgo__detalle">${detalle}</span>
            </button>
        `;
    }).join('');

    contenedor.innerHTML = `
        <p class="seccion-clinica__ayuda mb-0">${bloqueado
            ? 'Hallazgos pendientes en el odontograma activo (las piezas tratadas ya vienen del odontograma que acaba de guardar):'
            : 'Hallazgos pendientes en el odontograma activo — haga clic en una pieza para agregarla o quitarla de lo tratado hoy:'}</p>
        <div class="piezas-hallazgos__fichas">${fichas}</div>
    `;
}

function alternarPiezaTratada(pieza) {
    const campo = document.getElementById('ev-piezas');
    if (campo.disabled) return;
    const actuales = piezasTratadasSeleccionadas();
    const indice = actuales.indexOf(pieza);
    if (indice >= 0) {
        actuales.splice(indice, 1);
    } else {
        actuales.push(pieza);
    }
    campo.value = actuales.join(', ');
    renderizarPiezasConHallazgos();
}

// -----------------------------------------------------------------
// Anular (solo admin)
// -----------------------------------------------------------------
function abrirModalAnular(evolucionId) {
    evolucionAAnular = evolucionId;
    document.getElementById('anular-motivo').value = '';
    document.getElementById('error-modal-anular').innerHTML = '';
    document.getElementById('modal-anular-evolucion').classList.add('abierto');
}

function cerrarModalAnular() {
    document.getElementById('modal-anular-evolucion').classList.remove('abierto');
    evolucionAAnular = null;
}

async function confirmarAnulacion() {
    const errorDiv = document.getElementById('error-modal-anular');
    const motivo = document.getElementById('anular-motivo').value.trim();
    if (!motivo) {
        errorDiv.innerHTML = '<div class="alerta alerta--error">Debe indicar el motivo</div>';
        return;
    }
    try {
        await api.put(`/api/evoluciones/${evolucionAAnular}/anular`, { motivo });
        cerrarModalAnular();
        await cargarEvolucionesCompletas();
        if (typeof cargarPanelEvolucionesLateral === 'function') await cargarPanelEvolucionesLateral();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}
