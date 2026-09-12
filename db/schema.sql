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
    doctor_id INTEGER REFERENCES doctores(id), -- vinculo opcional: si esta cuenta es la de un doctor, precarga los selectores de doctor en la ficha
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
    antecedentes_personales_json TEXT,             -- D: {estados:{codigo:'si'|'no'}, otro_texto, observaciones, actualizado_en, actualizado_por}
    antecedentes_familiares_json TEXT,             -- E: {estados:{codigo:'si'|'no'}, otro_texto, observaciones, actualizado_en, actualizado_por}
    constantes_vitales_json TEXT,                  -- F: {temperatura, pulso, frecuencia_respiratoria, presion_arterial, actualizado_en, actualizado_por}
    examen_estomatognatico_json TEXT,              -- G: {items:{1:{patologia,descripcion}, ...}, sin_patologia_aparente, actualizado_en, actualizado_por}
    indicadores_salud_bucal_json TEXT,             -- I: {higiene:{...}, periodontal, oclusion, fluorosis, actualizado_en, actualizado_por}
    indices_cpo_json TEXT,                         -- J: {permanente:{c,p,o,total}, temporal:{c,e,o,total}, ajustado_manualmente, actualizado_en, actualizado_por}
    examenes_solicitados_json TEXT,                -- L: {biometria, quimica_sanguinea, rayos_x, otros, otros_texto, detalle, actualizado_en, actualizado_por}
    examenes_informe_json TEXT,                    -- M: {informes:[{tipo, texto, fecha, documento_id}], actualizado_en, actualizado_por}
    profesional_responsable_json TEXT,             -- O: {doctor_id, fecha_apertura, actualizado_en, actualizado_por}
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
    es_version_activa INTEGER NOT NULL DEFAULT 1,
    tipo TEXT NOT NULL DEFAULT 'evolucion' CHECK (tipo IN ('inicial', 'evolucion', 'alta'))
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
-- EVOLUCIONES POR SESION (Fase 3B, seccion P del F033) - INMUTABLE una vez
-- guardada (registro legal): no se edita ni se borra. Un error se corrige
-- con una nueva evolucion aclaratoria. Solo admin puede "anular" una
-- (borrado logico: queda visible tachada con motivo, nunca desaparece).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evoluciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
    numero_sesion INTEGER NOT NULL,                -- autoincremental por paciente (1, 2, 3...)
    fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    doctor_id INTEGER REFERENCES doctores(id),
    diagnosticos_complicaciones TEXT,
    procedimientos TEXT,
    prescripciones TEXT,
    piezas_tratadas_json TEXT,                     -- ['16','25',...] FDI, opcional
    es_alta INTEGER NOT NULL DEFAULT 0,
    cita_id INTEGER REFERENCES citas(id) ON DELETE SET NULL, -- cita de agenda vinculada, opcional
    odontograma_id INTEGER REFERENCES odontogramas(id), -- version de odontograma registrada en la misma sesion (modulo de seguimiento, Fase 4A-bis)
    anulada INTEGER NOT NULL DEFAULT 0,
    motivo_anulacion TEXT,
    anulado_por INTEGER REFERENCES usuarios(id),
    anulado_en TEXT,
    creado_por INTEGER REFERENCES usuarios(id),
    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_evoluciones_paciente ON evoluciones (paciente_id);

-- ---------------------------------------------------------------------
-- DIAGNOSTICOS CIE-10 (Fase 3B, seccion N del F033) - hasta 6 por ficha.
-- tipo empieza en PRE (presuntivo) y puede promoverse a DEF (definitivo)
-- conservando la fecha de cada estado para trazabilidad.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS diagnosticos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
    descripcion TEXT NOT NULL,
    codigo_cie10 TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'PRE' CHECK (tipo IN ('PRE', 'DEF')),
    doctor_id INTEGER REFERENCES doctores(id),
    fecha_pre TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    fecha_def TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    creado_por INTEGER REFERENCES usuarios(id),
    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_diagnosticos_paciente ON diagnosticos (paciente_id);

