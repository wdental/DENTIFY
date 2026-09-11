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
    document.getElementById('ev-fecha').addEventListener('change', revisarCitaDelDia);
    vincularFechaLegible('ev-fecha', 'ev-fecha-legible');

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

    const hoy = new Date().toISOString().slice(0, 10);
    document.getElementById('ev-fecha').value = hoy;
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

    inicializarFirmaCanvas('ev-firma-paciente');
    inicializarFirmaCanvas('ev-firma-doctor');
    limpiarFirmaCanvas('ev-firma-paciente');
    limpiarFirmaCanvas('ev-firma-doctor');

    document.getElementById('modal-evolucion').classList.add('abierto');
}

function cerrarModalEvolucion() {
    document.getElementById('modal-evolucion').classList.remove('abierto');
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

    const piezasTexto = document.getElementById('ev-piezas').value.trim();
    const piezas = piezasTexto ? piezasTexto.split(',').map((p) => p.trim()).filter(Boolean) : [];

    const datos = {
        fecha: document.getElementById('ev-fecha').value,
        doctor_id: document.getElementById('ev-doctor').value || null,
        diagnosticos_complicaciones: document.getElementById('ev-diagnostico-complicaciones').value.trim(),
        procedimientos: document.getElementById('ev-procedimientos').value.trim(),
        prescripciones: document.getElementById('ev-prescripciones').value.trim(),
        piezas_tratadas: piezas,
        es_alta: document.getElementById('ev-es-alta').value === '1',
        cita_id: document.getElementById('ev-cita-id').value || null,
        firma_paciente: firmaPaciente,
        firma_doctor: firmaDoctor
    };

    try {
        await api.post(`/api/evoluciones/${pacienteId}`, datos);
        cerrarModalEvolucion();
        await cargarEvolucionesCompletas();
        if (typeof cargarPanelEvolucionesLateral === 'function') await cargarPanelEvolucionesLateral();

        if (datos.es_alta) {
            const tieneAlta = versionesOdontograma && versionesOdontograma.some((v) => v.tipo === 'alta');
            const activaEsAlta = odontogramaActivo && odontogramaActivo.odontograma && odontogramaActivo.odontograma.tipo === 'alta';
            if (!tieneAlta && !activaEsAlta) {
                alert('Evolución de ALTA registrada. Recuerde registrar también un odontograma de tipo "Alta" en la sección H si corresponde.');
            }
        }
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
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
