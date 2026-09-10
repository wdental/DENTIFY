// =====================================================================
// Importador de pacientes desde Excel (.xlsx) o CSV
// Solo administrador. Flujo: subir -> vista previa + mapeo -> confirmar
// =====================================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../db/conexion');
const { requiereSesion, requiereAdmin } = require('../middleware/auth');
const { generarNumeroHistoria } = require('../utils/numeroHistoria');

const router = express.Router();
router.use(requiereSesion, requiereAdmin);

const CARPETA_TEMPORAL = path.join(__dirname, '..', 'uploads', 'temp_importaciones');
if (!fs.existsSync(CARPETA_TEMPORAL)) {
    fs.mkdirSync(CARPETA_TEMPORAL, { recursive: true });
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Campos de Dentify disponibles para el mapeo (numero_historia se autogenera)
const CAMPOS_DENTIFY = [
    { valor: 'nombres', etiqueta: 'Nombres', obligatorio: true },
    { valor: 'apellidos', etiqueta: 'Apellidos', obligatorio: true },
    { valor: 'cedula', etiqueta: 'Cedula' },
    { valor: 'fecha_nacimiento', etiqueta: 'Fecha de nacimiento' },
    { valor: 'sexo', etiqueta: 'Sexo (F/M/O)' },
    { valor: 'telefono', etiqueta: 'Telefono' },
    { valor: 'whatsapp', etiqueta: 'WhatsApp' },
    { valor: 'email', etiqueta: 'Correo electronico' },
    { valor: 'direccion', etiqueta: 'Direccion' },
    { valor: 'origen', etiqueta: 'Origen' },
    { valor: 'alergias', etiqueta: 'Alergias' },
    { valor: 'antecedentes_medicos', etiqueta: 'Antecedentes medicos' },
    { valor: 'antecedentes_odontologicos', etiqueta: 'Antecedentes odontologicos' },
    { valor: 'medicamentos_actuales', etiqueta: 'Medicamentos actuales' },
    { valor: 'notas', etiqueta: 'Notas' }
];

function leerLibro(rutaArchivo) {
    const libro = XLSX.readFile(rutaArchivo, { cellDates: true });
    const hojaNombre = libro.SheetNames[0];
    const hoja = libro.Sheets[hojaNombre];
    return XLSX.utils.sheet_to_json(hoja, { defval: '', raw: false });
}

// GET /api/importador/campos - lista de campos disponibles para mapear
router.get('/campos', (req, res) => {
    res.json(CAMPOS_DENTIFY);
});

// -----------------------------------------------------------------
// POST /api/importador/subir - sube el archivo, guarda temporal y devuelve vista previa
// -----------------------------------------------------------------
router.post('/subir', upload.single('archivo'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se recibio ningun archivo' });
    }

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

        const columnas = Object.keys(filas[0]);
        const vistaPrevia = filas.slice(0, 5);

        res.json({
            token,
            columnas,
            vistaPrevia,
            totalFilas: filas.length
        });
    } catch (error) {
        if (fs.existsSync(rutaTemporal)) fs.unlinkSync(rutaTemporal);
        res.status(400).json({ error: 'No se pudo leer el archivo: ' + error.message });
    }
});

// -----------------------------------------------------------------
// POST /api/importador/confirmar - aplica el mapeo e importa todos los registros
// body: { token, extension, mapeo: { columnaOrigen: campoDentify } }
// -----------------------------------------------------------------
router.post('/confirmar', (req, res) => {
    const { token, mapeo } = req.body;

    if (!token || !mapeo) {
        return res.status(400).json({ error: 'Datos de importacion incompletos' });
    }

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

    // Invertir el mapeo: { campoDentify: columnaOrigen }
    const columnaPorCampo = {};
    for (const [columnaOrigen, campoDentify] of Object.entries(mapeo)) {
        if (campoDentify) columnaPorCampo[campoDentify] = columnaOrigen;
    }

    if (!columnaPorCampo.nombres || !columnaPorCampo.apellidos) {
        return res.status(400).json({ error: 'Debe mapear al menos las columnas de Nombres y Apellidos' });
    }

    const cedulasVistas = new Set();
    let importados = 0;
    const omitidos = [];

    const insertar = db.prepare(`
        INSERT INTO pacientes (
            numero_historia, nombres, apellidos, cedula, fecha_nacimiento, sexo,
            telefono, whatsapp, email, direccion, origen,
            alergias, antecedentes_medicos, antecedentes_odontologicos, medicamentos_actuales,
            notas, activo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const obtenerValor = (fila, campo) => {
        const columna = columnaPorCampo[campo];
        if (!columna) return null;
        const valor = fila[columna];
        return valor === undefined || valor === null || valor === '' ? null : String(valor).trim();
    };

    const transaccionImportacion = db.transaction((filasAImportar) => {
        filasAImportar.forEach((fila, indice) => {
            const numeroFila = indice + 2; // +1 por encabezado, +1 por base 1

            const nombres = obtenerValor(fila, 'nombres');
            const apellidos = obtenerValor(fila, 'apellidos');

            if (!nombres || !apellidos) {
                omitidos.push({ fila: numeroFila, motivo: 'Faltan nombres o apellidos' });
                return;
            }

            let cedula = obtenerValor(fila, 'cedula');
            if (cedula) {
                cedula = cedula.replace(/\D/g, '');
                if (cedula.length !== 10) {
                    omitidos.push({ fila: numeroFila, motivo: `Cedula invalida (${cedula})` });
                    return;
                }
                if (cedulasVistas.has(cedula)) {
                    omitidos.push({ fila: numeroFila, motivo: `Cedula duplicada dentro del archivo (${cedula})` });
                    return;
                }
                const existente = db.prepare('SELECT id FROM pacientes WHERE cedula = ?').get(cedula);
                if (existente) {
                    omitidos.push({ fila: numeroFila, motivo: `Cedula ya registrada en el sistema (${cedula})` });
                    return;
                }
                cedulasVistas.add(cedula);
            } else {
                cedula = null;
            }

            let sexo = obtenerValor(fila, 'sexo');
            if (sexo) {
                sexo = sexo.trim().toUpperCase().charAt(0);
                if (!['F', 'M', 'O'].includes(sexo)) sexo = null;
            }

            const numeroHistoria = generarNumeroHistoria();

            insertar.run(
                numeroHistoria,
                nombres,
                apellidos,
                cedula,
                obtenerValor(fila, 'fecha_nacimiento'),
                sexo,
                obtenerValor(fila, 'telefono'),
                obtenerValor(fila, 'whatsapp'),
                obtenerValor(fila, 'email'),
                obtenerValor(fila, 'direccion'),
                obtenerValor(fila, 'origen'),
                obtenerValor(fila, 'alergias'),
                obtenerValor(fila, 'antecedentes_medicos'),
                obtenerValor(fila, 'antecedentes_odontologicos'),
                obtenerValor(fila, 'medicamentos_actuales'),
                obtenerValor(fila, 'notas')
            );

            importados++;
        });
    });

    transaccionImportacion(filas);

    fs.unlinkSync(rutaTemporal);

    res.json({
        ok: true,
        importados,
        omitidosCount: omitidos.length,
        omitidos
    });
});

module.exports = router;
