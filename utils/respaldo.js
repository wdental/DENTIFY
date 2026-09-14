// =====================================================================
// Respaldos de la base de datos.
//
// Desde que la clinica trabaja con pacientes reales hay tres momentos en
// que se guarda una copia:
//
//   1. ANTES DE ACTUALIZAR: si al arrancar hay una migracion que va a
//      cambiar la estructura de alguna tabla, se guarda una copia con
//      nombre propio ANTES de tocar nada. Si la actualizacion sale mal,
//      volver atras es restaurar ese archivo.
//   2. DIARIO: una copia por dia calendario.
//   3. PERIODICO: cada 6 horas mientras el servidor corre. Antes el
//      respaldo "diario" solo se hacia al ARRANCAR: si la clinica dejaba
//      Dentify encendido toda la semana, existia un unico respaldo, el
//      del dia que lo prendieron, y todo lo registrado despues quedaba
//      sin copia hasta el siguiente reinicio.
//
// Los respaldos se toman con la conexion abierta, asi que primero se
// hace un checkpoint del WAL: sin eso, lo escrito mas recientemente vive
// en dentify.db-wal y la copia saldria incompleta.
//
// OJO: todos los respaldos viven en la MISMA maquina que la base. Eso no
// protege contra un disco dañado o un equipo robado; la clinica debe
// llevarse ademas una copia fuera (USB, disco externo o nube).
// =====================================================================
const fs = require('fs');
const path = require('path');

const RUTA_DB = path.join(__dirname, '..', 'db', 'dentify.db');
const CARPETA_BACKUPS = path.join(__dirname, '..', 'backups');

const MAX_RESPALDOS_DIARIOS = 30;
const MAX_RESPALDOS_ACTUALIZACION = 10;
const HORAS_ENTRE_RESPALDOS = 6;

const PREFIJO_DIARIO = 'dentify-';
const PREFIJO_ACTUALIZACION = 'dentify-antes-de-actualizar-';

function dosDigitos(numero) {
    return String(numero).padStart(2, '0');
}

function fechaHoy() {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${dosDigitos(hoy.getMonth() + 1)}-${dosDigitos(hoy.getDate())}`;
}

function fechaYHora() {
    const ahora = new Date();
    return `${fechaHoy()}-${dosDigitos(ahora.getHours())}${dosDigitos(ahora.getMinutes())}`;
}

function asegurarCarpeta() {
    if (!fs.existsSync(CARPETA_BACKUPS)) fs.mkdirSync(CARPETA_BACKUPS, { recursive: true });
}

// Copia la base a `backups/`. Con la conexion abierta hay que volcar el
// WAL al archivo principal primero, o la copia pierde lo mas reciente.
function copiarBase(db, nombreArchivo) {
    if (!fs.existsSync(RUTA_DB)) return null;
    asegurarCarpeta();

    const destino = path.join(CARPETA_BACKUPS, nombreArchivo);
    if (fs.existsSync(destino)) return destino;

    if (db) {
        try {
            db.pragma('wal_checkpoint(TRUNCATE)');
        } catch (error) {
            console.log('Aviso: no se pudo consolidar el WAL antes del respaldo:', error.message);
        }
    }
    fs.copyFileSync(RUTA_DB, destino);
    return destino;
}

// Deja solo los ultimos N archivos que empiezan con `prefijo`.
function limpiarAntiguos(prefijo, maximo, esDelGrupo) {
    if (!fs.existsSync(CARPETA_BACKUPS)) return;

    const archivos = fs.readdirSync(CARPETA_BACKUPS)
        .filter((f) => f.endsWith('.db') && esDelGrupo(f))
        .map((f) => ({ nombre: f, ruta: path.join(CARPETA_BACKUPS, f) }))
        .map((a) => ({ ...a, mtime: fs.statSync(a.ruta).mtime.getTime() }))
        .sort((a, b) => b.mtime - a.mtime);

    archivos.slice(maximo).forEach((archivo) => {
        fs.unlinkSync(archivo.ruta);
        console.log(`Respaldo antiguo eliminado: ${archivo.nombre}`);
    });
}

function esRespaldoDeActualizacion(nombre) {
    return nombre.startsWith(PREFIJO_ACTUALIZACION);
}

function esRespaldoDiario(nombre) {
    return nombre.startsWith(PREFIJO_DIARIO) && !esRespaldoDeActualizacion(nombre);
}

// -----------------------------------------------------------------
// 1. Antes de una migracion que cambia la estructura
// -----------------------------------------------------------------
let respaldoDeActualizacionHecho = false;

function respaldarAntesDeActualizar(db) {
    if (respaldoDeActualizacionHecho) return null;
    respaldoDeActualizacionHecho = true;

    const destino = copiarBase(db, `${PREFIJO_ACTUALIZACION}${fechaYHora()}.db`);
    if (destino) {
        console.log(`Respaldo previo a la actualizacion: ${path.basename(destino)}`);
        limpiarAntiguos(PREFIJO_ACTUALIZACION, MAX_RESPALDOS_ACTUALIZACION, esRespaldoDeActualizacion);
    }
    return destino;
}

// -----------------------------------------------------------------
// 2 y 3. Diario y periodico
// -----------------------------------------------------------------
function respaldoDiario(db) {
    const nombre = `${PREFIJO_DIARIO}${fechaHoy()}.db`;
    const yaExiste = fs.existsSync(path.join(CARPETA_BACKUPS, nombre));

    const destino = copiarBase(db, nombre);
    if (destino && !yaExiste) {
        console.log(`Respaldo creado: ${nombre}`);
        limpiarAntiguos(PREFIJO_DIARIO, MAX_RESPALDOS_DIARIOS, esRespaldoDiario);
    }
    return destino;
}

// Cada 6 horas: cubre el caso de dejar Dentify encendido varios dias.
function iniciarRespaldoPeriodico(db) {
    setInterval(() => {
        try {
            respaldoDiario(db);
        } catch (error) {
            console.log('Aviso: fallo el respaldo periodico:', error.message);
        }
    }, HORAS_ENTRE_RESPALDOS * 60 * 60 * 1000);
}

module.exports = { respaldarAntesDeActualizar, respaldoDiario, iniciarRespaldoPeriodico };
