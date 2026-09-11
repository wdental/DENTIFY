# Fase 4A — Catálogo de tratamientos con precios + Plan de tratamiento derivado del odontograma

> Especificación de referencia para esta fase. Guardada antes de implementar para que futuras
> sesiones puedan retomar el trabajo sin perder contexto. Arquitectura: Express + better-sqlite3 +
> JS vanilla (sin build step). Todo en español. No se toca el versionado del odontograma, las
> exclusiones clínicas, los consentimientos ni la sincronización con Google Calendar.

## 1. Catálogo de tratamientos

- Tabla `tratamientos`: `id`, `codigo` (opcional), `nombre`, `categoria` (Prevención, Operatoria,
  Endodoncia, Cirugía, Rehabilitación, Ortodoncia, Estética, Otro), `precio` (USD, 2 decimales),
  `hallazgo_asociado` (nullable — código de hallazgo del odontograma que lo sugiere), `activo`,
  `notas`.
- Restauraciones: hasta 3 variantes de precio por número de superficies afectadas en la misma
  pieza (1 = simple, 2 = compuesta, 3+ = compleja) — se modelan como 3 filas de `tratamientos`
  distintas (mismo `hallazgo_asociado = 'caries'`, distinto `variante_superficies`), no como
  columnas extra.
- Panel admin `/tratamientos.html` (solo admin): CRUD completo, búsqueda en vivo, filtro por
  categoría, activar/desactivar.
- Importador desde Excel/CSV clonando el patrón de `routes/importador.js` (subir → token → vista
  previa + mapeo de columnas → confirmar → reporte de importados/omitidos). Precio normalizado
  quitando `$` y comas de miles.

## 2. Mapeo hallazgo → tratamiento sugerido

- Tabla `mapeo_hallazgo_tratamiento`: `hallazgo_codigo` (PK), `tratamiento_id`
  (nullable, `variante_superficies IS NULL`), `tratamiento_id_2_superficies`,
  `tratamiento_id_3_superficies` (solo relevantes para `caries`).
- Hallazgos cubiertos (códigos reales del catálogo `HALLAZGOS` en
  `public/js/odontograma.js`): `caries`, `extraccion_indicada`, `endodoncia_indicada`
  (etiqueta "Endodoncia por realizar"), `corona_indicada`, `sellante_necesario`,
  `protesis_fija_indicada`, `protesis_removible_indicada`, `protesis_total_indicada`,
  `implante_indicado`.
- Editable solo por admin desde `/tratamientos.html` (pestaña "Mapeo de hallazgos").
- Si un hallazgo no tiene tratamiento mapeado → línea de plan sin precio, etiqueta
  "asignar tratamiento".

## 3. Plan de tratamiento derivado

- Botón "Generar plan de tratamiento" en el panel derecho del odontograma. También se sugiere
  automáticamente al guardar una versión de odontograma con hallazgos rojos si el paciente no
  tiene ya un plan en borrador.
- Tabla `planes_tratamiento`: `id`, `paciente_id`, `odontograma_id` (versión origen), `estado`
  (`borrador`|`presentado`|`aceptado`|`rechazado`|`en_curso`|`finalizado`), `total`, `condiciones`,
  `fecha_creacion`, `doctor_id`, `creado_por`, `version_anterior_id` (para versiones tras un plan
  aceptado), `motivo_rechazo`.
- Tabla `plan_items`: `id`, `plan_id`, `piezas`, `hallazgo_origen`, `tratamiento_id` (nullable),
  `descripcion`, `precio`, `fase` (numérica + `fase_etiqueta`), `estado_item`
  (`pendiente`|`realizado`|`descartado`), `evolucion_id` (nullable), `orden`.
- Edición en borrador: precios/descripciones editables, quitar líneas, agregar líneas manuales
  desde el catálogo, reordenar, agrupar por fases. Total recalculado en vivo (cliente) y validado
  en servidor al guardar.
- El panel derecho del odontograma reemplaza el placeholder "Plan de tratamiento — disponible en
  próxima fase" (`public/js/odontograma.js`, función `cargarPanelResumenPaciente`) con un resumen
  compacto (estado, total, ítems pendientes/realizados) + enlace a la subsección completa en la
  ficha del paciente.
