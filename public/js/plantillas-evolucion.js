// =====================================================================
// Administracion de las plantillas guia de la nota de evolucion
// (pestaña "Notas de evolución" de /plantillas.html, solo admin).
//
// Son los textos que el doctor inserta con un clic en el modal de
// "Nueva evolucion". Se administran aqui para que la clinica ajuste su
// propia redaccion -y sobre todo las dosis de las prescripciones- sin
// tocar codigo. Comparte la pagina con las plantillas de documento
// (public/js/plantillas.js), que inicializa el sidebar y valida el rol.
// =====================================================================

let plantillasEvolucionActuales = [];

const ETIQUETAS_CAMPO_PLANTILLA = {
    diagnostico: 'Diagnóstico / complicaciones',
    procedimientos: 'Procedimientos realizados',
    prescripciones: 'Prescripciones'
};

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('cuerpo-tabla-plantillas-evolucion')) return; // otra pagina

    // Las pestañas conmutan tambien que boton "+ Nueva ..." se ofrece.
    document.querySelectorAll('.pestana').forEach((boton) => {
        boton.addEventListener('click', () => {
            document.querySelectorAll('.pestana').forEach((b) => b.classList.toggle('activa', b === boton));
            document.querySelectorAll('.panel-pestana').forEach((p) => p.classList.toggle('activo', p.id === boton.dataset.panel));
            const enEvolucion = boton.dataset.panel === 'panel-plantillas-evolucion';
            document.getElementById('btn-nueva-plantilla').classList.toggle('oculto', enEvolucion);
            document.getElementById('btn-nueva-plantilla-evolucion').classList.toggle('oculto', !enEvolucion);
        });
    });

    document.getElementById('btn-nueva-plantilla-evolucion').addEventListener('click', () => abrirModalPlantillaEvolucion(null));
    document.getElementById('cerrar-modal-plantilla-evolucion').addEventListener('click', cerrarModalPlantillaEvolucion);
    document.getElementById('cancelar-modal-plantilla-evolucion').addEventListener('click', cerrarModalPlantillaEvolucion);
    document.getElementById('form-plantilla-evolucion').addEventListener('submit', guardarPlantillaEvolucion);

    cargarPlantillasEvolucionAdmin();
});

function escaparPlantillaEvol(texto) {
    return String(texto == null ? '' : texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function cargarPlantillasEvolucionAdmin() {
    const cuerpo = document.getElementById('cuerpo-tabla-plantillas-evolucion');
    try {
        plantillasEvolucionActuales = await api.get('/api/plantillas-evolucion?incluirInactivas=1');
        if (plantillasEvolucionActuales.length === 0) {
            cuerpo.innerHTML = '<tr><td colspan="6" class="tabla-vacia">Todavía no hay plantillas de evolución.</td></tr>';
            return;
        }
        cuerpo.innerHTML = plantillasEvolucionActuales.map(filaPlantillaEvolucion).join('');
    } catch (error) {
        cuerpo.innerHTML = `<tr><td colspan="6" class="tabla-vacia">Error al cargar: ${escaparPlantillaEvol(error.message)}</td></tr>`;
    }
}

function filaPlantillaEvolucion(p) {
    return `
        <tr class="${p.activo ? '' : 'fila-anulada'}">
            <td><strong>${escaparPlantillaEvol(p.nombre)}</strong></td>
            <td>${escaparPlantillaEvol(ETIQUETAS_CAMPO_PLANTILLA[p.campo] || p.campo)}</td>
            <td class="celda-texto-plantilla">${escaparPlantillaEvol(p.texto)}</td>
            <td>${p.orden}</td>
            <td>${p.activo ? '<span class="insignia insignia--verde">Activa</span>' : '<span class="insignia">Oculta</span>'}</td>
            <td class="celda-acciones">
                <button type="button" class="btn-texto" onclick="abrirModalPlantillaEvolucion(${p.id})">Editar</button>
                <button type="button" class="btn-texto" style="color:var(--rojo-alerta);" onclick="eliminarPlantillaEvolucion(${p.id})">Eliminar</button>
            </td>
        </tr>
    `;
}

function abrirModalPlantillaEvolucion(id) {
    document.getElementById('error-modal-plantilla-evolucion').innerHTML = '';
    document.getElementById('form-plantilla-evolucion').reset();
    document.getElementById('pe-id').value = '';

    if (id) {
        const p = plantillasEvolucionActuales.find((x) => x.id === id);
        if (!p) return;
        document.getElementById('titulo-modal-plantilla-evolucion').textContent = 'Editar plantilla de evolución';
        document.getElementById('pe-id').value = p.id;
        document.getElementById('pe-nombre').value = p.nombre;
        document.getElementById('pe-campo').value = p.campo;
        document.getElementById('pe-texto').value = p.texto;
        document.getElementById('pe-orden').value = p.orden;
        document.getElementById('pe-activo').value = p.activo ? '1' : '0';
    } else {
        document.getElementById('titulo-modal-plantilla-evolucion').textContent = 'Nueva plantilla de evolución';
    }

    document.getElementById('modal-plantilla-evolucion').classList.add('abierto');
}

function cerrarModalPlantillaEvolucion() {
    document.getElementById('modal-plantilla-evolucion').classList.remove('abierto');
}

async function guardarPlantillaEvolucion(evento) {
    evento.preventDefault();
    const errorDiv = document.getElementById('error-modal-plantilla-evolucion');
    errorDiv.innerHTML = '';

    const id = document.getElementById('pe-id').value;
    const datos = {
        nombre: document.getElementById('pe-nombre').value.trim(),
        campo: document.getElementById('pe-campo').value,
        texto: document.getElementById('pe-texto').value.trim(),
        orden: document.getElementById('pe-orden').value,
        activo: Number(document.getElementById('pe-activo').value)
    };

    try {
        if (id) {
            await api.put(`/api/plantillas-evolucion/${id}`, datos);
        } else {
            await api.post('/api/plantillas-evolucion', datos);
        }
        cerrarModalPlantillaEvolucion();
        await cargarPlantillasEvolucionAdmin();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${escaparPlantillaEvol(error.message)}</div>`;
    }
}

async function eliminarPlantillaEvolucion(id) {
    const p = plantillasEvolucionActuales.find((x) => x.id === id);
    const confirmado = await confirmarAccion({
        titulo: 'Eliminar plantilla',
        mensaje: `Se quita "${p ? p.nombre : ''}" de los botones del modal de evolución. Las evoluciones ya escritas con este texto no se tocan.`,
        confirmar: 'Eliminar plantilla',
        cancelar: 'Conservar',
        peligro: true
    });
    if (!confirmado) return;

    try {
        await api.del(`/api/plantillas-evolucion/${id}`);
        await cargarPlantillasEvolucionAdmin();
    } catch (error) {
        await avisar({ titulo: 'No se pudo eliminar', mensaje: error.message });
    }
}
