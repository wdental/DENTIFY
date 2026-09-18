// =====================================================================
// Planes de tratamiento derivados del odontograma (Fase 4A). Un plan en
// borrador/presentado es editable; al aceptarse con firma se congela
// (contenido_final + hash SHA-256 + PNG en disco), exactamente igual al
// patron de routes/consentimientos.js. Cualquier cambio posterior a un
// plan aceptado crea una NUEVA version en borrador (version_anterior_id).
// =====================================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db/conexion');
const { requiereSesion, requierePermiso } = require('../middleware/auth');
const { ahoraLocal } = require('../utils/fechaLocal');
const { construirClausulaRepresentante, calcularEdad } = require('../utils/plantillas');

const router = express.Router();
router.use(requiereSesion);

const CARPETA_UPLOADS = path.join(__dirname, '..', 'uploads', 'pacientes');

function carpetaFirmas(pacienteId) {
    const carpeta = path.join(CARPETA_UPLOADS, String(pacienteId), 'firmas');
    fs.mkdirSync(carpeta, { recursive: true });
    return carpeta;
}

function guardarFirmaPng(pacienteId, nombreArchivo, dataUrl) {
    const base64 = String(dataUrl).replace(/^data:image\/png;base64,/, '');
    const carpeta = carpetaFirmas(pacienteId);
    fs.writeFileSync(path.join(carpeta, nombreArchivo), Buffer.from(base64, 'base64'));
    return path.join(String(pacienteId), 'firmas', nombreArchivo).split(path.sep).join('/');
}

function sha256(texto) {
    return crypto.createHash('sha256').update(texto, 'utf8').digest('hex');
}