-- ---------------------------------------------------------------------
-- CATALOGO CIE-10 ODONTOLOGICO (Fase 3B) - precargado (seed), de solo
-- lectura para la aplicacion; usado por el buscador de la seccion N.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cie10_odontologia (
    codigo TEXT PRIMARY KEY,
    descripcion TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- PRESUPUESTOS (stub de la Fase 1, sin interfaz). Se conserva tal cual:
-- el "presupuesto" real de Dentify es el plan de tratamiento aceptado
-- (Fase 4A) y los cobros viven en la tabla pagos (Fase 4B, al final).
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

-- ---------------------------------------------------------------------
-- CONSENTIMIENTOS INFORMADOS (Fase 3C)
-- ---------------------------------------------------------------------

-- Plantillas de texto legal con marcadores {paciente_nombre}, {paciente_cedula},
-- etc. (ver public/js/consentimientos.js, PLANTILLA_MARCADORES). Editar una
-- plantilla nunca altera los consentimientos ya firmados: estos guardan su
-- propio contenido_final, ya resuelto, de forma permanente.
CREATE TABLE IF NOT EXISTS plantillas_documento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('consentimiento', 'certificado', 'otro')),
    procedimiento_asociado TEXT,
    contenido TEXT NOT NULL,               -- HTML simple (negritas/listas/parrafos) con marcadores {marcador}
    activo INTEGER NOT NULL DEFAULT 1,
    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    creado_por INTEGER REFERENCES usuarios(id)
);

-- Un consentimiento FIRMADO es inmutable (contenido_final, firmas, hash,
-- decision y firmante nunca cambian). Las unicas columnas que se actualizan
-- despues de creado son estado (al revocar/anular) y motivo/anulado_* (solo
-- al anular) - igual que el patron ya usado en evoluciones.anulada.
-- Revocacion: se inserta una fila NUEVA con decision='revocacion' y
-- consentimiento_origen_id apuntando al aceptado original, que a su vez
-- pasa su propio estado a 'revocado' (sin tocar su contenido_final/firma).
CREATE TABLE IF NOT EXISTS consentimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
    plantilla_id INTEGER REFERENCES plantillas_documento(id),
    contenido_final TEXT NOT NULL,          -- texto exacto firmado (marcadores ya resueltos + bloque de decision)
    decision TEXT NOT NULL CHECK (decision IN ('aceptado', 'rechazado', 'revocacion')),
    estado TEXT NOT NULL CHECK (estado IN ('aceptado', 'rechazado', 'revocado', 'anulado')),
    firma_paciente_path TEXT NOT NULL,
    firma_doctor_path TEXT,
    firmante_nombre TEXT NOT NULL,
    firmante_cedula TEXT,                   -- puede faltar (paciente extranjero sin cedula registrada)
    es_representante INTEGER NOT NULL DEFAULT 0,
    doctor_id INTEGER REFERENCES doctores(id),
    fecha_firma TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    hash_documento TEXT NOT NULL,           -- SHA-256 de contenido_final
    consentimiento_origen_id INTEGER REFERENCES consentimientos(id),
    motivo_anulacion TEXT,
    anulado_por INTEGER REFERENCES usuarios(id),
    anulado_en TEXT,
    creado_por INTEGER REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_consentimientos_paciente ON consentimientos (paciente_id);

