# Dentify

Sistema de gestión para la clínica dental **World Dental** (Quito, Ecuador).

Aplicación web local: servidor Node.js + Express + SQLite, con frontend en HTML/CSS/JS vanilla (sin frameworks) servido por el mismo Express.

## Contenido de la Fase 1

- Login con roles (`admin` / `asistencial`)
- Gestión de pacientes (crear, editar, ficha completa, documentos adjuntos)
- Importador de pacientes desde Excel/CSV (migración desde Doctocliq)
- Panel de usuarios (solo administrador)
- Dashboard inicial con indicadores
- Respaldo automático diario de la base de datos

## Contenido de la Fase 2.5

- **Agenda de citas** (`/agenda.html`):
  - **Vista Día** (vista principal): dos columnas por sillón ("Sillón 1" y "Sillón 2") con franjas de 15 minutos, desde la apertura hasta el cierre del horario de atención. Las citas se muestran como tarjetas posicionadas según su hora y duración, coloreadas según su estado. Un clic en una franja vacía abre el modal de nueva cita con fecha, hora y sillón precargados; un clic en una tarjeta abre la edición.
  - **Vista Semana**: un resumen por día (total de citas y conteo por estado) con un encabezado que muestra el total de citas, % atendidas y % no-shows de la semana visible. Un clic en un día lleva a la vista Día de esa fecha.
  - **Horario de la clínica**: lunes a sábado 09:00–19:00, domingo 11:00–16:00 (visualmente diferenciado con un aviso "Bajo cita previa"). El servidor rechaza cualquier cita fuera de estos rangos.
  - **Validación de solapamientos**: un mismo sillón nunca puede tener dos citas a la misma hora (bloqueo estricto). Si un doctor queda agendado en dos sillones a la vez, se muestra una advertencia; solo el rol `admin` puede continuar de todas formas.
  - Duración por defecto de 30 minutos, ajustable en bloques de 15. Filtro por doctor conservado en ambas vistas.
  - Crear/editar/reagendar, cancelar, marcar "no asistió" y eliminar (solo admin) siguen disponibles desde el modal de edición.
- **Panel de Doctores** (`/doctores.html`, solo admin): los doctores ahora viven en la base de datos (tabla `doctores`), reemplazando a `public/assets/doctores.js`. Permite crear, editar, activar/desactivar doctores y asignar el ID de su calendario de Google, con un botón "Probar conexión".
- **Ficha del paciente**: nueva pestaña "Citas" con el historial completo de citas del paciente y un botón "Nueva cita" que abre la Agenda con el paciente y el modal precargados.
- **Panel principal**: tarjeta "Citas de hoy" (con detalle de hora, paciente, doctor y estado) y contador de citas marcadas "No asistió" en el mes en curso.
- **Sincronización unidireccional Dentify → Google Calendar**: cada cita creada, editada, reagendada o cancelada en Dentify se refleja automáticamente en el calendario del doctor asignado. Google **nunca** modifica datos de Dentify.
- **Resiliente por diseño**: la cita local siempre se guarda, incluso si Google no está disponible. Los intentos fallidos se encolan y se reintentan automáticamente cada 5 minutos (y al iniciar el servidor). El indicador en la Agenda muestra "Google Calendar al día" o "N pendientes", con un botón "Sincronizar ahora" para el administrador.

> Nota interna: el estado interno `pendiente` en la base de datos corresponde a lo que la interfaz llama **"Agendada"** (se mantuvo el valor de columna existente para no requerir una migración del esquema `CHECK` de `citas.estado`).

La base de datos ya incluye las tablas necesarias para las siguientes fases (odontograma, evoluciones, presupuestos, pagos, firma digital), listas para desarrollarse sin modificar el esquema actual.

## Requisitos

