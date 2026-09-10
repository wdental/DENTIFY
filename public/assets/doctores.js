// =====================================================================
// Doctores de World Dental - fuente unica de verdad
// Debe coincidir siempre con el sistema de documentos de la clinica
// =====================================================================

const DOCTORES = [
    {
        registro: '1718113515',
        nombre: 'Dra. Andrea Gabriela Sandoval Panchi',
        especialidad: 'Especialista en Ortodoncia'
    },
    {
        registro: '1718591694',
        nombre: 'Dra. Lisseth Estefanía Fernández Oña',
        especialidad: 'Odontóloga General'
    },
    {
        registro: '1727686196',
        nombre: 'Dr. Edy Andrés Moreta Armijos',
        especialidad: 'Odontólogo General'
    },
    {
        registro: '1311469181',
        nombre: 'Dra. Angélica Carolina Peralta León',
        especialidad: 'Especialista en Cirugía Oral'
    }
];

// Exportar para uso en Node (servidor) y en navegador (frontend)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DOCTORES;
}
