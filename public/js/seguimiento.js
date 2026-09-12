// =====================================================================
// Modulo de seguimiento: "Evolucion de tratamiento" (ajuste posterior a
// la Fase 4A, a pedido de uso real). Antes, la unica forma de que una
// evolucion actualizara el odontograma era a traves de un plan de
// tratamiento aceptado (ver manejarCierrePlanTrasEvolucion en
// planes-tratamiento.js) - si el paciente no tenia plan, o el plan seguia
// en borrador, el odontograma se quedaba sin cambios sin que nadie lo
// notara, dando la sensacion de que "un hallazgo vuelve a estar en rojo"
// cuando en realidad nunca se habia actualizado.
//
// Este modulo ofrece un flujo guiado, independiente de cualquier plan:
// 1. El doctor pinta en el ODONTOGRAMA REAL (mismo editor de siempre, con
//    todas las piezas y todos los hallazgos disponibles - cubre tambien
//    un hallazgo nuevo que no estaba en el odontograma inicial, por
//    ejemplo un accidente/pieza rota) lo que se atendio hoy.
// 2. Al guardar esa version, se abre el mismo modal de "Nueva evolucion"
//    de siempre, con las piezas modificadas ya completadas (bloqueadas)
//    y vinculada a esa version de odontograma (evoluciones.odontograma_id).
// 3. El historial de esta pestaña muestra, para cada evolucion, si quedo
//    o no vinculada a un cambio de odontograma - sin ambiguedad.
//
// Comparte pacienteId/pacienteActual (paciente.js), odontogramaActivo/
// piezasVisibles/modoEdicion (odontograma.js) y abrirModalEvolucion/
// guardarEvolucion (evoluciones.js).
// =====================================================================

let modoSeguimientoOdontograma = false;
let piezasVisiblesAntesDeSeguimiento = [];
let odontogramaIdPendienteEvolucion = null;

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-nueva-evolucion-seguimiento');
    if (!btn) return; // pagina sin ficha de paciente
    btn.addEventListener('click', iniciarFlujoSeguimiento);
    cargarSeguimientoTab();
});

// -----------------------------------------------------------------
// Historial: misma informacion que la seccion P, pero con una etiqueta
// explicita de si esa sesion quedo vinculada a un cambio de odontograma.
// -----------------------------------------------------------------
async function cargarSeguimientoTab() {
    const contenedor = document.getElementById('lista-seguimiento-evoluciones');
    if (!contenedor) return;
    try {
        const evoluciones = await api.get(`/api/evoluciones/${pacienteId}`);
        if (evoluciones.length === 0) {
            contenedor.innerHTML = '<p class="texto-secundario">Aún no hay evoluciones registradas para este paciente.</p>';
            return;
        }
        contenedor.innerHTML = evoluciones.map(filaSeguimientoEvolucion).join('');
    } catch (error) {
        contenedor.innerHTML = `<p class="texto-secundario">Error al cargar: ${error.message}</p>`;
    }
}

function filaSeguimientoEvolucion(ev) {
    const claseTachado = ev.anulada ? 'evolucion-anulada' : '';
    const badgeOdontograma = ev.odontograma_id
        ? `<span class="insignia insignia--verde">✓ Odontograma actualizado</span> <a href="#" onclick="verVersionOdontogramaDesdeSeguimiento(${ev.odontograma_id}); return false;">ver versión →</a>`
        : `<span class="insignia insignia--dorado">— Sin cambios en el odontograma</span>`;

    return `
        <div class="evolucion-sesion ${claseTachado}">
            <div class="flex-entre">
                <h4 class="mb-0">Sesión ${ev.numero_sesion}${ev.es_alta ? ' — ALTA' : ''} · ${formatearFecha(ev.fecha.slice(0, 10))}</h4>
                ${badgeOdontograma}
            </div>
            <p class="texto-secundario mb-0">${ev.doctor_nombre || 'Sin doctor especificado'}</p>
            <p class="mb-0"><strong>Procedimientos:</strong> ${ev.anulada ? '<s>' + ev.procedimientos + '</s> (anulada)' : ev.procedimientos}</p>
            ${ev.piezas_tratadas && ev.piezas_tratadas.length ? `<p class="texto-secundario mb-0">Piezas: ${ev.piezas_tratadas.join(', ')}</p>` : ''}
        </div>
    `;
}

