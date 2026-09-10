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

## Contenido de la Fase 3A (en curso)

Ficha clínica odontológica basada en el **Formulario 033 del MSP Ecuador** (SNS-MSP/HCU-form.033/2021), nueva pestaña **"Ficha clínica (F033)"** en la ficha del paciente (`public/paciente.html`). Las secciones B a J se guardan con un **único botón flotante "Guardar ficha clínica"** (esquina inferior derecha, siempre visible al hacer scroll, con un punto rojo cuando hay cambios sin guardar); cada sección conserva su punto de completitud en el encabezado colapsable. El odontograma (H) es la excepción: conserva su propio "Guardar nueva versión" por ser un acto formal de versionado (ver más abajo).

- **B. Motivo de consulta** — texto libre + campo "Embarazada" (visible solo si el sexo del paciente es F).
- **C. Enfermedad actual** — texto libre.
- **D. Antecedentes patológicos personales** — los 10 ítems del F033 (alergia a antibiótico, alergia a anestesia, hemorragias, VIH/SIDA, tuberculosis, asma, diabetes, hipertensión, enfermedad cardíaca, otro) + observaciones.
- **E. Antecedentes patológicos familiares** — los 10 ítems del F033 + observaciones.
- **F. Constantes vitales** — temperatura, pulso, frecuencia respiratoria, presión arterial.
- **G. Examen del sistema estomatognático** — los 13 ítems del F033, cada uno con checkbox "con patología" + descripción.
- **H. Odontograma** — ver detalle abajo.
- **I. Indicadores de salud bucal** — higiene oral simplificada (Placa/Cálculo/Gingivitis por grupo de piezas, con totales), enfermedad periodontal, tipo de oclusión (Angle) y nivel de fluorosis.
- **J. Índices CPO-ceo** — fila D (permanente: C/P/O) y fila d (temporal: c/e/o), con total autocalculado y un botón "Usar sugerido" que trae el cálculo automático desde el odontograma activo (ver abajo), ajustable manualmente.

### Odontograma interactivo (núcleo de la Fase 3A) — rediseño "paleta de herramientas"

El odontograma (`public/js/odontograma.js`) usa un layout de **tres zonas** y el paradigma **paleta → pintar**: se activa una herramienta a la izquierda y se aplica con clics sobre el diagrama al centro; el panel de la derecha muestra los índices CPO-ceo calculados en vivo. Sigue siendo **inmutable por versión** (sin cambios en esa lógica): un odontograma guardado nunca se edita — "Registrar nuevo odontograma" parte de una copia de trabajo de la versión activa y, al guardar (con confirmación explícita), crea una nueva fila en `odontogramas` con `es_version_activa = 1` dentro de una transacción que desactiva la anterior. El selector de versiones, "Doctor que registra", "Observaciones de esta versión", Cancelar edición / Guardar nueva versión / Imprimir vista actual y el aviso "Editando nueva versión — aún no guardada" siguen todos presentes, solo reubicados en la barra superior del nuevo layout.

**Layout compacto, sin scroll horizontal**: el `.odonto-layout` de tres columnas (paleta 165px / centro / CPO 180px) solo se activa a **partir de 1280px de ancho de viewport** — por debajo de eso (incluida la tablet horizontal, 1024px) la paleta se apila arriba como tira horizontal scrolleable y el centro toma el ancho completo. Las piezas se compactaron (27px las permanentes, 13px de radio externo las temporales, 2px de separación) para que las 16 piezas de una arcada permanente quepan en ~498px — medido en navegador sin scroll horizontal tanto a 1280px como a 1024px de viewport.

- **Izquierda — paleta fija**: grupos "Patología actual · Rojo", "Tratamiento realizado · Azul", "Otros", "Adicionales" (con el subtítulo "Se detallan en observaciones al imprimir el F033") y "Herramientas" (Movilidad, Recesión, Borrar hallazgo). Cada botón dibuja el **símbolo verdadero en miniatura y en su color real** (nada de cuadrados genéricos): el asterisco de sellante, la X de extracción/pérdida, el triángulo de endodoncia, el doble contorno de corona, el ⊡—⊡/(—)/=== de las prótesis, el ⊗ de pérdida por otra causa, la "A" de ausente y el tornillo del implante — la leyenda bajo el odontograma reutiliza exactamente los mismos íconos. Un clic activa la herramienta (borde dorado, una sola a la vez; ESC o un segundo clic la desactiva). Toda la paleta aparece atenuada y deshabilitada (`aria-disabled="true"`) salvo cuando hay una versión en edición.
- **Centro**: el diagrama SVG con las cuatro arcadas del F033, seguido de la leyenda completa y un recuadro dorado con la regla de inmutabilidad del F033.
- **Derecha — "Índices CPO-ceo — calculados"**: tabla C/P/O (permanente) y c/e/o (temporal) que se recalcula en cada clic sobre el diagrama. Panel colapsable (`<details>`).