function formatearFechaLarga(iso) {
    return new Date(iso).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Etiquetas de los hallazgos rojos mapeables (duplicado intencional del
// catalogo HALLAZGOS de public/js/odontograma.js: es una tabla de 9
// entradas, no vale la pena acoplar los dos modulos por esto).
const ETIQUETAS_HALLAZGO = {
    caries: 'Caries',
    extraccion_indicada: 'Extracción indicada',
    endodoncia_indicada: 'Endodoncia por realizar',
    corona_indicada: 'Corona indicada',
    sellante_necesario: 'Sellante necesario',
    protesis_fija_indicada: 'Prótesis fija indicada',
    protesis_removible_indicada: 'Prótesis removible indicada',
    protesis_total_indicada: 'Prótesis total indicada',
    implante_indicado: 'Implante indicado'
};

const HALLAZGOS_PIEZA_SIMPLE = [
    'extraccion_indicada', 'endodoncia_indicada', 'corona_indicada',
    'sellante_necesario', 'implante_indicado'
];

const ESTADOS_CON_UN_BORRADOR = ['borrador', 'presentado'];

// -----------------------------------------------------------------
// Genera las lineas del plan a partir de los hallazgos ROJOS de una
// version de odontograma, resolviendo tratamiento/precio segun el mapeo
// hallazgo->tratamiento vigente. Si un hallazgo no tiene tratamiento
// mapeado, la linea se genera sin precio ("asignar tratamiento").
// -----------------------------------------------------------------
function generarItemsDesdeOdontograma(odontogramaId) {
    const piezas = db.prepare('SELECT * FROM odontograma_piezas WHERE odontograma_id = ?').all(odontogramaId);
    const rojas = piezas.filter((p) => p.color_tipo === 'rojo' && p.hallazgo);

    const mapeoFilas = db.prepare('SELECT * FROM mapeo_hallazgo_tratamiento').all();
    const mapeoPorCodigo = {};
    mapeoFilas.forEach((f) => { mapeoPorCodigo[f.hallazgo_codigo] = f; });

    const obtenerTratamiento = (id) => id ? db.prepare('SELECT * FROM tratamientos WHERE id = ?').get(id) : null;

    const items = [];

    function agregarItem(piezasTexto, hallazgoCodigo, tratamiento) {
        const etiqueta = ETIQUETAS_HALLAZGO[hallazgoCodigo] || hallazgoCodigo;
        items.push({
            piezas: piezasTexto,
            hallazgo_origen: hallazgoCodigo,
            tratamiento_id: tratamiento ? tratamiento.id : null,
            descripcion: tratamiento ? tratamiento.nombre : `${etiqueta} — asignar tratamiento`,
            precio: tratamiento ? tratamiento.precio : 0
        });
    }

    // Caries: se agrupan por pieza y se cuenta el numero de superficies
    // distintas para elegir la variante (1 = simple, 2 = compuesta, 3+ = compleja).
    const cariesPorPieza = {};
    rojas.filter((p) => p.hallazgo === 'caries').forEach((p) => {
        if (!cariesPorPieza[p.pieza]) cariesPorPieza[p.pieza] = new Set();
        cariesPorPieza[p.pieza].add(p.superficie);
    });
    Object.entries(cariesPorPieza).forEach(([pieza, superficies]) => {
        const n = superficies.size;
        const mapeo = mapeoPorCodigo.caries;
        let tratamientoId = null;
        if (mapeo) {
            if (n <= 1) tratamientoId = mapeo.tratamiento_id;
            else if (n === 2) tratamientoId = mapeo.tratamiento_id_2_superficies;
            else tratamientoId = mapeo.tratamiento_id_3_superficies;
        }
        agregarItem(pieza, 'caries', obtenerTratamiento(tratamientoId));
    });

    // Hallazgos de pieza simple: un item por (pieza, hallazgo)
    rojas.filter((p) => HALLAZGOS_PIEZA_SIMPLE.includes(p.hallazgo)).forEach((p) => {
        const mapeo = mapeoPorCodigo[p.hallazgo];
        agregarItem(p.pieza, p.hallazgo, obtenerTratamiento(mapeo ? mapeo.tratamiento_id : null));
    });

    // Tramos de protesis: un item por tramo, piezas = "inicio-fin"
    const PATRON_TRAMO = /^tramo_a_(\d+)$/;
    rojas.forEach((p) => {
        const coincide = typeof p.superficie === 'string' && PATRON_TRAMO.exec(p.superficie);
        if (!coincide) return;
        if (!['protesis_fija_indicada', 'protesis_removible_indicada', 'protesis_total_indicada'].includes(p.hallazgo)) return;
        const mapeo = mapeoPorCodigo[p.hallazgo];
        agregarItem(`${p.pieza}-${coincide[1]}`, p.hallazgo, obtenerTratamiento(mapeo ? mapeo.tratamiento_id : null));
    });

    return items;
}

function recalcularTotal(planId) {
    const total = db.prepare(
        "SELECT COALESCE(SUM(precio), 0) AS total FROM plan_items WHERE plan_id = ? AND estado_item != 'descartado'"
    ).get(planId).total;
    db.prepare('UPDATE planes_tratamiento SET total = ? WHERE id = ?').run(total, planId);
    return total;
}

const SELECT_PLAN_BASE = `
    SELECT pt.*, d.nombre_completo AS doctor_nombre, u.nombre AS creado_por_nombre
    FROM planes_tratamiento pt
    LEFT JOIN doctores d ON d.id = pt.doctor_id
    LEFT JOIN usuarios u ON u.id = pt.creado_por
`;

function cargarPlanConItems(planId) {
    const plan = db.prepare(`${SELECT_PLAN_BASE} WHERE pt.id = ?`).get(planId);
    if (!plan) return null;
    plan.items = db.prepare(`
        SELECT pi.*, t.nombre AS tratamiento_nombre
        FROM plan_items pi
        LEFT JOIN tratamientos t ON t.id = pi.tratamiento_id
        WHERE pi.plan_id = ?
        ORDER BY pi.fase, pi.orden, pi.id
    `).all(planId);
    return plan;
}

// -----------------------------------------------------------------
// GET /api/planes-tratamiento/:pacienteId - historial completo
// -----------------------------------------------------------------
router.get('/:pacienteId', requierePermiso('planes.ver'), (req, res) => {
    const planes = db.prepare(`${SELECT_PLAN_BASE} WHERE pt.paciente_id = ? ORDER BY pt.id DESC`).all(req.params.pacienteId);
    res.json(planes);
});

// GET /api/planes-tratamiento/:pacienteId/actual - el borrador/presentado vigente, si existe
router.get('/:pacienteId/actual', requierePermiso('planes.ver'), (req, res) => {
    const plan = db.prepare(`
        ${SELECT_PLAN_BASE} WHERE pt.paciente_id = ? AND pt.estado IN ('borrador', 'presentado')
        ORDER BY pt.id DESC LIMIT 1
    `).get(req.params.pacienteId);
    if (!plan) return res.json(null);
    res.json(cargarPlanConItems(plan.id));
});

// GET /api/planes-tratamiento/:pacienteId/pendientes-por-pieza?piezas=16,45
// devuelve los items pendientes de un plan aceptado/en_curso que coinciden
// con esas piezas, para ofrecer marcarlos realizados desde una evolucion.
// Registrado ANTES de "/:pacienteId/:id" para que "pendientes-por-pieza"
// no sea interpretado como un id de plan.
router.get('/:pacienteId/pendientes-por-pieza', requierePermiso('planes.ver', 'historia.registrar'), (req, res) => {
    const piezas = (req.query.piezas || '').split(',').map((p) => p.trim()).filter(Boolean);
    if (piezas.length === 0) return res.json([]);

    const plan = db.prepare(
        "SELECT * FROM planes_tratamiento WHERE paciente_id = ? AND estado IN ('aceptado', 'en_curso') ORDER BY id DESC LIMIT 1"
    ).get(req.params.pacienteId);
    if (!plan) return res.json([]);

    const items = db.prepare("SELECT * FROM plan_items WHERE plan_id = ? AND estado_item = 'pendiente'").all(plan.id);
    const coincidentes = items.filter((it) => (it.piezas || '').split(/[-,]/).map((p) => p.trim()).some((p) => piezas.includes(p)));
    res.json(coincidentes.map((it) => ({ ...it, plan_id: plan.id, plan_estado: plan.estado })));
});

// GET /api/planes-tratamiento/:pacienteId/:id - uno completo, con items
router.get('/:pacienteId/:id', requierePermiso('planes.ver'), (req, res) => {
    const plan = cargarPlanConItems(req.params.id);
    if (!plan || plan.paciente_id !== Number(req.params.pacienteId)) {
        return res.status(404).json({ error: 'Plan no encontrado' });
    }
    res.json(plan);
});

// GET /api/planes-tratamiento/:pacienteId/:id/firma/:quien - imagen PNG de firma
router.get('/:pacienteId/:id/firma/:quien', requierePermiso('planes.ver'), (req, res) => {
    const fila = db.prepare('SELECT firma_paciente_path, firma_representante_path FROM planes_tratamiento WHERE id = ? AND paciente_id = ?')
        .get(req.params.id, req.params.pacienteId);
    const ruta = req.params.quien === 'representante' ? (fila && fila.firma_representante_path) : (fila && fila.firma_paciente_path);
    if (!ruta) return res.status(404).end();
    res.sendFile(path.join(CARPETA_UPLOADS, ruta));
});

// -----------------------------------------------------------------
// POST /api/planes-tratamiento/:pacienteId/generar - genera un plan
// PROVISIONAL (borrador) desde la version activa del odontograma. Falla
// si ya existe un plan en borrador/presentado (solo puede haber uno).
// body opcional: { odontograma_id } para generar desde una version
// especifica (usado por la sugerencia automatica al guardar el odontograma).
// -----------------------------------------------------------------
router.post('/:pacienteId/generar', requierePermiso('planes.gestionar'), (req, res) => {
    const pacienteId = Number(req.params.pacienteId);
    const paciente = db.prepare('SELECT id FROM pacientes WHERE id = ?').get(pacienteId);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    const yaTieneVigente = db.prepare(
        "SELECT id FROM planes_tratamiento WHERE paciente_id = ? AND estado IN ('borrador', 'presentado')"
    ).get(pacienteId);
    if (yaTieneVigente) return res.status(400).json({ error: 'El paciente ya tiene un plan en borrador o presentado' });

    const odontograma = req.body.odontograma_id
        ? db.prepare('SELECT * FROM odontogramas WHERE id = ? AND paciente_id = ?').get(req.body.odontograma_id, pacienteId)
        : db.prepare('SELECT * FROM odontogramas WHERE paciente_id = ? AND es_version_activa = 1').get(pacienteId);
    if (!odontograma) return res.status(400).json({ error: 'No hay un odontograma disponible para generar el plan' });

    const items = generarItemsDesdeOdontograma(odontograma.id);
    if (items.length === 0) return res.status(400).json({ error: 'La versión del odontograma no tiene hallazgos en rojo (patología pendiente)' });

    const transaccion = db.transaction(() => {
        const resultado = db.prepare(`
            INSERT INTO planes_tratamiento (paciente_id, odontograma_id, estado, doctor_id, creado_por)
            VALUES (?, ?, 'borrador', ?, ?)
        `).run(pacienteId, odontograma.id, odontograma.doctor_id || null, req.session.usuario.id);
        const planId = resultado.lastInsertRowid;

        const insertarItem = db.prepare(`
            INSERT INTO plan_items (plan_id, piezas, hallazgo_origen, tratamiento_id, descripcion, precio, fase, orden)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `);
        items.forEach((it, indice) => {
            insertarItem.run(planId, it.piezas, it.hallazgo_origen, it.tratamiento_id, it.descripcion, it.precio, indice);
        });

        recalcularTotal(planId);
        return planId;
    });

    const planId = transaccion();
    res.json({ ok: true, id: planId, plan: cargarPlanConItems(planId) });
});

function asegurarEditable(plan, res) {
    if (!plan) { res.status(404).json({ error: 'Plan no encontrado' }); return false; }
    if (!ESTADOS_CON_UN_BORRADOR.includes(plan.estado)) {
        res.status(400).json({ error: 'Solo se puede editar un plan en estado borrador o presentado' });
        return false;
    }
    return true;
}

// -----------------------------------------------------------------
// PUT /api/planes-tratamiento/:pacienteId/:id - edita condiciones/estado
// (solo borrador/presentado -> permite volver a borrador para seguir editando)
// -----------------------------------------------------------------
router.put('/:pacienteId/:id', requierePermiso('planes.gestionar'), (req, res) => {
    const plan = db.prepare('SELECT * FROM planes_tratamiento WHERE id = ? AND paciente_id = ?').get(req.params.id, req.params.pacienteId);
    if (!asegurarEditable(plan, res)) return;

    const { condiciones, doctor_id } = req.body;
    db.prepare('UPDATE planes_tratamiento SET condiciones = ?, doctor_id = ?, estado = ? WHERE id = ?')
        .run((condiciones || '').trim() || null, doctor_id || null, 'borrador', req.params.id);

    res.json({ ok: true, plan: cargarPlanConItems(req.params.id) });
});

// POST /api/planes-tratamiento/:pacienteId/:id/items - agrega una linea manual desde el catalogo
router.post('/:pacienteId/:id/items', requierePermiso('planes.gestionar'), (req, res) => {
    const plan = db.prepare('SELECT * FROM planes_tratamiento WHERE id = ? AND paciente_id = ?').get(req.params.id, req.params.pacienteId);
    if (!asegurarEditable(plan, res)) return;

    const { piezas, tratamiento_id, descripcion, precio, fase, fase_etiqueta } = req.body;
    if (!descripcion || !descripcion.trim()) return res.status(400).json({ error: 'La descripción es obligatoria' });
    const precioNumerico = Number(precio);
    if (isNaN(precioNumerico) || precioNumerico < 0) return res.status(400).json({ error: 'El precio debe ser un número válido' });

    const maxOrden = db.prepare('SELECT COALESCE(MAX(orden), -1) AS m FROM plan_items WHERE plan_id = ?').get(req.params.id).m;

    db.prepare('UPDATE planes_tratamiento SET estado = ? WHERE id = ?').run('borrador', req.params.id);
    const resultado = db.prepare(`
        INSERT INTO plan_items (plan_id, piezas, hallazgo_origen, tratamiento_id, descripcion, precio, fase, fase_etiqueta, orden)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)
    `).run(req.params.id, (piezas || '').trim() || null, tratamiento_id || null, descripcion.trim(), Math.round(precioNumerico * 100) / 100, fase || 1, fase_etiqueta || null, maxOrden + 1);

    recalcularTotal(req.params.id);
    res.json({ ok: true, id: resultado.lastInsertRowid, plan: cargarPlanConItems(req.params.id) });
});

// PUT /api/planes-tratamiento/:pacienteId/:id/items/:itemId - edita descripcion/precio/fase/orden
router.put('/:pacienteId/:id/items/:itemId', requierePermiso('planes.gestionar'), (req, res) => {
    const plan = db.prepare('SELECT * FROM planes_tratamiento WHERE id = ? AND paciente_id = ?').get(req.params.id, req.params.pacienteId);
    if (!asegurarEditable(plan, res)) return;

    const item = db.prepare('SELECT * FROM plan_items WHERE id = ? AND plan_id = ?').get(req.params.itemId, req.params.id);
    if (!item) return res.status(404).json({ error: 'Línea no encontrada' });

    const { descripcion, precio, fase, fase_etiqueta, orden, estado_item } = req.body;
    const precioNumerico = precio !== undefined ? Number(precio) : item.precio;
    if (isNaN(precioNumerico) || precioNumerico < 0) return res.status(400).json({ error: 'El precio debe ser un número válido' });

    db.prepare(`
        UPDATE plan_items SET descripcion = ?, precio = ?, fase = ?, fase_etiqueta = ?, orden = ?, estado_item = ?
        WHERE id = ?
    `).run(
        (descripcion !== undefined ? descripcion.trim() : item.descripcion) || item.descripcion,
        Math.round(precioNumerico * 100) / 100,
        fase !== undefined ? fase : item.fase,
        fase_etiqueta !== undefined ? (fase_etiqueta || null) : item.fase_etiqueta,
        orden !== undefined ? orden : item.orden,
        estado_item !== undefined ? estado_item : item.estado_item,
        req.params.itemId
    );

    db.prepare('UPDATE planes_tratamiento SET estado = ? WHERE id = ?').run('borrador', req.params.id);
    recalcularTotal(req.params.id);
    res.json({ ok: true, plan: cargarPlanConItems(req.params.id) });
});

// DELETE /api/planes-tratamiento/:pacienteId/:id/items/:itemId - quita una linea
router.delete('/:pacienteId/:id/items/:itemId', requierePermiso('planes.gestionar'), (req, res) => {
    const plan = db.prepare('SELECT * FROM planes_tratamiento WHERE id = ? AND paciente_id = ?').get(req.params.id, req.params.pacienteId);
    if (!asegurarEditable(plan, res)) return;

    db.prepare('DELETE FROM plan_items WHERE id = ? AND plan_id = ?').run(req.params.itemId, req.params.id);
    db.prepare('UPDATE planes_tratamiento SET estado = ? WHERE id = ?').run('borrador', req.params.id);
    recalcularTotal(req.params.id);
    res.json({ ok: true, plan: cargarPlanConItems(req.params.id) });
});

// -----------------------------------------------------------------
// POST /api/planes-tratamiento/:pacienteId/:id/presentar - vista formal
// del plan (membrete + tabla por fases) -> estado 'presentado'
// -----------------------------------------------------------------
router.post('/:pacienteId/:id/presentar', requierePermiso('planes.gestionar'), (req, res) => {
    const plan = db.prepare('SELECT * FROM planes_tratamiento WHERE id = ? AND paciente_id = ?').get(req.params.id, req.params.pacienteId);
    if (!asegurarEditable(plan, res)) return;

    const items = db.prepare('SELECT * FROM plan_items WHERE plan_id = ?').all(req.params.id);
    if (items.length === 0) return res.status(400).json({ error: 'El plan no tiene líneas para presentar' });

    db.prepare("UPDATE planes_tratamiento SET estado = 'presentado', fecha_presentado = ? WHERE id = ?")
        .run(ahoraLocal(), req.params.id);

    res.json({ ok: true, plan: cargarPlanConItems(req.params.id) });
});

// -----------------------------------------------------------------
// POST /api/planes-tratamiento/:pacienteId/:id/aceptar - firma del
// paciente (y representante si es menor) -> estado 'aceptado', snapshot
// inmutable con hash SHA-256, firma PNG en disco (patron de consentimientos).
// -----------------------------------------------------------------
router.post('/:pacienteId/:id/aceptar', requierePermiso('planes.gestionar'), (req, res) => {
    const pacienteId = Number(req.params.pacienteId);
    const plan = db.prepare('SELECT * FROM planes_tratamiento WHERE id = ? AND paciente_id = ?').get(req.params.id, pacienteId);
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
    if (plan.estado !== 'presentado') return res.status(400).json({ error: 'El plan debe estar presentado antes de aceptarse' });

    const paciente = db.prepare('SELECT * FROM pacientes WHERE id = ?').get(pacienteId);
    const { firma_paciente, representante_nombre, representante_cedula, condiciones } = req.body;

    if (!firma_paciente) return res.status(400).json({ error: 'Se requiere la firma del paciente' });
    if (!paciente.fecha_nacimiento) {
        return res.status(400).json({ error: 'El paciente no tiene fecha de nacimiento registrada; regístrela antes de aceptar el plan' });
    }

    const edad = calcularEdad(paciente.fecha_nacimiento);
    const esMenor = edad !== null && edad < 18;
    if (esMenor) {
        if (!representante_nombre || !representante_nombre.trim()) {
            return res.status(400).json({ error: 'El paciente es menor de edad: se requiere el nombre del representante legal' });
        }
        if (!representante_cedula || !/^\d{10}$/.test(representante_cedula)) {
            return res.status(400).json({ error: 'La cédula del representante legal debe tener 10 dígitos' });
        }
    }

    const items = db.prepare('SELECT * FROM plan_items WHERE plan_id = ? ORDER BY fase, orden, id').all(plan.id);
    const nombrePaciente = `${paciente.nombres} ${paciente.apellidos}`;
    const firmanteNombre = esMenor ? representante_nombre.trim() : nombrePaciente;
    const firmanteCedula = esMenor ? representante_cedula.trim() : (paciente.cedula || '');
    const clausulaRepresentante = construirClausulaRepresentante(esMenor, representante_nombre, representante_cedula);

    const filasHtml = items.map((it) => `
        <tr>
            <td>${it.fase_etiqueta || ('Fase ' + it.fase)}</td>
            <td>${it.piezas || '—'}</td>
            <td>${it.descripcion}</td>
            <td>$${it.precio.toFixed(2)}</td>
        </tr>
    `).join('');
    const total = items.filter((it) => it.estado_item !== 'descartado').reduce((s, it) => s + it.precio, 0);

    const contenidoFinal = `
        <p><strong>Paciente:</strong> ${nombrePaciente}${clausulaRepresentante}</p>
        <table class="tabla-plan-impreso">
            <thead><tr><th>Fase</th><th>Pieza(s)</th><th>Tratamiento</th><th>Precio</th></tr></thead>
            <tbody>${filasHtml}</tbody>
        </table>
        <p class="tabla-plan-impreso__total"><strong>Total: $${total.toFixed(2)}</strong></p>
        ${(condiciones || plan.condiciones) ? `<p><strong>Condiciones:</strong> ${condiciones || plan.condiciones}</p>` : ''}
        <h4>Declaración y firma</h4>
        <p><strong>☑ Acepto el plan de tratamiento propuesto.</strong> He sido informado de los procedimientos incluidos, su orden por fases y su costo. He comprendido la información y autorizo libremente su realización.</p>
    `;
    const hash = sha256(contenidoFinal);

    const transaccion = db.transaction(() => {
        db.prepare(`
            UPDATE planes_tratamiento SET
                estado = 'aceptado', contenido_final = ?, hash_documento = ?,
                firmante_nombre = ?, firmante_cedula = ?, es_representante = ?,
                condiciones = ?, total = ?, fecha_aceptado = ?
            WHERE id = ?
        `).run(
            contenidoFinal, hash, firmanteNombre, firmanteCedula || null, esMenor ? 1 : 0,
            (condiciones || plan.condiciones || null), total, ahoraLocal(), plan.id
        );

        const rutaFirmaPaciente = guardarFirmaPng(pacienteId, `plan_${plan.id}_paciente.png`, firma_paciente);
        db.prepare('UPDATE planes_tratamiento SET firma_paciente_path = ? WHERE id = ?').run(rutaFirmaPaciente, plan.id);
    });

    transaccion();
    res.json({ ok: true, plan: cargarPlanConItems(plan.id) });
});

// POST /api/planes-tratamiento/:pacienteId/:id/rechazar
router.post('/:pacienteId/:id/rechazar', requierePermiso('planes.gestionar'), (req, res) => {
    const plan = db.prepare('SELECT * FROM planes_tratamiento WHERE id = ? AND paciente_id = ?').get(req.params.id, req.params.pacienteId);
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
    if (!ESTADOS_CON_UN_BORRADOR.includes(plan.estado)) {
        return res.status(400).json({ error: 'Solo se puede rechazar un plan en borrador o presentado' });
    }

    db.prepare("UPDATE planes_tratamiento SET estado = 'rechazado', motivo_rechazo = ? WHERE id = ?")
        .run((req.body.motivo || '').trim() || null, req.params.id);

    res.json({ ok: true });
});

// -----------------------------------------------------------------
// POST /api/planes-tratamiento/:pacienteId/:id/nueva-version - solo sobre
// un plan aceptado: crea un borrador nuevo con copia editable de los
// items, vinculado por version_anterior_id. El aceptado queda intacto.
// -----------------------------------------------------------------
router.post('/:pacienteId/:id/nueva-version', requierePermiso('planes.gestionar'), (req, res) => {
    const pacienteId = Number(req.params.pacienteId);
    const planOrigen = db.prepare('SELECT * FROM planes_tratamiento WHERE id = ? AND paciente_id = ?').get(req.params.id, pacienteId);
    if (!planOrigen) return res.status(404).json({ error: 'Plan no encontrado' });
    if (!['aceptado', 'en_curso'].includes(planOrigen.estado)) {
        return res.status(400).json({ error: 'Solo se puede crear una nueva versión desde un plan aceptado o en curso' });
    }
    const yaTieneVigente = db.prepare(
        "SELECT id FROM planes_tratamiento WHERE paciente_id = ? AND estado IN ('borrador', 'presentado')"
    ).get(pacienteId);
    if (yaTieneVigente) return res.status(400).json({ error: 'El paciente ya tiene un plan en borrador o presentado' });

    const itemsOrigen = db.prepare("SELECT * FROM plan_items WHERE plan_id = ? AND estado_item != 'realizado'").all(planOrigen.id);

    const transaccion = db.transaction(() => {
        const resultado = db.prepare(`
            INSERT INTO planes_tratamiento (paciente_id, odontograma_id, estado, doctor_id, condiciones, version_anterior_id, creado_por)
            VALUES (?, ?, 'borrador', ?, ?, ?, ?)
        `).run(pacienteId, planOrigen.odontograma_id, planOrigen.doctor_id, planOrigen.condiciones, planOrigen.id, req.session.usuario.id);
        const nuevoId = resultado.lastInsertRowid;

        const insertarItem = db.prepare(`
            INSERT INTO plan_items (plan_id, piezas, hallazgo_origen, tratamiento_id, descripcion, precio, fase, fase_etiqueta, orden)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        itemsOrigen.forEach((it) => {
            insertarItem.run(nuevoId, it.piezas, it.hallazgo_origen, it.tratamiento_id, it.descripcion, it.precio, it.fase, it.fase_etiqueta, it.orden);
        });

        recalcularTotal(nuevoId);
        return nuevoId;
    });

    const nuevoId = transaccion();
    res.json({ ok: true, id: nuevoId, plan: cargarPlanConItems(nuevoId) });
});

// -----------------------------------------------------------------
// Cierre del ciclo con evoluciones (semiautomatico, siempre con
// confirmacion del usuario en el frontend).
// -----------------------------------------------------------------

// PUT /api/planes-tratamiento/:pacienteId/:id/items/:itemId/marcar-realizado
// vincula el item a la evolucion que lo resolvio y actualiza el estado del
// plan (primer realizado -> en_curso; todos resueltos -> sugerencia finalizado,
// que el frontend confirma aparte via PUT estado).
router.put('/:pacienteId/:id/items/:itemId/marcar-realizado', requierePermiso('planes.gestionar', 'historia.registrar'), (req, res) => {
    const plan = db.prepare('SELECT * FROM planes_tratamiento WHERE id = ? AND paciente_id = ?').get(req.params.id, req.params.pacienteId);
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
    if (!['aceptado', 'en_curso'].includes(plan.estado)) {
        return res.status(400).json({ error: 'El plan debe estar aceptado o en curso' });
    }

    const { evolucion_id } = req.body;
    db.prepare("UPDATE plan_items SET estado_item = 'realizado', evolucion_id = ? WHERE id = ? AND plan_id = ?")
        .run(evolucion_id || null, req.params.itemId, req.params.id);

    if (plan.estado === 'aceptado') {
        db.prepare("UPDATE planes_tratamiento SET estado = 'en_curso' WHERE id = ?").run(plan.id);
    }

    const pendientes = db.prepare("SELECT COUNT(*) AS n FROM plan_items WHERE plan_id = ? AND estado_item = 'pendiente'").get(plan.id).n;

    res.json({ ok: true, plan: cargarPlanConItems(plan.id), todosResueltos: pendientes === 0 });
});

// PUT /api/planes-tratamiento/:pacienteId/:id/finalizar - solo cuando ya no hay pendientes
router.put('/:pacienteId/:id/finalizar', requierePermiso('planes.gestionar'), (req, res) => {
    const plan = db.prepare('SELECT * FROM planes_tratamiento WHERE id = ? AND paciente_id = ?').get(req.params.id, req.params.pacienteId);
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
    const pendientes = db.prepare("SELECT COUNT(*) AS n FROM plan_items WHERE plan_id = ? AND estado_item = 'pendiente'").get(plan.id).n;
    if (pendientes > 0) return res.status(400).json({ error: 'Aún hay ítems pendientes en el plan' });

    db.prepare("UPDATE planes_tratamiento SET estado = 'finalizado' WHERE id = ?").run(plan.id);
    res.json({ ok: true });
});

module.exports = router;