// Salta a Ficha clínica y muestra la version de odontograma vinculada a
// una evolucion (activa o historica, segun corresponda).
function verVersionOdontogramaDesdeSeguimiento(odontogramaId) {
    cambiarPestanaReal('panel-ficha-clinica');
    const esActiva = odontogramaActivo && odontogramaActivo.odontograma && odontogramaActivo.odontograma.id === odontogramaId;
    const selector = document.getElementById('selector-version-odontograma');
    if (esActiva) {
        selector.value = 'activo';
        cambiarVersionOdontograma('activo');
    } else if (selector.querySelector(`option[value="${odontogramaId}"]`)) {
        selector.value = String(odontogramaId);
        cambiarVersionOdontograma(String(odontogramaId));
    } else {
        // La version quedo fuera del selector visible (caso raro); se
        // consulta directamente igual que una version historica cualquiera.
        mostrarVersionHistorica(odontogramaId);
    }
}

// -----------------------------------------------------------------
// Flujo guiado: odontograma primero, evolucion despues
// -----------------------------------------------------------------
async function iniciarFlujoSeguimiento() {
    if (modoEdicion) {
        await avisar({
            titulo: 'Hay una edición del odontograma en curso',
            mensaje: 'Termine de guardarla, o cancélela, antes de registrar una nueva evolución con odontograma.',
            boton: 'Ir al odontograma'
        });
        return;
    }

    piezasVisiblesAntesDeSeguimiento = JSON.parse(JSON.stringify((odontogramaActivo && odontogramaActivo.piezas) || []));
    modoSeguimientoOdontograma = true;

    cambiarPestanaReal('panel-ficha-clinica');
    iniciarNuevaVersionOdontograma('evolucion', true);

    document.getElementById('odontograma-marca-agua-envoltura').innerHTML = `
        <div class="odontograma-marca-agua">
            Registrando una evolución de tratamiento — pinte en el odontograma lo atendido hoy (incluye piezas nuevas, por ejemplo un accidente) y presione "Guardar nueva versión" para continuar con la nota de evolución.
        </div>
    `;
}

// Compara los hallazgos de cada pieza antes/despues (por pieza, sin
// importar el orden de sus filas) y devuelve la lista de piezas donde
// algo cambio - se usa para completar "piezas tratadas" automaticamente.
function calcularPiezasCambiadas(antes, despues) {
    const serializar = (lista) => {
        const mapa = {};
        (lista || []).forEach((p) => {
            if (!mapa[p.pieza]) mapa[p.pieza] = [];
            mapa[p.pieza].push(`${p.superficie || ''}:${p.hallazgo || ''}:${p.color_tipo || ''}:${p.movilidad ?? ''}:${p.recesion ?? ''}`);
        });
        Object.values(mapa).forEach((filas) => filas.sort());
        return mapa;
    };
    const mapaAntes = serializar(antes);
    const mapaDespues = serializar(despues);
    const todasLasPiezas = new Set([...Object.keys(mapaAntes), ...Object.keys(mapaDespues)]);
    return Array.from(todasLasPiezas).filter((pieza) => JSON.stringify(mapaAntes[pieza] || []) !== JSON.stringify(mapaDespues[pieza] || []));
}

