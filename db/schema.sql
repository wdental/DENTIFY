-- =====================================================================
-- Dentify - Esquema de base de datos (SQLite)
-- World Dental - Quito, Ecuador
-- =====================================================================

-- ---------------------------------------------------------------------
-- USUARIOS (login del sistema)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    usuario TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('admin', 'asistencial')),
    activo INTEGER NOT NULL DEFAULT 1,
    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------
-- CONTADOR DE HISTORIAS CLINICAS (para numero_historia secuencial por año)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contador_historias (
    anio INTEGER PRIMARY KEY,
    ultimo_numero INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
-- PACIENTES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pacientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_historia TEXT NOT NULL UNIQUE,       -- Formato WD-AAAA-####
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    cedula TEXT UNIQUE,                          -- 10 digitos, puede ser nulo (extranjeros pendientes)
    fecha_nacimiento TEXT,                        -- YYYY-MM-DD
    sexo TEXT CHECK (sexo IN ('F', 'M', 'O')),
    telefono TEXT,
    whatsapp TEXT,
    email TEXT,
    direccion TEXT,
    origen TEXT CHECK (origen IN ('WhatsApp', 'Instagram', 'Facebook', 'Google', 'Referido', 'Otro')),
    alergias TEXT,
    antecedentes_medicos TEXT,
    antecedentes_odontologicos TEXT,
    medicamentos_actuales TEXT,
    notas TEXT,
    fecha_registro TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    activo INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_pacientes_nombres ON pacientes (nombres, apellidos);
CREATE INDEX IF NOT EXISTS idx_pacientes_cedula ON pacientes (cedula);
CREATE INDEX IF NOT EXISTS idx_pacientes_historia ON pacientes (numero_historia);

-- ---------------------------------------------------------------------
-- DOCUMENTOS DE PACIENTES (adjuntos: PDF, imagenes - historias migradas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documentos_pacientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
    nombre_original TEXT NOT NULL,
    nombre_archivo TEXT NOT NULL,                -- nombre guardado en disco
    tipo TEXT,                                    -- mime type
    tamano INTEGER,                               -- bytes
    fecha_subida TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    subido_por INTEGER REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_documentos_paciente ON documentos_pacientes (paciente_id);

-- ---------------------------------------------------------------------
-- DOCTORES (fuente unica de verdad; reemplaza a public/assets/doctores.js)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_completo TEXT NOT NULL,
    titulo TEXT,                                  -- ej. "Especialista en Ortodoncia"
    registro_profesional TEXT UNIQUE,
    calendario_google_id TEXT,                    -- ID del calendario de Google del doctor (opcional)
    activo INTEGER NOT NULL DEFAULT 1,
    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------
-- CITAS (Fase 2: Agenda) - con soporte de sincronizacion a Google Calendar
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS citas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
    doctor_id INTEGER REFERENCES doctores(id),
    doctor_nombre TEXT,                            -- copia del nombre al crear/editar; se conserva aunque el doctor cambie o se desactive
    sillon INTEGER,                                -- numero de sillon/consultorio
    fecha TEXT NOT NULL,                           -- YYYY-MM-DD
    hora_inicio TEXT NOT NULL,                     -- HH:MM
    hora_fin TEXT,
    motivo TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmada', 'atendida', 'cancelada', 'no_asistio')),
    notas TEXT,
    google_event_id TEXT,                          -- id del evento en Google Calendar, si esta sincronizada
    sync_estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (sync_estado IN ('pendiente', 'sincronizada', 'error', 'no_aplica')),
    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_citas_fecha ON citas (fecha);
CREATE INDEX IF NOT EXISTS idx_citas_doctor ON citas (doctor_id);

-- ---------------------------------------------------------------------
-- COLA DE SINCRONIZACION PENDIENTE CON GOOGLE CALENDAR
-- Sin FK estricta a citas: la operacion 'eliminar' se encola despues de
-- borrar la cita local, por lo que el registro ya no existe en citas.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_pendientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cita_id INTEGER NOT NULL,
    operacion TEXT NOT NULL CHECK (operacion IN ('sincronizar', 'eliminar')),
    payload_json TEXT,                             -- datos necesarios para reintentar 'eliminar' (event id, calendar id)
    intentos INTEGER NOT NULL DEFAULT 1,
    ultimo_error TEXT,
    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    fecha_ultimo_intento TEXT
);

-- ---------------------------------------------------------------------
-- LOG DE SINCRONIZACION (para el panel de admin)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    nivel TEXT NOT NULL CHECK (nivel IN ('info', 'error')),
    mensaje TEXT NOT NULL,
    cita_id INTEGER
);

-- ---------------------------------------------------------------------
-- METADATOS DE LA ULTIMA EJECUCION DE SINCRONIZACION (fila unica)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    ultima_ejecucion TEXT,
    ultimo_resultado TEXT
);

