// =====================================================================
// Logica del panel de usuarios (requiere el permiso sistema.usuarios;
// los administradores lo tienen siempre)
// =====================================================================

let usuarioSesion = null;
let doctoresParaUsuarios = [];
let catalogoPermisos = [];          // [{area, nombre, permisos: [{clave, nombre, delicado}]}]
let permisosAsistencialHistorico = [];
let usuariosCargados = [];

(async () => {
    usuarioSesion = await inicializarSidebar();
    if (!usuarioSesion) return;

    if (!tienePermiso(usuarioSesion, 'sistema.usuarios')) {
        document.querySelector('.contenido').innerHTML = '<div class="alerta alerta--error">No tiene permisos para ver esta seccion.</div>';
        return;
    }

    await cargarCatalogoPermisos();
    await cargarDoctoresParaUsuarios();
    await cargarUsuarios();

    document.getElementById('btn-nuevo-usuario').addEventListener('click', () => {
        document.getElementById('form-usuario').reset();
        document.getElementById('error-modal-usuario').innerHTML = '';
        // Casillas del usuario nuevo: arrancan como el asistencial de siempre
        // (todo lo operativo, sin acciones administrativas ni destructivas).
        document.getElementById('permisos-nuevo-usuario').innerHTML = htmlCasillasPermisos('nuevo', permisosAsistencialHistorico);
        alternarBloquePermisosNuevo();
        document.getElementById('modal-usuario').classList.add('abierto');
    });
    document.getElementById('u-rol').addEventListener('change', alternarBloquePermisosNuevo);
    document.getElementById('cerrar-modal-usuario').addEventListener('click', () => document.getElementById('modal-usuario').classList.remove('abierto'));
    document.getElementById('cancelar-modal-usuario').addEventListener('click', () => document.getElementById('modal-usuario').classList.remove('abierto'));
    document.getElementById('form-usuario').addEventListener('submit', crearUsuario);

    document.getElementById('cerrar-modal-clave').addEventListener('click', () => document.getElementById('modal-clave').classList.remove('abierto'));
    document.getElementById('cancelar-modal-clave').addEventListener('click', () => document.getElementById('modal-clave').classList.remove('abierto'));
    document.getElementById('form-clave').addEventListener('submit', actualizarClave);

    document.getElementById('cerrar-modal-doctor-usuario').addEventListener('click', () => document.getElementById('modal-doctor-usuario').classList.remove('abierto'));
    document.getElementById('cancelar-modal-doctor-usuario').addEventListener('click', () => document.getElementById('modal-doctor-usuario').classList.remove('abierto'));
    document.getElementById('form-doctor-usuario').addEventListener('submit', actualizarDoctorUsuario);

    document.getElementById('cerrar-modal-permisos').addEventListener('click', () => document.getElementById('modal-permisos').classList.remove('abierto'));
    document.getElementById('cancelar-modal-permisos').addEventListener('click', () => document.getElementById('modal-permisos').classList.remove('abierto'));
    document.getElementById('form-permisos').addEventListener('submit', guardarPermisosUsuario);
})();

async function cargarCatalogoPermisos() {
    const respuesta = await api.get('/api/usuarios/catalogo-permisos');
    catalogoPermisos = respuesta.catalogo;
    permisosAsistencialHistorico = respuesta.asistencial_historico;
}

