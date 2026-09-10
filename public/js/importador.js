// =====================================================================
// Logica del importador de pacientes (Excel / CSV)
// =====================================================================

let camposDentify = [];
let datosSubida = null; // { token, columnas, vistaPrevia, totalFilas }

(async () => {
    const usuario = await inicializarSidebar();
    if (!usuario) return;

    if (usuario.rol !== 'admin') {
        document.querySelector('.contenido').innerHTML = '<div class="alerta alerta--error">Solo un administrador puede importar pacientes.</div>';
        return;
    }

    camposDentify = await api.get('/api/importador/campos');

    document.getElementById('btn-subir-archivo').addEventListener('click', subirArchivo);
    document.getElementById('btn-cancelar-importacion').addEventListener('click', reiniciarImportador);
    document.getElementById('btn-confirmar-importacion').addEventListener('click', confirmarImportacion);
})();

async function subirArchivo() {
    const campoArchivo = document.getElementById('campo-archivo-importar');
    const mensajeDiv = document.getElementById('mensaje-importador');
    mensajeDiv.innerHTML = '';

    if (!campoArchivo.files[0]) {
        mensajeDiv.innerHTML = '<div class="alerta alerta--error">Seleccione un archivo primero</div>';
        return;
    }

    const formData = new FormData();
    formData.append('archivo', campoArchivo.files[0]);

    try {
        datosSubida = await api.post('/api/importador/subir', formData);
        mostrarVistaPrevia();
    } catch (error) {
        mensajeDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

function mostrarVistaPrevia() {
    document.getElementById('paso-mapeo').classList.remove('oculto');
    document.getElementById('info-filas').textContent =
        `Se encontraron ${datosSubida.totalFilas} registros. Mostrando las primeras ${datosSubida.vistaPrevia.length} filas.`;

    // Encabezados de la tabla de vista previa
    document.getElementById('fila-encabezados-previa').innerHTML =
        datosSubida.columnas.map((c) => `<th>${c}</th>`).join('');

    // Filas de vista previa
    document.getElementById('cuerpo-tabla-previa').innerHTML = datosSubida.vistaPrevia.map((fila) => `
        <tr>${datosSubida.columnas.map((c) => `<td>${fila[c] ?? ''}</td>`).join('')}</tr>
    `).join('');

    // Selectores de mapeo, uno por cada columna del archivo
    const opcionesCampos = camposDentify.map((c) =>
        `<option value="${c.valor}">${c.etiqueta}${c.obligatorio ? ' *' : ''}</option>`
    ).join('');

    document.getElementById('contenedor-mapeo').innerHTML = datosSubida.columnas.map((columna, indice) => {
        const coincidenciaAuto = adivinarCampo(columna);
        return `
            <div class="campo">
                <label>Columna: "${columna}"</label>
                <select class="selector-mapeo" data-columna="${columna}">
                    <option value="">No importar</option>
                    ${opcionesCampos}
                </select>
            </div>
        `;
    }).join('');

    // Preseleccionar coincidencias automaticas por nombre de columna
    document.querySelectorAll('.selector-mapeo').forEach((select) => {
        const columna = select.dataset.columna;
        const coincidencia = adivinarCampo(columna);
        if (coincidencia) select.value = coincidencia;
    });

    document.getElementById('paso-subir').classList.add('oculto');
}

function adivinarCampo(nombreColumna) {
    const normalizado = nombreColumna.trim().toLowerCase();
    const coincidencias = {
        nombres: 'nombres', nombre: 'nombres',
        apellidos: 'apellidos', apellido: 'apellidos',
        cedula: 'cedula', 'c.i.': 'cedula', ci: 'cedula',
        'fecha de nacimiento': 'fecha_nacimiento', nacimiento: 'fecha_nacimiento',
        sexo: 'sexo', genero: 'sexo',
        telefono: 'telefono', celular: 'telefono',
        whatsapp: 'whatsapp',
        email: 'email', correo: 'email', 'correo electronico': 'email',
        direccion: 'direccion',
        origen: 'origen',
        alergias: 'alergias',
        'antecedentes medicos': 'antecedentes_medicos',
        'antecedentes odontologicos': 'antecedentes_odontologicos',
        medicamentos: 'medicamentos_actuales',
        notas: 'notas', observaciones: 'notas'
    };
    return coincidencias[normalizado] || null;
}

async function confirmarImportacion() {
    const mapeo = {};
    document.querySelectorAll('.selector-mapeo').forEach((select) => {
        if (select.value) mapeo[select.dataset.columna] = select.value;
    });

    const mensajeDiv = document.getElementById('mensaje-importador');
    mensajeDiv.innerHTML = '';

    if (!mapeo || !Object.values(mapeo).includes('nombres') || !Object.values(mapeo).includes('apellidos')) {
        mensajeDiv.innerHTML = '<div class="alerta alerta--error">Debe asignar las columnas de Nombres y Apellidos</div>';
        return;
    }

    const boton = document.getElementById('btn-confirmar-importacion');
    boton.disabled = true;
    boton.textContent = 'Importando...';

    try {
        const resultado = await api.post('/api/importador/confirmar', { token: datosSubida.token, mapeo });
        mostrarReporte(resultado);
    } catch (error) {
        mensajeDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    } finally {
        boton.disabled = false;
        boton.textContent = 'Importar pacientes';
    }
}

function mostrarReporte(resultado) {
    document.getElementById('paso-mapeo').classList.add('oculto');
    document.getElementById('paso-reporte').classList.remove('oculto');

    let html = `
        <div class="alerta alerta--exito">
            ${resultado.importados} pacientes importados correctamente. ${resultado.omitidosCount} omitidos.
        </div>
    `;

    if (resultado.omitidos.length > 0) {
        html += `
            <h3>Registros omitidos</h3>
            <div class="tabla-envoltorio">
                <table>
                    <thead><tr><th>Fila del archivo</th><th>Motivo</th></tr></thead>
                    <tbody>
                        ${resultado.omitidos.map((o) => `<tr><td>${o.fila}</td><td>${o.motivo}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    html += `<button class="btn btn-primario" style="margin-top: 20px;" onclick="window.location.href='/pacientes.html'">Ver listado de pacientes</button>
              <button class="btn btn-secundario" style="margin-top: 20px; margin-left: 10px;" onclick="reiniciarImportador()">Importar otro archivo</button>`;

    document.getElementById('contenido-reporte').innerHTML = html;
}

function reiniciarImportador() {
    datosSubida = null;
    document.getElementById('campo-archivo-importar').value = '';
    document.getElementById('paso-subir').classList.remove('oculto');
    document.getElementById('paso-mapeo').classList.add('oculto');
    document.getElementById('paso-reporte').classList.add('oculto');
    document.getElementById('mensaje-importador').innerHTML = '';
}