-- ---------------------------------------------------------------------
-- CATALOGO DE TRATAMIENTOS CON PRECIOS (Fase 4A)
-- Una restauracion puede tener hasta 3 filas con el mismo hallazgo_asociado
-- ('caries') y distinta variante_superficies (1/2/3) para simple/compuesta/
-- compleja; el resto de hallazgos usan variante_superficies NULL.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tratamientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT,
    nombre TEXT NOT NULL,
    categoria TEXT NOT NULL DEFAULT 'Otro' CHECK (categoria IN
        ('Prevencion', 'Operatoria', 'Endodoncia', 'Cirugia', 'Rehabilitacion',
         'Ortodoncia', 'Estetica', 'Otro')),
    precio REAL NOT NULL DEFAULT 0,
    hallazgo_asociado TEXT,
    variante_superficies INTEGER,           -- solo para hallazgo_asociado='caries': 1, 2 o 3+
    activo INTEGER NOT NULL DEFAULT 1,
    notas TEXT,
    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    creado_por INTEGER REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_tratamientos_hallazgo ON tratamientos (hallazgo_asociado);

-- ---------------------------------------------------------------------
-- MAPEO HALLAZGO -> TRATAMIENTO SUGERIDO (Fase 4A) - una fila por codigo de
-- hallazgo rojo del odontograma. Editable solo por admin. Si el tratamiento
-- referenciado se desactiva/borra, la columna queda en NULL (ON DELETE SET
-- NULL) y el plan generado marca la linea como "asignar tratamiento".
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mapeo_hallazgo_tratamiento (
    hallazgo_codigo TEXT PRIMARY KEY,
    tratamiento_id INTEGER REFERENCES tratamientos(id) ON DELETE SET NULL,
    tratamiento_id_2_superficies INTEGER REFERENCES tratamientos(id) ON DELETE SET NULL,
    tratamiento_id_3_superficies INTEGER REFERENCES tratamientos(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------
-- PLANES DE TRATAMIENTO (Fase 4A) - un plan aceptado es inmutable salvo
-- estado; cualquier cambio posterior genera una nueva version en borrador
-- ligada por version_anterior_id, igual que el patron de revocacion de
-- consentimientos. La firma reutiliza exactamente el patron de
-- consentimientos: contenido_final congelado + hash SHA-256 + PNG en disco.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS planes_tratamiento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
    odontograma_id INTEGER REFERENCES odontogramas(id),
    estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN
        ('borrador', 'presentado', 'aceptado', 'rechazado', 'en_curso', 'finalizado')),
    total REAL NOT NULL DEFAULT 0,
    condiciones TEXT,
    doctor_id INTEGER REFERENCES doctores(id),
    version_anterior_id INTEGER REFERENCES planes_tratamiento(id),
    motivo_rechazo TEXT,
    contenido_final TEXT,                   -- snapshot HTML congelado al presentar/firmar
    hash_documento TEXT,                    -- SHA-256 de contenido_final, solo si aceptado
    firma_paciente_path TEXT,
    firma_representante_path TEXT,
    firmante_nombre TEXT,
    firmante_cedula TEXT,
    es_representante INTEGER NOT NULL DEFAULT 0,
    fecha_presentado TEXT,
    fecha_aceptado TEXT,
    creado_por INTEGER REFERENCES usuarios(id),
    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_planes_paciente ON planes_tratamiento (paciente_id);

CREATE TABLE IF NOT EXISTS plan_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL REFERENCES planes_tratamiento(id),
    piezas TEXT,                            -- FDI separadas por coma, o tramo
    hallazgo_origen TEXT,
    tratamiento_id INTEGER REFERENCES tratamientos(id),
    descripcion TEXT NOT NULL,
    precio REAL NOT NULL DEFAULT 0,
    fase INTEGER NOT NULL DEFAULT 1,
    fase_etiqueta TEXT,
    estado_item TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_item IN
        ('pendiente', 'realizado', 'descartado')),
    evolucion_id INTEGER REFERENCES evoluciones(id),
    orden INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_planitems_plan ON plan_items (plan_id);

-- ---------------------------------------------------------------------
-- PAGOS, ABONOS Y CAJA (Fase 4B). Ver docs/fase-4b.md.
-- ---------------------------------------------------------------------

