// =====================================================================
// Firma digital: pad de firma en <canvas>, reutilizado en la seccion O
// (profesional responsable) y en cada evolucion (seccion P). Sin
// dependencias externas - dibuja con eventos de puntero (mouse/touch/pen).
// =====================================================================

function inicializarFirmaCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || canvas.dataset.firmaInicializada) return;
    canvas.dataset.firmaInicializada = '1';
    canvas.dataset.firmaVacia = '1';

    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1A1A1A';
    let dibujando = false;

    function posicion(evento) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (evento.clientX - rect.left) * (canvas.width / rect.width),
            y: (evento.clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    canvas.addEventListener('pointerdown', (evento) => {
        if (canvas.disabled) return;
        dibujando = true;
        canvas.dataset.firmaVacia = '0';
        const p = posicion(evento);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        canvas.setPointerCapture(evento.pointerId);
        evento.preventDefault();
    });
    canvas.addEventListener('pointermove', (evento) => {
        if (!dibujando) return;
        const p = posicion(evento);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        evento.preventDefault();
    });
    const terminar = () => { dibujando = false; };
    canvas.addEventListener('pointerup', terminar);
    canvas.addEventListener('pointerleave', terminar);
    canvas.addEventListener('pointercancel', terminar);
}

function limpiarFirmaCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    canvas.dataset.firmaVacia = '1';
}

function firmaCanvasVacio(canvasId) {
    const canvas = document.getElementById(canvasId);
    return !canvas || canvas.dataset.firmaVacia !== '0';
}

function obtenerFirmaDataUrl(canvasId) {
    if (firmaCanvasVacio(canvasId)) return null;
    return document.getElementById(canvasId).toDataURL('image/png');
}

// Dibuja una firma ya guardada (base64) sobre el canvas, en modo solo
// lectura (bloquea el dibujo mientras haya una firma fija cargada).
function mostrarFirmaFija(canvasId, dataUrl) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !dataUrl) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = dataUrl;
    canvas.dataset.firmaVacia = '0';
    canvas.disabled = true;
    canvas.classList.add('firma-canvas--bloqueado');
}
