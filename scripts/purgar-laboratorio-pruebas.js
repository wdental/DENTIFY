#!/usr/bin/env node
// =====================================================================
// Purga de trabajos de laboratorio DE PRUEBA (Fase 4C).
//
// La aplicacion no permite borrar un trabajo de laboratorio, solo
// cancelarlo (queda tachado en la bandeja). Eso es lo correcto para el
// trabajo real, pero deja residuos cuando se prueba el modulo. Este
// script los borra de verdad, con el mismo criterio que ya se usa para
// purgar pagos de prueba: seleccion explicita, nunca "borrar todo".
//
// USO (desde la carpeta del proyecto, con Dentify CERRADO):
//
//   node scripts/purgar-laboratorio-pruebas.js --orden=LAB-2026-0007
//   node scripts/purgar-laboratorio-pruebas.js --paciente=512
//   node scripts/purgar-laboratorio-pruebas.js --historia=WD-2026-0043
//
// Se pueden combinar y repetir (--orden=A --orden=B). Por defecto SOLO
// MUESTRA lo que borraria; hay que agregar --aplicar para que lo haga:
//
//   node scripts/purgar-laboratorio-pruebas.js --orden=LAB-2026-0007 --aplicar
//
// Al borrar arrastra los reenvios por ajuste que dependan del trabajo, y
// si el anio queda sin ningun trabajo reinicia su contador de ordenes,
// para que la primera orden real vuelva a ser LAB-AAAA-0001.
// =====================================================================
const path = require('path');
const Database = require('better-sqlite3');

const RUTA_DB = path.join(__dirname, '..', 'db', 'dentify.db');

function leerArgumentos(argv) {
    const seleccion = { ordenes: [], pacientes: [], historias: [], aplicar: false };
    argv.slice(2).forEach((arg) => {
        if (arg === '--aplicar') { seleccion.aplicar = true; return; }
        const [clave, valor] = arg.split('=');
        if (!valor) return;
        if (clave === '--orden') seleccion.ordenes.push(valor.trim().toUpperCase());
        else if (clave === '--paciente') seleccion.pacientes.push(Number(valor));
        else if (clave === '--historia') seleccion.historias.push(valor.trim().toUpperCase());
    });
    return seleccion;
}

function marcadores(lista) {
    return lista.map(() => '?').join(',');
}

const seleccion = leerArgumentos(process.argv);

if (seleccion.ordenes.length === 0 && seleccion.pacientes.length === 0 && seleccion.historias.length === 0) {
    console.error('\nNo se indico que borrar. Este script nunca borra todo por si solo.\n');
    console.error('Ejemplos:');
    console.error('  node scripts/purgar-laboratorio-pruebas.js --orden=LAB-2026-0007');
    console.error('  node scripts/purgar-laboratorio-pruebas.js --paciente=512 --aplicar');
    console.error('  node scripts/purgar-laboratorio-pruebas.js --historia=WD-2026-0043\n');
    process.exit(1);
}

const db = new Database(RUTA_DB);
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------
// 1. Que trabajos entran en la seleccion (incluidos sus reenvios)
// ---------------------------------------------------------------------
const condiciones = [];
const parametros = [];

if (seleccion.ordenes.length > 0) {
    condiciones.push(`UPPER(t.numero_orden) IN (${marcadores(seleccion.ordenes)})`);
    parametros.push(...seleccion.ordenes);
}
if (seleccion.pacientes.length > 0) {
    condiciones.push(`t.paciente_id IN (${marcadores(seleccion.pacientes)})`);
    parametros.push(...seleccion.pacientes);
}
if (seleccion.historias.length > 0) {
    condiciones.push(`UPPER(p.numero_historia) IN (${marcadores(seleccion.historias)})`);
    parametros.push(...seleccion.historias);
}

let seleccionados = db.prepare(`
    SELECT t.id, t.numero_orden, t.estado, t.costo, t.pagado, t.trabajo_padre_id,
           t.tipo_trabajo, l.nombre AS laboratorio,
           p.nombres || ' ' || p.apellidos AS paciente, p.numero_historia
    FROM trabajos_laboratorio t
    JOIN laboratorios l ON l.id = t.laboratorio_id
    JOIN pacientes p ON p.id = t.paciente_id
    WHERE ${condiciones.join(' OR ')}
    ORDER BY t.id
`).all(...parametros);

