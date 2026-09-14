#!/usr/bin/env node
// =====================================================================
// Ensayo de una actualizacion, SIN TOCAR la base de la clinica.
//
// Hace una copia de db/dentify.db en una carpeta temporal, corre sobre
// ESA COPIA las migraciones y el esquema de la version nueva, y compara
// cuantos registros habia antes y despues en cada tabla. La base real
// queda intacta: el script la abre en SOLO LECTURA para copiarla.
//
// USO (con Dentify CERRADO, despues de hacer `git pull`):
//
//   node scripts/probar-actualizacion.js
//
// Si el ensayo termina en "SIN PERDIDA DE DATOS", la actualizacion es
// segura y se puede arrancar Dentify normalmente. Si algo falla, aqui
// falla — sobre una copia, a ninguna hora incomoda y sin consecuencias.
// =====================================================================
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const RUTA_DB = path.join(__dirname, '..', 'db', 'dentify.db');
const RUTA_SCHEMA = path.join(__dirname, '..', 'db', 'schema.sql');

// Algunas migraciones MUEVEN registros de una tabla a otra a proposito.
// No son perdida de datos, pero sin declararlas aqui el ensayo las
// reportaria como tal. Cada migracion nueva que mueva filas debe sumar su
// entrada, con la nota que explique al que lee el informe que paso.
const CONVERSIONES_ESPERADAS = [
    {
        desde: 'trabajos_laboratorio',
        hacia: 'envios_laboratorio',
        nota: 'los reenvios que estaban como ordenes separadas pasan a ser envios de su orden original'
    }
];

// Tablas cuyo contenido NO puede perderse en ninguna actualizacion.
const TABLAS_VIGILADAS = [
    'pacientes', 'citas', 'fichas_clinicas', 'odontogramas', 'odontograma_piezas',
    'evoluciones', 'diagnosticos', 'documentos_pacientes', 'firmas', 'consentimientos',
    'planes_tratamiento', 'plan_items', 'pagos', 'planes_pago',
    'trabajos_laboratorio', 'envios_laboratorio', 'pagos_laboratorio', 'laboratorios',
    'plantillas_documento', 'plantillas_evolucion',
    'tratamientos', 'doctores', 'usuarios'
];

function contarFilas(db, tablas) {
    const conteo = {};
    tablas.forEach((tabla) => {
        try {
            conteo[tabla] = db.prepare(`SELECT COUNT(*) AS total FROM ${tabla}`).get().total;
        } catch (error) {
            conteo[tabla] = null; // la tabla todavia no existe en esta version
        }
    });
    return conteo;
}

if (!fs.existsSync(RUTA_DB)) {
    console.error('\nNo se encontro db/dentify.db. Ejecute el script desde la carpeta del proyecto.\n');
    process.exit(1);
}

// ---------------------------------------------------------------------
// 1. Foto del estado actual (solo lectura sobre la base real)
// ---------------------------------------------------------------------
console.log('\n=== ENSAYO DE ACTUALIZACION ===\n');

let antes;
let tablasReales;
{
    const real = new Database(RUTA_DB, { readonly: true });
    tablasReales = real.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((f) => f.name);
    antes = contarFilas(real, TABLAS_VIGILADAS);
    real.close();
}
console.log(`Base actual: ${tablasReales.length} tablas.`);
console.log(`Pacientes registrados: ${antes.pacientes === null ? '—' : antes.pacientes}\n`);

// ---------------------------------------------------------------------
// 2. Copia de trabajo (incluye -wal y -shm por si quedaron escrituras)
// ---------------------------------------------------------------------
const carpetaTemporal = fs.mkdtempSync(path.join(os.tmpdir(), 'dentify-ensayo-'));
const copia = path.join(carpetaTemporal, 'dentify.db');
['', '-wal', '-shm'].forEach((sufijo) => {
    if (fs.existsSync(RUTA_DB + sufijo)) fs.copyFileSync(RUTA_DB + sufijo, copia + sufijo);
});
console.log(`Copia de trabajo: ${copia}`);
console.log('La base real NO se modifica: el ensayo corre sobre la copia.');
console.log('(Si hay migraciones, ademas se guarda una copia de seguridad en backups/.)\n');

