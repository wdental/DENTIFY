# Fase 4C — Trabajos enviados a laboratorio

> Mismo stack y estética del resto de Dentify: Node + Express + SQLite, HTML/CSS/JS vanilla sin
> build step, Cormorant Garamond + Montserrat, todo en español. **No se toca** el versionado del
> odontograma, la inmutabilidad de evoluciones/consentimientos/pagos, ni la sincronización con
> Google Calendar.

## 1. Principio de diseño: dos cuentas que no se mezclan

| | Vive en | Fase |
|---|---|---|
| Lo que paga el **paciente** por la corona | `plan_items.precio` → `pagos` (recibo `REC-AAAA-####`) | 4A / 4B |
| Lo que la clínica le paga al **laboratorio** | `trabajos_laboratorio.costo` | **4C** |

El costo del laboratorio es un **egreso interno**. Por eso este módulo no toca la tabla `pagos` ni
la pantalla de Caja: un pago al laboratorio **no consume un número de recibo** y **no entra en los
totales de ingresos del día**. Cruzar ambas cuentas (margen real por tratamiento) es trabajo de la
Fase 5 — reportes.

## 2. Esquema (3 tablas nuevas, ninguna existente se modifica)

- **`laboratorios`**: `nombre`, `contacto`, `telefono`, `email`, `direccion`,
  `datos_transferencia` (banco/cuenta para pagarle), `notas`, `activo`. Sembrada una sola vez desde
  `db/semillaLaboratorios.js` con los 7 laboratorios de la clínica, igual que `semillaDoctores.js`.
- **`contador_ordenes_laboratorio`**: numeración `LAB-AAAA-####` por año
  (`utils/numeroOrdenLaboratorio.js`), mismo patrón que `contador_recibos`. El número se asigna en
  la misma transacción que inserta el trabajo y nunca se reutiliza — un trabajo cancelado conserva
  el suyo, porque el laboratorio ya lo tiene anotado.
- **`trabajos_laboratorio`**: el trabajo en sí.
  - Qué: `tipo_trabajo` (texto libre con sugerencias), `descripcion`, `piezas` (FDI separadas por
    coma, mismo formato que `plan_items.piezas`), `color`, `indicaciones`.
  - Quién: `paciente_id`, `laboratorio_id`, `doctor_id`.
  - Estado y fechas: `estado` (`por_enviar` → `enviado` → `recibido` → `instalado`, más
    `cancelado`), `fecha_envio`, `fecha_estimada` (la que promete el laboratorio),
    `fecha_recepcion`, `fecha_instalacion`.
  - Vínculos opcionales: `plan_item_id`, `cita_id` (cita de instalación prevista), `evolucion_id`,
    `documentos_json`, `trabajo_padre_id`.
  - Cuenta por pagar: `costo`, `pagado`, `fecha_pago_laboratorio`, `metodo_pago`,
    `referencia_pago` (n.º de factura), `notas_pago`, `pagado_por`, `pagado_en`.

**Fotos y escaneos**: no hay mecanismo de subida propio. Se suben en la pestaña **Documentos** del
paciente (`documentos_pacientes`) y el trabajo los referencia por id en `documentos_json` — el
mismo patrón que la sección M del F033 con los informes de exámenes.

## 3. Decisiones de diseño

- **Un reenvío por ajuste es un trabajo nuevo, no una edición.** Si la corona vuelve al
  laboratorio, se crea una fila hija con `trabajo_padre_id`: fechas propias y costo propio
  (normalmente 0 si el laboratorio no cobra el ajuste). El original queda intacto con su historia
  real. Mismo patrón que la revocación de un consentimiento o una nueva versión de plan.
- **El trabajo se edita; el pago no.** A diferencia de un pago de paciente (documento legal), esto
  es logística: corregir una fecha o un costo es normal. Pero una vez marcado **pagado**, el
  registro queda conciliado con la factura del laboratorio y solo un `admin` puede revertirlo, con
  motivo (que queda escrito en `notas_pago`).
- **Pago individual y por factura mensual, sin tabla extra.** En "Cuentas por pagar" se seleccionan
  varios trabajos del mismo laboratorio y se marcan pagados con una fecha, método y n.º de factura
  comunes; esa `referencia_pago` compartida es lo que agrupa la factura. Mezclar dos laboratorios
  en un mismo pago se bloquea: cada pago corresponde a una factura.