// Arrastra los reenvios por ajuste: si se borra el original, su hijo
// quedaria apuntando a un trabajo inexistente.
const porId = new Map(seleccionados.map((t) => [t.id, t]));
let pendientes = seleccionados.map((t) => t.id);
while (pendientes.length > 0) {
    const hijos = db.prepare(`
        SELECT t.id, t.numero_orden, t.estado, t.costo, t.pagado, t.trabajo_padre_id,
               t.tipo_trabajo, l.nombre AS laboratorio,
               p.nombres || ' ' || p.apellidos AS paciente, p.numero_historia
        FROM trabajos_laboratorio t
        JOIN laboratorios l ON l.id = t.laboratorio_id
        JOIN pacientes p ON p.id = t.paciente_id
        WHERE t.trabajo_padre_id IN (${marcadores(pendientes)})
    `).all(...pendientes).filter((h) => !porId.has(h.id));
    hijos.forEach((h) => porId.set(h.id, h));
    pendientes = hijos.map((h) => h.id);
}
seleccionados = Array.from(porId.values()).sort((a, b) => a.id - b.id);

if (seleccionados.length === 0) {
    console.log('\nNingun trabajo de laboratorio coincide con esa seleccion. No hay nada que borrar.\n');
    process.exit(0);
}

// ---------------------------------------------------------------------
// 2. Informe de lo que se va a borrar
// ---------------------------------------------------------------------
console.log(`\n${seleccionados.length} trabajo(s) de laboratorio en la seleccion:\n`);
seleccionados.forEach((t) => {
    const etiquetas = [];
    if (t.trabajo_padre_id) etiquetas.push('reenvio por ajuste');
    if (t.pagado) etiquetas.push('PAGADO al laboratorio');
    console.log(`  ${t.numero_orden}  ${t.tipo_trabajo}`);
    console.log(`     paciente: ${t.paciente} (${t.numero_historia}) · laboratorio: ${t.laboratorio}`);
    console.log(`     estado: ${t.estado} · costo: $${Number(t.costo).toFixed(2)}${etiquetas.length ? ' · ' + etiquetas.join(' · ') : ''}`);
});

const pagados = seleccionados.filter((t) => t.pagado);
if (pagados.length > 0) {
    console.log(`\n  AVISO: ${pagados.length} de ellos estan marcados como PAGADOS al laboratorio.`);
    console.log('  Si no son de prueba, cancele ahora (Ctrl+C) y revise la seleccion.');
}

if (!seleccion.aplicar) {
    console.log('\nEsto fue solo una vista previa: NO se borro nada.');
    console.log('Vuelva a ejecutarlo con --aplicar para borrarlos de verdad.\n');
    process.exit(0);
}

// ---------------------------------------------------------------------
// 3. Borrado + reinicio de contadores de anios que queden vacios
// ---------------------------------------------------------------------
const ids = seleccionados.map((t) => t.id);
const aniosTocados = Array.from(new Set(seleccionados.map((t) => Number(t.numero_orden.split('-')[1])).filter(Boolean)));

const contadoresReiniciados = [];
db.transaction(() => {
    db.prepare(`DELETE FROM trabajos_laboratorio WHERE id IN (${marcadores(ids)})`).run(...ids);

    aniosTocados.forEach((anio) => {
        const quedan = db.prepare(
            "SELECT COUNT(*) AS total FROM trabajos_laboratorio WHERE numero_orden LIKE ?"
        ).get(`LAB-${anio}-%`).total;
        if (quedan === 0) {
            db.prepare('DELETE FROM contador_ordenes_laboratorio WHERE anio = ?').run(anio);
            contadoresReiniciados.push(anio);
        }
    });
})();

console.log(`\nListo: ${ids.length} trabajo(s) borrado(s).`);
if (contadoresReiniciados.length > 0) {
    console.log(`Contador de ordenes reiniciado para ${contadoresReiniciados.join(', ')}: la proxima orden sera LAB-${contadoresReiniciados[0]}-0001.`);
}
console.log('');
