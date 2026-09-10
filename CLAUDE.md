# Dentify — World Dental

Sistema de gestión **interno** de la clínica dental World Dental (Quito, Ecuador). Uso exclusivo de la clínica, **no es un producto comercial**. Reemplaza al sistema anterior, Doctocliq.

## Stack

- Backend: Node.js + Express, SQLite vía `better-sqlite3`.
- Frontend: HTML/CSS/JS vanilla servido por el mismo Express — **sin frameworks, sin build step**.
- Puerto por defecto: `3000` (`server.js`, escucha en `0.0.0.0` para acceso en red local).
- Autenticación por sesión (`express-session`), roles `admin` / `asistencial`.
- Arranque en Windows/Mac vía `iniciar-dentify.bat` / `iniciar-dentify.command`.

## Identidad visual

- Colores: negro `#1A1A1A`, dorado `#9C7A30` (y dorado claro `#C9A44D`), marfil `#FAF6EF` de fondo.
- Tipografías: Cormorant Garamond (títulos) + Montserrat (cuerpo).
- **Todo el sistema está en español** — interfaz, mensajes, nombres de variables/funciones en el código.
- Hoja de estilos única: `public/css/estilos.css`.

## Reglas de negocio

- **Horario de citas**: uniforme todos los días, 07:00–21:00, incluido domingo. El domingo solo lleva la etiqueta informativa "Bajo cita previa" — no tiene horario reducido ni franjas bloqueadas. Validado en servidor (`routes/citas.js`) y reflejado en el front-end (`public/js/agenda.js`).
- **2 sillones**: la vista Día de la agenda tiene una columna por sillón, franjas de 15 minutos. Un sillón nunca puede tener dos citas solapadas (bloqueo estricto, 409). Un doctor no puede quedar en dos sillones a la misma hora salvo que un `admin` decida forzarlo (`forzar: true` en el payload).
- **Historia clínica**: numeración secuencial por año, formato `WD-AAAA-####` (`utils/numeroHistoria.js`).
- **Fechas visibles al usuario**: siempre `dd/mmm/yyyy` con mes abreviado en español y minúsculas (ej. `09/sep/2026`), vía la utilidad compartida `public/js/fechas.js` (`formatearFecha`, `formatearFechaConDia`). La base de datos y la API siguen en ISO (`YYYY-MM-DD`) — el formato es solo de presentación.
- **Doctores**: viven en la tabla `doctores` (no en código estático). Cada doctor puede tener un `calendario_google_id` propio para la sincronización.
- **Odontograma**: debe ser inmutable y versionado (cada cambio crea una nueva versión, no se sobrescribe el historial).
- **Ficha clínica**: debe seguir la estructura del **Formulario 033 del MSP Ecuador**.
- **Sincronización con Google Calendar**: es **unidireccional, solo Dentify → Google**. Google nunca modifica datos de Dentify. Los eventos enviados a Google **no llevan datos sensibles del paciente** (sin cédula, teléfono, notas clínicas) — solo motivo/nombre corto, fecha/hora y una descripción genérica. Motor en `utils/sincronizacion.js`: toda creación/edición/reagendamiento/cancelación de citas debe pasar por ahí (`sincronizarCita`, `eliminarEventoRemoto`), sin importar desde qué pantalla se dispare (Agenda, Panel principal, ficha del paciente). Es best-effort y resiliente: la cita local siempre se guarda aunque Google falle; los fallos se encolan en `sync_pendientes` y se reintentan solos.

## Seguridad y datos reales — MUY IMPORTANTE

- **`db/dentify.db` (y `.db-shm`/`.db-wal`), `backups/`, `uploads/` y `google-credentials.json` JAMÁS deben subirse a git.** Ya están en `.gitignore`; verificar con `git status`/`git check-ignore` antes de cualquier commit si se toca ese archivo.
- La base de datos contiene **más de 477 pacientes reales** de la clínica. Nunca usar sus datos como ejemplos "de mentira" en documentación, capturas o mensajes.
- Al hacer pruebas en navegador (crear citas, pacientes, etc.), usar **siempre pacientes/citas ficticios claramente identificables**, y **eliminarlos al terminar** la sesión de pruebas (los pacientes se eliminan lógicamente vía `activo=0`, restaurable; las citas se eliminan con `DELETE /api/citas/:id` para no dejar residuos, y las citas de prueba deben limpiarse siempre que quede algo en `sync_pendientes`).
- Roles: `admin` puede eliminar pacientes/citas, gestionar usuarios y doctores, importar pacientes; `asistencial` tiene acceso operativo normal (agenda, pacientes) sin esas acciones destructivas ni administrativas.