- Un paciente puede tener varios planes históricos, pero solo uno en `borrador`/`presentado` a la
  vez.

## 4. Presentación y aceptación con firma

- Reutiliza el módulo de firma de la Fase 3C (`public/js/firma.js`, kiosko de
  `consentimientos.js`, patrón de `utils/plantillas.js`).
- "Presentar al paciente": vista con membrete World Dental, datos del paciente, tabla por fases
  con precios, total, condiciones editables → estado `presentado`.
- "Aceptar y firmar": kiosko de firma a pantalla completa (representante legal automático si es
  menor) → estado `aceptado`, snapshot inmutable (`contenido_final` congelado en servidor) +
  hash SHA-256 + firma PNG en `uploads/pacientes/{id}/firmas/` (mismo patrón de
  `guardarFirmaPng`/`sha256` de consentimientos) + impresión A4.
- Un plan aceptado es inmutable: cualquier cambio posterior genera una **nueva versión**
  (`version_anterior_id`) en borrador; el plan aceptado permanece intacto y vinculado.
- Estado `rechazado` con `motivo_rechazo` opcional.
- Tabla de firmas: se reutilizan columnas en `planes_tratamiento`
  (`firma_paciente_path`, `firma_representante_path`, `hash_contenido`, `contenido_final`,
  igual que `consentimientos`) en vez de una tabla nueva, para no duplicar el patrón.

## 5. Cierre del ciclo con evoluciones (semiautomático, nunca ciego)

- Al registrar una evolución con piezas tratadas, si el paciente tiene un plan `aceptado`/
  `en_curso` con ítems `pendiente` que coincidan en pieza: se sugiere (confirmación del usuario
  siempre) marcarlos `realizado` y vincular `evolucion_id`.
- Al marcar ítems realizados, se sugiere además generar una versión de odontograma tipo
  `evolucion` PRECARGADA con la conversión de hallazgos (caries→obturado, endodoncia por
  realizar→realizada, extracción indicada→pérdida por caries, corona indicada→realizada,
  sellante necesario→realizado, implante indicado→realizado, prótesis indicada→realizada) para
  que el doctor revise y guarde (pasa por las validaciones de exclusión normales).
- Primer ítem realizado → sugerir `en_curso`. Todos realizados/descartados → sugerir
  `finalizado` + recordar el flujo de ALTA existente.

## 6. Pruebas manuales en navegador (pacientes ficticios, eliminación física al final)

1. Importar Excel de prueba (10 tratamientos, precios con `$`/comas) con mapeo de columnas.
2. Configurar mapeo hallazgo→tratamiento con las 3 variantes de restauración.
3. Odontograma: caries 1 superficie en 16, caries 3 superficies en 26, extracción indicada en 38,
   endodoncia por realizar en 45 → generar plan → 4 líneas, variantes correctas, total correcto.
4. Editar plan: precio, quitar línea, agregar manual, agrupar en 2 fases → total recalculado.
5. Presentar → aceptar y firmar → estado `aceptado`, hash, PDF A4 con membrete y firma.
6. Editar plan aceptado → fuerza nueva versión; el aceptado queda intacto.
7. Evolución en pieza 45 → sugiere marcar endodoncia realizada → aceptar → sugiere odontograma de
   evolución con conversión → guardar → hallazgo azul, ítem vinculado, plan `en_curso`.
8. Completar ítems restantes → sugerencia `finalizado`.
9. Menor de edad: aceptación exige representante automáticamente.
10. Resumen del plan correcto en el panel derecho en cada estado.

Verificar que el guardado unificado, el aviso de salida, los consentimientos y la sincronización
con Google Calendar siguen intactos. Limpiar todo dato de prueba al finalizar.

## Pendiente tras 4A

- **Fase 4B**: pagos, abonos y caja (usa las tablas `presupuestos`/`pagos` ya presentes en
  `schema.sql`, o se adaptan a `planes_tratamiento` según se decida en ese momento).
