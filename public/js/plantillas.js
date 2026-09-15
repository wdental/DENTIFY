// =====================================================================
// Panel de administracion de plantillas de documento (Fase 3C, solo admin)
// =====================================================================

let plantillasActuales = [];

const ETIQUETAS_TIPO_PLANTILLA = { consentimiento: 'Consentimiento', certificado: 'Certificado', otro: 'Otro' };

(async () => {
    const usuario = await inicializarSidebar();
    if (!usuario) return;

    if (!tienePermiso(usuario, 'catalogos.plantillas')) {
        document.querySelector('.contenido').innerHTML = '<div class="alerta alerta--error">No tiene permisos para ver esta sección.</div>';
        return;
    }

    await cargarPlantillas();

    document.getElementById('btn-nueva-plantilla').addEventListener('click', () => abrirModalPlantilla(null));
    document.getElementById('cerrar-modal-plantilla').addEventListener('click', () => document.getElementById('modal-plantilla').classList.remove('abierto'));
    document.getElementById('cancelar-modal-plantilla').addEventListener('click', () => document.getElementById('modal-plantilla').classList.remove('abierto'));
    document.getElementById('form-plantilla').addEventListener('submit', guardarPlantilla);
})();

async function cargarPlantillas() {
    const cuerpoTabla = document.getElementById('cuerpo-tabla-plantillas');
    try {
        plantillasActuales = await api.get('/api/plantillas?incluirInactivas=1');
        if (plantillasActuales.length === 0) {
            cuerpoTabla.innerHTML = '<tr><td colspan="5" class="tabla-vacia">Sin plantillas registradas.</td></tr>';
            return;
        }
        cuerpoTabla.innerHTML = plantillasActuales.map((p) => `
            <tr>
                <td>${p.nombre}</td>
                <td>${ETIQUETAS_TIPO_PLANTILLA[p.tipo] || p.tipo}</td>
                <td>${p.procedimiento_asociado || '<span class="texto-secundario">—</span>'}</td>
                <td><span class="insignia ${p.activo ? 'insignia--verde' : 'insignia--rojo'}">${p.activo ? 'Activa' : 'Inactiva'}</span></td>
                <td>
                    <button class="btn-texto" onclick="abrirModalPlantilla(${p.id})">Editar</button>
                    <button class="btn-texto" onclick="alternarActivaPlantilla(${p.id}, ${p.activo ? 0 : 1})">${p.activo ? 'Desactivar' : 'Activar'}</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        cuerpoTabla.innerHTML = `<tr><td colspan="5" class="tabla-vacia">Error: ${error.message}</td></tr>`;
    }
}

function abrirModalPlantilla(id) {
    document.getElementById('error-modal-plantilla').innerHTML = '';
    const plantilla = id ? plantillasActuales.find((p) => p.id === id) : null;

    document.getElementById('titulo-modal-plantilla').textContent = plantilla ? 'Editar plantilla' : 'Nueva plantilla';
    document.getElementById('p-id').value = plantilla ? plantilla.id : '';
    document.getElementById('p-nombre').value = plantilla ? plantilla.nombre : '';
    document.getElementById('p-tipo').value = plantilla ? plantilla.tipo : 'consentimiento';
    document.getElementById('p-procedimiento').value = plantilla ? (plantilla.procedimiento_asociado || '') : '';
    document.getElementById('p-contenido').innerHTML = plantilla ? plantilla.contenido : '';
    document.getElementById('p-activo').checked = plantilla ? !!plantilla.activo : true;

    document.getElementById('modal-plantilla').classList.add('abierto');
}

async function guardarPlantilla(evento) {
    evento.preventDefault();
    const errorDiv = document.getElementById('error-modal-plantilla');
    errorDiv.innerHTML = '';

    const id = document.getElementById('p-id').value;
    const datos = {
        nombre: document.getElementById('p-nombre').value.trim(),
        tipo: document.getElementById('p-tipo').value,
        procedimiento_asociado: document.getElementById('p-procedimiento').value.trim(),
        contenido: document.getElementById('p-contenido').innerHTML.trim(),
        activo: document.getElementById('p-activo').checked
    };

    try {
        if (id) {
            await api.put(`/api/plantillas/${id}`, datos);
        } else {
            await api.post('/api/plantillas', datos);
        }
        document.getElementById('modal-plantilla').classList.remove('abierto');
        await cargarPlantillas();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

async function alternarActivaPlantilla(id, nuevoEstado) {
    const plantilla = plantillasActuales.find((p) => p.id === id);
    if (!plantilla) return;
    try {
        await api.put(`/api/plantillas/${id}`, { ...plantilla, activo: !!nuevoEstado });
        await cargarPlantillas();
    } catch (error) {
        document.getElementById('mensaje-plantillas').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}
