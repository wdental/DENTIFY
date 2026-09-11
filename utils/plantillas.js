// =====================================================================
// Utilidades compartidas para resolver plantillas de consentimiento
// informado (Fase 3C): sustitucion de marcadores {marcador} y los tres
// bloques de decision (Acepto / Rechazo / Revoco), migrados palabra por
// palabra del patron tripartito de WD_DOCS.
// =====================================================================

// Reemplaza cada {marcador} presente en `datos` por su valor; un marcador
// sin dato en `datos` se deja vacio (nunca se filtra texto sin resolver).
function resolverMarcadores(contenido, datos) {
    return contenido.replace(/\{(\w+)\}/g, (coincide, clave) => {
        const valor = datos[clave];
        return valor === undefined || valor === null ? '' : String(valor);
    });
}

// ", representado(a) legalmente por X (C.I. Y)" - vacio si no aplica.
function construirClausulaRepresentante(esMenor, representanteNombre, representanteCedula) {
    if (!esMenor || !representanteNombre) return '';
    return `, representado(a) legalmente por ${representanteNombre}${representanteCedula ? ` (C.I. ${representanteCedula})` : ''}`;
}

const BLOQUES_DECISION = {
    aceptado: '<h4>Declaración y firma</h4><p><strong>☑ Acepto el procedimiento.</strong> He sido informado del procedimiento, sus beneficios y sus posibles riesgos. He comprendido la información y autorizo libremente la realización del procedimiento propuesto.</p>',
    rechazado: '<h4>Declaración y firma</h4><p><strong>☑ Rechazo el procedimiento.</strong> Una vez que he entendido claramente el procedimiento propuesto, así como las consecuencias posibles si no se realiza la intervención, no autorizo y me niego a que se me realice el procedimiento propuesto.</p>'
};

// Texto de revocacion: referencia el consentimiento original (plantilla +
// fecha de la firma original) para que el acto de revocacion sea legible
// por si solo, sin depender de mirar el documento vinculado.
function textoRevocacion(nombrePlantilla, fechaOriginal) {
    return `<h4>Revocación del consentimiento</h4><p><strong>☑ Revoco el consentimiento.</strong> De forma libre y voluntaria, revoco el consentimiento otorgado para "${nombrePlantilla}" (firmado el ${fechaOriginal}) y manifiesto expresamente mi deseo de no continuar con el procedimiento, que doy por finalizado en esta fecha.</p>`;
}

// Misma formula que routes/pacientes.js (duplicada intencionalmente: es una
// utilidad de 8 lineas, no vale la pena acoplar los dos modulos por esto).
function calcularEdad(fechaNacimiento) {
    if (!fechaNacimiento) return null;
    const hoy = new Date();
    const nacimiento = new Date(fechaNacimiento);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const mes = hoy.getMonth() - nacimiento.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
        edad--;
    }
    return edad;
}

module.exports = { resolverMarcadores, construirClausulaRepresentante, BLOQUES_DECISION, textoRevocacion, calcularEdad };
