// =====================================================================
// Campos de fecha en dd/mm/aaaa, sin depender del navegador.
//
// El <input type="date"> nativo se dibuja con el formato del IDIOMA DEL
// NAVEGADOR, no del sitio: con Brave/Chrome en inglés se ve mm/dd/yyyy
// (09/12/2026 para el 12 de septiembre), mientras el resto del sistema
// muestra dd/mm/aaaa. Esa mezcla es la que hacia dudar al registrar.
//
// Solucion: cada <input type="date"> se deja en el DOM como fuente de
// verdad en ISO (YYYY-MM-DD) -asi TODO el codigo que ya lee o escribe
// .value sigue funcionando igual- pero se oculta y en su lugar se dibuja
// un campo de texto en dd/mm/aaaa. El boton de calendario abre el
// selector nativo de siempre.
//
// Dos detalles que hacen que no haya que tocar el resto del sistema:
//   - se intercepta la asignacion de .value sobre el input nativo, para
//     que un `campo.value = hoy` hecho por JS refresque el texto visible;
//   - el `required` se mueve al campo visible, porque el navegador no
//     puede enfocar un campo oculto para pedir que se complete.
// =====================================================================

const MESES_CAMPO_FECHA = 12;

function esFechaIsoValida(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const [anio, mes, dia] = iso.split('-').map(Number);
    if (mes < 1 || mes > MESES_CAMPO_FECHA || dia < 1) return false;
    const d = new Date(anio, mes - 1, dia);
    return d.getFullYear() === anio && d.getMonth() === mes - 1 && d.getDate() === dia;
}

// 'YYYY-MM-DD' -> 'dd/mm/aaaa'
function isoATextoFecha(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const [anio, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${anio}`;
}

// 'dd/mm/aaaa' -> 'YYYY-MM-DD' (o '' si aun no esta completa o no existe)
function textoFechaAIso(texto) {
    const partes = String(texto || '').trim().split('/');
    if (partes.length !== 3) return '';
    const [dia, mes, anio] = partes;
    if (dia.length < 1 || mes.length < 1 || anio.length !== 4) return '';
    const iso = `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    return esFechaIsoValida(iso) ? iso : '';
}

// Va poniendo las barras mientras se escriben los numeros.
function formatearMientrasEscribe(valor) {
    const digitos = String(valor).replace(/\D/g, '').slice(0, 8);
    if (digitos.length <= 2) return digitos;
    if (digitos.length <= 4) return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
    return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
}

function convertirCampoFecha(nativo) {
    if (nativo.dataset.fechaConvertida === '1') return;
    nativo.dataset.fechaConvertida = '1';

    const envoltura = document.createElement('div');
    envoltura.className = 'campo-fecha';

    const visible = document.createElement('input');
    visible.type = 'text';
    visible.className = 'campo-fecha__texto';
    visible.placeholder = 'dd/mm/aaaa';
    visible.inputMode = 'numeric';
    visible.autocomplete = 'off';
    visible.maxLength = 10;
    if (nativo.id) visible.id = nativo.id + '-visible';
    if (nativo.disabled) visible.disabled = true;

    // El navegador no puede pedir que se complete un campo oculto, asi que
    // la obligatoriedad viaja al campo visible.
    if (nativo.required) {
        nativo.required = false;
        visible.required = true;
    }

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'campo-fecha__calendario';
    boton.title = 'Abrir el calendario';
    boton.setAttribute('aria-label', 'Abrir el calendario');
    boton.textContent = '📅';

    nativo.parentNode.insertBefore(envoltura, nativo);
    envoltura.appendChild(nativo);
    envoltura.appendChild(visible);
    envoltura.appendChild(boton);
    nativo.classList.add('campo-fecha__nativo');

    const refrescarVisible = () => { visible.value = isoATextoFecha(nativo.value); };

    // Escribir en el campo visible actualiza el nativo y avisa al resto del
    // sistema con los mismos eventos que disparaba el input de fecha.
    visible.addEventListener('input', () => {
        const cursorAlFinal = visible.selectionStart === visible.value.length;
        visible.value = formatearMientrasEscribe(visible.value);
        if (cursorAlFinal) visible.setSelectionRange(visible.value.length, visible.value.length);

        const iso = textoFechaAIso(visible.value);
        if (iso !== nativo.value) {
            asignarSinRebote(nativo, iso);
            nativo.dispatchEvent(new Event('input', { bubbles: true }));
            nativo.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });

    // Al salir del campo: si quedo a medias o no existe (31/02), se limpia
    // para no dejar una fecha a medio escribir que parezca valida.
    visible.addEventListener('blur', () => {
        const iso = textoFechaAIso(visible.value);
        if (!iso && visible.value.trim() !== '') {
            visible.value = '';
            if (nativo.value) {
                asignarSinRebote(nativo, '');
                nativo.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else {
            refrescarVisible();
        }
    });

    const abrirCalendario = () => {
        if (nativo.disabled) return;
        if (typeof nativo.showPicker === 'function') {
            try { nativo.showPicker(); return; } catch (e) { /* sigue al plan B */ }
        }
        // Plan B (navegador sin showPicker): se muestra el nativo un instante
        // para que el usuario use su propio calendario.
        envoltura.classList.add('campo-fecha--nativo-visible');
        nativo.focus();
    };
    boton.addEventListener('click', abrirCalendario);

    // Elegir en el calendario nativo actualiza el texto visible.
    nativo.addEventListener('change', () => {
        refrescarVisible();
        envoltura.classList.remove('campo-fecha--nativo-visible');
    });
    nativo.addEventListener('blur', () => envoltura.classList.remove('campo-fecha--nativo-visible'));

    // Asignaciones por JS (`campo.value = hoy`) no disparan eventos: se
    // intercepta la propiedad en esta instancia para refrescar el texto.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(nativo, 'value', {
        configurable: true,
        get() { return descriptor.get.call(this); },
        set(nuevo) {
            descriptor.set.call(this, nuevo);
            if (!this.dataset.asignandoInterno) refrescarVisible();
        }
    });

    // form.reset() vuelve los campos a su valor inicial sin avisar.
    const formulario = nativo.closest('form');
    if (formulario) formulario.addEventListener('reset', () => setTimeout(refrescarVisible, 0));

    refrescarVisible();
}

// Evita que la asignacion hecha desde el propio campo visible vuelva a
// pisar lo que el usuario esta escribiendo.
function asignarSinRebote(nativo, iso) {
    nativo.dataset.asignandoInterno = '1';
    nativo.value = iso;
    delete nativo.dataset.asignandoInterno;
}

// Convierte los que ya estan y los que aparezcan despues (la seccion M de
// la ficha clinica, por ejemplo, crea sus campos de fecha al vuelo).
function convertirCamposFechaExistentes(raiz) {
    (raiz || document).querySelectorAll('input[type="date"]').forEach(convertirCampoFecha);
}

document.addEventListener('DOMContentLoaded', () => {
    convertirCamposFechaExistentes(document);

    const observador = new MutationObserver((mutaciones) => {
        mutaciones.forEach((m) => {
            m.addedNodes.forEach((nodo) => {
                if (nodo.nodeType !== 1) return;
                if (nodo.matches && nodo.matches('input[type="date"]')) convertirCampoFecha(nodo);
                else convertirCamposFechaExistentes(nodo);
            });
        });
    });
    observador.observe(document.body, { childList: true, subtree: true });
});
