# Facturación electrónica SRI — Especificación

**Estado: DISEÑO CERRADO (18/sep/2026).** Las 14 preguntas de diseño fueron
respondidas por la administración de la clínica (Dra. Andrea Sandoval);
quedó decidido que el contador **no revisa este documento**: su única
intervención será **validar 3–5 facturas emitidas en el ambiente de pruebas
del SRI** antes de habilitar producción (sección 12, respuesta 14). Todavía
no se ha escrito código.

- Proyecto: Dentify — sistema interno de gestión de World Dental (Quito).
- Fase: 2 (v2), junto con el módulo de ortodoncia.
- Borrador original: 15/sep/2026 · Diseño cerrado: 18/sep/2026.
- Toda prueba se hará contra el **ambiente de pruebas del SRI**
  (`celcer.sri.gob.ec`); no se emitirá ningún comprobante real hasta el
  visto bueno sobre las facturas de prueba.

---

## 1. Qué se quiere lograr

Hoy la clínica registra cada cobro en Dentify (recibo interno
`REC-AAAA-####`) y, cuando corresponde factura, la digita **a mano** en el
facturador gratuito del portal del SRI. Eso duplica el trabajo y separa la
factura del historial de pagos del paciente.

El objetivo es que **Dentify emita la factura electrónica directamente al
SRI** desde la misma pantalla donde se registra el pago: generar el XML,
firmarlo con el certificado electrónico de la clínica, transmitirlo, obtener
la autorización, generar el RIDE y enviarlo por correo al paciente — sin
salir del sistema y sin volver a digitar nada.

Se evaluó y **se descartó**: integrar el facturador gratuito del SRI (no
tiene forma de conectarse con sistemas externos) y contratar un proveedor de
facturación con mensualidad (la clínica ya tiene firma electrónica vigente y
el volumen es bajo).

## 2. Decisiones de arquitectura

1. **Dentify emite directo al SRI** bajo el esquema *off-line* (nombre
   técnico del esquema vigente: la clave de acceso la genera el emisor; no
   significa "sin conexión" — ver sección 4).
2. **El facturador del portal queda como respaldo.** Dentify usará el punto
   de emisión **001-003** (a crear en el RUC); el portal conserva el suyo,
   así los secuenciales nunca chocan. Si Dentify fallara, la clínica sigue
   facturando en el portal como hasta hoy.
3. **El recibo interno no desaparece.** El recibo `REC-AAAA-####` sigue
   siendo el comprobante interno de todo cobro; la factura es otro documento
   con su propia numeración, vinculado al recibo.
4. **El certificado `.p12` y su clave** se tratan como material sensible:
   viven solo en el equipo de la clínica, fuera de todo respaldo que salga
   de la máquina y jamás en el repositorio.

## 3. Marco normativo considerado

Diseñado contra la normativa vigente a septiembre/2026:

| Tema | Regla | Fuente |
|---|---|---|
| Ficha técnica | Versión 2.34 (julio/2026), esquema off-line | Portal SRI |
| Transmisión | **Inmediata al emitir** desde el 1/ene/2026 (se eliminó el plazo de gracia de 4 días hábiles) | Res. NAC-DGERCGC25-00000017 |
| Fecha de emisión | Debe corresponder a la **fecha de la operación** | Misma resolución |
| Anulación | Hasta el **día 7 del mes siguiente** a la emisión | Misma resolución |
| Consumidor final | Sin anulación ni corrección posible desde 2026; tope por factura **USD 50 con IVA** en régimen general | Misma resolución / Reglamento |
| IVA | Tarifa general **15%** (`codigoPorcentaje 4`); **servicios de salud 0%** (`codigoPorcentaje 0`) | LRTI / tabla de tarifas |
| Formas de pago | Tabla 24: efectivo `01`, débito `16`, crédito `19`, transferencia `20` | Ficha técnica |

Si el SRI cambia algo antes de construir, se actualiza este documento antes
que el código.

## 4. Flujo de emisión

Desde la pestaña **Pagos** de la ficha del paciente (o desde Caja), al
registrar un cobro:

1. **Emitir factura es el comportamiento por defecto** — cada cobro genera
   su factura por ese monto, el mismo día (decisión 12.9). Consumidor final
   cubre a quien no da datos (≤ USD 50).
2. **Datos del cliente**: de los datos tributarios del paciente (sección 6)
   o de un receptor distinto (empresa, representante de un menor).
3. **Detalle**: siempre el genérico **"Servicios odontológicos"** (decisión
   12.7) — nunca tratamientos ni diagnósticos; el detalle real queda en el
   recibo interno, que no sale de la clínica. Si hubo descuento, la factura
   muestra **precio – descuento = total** (campo `descuento` del XML,
   decisión 12.10).
4. Dentify genera el **XML**, calcula la **clave de acceso** (49 dígitos) y
   **firma** con el `.p12`.
5. **Transmisión inmediata**: se envía al SRI y se consulta la
   **autorización** en el mismo acto. Con ella se genera el **RIDE** (A4 con
   membrete World Dental), se imprime si el paciente lo quiere en papel y se
   envía **XML + RIDE al correo del cliente**, sin copia a nadie, desde la
   cuenta Gmail de la clínica (decisión 12.11).