// ---------------------------------------------------------------------
// 3. Correr la actualizacion sobre la copia
// ---------------------------------------------------------------------
console.log('--- Migraciones y esquema (sobre la copia) ---');
let fallo = null;
try {
    const { migrar } = require(path.join(__dirname, '..', 'db', 'migraciones'));
    const prueba = new Database(copia);
    prueba.pragma('foreign_keys = ON');

    migrar(prueba);
    prueba.exec(fs.readFileSync(RUTA_SCHEMA, 'utf8'));

    // ---------------------------------------------------------------
    // 4. Comparacion
    // ---------------------------------------------------------------
    const despues = contarFilas(prueba, TABLAS_VIGILADAS);
    const tablasNuevas = prueba.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
        .map((f) => f.name)
        .filter((t) => !tablasReales.includes(t));
    prueba.close();

    // Una baja esta justificada si hay una conversion declarada hacia otra
    // tabla que crecio al menos lo que esta bajo.
    function conversionQueExplica(tabla, bajaron) {
        return CONVERSIONES_ESPERADAS.find((c) => {
            if (c.desde !== tabla) return false;
            const previo = Number(antes[c.hacia]) || 0;
            const actual = Number(despues[c.hacia]) || 0;
            return (actual - previo) >= bajaron;
        });
    }

    console.log('\n--- Registros antes / despues ---');
    const perdidas = [];
    const convertidos = [];
    TABLAS_VIGILADAS.forEach((tabla) => {
        const a = antes[tabla];
        const d = despues[tabla];
        if (a === null && d === null) return;
        if (a === null) { console.log(`  ${tabla.padEnd(24)} (tabla nueva) -> ${d}`); return; }

        let marca;
        if (d === a) {
            marca = 'ok';
        } else if (d > a) {
            marca = `+${d - a}`;
        } else {
            const conversion = conversionQueExplica(tabla, a - d);
            if (conversion) {
                marca = `${a - d} convertido(s) -> ${conversion.hacia}`;
                convertidos.push(`${tabla}: ${conversion.nota}`);
            } else {
                marca = `PERDIDA de ${a - d}`;
                perdidas.push(`${tabla}: ${a} -> ${d}`);
            }
        }
        console.log(`  ${tabla.padEnd(24)} ${String(a).padStart(6)} -> ${String(d).padStart(6)}   ${marca}`);
    });

    if (convertidos.length > 0) {
        console.log('\nRegistros que cambiaron de tabla a proposito:');
        convertidos.forEach((c) => console.log('   ' + c));
    }

    if (tablasNuevas.length > 0) console.log(`\nTablas que se crearian: ${tablasNuevas.join(', ')}`);

    console.log('');
    if (perdidas.length > 0) {
        console.log('*** ATENCION: LA ACTUALIZACION PIERDE DATOS ***');
        perdidas.forEach((p) => console.log('   ' + p));
        console.log('\nNO actualice la clinica. Avise antes de continuar.\n');
        process.exitCode = 2;
    } else {
        console.log('RESULTADO: SIN PERDIDA DE DATOS. La actualizacion es segura.');
        console.log('Puede cerrar Dentify, respaldar la base y arrancar normalmente.\n');
    }
} catch (error) {
    fallo = error;
    console.log('\n*** LA ACTUALIZACION FALLO SOBRE LA COPIA ***');
    console.log('   ' + error.message);
    console.log('\nLa base real no se modifico. NO actualice la clinica; avise con este mensaje.\n');
    process.exitCode = 2;
}

// ---------------------------------------------------------------------
// 5. Limpieza de la copia
// ---------------------------------------------------------------------
try {
    fs.rmSync(carpetaTemporal, { recursive: true, force: true });
} catch (error) {
    console.log(`(La copia de trabajo quedo en ${carpetaTemporal}; se puede borrar a mano.)`);
}
if (fallo) process.exitCode = 2;
