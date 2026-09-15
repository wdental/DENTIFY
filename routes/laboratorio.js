// =====================================================================
// Trabajos enviados a laboratorio (Fase 4C). Ver docs/fase-4c.md.
//
// Dos cuentas que NO se mezclan:
//   - lo que paga el PACIENTE por la corona -> plan_items + `pagos` (4B)
//   - lo que la clinica le paga al LABORATORIO -> `trabajos_laboratorio`
// Por eso un pago al laboratorio no consume numero de recibo ni aparece
// en los totales de Caja: es un egreso, no un ingreso.
//
// Roles: cualquier usuario con sesion crea trabajos, los envia, recibe e
// instala (es trabajo operativo diario). Solo admin administra el
// catalogo de laboratorios, marca/revierte pagos y cancela trabajos.
// =====================================================================
const express = require('express');
const db = require('../db/conexion');
const { requiereSesion, requierePermiso } = require('../middleware/auth');
const { generarNumeroOrdenLaboratorio } = require('../utils/numeroOrdenLaboratorio');
const { hoyLocal } = require('../utils/fechaLocal');

const router = express.Router();
router.use(requiereSesion);

const ESTADOS = ['por_enviar', 'enviado', 'recibido', 'instalado', 'cancelado'];
const ETIQUETAS_ESTADO = {
    por_enviar: 'Por enviar',
    enviado: 'En laboratorio',
    recibido: 'Recibido',
    instalado: 'Entregado al paciente',
    cancelado: 'Cancelado'
};
const METODOS_PAGO = ['efectivo', 'transferencia', 'tarjeta', 'otro'];
const MOTIVOS_ENVIO = ['inicial', 'prueba', 'ajuste', 'reparacion', 'otro'];
const ETIQUETAS_MOTIVO = {
    inicial: 'Envío inicial',
    prueba: 'Prueba en boca',
    ajuste: 'Ajuste',
    reparacion: 'Reparación',
    otro: 'Otro'
};
const ETIQUETAS_ESTADO_PAGO = {
    sin_costo: 'Sin costo registrado',
    pendiente: 'Pendiente',
    parcial: 'Abonado en parte',
    pagado: 'Pagado'
};

// Una orden lleva UNA O MAS lineas, cada una con su cantidad y costo
// unitario (ej. 4 coronas a $90 y 1 provisional a $15). El total nunca se
// escribe a mano: es la suma de las lineas, mas lo que el laboratorio
// cobre por los reenvios. Devuelve { lineas, base } o { error }.
// Compatibilidad: un payload viejo con cantidad/costo_unitario sueltos se
// interpreta como una orden de una sola linea con el tipo de trabajo.
const MAXIMO_LINEAS = 30;

function normalizarLineas(datos) {
    let lineas = Array.isArray(datos.lineas) ? datos.lineas : null;
    if (!lineas) {
        lineas = [{ descripcion: datos.tipo_trabajo, cantidad: datos.cantidad, costo_unitario: datos.costo_unitario }];
    }
    if (lineas.length === 0) return { error: 'La orden debe tener al menos una línea' };
    if (lineas.length > MAXIMO_LINEAS) return { error: `La orden no puede llevar más de ${MAXIMO_LINEAS} líneas` };

    const limpias = [];
    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i] || {};
        const descripcion = String(linea.descripcion || '').trim();
        if (!descripcion) return { error: `La línea ${i + 1} no tiene descripción` };

        const vacio = (v) => v === undefined || v === null || v === '';
        const cantidad = vacio(linea.cantidad) ? 1 : Number(linea.cantidad);
        if (!Number.isInteger(cantidad) || cantidad < 1) {
            return { error: `La cantidad de la línea ${i + 1} debe ser un número entero de 1 o más` };
        }
        const unitario = vacio(linea.costo_unitario) ? 0 : Number(linea.costo_unitario);
        if (!Number.isFinite(unitario) || unitario < 0) {
            return { error: `El costo unitario de la línea ${i + 1} no es válido` };
        }
        limpias.push({ orden: i + 1, descripcion, cantidad, costo_unitario: Math.round(unitario * 100) / 100 });
    }
    const base = Math.round(limpias.reduce((suma, l) => suma + l.cantidad * l.costo_unitario, 0) * 100) / 100;
    return { lineas: limpias, base };
}

function lineasDelTrabajo(trabajoId) {
    return db.prepare('SELECT * FROM lineas_laboratorio WHERE trabajo_id = ? ORDER BY orden, id').all(trabajoId);
}

function guardarLineasDelTrabajo(trabajoId, lineas) {
    db.prepare('DELETE FROM lineas_laboratorio WHERE trabajo_id = ?').run(trabajoId);
    const insertar = db.prepare(
        'INSERT INTO lineas_laboratorio (trabajo_id, orden, descripcion, cantidad, costo_unitario) VALUES (?, ?, ?, ?, ?)'
    );
    lineas.forEach((l) => insertar.run(trabajoId, l.orden, l.descripcion, l.cantidad, l.costo_unitario));
}

