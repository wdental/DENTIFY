// =====================================================================
// Catalogo de permisos por usuario.
//
// El CATALOGO es codigo (cada permiso corresponde a una verificacion real
// en routes/, via requierePermiso de middleware/auth.js); la ASIGNACION
// por usuario es datos (tabla permisos_usuario), administrable desde
// /usuarios.html sin pedir cambios de codigo.
//
// El rol "admin" implica TODOS los permisos (no necesita filas en la
// tabla), para que siempre haya quien destrabe el sistema. Algunas
// acciones siguen reservadas al rol admin sin permiso propio (anular
// evoluciones/consentimientos ya son permisos aparte; forzar doble sillon
// de un doctor y editar al profesional responsable ya registrado siguen
// siendo solo-admin, como hasta ahora).
// =====================================================================

const CATALOGO_PERMISOS = [
    {
        area: 'agenda',
        nombre: 'Agenda',
        permisos: [
            { clave: 'agenda.ver', nombre: 'Ver la agenda y las citas' },
            { clave: 'agenda.gestionar', nombre: 'Crear, editar y reagendar citas' },
            { clave: 'agenda.eliminar', nombre: 'Eliminar citas', delicado: true }
        ]
    },
    {
        area: 'pacientes',
        nombre: 'Pacientes',
        permisos: [
            { clave: 'pacientes.ver', nombre: 'Ver pacientes y sus documentos' },
            { clave: 'pacientes.gestionar', nombre: 'Crear y editar pacientes, subir documentos' },
            { clave: 'pacientes.eliminar', nombre: 'Eliminar y restaurar pacientes', delicado: true },
            { clave: 'pacientes.importar', nombre: 'Importar pacientes desde Excel/CSV', delicado: true }
        ]
    },
    {
        area: 'historia',
        nombre: 'Historia clínica',
        permisos: [
            { clave: 'historia.ver', nombre: 'Ver ficha F033, odontograma, evoluciones y diagnósticos' },
            { clave: 'historia.registrar', nombre: 'Registrar evoluciones, diagnósticos y odontogramas' }
        ]
    },
    {
        area: 'planes',
        nombre: 'Planes y consentimientos',
        permisos: [
            { clave: 'planes.ver', nombre: 'Ver planes de tratamiento y consentimientos' },
            { clave: 'planes.gestionar', nombre: 'Crear, presentar y firmar planes y consentimientos' },
            { clave: 'planes.anular', nombre: 'Anular consentimientos', delicado: true }
        ]
    },
    {
        area: 'caja',
        nombre: 'Pagos y caja',
        permisos: [
            { clave: 'caja.ver', nombre: 'Ver caja, pagos y saldos' },
            { clave: 'caja.registrar', nombre: 'Registrar pagos y planes de cuotas' },
            { clave: 'caja.anular', nombre: 'Anular pagos', delicado: true },
            { clave: 'caja.cancelar_cuotas', nombre: 'Cancelar planes de cuotas', delicado: true }
        ]
    },
    {
        area: 'laboratorio',
        nombre: 'Laboratorio',
        permisos: [
            { clave: 'laboratorio.ver', nombre: 'Ver trabajos y cuentas por pagar' },
            { clave: 'laboratorio.gestionar', nombre: 'Crear y actualizar trabajos y envíos' },
            { clave: 'laboratorio.pagar', nombre: 'Registrar y anular pagos a laboratorios', delicado: true },
            { clave: 'laboratorio.cancelar', nombre: 'Cancelar trabajos', delicado: true }
        ]
    },
    {
        area: 'catalogos',
        nombre: 'Catálogos',
        permisos: [
            { clave: 'catalogos.doctores', nombre: 'Administrar doctores', delicado: true },
            { clave: 'catalogos.tratamientos', nombre: 'Administrar tratamientos y precios', delicado: true },
            { clave: 'catalogos.plantillas', nombre: 'Administrar plantillas (consentimientos y evolución)', delicado: true },
            { clave: 'catalogos.laboratorios', nombre: 'Administrar el catálogo de laboratorios', delicado: true }
        ]
    },
    {
        area: 'sistema',
        nombre: 'Sistema',
        permisos: [
            { clave: 'sistema.usuarios', nombre: 'Gestionar usuarios y sus permisos', delicado: true },
            { clave: 'sistema.sync', nombre: 'Ejecutar la sincronización con Google Calendar', delicado: true }
        ]
    }
];

// Todas las claves validas, en orden de catalogo
const TODOS_LOS_PERMISOS = CATALOGO_PERMISOS.flatMap((a) => a.permisos.map((p) => p.clave));

// Lo que un usuario "asistencial" podia hacer ANTES de existir los
// permisos por usuario (todo lo que no era requiereAdmin). La migracion
// se los concede a los asistenciales existentes para que nadie pierda ni
// gane nada con la actualizacion; tambien es el valor por defecto si se
// crea un usuario asistencial sin marcar casillas (compatibilidad).
const PERMISOS_ASISTENCIAL_HISTORICO = [
    'agenda.ver', 'agenda.gestionar',
    'pacientes.ver', 'pacientes.gestionar',
    'historia.ver', 'historia.registrar',
    'planes.ver', 'planes.gestionar',
    'caja.ver', 'caja.registrar',
    'laboratorio.ver', 'laboratorio.gestionar'
];

function esPermisoValido(clave) {
    return TODOS_LOS_PERMISOS.includes(clave);
}

module.exports = { CATALOGO_PERMISOS, TODOS_LOS_PERMISOS, PERMISOS_ASISTENCIAL_HISTORICO, esPermisoValido };