**Geometría fiel al F033**: cada pieza **permanente** es un cuadrado con cuadrado interior — 5 superficies: mesial, distal, vestibular, lingual/palatino y oclusal al centro, con zonas de clic exactamente delimitadas por la misma geometría que se pinta (un solo `<path>` hace de zona de clic y de relleno, así que no hay forma de que el clic quede desalineado del área pintada). Cada pieza **temporal** es un círculo equivalente de 5 zonas. La orientación se espeja correctamente por cuadrante: **vestibular** siempre hacia el exterior de la boca (arriba en la arcada superior, abajo en la inferior) y **mesial** siempre hacia la línea media. Las cuatro filas siguen el orden del F033, centradas, con línea media sutil por fila. Las cajitas de **movilidad** y **recesión** ahora son dos filas horizontales propias (una por índice) rotuladas **"MOV"** y **"REC"** al margen izquierdo — como en el F033 — con una cajita por pieza **permanente** (nunca en temporales), separadas del número de la pieza para que este quede siempre legible.

**Simbología — nombres y símbolos EXACTOS de la sección K del F033**, corregidos tras revisión contra el instructivo oficial (colores `--rojo-patologia: #C0392B` / `--azul-tratamiento: #1F5FBF`, distintos del dorado de marca y del rojo de alerta general del resto del sistema):

| Rojo (patología / por realizar) | Azul (tratamiento realizado) |
|---|---|
| Caries — relleno rojo, EXACTAMENTE en la superficie clicada | Obturado — relleno azul, EXACTAMENTE en la superficie clicada |
| Sellante necesario — asterisco rojo **bajo el diente** (nunca sobre la superficie) | Sellante realizado — asterisco azul **bajo el diente** |
| Extracción indicada — X roja sobre toda la pieza | Pérdida por caries — X azul sobre toda la pieza |
| Endodoncia por realizar — triángulo rojo, solo contorno | Endodoncia realizada — triángulo azul, relleno |
| Corona indicada — doble contorno **fino**, pegado a la pieza (cuadrado en permanentes, **círculo** en temporales) | Corona realizada — igual, en azul |
| Prótesis fija indicada — ⊡—⊡ rojo (tramo) | Prótesis fija realizada — ⊡—⊡ azul (tramo) |
| Prótesis removible indicada — (—) rojo (tramo) | Prótesis removible realizada — (—) azul (tramo) |
| Prótesis total indicada — === roja (tramo) | Prótesis total realizada — === azul (tramo) |

Otros: **Pérdida (otra causa)** = ⊗ **azul** (corregido — antes usaba un color neutro por error), **Ausente** = pieza atenuada (opacidad 0.35) con una letra **A grande y protagonista** encima (color `--neutro-hallazgo: #4A4642`). Adicionales (únicos fuera de la simbología K, `fuera_simbologia_f033 = 1`): **Implante indicado/realizado** = tornillo estilizado en rojo/azul.

**Interacción**: herramientas de **superficie** (caries, obturado, sellantes) marcan/desmarcan (toggle) la cara donde se hace clic — el sellante nunca rellena la superficie, solo dibuja el asterisco bajo el diente. Herramientas de **pieza completa** hacen toggle con un clic en la pieza o su número. Herramientas de **tramo** (las tres prótesis) piden dos clics — pieza inicial y final —, muestran el hint "seleccione la pieza final" y **validan que ambas piezas sean de la misma arcada** (se rechaza con una alerta). El hover ilumina la zona bajo el cursor con el color de la herramienta activa. **Borrar hallazgo**: un clic quita el último hallazgo de esa superficie/pieza; doble clic limpia toda la pieza (hallazgos, movilidad, recesión y cualquier tramo donde participe). Un contador discreto "N hallazgos" acompaña al botón Guardar.

**Autocálculo CPO-ceo**: tanto el panel en vivo (cliente) como `GET /api/odontograma/:pacienteId/cpo-sugerido` cuentan piezas distintas por prioridad pérdida/ausente > caries > obturado, separando permanente de temporal por el primer dígito FDI, **ignorando siempre el implante**.

