// =====================================================================
// Migraciones ligeras para bases de datos creadas con un esquema
// anterior (Fase 1). Se ejecutan antes de aplicar schema.sql.
// =====================================================================

// Tablas que en la Fase 1 usaban una columna "doctor_reg" (texto libre)
// y que ahora usan "doctor_id" (referencia a la tabla doctores).
// Como ninguna de estas tablas tenia todavia interfaz de usuario en la
// Fase 1, no existen datos reales que migrar: es seguro recrearlas.
const TABLAS_CON_DOCTOR_REG = ['citas', 'odontogramas', 'evoluciones', 'presupuestos'];

function migrar(db) {
    for (const tabla of TABLAS_CON_DOCTOR_REG) {
        const columnas = db.prepare(`PRAGMA table_info(${tabla})`).all().map((c) => c.name);
        const esquemaAntiguo = columnas.includes('doctor_reg') && !columnas.includes('doctor_id');
        if (esquemaAntiguo) {
            db.exec(`DROP TABLE ${tabla}`);
            console.log(`Migracion: tabla "${tabla}" recreada con el nuevo esquema de doctores`);
        }
    }

    // La tabla "odontogramas" era un stub de la Fase 1/2 sin interfaz de
    // usuario (columnas fecha/datos_json, sin version). Como nunca tuvo
    // pantalla para escribir en ella, no existen datos reales que perder:
    // es seguro recrearla con el esquema de Fase 3A (fecha_registro,
    // es_version_activa) y su tabla de hallazgos por pieza.
    const columnasOdontogramas = db.prepare("PRAGMA table_info(odontogramas)").all().map((c) => c.name);
    if (columnasOdontogramas.length > 0 && !columnasOdontogramas.includes('es_version_activa')) {
        db.exec('DROP TABLE odontogramas');
        console.log('Migracion: tabla "odontogramas" recreada con el esquema de version de Fase 3A');
    }

    // Rediseño del odontograma (paleta de herramientas, seccion K estricta del
    // F033): agrega la columna fuera_simbologia_f033 (hallazgos adicionales
    // como implante) y amplia el CHECK de color_tipo para admitir 'neutro'
    // (perdida por otra causa, ausente). SQLite no permite ALTER de un CHECK
    // existente, asi que se reconstruye la tabla copiando los hallazgos ya
    // guardados - no se pierde ningun dato.
    const infoOdontogramaPiezas = db.prepare("PRAGMA table_info(odontograma_piezas)").all();
    const columnasOdontogramaPiezas = infoOdontogramaPiezas.map((c) => c.name);
    const tablaSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='odontograma_piezas'").get();
    const admiteNeutro = tablaSql && /'neutro'/.test(tablaSql.sql);

    if (columnasOdontogramaPiezas.length > 0 && (!columnasOdontogramaPiezas.includes('fuera_simbologia_f033') || !admiteNeutro)) {
        const reconstruir = db.transaction(() => {
            db.exec(`
                CREATE TABLE odontograma_piezas_nueva (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    odontograma_id INTEGER NOT NULL REFERENCES odontogramas(id),
                    pieza TEXT NOT NULL,
                    superficie TEXT NOT NULL DEFAULT 'completa',
                    hallazgo TEXT,
                    color_tipo TEXT CHECK (color_tipo IN ('rojo', 'azul', 'neutro')),
                    movilidad INTEGER,
                    recesion INTEGER,
                    fuera_simbologia_f033 INTEGER NOT NULL DEFAULT 0
                )
            `);
            const columnaFuera = columnasOdontogramaPiezas.includes('fuera_simbologia_f033') ? 'fuera_simbologia_f033' : '0';
            db.exec(`
                INSERT INTO odontograma_piezas_nueva (id, odontograma_id, pieza, superficie, hallazgo, color_tipo, movilidad, recesion, fuera_simbologia_f033)
                SELECT id, odontograma_id, pieza, superficie, hallazgo, color_tipo, movilidad, recesion, ${columnaFuera}
                FROM odontograma_piezas
            `);
            db.exec('DROP TABLE odontograma_piezas');
            db.exec('ALTER TABLE odontograma_piezas_nueva RENAME TO odontograma_piezas');
            db.exec('CREATE INDEX IF NOT EXISTS idx_odopiezas_odontograma ON odontograma_piezas (odontograma_id)');
        });
        reconstruir();
        console.log('Migracion: tabla "odontograma_piezas" actualizada (fuera_simbologia_f033 + color_tipo "neutro"), hallazgos existentes conservados');
    }
}

// Siembra la tabla doctores solo si esta vacia (primera vez)
function sembrarDoctores(db) {
    const total = db.prepare('SELECT COUNT(*) AS total FROM doctores').get().total;
    if (total > 0) return;

    const semilla = require('./semillaDoctores');
    const insertar = db.prepare(
        'INSERT INTO doctores (nombre_completo, titulo, registro_profesional, activo) VALUES (?, ?, ?, 1)'
    );
    const transaccion = db.transaction((doctores) => {
        for (const doctor of doctores) {
            insertar.run(doctor.nombre, doctor.especialidad, doctor.registro);
        }
    });
    transaccion(semilla);
    console.log(`Doctores iniciales migrados a la base de datos (${semilla.length})`);
}

module.exports = { migrar, sembrarDoctores };
