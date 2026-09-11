// =====================================================================
// Logica del panel de usuarios (solo administrador)
// =====================================================================

let usuarioSesion = null;
let doctoresParaUsuarios = [];

(async () => {
    usuarioSesion = await inicializarSidebar();
    if (!usuarioSesion) return;

    if (usuarioSesion.rol !== 'admin') {
        document.querySelector('.contenido').innerHTML = '<div class="alerta alerta--error">No tiene permisos para ver esta seccion.</div>';
        return;
    }

    await cargarDoctoresParaUsuarios();
    await cargarUsuarios();

    document.getElementById('btn-nuevo-usuario').addEventListener('click', () => {
        document.getElementById('form-usuario').reset();
        document.getElementById('error-modal-usuario').innerHTML = '';
        document.getElementById('modal-usuario').classList.add('abierto');
    });
    document.getElementById('cerrar-modal-usuario').addEventListener('click', () => document.getElementById('modal-usuario').classList.remove('abierto'));
    document.getElementById('cancelar-modal-usuario').addEventListener('click', () => document.getElementById('modal-usuario').classList.remove('abierto'));
    document.getElementById('form-usuario').addEventListener('submit', crearUsuario);

    document.getElementById('cerrar-modal-clave').addEventListener('click', () => document.getElementById('modal-clave').classList.remove('abierto'));
    document.getElementById('cancelar-modal-clave').addEventListener('click', () => document.getElementById('modal-clave').classList.remove('abierto'));
    document.getElementById('form-clave').addEventListener('submit', actualizarClave);

    document.getElementById('cerrar-modal-doctor-usuario').addEventListener('click', () => document.getElementById('modal-doctor-usuario').classList.remove('abierto'));
    document.getElementById('cancelar-modal-doctor-usuario').addEventListener('click', () => document.getElementById('modal-doctor-usuario').classList.remove('abierto'));
    document.getElementById('form-doctor-usuario').addEventListener('submit', actualizarDoctorUsuario);
})();

async function cargarDoctoresParaUsuarios() {
    try {
        doctoresParaUsuarios = await api.get('/api/doctores');
    } catch (error) {
        doctoresParaUsuarios = [];
    }
    const opciones = '<option value="">Ninguno</option>' + doctoresParaUsuarios.map((d) => `<option value="${d.id}">${d.nombre_completo}</option>`).join('');
    document.getElementById('u-doctor').innerHTML = opciones;
    document.getElementById('doctor-usuario-select').innerHTML = opciones;
}

async function cargarUsuarios() {
    const cuerpoTabla = document.getElementById('cuerpo-tabla-usuarios');
    try {
        const usuarios = await api.get('/api/usuarios');

        cuerpoTabla.innerHTML = usuarios.map((u) => `
            <tr>
                <td>${u.nombre}</td>
                <td>${u.usuario}</td>
                <td><span class="insignia ${u.rol === 'admin' ? 'insignia--dorado' : ''}">${u.rol === 'admin' ? 'Administrador' : 'Asistencial'}</span></td>
                <td>${u.doctor_nombre || '<span class="texto-secundario">Ninguno</span>'}</td>
                <td><span class="insignia ${u.activo ? 'insignia--verde' : 'insignia--rojo'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                    <button class="btn-texto" onclick="abrirModalDoctorUsuario(${u.id}, ${u.doctor_id || 'null'})">Vincular doctor</button>
                    <button class="btn-texto" onclick="abrirModalClave(${u.id})">Cambiar clave</button>
                    <button class="btn-texto" onclick="alternarActivo(${u.id}, ${u.activo ? 0 : 1})">${u.activo ? 'Desactivar' : 'Activar'}</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        cuerpoTabla.innerHTML = `<tr><td colspan="6" class="tabla-vacia">Error: ${error.message}</td></tr>`;
    }
}

function abrirModalDoctorUsuario(id, doctorIdActual) {
    document.getElementById('error-modal-doctor-usuario').innerHTML = '';
    document.getElementById('doctor-usuario-id').value = id;
    document.getElementById('doctor-usuario-select').value = doctorIdActual || '';
    document.getElementById('modal-doctor-usuario').classList.add('abierto');
}

async function actualizarDoctorUsuario(evento) {
    evento.preventDefault();
    const errorDiv = document.getElementById('error-modal-doctor-usuario');
    errorDiv.innerHTML = '';

    const id = document.getElementById('doctor-usuario-id').value;
    const doctorId = document.getElementById('doctor-usuario-select').value;

    try {
        await api.put(`/api/usuarios/${id}`, { doctor_id: doctorId ? Number(doctorId) : null });
        document.getElementById('modal-doctor-usuario').classList.remove('abierto');
        await cargarUsuarios();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

async function crearUsuario(evento) {
    evento.preventDefault();
    const errorDiv = document.getElementById('error-modal-usuario');
    errorDiv.innerHTML = '';

    const doctorId = document.getElementById('u-doctor').value;
    const datos = {
        nombre: document.getElementById('u-nombre').value.trim(),
        usuario: document.getElementById('u-usuario').value.trim(),
        password: document.getElementById('u-password').value,
        rol: document.getElementById('u-rol').value,
        doctor_id: doctorId ? Number(doctorId) : null
    };

    try {
        await api.post('/api/usuarios', datos);
        document.getElementById('modal-usuario').classList.remove('abierto');
        await cargarUsuarios();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

async function alternarActivo(id, nuevoEstado) {
    try {
        await api.put(`/api/usuarios/${id}`, { activo: nuevoEstado });
        await cargarUsuarios();
    } catch (error) {
        document.getElementById('mensaje-usuarios').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

function abrirModalClave(id) {
    document.getElementById('form-clave').reset();
    document.getElementById('error-modal-clave').innerHTML = '';
    document.getElementById('clave-usuario-id').value = id;
    document.getElementById('modal-clave').classList.add('abierto');
}

async function actualizarClave(evento) {
    evento.preventDefault();
    const errorDiv = document.getElementById('error-modal-clave');
    errorDiv.innerHTML = '';

    const id = document.getElementById('clave-usuario-id').value;
    const password = document.getElementById('nueva-clave').value;

    try {
        await api.put(`/api/usuarios/${id}/password`, { password });
        document.getElementById('modal-clave').classList.remove('abierto');
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}
