// =====================================================================
// Dentify - Servidor principal
// World Dental - Quito, Ecuador
// =====================================================================
const express = require('express');
const session = require('express-session');
const path = require('path');

const { ejecutarRespaldo } = require('./utils/respaldo');

// Ejecutar respaldo automatico de la base de datos antes de iniciar
ejecutarRespaldo();

// Cargar conexion a la base de datos (crea el esquema si no existe)
require('./db/conexion');

const rutasAuth = require('./routes/auth');
const rutasPacientes = require('./routes/pacientes');
const rutasUsuarios = require('./routes/usuarios');
const rutasImportador = require('./routes/importador');
const rutasDashboard = require('./routes/dashboard');
const rutasDoctores = require('./routes/doctores');
const rutasCitas = require('./routes/citas');
const rutasSync = require('./routes/sync');
const rutasFichaClinica = require('./routes/ficha-clinica');
const rutasOdontograma = require('./routes/odontograma');
const rutasCie10 = require('./routes/cie10');
const rutasDiagnosticos = require('./routes/diagnosticos');
const rutasEvoluciones = require('./routes/evoluciones');
const rutasPlantillas = require('./routes/plantillas');
const rutasConsentimientos = require('./routes/consentimientos');
const rutasTratamientos = require('./routes/tratamientos');
const rutasPlanesTratamiento = require('./routes/planes-tratamiento');
const { protegerPagina, requiereSesion } = require('./middleware/auth');
const { iniciarProgramador } = require('./utils/sincronizacion');

const app = express();
const PUERTO = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'dentify-world-dental-clave-secreta-local',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 12 // 12 horas
    }
}));

// -----------------------------------------------------------------
// API
// -----------------------------------------------------------------
app.use('/api/auth', rutasAuth);
app.use('/api/pacientes', rutasPacientes);
app.use('/api/usuarios', rutasUsuarios);
app.use('/api/importador', rutasImportador);
app.use('/api/dashboard', rutasDashboard);
app.use('/api/doctores', rutasDoctores);
app.use('/api/citas', rutasCitas);
app.use('/api/sync', rutasSync);
app.use('/api/ficha-clinica', rutasFichaClinica);
app.use('/api/odontograma', rutasOdontograma);
app.use('/api/cie10', rutasCie10);
app.use('/api/diagnosticos', rutasDiagnosticos);
app.use('/api/evoluciones', rutasEvoluciones);
app.use('/api/plantillas', rutasPlantillas);
app.use('/api/consentimientos', rutasConsentimientos);
app.use('/api/tratamientos', rutasTratamientos);
app.use('/api/planes-tratamiento', rutasPlanesTratamiento);

// Manejo de errores de multer / subida de archivos
app.use((err, req, res, next) => {
    if (err) {
        return res.status(400).json({ error: err.message || 'Error al procesar la solicitud' });
    }
    next();
});

// -----------------------------------------------------------------
// Archivos estaticos del frontend
// -----------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

// Paginas protegidas (requieren sesion iniciada)
const paginasProtegidas = [
    'index.html', 'pacientes.html', 'paciente.html', 'importador.html', 'usuarios.html',
    'agenda.html', 'doctores.html', 'imprimir-f033.html', 'plantillas.html', 'imprimir-consentimiento.html',
    'tratamientos.html', 'imprimir-plan.html'
];
paginasProtegidas.forEach((pagina) => {
    app.get(`/${pagina}`, protegerPagina, (req, res) => {
        res.sendFile(path.join(__dirname, 'public', pagina));
    });
});

app.get('/', (req, res) => {
    if (req.session && req.session.usuario) {
        return res.redirect('/index.html');
    }
    res.redirect('/login.html');
});

app.listen(PUERTO, '0.0.0.0', () => {
    console.log('=================================================');
    console.log('  Dentify - World Dental');
    console.log(`  Servidor activo en el puerto ${PUERTO}`);
    console.log(`  Local:      http://localhost:${PUERTO}`);
    console.log('  Red local:  http://<IP-de-este-equipo>:' + PUERTO);
    console.log('=================================================');

    // Reintentos automaticos de sincronizacion con Google Calendar
    iniciarProgramador();
});