-- =====================================================================
-- ESTRUCTURA PREPARADA PARA FASES SIGUIENTES
-- (tablas minimas para no romper migraciones futuras; se expandiran)
-- =====================================================================

-- ---------------------------------------------------------------------
-- FICHA CLINICA (Fase 3A) - Formulario 033 MSP Ecuador, secciones B-G, I, J
-- Un solo registro mutable por paciente; cada seccion es un bloque JSON
-- independiente con su propia auditoria (actualizado_en / actualizado_por)
-- para poder guardarse por separado sin afectar las demas.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fichas_clinicas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER NOT NULL UNIQUE REFERENCES pacientes(id),
    motivo_consulta_json TEXT,                    -- B: {texto, embarazada, actualizado_en, actualizado_por}
    enfermedad_actual_json TEXT,                  -- C: {texto, actualizado_en, actualizado_por}
    antecedentes_personales_json TEXT,             -- D: {marcados:[], otro_texto, observaciones, actualizado_en, actualizado_por}
    antecedentes_familiares_json TEXT,             -- E: {marcados:[], otro_texto, observaciones, actualizado_en, actualizado_por}
    constantes_vitales_json TEXT,                  -- F: {temperatura, pulso, frecuencia_respiratoria, presion_arterial, actualizado_en, actualizado_por}
    examen_estomatognatico_json TEXT,              -- G: {items:{1:{patologia,descripcion}, ...}, actualizado_en, actualizado_por}
    indicadores_salud_bucal_json TEXT,             -- I: {higiene:{...}, periodontal, oclusion, fluorosis, actualizado_en, actualizado_por}
    indices_cpo_json TEXT,                         -- J: {permanente:{c,p,o,total}, temporal:{c,e,o,total}, actualizado_en, actualizado_por}
    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_fichas_clinicas_paciente ON fichas_clinicas (paciente_id);

-- ---------------------------------------------------------------------
-- ODONTOGRAMAS (Fase 3A) - INMUTABLE una vez registrado: cada actualizacion
-- crea una nueva version (es_version_activa=1) y desactiva la anterior.
-- Las versiones antiguas se conservan intactas para consulta historica.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS odontogramas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
    fecha_registro TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    doctor_id INTEGER REFERENCES doctores(id),
    observaciones TEXT,
    creado_por INTEGER REFERENCES usuarios(id),
    es_version_activa INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_odontogramas_paciente ON odontogramas (paciente_id);

-- ---------------------------------------------------------------------
-- HALLAZGOS POR PIEZA DE UN ODONTOGRAMA (Fase 3A)
-- Una fila por hallazgo de superficie, o por marca a nivel de pieza
-- completa (superficie='completa'), o por anotacion de movilidad/recesion
-- (hallazgo NULL, solo movilidad y/o recesion informados).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS odontograma_piezas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    odontograma_id INTEGER NOT NULL REFERENCES odontogramas(id),
    pieza TEXT NOT NULL,                           -- nomenclatura FDI, ej. '11', '55'
    superficie TEXT NOT NULL DEFAULT 'completa',   -- oclusal/mesial/distal/vestibular/lingual/completa
    hallazgo TEXT,                                 -- codigo del catalogo de hallazgos (ver public/js/odontograma.js)
    color_tipo TEXT CHECK (color_tipo IN ('rojo', 'azul', 'neutro')),
    movilidad INTEGER,                             -- 0-4, nullable
    recesion INTEGER,                              -- 0-4, nullable
    fuera_simbologia_f033 INTEGER NOT NULL DEFAULT 0  -- 1 = hallazgo adicional (ej. implante) fuera de la seccion K del F033
);

CREATE INDEX IF NOT EXISTS idx_odopiezas_odontograma ON odontograma_piezas (odontograma_id);

-- ---------------------------------------------------------------------
-- EVOLUCIONES / NOTAS CLINICAS (Fase 3)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evoluciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
    fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    doctor_id INTEGER REFERENCES doctores(id),
    descripcion TEXT,
    creado_por INTEGER REFERENCES usuarios(id)
);

-- ---------------------------------------------------------------------
-- PRESUPUESTOS (Fase 4)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS presupuestos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
    fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    doctor_id INTEGER REFERENCES doctores(id),
    total REAL DEFAULT 0,
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
    detalle_json TEXT,
    creado_por INTEGER REFERENCES usuarios(id)
);

-- ---------------------------------------------------------------------
-- PAGOS (Fase 4)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
    presupuesto_id INTEGER REFERENCES presupuestos(id),
    fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    monto REAL NOT NULL,
    metodo TEXT,
    notas TEXT,
    registrado_por INTEGER REFERENCES usuarios(id)
);

-- ---------------------------------------------------------------------
-- FIRMAS DIGITALES (Fase 5)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS firmas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
    documento_tipo TEXT,                          -- consentimiento, presupuesto, etc.
    documento_id INTEGER,
    firma_data TEXT,                               -- imagen de firma en base64
    fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
