// =====================================================================
// Consentimientos informados con firma en pantalla (Fase 3C). Comparte
// pacienteActual / pacienteId / usuarioActual (paciente.js) y el pad de
// firma de public/js/firma.js. Un consentimiento firmado es inmutable:
// el texto final siempre lo resuelve el servidor (routes/consentimientos.js)
// a partir de los datos reales del paciente/doctor - la version que se
// arma aqui es solo una VISTA PREVIA para el paciente antes de firmar.
// =====================================================================

let consentimientosActuales = [];
let plantillasParaConsentimiento = [];
let doctoresParaConsentimiento = [];
let decisionSeleccionada = null;
let consentimientoParaRevocar = null;
let consentimientoParaAnular = null;

const ETIQUETAS_ESTADO_CONSENTIMIENTO = {
    aceptado: 'Aceptado', rechazado: 'Rechazado', revocado: 'Revocado', anulado: 'Anulado'
};
const CLASE_ESTADO_CONSENTIMIENTO = {
    aceptado: 'insignia--verde', rechazado: 'insignia--rojo', revocado: '', anulado: 'insignia--rojo'
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-nuevo-consentimiento').addEventListener('click', abrirModalNuevoConsentimiento);
    document.getElementById('cerrar-modal-consentimiento').addEventListener('click', () => document.getElementById('modal-nuevo-consentimiento').classList.remove('abierto'));
    document.getElementById('cancelar-modal-consentimiento').addEventListener('click', () => document.getElementById('modal-nuevo-consentimiento').classList.remove('abierto'));
    document.getElementById('cons-plantilla').addEventListener('change', actualizarVistaPlantillaSeleccionada);
    document.getElementById('btn-guardar-fecha-nacimiento').addEventListener('click', guardarFechaNacimientoPaciente);
    document.getElementById('btn-continuar-firma').addEventListener('click', abrirKioskoFirma);

    document.getElementById('btn-cancelar-kiosko').addEventListener('click', cerrarKioskoFirma);
    document.getElementById('kiosko-btn-acepto').addEventListener('click', () => elegirDecision('aceptado'));
    document.getElementById('kiosko-btn-rechazo').addEventListener('click', () => elegirDecision('rechazado'));
    document.getElementById('btn-confirmar-firma-consentimiento').addEventListener('click', confirmarFirmaConsentimiento);

    document.getElementById('btn-cancelar-kiosko-revocacion').addEventListener('click', () => document.getElementById('kiosko-revocacion').classList.add('oculto'));
    document.getElementById('btn-confirmar-revocacion').addEventListener('click', confirmarRevocacion);

    document.getElementById('cancelar-modal-anular-consentimiento').addEventListener('click', () => document.getElementById('modal-anular-consentimiento').classList.remove('abierto'));
    document.getElementById('confirmar-modal-anular-consentimiento').addEventListener('click', confirmarAnularConsentimiento);
});

