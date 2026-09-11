// =====================================================================
// Motor financiero de la Fase 4B (pagos, abonos y caja):
//   - cronograma de un plan de cuotas y estado de cada cuota, calculado
//     dinamicamente a partir de los pagos validos vinculados (nunca se
//     persiste el cronograma);
//   - saldo pendiente de un paciente y saldos globales para el dashboard;
//   - cuotas vencidas de toda la clinica para la gestion de cobro.
// Solo cuentan los pagos VALIDOS (anulado = 0). Ver docs/fase-4b.md.
// =====================================================================
const db = require('../db/conexion');

function redondear(valor) {
    return Math.round((Number(valor) || 0) * 100) / 100;
}

// Fecha local de hoy en ISO (YYYY-MM-DD). No se usa toISOString() porque
// devuelve UTC y de noche cambiaria de dia respecto a la hora de Ecuador.
function hoyIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diasEntre(isoDesde, isoHasta) {
    const a = new Date(isoDesde + 'T00:00:00');
    const b = new Date(isoHasta + 'T00:00:00');
    return Math.round((b - a) / 86400000);
}

function fechaIso(anio, mesIndice, dia) {
    // mesIndice puede desbordar el anio: Date lo normaliza (mes 12 -> enero siguiente)
    const d = new Date(anio, mesIndice, dia);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// -----------------------------------------------------------------
// Cronograma esperado de un plan de cuotas. Regla: la entrada vence el
// dia de inicio; la cuota 1 vence el dia_pago_mes del mes SIGUIENTE al
// de inicio, y cada cuota siguiente un mes despues. La ultima cuota
// absorbe la diferencia para que la suma cuadre con monto_total (si el
// usuario edito el monto de cuota sugerido).
// -----------------------------------------------------------------
function cronogramaEsperado(planPago) {
    const [anio, mes] = String(planPago.fecha_inicio).slice(0, 10).split('-').map(Number);
    const items = [];
    if (Number(planPago.entrada) > 0) {
        items.push({ numero: 0, etiqueta: 'Entrada', fecha_esperada: String(planPago.fecha_inicio).slice(0, 10), monto: redondear(planPago.entrada) });
    }
    const n = Number(planPago.numero_cuotas);
    const aFinanciar = redondear(Number(planPago.monto_total) - Number(planPago.entrada));
    for (let i = 1; i <= n; i++) {
        const monto = i === n
            ? redondear(aFinanciar - redondear(Number(planPago.monto_cuota) * (n - 1)))
            : redondear(planPago.monto_cuota);
        items.push({
            numero: i,
            etiqueta: `Cuota ${i} de ${n}`,
            fecha_esperada: fechaIso(anio, (mes - 1) + i, Number(planPago.dia_pago_mes)),
            monto
        });
    }
    return items;
}

// Pagos validos que abonan un plan de cuotas: los vinculados directamente
// (plan_pago_id) y, si el acuerdo esta ligado a un plan de tratamiento,
// tambien los hechos directamente a ese plan ANTES de crear el acuerdo
// (plan_id igual y sin plan_pago_id) - por eso el modal propone lo ya
// pagado como entrada. Asi el cronograma y la cuenta cuadran siempre.
function pagosDelPlanPago(planPago, pagosValidos) {
    return pagosValidos
        .filter((p) => p.plan_pago_id === planPago.id || (planPago.plan_id && p.plan_id === planPago.plan_id && !p.plan_pago_id))
        .sort((a, b) => (a.fecha_pago + String(a.id).padStart(9, '0')).localeCompare(b.fecha_pago + String(b.id).padStart(9, '0')));
}

// Aplica los pagos validos vinculados al plan de cuotas en orden
// cronologico, primero a la entrada y luego a las cuotas ("el mas antiguo
// primero"), y deriva el estado de cada item.
function calcularCronograma(planPago, pagosValidos, hoy) {
    const referencia = hoy || hoyIso();
    const items = cronogramaEsperado(planPago);
    let disponible = redondear(pagosValidos.reduce((suma, p) => suma + Number(p.monto), 0));
    const totalPagado = disponible;

    items.forEach((item) => {
        const aplicado = Math.min(disponible, item.monto);
        item.pagado = redondear(aplicado);
        item.saldo = redondear(item.monto - aplicado);
        disponible = redondear(disponible - aplicado);
        const vencida = item.saldo > 0 && item.fecha_esperada < referencia;
        item.dias_atraso = vencida ? diasEntre(item.fecha_esperada, referencia) : 0;
        if (item.saldo <= 0) item.estado = 'pagada';
        else if (item.pagado > 0) item.estado = 'parcial';
        else if (vencida) item.estado = 'vencida';
        else item.estado = 'por_vencer';
        item.vencida = vencida;
    });

    const vencidas = items.filter((it) => it.vencida);
    return {
        items,
        total_pagado: totalPagado,
        saldo: redondear(Number(planPago.monto_total) - totalPagado),
        excedente: disponible,
        cuotas_vencidas: vencidas.length,
        monto_vencido: redondear(vencidas.reduce((suma, it) => suma + it.saldo, 0)),
        dias_atraso_max: vencidas.reduce((max, it) => Math.max(max, it.dias_atraso), 0)
    };
}

// -----------------------------------------------------------------
// Resumen financiero de un paciente. "Cuentas" exigibles:
//   - cada plan de tratamiento aceptado/en_curso SIN plan de cuotas activo
//     vinculado -> exigible = total del plan;
//   - cada plan de cuotas activo -> exigible = monto_total del plan de
//     cuotas (si esta vinculado a un plan de tratamiento, lo REEMPLAZA para
//     no contar dos veces).
// Pagado por cuenta = pagos validos vinculados a esa cuenta (por plan_id o
// por plan_pago_id). Los pagos al contado sin vinculo no descuentan nada
// (no existe cuenta exigible detras).
// -----------------------------------------------------------------
function resumenFinancieroPaciente(pacienteId) {
    const planes = db.prepare(`
        SELECT id, estado, total, fecha_aceptado, fecha_creacion
        FROM planes_tratamiento WHERE paciente_id = ? AND estado IN ('aceptado', 'en_curso') ORDER BY id
    `).all(pacienteId);
    const planesPago = db.prepare('SELECT * FROM planes_pago WHERE paciente_id = ? ORDER BY id DESC').all(pacienteId);
    const pagosValidos = db.prepare('SELECT * FROM pagos WHERE paciente_id = ? AND anulado = 0 ORDER BY fecha_pago, id').all(pacienteId);

    const cuentas = [];
    const planesCubiertos = new Set();

    planesPago.forEach((pp) => {
        const pagosDelAcuerdo = pagosDelPlanPago(pp, pagosValidos);
        pp.cronograma = calcularCronograma(pp, pagosDelAcuerdo);
        if (pp.estado !== 'activo') return;
        if (pp.plan_id) planesCubiertos.add(pp.plan_id);
        const pagado = pp.cronograma.total_pagado;
        cuentas.push({
            tipo: 'plan_pago', id: pp.id, plan_id: pp.plan_id || null, descripcion: pp.descripcion,
            total: redondear(pp.monto_total), pagado, saldo: redondear(pp.monto_total - pagado)
        });
    });

    planes.forEach((plan) => {
        if (planesCubiertos.has(plan.id)) return;
        const pagado = redondear(pagosValidos.filter((p) => p.plan_id === plan.id).reduce((s, p) => s + Number(p.monto), 0));
        cuentas.push({
            tipo: 'plan_tratamiento', id: plan.id, plan_id: plan.id, descripcion: `Plan de tratamiento #${plan.id}`,
            estado_plan: plan.estado, total: redondear(plan.total), pagado, saldo: redondear(plan.total - pagado)
        });
    });

    const totalExigible = redondear(cuentas.reduce((s, c) => s + c.total, 0));
    const totalPagadoVinculado = redondear(cuentas.reduce((s, c) => s + c.pagado, 0));
    const pagosAlContado = redondear(pagosValidos.filter((p) => !p.plan_id && !p.plan_pago_id).reduce((s, p) => s + Number(p.monto), 0));

    return {
        cuentas,
        planes_pago: planesPago,
        total_exigible: totalExigible,
        total_pagado: totalPagadoVinculado,
        saldo: redondear(totalExigible - totalPagadoVinculado),
        pagos_al_contado: pagosAlContado,
        total_pagado_historico: redondear(pagosValidos.reduce((s, p) => s + Number(p.monto), 0))
    };
}

// Suma de saldos > 0 de todos los pacientes activos con alguna cuenta
// exigible (dashboard "Saldos pendientes").
function saldosGlobales() {
    const ids = db.prepare(`
        SELECT DISTINCT p.id FROM pacientes p
        WHERE p.activo = 1 AND (
            EXISTS (SELECT 1 FROM planes_tratamiento pt WHERE pt.paciente_id = p.id AND pt.estado IN ('aceptado', 'en_curso'))
            OR EXISTS (SELECT 1 FROM planes_pago pp WHERE pp.paciente_id = p.id AND pp.estado = 'activo')
        )
    `).all().map((f) => f.id);

    let total = 0;
    let pacientes = 0;
    ids.forEach((id) => {
        const resumen = resumenFinancieroPaciente(id);
        if (resumen.saldo > 0) {
            total = redondear(total + resumen.saldo);
            pacientes++;
        }
    });
    return { total, pacientes };
}

// Cuotas vencidas impagas de todos los planes de cuotas activos, con los
// datos de contacto del paciente para la gestion de cobro.
function cuotasVencidas() {
    const planesPago = db.prepare(`
        SELECT pp.*, pa.nombres AS paciente_nombres, pa.apellidos AS paciente_apellidos,
               pa.telefono AS paciente_telefono, pa.whatsapp AS paciente_whatsapp
        FROM planes_pago pp
        JOIN pacientes pa ON pa.id = pp.paciente_id
        WHERE pp.estado = 'activo' AND pa.activo = 1
        ORDER BY pa.apellidos, pa.nombres
    `).all();
    const pagosPorPaciente = db.prepare('SELECT * FROM pagos WHERE paciente_id = ? AND anulado = 0');

    const filas = [];
    planesPago.forEach((pp) => {
        const cronograma = calcularCronograma(pp, pagosDelPlanPago(pp, pagosPorPaciente.all(pp.paciente_id)));
        cronograma.items.filter((it) => it.vencida).forEach((it) => {
            filas.push({
                paciente_id: pp.paciente_id,
                paciente_nombre: `${pp.paciente_apellidos} ${pp.paciente_nombres}`,
                telefono: pp.paciente_telefono,
                whatsapp: pp.paciente_whatsapp,
                plan_pago_id: pp.id,
                plan_pago_descripcion: pp.descripcion,
                cuota: it.etiqueta,
                fecha_esperada: it.fecha_esperada,
                monto: it.monto,
                pagado: it.pagado,
                saldo: it.saldo,
                estado: it.estado,
                dias_atraso: it.dias_atraso
            });
        });
    });
    filas.sort((a, b) => b.dias_atraso - a.dias_atraso);
    const pacientes = new Set(filas.map((f) => f.paciente_id)).size;
    const monto = redondear(filas.reduce((s, f) => s + f.saldo, 0));
    return { filas, pacientes, monto };
}

module.exports = { redondear, hoyIso, calcularCronograma, cronogramaEsperado, pagosDelPlanPago, resumenFinancieroPaciente, saldosGlobales, cuotasVencidas };