- **Ninguna fecha puede ser futura** (envío, recepción, instalación, pago): documentan algo que ya
  pasó. Validado en cliente y en servidor con `date('now','localtime')`.
- **Alerta de atraso**: un trabajo `enviado` se marca en rojo si pasó su `fecha_estimada`, o si la
  cita de instalación vinculada es en 2 días o menos y el trabajo todavía no ha llegado. Esa
  segunda alerta es la que evita que el paciente llegue a la cita y el trabajo no esté.

## 4. Pantallas

- **`/laboratorio.html`** (admin y asistencial), enlace nuevo en la barra lateral:
  1. **Bandeja de trabajos** — filtros por estado, laboratorio y búsqueda; por defecto muestra lo
     vivo. Acciones por fila: imprimir orden, enviar, recibir, instalar, reenviar por ajuste,
     editar, cancelar (admin) y revertir pago (admin).
  2. **Cuentas por pagar** — pendientes agrupados por laboratorio con subtotal, datos de
     transferencia a la vista, selección múltiple y "Marcar como pagados"; abajo, los pagos ya
     realizados del mes.
  3. **Laboratorios** (solo admin) — CRUD del catálogo.
- **Pestaña "Laboratorio" en la ficha del paciente** — sus trabajos en solo lectura, con estado,
  fechas y alerta de atraso. "+ Nuevo trabajo" salta a `/laboratorio.html` con el paciente ya
  fijado, igual que "Nueva cita" salta a la agenda.
- **`/imprimir-orden-laboratorio.html`** — orden A5 con el membrete World Dental de recibos y
  consentimientos: n.º `LAB-AAAA-####`, laboratorio, paciente, doctor, trabajo, piezas, color,
  fechas, indicaciones y dos líneas de firma (entrega / recepción). **Sin datos sensibles del
  paciente** (sin cédula, teléfono ni notas clínicas), misma regla que los eventos que se envían a
  Google Calendar: la orden sale de la clínica.
- **Panel principal** — tarjetas "En laboratorio" (con cuántos van atrasados) y "Por pagar a
  laboratorios", ambas enlazadas a `/laboratorio.html`.

## 5. Roles

- `asistencial`: crear trabajos, enviar, recibir, instalar, reenviar por ajuste, editar (mientras
  no estén pagados), imprimir órdenes y **ver los costos** (es una clínica pequeña y quien recibe
  el trabajo es quien lo registra).
- `admin` en exclusiva: catálogo de laboratorios, marcar y revertir pagos al laboratorio, cancelar
  trabajos.

## 6. Fuera de alcance (anotado para después)

- Pagos parciales a un laboratorio (hoy un trabajo se marca pagado entero).
- Estado intermedio "en prueba" (prueba en boca antes del terminado): el reenvío por ajuste ya
  cubre el caso; si en el uso real hace falta, es un valor más en el `CHECK` de `estado`.
- Control de stock de materiales.
- Reporte de margen (precio al paciente vs. costo de laboratorio) → Fase 5.

## 7. Pruebas realizadas (12/sep/2026)

Instancia de pruebas en el puerto 3101 con base nueva, un paciente ficticio `ZZ-QA` y un usuario
`asistencial` temporal, todo purgado al terminar. Verificado: siembra de los 7 laboratorios; alta de
trabajo con paciente buscado en vivo, laboratorio, tipo, piezas, color, costo y fecha prometida;
numeración `LAB-2026-####` correlativa; bandeja con estados y fechas; recepción con fecha; cuentas
por pagar agrupadas por laboratorio con sus datos de transferencia; pago de un trabajo con n.º de
factura y su aparición en "Pagos realizados" del mes; tarjetas del panel principal; pestaña
Laboratorio de la ficha y su salto con el paciente ya fijado; orden A5 imprimible sin datos
sensibles. Rechazos verificados: fecha futura, fecha prometida anterior al envío, editar un trabajo
pagado, pagarlo dos veces, revertir un pago sin motivo, y 403 del rol `asistencial` al pagar,
cancelar o tocar el catálogo de laboratorios.
