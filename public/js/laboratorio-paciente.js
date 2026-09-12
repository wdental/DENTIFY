// =====================================================================
// Pestaña "Laboratorio" de la ficha del paciente (Fase 4C): los trabajos
// de ESTE paciente, en solo lectura. El alta y la gestion (enviar,
// recibir, instalar, pagar) viven en /laboratorio.html, que es la
// pantalla de trabajo diaria; desde aqui se salta alla con el paciente
// ya seleccionado, igual que "Nueva cita" salta a la agenda.
//
// Comparte pacienteId / pacienteActual, declarados en paciente.js.
// =====================================================================

document.addEventListener('DOMContentLoaded', () => {
    const boton = document.getElementById('btn-nuevo-trabajo-paciente');
    if (!boton) return; // pagina sin ficha de paciente
    boton.addEventListener('click', irANuevoTrabajoLaboratorio);
    cargarTrabajosDelPaciente();
});

function irANuevoTrabajoLaboratorio() {
    const nombre = pacienteActual ? `${pacienteActual.apellidos} ${pacienteActual.nombres}` : '';
    window.location.href = `/laboratorio.html?paciente_id=${pacienteId}&paciente_nombre=${encodeURIComponent(nombre)}&nuevo=1`;
}

async function cargarTrabajosDelPaciente() {
    const contenedor = document.getElementById('lista-trabajos-paciente');
    if (!contenedor) return;

    try {
        const trabajos = await api.get(`/api/laboratorio/trabajos?paciente_id=${pacienteId}`);
        if (trabajos.length === 0) {
            contenedor.innerHTML = '<p class="texto-secundario mb-0">Este paciente no tiene trabajos de laboratorio registrados.</p>';
            return;
        }

        contenedor.innerHTML = `
            <div class="tabla-envoltorio"><table>
                <thead><tr><th>N° orden</th><th>Trabajo</th><th>Laboratorio</th><th>Estado</th><th>Fechas</th><th></th></tr></thead>
                <tbody>${trabajos.map(filaTrabajoPaciente).join('')}</tbody>
            </table></div>
            <p class="texto-secundario" style="margin-top:10px;">Para enviar, recibir, instalar o pagar un trabajo, use la pantalla <a href="/laboratorio.html">Laboratorio</a>.</p>`;
    } catch (error) {
        contenedor.innerHTML = `<p class="texto-secundario mb-0">Error al cargar: ${error.message}</p>`;
    }
}

function filaTrabajoPaciente(t) {
    const claseInsignia = t.estado === 'instalado' ? 'insignia--verde'
        : t.estado === 'cancelado' ? 'insignia--rojo'
        : t.atrasado || t.cita_en_riesgo ? 'insignia--rojo' : 'insignia--dorado';

    const fechas = [
        t.fecha_envio ? `Envío: ${formatearFecha(t.fecha_envio)}` : null,
        t.fecha_estimada ? `Prometido: ${formatearFecha(t.fecha_estimada)}` : null,
        t.fecha_recepcion ? `Recibido: ${formatearFecha(t.fecha_recepcion)}` : null,
        t.fecha_instalacion ? `Instalado: ${formatearFecha(t.fecha_instalacion)}` : null
    ].filter(Boolean).join('<br>') || '—';

    const alerta = t.atrasado
        ? '<div class="trabajo-alerta">Atrasado: pasó la fecha prometida</div>'
        : t.cita_en_riesgo
            ? `<div class="trabajo-alerta">Cita el ${formatearFecha(t.cita_fecha)} y no ha llegado</div>`
            : '';

    return `
        <tr class="${t.estado === 'cancelado' ? 'fila-anulada' : ''}">
            <td><strong>${t.numero_orden}</strong>
                ${t.trabajo_padre_numero ? `<div class="texto-secundario">ajuste de ${t.trabajo_padre_numero}</div>` : ''}</td>
            <td>${t.tipo_trabajo}
                ${t.piezas ? `<div class="texto-secundario">Piezas: ${t.piezas}</div>` : ''}</td>
            <td>${t.laboratorio_nombre}</td>
            <td><span class="insignia ${claseInsignia}">${t.estado_etiqueta}</span>${alerta}</td>
            <td class="texto-secundario">${fechas}</td>
            <td><button type="button" class="btn-texto" onclick="window.open('/imprimir-orden-laboratorio.html?id=${t.id}', '_blank')">Imprimir orden</button></td>
        </tr>
    `;
}
