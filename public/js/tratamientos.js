// =====================================================================
// Panel de administracion del catalogo de tratamientos (Fase 4A, solo
// admin): catalogo con precios, mapeo hallazgo->tratamiento e importador
// desde Excel/CSV (mismo patron que public/js/importador.js).
// =====================================================================

let tratamientosActuales = [];
let mapeoActual = [];
let camposTratamiento = [];
let datosSubidaTratamiento = null;

const ETIQUETAS_CATEGORIA = {
    Prevencion: 'Prevención', Operatoria: 'Operatoria', Endodoncia: 'Endodoncia',
    Cirugia: 'Cirugía', Rehabilitacion: 'Rehabilitación', Ortodoncia: 'Ortodoncia',
    Estetica: 'Estética', Otro: 'Otro'
};

const ETIQUETAS_HALLAZGO_MAPEO = {
    caries: 'Caries',
    extraccion_indicada: 'Extracción indicada',
    endodoncia_indicada: 'Endodoncia por realizar',
    corona_indicada: 'Corona indicada',
    sellante_necesario: 'Sellante necesario',
    protesis_fija_indicada: 'Prótesis fija indicada',
    protesis_removible_indicada: 'Prótesis removible indicada',
    protesis_total_indicada: 'Prótesis total indicada',
    implante_indicado: 'Implante indicado'
};

(async () => {
    const usuario = await inicializarSidebar();
    if (!usuario) return;

    if (!tienePermiso(usuario, 'catalogos.tratamientos')) {
        document.querySelector('.contenido').innerHTML = '<div class="alerta alerta--error">No tiene permisos para ver esta sección.</div>';
        return;
    }

    document.querySelectorAll('.pestana').forEach((boton) => {
        boton.addEventListener('click', () => {
            document.querySelectorAll('.pestana').forEach((b) => b.classList.toggle('activa', b === boton));
            document.querySelectorAll('.panel-pestana').forEach((p) => p.classList.toggle('activo', p.id === boton.dataset.panel));
        });
    });

    await cargarTratamientos();
    await cargarMapeo();
    camposTratamiento = await api.get('/api/tratamientos/importar/campos');

    document.getElementById('btn-nuevo-tratamiento').addEventListener('click', () => abrirModalTratamiento(null));
    document.getElementById('cerrar-modal-tratamiento').addEventListener('click', () => document.getElementById('modal-tratamiento').classList.remove('abierto'));
    document.getElementById('cancelar-modal-tratamiento').addEventListener('click', () => document.getElementById('modal-tratamiento').classList.remove('abierto'));
    document.getElementById('form-tratamiento').addEventListener('submit', guardarTratamiento);
    document.getElementById('filtro-busqueda-tratamiento').addEventListener('input', () => cargarTratamientos());
    document.getElementById('filtro-categoria-tratamiento').addEventListener('change', () => cargarTratamientos());

    document.getElementById('btn-subir-archivo-tratamiento').addEventListener('click', subirArchivoTratamiento);
    document.getElementById('btn-cancelar-importacion-tratamiento').addEventListener('click', reiniciarImportadorTratamiento);
    document.getElementById('btn-confirmar-importacion-tratamiento').addEventListener('click', confirmarImportacionTratamiento);
})();

