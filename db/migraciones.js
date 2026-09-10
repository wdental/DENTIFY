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

    // Tipos de odontograma (inicial / evolucion / alta): agrega la columna
    // "tipo" y marca como 'inicial' el odontograma mas antiguo de cada
    // paciente (el resto queda como 'evolucion', el default de la columna).
    const columnasOdontogramas2 = db.prepare("PRAGMA table_info(odontogramas)").all().map((c) => c.name);
    if (columnasOdontogramas2.length > 0 && !columnasOdontogramas2.includes('tipo')) {
        const migrarTipos = db.transaction(() => {
            db.exec("ALTER TABLE odontogramas ADD COLUMN tipo TEXT NOT NULL DEFAULT 'evolucion' CHECK (tipo IN ('inicial', 'evolucion', 'alta'))");
            const primeros = db.prepare('SELECT MIN(id) AS id FROM odontogramas GROUP BY paciente_id').all();
            const marcarInicial = db.prepare("UPDATE odontogramas SET tipo = 'inicial' WHERE id = ?");
            primeros.forEach((fila) => marcarInicial.run(fila.id));
        });
        migrarTipos();
        console.log('Migracion: columna "tipo" agregada a odontogramas (inicial/evolucion/alta); odontograma mas antiguo de cada paciente marcado como "inicial"');
    }

    // Antecedentes personales/familiares (secciones D y E): pasan de una
    // lista "marcados" (checkbox) a estados explicitos si/no/sin-registrar
    // por item. Los items previamente marcados quedan en "si"; los demas
    // quedan sin registrar (no se infiere "no" para no inventar un dato
    // que el profesional nunca ingreso).
    const columnasFichas = db.prepare("PRAGMA table_info(fichas_clinicas)").all().map((c) => c.name);
    if (columnasFichas.includes('antecedentes_personales_json')) {
        const filas = db.prepare('SELECT id, antecedentes_personales_json, antecedentes_familiares_json FROM fichas_clinicas').all();
        const actualizar = db.prepare('UPDATE fichas_clinicas SET antecedentes_personales_json = ?, antecedentes_familiares_json = ? WHERE id = ?');
        let migradas = 0;
        const transaccion = db.transaction(() => {
            filas.forEach((fila) => {
                const convertir = (json) => {
                    if (!json) return { valor: json, cambio: false };
                    let datos;
                    try { datos = JSON.parse(json); } catch (e) { return { valor: json, cambio: false }; }
                    if (!Array.isArray(datos.marcados)) return { valor: json, cambio: false };
                    const estados = {};
                    datos.marcados.forEach((codigo) => { estados[codigo] = 'si'; });
                    const { marcados, ...resto } = datos;
                    return { valor: JSON.stringify({ ...resto, estados }), cambio: true };
                };
                const personales = convertir(fila.antecedentes_personales_json);
                const familiares = convertir(fila.antecedentes_familiares_json);
                if (personales.cambio || familiares.cambio) {
                    actualizar.run(personales.valor, familiares.valor, fila.id);
                    migradas++;
                }
            });
        });
        transaccion();
        if (migradas > 0) {
            console.log(`Migracion: ${migradas} ficha(s) clinica(s) con antecedentes D/E convertidos de checkbox ("marcados") a estados explicitos si/no`);
        }
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
