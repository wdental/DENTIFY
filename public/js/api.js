// =====================================================================
// Helper para llamadas a la API del servidor
// =====================================================================

async function apiFetch(url, opciones = {}) {
    const config = {
        method: opciones.method || 'GET',
        headers: {},
        credentials: 'same-origin'
    };

    if (opciones.body instanceof FormData) {
        config.body = opciones.body; // el navegador define el Content-Type automaticamente
    } else if (opciones.body) {
        config.headers['Content-Type'] = 'application/json';
        config.body = JSON.stringify(opciones.body);
    }

    const respuesta = await fetch(url, config);
    let datos = null;
    try {
        datos = await respuesta.json();
    } catch (e) {
        datos = null;
    }

    if (!respuesta.ok) {
        const mensaje = (datos && datos.error) || 'Ocurrio un error inesperado';
        const error = new Error(mensaje);
        error.data = datos;
        error.status = respuesta.status;
        throw error;
    }

    return datos;
}

const api = {
    get: (url) => apiFetch(url),
    post: (url, body) => apiFetch(url, { method: 'POST', body }),
    put: (url, body) => apiFetch(url, { method: 'PUT', body }),
    del: (url) => apiFetch(url, { method: 'DELETE' })
};
