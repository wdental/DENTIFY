// =====================================================================
// Rutas de la ficha clinica odontologica (Formulario 033 MSP Ecuador),
// secciones B-G, I, J, L, M, O. El odontograma (seccion H) vive en
// routes/odontograma.js; el diagnostico (N) en routes/diagnosticos.js y el
// tratamiento por sesion (P) en routes/evoluciones.js (tablas propias, no
// son parte de este JSON por seccion). Cada seccion se guarda de forma
// independiente (un JSON por columna) para no perder el resto del
// formulario si una seccion falla al guardar.
// =====================================================================
const express = require('express');
const db = require('../db/conexion');
const { requiereSesion, requierePermiso } = require('../middleware/auth');
const { ahoraLocal } = require('../utils/fechaLocal');

const router = express.Router();
router.use(requiereSesion);

// Mapa de seccion (URL) -> columna en fichas_clinicas
const SECCIONES = {
    'motivo-consulta': 'motivo_consulta_json',
    'enfermedad-actual': 'enfermedad_actual_json',
    'antecedentes-personales': 'antecedentes_personales_json',
    'antecedentes-familiares': 'antecedentes_familiares_json',
    'constantes-vitales': 'constantes_vitales_json',
    'examen-estomatognatico': 'examen_estomatognatico_json',
    'indicadores-salud-bucal': 'indicadores_salud_bucal_json',
    'indices-cpo': 'indices_cpo_json',
    'examenes-solicitados': 'examenes_solicitados_json',
    'examenes-informe': 'examenes_informe_json',
    'profesional-responsable': 'profesional_responsable_json'
};

// La seccion O (profesional responsable) solo la puede editar un admin,
// una vez que ya tiene un doctor asignado (autollenado inicial libre).
const SECCIONES_SOLO_ADMIN_SI_YA_TIENE_DATOS = ['profesional-responsable'];

// Antecedentes personales cuyo marcado dispara el banner de alerta medica
const CODIGOS_ALERTA = {
    alergia_antibiotico: 'Alergia a antibiótico',
    alergia_anestesia: 'Alergia a anestesia',
    hemorragias: 'Hemorragias',
    diabetes: 'Diabetes',
    hipertension: 'Hipertensión arterial',
    enf_cardiaca: 'Enfermedad cardíaca'
};

function obtenerFicha(pacienteId) {
    return db.prepare('SELECT * FROM fichas_clinicas WHERE paciente_id = ?').get(pacienteId);
}

function parsearFicha(fila) {
    const vacio = {};
    if (!fila) {
        const resultado = { paciente_id: null };
        Object.values(SECCIONES).forEach((columna) => { resultado[columna] = vacio; });
        return resultado;
    }
    const resultado = { ...fila };
    Object.values(SECCIONES).forEach((columna) => {
        try {
            resultado[columna] = fila[columna] ? JSON.parse(fila[columna]) : vacio;
        } catch (e) {
            resultado[columna] = vacio;
        }
    });
    return resultado;
}

// -----------------------------------------------------------------
// GET /api/ficha-clinica/:pacienteId - ficha completa (todas las secciones)
// -----------------------------------------------------------------
router.get('/:pacienteId', requierePermiso('historia.ver'), (req, res) => {
    const paciente = db.prepare('SELECT id FROM pacientes WHERE id = ?').get(req.params.pacienteId);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    const fila = obtenerFicha(req.params.pacienteId);
    res.json(parsearFicha(fila));
});

// -----------------------------------------------------------------
// GET /api/ficha-clinica/:pacienteId/alertas - resumen para banners
// (cabecera de la ficha y modal de citas en la Agenda)
// -----------------------------------------------------------------
router.get('/:pacienteId/alertas', requierePermiso('historia.ver'), (req, res) => {
    const fila = obtenerFicha(req.params.pacienteId);
    if (!fila || !fila.antecedentes_personales_json) {
        return res.json({ tieneAlertas: false, etiquetas: [] });
    }

    let datos;
    try {
        datos = JSON.parse(fila.antecedentes_personales_json);
    } catch (e) {
        return res.json({ tieneAlertas: false, etiquetas: [] });
    }

    const estados = datos.estados && typeof datos.estados === 'object' ? datos.estados : {};
    const marcadosSi = Object.keys(estados).filter((codigo) => estados[codigo] === 'si');
    const etiquetas = marcadosSi.filter((codigo) => CODIGOS_ALERTA[codigo]).map((codigo) => CODIGOS_ALERTA[codigo]);

    res.json({ tieneAlertas: etiquetas.length > 0, etiquetas });
});

// -----------------------------------------------------------------
// PUT /api/ficha-clinica/:pacienteId/seccion/:seccion - guarda una seccion
// -----------------------------------------------------------------
router.put('/:pacienteId/seccion/:seccion', requierePermiso('historia.registrar'), (req, res) => {
    const columna = SECCIONES[req.params.seccion];
    if (!columna) return res.status(400).json({ error: 'Seccion invalida' });

    const paciente = db.prepare('SELECT id FROM pacientes WHERE id = ?').get(req.params.pacienteId);
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    if (SECCIONES_SOLO_ADMIN_SI_YA_TIENE_DATOS.includes(req.params.seccion) && req.session.usuario.rol !== 'admin') {
        const filaExistente = obtenerFicha(req.params.pacienteId);
        const yaTieneDatos = filaExistente && filaExistente[columna];
        if (yaTieneDatos) {
            return res.status(403).json({ error: 'Solo un administrador puede editar los datos del profesional responsable ya registrados' });
        }
    }

    const datos = {
        ...req.body,
        actualizado_en: ahoraLocal(),
        actualizado_por: req.session.usuario.nombre
    };

    const existente = db.prepare('SELECT id FROM fichas_clinicas WHERE paciente_id = ?').get(req.params.pacienteId);

    if (existente) {
        db.prepare(`UPDATE fichas_clinicas SET ${columna} = ? WHERE paciente_id = ?`)
            .run(JSON.stringify(datos), req.params.pacienteId);
    } else {
        db.prepare(`INSERT INTO fichas_clinicas (paciente_id, ${columna}) VALUES (?, ?)`)
            .run(req.params.pacienteId, JSON.stringify(datos));
    }

    res.json({ ok: true, guardado: datos });
});

module.exports = router;