// Llamada desde guardarNuevaVersionOdontograma() en odontograma.js cuando
// modoSeguimientoOdontograma esta activo, en vez del guardado normal.
async function guardarOdontogramaConSeguimiento() {
    const confirmado = await confirmarAccion({
        titulo: 'Guardar el odontograma de esta evolución',
        mensaje: 'Se creará una versión nueva del odontograma, que ya no podrá editarse. La versión anterior queda archivada y disponible para consulta.\n\nDespués se abrirá la nota de evolución con las piezas que modificó.',
        confirmar: 'Guardar versión',
        cancelar: 'Seguir editando'
    });
    if (!confirmado) return;

    const esInicial = document.getElementById('odo-tipo-envoltura').classList.contains('oculto');
    const datos = {
        doctor_id: document.getElementById('odo-doctor').value || null,
        observaciones: document.getElementById('odo-observaciones').value.trim() || null,
        piezas: piezasVisibles,
        tipo: esInicial ? 'inicial' : document.getElementById('odo-tipo').value
    };

    const piezasCambiadas = calcularPiezasCambiadas(piezasVisiblesAntesDeSeguimiento, piezasVisibles);

    try {
        const resultado = await api.post(`/api/odontograma/${pacienteId}`, datos);
        modoEdicion = false;
        modoSeguimientoOdontograma = false;
        if (typeof limpiarCambioPendiente === 'function') limpiarCambioPendiente('odontograma');
        await recargarDatosOdontograma();
        construirLayoutOdontograma();
        mostrarVersionActiva();
        if (typeof refrescarCpoTrasNuevaVersionOdontograma === 'function') await refrescarCpoTrasNuevaVersionOdontograma();
        if (typeof actualizarSugerenciasHigiene === 'function') actualizarSugerenciasHigiene();

        abrirModalEvolucionParaSeguimiento(resultado.id, piezasCambiadas);
    } catch (error) {
        await avisar({ titulo: 'No se pudo guardar el odontograma', mensaje: error.message });
    }
}

// Reutiliza el modal de "Nueva evolucion" tal cual (mismos campos, misma
// validacion, mismas firmas), solo precargando y bloqueando las piezas
// tratadas y dejando pendiente el vinculo con el odontograma recien
// guardado para que guardarEvolucion() lo incluya en el POST.
async function abrirModalEvolucionParaSeguimiento(odontogramaId, piezasCambiadas) {
    await abrirModalEvolucion(false);
    odontogramaIdPendienteEvolucion = odontogramaId;

    const campoPiezas = document.getElementById('ev-piezas');
    campoPiezas.value = piezasCambiadas.join(', ');
    campoPiezas.disabled = true;
    // Las fichas de hallazgos pendientes se repintan en modo consulta: aqui
    // las piezas vienen del odontograma recien guardado y no se editan.
    if (typeof renderizarPiezasConHallazgos === 'function') renderizarPiezasConHallazgos();

    const aviso = document.createElement('p');
    aviso.className = 'seccion-clinica__ayuda';
    aviso.id = 'aviso-seguimiento-evolucion';
    aviso.textContent = piezasCambiadas.length > 0
        ? 'Esta evolución quedará vinculada al odontograma que acaba de guardar.'
        : 'No se detectaron piezas modificadas en el odontograma; puede continuar solo con la nota de evolución.';
    campoPiezas.parentElement.appendChild(aviso);
}

// Limpia el vinculo pendiente si el usuario cierra el modal sin guardar
// la evolucion (el odontograma ya quedo guardado igual, por ser inmutable;
// solo se evita que una evolucion futura, sin relacion, quede mal vinculada).
function limpiarSeguimientoSiPendiente() {
    odontogramaIdPendienteEvolucion = null;
    const campoPiezas = document.getElementById('ev-piezas');
    if (campoPiezas) campoPiezas.disabled = false;
    const aviso = document.getElementById('aviso-seguimiento-evolucion');
    if (aviso) aviso.remove();
}

// Si se cancela la edicion del odontograma mientras el flujo de
// seguimiento estaba activo, se aborta limpiamente (nada quedo guardado).
function cancelarSeguimientoSiActivo() {
    if (!modoSeguimientoOdontograma) return;
    modoSeguimientoOdontograma = false;
    piezasVisiblesAntesDeSeguimiento = [];
}