## Estado de las fases

- **Fase 1** — completa: login, pacientes (CRUD + ficha + documentos + borrado lógico con restauración), importador desde Excel/CSV, usuarios, dashboard inicial, respaldo automático diario.
- **Fase 2** — completa: doctores en base de datos, agenda de citas.
- **Fase 2.5** — completa: agenda con vista Día (2 sillones, franjas de 15 min) y vista Semana, validación de horario y solapamientos, sincronización con Google Calendar, pestaña "Citas" en la ficha del paciente, tarjetas de dashboard ("Citas de hoy" con cambio de estado rápido, "No-shows del mes"), formato de fechas unificado.
- **Fase 3A** — refinada y corregida tras revisión de usuario y prueba adversarial: ficha clínica según Formulario 033 MSP (antecedentes D/E con Sí/No explícito, rangos de referencia en F, "sin patología aparente" en G, higiene oral en I con "—"/promedio, CPO-ceo con fuente única y ajuste manual confiable en J) + odontograma (paleta compacta, símbolos fieles al F033 incluida la coexistencia corona+endodoncia, tipos inicial/evolución/alta, reglas de exclusión clínica y de prótesis validadas en cliente y servidor, borrador que alcanza todo tipo de hallazgo incluidos tramos y movilidad/recesión) + guardado unificado con aviso de salida.
- **Fase 3B** — completa: diagnóstico CIE-10 (sección N, catálogo odontológico K00-K14 + S02.5 + Z01.2 precargado, buscador en vivo, PRE→DEF con trazabilidad), tratamiento por sesión (sección P, tabla `evoluciones` INMUTABLE con numeración por paciente, vínculo opcional a la cita de agenda del día, ALTA, anulación lógica solo-admin), pedido/informe de exámenes (secciones L y M), datos del profesional responsable (sección O, editable libremente hasta la primera vez, luego solo admin), e impresión oficial del Formulario 033 completo (`imprimir-f033.html`, 2 páginas A4, reutiliza el renderizador SVG real del odontograma).
- **Pendiente — Fase 3C**: consentimientos informados con firma digital.
- **Pendiente — Fase 4**: presupuestos y pagos.
- **Pendiente — Fase 5**: reportes.
- **Pendiente — v2 — módulo de ortodoncia**: hallazgos apiñamiento, diastema, giroversión, fractura, diente en erupción; posible periodontograma completo.

La base de datos (`db/schema.sql`) ya incluye tablas mínimas preparadas para las fases 3–5 (`odontogramas`, `evoluciones`, `presupuestos`, `pagos`, `firmas`) para no requerir migraciones destructivas más adelante.

## Convenciones de trabajo

- Código (variables, funciones, comentarios, mensajes de commit) **en español**, consistente con el resto del proyecto.
- Cualquier cambio de esquema de base de datos debe hacerse **sin pérdida de datos** de las tablas existentes (ver patrón en `db/migraciones.js`: migraciones ligeras que corren antes de aplicar `schema.sql`, que a su vez usa `CREATE TABLE IF NOT EXISTS`).
- Toda cita creada/editada/cancelada debe pasar por `routes/citas.js` para no saltarse la validación de horario/solapamiento ni el motor de sincronización — nunca escribir directamente en la tabla `citas` desde otra ruta o script salvo para limpieza puntual de datos de prueba.
- Para cambios de UI/frontend: levantar el servidor y probar en navegador el camino feliz y los bordes (validaciones, roles, sincronización) antes de dar el cambio por terminado; limpiar cualquier dato de prueba (pacientes, citas, usuarios temporales) al finalizar.
