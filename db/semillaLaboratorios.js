// =====================================================================
// Laboratorios con los que trabaja World Dental (Fase 4C).
// Se siembran una sola vez, cuando la tabla `laboratorios` esta vacia.
// Despues la tabla es la unica fuente de verdad y se edita desde el
// panel de administrador en /laboratorio.html.
// =====================================================================

const LABORATORIOS_INICIALES = [
    {
        nombre: 'MBC Dental Cad',
        contacto: 'Marlon'
    },
    {
        nombre: 'Romel Rodriguez Dental Esthetics Lab',
        contacto: 'Romel Rodriguez',
        telefono: '987712508',
        email: 'romelin_rr@hotmail.com',
        direccion: 'Miravalle S7-E19'
    },
    {
        nombre: 'Join Lab'
    },
    {
        nombre: 'JC Dental',
        telefono: '978847188',
        email: 'jcdental011@gmail.com',
        direccion: 'Sur de Quito',
        datos_transferencia: 'Banco Pichincha · Cuenta de ahorros · Damaris Cumbajin · 2205694190'
    },
    {
        nombre: 'Sorriso Dental',
        telefono: '593987699234',
        email: 'sorrisodentalab1@gmail.com',
        direccion: 'Valle de los Chillos'
    },
    {
        nombre: 'Creando Sonrisas Lab',
        contacto: 'Paulina Ramirez',
        telefono: '952229092',
        direccion: 'Santa Clara',
        datos_transferencia: 'Banco Pichincha · Ahorros · Pedro Fuerez · 2203086630'
    },
    {
        nombre: 'Ortho Laboratorio',
        contacto: 'Sra. Chango',
        telefono: '997102723',
        direccion: 'Calle Jose Tamayo N24-625 y C. Colon'
    }
];

function sembrarLaboratorios(db) {
    const total = db.prepare('SELECT COUNT(*) AS total FROM laboratorios').get().total;
    if (total > 0) return;

    const insertar = db.prepare(`
        INSERT INTO laboratorios (nombre, contacto, telefono, email, direccion, datos_transferencia, activo)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    const transaccion = db.transaction(() => {
        LABORATORIOS_INICIALES.forEach((lab) => {
            insertar.run(
                lab.nombre,
                lab.contacto || null,
                lab.telefono || null,
                lab.email || null,
                lab.direccion || null,
                lab.datos_transferencia || null
            );
        });
    });
    transaccion();

    console.log(`Laboratorios iniciales sembrados (${LABORATORIOS_INICIALES.length})`);
}

module.exports = { LABORATORIOS_INICIALES, sembrarLaboratorios };
