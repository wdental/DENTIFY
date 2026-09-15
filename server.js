// =====================================================================
// Dentify - Servidor principal
// World Dental - Quito, Ecuador
// =====================================================================
const express = require('express');
const session = require('express-session');
const path = require('path');

const { respaldoDiario, iniciarRespaldoPeriodico } = require('./utils/respaldo');

// Cargar conexion a la base de datos (crea el esquema si no existe). Las
// migraciones corren aqui dentro y, si alguna va a cambiar la estructura,
// guardan por su cuenta una copia previa (ver utils/respaldo.js).
const db = require('./db/conexion');

// Respaldo del dia + uno cada 6 horas mientras el servidor siga corriendo,
// para que dejar Dentify encendido varios dias no deje esos dias sin copia.
respaldoDiario(db);
iniciarRespaldoPeriodico(db);

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
const rutasPagos = require('./routes/pagos');
const rutasPlanesPago = require('./routes/planes-pago');
const rutasLaboratorio = require('./routes/laboratorio');
const rutasPlantillasEvolucion = require('./routes/plantillas-evolucion');
const { protegerPaginaConPermiso } = require('./middleware/auth');
const { iniciarProgramador } = require('./utils/sincronizacion');

const app = express();
// Puerto 3000 por defecto; se puede cambiar con la variable de entorno
// PUERTO o el argumento --puerto=NNNN (util para levantar una segunda
// instancia de pruebas sin tocar la de la clinica).
const argPuerto = process.argv.find((a) => a.startsWith('--puerto='));
const PUERTO = Number(argPuerto ? argPuerto.split('=')[1] : process.env.PUERTO) || 3000;

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
app.use('/api/pagos', rutasPagos);
app.use('/api/planes-pago', rutasPlanesPago);
app.use('/api/laboratorio', rutasLaboratorio);
app.use('/api/plantillas-evolucion', rutasPlantillasEvolucion);

// Manejo de errores de multer / subida de archivos
app.use((err, req, res, next) => {
    if (err) {
        return res.status(400).json({ error: err.message || 'Error al procesar la solicitud' });
    }
    next();
});

// -----------------------------------------------------------------
// Paginas protegidas: cada una exige sesion y, si aplica, el permiso de
// su area ([] = solo sesion). Van ANTES de express.static — si no, el
// static las serviria sin pasar por el guarda. Sin sesion: al login;
// con sesion pero sin permiso: al panel principal.
// -----------------------------------------------------------------
const paginasProtegidas = {
    'index.html': [],
    'pacientes.html': ['pacientes.ver'],
    'paciente.html': ['pacientes.ver'],
    'importador.html': ['pacientes.importar'],
    'usuarios.html': ['sistema.usuarios'],
    'agenda.html': ['agenda.ver'],
    'doctores.html': ['catalogos.doctores'],
    'imprimir-f033.html': ['historia.ver'],
    'plantillas.html': ['catalogos.plantillas'],
    'imprimir-consentimiento.html': ['planes.ver'],
    'tratamientos.html': ['catalogos.tratamientos'],
    'imprimir-plan.html': ['planes.ver'],
    'caja.html': ['caja.ver'],
    'cuotas-vencidas.html': ['caja.ver'],
    'imprimir-recibo.html': ['caja.ver'],
    'imprimir-cierre-caja.html': ['caja.ver'],
    'laboratorio.html': ['laboratorio.ver'],
    'imprimir-orden-laboratorio.html': ['laboratorio.ver']
};
Object.entries(paginasProtegidas).forEach(([pagina, permisos]) => {
    app.get(`/${pagina}`, protegerPaginaConPermiso(...permisos), (req, res) => {
        res.sendFile(path.join(__dirname, 'public', pagina));
    });
});

// -----------------------------------------------------------------
// Archivos estaticos del frontend
// -----------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

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