- **Node.js** versión LTS (18 o superior). Descargar de [https://nodejs.org](https://nodejs.org)

## Instalación en Windows

1. Instalar Node.js LTS desde [nodejs.org](https://nodejs.org) (dejar todas las opciones por defecto durante la instalación).
2. Copiar la carpeta `Dentify` completa al equipo (por ejemplo, en el Escritorio).
3. Hacer doble clic en **`iniciar-dentify.bat`**.
   - La primera vez instalará automáticamente las dependencias (puede tardar unos minutos).
   - Se abrirá el navegador en `http://localhost:3000` automáticamente.
4. Iniciar sesión con el usuario inicial:
   - **Usuario:** `admin`
   - **Clave:** `WDClinica2026`
5. Se recomienda cambiar la clave del administrador desde el panel de **Usuarios** en el primer uso.

Para volver a iniciar el sistema en el futuro, solo hay que hacer doble clic en `iniciar-dentify.bat` nuevamente. No cerrar la ventana negra (consola) mientras se está usando el sistema; al cerrarla, el servidor se detiene.

## Instalación en Mac

1. Instalar Node.js LTS desde [nodejs.org](https://nodejs.org).
2. Copiar la carpeta `Dentify` completa al equipo.
3. La primera vez, dar permisos de ejecución al script abriendo la Terminal en esa carpeta y ejecutando:
   ```
   chmod +x iniciar-dentify.command
   ```
4. Hacer doble clic en **`iniciar-dentify.command`**.
   - Si macOS advierte que es de un desarrollador no identificado, ir a **Preferencias del Sistema > Privacidad y Seguridad** y permitir su ejecución.
   - La primera vez instalará automáticamente las dependencias.
   - Se abrirá el navegador en `http://localhost:3000` automáticamente.
5. Iniciar sesión con el usuario inicial (`admin` / `WDClinica2026`) y cambiar la clave desde el panel de Usuarios.

## Acceso desde otro equipo en la misma red (por ejemplo, una tablet)

1. En el equipo donde corre Dentify, obtener su dirección IP local:
   - Windows: abrir `cmd` y ejecutar `ipconfig` (buscar "Dirección IPv4").
   - Mac: **Preferencias del Sistema > Red**.
2. En el otro equipo (conectado a la misma red Wi-Fi), abrir un navegador e ingresar:
   ```
   http://IP-DEL-EQUIPO:3000
   ```
   Por ejemplo: `http://192.168.1.50:3000`

## Respaldo de la base de datos

Cada vez que se inicia el servidor, se genera automáticamente una copia de seguridad de la base de datos en la carpeta `/backups`, con el formato `dentify-AAAA-MM-DD.db`. Se conservan los últimos 30 respaldos; los más antiguos se eliminan automáticamente.

## Configuración de la sincronización con Google Calendar

La sincronización es **opcional**: si no se configura, Dentify funciona con normalidad y simplemente no envía las citas a ningún calendario (cada cita queda marcada como "Sin calendario"). Para activarla:

### 1. Crear la cuenta de servicio en Google Cloud

1. Entrar a [Google Cloud Console](https://console.cloud.google.com/) y crear (o usar) un proyecto para la clínica.
2. Habilitar la **Google Calendar API** (menú "APIs y servicios" → "Habilitar APIs y servicios").
3. Ir a "APIs y servicios" → "Credenciales" → "Crear credenciales" → **Cuenta de servicio**.
4. Una vez creada, entrar a la cuenta de servicio → pestaña "Claves" → "Agregar clave" → "Crear clave nueva" → formato **JSON**. Se descargará un archivo.
5. Renombrar ese archivo a **`google-credentials.json`** y copiarlo en la **raíz** del proyecto Dentify (junto a `server.js`). Este archivo es secreto: ya está excluido de git (`.gitignore`) y nunca se incluye en los respaldos automáticos de la base de datos (los respaldos solo copian `dentify.db`).

### 2. Compartir el calendario de cada doctor con la cuenta de servicio

La cuenta de servicio tiene su propio correo (algo como `dentify-sync@nombre-proyecto.iam.gserviceaccount.com`, visible en el archivo JSON descargado o en la consola de Google Cloud).

1. En Google Calendar, cada doctor (o el administrador en su nombre) abre la configuración del calendario que se quiere sincronizar.
2. En "Compartir con determinadas personas", agregar el correo de la cuenta de servicio con permiso **"Realizar cambios en los eventos"**.
3. Copiar el **ID del calendario** (en "Integrar calendario", campo "ID del calendario" — suele verse como un correo o terminar en `@group.calendar.google.com`).

### 3. Configurar el doctor en Dentify

1. Iniciar sesión como administrador y entrar al panel **Doctores**.
2. Editar al doctor correspondiente y pegar el ID del calendario en el campo "ID del calendario de Google".
3. Presionar **"Probar conexión"** para confirmar que la cuenta de servicio tiene acceso. Si todo está bien, se muestra el nombre del calendario encontrado.
4. Guardar. A partir de ese momento, las citas de ese doctor se sincronizan automáticamente.

Un doctor **inactivo** o sin calendario configurado simplemente no sincroniza sus citas (sin generar errores). El nombre del doctor queda igualmente guardado en cada cita e historial, aunque luego se edite o desactive al doctor.

### Qué información viaja a Google

Por privacidad, el evento en Google Calendar contiene **únicamente**:
- Título: `Motivo — Nombre y primera letra del apellido (Sillón N)` (ej. `Valoración — María G. (Sillón 1)`)
- Fecha y hora
- Descripción fija: `Gestionado desde Dentify. Detalles en el sistema.`

Nunca se envían cédula, teléfono, notas clínicas ni ningún otro dato sensible del paciente.

### Si Google no está disponible

Cada cita se guarda siempre en Dentify, sin importar si Google responde o no. Si un intento de sincronización falla (sin internet, credenciales inválidas, calendario sin compartir, etc.), la operación se encola y Dentify reintenta automáticamente cada 5 minutos y al iniciar el servidor. En la página **Agenda**:
- El indicador junto al título muestra "Google Calendar al día" o "N pendientes".
- El administrador puede forzar un reintento inmediato con el botón **"Sincronizar ahora"**.
- Más abajo, un panel visible solo para administradores muestra la última ejecución y los errores recientes.

## Estructura del proyecto

```
Dentify/
├── server.js                  Servidor principal Express
├── google-credentials.json    Credenciales de la cuenta de servicio de Google (no incluido; ver arriba)
├── db/
│   ├── conexion.js            Conexion a SQLite, migraciones y siembra inicial
│   ├── migraciones.js         Migraciones ligeras entre versiones del esquema
│   ├── semillaDoctores.js     Datos iniciales de los doctores (solo se usa una vez)
│   ├── schema.sql              Esquema de base de datos
│   └── dentify.db              Base de datos (se crea automaticamente)
├── routes/                     Rutas de la API (auth, pacientes, usuarios, importador, dashboard,
│                                doctores, citas, sync)
├── middleware/                 Middlewares de autenticacion y roles
├── utils/                      Utilidades (respaldo, numero de historia, googleCalendar, sincronizacion)
├── public/                     Frontend (HTML, CSS, JS, sin frameworks)
├── uploads/pacientes/          Documentos adjuntos de cada paciente
├── backups/                    Respaldos automaticos de la base de datos
├── iniciar-dentify.bat         Script de arranque (Windows)
└── iniciar-dentify.command     Script de arranque (Mac)
```

## Notas técnicas

- Todo el sistema está en español.
- El servidor escucha en `0.0.0.0:3000` para ser accesible desde la red local.
- La sesión de usuario dura 12 horas de inactividad.
- Solo el rol `admin` puede eliminar pacientes, gestionar usuarios, importar pacientes desde archivo, gestionar doctores y eliminar citas.
- Los doctores viven en la tabla `doctores` de la base de datos (ya no en `public/assets/doctores.js`, que fue eliminado en la Fase 2.5).
- `google-credentials.json` nunca debe compartirse ni subirse a un repositorio: está en `.gitignore` y fuera del alcance de los respaldos automáticos (que solo copian `dentify.db`).
