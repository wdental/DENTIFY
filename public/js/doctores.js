// =====================================================================
// Logica del panel de doctores (solo administrador)
// =====================================================================

let usuarioSesion = null;

(async () => {
    usuarioSesion = await inicializarSidebar();
    if (!usuarioSesion) return;

    if (usuarioSesion.rol !== 'admin') {
        document.querySelector('.contenido').innerHTML = '<div class="alerta alerta--error">No tiene permisos para ver esta seccion.</div>';
        return;
    }

    await cargarDoctores();

    document.getElementById('btn-nuevo-doctor').addEventListener('click', abrirModalNuevo);
    document.getElementById('cerrar-modal-doctor').addEventListener('click', cerrarModalDoctor);
    document.getElementById('cancelar-modal-doctor').addEventListener('click', cerrarModalDoctor);
    document.getElementById('form-doctor').addEventListener('submit', guardarDoctor);
    document.getElementById('btn-probar-conexion').addEventListener('click', probarConexion);
})();

async function cargarDoctores() {
    const cuerpoTabla = document.getElementById('cuerpo-tabla-doctores');
    try {
        const doctores = await api.get('/api/doctores?incluirInactivos=1');

        if (doctores.length === 0) {
            cuerpoTabla.innerHTML = '<tr><td colspan="6" class="tabla-vacia">No hay doctores registrados</td></tr>';
            return;
        }

        cuerpoTabla.innerHTML = doctores.map((d) => `
            <tr>
                <td>${d.nombre_completo}</td>
                <td>${d.titulo || '-'}</td>
                <td>${d.registro_profesional || '-'}</td>
                <td>${d.calendario_google_id ? `<span class="insignia insignia--dorado">Configurado</span>` : '<span class="texto-secundario">Sin configurar</span>'}</td>
                <td><span class="insignia ${d.activo ? 'insignia--verde' : 'insignia--rojo'}">${d.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                    <button class="btn-texto" onclick="abrirModalEdicion(${d.id})">Editar</button>
                    <button class="btn-texto" onclick="alternarActivoDoctor(${d.id}, ${d.activo ? 0 : 1})">${d.activo ? 'Desactivar' : 'Activar'}</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        cuerpoTabla.innerHTML = `<tr><td colspan="6" class="tabla-vacia">Error: ${error.message}</td></tr>`;
    }
}

let doctoresCache = [];

function abrirModalNuevo() {
    document.getElementById('titulo-modal-doctor').textContent = 'Nuevo doctor';
    document.getElementById('form-doctor').reset();
    document.getElementById('d-id').value = '';
    document.getElementById('d-activo').checked = true;
    document.getElementById('campo-activo-doctor').classList.add('oculto');
    document.getElementById('error-modal-doctor').innerHTML = '';
    document.getElementById('resultado-prueba-conexion').textContent = '';
    document.getElementById('modal-doctor').classList.add('abierto');
}

async function abrirModalEdicion(id) {
    document.getElementById('error-modal-doctor').innerHTML = '';
    document.getElementById('resultado-prueba-conexion').textContent = '';
    document.getElementById('campo-activo-doctor').classList.remove('oculto');

    try {
        const doctor = await api.get(`/api/doctores/${id}`);
        document.getElementById('titulo-modal-doctor').textContent = 'Editar doctor';
        document.getElementById('d-id').value = doctor.id;
        document.getElementById('d-nombre').value = doctor.nombre_completo || '';
        document.getElementById('d-titulo').value = doctor.titulo || '';
        document.getElementById('d-registro').value = doctor.registro_profesional || '';
        document.getElementById('d-calendario').value = doctor.calendario_google_id || '';
        document.getElementById('d-activo').checked = !!doctor.activo;
        document.getElementById('modal-doctor').classList.add('abierto');
    } catch (error) {
        document.getElementById('mensaje-doctores').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

function cerrarModalDoctor() {
    document.getElementById('modal-doctor').classList.remove('abierto');
}

async function guardarDoctor(evento) {
    evento.preventDefault();
    const errorDiv = document.getElementById('error-modal-doctor');
    errorDiv.innerHTML = '';

    const id = document.getElementById('d-id').value;
    const datos = {
        nombre_completo: document.getElementById('d-nombre').value.trim(),
        titulo: document.getElementById('d-titulo').value.trim() || null,
        registro_profesional: document.getElementById('d-registro').value.trim() || null,
        calendario_google_id: document.getElementById('d-calendario').value.trim() || null
    };

    if (id) {
        datos.activo = document.getElementById('d-activo').checked;
    }

    try {
        if (id) {
            await api.put(`/api/doctores/${id}`, datos);
        } else {
            await api.post('/api/doctores', datos);
        }
        cerrarModalDoctor();
        await cargarDoctores();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

async function alternarActivoDoctor(id, nuevoEstado) {
    try {
        await api.put(`/api/doctores/${id}`, { activo: nuevoEstado });
        await cargarDoctores();
    } catch (error) {
        document.getElementById('mensaje-doctores').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

async function probarConexion() {
    const calendarioId = document.getElementById('d-calendario').value.trim();
    const resultadoSpan = document.getElementById('resultado-prueba-conexion');
    resultadoSpan.textContent = 'Probando...';
    resultadoSpan.style.color = '';

    if (!calendarioId) {
        resultadoSpan.textContent = 'Ingrese un ID de calendario primero';
        resultadoSpan.style.color = 'var(--rojo-alerta)';
        return;
    }

    try {
        const resultado = await api.post('/api/doctores/probar-conexion', { calendario_google_id: calendarioId });
        resultadoSpan.textContent = `Conexion exitosa: "${resultado.resumen}"`;
        resultadoSpan.style.color = 'var(--verde-ok)';
    } catch (error) {
        resultadoSpan.textContent = error.message;
        resultadoSpan.style.color = 'var(--rojo-alerta)';
    }
}
