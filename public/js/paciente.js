// =====================================================================
// Logica de la ficha completa de un paciente
// =====================================================================

let usuarioActual = null;
let pacienteActual = null;
const parametrosUrl = new URLSearchParams(window.location.search);
const pacienteId = parametrosUrl.get('id');

const ETIQUETAS_ORIGEN = { WhatsApp: 'WhatsApp', Instagram: 'Instagram', Facebook: 'Facebook', Google: 'Google', Referido: 'Referido', Otro: 'Otro' };
const ETIQUETAS_SEXO = { F: 'Femenino', M: 'Masculino', O: 'Otro' };

const ETIQUETAS_ESTADO_CITA = {
    pendiente: 'Agendada',
    confirmada: 'Confirmada',
    atendida: 'Atendida',
    cancelada: 'Cancelada',
    no_asistio: 'No asistió'
};

const CLASE_ESTADO_CITA = {
    pendiente: '',
    confirmada: 'insignia--dorado',
    atendida: 'insignia--verde',
    cancelada: '',
    no_asistio: 'insignia--rojo'
};

(async () => {
    usuarioActual = await inicializarSidebar();
    if (!usuarioActual) return;

    if (!pacienteId) {
        window.location.href = '/pacientes.html';
        return;
    }

    document.querySelectorAll('.pestana').forEach((boton) => {
        boton.addEventListener('click', () => cambiarPestana(boton.dataset.panel));
    });

    document.getElementById('btn-editar-paciente').addEventListener('click', abrirModalEdicion);
    document.getElementById('cerrar-modal-paciente').addEventListener('click', cerrarModalPaciente);
    document.getElementById('cancelar-modal-paciente').addEventListener('click', cerrarModalPaciente);
    document.getElementById('form-paciente').addEventListener('submit', guardarPaciente);
    document.getElementById('btn-eliminar-paciente').addEventListener('click', eliminarPaciente);
    document.getElementById('btn-restaurar-paciente').addEventListener('click', restaurarPaciente);
    document.getElementById('form-subir-documento').addEventListener('submit', subirDocumento);
    document.getElementById('btn-nueva-cita-paciente').addEventListener('click', irANuevaCita);
    document.getElementById('btn-imprimir-f033').addEventListener('click', irAImprimirF033);
    vincularFechaLegible('p-fecha-nacimiento', 'p-fecha-nacimiento-legible');

    // Enlace directo a una pestana (ej. "#pagos" desde Cuotas vencidas / Caja)
    if (window.location.hash === '#pagos') cambiarPestanaReal('panel-pagos');

    await cargarPaciente();
    await cargarDocumentos();
    await cargarCitasPaciente();
    await cargarFichaClinica();
    await cargarOdontograma();
    if (typeof cargarConsentimientos === 'function') await cargarConsentimientos();
})();

async function irAImprimirF033() {
    if (typeof hayCambiosSinGuardar === 'function' && hayCambiosSinGuardar()) {
        const seguir = await confirmarAccion({
            titulo: 'Hay cambios sin guardar',
            mensaje: 'La impresión del F033 usa siempre los últimos datos guardados, no los cambios que tiene pendientes en pantalla.',
            confirmar: 'Imprimir lo guardado',
            cancelar: 'Volver a la ficha'
        });
        if (!seguir) return;
    }
    window.open(`/imprimir-f033.html?id=${pacienteId}`, '_blank');
}

function irANuevaCita() {
    const nombre = `${pacienteActual.apellidos} ${pacienteActual.nombres}`;
    const parametros = new URLSearchParams({ paciente_id: pacienteActual.id, paciente_nombre: nombre, nueva: '1' });
    window.location.href = `/agenda.html?${parametros.toString()}`;
}

function cambiarPestana(idPanel) {
    // Si se sale de "Ficha clinica" con cambios sin guardar (secciones B-J o
    // un odontograma en edicion), se pide confirmacion antes de cambiar.
    const enFichaClinica = document.getElementById('panel-ficha-clinica').classList.contains('activo');
    if (enFichaClinica && idPanel !== 'panel-ficha-clinica' && typeof hayCambiosSinGuardar === 'function' && hayCambiosSinGuardar()) {
        mostrarDialogoSalida(() => cambiarPestanaReal(idPanel));
        return;
    }
    cambiarPestanaReal(idPanel);
}