-- Numeracion secuencial de recibos por anio (REC-AAAA-####), mismo patron
-- que contador_historias. El numero se asigna en la misma transaccion que
-- inserta el pago y nunca se reutiliza (un pago anulado conserva el suyo).
CREATE TABLE IF NOT EXISTS contador_recibos (
    anio INTEGER PRIMARY KEY,
    ultimo_numero INTEGER NOT NULL DEFAULT 0
);

-- Acuerdo de cuotas (ortodoncia u otros): entrada inicial + N cuotas
-- mensuales el dia dia_pago_mes. El cronograma NO se persiste: se calcula
-- en utils/finanzas.js a partir de estos campos y de los pagos vinculados.
CREATE TABLE IF NOT EXISTS planes_pago (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
    plan_id INTEGER REFERENCES planes_tratamiento(id),
    descripcion TEXT NOT NULL,
    monto_total REAL NOT NULL CHECK (monto_total > 0),
    entrada REAL NOT NULL DEFAULT 0 CHECK (entrada >= 0),
    numero_cuotas INTEGER NOT NULL CHECK (numero_cuotas >= 1),
    monto_cuota REAL NOT NULL CHECK (monto_cuota > 0),
    dia_pago_mes INTEGER NOT NULL CHECK (dia_pago_mes BETWEEN 1 AND 28),
    fecha_inicio TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'completado', 'cancelado')),
    notas TEXT,
    motivo_cancelacion TEXT,
    creado_por INTEGER REFERENCES usuarios(id),
    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_planes_pago_paciente ON planes_pago (paciente_id);

-- Un pago registrado es INMUTABLE: nunca se edita ni se elimina. Solo un
-- admin puede anularlo con motivo (queda visible tachado y excluido de
-- todos los totales). Una correccion = anular + registrar de nuevo.
CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_recibo TEXT NOT NULL UNIQUE,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
    plan_id INTEGER REFERENCES planes_tratamiento(id),
    plan_item_id INTEGER REFERENCES plan_items(id),
    plan_pago_id INTEGER REFERENCES planes_pago(id),
    concepto TEXT NOT NULL,
    monto REAL NOT NULL CHECK (monto > 0),
    metodo TEXT NOT NULL CHECK (metodo IN ('efectivo', 'transferencia', 'tarjeta', 'otro')),
    referencia TEXT,
    fecha_pago TEXT NOT NULL,
    registrado_por INTEGER REFERENCES usuarios(id),
    doctor_id INTEGER REFERENCES doctores(id),
    anulado INTEGER NOT NULL DEFAULT 0,
    motivo_anulacion TEXT,
    anulado_por INTEGER REFERENCES usuarios(id),
    anulado_en TEXT,
    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_pagos_paciente ON pagos (paciente_id);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos (fecha_pago);

-- ---------------------------------------------------------------------
-- TRABAJOS ENVIADOS A LABORATORIO (Fase 4C). Ver docs/fase-4c.md.
--
-- El COSTO del laboratorio es un EGRESO interno de la clinica y no tiene
-- relacion con el precio que paga el paciente (ese vive en plan_items y
-- se cobra via `pagos`). Por eso estas tablas son independientes de
-- `pagos`/caja: un pago al laboratorio nunca consume un numero de recibo
-- ni entra en los totales de ingresos del dia.
--
-- Las fotos/escaneos NO tienen mecanismo propio: se suben en la pestaña
-- Documentos del paciente (documentos_pacientes) y el trabajo las
-- referencia por id en documentos_json, igual que la seccion M del F033.
-- ---------------------------------------------------------------------

-- Catalogo de laboratorios con los que trabaja la clinica.
CREATE TABLE IF NOT EXISTS laboratorios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    contacto TEXT,
    telefono TEXT,
    email TEXT,
    direccion TEXT,
    datos_transferencia TEXT,               -- banco/cuenta para pagarle (texto libre)
    notas TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    creado_por INTEGER REFERENCES usuarios(id)
);