// Casillas agrupadas por area. `prefijo` evita colisiones de id entre el
// modal de creacion y el de edicion.
function htmlCasillasPermisos(prefijo, marcados) {
    return catalogoPermisos.map((area) => `
        <div style="margin-bottom: 12px;">
            <strong style="font-size: 0.85rem;">${area.nombre}</strong>
            <div class="grilla-checks" style="margin-top: 6px;">
                ${area.permisos.map((p) => `
                    <label class="check-item">
                        <input type="checkbox" data-permisos-grupo="${prefijo}" value="${p.clave}" ${marcados.includes(p.clave) ? 'checked' : ''}>
                        <span>${p.nombre}${p.delicado ? ' <span class="texto-secundario">(delicado)</span>' : ''}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function permisosMarcados(prefijo) {
    return [...document.querySelectorAll(`input[data-permisos-grupo="${prefijo}"]:checked`)].map((c) => c.value);
}

function alternarBloquePermisosNuevo() {
    const esAdmin = document.getElementById('u-rol').value === 'admin';
    document.getElementById('bloque-permisos-nuevo').classList.toggle('oculto', esAdmin);
    document.getElementById('nota-permisos-admin').classList.toggle('oculto', !esAdmin);
}

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

// "Agenda, Pacientes y Caja" — resumen legible de las areas donde el
// usuario tiene al menos un permiso.
function resumenPermisos(u) {
    if (u.rol === 'admin') return '<span class="texto-secundario">Todos (administrador)</span>';
    const areas = catalogoPermisos
        .filter((area) => area.permisos.some((p) => u.permisos.includes(p.clave)))
        .map((area) => area.nombre);
    if (areas.length === 0) return '<span class="texto-secundario">Ninguno</span>';
    return areas.join(', ');
}

async function cargarUsuarios() {
    const cuerpoTabla = document.getElementById('cuerpo-tabla-usuarios');
    try {
        usuariosCargados = await api.get('/api/usuarios');

        cuerpoTabla.innerHTML = usuariosCargados.map((u) => `
            <tr>
                <td>${u.nombre}</td>
                <td>${u.usuario}</td>
                <td><span class="insignia ${u.rol === 'admin' ? 'insignia--dorado' : ''}">${u.rol === 'admin' ? 'Administrador' : 'Asistencial'}</span></td>
                <td style="max-width: 260px;">${resumenPermisos(u)}</td>
                <td>${u.doctor_nombre || '<span class="texto-secundario">Ninguno</span>'}</td>
                <td><span class="insignia ${u.activo ? 'insignia--verde' : 'insignia--rojo'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                    ${u.rol !== 'admin' ? `<button class="btn-texto" onclick="abrirModalPermisos(${u.id})">Permisos</button>` : ''}
                    <button class="btn-texto" onclick="abrirModalDoctorUsuario(${u.id}, ${u.doctor_id || 'null'})">Vincular doctor</button>
                    <button class="btn-texto" onclick="abrirModalClave(${u.id})">Cambiar clave</button>
                    <button class="btn-texto" onclick="alternarActivo(${u.id}, ${u.activo ? 0 : 1})">${u.activo ? 'Desactivar' : 'Activar'}</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        cuerpoTabla.innerHTML = `<tr><td colspan="7" class="tabla-vacia">Error: ${error.message}</td></tr>`;
    }
}

function abrirModalPermisos(id) {
    const u = usuariosCargados.find((x) => x.id === id);
    if (!u) return;
    document.getElementById('error-modal-permisos').innerHTML = '';
    document.getElementById('permisos-usuario-id').value = u.id;
    document.getElementById('permisos-nombre-usuario').textContent = u.nombre;
    document.getElementById('permisos-usuario-contenedor').innerHTML = htmlCasillasPermisos('editar', u.permisos);
    document.getElementById('modal-permisos').classList.add('abierto');
}

async function guardarPermisosUsuario(evento) {
    evento.preventDefault();
    const errorDiv = document.getElementById('error-modal-permisos');
    errorDiv.innerHTML = '';

    const id = document.getElementById('permisos-usuario-id').value;
    try {
        await api.put(`/api/usuarios/${id}/permisos`, { permisos: permisosMarcados('editar') });
        document.getElementById('modal-permisos').classList.remove('abierto');
        await cargarUsuarios();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
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
    const rol = document.getElementById('u-rol').value;
    const datos = {
        nombre: document.getElementById('u-nombre').value.trim(),
        usuario: document.getElementById('u-usuario').value.trim(),
        password: document.getElementById('u-password').value,
        rol,
        doctor_id: doctorId ? Number(doctorId) : null
    };
    if (rol === 'asistencial') {
        datos.permisos = permisosMarcados('nuevo');
    }

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