**Simplificaciones conocidas**: la alineación horizontal de las piezas temporales bajo sus sucesoras permanentes es aproximada (cada fila se centra por su propio ancho); extracción indicada/pérdida por caries comparten la misma forma (X) distinguida solo por color, y las prótesis también, siguiendo la definición literal de la sección K del F033 — la única distinción de forma además de color es endodoncia (contorno vs. relleno) y corona (cuadrado vs. círculo según denticion).

### Guardado unificado de la ficha clínica y aviso de salida

- **Un solo botón** ("Guardar ficha clínica", flotante, esquina inferior derecha) guarda las 8 secciones B, C, D, E, F, G, I, J de una vez (8 `PUT` en paralelo a `routes/ficha-clinica.js`); ya no hay botones "Guardar" por sección. Un punto rojo en el botón indica cambios sin guardar; al guardar aparece una confirmación discreta "Ficha guardada ✓".
- **Aviso de salida**: si hay cambios sin guardar (en cualquier sección B-J, o una versión de odontograma en edición) y el usuario intenta cambiar de pestaña interna, hacer clic en un enlace de navegación (sidebar, "Volver al listado", etc.) o cerrar el navegador, aparece el diálogo "Tienes cambios sin guardar. ¿Deseas guardarlos antes de salir?" con **Guardar** / **Salir sin guardar** / **Cancelar**. `beforeunload` cubre el cierre real del navegador (con el diálogo nativo, no personalizable por las restricciones de los navegadores modernos). Si se elige "Guardar" y además hay un odontograma en edición, se guardan las secciones pero **no se navega**: se avisa que el odontograma debe resolverse aparte con "Guardar nueva versión" o "Cancelar edición", para no forzar un versionado no deliberado.
- El seguimiento de cambios usa delegación de eventos (`input`/`change`) sobre el panel de la ficha clínica, excluyendo el odontograma (que marca sus propios cambios al entrar/salir/guardar el modo de edición vía `marcarCambioPendiente('odontograma')`/`limpiarCambioPendiente('odontograma')`).

### Alerta médica visible

Si en **D. Antecedentes patológicos personales** se marca alergia a antibiótico, alergia a anestesia, hemorragias, diabetes, hipertensión o enfermedad cardíaca, aparece un banner rojo/dorado permanente (`GET /api/ficha-clinica/:pacienteId/alertas`, fuente única de verdad) en la cabecera de la ficha del paciente **y** en el modal de nueva/editar cita de la Agenda al seleccionar ese paciente.

### API y roles

- `routes/ficha-clinica.js`: `GET /api/ficha-clinica/:pacienteId`, `GET /api/ficha-clinica/:pacienteId/alertas`, `PUT /api/ficha-clinica/:pacienteId/seccion/:seccion`.
- `routes/odontograma.js`: `GET /api/odontograma/:pacienteId/versiones`, `GET /api/odontograma/:pacienteId/activo`, `GET /api/odontograma/version/:id`, `GET /api/odontograma/:pacienteId/cpo-sugerido`, `POST /api/odontograma/:pacienteId` (crea nueva versión).
- Cualquier usuario logueado (`admin` o `asistencial`) puede registrar y consultar todo el historial clínico — es una clínica pequeña con un solo consultorio compartido. Solo `admin` conserva la exclusividad de eliminar pacientes y citas.

### Migración de base de datos

La tabla `odontogramas` de las Fases 1–2 era un *stub* sin interfaz de usuario (columnas `fecha`/`datos_json`, sin versión) y **nunca tuvo datos reales**: `db/migraciones.js` la reemplaza automáticamente por el esquema de Fase 3A (`fecha_registro`, `es_version_activa`) la primera vez que arranca el servidor con este código, junto con la nueva tabla `odontograma_piezas`. La tabla `fichas_clinicas` es nueva. Ninguna migración toca la tabla `pacientes` ni ningún otro dato existente.

**Rediseño de la paleta (implante + tramos)**: agregó la columna `odontograma_piezas.fuera_simbologia_f033` y amplió el `CHECK` de `color_tipo` para admitir `'neutro'` (pérdida por otra causa, ausente). SQLite no permite alterar un `CHECK` existente, así que `db/migraciones.js` reconstruye la tabla `odontograma_piezas` (crea la versión nueva, copia todos los hallazgos ya guardados fila por fila, borra la vieja y renombra) — no se pierde ningún hallazgo previamente registrado. Se probó explícitamente contra una copia de la base de datos real (477 pacientes) antes de aplicarla.

La base de datos ya incluye las tablas necesarias para las siguientes fases (presupuestos, pagos, firma digital), listas para desarrollarse sin modificar el esquema actual.

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
│                                doctores, citas, sync, ficha-clinica, odontograma)
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
