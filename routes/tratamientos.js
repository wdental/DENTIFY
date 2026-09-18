// =====================================================================
// Catalogo de tratamientos con precios + mapeo hallazgo->tratamiento
// (Fase 4A). Lectura para cualquier usuario logueado (se necesita para
// generar/editar un plan de tratamiento); creacion, edicion, importacion
// y mapeo solo para admin.
// =====================================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../db/conexion');
const { requiereSesion, requierePermiso } = require('../middleware/auth');

const router = express.Router();
router.use(requiereSesion);

const CATEGORIAS_VALIDAS = ['Prevencion', 'Operatoria', 'Endodoncia', 'Cirugia', 'Rehabilitacion', 'Ortodoncia', 'Estetica', 'Otro'];

// Hallazgos rojos del odontograma que admiten mapeo a un tratamiento
// sugerido (ver public/js/odontograma.js, catalogo HALLAZGOS).
const HALLAZGOS_MAPEABLES = [
    'caries', 'extraccion_indicada', 'endodoncia_indicada', 'corona_indicada',
    'sellante_necesario', 'protesis_fija_indicada', 'protesis_removible_indicada',
    'protesis_total_indicada', 'implante_indicado'
];

function normalizarPrecio(valorCrudo) {
    if (valorCrudo === null || valorCrudo === undefined) return NaN;
    const texto = String(valorCrudo).replace(/\$/g, '').replace(/\s/g, '').replace(/,/g, '');
    return Number(texto);
}

// -----------------------------------------------------------------
// GET /api/tratamientos?activo=1&categoria=&busqueda=
// -----------------------------------------------------------------
router.get('/', (req, res) => {
    const condiciones = [];
    const parametros = [];
    if (req.query.activo === '1') { condiciones.push('activo = 1'); }
    if (req.query.categoria) { condiciones.push('categoria = ?'); parametros.push(req.query.categoria); }
    if (req.query.busqueda) {
        condiciones.push('(nombre LIKE ? OR codigo LIKE ?)');
        const like = `%${req.query.busqueda}%`;
        parametros.push(like, like);
    }
    const sql = `SELECT * FROM tratamientos ${condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : ''} ORDER BY categoria, nombre`;
    res.json(db.prepare(sql).all(...parametros));
});

// GET /api/tratamientos/mapeo - mapeo hallazgo -> tratamiento(s), con nombres resueltos
router.get('/mapeo', (req, res) => {
    const filas = db.prepare('SELECT * FROM mapeo_hallazgo_tratamiento').all();
    const porCodigo = {};
    filas.forEach((f) => { porCodigo[f.hallazgo_codigo] = f; });

    const resolver = (id) => id ? db.prepare('SELECT id, nombre, precio FROM tratamientos WHERE id = ?').get(id) : null;

    const resultado = HALLAZGOS_MAPEABLES.map((codigo) => {
        const fila = porCodigo[codigo] || {};
        return {
            hallazgo_codigo: codigo,
            tratamiento: resolver(fila.tratamiento_id),
            tratamiento_2_superficies: codigo === 'caries' ? resolver(fila.tratamiento_id_2_superficies) : undefined,
            tratamiento_3_superficies: codigo === 'caries' ? resolver(fila.tratamiento_id_3_superficies) : undefined
        };
    });
    res.json(resultado);
});

// PUT /api/tratamientos/mapeo/:hallazgoCodigo - solo admin
router.put('/mapeo/:hallazgoCodigo', requierePermiso('catalogos.tratamientos'), (req, res) => {
    const codigo = req.params.hallazgoCodigo;
    if (!HALLAZGOS_MAPEABLES.includes(codigo)) return res.status(400).json({ error: 'Hallazgo no reconocido' });

    const { tratamiento_id, tratamiento_id_2_superficies, tratamiento_id_3_superficies } = req.body;

    db.prepare(`
        INSERT INTO mapeo_hallazgo_tratamiento (hallazgo_codigo, tratamiento_id, tratamiento_id_2_superficies, tratamiento_id_3_superficies)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(hallazgo_codigo) DO UPDATE SET
            tratamiento_id = excluded.tratamiento_id,
            tratamiento_id_2_superficies = excluded.tratamiento_id_2_superficies,
            tratamiento_id_3_superficies = excluded.tratamiento_id_3_superficies
    `).run(codigo, tratamiento_id || null, tratamiento_id_2_superficies || null, tratamiento_id_3_superficies || null);

    res.json({ ok: true });
});