// -----------------------------------------------------------------
// Catalogo
// -----------------------------------------------------------------
async function cargarTratamientos() {
    const cuerpoTabla = document.getElementById('cuerpo-tabla-tratamientos');
    const busqueda = document.getElementById('filtro-busqueda-tratamiento').value.trim();
    const categoria = document.getElementById('filtro-categoria-tratamiento').value;
    try {
        const parametros = new URLSearchParams();
        if (busqueda) parametros.set('busqueda', busqueda);
        if (categoria) parametros.set('categoria', categoria);
        tratamientosActuales = await api.get(`/api/tratamientos?${parametros.toString()}`);

        if (tratamientosActuales.length === 0) {
            cuerpoTabla.innerHTML = '<tr><td colspan="6" class="tabla-vacia">Sin tratamientos registrados.</td></tr>';
            return;
        }
        cuerpoTabla.innerHTML = tratamientosActuales.map((t) => `
            <tr>
                <td>${t.codigo || '<span class="texto-secundario">—</span>'}</td>
                <td>${t.nombre}</td>
                <td>${ETIQUETAS_CATEGORIA[t.categoria] || t.categoria}</td>
                <td>$${Number(t.precio).toFixed(2)}</td>
                <td><span class="insignia ${t.activo ? 'insignia--verde' : 'insignia--rojo'}">${t.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                    <button class="btn-texto" onclick="abrirModalTratamiento(${t.id})">Editar</button>
                    <button class="btn-texto" onclick="alternarActivoTratamiento(${t.id}, ${t.activo ? 0 : 1})">${t.activo ? 'Desactivar' : 'Activar'}</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        cuerpoTabla.innerHTML = `<tr><td colspan="6" class="tabla-vacia">Error: ${error.message}</td></tr>`;
    }
}

function abrirModalTratamiento(id) {
    document.getElementById('error-modal-tratamiento').innerHTML = '';
    const tratamiento = id ? tratamientosActuales.find((t) => t.id === id) : null;

    document.getElementById('titulo-modal-tratamiento').textContent = tratamiento ? 'Editar tratamiento' : 'Nuevo tratamiento';
    document.getElementById('t-id').value = tratamiento ? tratamiento.id : '';
    document.getElementById('t-nombre').value = tratamiento ? tratamiento.nombre : '';
    document.getElementById('t-codigo').value = tratamiento ? (tratamiento.codigo || '') : '';
    document.getElementById('t-categoria').value = tratamiento ? tratamiento.categoria : 'Otro';
    document.getElementById('t-precio').value = tratamiento ? tratamiento.precio : '';
    document.getElementById('t-notas').value = tratamiento ? (tratamiento.notas || '') : '';
    document.getElementById('t-activo').checked = tratamiento ? !!tratamiento.activo : true;

    document.getElementById('modal-tratamiento').classList.add('abierto');
}

async function guardarTratamiento(evento) {
    evento.preventDefault();
    const errorDiv = document.getElementById('error-modal-tratamiento');
    errorDiv.innerHTML = '';

    const id = document.getElementById('t-id').value;
    const datos = {
        nombre: document.getElementById('t-nombre').value.trim(),
        codigo: document.getElementById('t-codigo').value.trim(),
        categoria: document.getElementById('t-categoria').value,
        precio: document.getElementById('t-precio').value,
        notas: document.getElementById('t-notas').value.trim(),
        activo: document.getElementById('t-activo').checked
    };

    try {
        if (id) {
            await api.put(`/api/tratamientos/${id}`, datos);
        } else {
            await api.post('/api/tratamientos', datos);
        }
        document.getElementById('modal-tratamiento').classList.remove('abierto');
        await cargarTratamientos();
        await cargarMapeo();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

async function alternarActivoTratamiento(id, nuevoEstado) {
    const tratamiento = tratamientosActuales.find((t) => t.id === id);
    if (!tratamiento) return;
    try {
        await api.put(`/api/tratamientos/${id}`, { ...tratamiento, activo: !!nuevoEstado });
        await cargarTratamientos();
    } catch (error) {
        document.getElementById('mensaje-tratamientos').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

// -----------------------------------------------------------------
// Mapeo hallazgo -> tratamiento sugerido
// -----------------------------------------------------------------
async function cargarMapeo() {
    const contenedor = document.getElementById('contenedor-mapeo-hallazgos');
    try {
        mapeoActual = await api.get('/api/tratamientos/mapeo');
        const catalogo = await api.get('/api/tratamientos?activo=1');
        const opciones = '<option value="">Sin asignar</option>' +
            catalogo.map((t) => `<option value="${t.id}">${t.nombre} — $${Number(t.precio).toFixed(2)}</option>`).join('');

        contenedor.innerHTML = mapeoActual.map((m) => {
            const esCaries = m.hallazgo_codigo === 'caries';
            return `
                <div class="tarjeta" style="margin-bottom:12px;">
                    <h4 class="mb-0">${ETIQUETAS_HALLAZGO_MAPEO[m.hallazgo_codigo]}</h4>
                    <div class="form-grid" style="margin-top:10px;">
                        <div class="campo">
                            <label>${esCaries ? 'Restauración simple (1 superficie)' : 'Tratamiento sugerido'}</label>
                            <select class="selector-mapeo-hallazgo" data-hallazgo="${m.hallazgo_codigo}" data-slot="tratamiento_id">${opciones}</select>
                        </div>
                        ${esCaries ? `
                            <div class="campo">
                                <label>Restauración compuesta (2 superficies)</label>
                                <select class="selector-mapeo-hallazgo" data-hallazgo="${m.hallazgo_codigo}" data-slot="tratamiento_id_2_superficies">${opciones}</select>
                            </div>
                            <div class="campo">
                                <label>Restauración compleja (3+ superficies)</label>
                                <select class="selector-mapeo-hallazgo" data-hallazgo="${m.hallazgo_codigo}" data-slot="tratamiento_id_3_superficies">${opciones}</select>
                            </div>
                        ` : ''}
                    </div>
                    <button type="button" class="btn btn-secundario btn-sm" style="margin-top:8px;" onclick="guardarMapeoHallazgo('${m.hallazgo_codigo}')">Guardar</button>
                </div>
            `;
        }).join('');

        mapeoActual.forEach((m) => {
            const setValor = (slot, valor) => {
                const select = contenedor.querySelector(`select[data-hallazgo="${m.hallazgo_codigo}"][data-slot="${slot}"]`);
                if (select && valor) select.value = valor;
            };
            setValor('tratamiento_id', m.tratamiento ? m.tratamiento.id : '');
            setValor('tratamiento_id_2_superficies', m.tratamiento_2_superficies ? m.tratamiento_2_superficies.id : '');
            setValor('tratamiento_id_3_superficies', m.tratamiento_3_superficies ? m.tratamiento_3_superficies.id : '');
        });
    } catch (error) {
        contenedor.innerHTML = `<p class="texto-secundario">Error al cargar el mapeo: ${error.message}</p>`;
    }
}

async function guardarMapeoHallazgo(hallazgoCodigo) {
    const obtener = (slot) => {
        const select = document.querySelector(`select[data-hallazgo="${hallazgoCodigo}"][data-slot="${slot}"]`);
        return select && select.value ? Number(select.value) : null;
    };
    try {
        await api.put(`/api/tratamientos/mapeo/${hallazgoCodigo}`, {
            tratamiento_id: obtener('tratamiento_id'),
            tratamiento_id_2_superficies: obtener('tratamiento_id_2_superficies'),
            tratamiento_id_3_superficies: obtener('tratamiento_id_3_superficies')
        });
        document.getElementById('mensaje-tratamientos').innerHTML = '<div class="alerta alerta--exito">Mapeo guardado.</div>';
        setTimeout(() => { document.getElementById('mensaje-tratamientos').innerHTML = ''; }, 2500);
    } catch (error) {
        document.getElementById('mensaje-tratamientos').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

// -----------------------------------------------------------------
// Importador desde Excel/CSV (mismo patron que public/js/importador.js)
// -----------------------------------------------------------------
async function subirArchivoTratamiento() {
    const campoArchivo = document.getElementById('campo-archivo-tratamiento');
    const mensajeDiv = document.getElementById('mensaje-tratamientos');
    mensajeDiv.innerHTML = '';

    if (!campoArchivo.files[0]) {
        mensajeDiv.innerHTML = '<div class="alerta alerta--error">Seleccione un archivo primero</div>';
        return;
    }

    const formData = new FormData();
    formData.append('archivo', campoArchivo.files[0]);

    try {
        datosSubidaTratamiento = await api.post('/api/tratamientos/importar/subir', formData);
        mostrarVistaPreviaTratamiento();
    } catch (error) {
        mensajeDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

function adivinarCampoTratamiento(nombreColumna) {
    const normalizado = nombreColumna.trim().toLowerCase();
    const coincidencias = {
        nombre: 'nombre', tratamiento: 'nombre', descripcion: 'nombre',
        codigo: 'codigo', 'código': 'codigo',
        categoria: 'categoria', 'categoría': 'categoria',
        precio: 'precio', valor: 'precio', costo: 'precio',
        notas: 'notas', observaciones: 'notas'
    };
    return coincidencias[normalizado] || null;
}

function mostrarVistaPreviaTratamiento() {
    document.getElementById('paso-mapeo-tratamiento').classList.remove('oculto');
    document.getElementById('info-filas-tratamiento').textContent =
        `Se encontraron ${datosSubidaTratamiento.totalFilas} registros. Mostrando las primeras ${datosSubidaTratamiento.vistaPrevia.length} filas.`;

    document.getElementById('fila-encabezados-previa-tratamiento').innerHTML =
        datosSubidaTratamiento.columnas.map((c) => `<th>${c}</th>`).join('');

    document.getElementById('cuerpo-tabla-previa-tratamiento').innerHTML = datosSubidaTratamiento.vistaPrevia.map((fila) => `
        <tr>${datosSubidaTratamiento.columnas.map((c) => `<td>${fila[c] ?? ''}</td>`).join('')}</tr>
    `).join('');

    const opcionesCampos = camposTratamiento.map((c) =>
        `<option value="${c.valor}">${c.etiqueta}${c.obligatorio ? ' *' : ''}</option>`
    ).join('');

    document.getElementById('contenedor-mapeo-tratamiento').innerHTML = datosSubidaTratamiento.columnas.map((columna) => `
        <div class="campo">
            <label>Columna: "${columna}"</label>
            <select class="selector-mapeo-tratamiento" data-columna="${columna}">
                <option value="">No importar</option>
                ${opcionesCampos}
            </select>
        </div>
    `).join('');

    document.querySelectorAll('.selector-mapeo-tratamiento').forEach((select) => {
        const coincidencia = adivinarCampoTratamiento(select.dataset.columna);
        if (coincidencia) select.value = coincidencia;
    });

    document.getElementById('paso-subir-tratamiento').classList.add('oculto');
}

async function confirmarImportacionTratamiento() {
    const mapeo = {};
    document.querySelectorAll('.selector-mapeo-tratamiento').forEach((select) => {
        if (select.value) mapeo[select.dataset.columna] = select.value;
    });

    const mensajeDiv = document.getElementById('mensaje-tratamientos');
    mensajeDiv.innerHTML = '';

    if (!Object.values(mapeo).includes('nombre') || !Object.values(mapeo).includes('precio')) {
        mensajeDiv.innerHTML = '<div class="alerta alerta--error">Debe asignar las columnas de Nombre y Precio</div>';
        return;
    }

    const boton = document.getElementById('btn-confirmar-importacion-tratamiento');
    boton.disabled = true;
    boton.textContent = 'Importando...';

    try {
        const resultado = await api.post('/api/tratamientos/importar/confirmar', { token: datosSubidaTratamiento.token, mapeo });
        mostrarReporteTratamiento(resultado);
    } catch (error) {
        mensajeDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    } finally {
        boton.disabled = false;
        boton.textContent = 'Importar tratamientos';
    }
}

function mostrarReporteTratamiento(resultado) {
    document.getElementById('paso-mapeo-tratamiento').classList.add('oculto');
    document.getElementById('paso-reporte-tratamiento').classList.remove('oculto');

    let html = `
        <div class="alerta alerta--exito">
            ${resultado.importados} tratamientos importados correctamente. ${resultado.omitidosCount} omitidos.
        </div>
    `;
    if (resultado.omitidos.length > 0) {
        html += `
            <h3>Registros omitidos</h3>
            <div class="tabla-envoltorio">
                <table>
                    <thead><tr><th>Fila del archivo</th><th>Motivo</th></tr></thead>
                    <tbody>${resultado.omitidos.map((o) => `<tr><td>${o.fila}</td><td>${o.motivo}</td></tr>`).join('')}</tbody>
                </table>
            </div>
        `;
    }
    html += `<button class="btn btn-secundario" style="margin-top: 20px;" onclick="reiniciarImportadorTratamiento()">Importar otro archivo</button>`;
    document.getElementById('contenido-reporte-tratamiento').innerHTML = html;

    cargarTratamientos();
    cargarMapeo();
}

function reiniciarImportadorTratamiento() {
    datosSubidaTratamiento = null;
    document.getElementById('campo-archivo-tratamiento').value = '';
    document.getElementById('paso-subir-tratamiento').classList.remove('oculto');
    document.getElementById('paso-mapeo-tratamiento').classList.add('oculto');
    document.getElementById('paso-reporte-tratamiento').classList.add('oculto');
    document.getElementById('mensaje-tratamientos').innerHTML = '';
}