6. La factura queda guardada con estado, número, clave de acceso, XML y su
   vínculo con el recibo y el paciente. **Inmutable**: sin edición ni
   borrado, igual que recibos y consentimientos.

**Si el SRI rechaza el comprobante**, se muestra el motivo tal cual y nada
se da por facturado; el secuencial se reintenta corregido.

**Contingencia** (decisión 12.12): si falla el internet o el SRI, el cobro
queda con su recibo y la factura pasa a la bandeja **"Por facturar"**, que
**avisa de forma visible durante el día** ("hay N cobros de hoy sin
factura"). Se emite **ese mismo día** apenas vuelva el servicio; si no
vuelve dentro de la jornada, se factura por el **portal del SRI desde el
celular** (u otro equipo) y en Dentify la pendiente se marca como
**"emitida por el portal"** anotando su número, para que nada quede colgado
y los reportes cuadren. **Nunca** se emite al día siguiente con la fecha del
cobro anterior. No hay talonario físico de contingencia.

## 5. Datos del emisor (confirmados, 12.1–12.2)

| Campo del XML | Valor |
|---|---|
| `ruc` | `1718113515001` |
| `razonSocial` | Andrea Gabriela Sandoval Panchi (persona natural) |
| `nombreComercial` | World Dental |
| `dirMatriz` / `dirEstablecimiento` | Vital Center, Piso 2 · José Joaquín de Olmedo N2-33 y **Luisa** Proaño, Conocoto — al configurar, copiar **literal del RUC** |
| `obligadoContabilidad` | **NO** |
| Régimen | **General** (sin leyenda RIMPE) |
| `agenteRetencion` | No aplica |
| Establecimiento / punto de emisión | **001-003**, exclusivo de Dentify — **hay que crearlo en el RUC antes de emitir** |

El secuencial lo lleva Dentify (contador propio del punto 001-003, corrido,
sin reinicio anual). Nota: el membrete impreso de Dentify decía "Luis
Proaño"; ya se corrigió a "Luisa Proaño" (18/sep/2026).

## 6. Datos del cliente (decisiones 12.5)

Se agregan a la ficha del paciente los **datos tributarios**, separados de
los clínicos: tipo de identificación (RUC `04`, cédula `05`, pasaporte `06`,
consumidor final `07`, id. del exterior `08`), razón social o nombres para
la factura, dirección, teléfono y correo de facturación. Un paciente puede
tener un **receptor de factura distinto de sí mismo** (empresa, padre/madre
de un menor); la factura de un menor va siempre a su representante.

**Consumidor final**: permitido, a `9999999999999 / CONSUMIDOR FINAL`, con
**tope de USD 50 por factura validado en el servidor** (sobre ese monto la
factura va siempre identificada) y **confirmación extra** antes de emitir,
porque desde 2026 esas facturas no se pueden anular ni corregir.

## 7. IVA (decisiones 12.3–12.4)

- **Todos los servicios de la clínica se facturan con tarifa 0%**
  (`codigoPorcentaje 0`), incluidos los estéticos. Sin excepciones.
- **Hoy no se venden productos**, pero el módulo lo contempla desde el
  inicio: **cada ítem del catálogo de tratamientos lleva su tarifa de IVA**
  (0% por defecto). Si algún día venden productos (cepillos, kits), se
  marcan con **15%** (`codigoPorcentaje 4`) sin tocar código.

Tabla de referencia (`codigoPorcentaje`): `0` = 0% · `2` = 12% histórica ·
`4` = 15% general · `5` = 5% · `6` = no objeto · `7` = exento.

## 8. Formas de pago (decisión 12.6)

| Método en Dentify | Código SRI (tabla 24) |
|---|---|
| Efectivo | `01` — sin utilización del sistema financiero |
| Transferencia | `20` — otros con utilización del sistema financiero |
| Tarjeta de crédito | `19` |
| Tarjeta de débito | `16` |

Cambios que esto exige en el módulo de pagos (tareas previas de esta fase):

- **Separar el método "tarjeta" en crédito y débito** (hoy es uno solo).
- **Retirar "otro" del formulario de pagos nuevos** (no se usa y no es
  facturable); los pagos históricos con "otro" se conservan tal cual.

## 9. Anulaciones y notas de crédito (decisión 12.8)

- Anulaciones: **casi nunca** ocurren. El flujo se mantiene: **anular en el
  portal del SRI** (hasta el día 7 del mes siguiente) y emitir una nueva
  desde Dentify. Dentify registra el estado "anulada" para que los reportes
  cuadren; no automatiza la anulación.
- **Notas de crédito: no entran en esta primera etapa** (nunca se han
  usado), pero quedan como **segunda etapa deseada**: la numeración, la
  firma y el motor de emisión se diseñarán para que agregar NC después sea
  un módulo más, no una reconstrucción.

## 10. Certificado de firma (decisión 12.13)

Firma electrónica **vigente, de persona natural** (Dra. Andrea Sandoval),
emitida por **Security Data**, en archivo **`.p12`**. Al configurarla,
Dentify **lee la fecha de vencimiento del propio archivo** y avisa con
anticipación para renovarla (firma vencida = no se puede facturar). El
`.p12` y su clave se configuran solo en la máquina de la clínica.

Para el envío de correos (XML + RIDE) desde la cuenta Gmail de la clínica
hará falta una clave de aplicación o ampliar el permiso de las credenciales
de Google que ya usa el calendario — también solo en la máquina de la
clínica.

## 11. Alcance

**Incluye**: factura electrónica de venta — emisión por cada cobro,
autorización, RIDE, correo al cliente, reimpresión, listado con estados,
vínculo con recibos y pacientes, bandeja "por facturar" con aviso del día,
marca "emitida por el portal", tope y confirmación de consumidor final,
tarifa de IVA por ítem del catálogo, y las dos tareas previas del módulo de
pagos (sección 8).

**No incluye** (se mantiene como hasta hoy): declaraciones y ATS,
comprobantes de retención, notas de débito, guías de remisión,
liquidaciones de compra, facturas de compras de la clínica, y notas de
crédito (segunda etapa).

## 12. Respuestas de diseño registradas (18/sep/2026)

Respondidas por la Dra. Andrea Sandoval en sesión de trabajo:

1. **Emisor**: RUC `1718113515001`, Andrea Gabriela Sandoval Panchi,
   persona natural, nombre comercial World Dental, dirección José Joaquín de
   Olmedo y Luisa Proaño (Conocoto); no obligada a llevar contabilidad;
   régimen general; no agente de retención.
2. **Punto de emisión**: Dentify usará `001-003`; hay que crearlo en el RUC.
3. **IVA servicios**: todo 0%, sin excepciones (estéticos incluidos).
4. **Productos**: hoy no se venden; el módulo lo contempla (15% cuando
   aplique).
5. **Consumidor final**: permitido hasta USD 50 por factura; sobre eso,
   siempre identificado.
6. **Formas de pago**: mapeo `01/20/19/16` validado (códigos `16` débito y
   `19` crédito verificados contra la tabla 24 del SRI); "otro" bloqueado
   para facturas y retirado de pagos nuevos; "tarjeta" se separa en
   crédito/débito.
7. **Detalle**: siempre el genérico "Servicios odontológicos".
8. **Notas de crédito**: fuera de esta etapa; deseadas como segunda etapa.
   Anulación por portal (casi nunca ocurre) + reemisión.
9. **Qué se factura**: una factura por **cada cobro** — todo abono emite la
   suya, el mismo día.
10. **Descuentos**: la factura muestra precio – descuento = total (campo
    `descuento` por línea).
11. **Correo**: XML + RIDE al correo del cliente, sin copia, desde la cuenta
    Gmail de la clínica.
12. **Contingencia**: emitir el mismo día al volver el servicio; si el
    internet no vuelve en la jornada, facturar por el portal desde el
    celular; nunca al día siguiente con fecha anterior. Sin talonario
    físico.
13. **Certificado**: persona natural (Dra. Andrea), Security Data, archivo
    `.p12`, vigente; el vencimiento se leerá del archivo.
14. **Cierre**: el diseño queda cerrado con estas respuestas; el contador
    interviene únicamente validando **3–5 facturas del ambiente de pruebas**
    antes de habilitar producción.

## 13. Puesta en marcha

1. Tareas previas en el módulo de pagos (sección 8) + datos tributarios en
   la ficha del paciente.
2. Construcción del módulo contra el **ambiente de pruebas** del SRI
   (`celcer.sri.gob.ec`), con pacientes ficticios.
3. **Validación del contador sobre 3–5 facturas de prueba** (números,
   tarifas, totales, datos del emisor) — su única intervención, acordada en
   la respuesta 14.
4. Crear el punto de emisión `001-003` en el RUC, configurar `.p12` y correo
   en la máquina de la clínica, y paso a **producción** (`cel.sri.gob.ec`)
   una noche tranquila, con ensayo (`probar-actualizacion.js`) y respaldo;
   el portal del SRI queda intacto como respaldo.
5. Primer periodo en paralelo: las primeras facturas reales se verifican una
   a una en el portal del SRI hasta el visto bueno definitivo.

## Anexo técnico

- Esquema off-line, ficha técnica 2.34: XML de factura vigente, firmado en
  **XAdES-BES** con el `.p12`.
- **Clave de acceso** (49 dígitos): fecha (8) + tipo comprobante `01` (2) +
  RUC (13) + ambiente (1) + serie (6) + secuencial (9) + código numérico (8)
  + tipo emisión `1` (1) + dígito verificador módulo 11 (1).
- Web services SOAP de recepción y autorización: `celcer.sri.gob.ec`
  (pruebas) y `cel.sri.gob.ec` (producción).
- Fuentes (sep/2026): ficha técnica de comprobantes electrónicos del SRI;
  Resolución NAC-DGERCGC25-00000017; tabla oficial de formas de pago del
  SRI; tabla de tarifas de IVA vigente.
