// =====================================================================
// Migraciones ligeras para bases de datos creadas con un esquema
// anterior (Fase 1). Se ejecutan antes de aplicar schema.sql.
// =====================================================================

// Tablas que en la Fase 1 usaban una columna "doctor_reg" (texto libre)
// y que ahora usan "doctor_id" (referencia a la tabla doctores).
// Como ninguna de estas tablas tenia todavia interfaz de usuario en la
// Fase 1, no existen datos reales que migrar: es seguro recrearlas.
const { respaldarAntesDeActualizar } = require('../utils/respaldo');

const TABLAS_CON_DOCTOR_REG = ['citas', 'odontogramas', 'evoluciones', 'presupuestos'];

// IMPORTANTE: todo bloque que modifique la estructura debe empezar
// llamando a respaldarAntesDeActualizar(db). Guarda una copia de la base
// ANTES de tocar nada (una sola vez por arranque, aunque corran varias
// migraciones) para que volver atras sea restaurar un archivo.
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
        respaldarAntesDeActualizar(db);  // copia de seguridad antes de tocar nada
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
        respaldarAntesDeActualizar(db);  // copia de seguridad antes de tocar nada
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
        respaldarAntesDeActualizar(db);  // copia de seguridad antes de tocar nada
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
    // Esta condicion (que la columna exista) es verdadera PARA SIEMPRE, asi
    // que el bloque se evalua en cada arranque: por eso primero se calcula
    // que filas hay que convertir y, si no hay ninguna, se sale sin tocar
    // la base ni pedir respaldo.
    const columnasFichas = db.prepare("PRAGMA table_info(fichas_clinicas)").all().map((c) => c.name);
    if (columnasFichas.includes('antecedentes_personales_json')) {
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

        const pendientes = db.prepare('SELECT id, antecedentes_personales_json, antecedentes_familiares_json FROM fichas_clinicas').all()
            .map((fila) => ({
                id: fila.id,
                personales: convertir(fila.antecedentes_personales_json),
                familiares: convertir(fila.antecedentes_familiares_json)
            }))
            .filter((fila) => fila.personales.cambio || fila.familiares.cambio);

        if (pendientes.length > 0) {
            respaldarAntesDeActualizar(db);  // copia de seguridad antes de tocar nada
            const actualizar = db.prepare('UPDATE fichas_clinicas SET antecedentes_personales_json = ?, antecedentes_familiares_json = ? WHERE id = ?');
            db.transaction(() => {
                pendientes.forEach((fila) => actualizar.run(fila.personales.valor, fila.familiares.valor, fila.id));
            })();
            console.log(`Migracion: ${pendientes.length} ficha(s) clinica(s) con antecedentes D/E convertidos de checkbox ("marcados") a estados explicitos si/no`);
        }
    }

    // Fase 3B: secciones L (examenes solicitados), M (informe de examenes)
    // y O (profesional responsable) de fichas_clinicas - columnas nuevas,
    // nulas por defecto, no se pierde ningun dato existente.
    const columnasFichas2 = db.prepare("PRAGMA table_info(fichas_clinicas)").all().map((c) => c.name);
    if (columnasFichas2.length > 0 && !columnasFichas2.includes('examenes_solicitados_json')) {
        respaldarAntesDeActualizar(db);  // copia de seguridad antes de tocar nada
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
        respaldarAntesDeActualizar(db);  // copia de seguridad antes de tocar nada
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
        respaldarAntesDeActualizar(db);  // copia de seguridad antes de tocar nada
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
        respaldarAntesDeActualizar(db);  // copia de seguridad antes de tocar nada
        db.exec('ALTER TABLE evoluciones ADD COLUMN odontograma_id INTEGER REFERENCES odontogramas(id)');
        console.log('Migracion: columna "odontograma_id" agregada a evoluciones (vinculo opcional con la version de odontograma registrada en la misma sesion)');
    }

    // Vincula opcionalmente una cuenta de usuario con su doctor en la tabla
    // "doctores" (un odontologo que inicia sesion con su propia cuenta no
    // deberia tener que elegirse a si mismo en cada selector de doctor de la
    // ficha). Columna nueva, nula por defecto: no afecta usuarios existentes.
    const columnasUsuarios = db.prepare("PRAGMA table_info(usuarios)").all().map((c) => c.name);
    if (columnasUsuarios.length > 0 && !columnasUsuarios.includes('doctor_id')) {
        respaldarAntesDeActualizar(db);  // copia de seguridad antes de tocar nada
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
        respaldarAntesDeActualizar(db);  // copia de seguridad antes de tocar nada
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

    // La marca del esquema ORIGINAL de la Fase 4C es la columna `pagado`
    // (un si/no): solo esas bases se reconstruyen aqui. No sirve preguntar
    // por la ausencia de `cantidad`, porque la migracion de lineas de mas
    // abajo tambien la elimina y este bloque volveria a correr.
    if (columnasTrabajosLab.length > 0 && columnasTrabajosLab.includes('pagado') && !columnasTrabajosLab.includes('cantidad')) {
        respaldarAntesDeActualizar(db);  // copia de seguridad antes de tocar nada
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

    // -----------------------------------------------------------------
    // Laboratorio: las idas y vueltas de un trabajo pasan a ser un
    // SUB-REGISTRO de la misma orden, no ordenes nuevas.
    //
    // La Fase 4C registraba un reenvio por ajuste como un trabajo hijo con
    // su propio numero (LAB-2026-0003 "ajuste de LAB-2026-0001"). En el uso
    // real eso fragmenta el seguimiento: una protesis total va y vuelve
    // varias veces y para el laboratorio sigue siendo UNA orden, la que
    // tiene anotada. Ahora cada movimiento es una fila de
    // `envios_laboratorio` y el numero de orden nunca cambia.
    //
    // Los trabajos hijos que ya existieran se convierten en envios de su
    // orden raiz: su costo pasa a `costo_adicional`, sus abonos se
    // reasignan a la raiz y la fila hija se elimina. No se pierde nada.
    // -----------------------------------------------------------------
    const tablasLab = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('trabajos_laboratorio', 'envios_laboratorio')").all().map((f) => f.name);

    if (tablasLab.includes('trabajos_laboratorio') && !tablasLab.includes('envios_laboratorio')) {
        respaldarAntesDeActualizar(db);  // copia de seguridad antes de tocar nada
        const migrarEnvios = db.transaction(() => {
            db.exec(`
                CREATE TABLE envios_laboratorio (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    trabajo_id INTEGER NOT NULL REFERENCES trabajos_laboratorio(id) ON DELETE CASCADE,
                    numero INTEGER NOT NULL,
                    motivo TEXT NOT NULL DEFAULT 'inicial' CHECK (motivo IN
                        ('inicial', 'prueba', 'ajuste', 'reparacion', 'otro')),
                    fecha_envio TEXT,
                    fecha_estimada TEXT,
                    fecha_recepcion TEXT,
                    costo_adicional REAL NOT NULL DEFAULT 0,
                    notas TEXT,
                    registrado_por INTEGER REFERENCES usuarios(id),
                    fecha_creacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
                )
            `);
            db.exec('CREATE INDEX IF NOT EXISTS idx_envioslab_trabajo ON envios_laboratorio (trabajo_id, numero)');

            const tienePadre = db.prepare("PRAGMA table_info(trabajos_laboratorio)").all().some((c) => c.name === 'trabajo_padre_id');
            const insertarEnvio = db.prepare(`
                INSERT INTO envios_laboratorio (trabajo_id, numero, motivo, fecha_envio, fecha_estimada, fecha_recepcion, costo_adicional, notas, registrado_por)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const todos = db.prepare('SELECT * FROM trabajos_laboratorio ORDER BY id').all();
            const raices = tienePadre ? todos.filter((t) => !t.trabajo_padre_id) : todos;
            const hijos = tienePadre ? todos.filter((t) => t.trabajo_padre_id) : [];

            // Envio 1 de cada orden, con las fechas que ya tenia.
            raices.forEach((tr) => {
                if (!tr.fecha_envio && tr.estado === 'por_enviar') return; // todavia no salio
                insertarEnvio.run(tr.id, 1, 'inicial', tr.fecha_envio, tr.fecha_estimada, tr.fecha_recepcion, 0, null, tr.creado_por);
            });

            // Cada hijo se vuelve un envio de su orden raiz.
            const porId = {};
            todos.forEach((tr) => { porId[tr.id] = tr; });
            const raizDe = (tr) => {
                let actual = tr;
                while (actual.trabajo_padre_id && porId[actual.trabajo_padre_id]) actual = porId[actual.trabajo_padre_id];
                return actual;
            };

            hijos.forEach((hijo) => {
                const raiz = raizDe(hijo);
                if (raiz.id === hijo.id) return;
                const siguiente = (db.prepare('SELECT COALESCE(MAX(numero), 0) AS maximo FROM envios_laboratorio WHERE trabajo_id = ?').get(raiz.id).maximo) + 1;
                insertarEnvio.run(
                    raiz.id, siguiente, 'ajuste',
                    hijo.fecha_envio, hijo.fecha_estimada, hijo.fecha_recepcion,
                    hijo.costo || 0,
                    hijo.indicaciones || hijo.notas || `Reenvío que estaba registrado como ${hijo.numero_orden}`,
                    hijo.creado_por
                );
                // Los abonos del hijo pasan a la orden raiz, y su costo se
                // suma al total de esa orden.
                db.prepare('UPDATE pagos_laboratorio SET trabajo_id = ? WHERE trabajo_id = ?').run(raiz.id, hijo.id);
                if (hijo.costo > 0) {
                    db.prepare('UPDATE trabajos_laboratorio SET costo = costo + ? WHERE id = ?').run(hijo.costo, raiz.id);
                }
                // El estado del hijo manda si era el movimiento en curso.
                if (hijo.estado === 'enviado') {
                    db.prepare("UPDATE trabajos_laboratorio SET estado = 'enviado', fecha_envio = ?, fecha_estimada = ?, fecha_recepcion = NULL WHERE id = ?")
                        .run(hijo.fecha_envio, hijo.fecha_estimada, raiz.id);
                }
                db.prepare('DELETE FROM trabajos_laboratorio WHERE id = ?').run(hijo.id);
            });

            if (tienePadre) db.exec('ALTER TABLE trabajos_laboratorio DROP COLUMN trabajo_padre_id');
            return { ordenes: raices.length, convertidos: hijos.length };
        });
        const resultado = migrarEnvios();
        console.log(`Migracion: las idas y vueltas al laboratorio pasan a "envios_laboratorio" (${resultado.ordenes} orden(es), ${resultado.convertidos} reenvio(s) convertido(s) en envio)`);
    }

    // -----------------------------------------------------------------
    // Permisos por usuario: el catalogo es codigo (utils/permisos.js), la
    // asignacion es datos (tabla permisos_usuario). Esta migracion NO le
    // cambia los permisos a nadie: a cada usuario "asistencial" existente
    // (activo o no, por si se reactiva) se le conceden exactamente los
    // permisos que ese rol podia ejercer hasta hoy (todo lo que no era
    // requiereAdmin); los "admin" no necesitan filas porque el rol implica
    // todos los permisos. La condicion (que la tabla no exista) deja de
    // cumplirse tras aplicarse: el bloque corre una sola vez.
    // -----------------------------------------------------------------
    const existeTablaUsuarios = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'").get();
    const existeTablaPermisos = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='permisos_usuario'").get();

    if (existeTablaUsuarios && !existeTablaPermisos) {
        respaldarAntesDeActualizar(db);  // copia de seguridad antes de tocar nada
        const { PERMISOS_ASISTENCIAL_HISTORICO } = require('../utils/permisos');
        const sembrarPermisos = db.transaction(() => {
            db.exec(`
                CREATE TABLE permisos_usuario (
                    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                    permiso TEXT NOT NULL,
                    PRIMARY KEY (usuario_id, permiso)
                )
            `);
            const asistenciales = db.prepare("SELECT id FROM usuarios WHERE rol = 'asistencial'").all();
            const insertar = db.prepare('INSERT INTO permisos_usuario (usuario_id, permiso) VALUES (?, ?)');
            asistenciales.forEach((u) => {
                PERMISOS_ASISTENCIAL_HISTORICO.forEach((p) => insertar.run(u.id, p));
            });
            return asistenciales.length;
        });
        const usuariosSembrados = sembrarPermisos();
        console.log(`Migracion: tabla "permisos_usuario" creada; ${usuariosSembrados} usuario(s) asistencial(es) conserva(n) exactamente lo que podia(n) hacer hasta hoy`);
    }

    // -----------------------------------------------------------------
    // Laboratorio: una orden puede llevar VARIAS LINEAS con precios
    // distintos (ej. 4 coronas a $90 y 1 provisional a $15), como la
    // factura real del laboratorio. El detalle pasa a la tabla nueva
    // `lineas_laboratorio`; cada trabajo existente se convierte en una
    // orden de una linea (descripcion = tipo de trabajo, con su cantidad
    // y costo unitario actuales) y `trabajos_laboratorio` se reconstruye
    // sin esas dos columnas. El `costo` total no cambia para nadie.
    //
    // IMPORTANTE: pagos_laboratorio y envios_laboratorio referencian a
    // trabajos_laboratorio con ON DELETE CASCADE, asi que el DROP de la
    // reconstruccion arrastraria sus filas si las FKs estan activas. Se
    // apagan solo durante este bloque (fuera de la transaccion, como
    // exige SQLite) y al final se verifica con foreign_key_check.
    // -----------------------------------------------------------------
    const columnasTrabajosLinea = db.prepare("PRAGMA table_info(trabajos_laboratorio)").all().map((c) => c.name);
    if (columnasTrabajosLinea.length > 0 && columnasTrabajosLinea.includes('cantidad')) {
        respaldarAntesDeActualizar(db);  // copia de seguridad antes de tocar nada
        db.pragma('foreign_keys = OFF');
        try {
            const migrarLineas = db.transaction(() => {
                db.exec(`
                    CREATE TABLE IF NOT EXISTS lineas_laboratorio (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        trabajo_id INTEGER NOT NULL REFERENCES trabajos_laboratorio(id) ON DELETE CASCADE,
                        orden INTEGER NOT NULL DEFAULT 1,
                        descripcion TEXT NOT NULL,
                        cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
                        costo_unitario REAL NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0)
                    )
                `);
                db.exec('CREATE INDEX IF NOT EXISTS idx_lineaslab_trabajo ON lineas_laboratorio (trabajo_id, orden)');
                db.exec(`
                    INSERT INTO lineas_laboratorio (trabajo_id, orden, descripcion, cantidad, costo_unitario)
                    SELECT id, 1, tipo_trabajo, cantidad, costo_unitario FROM trabajos_laboratorio
                `);

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
                        costo, motivo_cancelacion, cancelado_por, cancelado_en, notas, creado_por, fecha_creacion
                    )
                    SELECT id, numero_orden, paciente_id, laboratorio_id, doctor_id, tipo_trabajo, descripcion,
                           piezas, color, indicaciones, estado, fecha_envio, fecha_estimada, fecha_recepcion,
                           fecha_instalacion, plan_item_id, cita_id, evolucion_id, documentos_json,
                           costo, motivo_cancelacion, cancelado_por, cancelado_en, notas, creado_por, fecha_creacion
                    FROM trabajos_laboratorio
                `);
                db.exec('DROP TABLE trabajos_laboratorio');
                db.exec('ALTER TABLE trabajos_laboratorio_nueva RENAME TO trabajos_laboratorio');
                db.exec('CREATE INDEX IF NOT EXISTS idx_trabajoslab_paciente ON trabajos_laboratorio (paciente_id)');
                db.exec('CREATE INDEX IF NOT EXISTS idx_trabajoslab_laboratorio ON trabajos_laboratorio (laboratorio_id)');
                db.exec('CREATE INDEX IF NOT EXISTS idx_trabajoslab_estado ON trabajos_laboratorio (estado)');
                return db.prepare('SELECT COUNT(*) AS total FROM lineas_laboratorio').get().total;
            });
            const lineasCreadas = migrarLineas();

            const violaciones = db.pragma('foreign_key_check');
            if (violaciones.length > 0) {
                throw new Error(`La migracion de lineas de laboratorio dejo ${violaciones.length} referencia(s) rota(s); restaure el respaldo de backups/ y avise`);
            }
            console.log(`Migracion: el detalle economico de las ordenes de laboratorio pasa a "lineas_laboratorio" (${lineasCreadas} orden(es) convertida(s) en orden de una linea, mismo costo total)`);
        } finally {
            db.pragma('foreign_keys = ON');
        }
    }

    // -----------------------------------------------------------------
    // Metodos de pago para la facturacion SRI: la tarjeta se separa en
    // credito/debito (codigos SRI 19 y 16) y 'otro' se retira de los
    // pagos nuevos. El CHECK de `pagos` se amplia para admitir los dos
    // metodos nuevos; 'tarjeta' y 'otro' siguen siendo validos para que
    // NINGUN pago historico cambie (un pago registrado es inmutable).
    // SQLite no permite alterar un CHECK: se reconstruye la tabla
    // copiando todas las filas. Nada referencia a pagos(id), asi que la
    // reconstruccion no arrastra otras tablas.
    // -----------------------------------------------------------------
    const tablaPagosSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pagos'").get();
    const columnasPagosMetodo = db.prepare("PRAGMA table_info(pagos)").all().map((c) => c.name);
    if (tablaPagosSql && columnasPagosMetodo.includes('concepto') && !/tarjeta_credito/.test(tablaPagosSql.sql)) {
        respaldarAntesDeActualizar(db);  // copia de seguridad antes de tocar nada
        const ampliarMetodos = db.transaction(() => {
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
                    metodo TEXT NOT NULL CHECK (metodo IN ('efectivo', 'transferencia', 'tarjeta_credito', 'tarjeta_debito', 'tarjeta', 'otro')),
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
            db.exec(`
                INSERT INTO pagos_nueva (
                    id, numero_recibo, paciente_id, plan_id, plan_item_id, plan_pago_id, concepto, monto,
                    metodo, referencia, fecha_pago, registrado_por, doctor_id,
                    anulado, motivo_anulacion, anulado_por, anulado_en, fecha_creacion
                )
                SELECT id, numero_recibo, paciente_id, plan_id, plan_item_id, plan_pago_id, concepto, monto,
                       metodo, referencia, fecha_pago, registrado_por, doctor_id,
                       anulado, motivo_anulacion, anulado_por, anulado_en, fecha_creacion
                FROM pagos
            `);
            db.exec('DROP TABLE pagos');
            db.exec('ALTER TABLE pagos_nueva RENAME TO pagos');
            db.exec('CREATE INDEX IF NOT EXISTS idx_pagos_paciente ON pagos (paciente_id)');
            db.exec('CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos (fecha_pago)');
            return db.prepare('SELECT COUNT(*) AS total FROM pagos').get().total;
        });
        const pagosConservados = ampliarMetodos();
        console.log(`Migracion: metodos de pago tarjeta_credito/tarjeta_debito habilitados en "pagos" (${pagosConservados} pago(s) existente(s) conservado(s) sin cambios)`);
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
