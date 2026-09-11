// =====================================================================
// Listado de cuotas vencidas (Fase 4B) para la gestion de cobro:
// paciente, telefono / WhatsApp, cuota vencida, dias de atraso y monto
// pendiente. Filtrable por paciente/telefono y por dias de atraso.
// =====================================================================

let filasVencidas = [];

function dineroVencidas(valor) {
    return '$' + Number(valor || 0).toFixed(2);
}

function escaparHtmlVencidas(texto) {
    return String(texto == null ? '' : texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

(async () => {
    const usuario = await inicializarSidebar();
    if (!usuario) return;

    document.getElementById('filtro-vencidas').addEventListener('input', dibujarVencidas);
    document.getElementById('filtro-atraso').addEventListener('change', dibujarVencidas);

    try {
        const datos = await api.get('/api/pagos/vencidas');
        filasVencidas = datos.filas;
        document.getElementById('resumen-vencidas').innerHTML = `
            <div class="caja-totales__bloque caja-totales__bloque--general">
                <div class="caja-totales__etiqueta">Monto vencido</div>
                <div class="caja-totales__valor">${dineroVencidas(datos.monto)}</div>
                <div class="caja-totales__nota">Saldo impago de cuotas ya vencidas</div>
            </div>
            <div class="caja-totales__bloque">
                <div class="caja-totales__etiqueta">Cuotas vencidas</div>
                <div class="caja-totales__valor">${datos.filas.length}</div>
            </div>
            <div class="caja-totales__bloque">
                <div class="caja-totales__etiqueta">Pacientes</div>
                <div class="caja-totales__valor">${datos.pacientes}</div>
            </div>
        `;
        dibujarVencidas();
    } catch (error) {
        document.getElementById('mensaje-vencidas').innerHTML = `<div class="alerta alerta--error">${error.message}</div>`;
    }
})();

function enlaceWhatsApp(numero) {
    const digitos = String(numero || '').replace(/\D/g, '');
    if (!digitos) return '';
    // Ecuador: 09xxxxxxxx -> +5939xxxxxxxx
    const internacional = digitos.startsWith('593') ? digitos : (digitos.startsWith('0') ? '593' + digitos.slice(1) : digitos);
    return `https://wa.me/${internacional}`;
}

function dibujarVencidas() {
    const cuerpo = document.getElementById('cuerpo-tabla-vencidas');
    const texto = document.getElementById('filtro-vencidas').value.trim().toLowerCase();
    const minimoAtraso = Number(document.getElementById('filtro-atraso').value) || 0;

    const filtradas = filasVencidas.filter((f) => {
        if (f.dias_atraso < minimoAtraso) return false;
        if (!texto) return true;
        return `${f.paciente_nombre} ${f.telefono || ''} ${f.whatsapp || ''}`.toLowerCase().includes(texto);
    });

    if (filtradas.length === 0) {
        cuerpo.innerHTML = `<tr><td colspan="8" class="tabla-vacia">${filasVencidas.length === 0 ? 'No hay cuotas vencidas. ¡Todo al día!' : 'Ninguna cuota coincide con el filtro.'}</td></tr>`;
        return;
    }

    cuerpo.innerHTML = filtradas.map((f) => {
        const wa = enlaceWhatsApp(f.whatsapp || f.telefono);
        return `
            <tr>
                <td><a href="/paciente.html?id=${f.paciente_id}">${escaparHtmlVencidas(f.paciente_nombre)}</a></td>
                <td class="contacto-cobro">
                    ${f.telefono ? `<div>Tel. ${escaparHtmlVencidas(f.telefono)}</div>` : ''}
                    ${f.whatsapp ? `<div>WhatsApp ${escaparHtmlVencidas(f.whatsapp)}</div>` : ''}
                    ${wa ? `<a href="${wa}" target="_blank" rel="noopener">Abrir WhatsApp &rarr;</a>` : ''}
                    ${!f.telefono && !f.whatsapp ? '<span class="texto-secundario">Sin teléfono registrado</span>' : ''}
                </td>
                <td>${escaparHtmlVencidas(f.plan_pago_descripcion)}</td>
                <td>${escaparHtmlVencidas(f.cuota)}${f.estado === 'parcial' ? ` <span class="insignia insignia--dorado">Parcial</span>` : ''}</td>
                <td>${formatearFecha(f.fecha_esperada)}</td>
                <td class="${f.dias_atraso > 30 ? 'dias-atraso--alto' : ''}">${f.dias_atraso} día${f.dias_atraso === 1 ? '' : 's'}</td>
                <td><strong>${dineroVencidas(f.saldo)}</strong>${f.pagado > 0 ? `<div class="texto-secundario" style="font-size:0.75rem;">de ${dineroVencidas(f.monto)} (abonado ${dineroVencidas(f.pagado)})</div>` : ''}</td>
                <td><a class="btn-texto" href="/paciente.html?id=${f.paciente_id}#pagos">Ver pagos</a></td>
            </tr>
        `;
    }).join('');
}
