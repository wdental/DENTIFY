// =====================================================================
// Conexion a la base de datos SQLite (better-sqlite3)
// =====================================================================
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const { migrar, sembrarDoctores } = require('./migraciones');

const RUTA_DB = path.join(__dirname, 'dentify.db');
const RUTA_SCHEMA = path.join(__dirname, 'schema.sql');

const existeDb = fs.existsSync(RUTA_DB);
const db = new Database(RUTA_DB);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Migraciones ligeras para bases de datos creadas con un esquema anterior
migrar(db);

// Aplicar el esquema siempre (usa CREATE TABLE IF NOT EXISTS, es seguro)
const schema = fs.readFileSync(RUTA_SCHEMA, 'utf8');
db.exec(schema);

// Si es la primera vez que se crea la base de datos, sembrar el usuario admin inicial
if (!existeDb) {
    const passwordHash = bcrypt.hashSync('WDClinica2026', 10);
    db.prepare(
        `INSERT INTO usuarios (nombre, usuario, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1)`
    ).run('Administrador', 'admin', passwordHash, 'admin');
    console.log('Usuario administrador inicial creado (usuario: admin / clave: WDClinica2026)');
}

// Poblar los doctores iniciales si la tabla esta vacia (migracion desde doctores.js)
sembrarDoctores(db);

module.exports = db;
