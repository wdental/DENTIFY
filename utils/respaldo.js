// =====================================================================
// Respaldo automatico de la base de datos
// Copia dentify.db a /backups con fecha, conserva los ultimos 30
// =====================================================================
const fs = require('fs');
const path = require('path');

const RUTA_DB = path.join(__dirname, '..', 'db', 'dentify.db');
const CARPETA_BACKUPS = path.join(__dirname, '..', 'backups');
const MAX_RESPALDOS = 30;

function fechaHoy() {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const d = String(hoy.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function ejecutarRespaldo() {
    if (!fs.existsSync(RUTA_DB)) return; // aun no existe la base de datos

    if (!fs.existsSync(CARPETA_BACKUPS)) {
        fs.mkdirSync(CARPETA_BACKUPS, { recursive: true });
    }

    const nombreRespaldo = `dentify-${fechaHoy()}.db`;
    const rutaDestino = path.join(CARPETA_BACKUPS, nombreRespaldo);

    // Evitar duplicar el respaldo si ya se hizo hoy
    if (!fs.existsSync(rutaDestino)) {
        fs.copyFileSync(RUTA_DB, rutaDestino);
        console.log(`Respaldo creado: ${nombreRespaldo}`);
    }

    limpiarRespaldosAntiguos();
}

function limpiarRespaldosAntiguos() {
    const archivos = fs.readdirSync(CARPETA_BACKUPS)
        .filter((f) => f.startsWith('dentify-') && f.endsWith('.db'))
        .map((f) => ({
            nombre: f,
            ruta: path.join(CARPETA_BACKUPS, f),
            mtime: fs.statSync(path.join(CARPETA_BACKUPS, f)).mtime.getTime()
        }))
        .sort((a, b) => b.mtime - a.mtime);

    const sobrantes = archivos.slice(MAX_RESPALDOS);
    for (const archivo of sobrantes) {
        fs.unlinkSync(archivo.ruta);
        console.log(`Respaldo antiguo eliminado: ${archivo.nombre}`);
    }
}

module.exports = { ejecutarRespaldo };
