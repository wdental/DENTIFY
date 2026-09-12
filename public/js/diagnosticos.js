// =====================================================================
// Diagnostico CIE-10 (Fase 3B, seccion N del F033). Hasta 6 diagnosticos
// por ficha; cada uno inicia PRE (presuntivo) y puede promoverse a DEF
// (definitivo). Comparte pacienteActual / pacienteId / usuarioActual,
// declarados en paciente.js.
// =====================================================================

let diagnosticosActuales = [];
let doctoresParaDiagnostico = [];
let temporizadorBusquedaCie10 = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('dx-buscar-cie10').addEventListener('input', () => {
        clearTimeout(temporizadorBusquedaCie10);
        temporizadorBusquedaCie10 = setTimeout(buscarCie10EnVivo, 200);
    });
    document.getElementById('dx-buscar-cie10').addEventListener('focus', buscarCie10EnVivo);
    document.addEventListener('click', (evento) => {
        if (!evento.target.closest('.dx-buscador-envoltura')) {
            document.getElementById('dx-resultados-cie10').classList.add('oculto');
        }
    });
    document.getElementById('btn-agregar-diagnostico').addEventListener('click', agregarDiagnostico);

    cargarDoctoresParaDiagnostico();
    cargarDiagnosticos();
});

async function cargarDoctoresParaDiagnostico() {
    try {
        doctoresParaDiagnostico = await api.get('/api/doctores');
        document.getElementById('dx-doctor').innerHTML = '<option value="">Sin especificar</option>' +
            doctoresParaDiagnostico.map((d) => `<option value="${d.id}">${d.nombre_completo}</option>`).join('');
        // Si la cuenta con sesion iniciada esta vinculada a un doctor, se
        // precarga como valor por defecto (el usuario puede cambiarlo igual).
        if (usuarioActual && usuarioActual.doctor_id && doctoresParaDiagnostico.some((d) => d.id === usuarioActual.doctor_id)) {
            document.getElementById('dx-doctor').value = usuarioActual.doctor_id;
        }
    } catch (e) {
        doctoresParaDiagnostico = [];
    }
}

async function buscarCie10EnVivo() {
    const q = document.getElementById('dx-buscar-cie10').value.trim();
    const contenedor = document.getElementById('dx-resultados-cie10');
    if (!q) { contenedor.classList.add('oculto'); return; }
    try {
        const resultados = await api.get(`/api/cie10?q=${encodeURIComponent(q)}`);
        if (resultados.length === 0) {
            contenedor.innerHTML = '<div class="dx-resultado dx-resultado--vacio">Sin coincidencias</div>';
        } else {
            contenedor.innerHTML = resultados.map((r) => `
                <button type="button" class="dx-resultado" data-codigo="${r.codigo}" data-descripcion="${r.descripcion.replace(/"/g, '&quot;')}">
                    <strong>${r.codigo}</strong> — ${r.descripcion}
                </button>
            `).join('');
            contenedor.querySelectorAll('.dx-resultado[data-codigo]').forEach((boton) => {
                boton.addEventListener('click', () => seleccionarCie10(boton.dataset.codigo, boton.dataset.descripcion));
            });
        }
        contenedor.classList.remove('oculto');
    } catch (error) {
        contenedor.classList.add('oculto');
    }
}

function seleccionarCie10(codigo, descripcion) {
    document.getElementById('dx-codigo-cie10').value = codigo;
    document.getElementById('dx-descripcion').value = `${codigo} — ${descripcion}`;
    document.getElementById('dx-buscar-cie10').value = '';
    document.getElementById('dx-resultados-cie10').classList.add('oculto');
}

async function cargarDiagnosticos() {
    const contenedor = document.getElementById('lista-diagnosticos');
    try {
        diagnosticosActuales = await api.get(`/api/diagnosticos/${pacienteId}`);
        marcarCompletitud('diagnosticos', diagnosticosActuales.length > 0);
        actualizarVisibilidadFormularioDiagnostico();

        if (diagnosticosActuales.length === 0) {
            contenedor.innerHTML = '<p class="texto-secundario">Aún no hay diagnósticos registrados.</p>';
            return;
        }
        contenedor.innerHTML = diagnosticosActuales.map(filaDiagnostico).join('');
    } catch (error) {
        contenedor.innerHTML = `<p class="texto-secundario">Error al cargar diagnósticos: ${error.message}</p>`;
    }
}

