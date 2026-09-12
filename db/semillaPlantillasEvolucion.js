// =====================================================================
// Plantillas guia para la nota de evolucion (seccion P del F033).
//
// Se siembran una sola vez, cuando la tabla esta vacia. Son un PUNTO DE
// PARTIDA editable desde /plantillas.html (pestaña "Notas de evolución"),
// no un texto fijo: cada clinica y cada doctor redactan distinto.
//
// IMPORTANTE: las dosis de las plantillas de prescripcion son las de
// referencia habituales para un adulto sano. Hay que REVISARLAS y
// ajustarlas al criterio de la clinica antes de usarlas, y en cada
// paciente sigue decidiendo el profesional (alergias, peso, embarazo,
// interacciones). Estan aqui para no teclear lo mismo cada vez, no para
// reemplazar la indicacion clinica.
//
// Marcadores admitidos en `texto`: {piezas}, {doctor}, {fecha}.
// =====================================================================

const PLANTILLAS_EVOLUCION_INICIALES = [
    // ---------------- Diagnostico / complicaciones ----------------
    { campo: 'diagnostico', nombre: 'Sin complicaciones', texto: 'No presenta complicaciones.' },
    { campo: 'diagnostico', nombre: 'Caries dental', texto: 'Caries dental en pieza(s) {piezas}.' },
    { campo: 'diagnostico', nombre: 'Pulpitis irreversible', texto: 'Pulpitis irreversible en pieza(s) {piezas}.' },
    { campo: 'diagnostico', nombre: 'Gingivitis', texto: 'Gingivitis generalizada asociada a placa bacteriana.' },
    { campo: 'diagnostico', nombre: 'Periodontitis', texto: 'Periodontitis crónica con cálculo supra y subgingival.' },
    { campo: 'diagnostico', nombre: 'Paciente colaborador', texto: 'Paciente colaborador, tolera bien el procedimiento.' },

    // ---------------- Procedimientos realizados ----------------
    { campo: 'procedimientos', nombre: 'Anestesia', texto: 'Anestesia infiltrativa con lidocaína al 2% con epinefrina 1:80.000.' },
    { campo: 'procedimientos', nombre: 'Profilaxis', texto: 'Profilaxis dental: destartraje supragingival, pulido coronario con copa de goma y pasta profiláctica. Indicaciones de higiene oral reforzadas.' },
    { campo: 'procedimientos', nombre: 'Destartraje', texto: 'Destartraje supra y subgingival por cuadrantes con ultrasonido. Irrigación y pulido final.' },
    { campo: 'procedimientos', nombre: 'Restauración con resina', texto: 'Aislamiento relativo. Remoción de tejido cariado en pieza(s) {piezas}. Grabado ácido, sistema adhesivo y restauración con resina compuesta por capas. Ajuste oclusal y pulido.' },
    { campo: 'procedimientos', nombre: 'Sellantes', texto: 'Profilaxis de la(s) pieza(s) {piezas}, grabado ácido, lavado y secado, colocación de sellante de fosas y fisuras y fotopolimerizado. Verificación de la oclusión.' },
    { campo: 'procedimientos', nombre: 'Endodoncia (sesión)', texto: 'Apertura cameral en pieza(s) {piezas}, localización de conductos, instrumentación y conformación. Irrigación con hipoclorito de sodio. Medicación intraconducto y sellado provisional.' },
    { campo: 'procedimientos', nombre: 'Exodoncia simple', texto: 'Exodoncia simple de pieza(s) {piezas}: sindesmotomía, luxación y avulsión sin complicaciones. Revisión del alvéolo, irrigación con suero fisiológico y compresión con gasa. Indicaciones postoperatorias entregadas al paciente.' },
    { campo: 'procedimientos', nombre: 'Impresión / escaneo', texto: 'Toma de impresión y escaneo intraoral de pieza(s) {piezas} para envío a laboratorio. Registro de color y colocación de provisional.' },
    { campo: 'procedimientos', nombre: 'Cementación de corona', texto: 'Prueba de corona en pieza(s) {piezas}: ajuste de márgenes, contactos proximales y oclusión. Cementación definitiva, remoción de excesos y control oclusal.' },
    { campo: 'procedimientos', nombre: 'Control de ortodoncia', texto: 'Control de ortodoncia: revisión de la aparatología, cambio de ligaduras y activación de arco. Refuerzo de indicaciones de higiene.' },
    { campo: 'procedimientos', nombre: 'Control posoperatorio', texto: 'Control posoperatorio: revisión de la zona intervenida, sin signos de infección. Retiro de sutura. Paciente sin molestias.' },
    { campo: 'procedimientos', nombre: 'Alta del tratamiento', texto: 'Se concluye el tratamiento planificado. Paciente dado de ALTA. Se indican controles periódicos cada 6 meses.' },

    // ---------------- Prescripciones (REVISAR DOSIS) ----------------
    { campo: 'prescripciones', nombre: 'Sin prescripción', texto: 'No requiere prescripción.' },
    { campo: 'prescripciones', nombre: 'Analgésico (ibuprofeno)', texto: 'Ibuprofeno 400 mg: 1 tableta cada 8 horas por 3 días, con alimentos.' },
    { campo: 'prescripciones', nombre: 'Analgésico (paracetamol)', texto: 'Paracetamol 500 mg: 1 tableta cada 8 horas por 3 días.' },
    { campo: 'prescripciones', nombre: 'Antibiótico (amoxicilina)', texto: 'Amoxicilina 500 mg: 1 cápsula cada 8 horas por 7 días. Completar el tratamiento.' },
    { campo: 'prescripciones', nombre: 'Antibiótico (alergia a penicilina)', texto: 'Clindamicina 300 mg: 1 cápsula cada 8 horas por 7 días. Completar el tratamiento.' },
    { campo: 'prescripciones', nombre: 'Enjuague con clorhexidina', texto: 'Clorhexidina 0,12%: enjuagar 15 ml sin diluir dos veces al día por 7 días, después del cepillado.' },
    { campo: 'prescripciones', nombre: 'Indicaciones posexodoncia', texto: 'Mantener compresión con gasa 30 minutos. No escupir ni enjuagarse las primeras 24 horas. No fumar. Dieta blanda y fría el primer día. Aplicar frío local. Acudir a control si hay sangrado persistente, dolor intenso o fiebre.' }
];

function sembrarPlantillasEvolucion(db) {
    const total = db.prepare('SELECT COUNT(*) AS total FROM plantillas_evolucion').get().total;
    if (total > 0) return;

    const insertar = db.prepare(
        'INSERT INTO plantillas_evolucion (nombre, campo, texto, orden, activo) VALUES (?, ?, ?, ?, 1)'
    );
    const ordenPorCampo = {};
    db.transaction(() => {
        PLANTILLAS_EVOLUCION_INICIALES.forEach((p) => {
            ordenPorCampo[p.campo] = (ordenPorCampo[p.campo] || 0) + 10;
            insertar.run(p.nombre, p.campo, p.texto, ordenPorCampo[p.campo]);
        });
    })();

    console.log(`Plantillas de nota de evolucion sembradas (${PLANTILLAS_EVOLUCION_INICIALES.length}) - revise las dosis de las prescripciones en /plantillas.html`);
}

module.exports = { PLANTILLAS_EVOLUCION_INICIALES, sembrarPlantillasEvolucion };
