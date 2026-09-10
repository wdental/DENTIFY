// =====================================================================
// Logica del listado de pacientes: busqueda, filtro, crear/editar
// =====================================================================

let usuarioActual = null;
let temporizadorBusqueda = null;

(async () => {
    usuarioActual = await inicializarSidebar();
    if (!usuarioActual) return;

    if (usuarioActual.rol === 'admin') {
        document.getElementById('check-eliminados-envoltura').classList.remove('oculto');
    }

    await cargarPacientes();

    document.getElementById('campo-buscar').addEventListener('input', () => {
        clearTimeout(temporizadorBusqueda);
        temporizadorBusqueda = setTimeout(cargarPacientes, 300);
    });

    document.getElementById('filtro-origen').addEventListener('change', cargarPacientes);
    document.getElementById('check-mostrar-eliminados').addEventListener('change', cargarPacientes);

    document.getElementById('btn-nuevo-paciente').addEventListener('click', () => abrirModalPaciente());
    document.getElementById('cerrar-modal-paciente').addEventListener('click', cerrarModalPaciente);
    document.getElementById('cancelar-modal-paciente').addEventListener('click', cerrarModalPaciente);
    document.getElementById('form-paciente').addEventListener('submit', guardarPaciente);
})();

async function cargarPacientes() {
    const cuerpoTabla = document.getElementById('cuerpo-tabla-pacientes');
    const q = document.getElementById('campo-buscar').value.trim();
    const origen = document.getElementById('filtro-origen').value;
    const mostrarEliminados = usuarioActual.rol === 'admin' && document.getElementById('check-mostrar-eliminados').checked;

    const parametros = new URLSearchParams();
    if (q) parametros.set('q', q);
    if (origen) parametros.set('origen', origen);
    if (mostrarEliminados) parametros.set('incluirInactivos', '1');

    try {
        const pacientes = await api.get(`/api/pacientes?${parametros.toString()}`);

        if (pacientes.length === 0) {
            cuerpoTabla.innerHTML = '<tr><td colspan="7" class="tabla-vacia">No se encontraron pacientes</td></tr>';
            return;
        }

        cuerpoTabla.innerHTML = pacientes.map((p) => `
            <tr class="${p.activo ? '' : 'fila-eliminada'}">
                <td>${p.numero_historia}</td>
                <td><a href="/paciente.html?id=${p.id}">${p.apellidos} ${p.nombres}</a> ${p.activo ? '' : '<span class="insignia insignia--rojo">Eliminado</span>'}</td>
                <td>${p.cedula || '-'}</td>
                <td>${p.edad !== null ? p.edad : '-'}</td>
                <td>${p.telefono || p.whatsapp || '-'}</td>
                <td>${p.origen ? `<span class="insignia insignia--dorado">${p.origen}</span>` : '-'}</td>
                <td>
                    <a href="/paciente.html?id=${p.id}" class="btn-texto">Ver ficha</a>
                    ${!p.activo ? `<button type="button" class="btn-texto" onclick="restaurarPacienteListado(${p.id})">Restaurar</button>` : ''}
                </td>
            </tr>
        `).join('');
    } catch (error) {
        cuerpoTabla.innerHTML = `<tr><td colspan="7" class="tabla-vacia">Error al cargar pacientes: ${error.message}</td></tr>`;
    }
}

async function restaurarPacienteListado(id) {
    try {
        await api.put(`/api/pacientes/${id}/restaurar`, {});
        await cargarPacientes();
    } catch (error) {
        alert('Error al restaurar: ' + error.message);
    }
}

function abrirModalPaciente() {
    document.getElementById('titulo-modal-paciente').textContent = 'Nuevo paciente';
    document.getElementById('form-paciente').reset();
    document.getElementById('paciente-id').value = '';
    document.getElementById('error-modal-paciente').innerHTML = '';
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

    const id = document.getElementById('paciente-id').value;

    try {
        if (id) {
            await api.put(`/api/pacientes/${id}`, datos);
        } else {
            await api.post('/api/pacientes', datos);
        }
        cerrarModalPaciente();
        await cargarPacientes();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}
