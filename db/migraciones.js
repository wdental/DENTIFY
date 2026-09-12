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

    // Fase 3B: secciones L (examenes solicitados), M (informe de examenes)
    // y O (profesional responsable) de fichas_clinicas - columnas nuevas,
    // nulas por defecto, no se pierde ningun dato existente.
    const columnasFichas2 = db.prepare("PRAGMA table_info(fichas_clinicas)").all().map((c) => c.name);
    if (columnasFichas2.length > 0 && !columnasFichas2.includes('examenes_solicitados_json')) {
        db.exec('ALTER TABLE fichas_clinicas ADD COLUMN examenes_solicitados_json TEXT');
        db.exec('ALTER TABLE fichas_clinicas ADD COLUMN examenes_informe_json TEXT');
        db.exec('ALTER TABLE fichas_clinicas ADD COLUMN profesional_responsable_json TEXT');
        console.log('Migracion: columnas de las secciones L, M y O (Fase 3B) agregadas a fichas_clinicas');
    }

    // La tabla "evoluciones" era un stub de fases anteriores (fecha,
    // descripcion) sin interfaz de usuario nunca implementada: no existen
    // datos reales que perder. Se recrea con el esquema completo de la
    // seccion P (Fase 3B): numero de sesion, procedimientos, prescripciones,
    // inmutabilidad y anulacion logica por admin.
    const columnasEvoluciones = db.prepare("PRAGMA table_info(evoluciones)").all().map((c) => c.name);
    if (columnasEvoluciones.length > 0 && !columnasEvoluciones.includes('numero_sesion')) {
        db.exec('DROP TABLE evoluciones');
        console.log('Migracion: tabla "evoluciones" recreada con el esquema completo de la seccion P (Fase 3B)');
    }

    // La FK evoluciones.cita_id apuntaba a citas(id) sin ON DELETE SET NULL:
    // borrar una cita vinculada a una evolucion hacia fallar la sentencia con
    // una excepcion no controlada en routes/citas.js, tumbando el servidor
    // entero. Las evoluciones son el registro legal (nunca deben borrarse
    // solo porque se borre una cita de agenda), asi que se reconstruye la
    // tabla con ON DELETE SET NULL en esa columna - se conservan todas las
    // evoluciones existentes, solo cambia el comportamiento del vinculo.
    const tablaEvolucionesSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='evoluciones'").get();
    if (tablaEvolucionesSql && /cita_id INTEGER REFERENCES citas\(id\),/.test(tablaEvolucionesSql.sql)) {
        const reconstruirEvoluciones = db.transaction(() => {
            db.exec(`
                CREATE TABLE evoluciones_nueva (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
                    numero_sesion INTEGER NOT NULL,
                    fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                    doctor_id INTEGER REFERENCES doctores(id),
                    diagnosticos_complicaciones TEXT,
                    procedimientos TEXT,
                    prescripciones TEXT,
                    piezas_tratadas_json TEXT,
                    es_alta INTEGER NOT NULL DEFAULT 0,
                    cita_id INTEGER REFERENCES citas(id) ON DELETE SET NULL,
                    anulada INTEGER NOT NULL DEFAULT 0,
                    motivo_anulacion TEXT,
                    anulado_por INTEGER REFERENCES usuarios(id),
                    anulado_en TEXT,
                    creado_por INTEGER REFERENCES usuarios(id),
                    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
                )
            `);
            db.exec(`
                INSERT INTO evoluciones_nueva SELECT
                    id, paciente_id, numero_sesion, fecha, doctor_id, diagnosticos_complicaciones,
                    procedimientos, prescripciones, piezas_tratadas_json, es_alta, cita_id,
                    anulada, motivo_anulacion, anulado_por, anulado_en, creado_por, fecha_creacion
                FROM evoluciones
            `);
            db.exec('DROP TABLE evoluciones');
            db.exec('ALTER TABLE evoluciones_nueva RENAME TO evoluciones');
            db.exec('CREATE INDEX IF NOT EXISTS idx_evoluciones_paciente ON evoluciones (paciente_id)');
        });
        reconstruirEvoluciones();
        console.log('Migracion: evoluciones.cita_id ahora usa ON DELETE SET NULL (borrar una cita ya no falla ni afecta la evolucion vinculada); evoluciones existentes conservadas');
    }

    // Modulo de seguimiento (evolucion + odontograma en un solo flujo,
    // Fase 4A-bis): vincula opcionalmente una evolucion con la version de
    // odontograma registrada como consecuencia directa de esa sesion, para
    // mostrar en pantalla si el odontograma quedo actualizado o no y evitar
    // la ambiguedad de "¿ya registre esto o no?". Columna nueva, nula por
    // defecto: no afecta ninguna evolucion existente.
    const columnasEvoluciones2 = db.prepare("PRAGMA table_info(evoluciones)").all().map((c) => c.name);
    if (columnasEvoluciones2.length > 0 && !columnasEvoluciones2.includes('odontograma_id')) {
        db.exec('ALTER TABLE evoluciones ADD COLUMN odontograma_id INTEGER REFERENCES odontogramas(id)');
        console.log('Migracion: columna "odontograma_id" agregada a evoluciones (vinculo opcional con la version de odontograma registrada en la misma sesion)');
    }

    // Vincula opcionalmente una cuenta de usuario con su doctor en la tabla
    // "doctores" (un odontologo que inicia sesion con su propia cuenta no
    // deberia tener que elegirse a si mismo en cada selector de doctor de la
    // ficha). Columna nueva, nula por defecto: no afecta usuarios existentes.
    const columnasUsuarios = db.prepare("PRAGMA table_info(usuarios)").all().map((c) => c.name);
    if (columnasUsuarios.length > 0 && !columnasUsuarios.includes('doctor_id')) {
        db.exec('ALTER TABLE usuarios ADD COLUMN doctor_id INTEGER REFERENCES doctores(id)');
        console.log('Migracion: columna "doctor_id" agregada a usuarios (vinculo opcional con la tabla doctores)');
    }

    // Fase 4B (pagos, abonos y caja): la tabla "pagos" era un stub de la
    // Fase 1 (presupuesto_id, fecha, monto, metodo, notas) sin interfaz. Se
    // reconstruye con el esquema completo (numero de recibo, concepto,
    // vinculo a plan de tratamiento / plan de cuotas, anulacion logica)
    // COPIANDO cualquier fila que pudiera existir: fecha -> fecha_pago,
    // notas -> concepto, metodo normalizado a los cuatro valores admitidos,
    // y un numero de recibo asignado con el contador del anio del pago.
    // presupuesto_id se descarta (la tabla presupuestos nunca tuvo datos ni
    // pantalla y se conserva intacta como stub).
    const columnasPagos = db.prepare("PRAGMA table_info(pagos)").all().map((c) => c.name);
    if (columnasPagos.length > 0 && !columnasPagos.includes('concepto')) {
        const reconstruirPagos = db.transaction(() => {
            db.exec(`
                CREATE TABLE IF NOT EXISTS contador_recibos (
                    anio INTEGER PRIMARY KEY,
                    ultimo_numero INTEGER NOT NULL DEFAULT 0
                )
            `);
            db.exec(`
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
                )
            `);
            db.exec(`
                CREATE TABLE pagos_nueva (
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
                )
            `);

            const filasAntiguas = db.prepare('SELECT * FROM pagos ORDER BY id').all();
            const insertar = db.prepare(`
                INSERT INTO pagos_nueva (id, numero_recibo, paciente_id, concepto, monto, metodo, fecha_pago, registrado_por, fecha_creacion)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const leerContador = db.prepare('SELECT ultimo_numero FROM contador_recibos WHERE anio = ?');
            const guardarContador = db.prepare('INSERT INTO contador_recibos (anio, ultimo_numero) VALUES (?, ?) ON CONFLICT(anio) DO UPDATE SET ultimo_numero = excluded.ultimo_numero');
            const METODOS = ['efectivo', 'transferencia', 'tarjeta', 'otro'];

            filasAntiguas.forEach((fila) => {
                const fecha = String(fila.fecha || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
                const anio = Number(fecha.slice(0, 4));
                const actual = leerContador.get(anio);
                const siguiente = (actual ? actual.ultimo_numero : 0) + 1;
                guardarContador.run(anio, siguiente);
                const metodo = METODOS.includes(String(fila.metodo || '').toLowerCase()) ? String(fila.metodo).toLowerCase() : 'otro';
                const monto = Number(fila.monto) > 0 ? Number(fila.monto) : 0.01;
                insertar.run(
                    fila.id, `REC-${anio}-${String(siguiente).padStart(4, '0')}`, fila.paciente_id,
                    fila.notas || 'Pago migrado (Fase 1)', monto, metodo, fecha, fila.registrado_por || null,
                    fila.fecha || new Date().toISOString()
                );
            });

            db.exec('DROP TABLE pagos');
            db.exec('ALTER TABLE pagos_nueva RENAME TO pagos');
            db.exec('CREATE INDEX IF NOT EXISTS idx_pagos_paciente ON pagos (paciente_id)');
            db.exec('CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos (fecha_pago)');
            return filasAntiguas.length;
        });
        const migrados = reconstruirPagos();
        console.log(`Migracion: tabla "pagos" reconstruida con el esquema de la Fase 4B (${migrados} fila(s) previa(s) conservada(s))`);
    }

    // -----------------------------------------------------------------
    // Trabajos de laboratorio: cantidad + costo unitario, y pagos al
    // laboratorio por ABONOS en vez de un si/no.
    //
    // El registro manual de la clinica lleva "Cant.", "Costo unit.",
    // "Abonado" y "Saldo", con trabajos pagados a medias. El esquema
    // original de la Fase 4C tenia un solo `costo` y un `pagado` 0/1, que
    // no podia representar eso. Se reconstruye la tabla (SQLite no permite
    // quitar columnas con CHECK de forma simple) y cada trabajo que
    // estuviera marcado como pagado se convierte en un abono por su costo
    // total, con su fecha, metodo y referencia: no se pierde ningun dato.
    // -----------------------------------------------------------------
    const columnasTrabajosLab = db.prepare("PRAGMA table_info(trabajos_laboratorio)").all().map((c) => c.name);

    if (columnasTrabajosLab.length > 0 && !columnasTrabajosLab.includes('cantidad')) {
        const reconstruirTrabajos = db.transaction(() => {
            db.exec(`
                CREATE TABLE pagos_laboratorio (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    trabajo_id INTEGER NOT NULL REFERENCES trabajos_laboratorio(id) ON DELETE CASCADE,
                    monto REAL NOT NULL CHECK (monto > 0),
                    fecha TEXT NOT NULL,
                    metodo TEXT NOT NULL CHECK (metodo IN ('efectivo', 'transferencia', 'tarjeta', 'otro')),
                    referencia TEXT,
                    notas TEXT,
                    anulado INTEGER NOT NULL DEFAULT 0,
                    motivo_anulacion TEXT,
                    anulado_por INTEGER REFERENCES usuarios(id),
                    anulado_en TEXT,
                    registrado_por INTEGER REFERENCES usuarios(id),
                    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
                )
            `);

            // Los pagos ya marcados pasan a ser abonos por el costo total.
            const pagados = db.prepare(
                'SELECT id, costo, fecha_pago_laboratorio, metodo_pago, referencia_pago, notas_pago, pagado_por FROM trabajos_laboratorio WHERE pagado = 1 AND costo > 0'
            ).all();
            const insertarAbono = db.prepare(`
                INSERT INTO pagos_laboratorio (trabajo_id, monto, fecha, metodo, referencia, notas, registrado_por)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            pagados.forEach((p) => insertarAbono.run(
                p.id, p.costo,
                p.fecha_pago_laboratorio || db.prepare("SELECT date('now','localtime') AS f").get().f,
                p.metodo_pago || 'otro', p.referencia_pago, p.notas_pago, p.pagado_por
            ));

            db.exec(`
                CREATE TABLE trabajos_laboratorio_nueva (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    numero_orden TEXT NOT NULL UNIQUE,
                    paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
                    laboratorio_id INTEGER NOT NULL REFERENCES laboratorios(id),
                    doctor_id INTEGER REFERENCES doctores(id),
                    tipo_trabajo TEXT NOT NULL,
                    descripcion TEXT,
                    piezas TEXT,
                    color TEXT,
                    indicaciones TEXT,
                    estado TEXT NOT NULL DEFAULT 'por_enviar' CHECK (estado IN
                        ('por_enviar', 'enviado', 'recibido', 'instalado', 'cancelado')),
                    fecha_envio TEXT,
                    fecha_estimada TEXT,
                    fecha_recepcion TEXT,
                    fecha_instalacion TEXT,
                    plan_item_id INTEGER REFERENCES plan_items(id),
                    cita_id INTEGER REFERENCES citas(id) ON DELETE SET NULL,
                    evolucion_id INTEGER REFERENCES evoluciones(id),
                    documentos_json TEXT,
                    trabajo_padre_id INTEGER REFERENCES trabajos_laboratorio(id),
                    cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
                    costo_unitario REAL NOT NULL DEFAULT 0,
                    costo REAL NOT NULL DEFAULT 0,
                    motivo_cancelacion TEXT,
                    cancelado_por INTEGER REFERENCES usuarios(id),
                    cancelado_en TEXT,
                    notas TEXT,
                    creado_por INTEGER REFERENCES usuarios(id),
                    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
                )
            `);
            db.exec(`
                INSERT INTO trabajos_laboratorio_nueva (
                    id, numero_orden, paciente_id, laboratorio_id, doctor_id, tipo_trabajo, descripcion,
                    piezas, color, indicaciones, estado, fecha_envio, fecha_estimada, fecha_recepcion,
                    fecha_instalacion, plan_item_id, cita_id, evolucion_id, documentos_json,
                    trabajo_padre_id, cantidad, costo_unitario, costo, motivo_cancelacion,
                    cancelado_por, cancelado_en, notas, creado_por, fecha_creacion
                )
                SELECT id, numero_orden, paciente_id, laboratorio_id, doctor_id, tipo_trabajo, descripcion,
                       piezas, color, indicaciones, estado, fecha_envio, fecha_estimada, fecha_recepcion,
                       fecha_instalacion, plan_item_id, cita_id, evolucion_id, documentos_json,
                       trabajo_padre_id, 1, costo, costo, motivo_cancelacion,
                       cancelado_por, cancelado_en, notas, creado_por, fecha_creacion
                FROM trabajos_laboratorio
            `);
            db.exec('DROP TABLE trabajos_laboratorio');
            db.exec('ALTER TABLE trabajos_laboratorio_nueva RENAME TO trabajos_laboratorio');
            db.exec('CREATE INDEX IF NOT EXISTS idx_trabajoslab_paciente ON trabajos_laboratorio (paciente_id)');
            db.exec('CREATE INDEX IF NOT EXISTS idx_trabajoslab_laboratorio ON trabajos_laboratorio (laboratorio_id)');
            db.exec('CREATE INDEX IF NOT EXISTS idx_trabajoslab_estado ON trabajos_laboratorio (estado)');
            db.exec('CREATE INDEX IF NOT EXISTS idx_pagoslab_trabajo ON pagos_laboratorio (trabajo_id)');
            db.exec('CREATE INDEX IF NOT EXISTS idx_pagoslab_fecha ON pagos_laboratorio (fecha)');
            return pagados.length;
        });
        const abonosCreados = reconstruirTrabajos();
        console.log(`Migracion: "trabajos_laboratorio" ahora lleva cantidad/costo unitario y los pagos se registran como abonos (${abonosCreados} pago(s) previo(s) convertido(s) en abono)`);
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

// Siembra el catalogo CIE-10 odontologico solo si esta vacio (primera vez)
function sembrarCie10(db) {
    const total = db.prepare('SELECT COUNT(*) AS total FROM cie10_odontologia').get().total;
    if (total > 0) return;

    const semilla = require('./semillaCie10');
    const insertar = db.prepare('INSERT INTO cie10_odontologia (codigo, descripcion) VALUES (?, ?)');
    const transaccion = db.transaction((codigos) => {
        for (const c of codigos) insertar.run(c.codigo, c.descripcion);
    });
    transaccion(semilla);
    console.log(`Catalogo CIE-10 odontologico sembrado (${semilla.length} codigos)`);
}

module.exports = { migrar, sembrarDoctores, sembrarCie10 };