// -----------------------------------------------------------------
// Listado
// -----------------------------------------------------------------
async function cargarConsentimientos() {
    const contenedor = document.getElementById('lista-consentimientos');
    try {
        consentimientosActuales = await api.get(`/api/consentimientos/${pacienteId}`);
        if (consentimientosActuales.length === 0) {
            contenedor.innerHTML = '<p class="texto-secundario">Aún no hay consentimientos registrados para este paciente.</p>';
            return;
        }
        contenedor.innerHTML = `
            <div class="tabla-envoltorio">
                <table>
                    <thead><tr><th>Plantilla</th><th>Decisión</th><th>Estado</th><th>Fecha</th><th>Firmante</th><th></th></tr></thead>
                    <tbody>
                        ${consentimientosActuales.map(filaConsentimiento).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        contenedor.innerHTML = `<p class="texto-secundario">Error al cargar consentimientos: ${error.message}</p>`;
    }
}

function filaConsentimiento(c) {
    const tachado = c.estado === 'anulado' ? 'evolucion-anulada' : '';
    const esRevocacion = c.decision === 'revocacion';
    const nombrePlantilla = esRevocacion ? `Revocación (${c.plantilla_nombre || 'consentimiento'})` : (c.plantilla_nombre || '—');
    const puedeRevocar = c.estado === 'aceptado' && !esRevocacion;
    const puedeAnular = tienePermiso(usuarioActual, 'planes.anular') && c.estado !== 'anulado';
    return `
        <tr class="${tachado}">
            <td>${nombrePlantilla}</td>
            <td>${esRevocacion ? '—' : (c.decision === 'aceptado' ? 'Acepto' : 'Rechazo')}</td>
            <td><span class="insignia ${CLASE_ESTADO_CONSENTIMIENTO[c.estado] || ''}">${ETIQUETAS_ESTADO_CONSENTIMIENTO[c.estado] || c.estado}</span></td>
            <td>${formatearFecha((c.fecha_firma || '').slice(0, 10))}</td>
            <td>${c.firmante_nombre}${c.es_representante ? ' (representante)' : ''}</td>
            <td style="white-space:nowrap;">
                <button type="button" class="btn-texto" onclick="window.open('/imprimir-consentimiento.html?pacienteId=${pacienteId}&id=${c.id}', '_blank')">Ver / Imprimir</button>
                ${puedeRevocar ? `<button type="button" class="btn-texto" onclick="abrirRevocacion(${c.id})">Registrar revocación</button>` : ''}
                ${puedeAnular ? `<button type="button" class="btn-texto" style="color:var(--rojo-alerta);" onclick="abrirAnularConsentimiento(${c.id})">Anular</button>` : ''}
                ${c.motivo_anulacion ? `<span class="texto-secundario" title="${c.motivo_anulacion}">· anulado por ${c.anulado_por_nombre || '—'}</span>` : ''}
            </td>
        </tr>
    `;
}

// -----------------------------------------------------------------
// Marcadores (vista previa client-side; el texto REAL lo resuelve y
// congela el servidor al momento de firmar, ver routes/consentimientos.js)
// -----------------------------------------------------------------
function resolverMarcadoresVista(contenido, datos) {
    return contenido.replace(/\{(\w+)\}/g, (m, clave) => (datos[clave] === undefined || datos[clave] === null ? '' : String(datos[clave])));
}

function clausulaRepresentanteVista(esMenor, nombre, cedula) {
    if (!esMenor || !nombre) return '';
    return `, representado(a) legalmente por ${nombre}${cedula ? ` (C.I. ${cedula})` : ''}`;
}

const BLOQUES_DECISION_VISTA = {
    aceptado: '<h4>Declaración y firma</h4><p><strong>☑ Acepto el procedimiento.</strong> He sido informado del procedimiento, sus beneficios y sus posibles riesgos. He comprendido la información y autorizo libremente la realización del procedimiento propuesto.</p>',
    rechazado: '<h4>Declaración y firma</h4><p><strong>☑ Rechazo el procedimiento.</strong> Una vez que he entendido claramente el procedimiento propuesto, así como las consecuencias posibles si no se realiza la intervención, no autorizo y me niego a que se me realice el procedimiento propuesto.</p>'
};

function esPacienteMenorDeEdad() {
    return pacienteActual.edad !== null && pacienteActual.edad !== undefined && pacienteActual.edad < 18;
}

// -----------------------------------------------------------------
// Paso 1: elegir plantilla + datos editables (personal de la clinica)
// -----------------------------------------------------------------
async function abrirModalNuevoConsentimiento() {
    document.getElementById('error-modal-consentimiento').innerHTML = '';
    document.getElementById('cons-piezas').value = '';
    document.getElementById('cons-procedimiento-detalle').value = '';
    document.getElementById('cons-representante-nombre').value = '';
    document.getElementById('cons-representante-cedula').value = '';
    document.getElementById('cons-paciente-resumen').textContent = `${pacienteActual.nombres} ${pacienteActual.apellidos} · Cédula: ${pacienteActual.cedula || 'sin registrar'}`;

    const sinFechaNacimiento = !pacienteActual.fecha_nacimiento;
    document.getElementById('cons-fecha-nacimiento-block').classList.toggle('oculto', !sinFechaNacimiento);
    document.getElementById('btn-continuar-firma').disabled = sinFechaNacimiento;

    document.getElementById('cons-representante-block').classList.toggle('oculto', !esPacienteMenorDeEdad());

    try {
        plantillasParaConsentimiento = await api.get('/api/plantillas?tipo=consentimiento');
    } catch (e) {
        plantillasParaConsentimiento = [];
    }
    document.getElementById('cons-plantilla').innerHTML = '<option value="">Seleccione...</option>' +
        plantillasParaConsentimiento.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join('');

    try {
        doctoresParaConsentimiento = typeof cargarDoctoresParaEvolucion === 'function' ? await cargarDoctoresParaEvolucion() : [];
    } catch (e) {
        doctoresParaConsentimiento = [];
    }
    document.getElementById('cons-doctor').innerHTML = '<option value="">Sin especificar</option>' +
        doctoresParaConsentimiento.map((d) => `<option value="${d.id}">${d.nombre_completo}</option>`).join('');
    if (usuarioActual && usuarioActual.doctor_id && doctoresParaConsentimiento.some((d) => d.id === usuarioActual.doctor_id)) {
        document.getElementById('cons-doctor').value = usuarioActual.doctor_id;
    }

    document.getElementById('modal-nuevo-consentimiento').classList.add('abierto');
}

function actualizarVistaPlantillaSeleccionada() {
    // placeholder para futuras variaciones por plantilla; hoy no hace falta nada mas
}

async function guardarFechaNacimientoPaciente() {
    const errorDiv = document.getElementById('error-modal-consentimiento');
    errorDiv.innerHTML = '';
    const fecha = document.getElementById('cons-fecha-nacimiento').value;
    if (!fecha) {
        errorDiv.innerHTML = '<div class="alerta alerta--error">Ingrese la fecha de nacimiento.</div>';
        return;
    }
    try {
        await api.put(`/api/pacientes/${pacienteId}`, { ...pacienteActual, fecha_nacimiento: fecha });
        const actualizado = await api.get(`/api/pacientes/${pacienteId}`);
        pacienteActual.fecha_nacimiento = actualizado.fecha_nacimiento;
        pacienteActual.edad = actualizado.edad;
        document.getElementById('cons-fecha-nacimiento-block').classList.add('oculto');
        document.getElementById('btn-continuar-firma').disabled = false;
        document.getElementById('cons-representante-block').classList.toggle('oculto', !esPacienteMenorDeEdad());
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

// -----------------------------------------------------------------
// Paso 2: pantalla de firma a pantalla completa (se entrega al paciente)
// -----------------------------------------------------------------
function abrirKioskoFirma() {
    const errorDiv = document.getElementById('error-modal-consentimiento');
    errorDiv.innerHTML = '';

    const plantillaId = document.getElementById('cons-plantilla').value;
    if (!plantillaId) { errorDiv.innerHTML = '<div class="alerta alerta--error">Seleccione una plantilla.</div>'; return; }

    const esMenor = esPacienteMenorDeEdad();
    const repNombre = document.getElementById('cons-representante-nombre').value.trim();
    const repCedula = document.getElementById('cons-representante-cedula').value.trim();
    if (esMenor) {
        if (!repNombre) { errorDiv.innerHTML = '<div class="alerta alerta--error">Ingrese el nombre del representante legal.</div>'; return; }
        if (!/^\d{10}$/.test(repCedula)) { errorDiv.innerHTML = '<div class="alerta alerta--error">La cédula del representante debe tener 10 dígitos.</div>'; return; }
    }

    const plantilla = plantillasParaConsentimiento.find((p) => String(p.id) === plantillaId);
    const doctor = doctoresParaConsentimiento.find((d) => String(d.id) === document.getElementById('cons-doctor').value);

    const datos = {
        paciente_nombre: `${pacienteActual.nombres} ${pacienteActual.apellidos}`,
        paciente_cedula: pacienteActual.cedula || 'Sin registrar',
        paciente_edad: pacienteActual.edad,
        representante_nombre: esMenor ? repNombre : '',
        representante_cedula: esMenor ? repCedula : '',
        representante_clausula: clausulaRepresentanteVista(esMenor, repNombre, repCedula),
        doctor_nombre: doctor ? doctor.nombre_completo : 'Sin especificar',
        doctor_registro: doctor && doctor.registro_profesional ? doctor.registro_profesional : 'Sin especificar',
        fecha: formatearFecha(fechaHoyIso()),
        piezas: document.getElementById('cons-piezas').value.trim() || 'No aplica',
        procedimiento_detalle: document.getElementById('cons-procedimiento-detalle').value.trim() || 'Sin observaciones adicionales.'
    };

    document.getElementById('kiosko-titulo').textContent = plantilla.nombre;
    document.getElementById('kiosko-subtitulo').textContent = `${datos.paciente_nombre} · ${datos.fecha}`;
    document.getElementById('kiosko-documento').innerHTML = resolverMarcadoresVista(plantilla.contenido, datos);
    document.getElementById('kiosko-documento').dataset.plantillaId = plantillaId;
    document.getElementById('kiosko-documento').dataset.esMenor = esMenor ? '1' : '0';
    document.getElementById('kiosko-documento').dataset.repNombre = repNombre;
    document.getElementById('kiosko-documento').dataset.repCedula = repCedula;
    document.getElementById('kiosko-documento').dataset.doctorId = document.getElementById('cons-doctor').value;
    document.getElementById('kiosko-documento').dataset.piezas = datos.piezas === 'No aplica' ? '' : datos.piezas;
    document.getElementById('kiosko-documento').dataset.procedimientoDetalle = document.getElementById('cons-procedimiento-detalle').value.trim();

    decisionSeleccionada = null;
    document.getElementById('kiosko-btn-acepto').classList.remove('kiosko-decision-boton--activa');
    document.getElementById('kiosko-btn-rechazo').classList.remove('kiosko-decision-boton--activa');
    document.getElementById('kiosko-etiqueta-firmante').textContent = esMenor ? 'Firma del representante legal *' : 'Firma del paciente *';
    document.getElementById('kiosko-etiqueta-firma-linea').textContent = esMenor ? `Firma del representante — ${repNombre}` : 'Firma del paciente';
    document.getElementById('error-kiosko').innerHTML = '';

    inicializarFirmaCanvas('cons-firma-paciente');
    inicializarFirmaCanvas('cons-firma-doctor');
    limpiarFirmaCanvas('cons-firma-paciente');
    limpiarFirmaCanvas('cons-firma-doctor');

    document.getElementById('modal-nuevo-consentimiento').classList.remove('abierto');
    document.getElementById('kiosko-firma').classList.remove('oculto');
}

function elegirDecision(decision) {
    decisionSeleccionada = decision;
    document.getElementById('kiosko-btn-acepto').classList.toggle('kiosko-decision-boton--activa', decision === 'aceptado');
    document.getElementById('kiosko-btn-rechazo').classList.toggle('kiosko-decision-boton--activa', decision === 'rechazado');

    const documento = document.getElementById('kiosko-documento');
    const bloqueAnterior = documento.querySelector('.kiosko-bloque-decision');
    if (bloqueAnterior) bloqueAnterior.remove();
    const envoltura = document.createElement('div');
    envoltura.className = 'kiosko-bloque-decision';
    envoltura.innerHTML = BLOQUES_DECISION_VISTA[decision];
    documento.appendChild(envoltura);
    documento.scrollTop = documento.scrollHeight;
}

function cerrarKioskoFirma() {
    document.getElementById('kiosko-firma').classList.add('oculto');
}

async function confirmarFirmaConsentimiento() {
    const errorDiv = document.getElementById('error-kiosko');
    errorDiv.innerHTML = '';

    if (!decisionSeleccionada) {
        errorDiv.innerHTML = '<div class="alerta alerta--error">Elija "Acepto" o "Rechazo" antes de firmar.</div>';
        return;
    }
    const firmaPaciente = obtenerFirmaDataUrl('cons-firma-paciente');
    if (!firmaPaciente) {
        errorDiv.innerHTML = '<div class="alerta alerta--error">Se requiere la firma para continuar.</div>';
        return;
    }
    const firmaDoctor = obtenerFirmaDataUrl('cons-firma-doctor');

    const documento = document.getElementById('kiosko-documento');
    const datos = {
        plantilla_id: Number(documento.dataset.plantillaId),
        decision: decisionSeleccionada,
        procedimiento_detalle: documento.dataset.procedimientoDetalle,
        piezas: documento.dataset.piezas,
        doctor_id: documento.dataset.doctorId ? Number(documento.dataset.doctorId) : null,
        firma_paciente: firmaPaciente,
        firma_doctor: firmaDoctor,
        representante_nombre: documento.dataset.esMenor === '1' ? documento.dataset.repNombre : undefined,
        representante_cedula: documento.dataset.esMenor === '1' ? documento.dataset.repCedula : undefined
    };

    try {
        await api.post(`/api/consentimientos/${pacienteId}`, datos);
        cerrarKioskoFirma();
        await cargarConsentimientos();
        if (typeof cargarPanelResumenPaciente === 'function') await cargarPanelResumenPaciente();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

// -----------------------------------------------------------------
// Revocacion
// -----------------------------------------------------------------
function abrirRevocacion(id) {
    consentimientoParaRevocar = consentimientosActuales.find((c) => c.id === id);
    if (!consentimientoParaRevocar) return;

    document.getElementById('kiosko-revocacion-subtitulo').textContent =
        `Sobre "${consentimientoParaRevocar.plantilla_nombre}", firmado el ${formatearFecha((consentimientoParaRevocar.fecha_firma || '').slice(0, 10))}`;
    document.getElementById('kiosko-revocacion-documento').innerHTML = `
        <h4>Revocación del consentimiento</h4>
        <p><strong>☑ Revoco el consentimiento.</strong> De forma libre y voluntaria, revoco el consentimiento otorgado para
        "${consentimientoParaRevocar.plantilla_nombre}" (firmado el ${formatearFecha((consentimientoParaRevocar.fecha_firma || '').slice(0, 10))})
        y manifiesto expresamente mi deseo de no continuar con el procedimiento, que doy por finalizado en esta fecha.</p>
    `;
    document.getElementById('error-kiosko-revocacion').innerHTML = '';
    inicializarFirmaCanvas('cons-firma-revocacion');
    limpiarFirmaCanvas('cons-firma-revocacion');
    document.getElementById('kiosko-revocacion').classList.remove('oculto');
}

async function confirmarRevocacion() {
    const errorDiv = document.getElementById('error-kiosko-revocacion');
    errorDiv.innerHTML = '';
    const firma = obtenerFirmaDataUrl('cons-firma-revocacion');
    if (!firma) {
        errorDiv.innerHTML = '<div class="alerta alerta--error">Se requiere la firma para continuar.</div>';
        return;
    }
    try {
        await api.post(`/api/consentimientos/${pacienteId}/${consentimientoParaRevocar.id}/revocar`, { firma_paciente: firma });
        document.getElementById('kiosko-revocacion').classList.add('oculto');
        await cargarConsentimientos();
        if (typeof cargarPanelResumenPaciente === 'function') await cargarPanelResumenPaciente();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

// -----------------------------------------------------------------
// Anulacion (solo admin)
// -----------------------------------------------------------------
function abrirAnularConsentimiento(id) {
    consentimientoParaAnular = id;
    document.getElementById('anular-consentimiento-motivo').value = '';
    document.getElementById('error-modal-anular-consentimiento').innerHTML = '';
    document.getElementById('modal-anular-consentimiento').classList.add('abierto');
}

async function confirmarAnularConsentimiento() {
    const errorDiv = document.getElementById('error-modal-anular-consentimiento');
    errorDiv.innerHTML = '';
    const motivo = document.getElementById('anular-consentimiento-motivo').value.trim();
    if (!motivo) { errorDiv.innerHTML = '<div class="alerta alerta--error">Indique el motivo.</div>'; return; }
    try {
        await api.put(`/api/consentimientos/${consentimientoParaAnular}/anular`, { motivo });
        document.getElementById('modal-anular-consentimiento').classList.remove('abierto');
        await cargarConsentimientos();
        if (typeof cargarPanelResumenPaciente === 'function') await cargarPanelResumenPaciente();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}