// -----------------------------------------------------------------
// Importador desde Excel/CSV (mismo patron que routes/importador.js):
// subir -> token + vista previa -> confirmar con mapeo de columnas.
// Registrado ANTES de "/:id" para que "importar" no sea interpretado
// como un id de tratamiento.
// -----------------------------------------------------------------
const CARPETA_TEMPORAL = path.join(__dirname, '..', 'uploads', 'temp_importaciones');
if (!fs.existsSync(CARPETA_TEMPORAL)) fs.mkdirSync(CARPETA_TEMPORAL, { recursive: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const CAMPOS_TRATAMIENTO = [
    { valor: 'nombre', etiqueta: 'Nombre', obligatorio: true },
    { valor: 'codigo', etiqueta: 'Codigo' },
    { valor: 'categoria', etiqueta: 'Categoria' },
    { valor: 'precio', etiqueta: 'Precio', obligatorio: true },
    { valor: 'notas', etiqueta: 'Notas' }
];

function leerLibro(rutaArchivo) {
    const libro = XLSX.readFile(rutaArchivo, { cellDates: true });
    const hojaNombre = libro.SheetNames[0];
    const hoja = libro.Sheets[hojaNombre];
    return XLSX.utils.sheet_to_json(hoja, { defval: '', raw: false });
}

// GET /api/tratamientos/importar/campos
router.get('/importar/campos', requierePermiso('catalogos.tratamientos'), (req, res) => {
    res.json(CAMPOS_TRATAMIENTO);
});

// POST /api/tratamientos/importar/subir
router.post('/importar/subir', requierePermiso('catalogos.tratamientos'), upload.single('archivo'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se recibio ningun archivo' });

    const extension = path.extname(req.file.originalname).toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(extension)) {
        return res.status(400).json({ error: 'Formato no soportado. Use .xlsx, .xls o .csv' });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const rutaTemporal = path.join(CARPETA_TEMPORAL, `${token}${extension}`);
    fs.writeFileSync(rutaTemporal, req.file.buffer);

    try {
        const filas = leerLibro(rutaTemporal);
        if (filas.length === 0) {
            fs.unlinkSync(rutaTemporal);
            return res.status(400).json({ error: 'El archivo no contiene datos' });
        }
        res.json({ token, columnas: Object.keys(filas[0]), vistaPrevia: filas.slice(0, 5), totalFilas: filas.length });
    } catch (error) {
        if (fs.existsSync(rutaTemporal)) fs.unlinkSync(rutaTemporal);
        res.status(400).json({ error: 'No se pudo leer el archivo: ' + error.message });
    }
});

// POST /api/tratamientos/importar/confirmar
router.post('/importar/confirmar', requierePermiso('catalogos.tratamientos'), (req, res) => {
    const { token, mapeo } = req.body;
    if (!token || !mapeo) return res.status(400).json({ error: 'Datos de importacion incompletos' });

    const archivosTemp = fs.readdirSync(CARPETA_TEMPORAL).filter((f) => f.startsWith(token));
    if (archivosTemp.length === 0) {
        return res.status(400).json({ error: 'El archivo temporal expiro o no existe. Vuelva a subirlo.' });
    }
    const rutaTemporal = path.join(CARPETA_TEMPORAL, archivosTemp[0]);

    let filas;
    try {
        filas = leerLibro(rutaTemporal);
    } catch (error) {
        return res.status(400).json({ error: 'No se pudo leer el archivo: ' + error.message });
    }

    const columnaPorCampo = {};
    for (const [columnaOrigen, campoDentify] of Object.entries(mapeo)) {
        if (campoDentify) columnaPorCampo[campoDentify] = columnaOrigen;
    }

    if (!columnaPorCampo.nombre || !columnaPorCampo.precio) {
        return res.status(400).json({ error: 'Debe mapear al menos las columnas de Nombre y Precio' });
    }

    let importados = 0;
    const omitidos = [];

    const insertar = db.prepare(`
        INSERT INTO tratamientos (codigo, nombre, categoria, precio, activo, notas, creado_por)
        VALUES (?, ?, ?, ?, 1, ?, ?)
    `);

    const obtenerValor = (fila, campo) => {
        const columna = columnaPorCampo[campo];
        if (!columna) return null;
        const valor = fila[columna];
        return valor === undefined || valor === null || valor === '' ? null : String(valor).trim();
    };

    const transaccion = db.transaction((filasAImportar) => {
        filasAImportar.forEach((fila, indice) => {
            const numeroFila = indice + 2;

            const nombre = obtenerValor(fila, 'nombre');
            if (!nombre) {
                omitidos.push({ fila: numeroFila, motivo: 'Falta el nombre' });
                return;
            }

            const precioTexto = obtenerValor(fila, 'precio');
            const precioNumerico = normalizarPrecio(precioTexto);
            if (precioTexto === null || isNaN(precioNumerico) || precioNumerico < 0) {
                omitidos.push({ fila: numeroFila, motivo: `Precio invalido (${precioTexto})` });
                return;
            }

            let categoria = obtenerValor(fila, 'categoria');
            if (!categoria || !CATEGORIAS_VALIDAS.includes(categoria)) categoria = 'Otro';

            insertar.run(
                obtenerValor(fila, 'codigo'), nombre, categoria,
                Math.round(precioNumerico * 100) / 100,
                obtenerValor(fila, 'notas'), req.session.usuario.id
            );
            importados++;
        });
    });

    transaccion(filas);
    fs.unlinkSync(rutaTemporal);

    res.json({ ok: true, importados, omitidosCount: omitidos.length, omitidos });
});

// GET /api/tratamientos/:id
router.get('/:id', (req, res) => {
    const tratamiento = db.prepare('SELECT * FROM tratamientos WHERE id = ?').get(req.params.id);
    if (!tratamiento) return res.status(404).json({ error: 'Tratamiento no encontrado' });
    res.json(tratamiento);
});

// POST /api/tratamientos - solo admin
router.post('/', requierePermiso('catalogos.tratamientos'), (req, res) => {
    const { codigo, nombre, categoria, precio, hallazgo_asociado, variante_superficies, notas } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    if (!CATEGORIAS_VALIDAS.includes(categoria)) return res.status(400).json({ error: 'Categoria invalida' });
    const precioNumerico = normalizarPrecio(precio);
    if (isNaN(precioNumerico) || precioNumerico < 0) return res.status(400).json({ error: 'El precio debe ser un numero valido' });

    const resultado = db.prepare(`
        INSERT INTO tratamientos (codigo, nombre, categoria, precio, hallazgo_asociado, variante_superficies, activo, notas, creado_por)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
        (codigo || '').trim() || null, nombre.trim(), categoria, Math.round(precioNumerico * 100) / 100,
        hallazgo_asociado || null, variante_superficies || null, (notas || '').trim() || null, req.session.usuario.id
    );

    res.json({ ok: true, id: resultado.lastInsertRowid });
});

// PUT /api/tratamientos/:id - solo admin
router.put('/:id', requierePermiso('catalogos.tratamientos'), (req, res) => {
    const tratamiento = db.prepare('SELECT id FROM tratamientos WHERE id = ?').get(req.params.id);
    if (!tratamiento) return res.status(404).json({ error: 'Tratamiento no encontrado' });

    const { codigo, nombre, categoria, precio, hallazgo_asociado, variante_superficies, activo, notas } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    if (!CATEGORIAS_VALIDAS.includes(categoria)) return res.status(400).json({ error: 'Categoria invalida' });
    const precioNumerico = normalizarPrecio(precio);
    if (isNaN(precioNumerico) || precioNumerico < 0) return res.status(400).json({ error: 'El precio debe ser un numero valido' });

    db.prepare(`
        UPDATE tratamientos SET codigo = ?, nombre = ?, categoria = ?, precio = ?, hallazgo_asociado = ?,
            variante_superficies = ?, activo = ?, notas = ?
        WHERE id = ?
    `).run(
        (codigo || '').trim() || null, nombre.trim(), categoria, Math.round(precioNumerico * 100) / 100,
        hallazgo_asociado || null, variante_superficies || null,
        activo !== undefined ? (activo ? 1 : 0) : 1, (notas || '').trim() || null, req.params.id
    );

    res.json({ ok: true });
});

module.exports = router;
