// =====================================================================
// Construye la barra lateral de navegacion y valida la sesion activa
// =====================================================================

const ENLACES_NAV = [
    { href: '/index.html', texto: 'Panel principal', paginas: ['index.html', ''] },
    { href: '/agenda.html', texto: 'Agenda', paginas: ['agenda.html'] },
    { href: '/pacientes.html', texto: 'Pacientes', paginas: ['pacientes.html', 'paciente.html'] },
    { href: '/doctores.html', texto: 'Doctores', paginas: ['doctores.html'], soloAdmin: true },
    { href: '/plantillas.html', texto: 'Plantillas', paginas: ['plantillas.html'], soloAdmin: true },
    { href: '/tratamientos.html', texto: 'Tratamientos', paginas: ['tratamientos.html'], soloAdmin: true },
    { href: '/importador.html', texto: 'Importar pacientes', paginas: ['importador.html'], soloAdmin: true },
    { href: '/usuarios.html', texto: 'Usuarios', paginas: ['usuarios.html'], soloAdmin: true }
];

async function inicializarSidebar() {
    let usuario = null;
    try {
        const respuesta = await api.get('/api/auth/yo');
        usuario = respuesta.usuario;
    } catch (e) {
        usuario = null;
    }

    if (!usuario) {
        window.location.href = '/login.html';
        return null;
    }

    const paginaActual = window.location.pathname.replace('/', '');

    const enlacesHtml = ENLACES_NAV
        .filter((enlace) => !enlace.soloAdmin || usuario.rol === 'admin')
        .map((enlace) => {
            const activo = enlace.paginas.includes(paginaActual) ? 'activo' : '';
            return `<a class="sidebar__link ${activo}" href="${enlace.href}">${enlace.texto}</a>`;
        })
        .join('');

    const contenedor = document.getElementById('sidebar-contenedor');
    contenedor.innerHTML = `
        <aside class="sidebar">
            <div class="sidebar__marca">
                <div class="sidebar__logo">Dentify<span>.</span></div>
                <div class="sidebar__subtitulo">World Dental</div>
            </div>
            <nav class="sidebar__nav">
                ${enlacesHtml}
            </nav>
            <div class="sidebar__pie">
                <div class="sidebar__usuario">${usuario.nombre}</div>
                <div class="sidebar__rol">${usuario.rol === 'admin' ? 'Administrador' : 'Personal asistencial'}</div>
                <button class="sidebar__salir" id="btn-cerrar-sesion">Cerrar sesion</button>
            </div>
        </aside>
    `;

    document.getElementById('btn-cerrar-sesion').addEventListener('click', async () => {
        await api.post('/api/auth/logout');
        window.location.href = '/login.html';
    });

    return usuario;
}