function cambiarPestanaReal(idPanel) {
    document.querySelectorAll('.pestana').forEach((b) => b.classList.toggle('activa', b.dataset.panel === idPanel));
    document.querySelectorAll('.panel-pestana').forEach((p) => p.classList.toggle('activo', p.id === idPanel));
    const botonFlotante = document.getElementById('btn-guardar-ficha-flotante');
    if (botonFlotante) botonFlotante.classList.toggle('oculto', idPanel !== 'panel-ficha-clinica');
}

async function cargarPaciente() {
    try {
        pacienteActual = await api.get(`/api/pacientes/${pacienteId}`);

        document.getElementById('ficha-nombre').textContent = `${pacienteActual.apellidos} ${pacienteActual.nombres}`;
        document.getElementById('ficha-subtitulo').textContent =
            `Historia clinica ${pacienteActual.numero_historia} · ${pacienteActual.edad !== null ? pacienteActual.edad + ' años' : 'edad no registrada'}`;
        document.title = `Dentify - ${pacienteActual.apellidos} ${pacienteActual.nombres}`;

        document.getElementById('vista-datos-personales').innerHTML = `
            ${campoVista('Nombres', pacienteActual.nombres)}
            ${campoVista('Apellidos', pacienteActual.apellidos)}
            ${campoVista('Cedula', pacienteActual.cedula)}
            ${campoVista('Fecha de nacimiento', textoFechaNacimientoConEdad(pacienteActual))}
            ${campoVista('Sexo', ETIQUETAS_SEXO[pacienteActual.sexo])}
            ${campoVista('Origen', ETIQUETAS_ORIGEN[pacienteActual.origen])}
            ${campoVista('Telefono', pacienteActual.telefono)}
            ${campoVista('WhatsApp', pacienteActual.whatsapp)}
            ${campoVista('Correo electronico', pacienteActual.email)}
            ${campoVista('Direccion', pacienteActual.direccion)}
        `;

        document.getElementById('vista-antecedentes').innerHTML = `
            ${campoVista('Alergias', pacienteActual.alergias, true)}
            ${campoVista('Antecedentes medicos', pacienteActual.antecedentes_medicos, true)}
            ${campoVista('Antecedentes odontologicos', pacienteActual.antecedentes_odontologicos, true)}
            ${campoVista('Medicamentos actuales', pacienteActual.medicamentos_actuales, true)}
            ${campoVista('Notas', pacienteActual.notas, true)}
        `;

        const eliminado = !pacienteActual.activo;
        document.getElementById('aviso-paciente-eliminado').classList.toggle('oculto', !eliminado);
        document.getElementById('btn-eliminar-paciente').classList.toggle('oculto', !(usuarioActual.rol === 'admin' && !eliminado));
        document.getElementById('btn-restaurar-paciente').classList.toggle('oculto', !(usuarioActual.rol === 'admin' && eliminado));
    } catch (error) {
        document.getElementById('mensaje-ficha').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

// "27/dic/1989 · 36 años" (la edad viene ya calculada por el servidor)
function textoFechaNacimientoConEdad(paciente) {
    if (!paciente.fecha_nacimiento) return '';
    const fecha = formatearFecha(paciente.fecha_nacimiento);
    return paciente.edad !== null && paciente.edad !== undefined ? `${fecha} · ${paciente.edad} años` : fecha;
}

function campoVista(etiqueta, valor, ancho) {
    return `
        <div class="campo ${ancho ? 'campo--ancho' : ''}">
            <label>${etiqueta}</label>
            <p class="mt-0 mb-0">${valor || '<span class="texto-secundario">Sin registrar</span>'}</p>
        </div>
    `;
}

function abrirModalEdicion() {
    document.getElementById('error-modal-paciente').innerHTML = '';
    document.getElementById('paciente-id').value = pacienteActual.id;
    document.getElementById('p-nombres').value = pacienteActual.nombres || '';
    document.getElementById('p-apellidos').value = pacienteActual.apellidos || '';
    document.getElementById('p-cedula').value = pacienteActual.cedula || '';
    document.getElementById('p-fecha-nacimiento').value = pacienteActual.fecha_nacimiento || '';
    sincronizarFechaLegible('p-fecha-nacimiento', 'p-fecha-nacimiento-legible');
    document.getElementById('p-sexo').value = pacienteActual.sexo || '';
    document.getElementById('p-origen').value = pacienteActual.origen || '';
    document.getElementById('p-telefono').value = pacienteActual.telefono || '';
    document.getElementById('p-whatsapp').value = pacienteActual.whatsapp || '';
    document.getElementById('p-email').value = pacienteActual.email || '';
    document.getElementById('p-direccion').value = pacienteActual.direccion || '';
    document.getElementById('p-alergias').value = pacienteActual.alergias || '';
    document.getElementById('p-antecedentes-medicos').value = pacienteActual.antecedentes_medicos || '';
    document.getElementById('p-antecedentes-odontologicos').value = pacienteActual.antecedentes_odontologicos || '';
    document.getElementById('p-medicamentos').value = pacienteActual.medicamentos_actuales || '';
    document.getElementById('p-notas').value = pacienteActual.notas || '';

    document.getElementById('modal-paciente').classList.add('abierto');
}

function cerrarModalPaciente() {
    document.getElementById('modal-paciente').classList.remove('abierto');
}

async function guardarPaciente(evento) {
    evento.preventDefault();
    const errorDiv = document.getElementById('error-modal-paciente');
    errorDiv.innerHTML = '';

    const datos = {
        nombres: document.getElementById('p-nombres').value.trim(),
        apellidos: document.getElementById('p-apellidos').value.trim(),
        cedula: document.getElementById('p-cedula').value.trim() || null,
        fecha_nacimiento: document.getElementById('p-fecha-nacimiento').value || null,
        sexo: document.getElementById('p-sexo').value || null,
        origen: document.getElementById('p-origen').value || null,
        telefono: document.getElementById('p-telefono').value.trim() || null,
        whatsapp: document.getElementById('p-whatsapp').value.trim() || null,
        email: document.getElementById('p-email').value.trim() || null,
        direccion: document.getElementById('p-direccion').value.trim() || null,
        alergias: document.getElementById('p-alergias').value.trim() || null,
        antecedentes_medicos: document.getElementById('p-antecedentes-medicos').value.trim() || null,
        antecedentes_odontologicos: document.getElementById('p-antecedentes-odontologicos').value.trim() || null,
        medicamentos_actuales: document.getElementById('p-medicamentos').value.trim() || null,
        notas: document.getElementById('p-notas').value.trim() || null
    };

    if (datos.cedula && !/^\d{10}$/.test(datos.cedula)) {
        errorDiv.innerHTML = '<div class="alerta alerta--error">La cedula debe tener 10 digitos</div>';
        return;
    }

    try {
        await api.put(`/api/pacientes/${pacienteActual.id}`, datos);
        cerrarModalPaciente();
        await cargarPaciente();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

async function eliminarPaciente() {
    const confirmado = await confirmarAccion({
        titulo: 'Eliminar paciente',
        mensaje: `Se eliminará a ${pacienteActual.nombres} ${pacienteActual.apellidos} del listado.\n\nEs un borrado reversible: su historia clínica se conserva y puede restaurarlo después desde el listado de pacientes.`,
        confirmar: 'Eliminar paciente',
        cancelar: 'Conservar',
        peligro: true
    });
    if (!confirmado) return;
    try {
        await api.del(`/api/pacientes/${pacienteActual.id}`);
        await cargarPaciente();
        document.getElementById('mensaje-ficha').innerHTML =
            '<div class="alerta alerta--exito">Paciente eliminado. Puede restaurarlo con el boton "Restaurar paciente" de esta pagina, o mas tarde desde el listado activando "Mostrar eliminados".</div>';
    } catch (error) {
        document.getElementById('mensaje-ficha').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

async function restaurarPaciente() {
    try {
        await api.put(`/api/pacientes/${pacienteActual.id}/restaurar`, {});
        await cargarPaciente();
        document.getElementById('mensaje-ficha').innerHTML =
            '<div class="alerta alerta--exito">Paciente restaurado correctamente.</div>';
    } catch (error) {
        document.getElementById('mensaje-ficha').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

// -----------------------------------------------------------------
// Documentos
// -----------------------------------------------------------------
async function cargarDocumentos() {
    const lista = document.getElementById('lista-documentos');
    try {
        const documentos = await api.get(`/api/pacientes/${pacienteId}/documentos`);

        if (documentos.length === 0) {
            lista.innerHTML = '<li class="texto-secundario">Aun no hay documentos adjuntos</li>';
            return;
        }

        lista.innerHTML = documentos.map((doc) => `
            <li>
                <span>${doc.nombre_original} <span class="texto-secundario">(${formatoTamano(doc.tamano)})</span></span>
                <span>
                    <a class="btn-texto" href="/api/pacientes/${pacienteId}/documentos/${doc.id}/descargar" target="_blank">Descargar</a>
                    <button class="btn-texto" style="color: var(--rojo-alerta);" onclick="eliminarDocumento(${doc.id})">Eliminar</button>
                </span>
            </li>
        `).join('');
    } catch (error) {
        lista.innerHTML = `<li class="texto-secundario">Error al cargar documentos: ${error.message}</li>`;
    }
}

function formatoTamano(bytes) {
    if (!bytes) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(0)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}

async function subirDocumento(evento) {
    evento.preventDefault();
    const campoArchivo = document.getElementById('campo-archivo');
    const errorDiv = document.getElementById('error-subida');
    errorDiv.innerHTML = '';

    if (!campoArchivo.files[0]) return;

    const formData = new FormData();
    formData.append('archivo', campoArchivo.files[0]);

    try {
        await api.post(`/api/pacientes/${pacienteId}/documentos`, formData);
        campoArchivo.value = '';
        await cargarDocumentos();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

async function eliminarDocumento(docId) {
    const confirmado = await confirmarAccion({
        titulo: 'Eliminar documento',
        mensaje: 'El archivo se borra del expediente del paciente y no se puede recuperar.',
        confirmar: 'Eliminar documento',
        cancelar: 'Conservar',
        peligro: true
    });
    if (!confirmado) return;
    try {
        await api.del(`/api/pacientes/${pacienteId}/documentos/${docId}`);
        await cargarDocumentos();
    } catch (error) {
        await avisar({ titulo: 'No se pudo eliminar', mensaje: error.message });
    }
}

// -----------------------------------------------------------------
// Citas
// -----------------------------------------------------------------
async function cargarCitasPaciente() {
    const contenedor = document.getElementById('lista-citas-paciente');
    try {
        const citas = await api.get(`/api/citas?paciente_id=${pacienteId}`);

        if (citas.length === 0) {
            contenedor.innerHTML = '<p class="texto-secundario mb-0">Este paciente aun no tiene citas registradas.</p>';
            return;
        }

        const ordenadas = [...citas].sort((a, b) => (b.fecha + b.hora_inicio).localeCompare(a.fecha + a.hora_inicio));

        contenedor.innerHTML = `
            <div class="tabla-envoltorio">
                <table>
                    <thead>
                        <tr><th>Fecha</th><th>Hora</th><th>Doctor</th><th>Sillón</th><th>Motivo</th><th>Estado</th></tr>
                    </thead>
                    <tbody>
                        ${ordenadas.map((c) => `
                            <tr>
                                <td>${formatearFecha(c.fecha)}</td>
                                <td>${c.hora_inicio}${c.hora_fin ? ' - ' + c.hora_fin : ''}</td>
                                <td>${c.doctor_nombre || 'Sin doctor'}</td>
                                <td>${c.sillon ? 'Sillón ' + c.sillon : '-'}</td>
                                <td>${c.motivo || '-'}</td>
                                <td><span class="insignia ${CLASE_ESTADO_CITA[c.estado] || ''}">${ETIQUETAS_ESTADO_CITA[c.estado] || c.estado}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        contenedor.innerHTML = `<p class="texto-secundario mb-0">Error al cargar citas: ${error.message}</p>`;
    }
}