// Sugerencias para el campo "tipo de trabajo" (texto libre: la lista solo
// alimenta el datalist del formulario, nunca bloquea lo que se escriba).
const TIPOS_SUGERIDOS = [
    'Corona de zirconio', 'Corona metal-porcelana', 'Corona provisional', 'Incrustación',
    'Carilla', 'Prótesis parcial removible', 'Prótesis total', 'Placa de relajación',
    'Férula', 'Guía quirúrgica', 'Alineadores', 'Retenedor de ortodoncia',
    'Modelo de estudio', 'Aparatología ortodóncica', 'Otro'
];



// -----------------------------------------------------------------
// Catalogo de laboratorios
// -----------------------------------------------------------------
router.get('/laboratorios', requierePermiso('laboratorio.ver'), (req, res) => {
    const soloActivos = req.query.activo === '1';
    const filas = db.prepare(`
        SELECT * FROM laboratorios
        ${soloActivos ? 'WHERE activo = 1' : ''}
        ORDER BY activo DESC, nombre
    `).all();
    res.json(filas);
});

router.post('/laboratorios', requierePermiso('catalogos.laboratorios'), (req, res) => {
    const { nombre, contacto, telefono, email, direccion, datos_transferencia, notas } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre del laboratorio es obligatorio' });

    const resultado = db.prepare(`
        INSERT INTO laboratorios (nombre, contacto, telefono, email, direccion, datos_transferencia, notas, activo, creado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
        nombre.trim(), (contacto || '').trim() || null, (telefono || '').trim() || null,
        (email || '').trim() || null, (direccion || '').trim() || null,
        (datos_transferencia || '').trim() || null, (notas || '').trim() || null,
        req.session.usuario.id
    );
    res.json({ ok: true, id: resultado.lastInsertRowid });
});

router.put('/laboratorios/:id', requierePermiso('catalogos.laboratorios'), (req, res) => {
    const lab = db.prepare('SELECT id FROM laboratorios WHERE id = ?').get(req.params.id);
    if (!lab) return res.status(404).json({ error: 'Laboratorio no encontrado' });

    const { nombre, contacto, telefono, email, direccion, datos_transferencia, notas, activo } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre del laboratorio es obligatorio' });

    db.prepare(`
        UPDATE laboratorios
        SET nombre = ?, contacto = ?, telefono = ?, email = ?, direccion = ?,
            datos_transferencia = ?, notas = ?, activo = ?
        WHERE id = ?
    `).run(
        nombre.trim(), (contacto || '').trim() || null, (telefono || '').trim() || null,
        (email || '').trim() || null, (direccion || '').trim() || null,
        (datos_transferencia || '').trim() || null, (notas || '').trim() || null,
        activo === 0 || activo === false ? 0 : 1, req.params.id
    );
    res.json({ ok: true });
});

router.get('/tipos-sugeridos', (req, res) => res.json(TIPOS_SUGERIDOS));
router.get('/motivos-envio', (req, res) => res.json(
    MOTIVOS_ENVIO.filter((m) => m !== 'inicial').map((m) => ({ valor: m, etiqueta: ETIQUETAS_MOTIVO[m] }))
));
router.get('/metodos-pago', (req, res) => res.json(METODOS_PAGO));

// -----------------------------------------------------------------
// Consulta de trabajos
// -----------------------------------------------------------------
const SQL_TRABAJO = `
    SELECT t.*,
           l.nombre AS laboratorio_nombre, l.telefono AS laboratorio_telefono,
           l.contacto AS laboratorio_contacto, l.datos_transferencia AS laboratorio_datos_transferencia,
           p.nombres AS paciente_nombres, p.apellidos AS paciente_apellidos,
           p.numero_historia AS paciente_historia,
           doc.nombre_completo AS doctor_nombre,
           u.nombre AS creado_por_nombre,
           c.fecha AS cita_fecha, c.hora_inicio AS cita_hora_inicio,
           (SELECT COALESCE(SUM(pl.monto), 0) FROM pagos_laboratorio pl
             WHERE pl.trabajo_id = t.id AND pl.anulado = 0) AS abonado,
           (SELECT COUNT(*) FROM envios_laboratorio el WHERE el.trabajo_id = t.id) AS total_envios,
           (SELECT COUNT(*) FROM lineas_laboratorio li WHERE li.trabajo_id = t.id) AS total_lineas,
           (SELECT li.cantidad FROM lineas_laboratorio li WHERE li.trabajo_id = t.id
             ORDER BY li.orden, li.id LIMIT 1) AS linea1_cantidad,
           (SELECT li.costo_unitario FROM lineas_laboratorio li WHERE li.trabajo_id = t.id
             ORDER BY li.orden, li.id LIMIT 1) AS linea1_costo_unitario,
           (SELECT el.motivo FROM envios_laboratorio el WHERE el.trabajo_id = t.id
             ORDER BY el.numero DESC LIMIT 1) AS motivo_envio_actual
    FROM trabajos_laboratorio t
    JOIN laboratorios l ON l.id = t.laboratorio_id
    JOIN pacientes p ON p.id = t.paciente_id
    LEFT JOIN doctores doc ON doc.id = t.doctor_id
    LEFT JOIN usuarios u ON u.id = t.creado_por
    LEFT JOIN citas c ON c.id = t.cita_id
`;

// Marca de atraso: el trabajo sigue en el laboratorio y o bien paso la
// fecha prometida, o la cita de instalacion es en 2 dias o menos. Es la
// alerta que evita que el paciente llegue y el trabajo no haya llegado.
function redondear(valor) {
    return Math.round((Number(valor) || 0) * 100) / 100;
}

function decorarTrabajo(fila) {
    const hoy = hoyLocal();
    let documentos = [];
    try { documentos = fila.documentos_json ? JSON.parse(fila.documentos_json) : []; } catch (e) { documentos = []; }

    // El pago al laboratorio no es un si/no: se suma lo abonado contra el
    // costo total, igual que el saldo de un paciente en utils/finanzas.js.
    const costo = redondear(fila.costo);
    const abonado = redondear(fila.abonado);
    const saldo = redondear(costo - abonado);
    const cancelado = fila.estado === 'cancelado';
    const estadoPago = costo <= 0 ? 'sin_costo'
        : abonado <= 0 ? 'pendiente'
        : saldo > 0 ? 'parcial' : 'pagado';

    const enLaboratorio = fila.estado === 'enviado';
    const atrasado = enLaboratorio && !!fila.fecha_estimada && fila.fecha_estimada < hoy;
    const citaEnRiesgo = enLaboratorio && !!fila.cita_fecha && fila.cita_fecha >= hoy &&
        Math.round((new Date(fila.cita_fecha + 'T00:00:00') - new Date(hoy + 'T00:00:00')) / 86400000) <= 2;

    return {
        ...fila,
        costo,
        abonado,
        saldo,
        estado_pago: estadoPago,
        estado_pago_etiqueta: ETIQUETAS_ESTADO_PAGO[estadoPago],
        pagado: estadoPago === 'pagado',
        documentos_ids: documentos,
        estado_etiqueta: ETIQUETAS_ESTADO[fila.estado] || fila.estado,
        motivo_envio_actual_etiqueta: ETIQUETAS_MOTIVO[fila.motivo_envio_actual] || null,
        atrasado,
        cita_en_riesgo: citaEnRiesgo,
        // Un trabajo cancelado no se le debe al laboratorio.
        por_pagar: !cancelado && saldo > 0
    };
}

// GET /api/laboratorio/trabajos?estado=&laboratorio_id=&paciente_id=&vivos=1&por_pagar=1&busqueda=
router.get('/trabajos', requierePermiso('laboratorio.ver'), (req, res) => {
    const condiciones = [];
    const parametros = [];

    if (req.query.estado) { condiciones.push('t.estado = ?'); parametros.push(req.query.estado); }
    if (req.query.vivos === '1') { condiciones.push("t.estado IN ('por_enviar', 'enviado', 'recibido')"); }
    if (req.query.laboratorio_id) { condiciones.push('t.laboratorio_id = ?'); parametros.push(req.query.laboratorio_id); }
    if (req.query.paciente_id) { condiciones.push('t.paciente_id = ?'); parametros.push(req.query.paciente_id); }
    if (req.query.por_pagar === '1') {
        condiciones.push(`t.estado != 'cancelado' AND t.costo > (
            SELECT COALESCE(SUM(pl.monto), 0) FROM pagos_laboratorio pl WHERE pl.trabajo_id = t.id AND pl.anulado = 0
        )`);
    }
    if (req.query.busqueda) {
        condiciones.push('(p.nombres LIKE ? OR p.apellidos LIKE ? OR t.numero_orden LIKE ? OR t.tipo_trabajo LIKE ?)');
        const like = `%${req.query.busqueda}%`;
        parametros.push(like, like, like, like);
    }

    const sql = `${SQL_TRABAJO}
        ${condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : ''}
        ORDER BY CASE t.estado WHEN 'enviado' THEN 0 WHEN 'por_enviar' THEN 1 WHEN 'recibido' THEN 2 ELSE 3 END,
                 COALESCE(t.fecha_estimada, t.fecha_envio, t.fecha_creacion) ASC`;

    res.json(db.prepare(sql).all(...parametros).map(decorarTrabajo));
});

router.get('/trabajos/:id', requierePermiso('laboratorio.ver'), (req, res) => {
    const fila = db.prepare(`${SQL_TRABAJO} WHERE t.id = ?`).get(req.params.id);
    if (!fila) return res.status(404).json({ error: 'Trabajo no encontrado' });

    const decorado = decorarTrabajo(fila);
    decorado.lineas = lineasDelTrabajo(fila.id);
    decorado.abonos = db.prepare(`
        SELECT pl.*, u.nombre AS registrado_por_nombre, ua.nombre AS anulado_por_nombre
        FROM pagos_laboratorio pl
        LEFT JOIN usuarios u ON u.id = pl.registrado_por
        LEFT JOIN usuarios ua ON ua.id = pl.anulado_por
        WHERE pl.trabajo_id = ?
        ORDER BY pl.fecha, pl.id
    `).all(fila.id);
    decorado.envios = db.prepare(`
        SELECT el.*, u.nombre AS registrado_por_nombre
        FROM envios_laboratorio el
        LEFT JOIN usuarios u ON u.id = el.registrado_por
        WHERE el.trabajo_id = ?
        ORDER BY el.numero
    `).all(fila.id).map((e) => ({ ...e, motivo_etiqueta: ETIQUETAS_MOTIVO[e.motivo] || e.motivo }));
    if (decorado.documentos_ids.length > 0) {
        const marcadores = decorado.documentos_ids.map(() => '?').join(',');
        decorado.documentos = db.prepare(
            `SELECT id, nombre_original, nombre_archivo, tipo FROM documentos_pacientes WHERE id IN (${marcadores})`
        ).all(...decorado.documentos_ids);
    } else {
        decorado.documentos = [];
    }
    res.json(decorado);
});

// Indicadores para el panel principal y la cabecera de la pagina.
router.get('/resumen', requierePermiso('laboratorio.ver'), (req, res) => {
    const hoy = hoyLocal();

    const enLaboratorio = db.prepare("SELECT COUNT(*) AS total FROM trabajos_laboratorio WHERE estado = 'enviado'").get().total;
    const atrasados = db.prepare(
        "SELECT COUNT(*) AS total FROM trabajos_laboratorio WHERE estado = 'enviado' AND fecha_estimada IS NOT NULL AND fecha_estimada < ?"
    ).get(hoy).total;
    const porPagar = db.prepare(`
        SELECT COALESCE(SUM(saldo), 0) AS total, COUNT(*) AS cantidad FROM (
            SELECT t.costo - COALESCE((SELECT SUM(pl.monto) FROM pagos_laboratorio pl
                                        WHERE pl.trabajo_id = t.id AND pl.anulado = 0), 0) AS saldo
            FROM trabajos_laboratorio t
            WHERE t.estado != 'cancelado'
        ) WHERE saldo > 0
    `).get();
    const laboratoriosConDeuda = db.prepare(`
        SELECT COUNT(DISTINCT laboratorio_id) AS total FROM trabajos_laboratorio t
        WHERE t.estado != 'cancelado' AND t.costo > COALESCE(
            (SELECT SUM(pl.monto) FROM pagos_laboratorio pl WHERE pl.trabajo_id = t.id AND pl.anulado = 0), 0)
    `).get().total;

    res.json({
        en_laboratorio: enLaboratorio,
        atrasados,
        por_pagar_total: porPagar.total,
        por_pagar_cantidad: porPagar.cantidad,
        laboratorios_con_deuda: laboratoriosConDeuda
    });
});

// Cuentas por pagar agrupadas por laboratorio.
router.get('/cuentas-por-pagar', requierePermiso('laboratorio.ver'), (req, res) => {
    const filas = db.prepare(`${SQL_TRABAJO}
        WHERE t.estado != 'cancelado' AND t.costo > COALESCE(
            (SELECT SUM(pl.monto) FROM pagos_laboratorio pl WHERE pl.trabajo_id = t.id AND pl.anulado = 0), 0)
        ORDER BY l.nombre, COALESCE(t.fecha_recepcion, t.fecha_envio, t.fecha_creacion)`).all().map(decorarTrabajo);

    const porLaboratorio = {};
    filas.forEach((t) => {
        if (!porLaboratorio[t.laboratorio_id]) {
            porLaboratorio[t.laboratorio_id] = {
                laboratorio_id: t.laboratorio_id,
                laboratorio_nombre: t.laboratorio_nombre,
                laboratorio_telefono: t.laboratorio_telefono,
                laboratorio_datos_transferencia: t.laboratorio_datos_transferencia,
                total: 0,
                trabajos: []
            };
        }
        porLaboratorio[t.laboratorio_id].total += t.saldo;
        porLaboratorio[t.laboratorio_id].trabajos.push(t);
    });

    const grupos = Object.values(porLaboratorio);
    res.json({ grupos, total_general: grupos.reduce((suma, g) => suma + g.total, 0) });
});

// Historial de pagos ya hechos a laboratorios, agrupados por factura.
router.get('/pagos-realizados', requierePermiso('laboratorio.ver'), (req, res) => {
    const mes = req.query.mes || hoyLocal().slice(0, 7);
    const filas = db.prepare(`
        SELECT pl.*, t.numero_orden, t.tipo_trabajo, t.costo AS costo_trabajo,
               l.nombre AS laboratorio_nombre,
               p.nombres AS paciente_nombres, p.apellidos AS paciente_apellidos,
               u.nombre AS registrado_por_nombre
        FROM pagos_laboratorio pl
        JOIN trabajos_laboratorio t ON t.id = pl.trabajo_id
        JOIN laboratorios l ON l.id = t.laboratorio_id
        JOIN pacientes p ON p.id = t.paciente_id
        LEFT JOIN usuarios u ON u.id = pl.registrado_por
        WHERE substr(pl.fecha, 1, 7) = ?
        ORDER BY pl.fecha DESC, l.nombre
    `).all(mes);

    res.json({
        mes,
        pagos: filas,
        total: filas.filter((p) => !p.anulado).reduce((suma, p) => suma + Number(p.monto), 0)
    });
});

// -----------------------------------------------------------------
// Alta y edicion de trabajos
// -----------------------------------------------------------------
function validarDatosTrabajo(req, res, datos) {
    if (!datos.laboratorio_id) { res.status(400).json({ error: 'Seleccione el laboratorio' }); return false; }
    const lab = db.prepare('SELECT id FROM laboratorios WHERE id = ?').get(datos.laboratorio_id);
    if (!lab) { res.status(400).json({ error: 'Laboratorio no encontrado' }); return false; }

    if (!datos.tipo_trabajo || !String(datos.tipo_trabajo).trim()) {
        res.status(400).json({ error: 'Indique el tipo de trabajo' }); return false;
    }
    if (datos.fecha_estimada && datos.fecha_envio && datos.fecha_estimada < datos.fecha_envio) {
        res.status(400).json({ error: 'La fecha estimada de entrega no puede ser anterior al envío' }); return false;
    }
    return true;
}

// -----------------------------------------------------------------
// Envios: cada ida y vuelta del trabajo al laboratorio, dentro de la
// MISMA orden. El envio 1 es el inicial; los siguientes son la prueba en
// boca, un ajuste o una reparacion. El numero de orden nunca cambia:
// es el que el laboratorio tiene anotado.
// -----------------------------------------------------------------
function envioAbierto(trabajoId) {
    return db.prepare(
        'SELECT * FROM envios_laboratorio WHERE trabajo_id = ? AND fecha_recepcion IS NULL ORDER BY numero DESC LIMIT 1'
    ).get(trabajoId);
}

function registrarEnvio(trabajoId, datos) {
    const siguiente = db.prepare(
        'SELECT COALESCE(MAX(numero), 0) AS maximo FROM envios_laboratorio WHERE trabajo_id = ?'
    ).get(trabajoId).maximo + 1;

    db.prepare(`
        INSERT INTO envios_laboratorio (trabajo_id, numero, motivo, fecha_envio, fecha_estimada, costo_adicional, notas, registrado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        trabajoId, siguiente, datos.motivo || 'ajuste',
        datos.fecha_envio || null, datos.fecha_estimada || null,
        Number(datos.costo_adicional) || 0, (datos.notas || '').trim() || null,
        datos.usuarioId || null
    );
    return siguiente;
}

// El total de la orden es la suma de sus lineas mas lo que el
// laboratorio haya cobrado por los reenvios.
function baseDelTrabajo(trabajoId) {
    return redondear(db.prepare(
        'SELECT COALESCE(SUM(cantidad * costo_unitario), 0) AS base FROM lineas_laboratorio WHERE trabajo_id = ?'
    ).get(trabajoId).base);
}

function recalcularCostoTrabajo(trabajoId) {
    const adicionales = db.prepare(
        'SELECT COALESCE(SUM(costo_adicional), 0) AS total FROM envios_laboratorio WHERE trabajo_id = ?'
    ).get(trabajoId).total;
    const total = redondear(baseDelTrabajo(trabajoId) + adicionales);
    db.prepare('UPDATE trabajos_laboratorio SET costo = ? WHERE id = ?').run(total, trabajoId);
}

router.post('/trabajos', requierePermiso('laboratorio.gestionar'), (req, res) => {
    const datos = req.body;

    const paciente = db.prepare('SELECT id FROM pacientes WHERE id = ?').get(datos.paciente_id);
    if (!paciente) return res.status(400).json({ error: 'Paciente no encontrado' });
    if (!validarDatosTrabajo(req, res, datos)) return;

    // Si ya se indico fecha de envio, el trabajo nace "enviado".
    const estado = datos.fecha_envio ? 'enviado' : 'por_enviar';

    const detalle = normalizarLineas(datos);
    if (detalle.error) return res.status(400).json({ error: detalle.error });

    const transaccion = db.transaction(() => {
        const numeroOrden = generarNumeroOrdenLaboratorio(datos.fecha_envio || hoyLocal());
        const resultado = db.prepare(`
            INSERT INTO trabajos_laboratorio (
                numero_orden, paciente_id, laboratorio_id, doctor_id, tipo_trabajo, descripcion,
                piezas, color, indicaciones, estado, fecha_envio, fecha_estimada,
                plan_item_id, cita_id, documentos_json,
                costo, notas, creado_por
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            numeroOrden, datos.paciente_id, datos.laboratorio_id, datos.doctor_id || null,
            String(datos.tipo_trabajo).trim(), (datos.descripcion || '').trim() || null,
            (datos.piezas || '').trim() || null, (datos.color || '').trim() || null,
            (datos.indicaciones || '').trim() || null, estado,
            datos.fecha_envio || null, datos.fecha_estimada || null,
            datos.plan_item_id || null, datos.cita_id || null,
            Array.isArray(datos.documentos_ids) && datos.documentos_ids.length ? JSON.stringify(datos.documentos_ids) : null,
            detalle.base,
            (datos.notas || '').trim() || null,
            req.session.usuario.id
        );
        guardarLineasDelTrabajo(resultado.lastInsertRowid, detalle.lineas);
        // Si ya salio hacia el laboratorio, queda registrado el envio 1.
        if (estado === 'enviado') {
            registrarEnvio(resultado.lastInsertRowid, {
                motivo: 'inicial',
                fecha_envio: datos.fecha_envio,
                fecha_estimada: datos.fecha_estimada || null,
                usuarioId: req.session.usuario.id
            });
        }
        return { id: resultado.lastInsertRowid, numeroOrden };
    });

    const creado = transaccion();
    res.json({ ok: true, id: creado.id, numero_orden: creado.numeroOrden });
});

// Edicion: el costo queda fijo en cuanto hay abonos, porque quedo
// conciliado con la factura del laboratorio; para corregirlo, un admin
// anula los abonos primero.
router.put('/trabajos/:id', requierePermiso('laboratorio.gestionar'), (req, res) => {
    const trabajo = db.prepare('SELECT * FROM trabajos_laboratorio WHERE id = ?').get(req.params.id);
    if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' });
    if (trabajo.estado === 'cancelado') return res.status(400).json({ error: 'El trabajo está cancelado' });

    const datos = req.body;
    if (!validarDatosTrabajo(req, res, datos)) return;

    const detalle = normalizarLineas(datos);
    if (detalle.error) return res.status(400).json({ error: detalle.error });

    // Con abonos ya registrados, el costo queda conciliado con lo que se le
    // pago al laboratorio: cambiarlo dejaria el saldo mintiendo. El resto
    // del trabajo (fechas, indicaciones, notas, descripciones de las
    // lineas) se sigue pudiendo corregir mientras el total no cambie.
    // Se compara contra la suma de las lineas, no contra `costo`: el costo
    // guardado ya incluye lo que el laboratorio cobro por los reenvios.
    const abonado = db.prepare(
        'SELECT COALESCE(SUM(monto), 0) AS total FROM pagos_laboratorio WHERE trabajo_id = ? AND anulado = 0'
    ).get(req.params.id).total;
    if (abonado > 0 && detalle.base !== baseDelTrabajo(trabajo.id)) {
        return res.status(400).json({ error: 'Este trabajo ya tiene abonos registrados: para cambiar el costo, un administrador debe anular los abonos primero.' });
    }

    db.transaction(() => {
        db.prepare(`
            UPDATE trabajos_laboratorio
            SET laboratorio_id = ?, doctor_id = ?, tipo_trabajo = ?, descripcion = ?, piezas = ?,
                color = ?, indicaciones = ?, fecha_envio = ?, fecha_estimada = ?, fecha_recepcion = ?,
                fecha_instalacion = ?, plan_item_id = ?, cita_id = ?, documentos_json = ?, notas = ?
            WHERE id = ?
        `).run(
            datos.laboratorio_id, datos.doctor_id || null, String(datos.tipo_trabajo).trim(),
            (datos.descripcion || '').trim() || null, (datos.piezas || '').trim() || null,
            (datos.color || '').trim() || null, (datos.indicaciones || '').trim() || null,
            datos.fecha_envio || null, datos.fecha_estimada || null,
            datos.fecha_recepcion || null, datos.fecha_instalacion || null,
            datos.plan_item_id || null, datos.cita_id || null,
            Array.isArray(datos.documentos_ids) && datos.documentos_ids.length ? JSON.stringify(datos.documentos_ids) : null,
            (datos.notas || '').trim() || null,
            req.params.id
        );
        guardarLineasDelTrabajo(trabajo.id, detalle.lineas);
        // El total vuelve a incluir lo que el laboratorio haya cobrado por
        // los reenvios, que no se toca desde este formulario.
        recalcularCostoTrabajo(req.params.id);
    })();
    res.json({ ok: true });
});

// Avance de estado: enviar / recibir / instalar. Cada paso registra su
// fecha; nunca en el futuro (documenta algo que ya pasó).
router.put('/trabajos/:id/estado', requierePermiso('laboratorio.gestionar'), (req, res) => {
    const trabajo = db.prepare('SELECT * FROM trabajos_laboratorio WHERE id = ?').get(req.params.id);
    if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' });
    if (trabajo.estado === 'cancelado') return res.status(400).json({ error: 'El trabajo está cancelado' });

    const { estado, fecha, fecha_estimada, evolucion_id } = req.body;
    if (!ESTADOS.includes(estado) || estado === 'cancelado') {
        return res.status(400).json({ error: 'Estado no válido' });
    }

    const fechaPaso = fecha || hoyLocal();
    if (fechaPaso > hoyLocal()) {
        return res.status(400).json({ error: 'La fecha no puede ser futura' });
    }

    if (estado === 'enviado') {
        if (fecha_estimada && fecha_estimada < fechaPaso) {
            return res.status(400).json({ error: 'La fecha estimada de entrega no puede ser anterior al envío' });
        }
        db.transaction(() => {
            db.prepare("UPDATE trabajos_laboratorio SET estado = 'enviado', fecha_envio = ?, fecha_estimada = COALESCE(?, fecha_estimada), fecha_recepcion = NULL WHERE id = ?")
                .run(fechaPaso, fecha_estimada || null, req.params.id);
            // Si habia un envio sin cerrar se actualiza; si no, este es uno
            // nuevo (el primero, o una vuelta al laboratorio).
            const abierto = envioAbierto(req.params.id);
            if (abierto) {
                db.prepare('UPDATE envios_laboratorio SET fecha_envio = ?, fecha_estimada = COALESCE(?, fecha_estimada) WHERE id = ?')
                    .run(fechaPaso, fecha_estimada || null, abierto.id);
            } else {
                const hayPrevios = db.prepare('SELECT COUNT(*) AS total FROM envios_laboratorio WHERE trabajo_id = ?').get(req.params.id).total > 0;
                registrarEnvio(req.params.id, {
                    motivo: hayPrevios ? 'ajuste' : 'inicial',
                    fecha_envio: fechaPaso,
                    fecha_estimada: fecha_estimada || null,
                    usuarioId: req.session.usuario.id
                });
            }
        })();
    } else if (estado === 'recibido') {
        db.transaction(() => {
            db.prepare("UPDATE trabajos_laboratorio SET estado = 'recibido', fecha_recepcion = ? WHERE id = ?")
                .run(fechaPaso, req.params.id);
            const abierto = envioAbierto(req.params.id);
            if (abierto) {
                db.prepare('UPDATE envios_laboratorio SET fecha_recepcion = ? WHERE id = ?').run(fechaPaso, abierto.id);
            }
        })();
    } else if (estado === 'instalado') {
        if (evolucion_id) {
            const evolucion = db.prepare('SELECT id FROM evoluciones WHERE id = ? AND paciente_id = ?').get(evolucion_id, trabajo.paciente_id);
            if (!evolucion) return res.status(400).json({ error: 'La evolución indicada no pertenece a este paciente' });
        }
        db.prepare("UPDATE trabajos_laboratorio SET estado = 'instalado', fecha_instalacion = ?, fecha_recepcion = COALESCE(fecha_recepcion, ?), evolucion_id = COALESCE(?, evolucion_id) WHERE id = ?")
            .run(fechaPaso, fechaPaso, evolucion_id || null, req.params.id);
    } else {
        db.prepare("UPDATE trabajos_laboratorio SET estado = 'por_enviar' WHERE id = ?").run(req.params.id);
    }

    res.json({ ok: true });
});

// Reenvio al laboratorio: NO crea una orden nueva. Suma un ENVIO al
// sub-registro de la misma orden (prueba en boca, ajuste, reparacion) y
// deja el trabajo otra vez "en laboratorio". El numero de orden se
// mantiene, que es el que el laboratorio tiene anotado: una protesis
// total puede ir y volver varias veces y sigue siendo el mismo trabajo.
router.post('/trabajos/:id/envios', requierePermiso('laboratorio.gestionar'), (req, res) => {
    const trabajo = db.prepare('SELECT * FROM trabajos_laboratorio WHERE id = ?').get(req.params.id);
    if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' });
    if (trabajo.estado === 'cancelado') return res.status(400).json({ error: 'El trabajo está cancelado' });
    if (trabajo.estado === 'por_enviar') {
        return res.status(400).json({ error: 'Este trabajo todavía no ha salido: use "Enviar" para registrar el primer envío.' });
    }
    if (envioAbierto(req.params.id)) {
        return res.status(400).json({ error: 'El trabajo ya está en el laboratorio: registre primero su recepción.' });
    }

    const datos = req.body;
    const motivo = MOTIVOS_ENVIO.includes(datos.motivo) && datos.motivo !== 'inicial' ? datos.motivo : 'ajuste';

    const fechaEnvio = datos.fecha_envio || hoyLocal();
    if (fechaEnvio > hoyLocal()) return res.status(400).json({ error: 'La fecha de envío no puede ser futura' });
    if (datos.fecha_estimada && datos.fecha_estimada < fechaEnvio) {
        return res.status(400).json({ error: 'La fecha estimada de entrega no puede ser anterior al envío' });
    }
    const costoAdicional = Number(datos.costo_adicional) || 0;
    if (costoAdicional < 0) return res.status(400).json({ error: 'El costo adicional no es válido' });

    const numero = db.transaction(() => {
        const n = registrarEnvio(req.params.id, {
            motivo,
            fecha_envio: fechaEnvio,
            fecha_estimada: datos.fecha_estimada || null,
            costo_adicional: costoAdicional,
            notas: datos.notas,
            usuarioId: req.session.usuario.id
        });
        db.prepare(`
            UPDATE trabajos_laboratorio
            SET estado = 'enviado', fecha_envio = ?, fecha_estimada = ?, fecha_recepcion = NULL
            WHERE id = ?
        `).run(fechaEnvio, datos.fecha_estimada || null, req.params.id);
        // Si el laboratorio cobra el reenvio, sube el total de la orden.
        if (costoAdicional > 0) recalcularCostoTrabajo(req.params.id);
        return n;
    })();

    res.json({ ok: true, numero_envio: numero, numero_orden: trabajo.numero_orden });
});

router.put('/trabajos/:id/cancelar', requierePermiso('laboratorio.cancelar'), (req, res) => {
    const trabajo = db.prepare('SELECT * FROM trabajos_laboratorio WHERE id = ?').get(req.params.id);
    if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' });
    const abonadoCancelar = db.prepare(
        'SELECT COALESCE(SUM(monto), 0) AS total FROM pagos_laboratorio WHERE trabajo_id = ? AND anulado = 0'
    ).get(req.params.id).total;
    if (abonadoCancelar > 0) return res.status(400).json({ error: 'No se puede cancelar un trabajo con abonos registrados: anúlelos primero.' });

    const motivo = (req.body.motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'Debe indicar el motivo de la cancelación' });

    db.prepare(`
        UPDATE trabajos_laboratorio
        SET estado = 'cancelado', motivo_cancelacion = ?, cancelado_por = ?, cancelado_en = datetime('now', 'localtime')
        WHERE id = ?
    `).run(motivo, req.session.usuario.id, req.params.id);
    res.json({ ok: true });
});

// -----------------------------------------------------------------
// Abonos al laboratorio (solo admin).
//
// La clinica paga en partes, asi que un pago es un ABONO contra el costo
// del trabajo, no un si/no. Se pueden registrar varios trabajos del mismo
// laboratorio en una sola operacion (el caso de la factura mensual): la
// referencia compartida es lo que los agrupa, y para cada trabajo se
// abona lo que se indique -por defecto su saldo completo-.
//
// Sigue siendo un EGRESO: no genera recibo ni entra en los totales de
// Caja. Un abono no se edita; solo un admin lo anula con motivo.
// -----------------------------------------------------------------
function saldoDelTrabajo(trabajoId) {
    const fila = db.prepare(`
        SELECT t.costo, COALESCE((SELECT SUM(pl.monto) FROM pagos_laboratorio pl
                                   WHERE pl.trabajo_id = t.id AND pl.anulado = 0), 0) AS abonado
        FROM trabajos_laboratorio t WHERE t.id = ?
    `).get(trabajoId);
    if (!fila) return null;
    return redondear(Number(fila.costo) - Number(fila.abonado));
}

router.post('/pagos', requierePermiso('laboratorio.pagar'), (req, res) => {
    const { trabajo_ids, fecha, metodo, referencia, notas, montos } = req.body;

    if (!Array.isArray(trabajo_ids) || trabajo_ids.length === 0) {
        return res.status(400).json({ error: 'Seleccione al menos un trabajo' });
    }
    if (!METODOS_PAGO.includes(metodo)) return res.status(400).json({ error: 'Método de pago no válido' });

    const fechaPago = fecha || hoyLocal();
    if (fechaPago > hoyLocal()) return res.status(400).json({ error: 'La fecha del pago no puede ser futura' });

    const marcadores = trabajo_ids.map(() => '?').join(',');
    const trabajos = db.prepare(`SELECT * FROM trabajos_laboratorio WHERE id IN (${marcadores})`).all(...trabajo_ids);
    if (trabajos.length !== trabajo_ids.length) return res.status(400).json({ error: 'Algún trabajo no existe' });

    const cancelado = trabajos.find((tr) => tr.estado === 'cancelado');
    if (cancelado) return res.status(400).json({ error: `El trabajo ${cancelado.numero_orden} está cancelado` });

    // `montos` es opcional: {trabajoId: monto}. Sin el, se abona el saldo
    // completo de cada trabajo seleccionado.
    const porTrabajo = [];
    for (const trabajo of trabajos) {
        const saldo = saldoDelTrabajo(trabajo.id);
        if (saldo <= 0) {
            return res.status(400).json({ error: `El trabajo ${trabajo.numero_orden} no tiene saldo pendiente` });
        }
        const solicitado = montos && montos[trabajo.id] !== undefined && montos[trabajo.id] !== null && montos[trabajo.id] !== ''
            ? redondear(montos[trabajo.id])
            : saldo;
        if (!Number.isFinite(solicitado) || solicitado <= 0) {
            return res.status(400).json({ error: `El monto del abono a ${trabajo.numero_orden} no es válido` });
        }
        if (solicitado > saldo) {
            return res.status(400).json({ error: `El abono a ${trabajo.numero_orden} ($${solicitado.toFixed(2)}) supera su saldo pendiente ($${saldo.toFixed(2)})` });
        }
        porTrabajo.push({ trabajo, monto: solicitado });
    }

    const insertar = db.prepare(`
        INSERT INTO pagos_laboratorio (trabajo_id, monto, fecha, metodo, referencia, notas, registrado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
        porTrabajo.forEach(({ trabajo, monto }) => insertar.run(
            trabajo.id, monto, fechaPago, metodo,
            (referencia || '').trim() || null, (notas || '').trim() || null,
            req.session.usuario.id
        ));
    })();

    res.json({
        ok: true,
        cantidad: porTrabajo.length,
        total: redondear(porTrabajo.reduce((suma, p) => suma + p.monto, 0))
    });
});

router.put('/pagos/:id/anular', requierePermiso('laboratorio.pagar'), (req, res) => {
    const abono = db.prepare('SELECT * FROM pagos_laboratorio WHERE id = ?').get(req.params.id);
    if (!abono) return res.status(404).json({ error: 'Abono no encontrado' });
    if (abono.anulado) return res.status(400).json({ error: 'Este abono ya está anulado' });

    const motivo = (req.body.motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'Debe indicar el motivo de la anulación' });

    db.prepare(`
        UPDATE pagos_laboratorio
        SET anulado = 1, motivo_anulacion = ?, anulado_por = ?, anulado_en = datetime('now', 'localtime')
        WHERE id = ?
    `).run(motivo, req.session.usuario.id, req.params.id);

    res.json({ ok: true });
});

module.exports = router;
