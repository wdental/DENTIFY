// =====================================================================
// Plantillas guia de la nota de evolucion (seccion P del F033).
//
// Textos cortos que el doctor inserta con un clic en los campos libres
// del modal de "Nueva evolucion", para no redactar lo mismo cada sesion.
// Lectura para cualquier usuario con sesion (las usa el doctor al
// atender); crear, editar y borrar solo admin.
//
// Editar o borrar una plantilla NO altera ninguna evolucion ya guardada:
// la evolucion es inmutable y conserva su propio texto, igual que un
// consentimiento firmado conserva el suyo.
// =====================================================================
const express = require('express');
const db = require('../db/conexion');
const { requiereSesion, requiereAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requiereSesion);

const CAMPOS = ['diagnostico', 'procedimientos', 'prescripciones'];
const ETIQUETAS_CAMPO = {
    diagnostico: 'Diagnóstico / complicaciones',
    procedimientos: 'Procedimientos realizados',
    prescripciones: 'Prescripciones'
};

// GET /api/plantillas-evolucion?campo=&incluirInactivas=1
router.get('/', (req, res) => {
    const condiciones = [];
    const parametros = [];
    if (req.query.campo) {
        if (!CAMPOS.includes(req.query.campo)) return res.status(400).json({ error: 'Campo no válido' });
        condiciones.push('campo = ?');
        parametros.push(req.query.campo);
    }
    if (req.query.incluirInactivas !== '1') condiciones.push('activo = 1');

    const filas = db.prepare(`
        SELECT * FROM plantillas_evolucion
        ${condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : ''}
        ORDER BY campo, orden, nombre
    `).all(...parametros);

    res.json(filas.map((f) => ({ ...f, campo_etiqueta: ETIQUETAS_CAMPO[f.campo] })));
});

router.get('/campos', (req, res) => {
    res.json(CAMPOS.map((c) => ({ valor: c, etiqueta: ETIQUETAS_CAMPO[c] })));
});

function validar(req, res) {
    const { nombre, campo, texto } = req.body;
    if (!nombre || !nombre.trim()) { res.status(400).json({ error: 'El nombre del botón es obligatorio' }); return false; }
    if (!CAMPOS.includes(campo)) { res.status(400).json({ error: 'Debe indicar en qué campo aparece la plantilla' }); return false; }
    if (!texto || !texto.trim()) { res.status(400).json({ error: 'El texto de la plantilla es obligatorio' }); return false; }
    return true;
}

router.post('/', requiereAdmin, (req, res) => {
    if (!validar(req, res)) return;
    const { nombre, campo, texto, orden } = req.body;

    // Sin orden explicito, va al final de su campo.
    const siguiente = orden !== undefined && orden !== null && orden !== ''
        ? Number(orden)
        : (db.prepare('SELECT COALESCE(MAX(orden), 0) AS maximo FROM plantillas_evolucion WHERE campo = ?').get(campo).maximo + 10);

    const resultado = db.prepare(
        'INSERT INTO plantillas_evolucion (nombre, campo, texto, orden, activo, creado_por) VALUES (?, ?, ?, ?, 1, ?)'
    ).run(nombre.trim(), campo, texto.trim(), siguiente, req.session.usuario.id);

    res.json({ ok: true, id: resultado.lastInsertRowid });
});

router.put('/:id', requiereAdmin, (req, res) => {
    const plantilla = db.prepare('SELECT id FROM plantillas_evolucion WHERE id = ?').get(req.params.id);
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });
    if (!validar(req, res)) return;

    const { nombre, campo, texto, orden, activo } = req.body;
    db.prepare(`
        UPDATE plantillas_evolucion
        SET nombre = ?, campo = ?, texto = ?, orden = ?, activo = ?
        WHERE id = ?
    `).run(
        nombre.trim(), campo, texto.trim(),
        orden === undefined || orden === null || orden === '' ? 0 : Number(orden),
        activo === 0 || activo === false ? 0 : 1,
        req.params.id
    );
    res.json({ ok: true });
});

// Borrado real: son textos de ayuda, no un registro clinico. Las
// evoluciones ya escritas con esta plantilla no se tocan.
router.delete('/:id', requiereAdmin, (req, res) => {
    const plantilla = db.prepare('SELECT id FROM plantillas_evolucion WHERE id = ?').get(req.params.id);
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });
    db.prepare('DELETE FROM plantillas_evolucion WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

module.exports = router;
