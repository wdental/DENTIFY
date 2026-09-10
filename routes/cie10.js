// =====================================================================
// Buscador del catalogo CIE-10 odontologico (Fase 3B, seccion N del F033).
// Catalogo de solo lectura, precargado via db/semillaCie10.js.
// =====================================================================
const express = require('express');
const db = require('../db/conexion');
const { requiereSesion } = require('../middleware/auth');

const router = express.Router();
router.use(requiereSesion);

// -----------------------------------------------------------------
// GET /api/cie10?q=texto - busca por codigo o descripcion (max 25 resultados)
// -----------------------------------------------------------------
router.get('/', (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const patron = `%${q}%`;
    const resultados = db.prepare(`
        SELECT codigo, descripcion FROM cie10_odontologia
        WHERE codigo LIKE ? OR descripcion LIKE ?
        ORDER BY codigo
        LIMIT 25
    `).all(patron, patron);

    res.json(resultados);
});

module.exports = router;