-- Numeracion secuencial de ordenes de trabajo por anio (LAB-AAAA-####),
-- mismo patron que contador_recibos/contador_historias. Sirve para
-- identificar el trabajo con el laboratorio (va impreso en la orden).
CREATE TABLE IF NOT EXISTS contador_ordenes_laboratorio (
    anio INTEGER PRIMARY KEY,
    ultimo_numero INTEGER NOT NULL DEFAULT 0
);

-- Un trabajo enviado a laboratorio. A diferencia de un pago (documento
-- legal inmutable), esto es logistica: se puede corregir mientras no este
-- pagado. Una vez marcado pagado, solo un admin revierte el pago.
--
-- Un reenvio por ajuste NO edita el trabajo original: crea una fila hija
-- con trabajo_padre_id, con sus propias fechas y su propio costo (a menudo
-- 0 si el laboratorio no cobra el ajuste), igual que una revocacion de
-- consentimiento o una nueva version de plan.
CREATE TABLE IF NOT EXISTS trabajos_laboratorio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_orden TEXT NOT NULL UNIQUE,
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
    laboratorio_id INTEGER NOT NULL REFERENCES laboratorios(id),
    doctor_id INTEGER REFERENCES doctores(id),

    tipo_trabajo TEXT NOT NULL,             -- ej. 'Corona de zirconio' (texto libre con sugerencias)
    descripcion TEXT,
    piezas TEXT,                            -- FDI separadas por coma, mismo formato que plan_items.piezas
    color TEXT,                             -- tono / guia de color
    indicaciones TEXT,                      -- lo que se le pide al laboratorio

    estado TEXT NOT NULL DEFAULT 'por_enviar' CHECK (estado IN
        ('por_enviar', 'enviado', 'recibido', 'instalado', 'cancelado')),
    fecha_envio TEXT,
    fecha_estimada TEXT,                    -- fecha de entrega prometida por el laboratorio
    fecha_recepcion TEXT,
    fecha_instalacion TEXT,

    plan_item_id INTEGER REFERENCES plan_items(id),   -- linea del plan que paga el paciente
    cita_id INTEGER REFERENCES citas(id) ON DELETE SET NULL,  -- cita de instalacion prevista
    evolucion_id INTEGER REFERENCES evoluciones(id),  -- sesion en la que se instalo
    documentos_json TEXT,                   -- ids de documentos_pacientes (fotos/escaneos)
    trabajo_padre_id INTEGER REFERENCES trabajos_laboratorio(id), -- reenvio por ajuste

    costo REAL NOT NULL DEFAULT 0,          -- lo que cobra el laboratorio a la clinica
    pagado INTEGER NOT NULL DEFAULT 0,
    fecha_pago_laboratorio TEXT,
    metodo_pago TEXT CHECK (metodo_pago IS NULL OR metodo_pago IN
        ('efectivo', 'transferencia', 'tarjeta', 'otro')),
    referencia_pago TEXT,                   -- numero de factura del laboratorio (agrupa un pago por lote)
    notas_pago TEXT,
    pagado_por INTEGER REFERENCES usuarios(id),
    pagado_en TEXT,

    motivo_cancelacion TEXT,
    cancelado_por INTEGER REFERENCES usuarios(id),
    cancelado_en TEXT,

    notas TEXT,
    creado_por INTEGER REFERENCES usuarios(id),
    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_trabajoslab_paciente ON trabajos_laboratorio (paciente_id);
CREATE INDEX IF NOT EXISTS idx_trabajoslab_laboratorio ON trabajos_laboratorio (laboratorio_id);
CREATE INDEX IF NOT EXISTS idx_trabajoslab_estado ON trabajos_laboratorio (estado);
CREATE INDEX IF NOT EXISTS idx_trabajoslab_pagado ON trabajos_laboratorio (pagado);