function filaDiagnostico(dx) {
    return `
        <div class="diagnostico-item">
            <div class="flex-entre">
                <span><strong>${dx.codigo_cie10}</strong> — ${dx.descripcion}</span>
                <span class="insignia ${dx.tipo === 'DEF' ? 'insignia--verde' : 'insignia--dorado'}">${dx.tipo === 'DEF' ? 'Definitivo' : 'Presuntivo'}</span>
            </div>
            <p class="texto-secundario mb-0">
                ${dx.doctor_nombre || 'Sin doctor'} · PRE: ${formatearFecha((dx.fecha_pre || '').slice(0, 10))}
                ${dx.fecha_def ? ` · DEF: ${formatearFecha(dx.fecha_def.slice(0, 10))}` : ''}
            </p>
            <div style="margin-top:6px; display:flex; gap:10px;">
                ${dx.tipo === 'PRE' ? `<button type="button" class="btn-texto" onclick="promoverDiagnostico(${dx.id})">Promover a definitivo (DEF)</button>` : ''}
                <button type="button" class="btn-texto" style="color:var(--rojo-alerta);" onclick="eliminarDiagnostico(${dx.id})">Quitar</button>
            </div>
        </div>
    `;
}

function actualizarVisibilidadFormularioDiagnostico() {
    const boton = document.getElementById('btn-agregar-diagnostico');
    const limite = diagnosticosActuales.length >= 6;
    boton.disabled = limite;
    boton.textContent = limite ? 'Máximo de 6 diagnósticos alcanzado' : 'Agregar diagnóstico';
}

async function agregarDiagnostico() {
    const errorDiv = document.getElementById('error-diagnostico');
    errorDiv.innerHTML = '';

    const codigo = document.getElementById('dx-codigo-cie10').value;
    const descripcionCompleta = document.getElementById('dx-descripcion').value;
    if (!codigo) {
        errorDiv.innerHTML = '<div class="alerta alerta--error">Busque y seleccione un código CIE-10 primero</div>';
        return;
    }

    const datos = {
        descripcion: descripcionCompleta,
        codigo_cie10: codigo,
        tipo: document.getElementById('dx-tipo').value,
        doctor_id: document.getElementById('dx-doctor').value || null
    };

    try {
        await api.post(`/api/diagnosticos/${pacienteId}`, datos);
        document.getElementById('dx-codigo-cie10').value = '';
        document.getElementById('dx-descripcion').value = '';
        document.getElementById('dx-tipo').value = 'PRE';
        await cargarDiagnosticos();
    } catch (error) {
        errorDiv.innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
}

async function promoverDiagnostico(id) {
    const confirmado = await confirmarAccion({
        titulo: 'Promover a definitivo',
        mensaje: 'Este diagnóstico pasará de presuntivo (PRE) a definitivo (DEF). Queda registrada la fecha de cada estado.',
        confirmar: 'Promover a definitivo',
        cancelar: 'Dejar como presuntivo'
    });
    if (!confirmado) return;
    try {
        await api.put(`/api/diagnosticos/${id}/promover`, {});
        await cargarDiagnosticos();
    } catch (error) {
        await avisar({ titulo: 'No se pudo promover', mensaje: error.message });
    }
}

async function eliminarDiagnostico(id) {
    const confirmado = await confirmarAccion({
        titulo: 'Quitar diagnóstico',
        mensaje: 'El diagnóstico se quita de la sección N de la ficha clínica.',
        confirmar: 'Quitar diagnóstico',
        cancelar: 'Conservar',
        peligro: true
    });
    if (!confirmado) return;
    try {
        await api.del(`/api/diagnosticos/${id}`);
        await cargarDiagnosticos();
    } catch (error) {
        await avisar({ titulo: 'No se pudo quitar', mensaje: error.message });
    }
}
