// =====================================================================
// Dialogos de confirmacion y aviso propios de Dentify.
//
// Reemplazan a confirm()/alert() del navegador, que aparecen pegados
// arriba de la ventana (lejos de donde el usuario esta mirando), no se
// pueden traducir y siempre ofrecen "OK / Cancel" — dos etiquetas que no
// dicen que va a pasar. Estos se muestran centrados, con la tipografia y
// los colores de la clinica, y cada boton se nombra segun la accion
// ("Eliminar cita", "Guardar versión", "Seguir editando"...), de modo que
// se pueda decidir leyendo solo los botones.
//
// Uso:
//   if (await confirmarAccion({
//           titulo: 'Eliminar cita',
//           mensaje: '...',
//           confirmar: 'Eliminar cita',
//           cancelar: 'Conservar',
//           peligro: true })) { ... }
//
//   await avisar({ titulo: '...', mensaje: '...' });        // un solo boton
//   await avisar('mensaje corto');                          // atajo
//
// Se carga en todas las pantallas (es un <script> mas, sin dependencias).
// =====================================================================

const ID_DIALOGO = 'dialogo-dentify';

// Un dialogo a la vez: si llega otro mientras hay uno abierto, espera su
// turno en vez de pisarlo (pasa, por ejemplo, con un aviso disparado
// justo despues de una confirmacion).
let colaDialogos = Promise.resolve();

function escaparTextoDialogo(texto) {
    return String(texto == null ? '' : texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Los mensajes se escriben con saltos de linea; cada bloque separado por
// una linea en blanco es un parrafo, y un salto simple es un <br>.
function mensajeDialogoHtml(mensaje) {
    return String(mensaje || '')
        .split(/\n{2,}/)
        .map((parrafo) => `<p>${escaparTextoDialogo(parrafo).replace(/\n/g, '<br>')}</p>`)
        .join('');
}

function asegurarDialogoEnDom() {
    let fondo = document.getElementById(ID_DIALOGO);
    if (fondo) return fondo;

    fondo = document.createElement('div');
    fondo.className = 'modal-fondo dialogo-fondo';
    fondo.id = ID_DIALOGO;
    fondo.innerHTML = `
        <div class="modal dialogo" role="dialog" aria-modal="true" aria-labelledby="dialogo-dentify-titulo">
            <h2 id="dialogo-dentify-titulo" class="dialogo__titulo"></h2>
            <div class="dialogo__mensaje" id="dialogo-dentify-mensaje"></div>
            <div class="dialogo__botones">
                <button type="button" class="btn btn-secundario" id="dialogo-dentify-cancelar"></button>
                <button type="button" class="btn btn-primario" id="dialogo-dentify-confirmar"></button>
            </div>
        </div>
    `;
    document.body.appendChild(fondo);
    return fondo;
}

function abrirDialogo(opciones) {
    return new Promise((resolver) => {
        const fondo = asegurarDialogoEnDom();
        const botonConfirmar = document.getElementById('dialogo-dentify-confirmar');
        const botonCancelar = document.getElementById('dialogo-dentify-cancelar');

        document.getElementById('dialogo-dentify-titulo').textContent = opciones.titulo || '';
        document.getElementById('dialogo-dentify-titulo').classList.toggle('oculto', !opciones.titulo);
        document.getElementById('dialogo-dentify-mensaje').innerHTML = mensajeDialogoHtml(opciones.mensaje);

        botonConfirmar.textContent = opciones.confirmar || 'Continuar';
        botonConfirmar.className = 'btn ' + (opciones.peligro ? 'btn-peligro' : 'btn-primario');
        botonCancelar.textContent = opciones.cancelar || 'Cancelar';
        botonCancelar.classList.toggle('oculto', !opciones.cancelar);

        let cerrado = false;
        const cerrar = (respuesta) => {
            if (cerrado) return;
            cerrado = true;
            fondo.classList.remove('abierto');
            botonConfirmar.onclick = null;
            botonCancelar.onclick = null;
            fondo.onclick = null;
            document.removeEventListener('keydown', alTeclear, true);
            resolver(respuesta);
        };

        // Escape cancela; Enter confirma (salvo en una accion destructiva,
        // donde se exige el clic para no borrar nada por inercia).
        const alTeclear = (evento) => {
            if (evento.key === 'Escape') { evento.preventDefault(); cerrar(false); }
            else if (evento.key === 'Enter' && !opciones.peligro) { evento.preventDefault(); cerrar(true); }
        };

        botonConfirmar.onclick = () => cerrar(true);
        botonCancelar.onclick = () => cerrar(false);
        // Clic fuera del cuadro = cancelar (igual que el boton de cancelar).
        fondo.onclick = (evento) => { if (evento.target === fondo) cerrar(false); };
        document.addEventListener('keydown', alTeclear, true);

        fondo.classList.add('abierto');
        // En una accion destructiva el foco arranca en "cancelar": si el
        // usuario pulsa Enter sin leer, no borra nada.
        (opciones.peligro && opciones.cancelar ? botonCancelar : botonConfirmar).focus();
    });
}

// Pregunta de dos salidas. Devuelve true si el usuario confirmo.
function confirmarAccion(opciones) {
    const config = typeof opciones === 'string' ? { mensaje: opciones } : (opciones || {});
    const siguiente = colaDialogos.then(() => abrirDialogo({
        titulo: config.titulo || '¿Confirmar?',
        mensaje: config.mensaje,
        confirmar: config.confirmar || 'Continuar',
        cancelar: config.cancelar || 'Cancelar',
        peligro: !!config.peligro
    }));
    colaDialogos = siguiente.catch(() => {});
    return siguiente;
}

// Aviso de un solo botón (reemplaza a alert()).
function avisar(opciones) {
    const config = typeof opciones === 'string' ? { mensaje: opciones } : (opciones || {});
    const siguiente = colaDialogos.then(() => abrirDialogo({
        titulo: config.titulo || 'Aviso',
        mensaje: config.mensaje,
        confirmar: config.boton || 'Entendido',
        cancelar: null,
        peligro: false
    })).then(() => undefined);
    colaDialogos = siguiente.catch(() => {});
    return siguiente;
}
