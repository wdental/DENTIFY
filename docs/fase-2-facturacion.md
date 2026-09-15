# Facturación electrónica SRI — Especificación para revisión del contador

**Documento en BORRADOR — todavía no se ha escrito ni una línea de código.**
Este documento existe para que el contador de la clínica lo revise, corrija y
responda las preguntas de la sección 12 **antes** de construir el módulo. Un
dato tributario equivocado aquí se convierte en comprobantes rechazados o mal
emitidos allá; por eso primero se valida el papel.

- Proyecto: Dentify — sistema interno de gestión de World Dental (Quito).
- Fase: 2 (v2), junto con el módulo de ortodoncia.
- Fecha del borrador: 15/sep/2026.
- Toda prueba se hará contra el **ambiente de pruebas del SRI**
  (`celcer.sri.gob.ec`); no se emitirá ningún comprobante real hasta que el
  contador apruebe las facturas de prueba.

---

## 1. Qué se quiere lograr

Hoy la clínica registra cada cobro en Dentify (recibo interno
`REC-AAAA-####`) y, cuando el paciente pide factura, la digita **a mano** en
el facturador gratuito del portal del SRI. Eso duplica el trabajo y separa la
factura del historial de pagos del paciente.

El objetivo de esta fase es que **Dentify emita la factura electrónica
directamente al SRI** desde la misma pantalla donde se registra el pago:
generar el XML, firmarlo con el certificado electrónico de la clínica,
transmitirlo, obtener la autorización, generar el RIDE (la representación
impresa) y enviarlo por correo al paciente — sin salir del sistema y sin
volver a digitar nada.

Se evaluó y **se descartó**:

- Integrar el facturador gratuito del SRI que la clínica usa hoy: no tiene
  API ni forma de integrarse con sistemas externos.
- Contratar un proveedor de facturación con API: la clínica ya tiene firma
  electrónica vigente, el volumen es bajo y el costo mensual no se justifica.

## 2. Decisiones ya tomadas (con la administración de la clínica)

1. **Dentify emite directo al SRI** bajo el esquema *off-line* (el nombre
   técnico del esquema vigente: la clave de acceso la genera el emisor; no
   significa "sin conexión" — ver sección 4 sobre transmisión inmediata).
2. **El facturador del portal SRI queda como respaldo.** A Dentify se le
   asigna un **punto de emisión distinto** (por ejemplo `001-002`) para que
   los secuenciales nunca choquen con los del portal (`001-001`). Si Dentify
   fallara o la normativa cambiara, la clínica sigue facturando en el portal
   como hasta hoy.
3. **El recibo interno no desaparece.** El recibo `REC-AAAA-####` sigue
   siendo el comprobante interno de todo cobro; la factura es otro documento
   con su propia numeración (`estab-ptoEmi-secuencial`), vinculado al recibo.
   No todo recibo tendrá factura (ver pregunta 12.9).
4. **El certificado `.p12` y su clave** se tratan como material sensible:
   jamás van al repositorio de código ni a los respaldos que salen de la
   máquina; viven solo en el equipo de la clínica.

## 3. Marco normativo considerado (a validar por el contador)

El diseño se hizo contra la normativa vigente a septiembre/2026. Los puntos
que cambiaron recientemente y que condicionan el diseño:

| Tema | Regla considerada | Fuente |
|---|---|---|
| Ficha técnica | Versión 2.34 (julio/2026), esquema off-line | Portal SRI |
| Transmisión | **Inmediata al emitir**, desde el 1/ene/2026 se eliminó el plazo de gracia (antes hasta 4 días hábiles) | Resolución NAC-DGERCGC25-00000017 |
| Fecha de emisión | Debe corresponder a la **fecha de la operación** (ya no se puede facturar "mañana" lo cobrado hoy) | Misma resolución |
| Anulación | Hasta el **día 7 del mes siguiente** a la emisión (antes día 10) | Misma resolución |
| Consumidor final | Desde 2026 las facturas a consumidor final **no se pueden anular ni corregir con nota de crédito**; tope por factura en régimen general: **USD 50 con IVA** (a confirmar) | Misma resolución / Reglamento |
| IVA | Tarifa general **15%** desde abril/2024; **servicios de salud tarifa 0%** | LRTI |

> **Para el contador:** si alguno de estos puntos está desactualizado o mal
> interpretado, corregirlo es exactamente el propósito de esta revisión.

## 4. Cómo funcionará la emisión (flujo propuesto)

Desde la pestaña **Pagos** de la ficha del paciente (o desde Caja), al
registrar un cobro el usuario podrá marcar **"Emitir factura"**:

1. **Datos del cliente**: se toman de los datos tributarios del paciente
   (sección 6). Si factura una empresa o un tercero (p. ej. el padre de un
   paciente), se puede escoger otro receptor.
2. **Detalle**: se propone desde el concepto del pago / plan de tratamiento,
   editable antes de emitir (ver sección 8 sobre el nivel de detalle).
3. Dentify genera el **XML** de la factura según la ficha técnica, calcula la
   **clave de acceso** (49 dígitos) y lo **firma** con el `.p12` de la
   clínica (XAdES-BES).
4. **Transmisión inmediata**: en el mismo acto se envía al web service de
   recepción del SRI y se consulta la **autorización**. Con la autorización,
   se genera el **RIDE** (A4, con el membrete de World Dental), se imprime si
   el paciente lo quiere en papel y se **envía por correo** (XML + RIDE) al
   correo registrado.
5. La factura queda guardada en Dentify: estado (autorizada / devuelta /
   anulada), número, clave de acceso, XML y su vínculo con el recibo y el
   paciente. Las facturas **no se editan ni se borran** — igual que los
   recibos, los pagos y los consentimientos, lo emitido es inmutable; una
   corrección es una anulación (sección 9) o una nota de crédito si se decide
   incluirlas.

**Si el SRI devuelve (rechaza) el comprobante**, Dentify muestra el motivo
tal cual lo reporta el SRI y **no consume el secuencial en falso**: el mismo
número se reintenta corregido. Nada se da por facturado sin autorización.

**Si no hay internet o el SRI no responde** en el momento del cobro, Dentify
**no simula** la factura: el cobro queda registrado con su recibo interno de
siempre, y la factura pendiente queda en una bandeja **"Por facturar"** para
emitirse apenas vuelva el servicio — con la salvedad de que la fecha de
emisión debe ser la de la operación (ver pregunta 12.12 sobre cómo manejar
esto correctamente).

## 5. Numeración, establecimiento y punto de emisión

- Formato: `estab-ptoEmi-secuencial` (ej. `001-002-000000001`).
- El **secuencial lo lleva Dentify** (contador propio por punto de emisión,
  mismo patrón que `REC-AAAA-####` y `LAB-AAAA-####`, pero **sin reinicio
  anual**: el secuencial del SRI es corrido).
- El punto de emisión de Dentify será **distinto** al del portal para que
  nunca haya colisión de secuenciales (pregunta 12.2).

Datos del **emisor** que el XML lleva en cada factura y que hay que dejar
confirmados por escrito (pregunta 12.1):

| Campo del XML | Contenido |
|---|---|
| `ruc` | RUC de la clínica |
| `razonSocial` | Razón social exacta registrada en el SRI |
| `nombreComercial` | "World Dental" (si está registrado) |
| `dirMatriz` / `dirEstablecimiento` | Dirección registrada en el RUC |
| `obligadoContabilidad` | SI / NO |
| `contribuyenteRimpe` | Leyenda RIMPE, si aplica |
| `agenteRetencion` | Número de resolución, si aplica |

## 6. Datos del cliente (cambios en la ficha del paciente)

Se agregarán a la ficha del paciente los **datos tributarios**, separados de
los datos clínicos:

- Tipo de identificación: **RUC (04)**, **cédula (05)**, **pasaporte (06)**,
  **consumidor final (07)**, **identificación del exterior (08)**.
- Razón social / nombres para la factura (puede diferir del nombre clínico,
  p. ej. una empresa).
- Dirección, teléfono y **correo para facturación**.
- Un paciente puede tener un **receptor de factura distinto de sí mismo**
  (empresa, padre/madre de un menor): la factura de un menor de edad se emite
  a su representante, nunca al menor.

**Consumidor final**: para cobros pequeños sin datos del cliente se emitirá a
`9999999999999 / CONSUMIDOR FINAL`, respetando el tope vigente por factura
(USD 50 con IVA en régimen general, a confirmar) y sabiendo que **desde 2026
esas facturas no se pueden anular** — el sistema pedirá confirmación extra
antes de emitir una (pregunta 12.5).

## 7. IVA y tarifas

Los servicios de salud gravan **tarifa 0% de IVA**. En el XML cada línea
lleva un código de tarifa, y **un código equivocado hace que el SRI rechace
el comprobante**. Tabla de referencia usada en el diseño (tabla de tarifas de
la ficha técnica — el contador confirma contra la versión 2.34):

| `codigoPorcentaje` | Tarifa |
|---|---|
| `0` | 0% |
| `2` | 12% (histórica/diferenciada) |
| `4` | **15% (tarifa general vigente)** |
| `5` | 5% |
| `6` | No objeto de IVA |
| `7` | Exento de IVA |

Propuesta de diseño: cada **tratamiento del catálogo** de Dentify llevará su
tarifa de IVA (por defecto 0% para servicios odontológicos), de modo que la
factura salga con el desglose correcto por línea sin que la recepcionista
tenga que decidir nada. Preguntas clave: 12.3 y 12.4 (¿todo lo que factura la
clínica es 0%? ¿venta de productos — cepillos, kits de blanqueamiento — va al
15%?).

## 8. Detalle de la factura y confidencialidad

El detalle de cada línea viaja al SRI y queda fuera del control de la
clínica. Igual que con Google Calendar y las órdenes de laboratorio, **la
factura no debe llevar información clínica sensible** (diagnósticos,
tratamientos delicados). Propuesta: descripciones genéricas tipo
"Servicios odontológicos" o el nombre comercial del tratamiento
("Profilaxis", "Corona"), nunca diagnósticos. El contador confirma qué nivel
de detalle exige la norma y qué acepta en una revisión del SRI
(pregunta 12.7).

## 9. Formas de pago

Dentify registra los cobros como efectivo / transferencia / tarjeta / otro.
Mapeo propuesto a la tabla de formas de pago del SRI (confirmar códigos,
pregunta 12.6):

| Método en Dentify | Código SRI propuesto |
|---|---|
| Efectivo | `01` — sin utilización del sistema financiero |
| Transferencia | `20` — otros con utilización del sistema financiero |
| Tarjeta (crédito) | `19` — tarjeta de crédito |
| Tarjeta (débito) | `16` — tarjeta de débito |
| Otro | a definir con el contador |

Nota: hoy Dentify no distingue tarjeta de crédito de débito; si el código SRI
lo exige, se separa el método "tarjeta" en dos.

## 10. Anulaciones y notas de crédito

- **Anulación**: se hará por el **portal del SRI** (proceso actual que la
  clínica ya conoce), dentro del plazo vigente (hasta el día 7 del mes
  siguiente). Dentify registrará el estado "anulada" para que los reportes
  cuadren, pero **no automatiza la anulación** en esta fase.
- **Notas de crédito**: **fuera del alcance de esta primera fase** (se
  seguirían emitiendo por el portal si hicieran falta). Si el contador
  considera que el volumen de devoluciones/correcciones lo amerita, se
  evalúa incluirlas (pregunta 12.8).
- Recordatorio 2026: a **consumidor final** no hay anulación ni corrección
  posible — por eso la confirmación extra antes de emitir esas facturas.

## 11. Alcance de esta fase

**Incluye**: factura electrónica de venta (emisión, autorización, RIDE,
correo al cliente, reimpresión, listado de facturas con su estado, vínculo
con recibos y pacientes, bandeja "por facturar").

**No incluye** (se mantiene como hasta hoy, con el contador):

- Declaraciones de impuestos y ATS.
- Comprobantes de retención, notas de débito, guías de remisión,
  liquidaciones de compra.
- Facturas de **compras** de la clínica (proveedores, laboratorios).
- Notas de crédito (salvo decisión en 12.8).

## 12. Preguntas para el contador

*Marcar / responder cada una; con esto cerrado se empieza a programar.*

1. ☐ **Datos del emisor**: confirmar RUC, razón social exacta, nombre
   comercial, direcciones de matriz y establecimiento, `obligadoContabilidad`
   (SI/NO), si la clínica es **RIMPE** (y con qué leyenda) y si es agente de
   retención. ¿El régimen de la clínica es general?
2. ☐ **Punto de emisión**: ¿qué establecimiento/punto de emisión usa hoy el
   portal ( `001-001`? ) y cuál asignamos a Dentify (`001-002`)? ¿Hay que
   registrar el nuevo punto de emisión en el RUC antes de emitir?
3. ☐ **IVA de los servicios**: ¿todos los servicios odontológicos de la
   clínica van con **tarifa 0% (`codigoPorcentaje 0`)**? ¿Alguna excepción
   (p. ej. tratamientos estéticos como blanqueamiento — ¿0% o 15%?)?
4. ☐ **Venta de productos** (cepillos, pastas, kits): ¿15% (`codigoPorcentaje
   4`)? ¿La clínica factura productos hoy?
5. ☐ **Consumidor final**: confirmar el tope vigente por factura (¿USD 50 con
   IVA?) y el criterio de la clínica: ¿se emite a consumidor final o se pide
   siempre cédula?
6. ☐ **Formas de pago**: validar el mapeo de la sección 9 y el código para
   "otro". ¿Hace falta separar tarjeta crédito/débito?
7. ☐ **Detalle de las líneas**: ¿es aceptable la descripción genérica
   ("Servicios odontológicos" / nombre del tratamiento sin diagnóstico)?
   ¿Alguna exigencia de detalle por parte del SRI?
8. ☐ **Notas de crédito**: ¿las incluimos en esta fase o el portal alcanza?
   ¿Con qué frecuencia se anulan/corrigen facturas hoy?
9. ☐ **¿Qué se factura?**: ¿factura por **cada cobro** (cada abono genera su
   factura) o factura al **cierre del tratamiento** por el total? ¿Cómo lo
   maneja la clínica hoy con los planes de cuotas?
10. ☐ **Propina/redondeos/descuentos**: ¿los descuentos van como campo
    `descuento` por línea? ¿Algún otro rubro (no aplica propina en clínica)?
11. ☐ **Correo**: ¿basta con enviar XML + RIDE al correo del cliente, o el
    contador necesita además copia a un correo contable de la clínica?
12. ☐ **Contingencia**: con la transmisión inmediata vigente, si se cae el
    internet o el SRI en plena atención, ¿cuál es el procedimiento correcto:
    esperar y emitir el mismo día al volver el servicio, usar el portal desde
    otro dispositivo, o comprobantes físicos de contingencia? ¿La clínica
    tiene/quiere talonario físico de contingencia?
13. ☐ **Certificado**: ¿la firma electrónica vigente de la clínica es de
    **persona natural o jurídica**, quién es el titular, y cuándo vence?
    (Para prever la renovación y que el módulo avise antes del vencimiento.)
14. ☐ **Validación final**: cuando el módulo esté construido, el contador
    revisará **3–5 facturas emitidas en el ambiente de pruebas**
    (`celcer.sri.gob.ec`) antes de habilitar producción. ¿De acuerdo con este
    procedimiento?

## 13. Plan de puesta en marcha (una vez aprobado este documento)

1. Construcción del módulo contra el **ambiente de pruebas** del SRI
   (certificado de pruebas / ambiente `celcer`), con pacientes ficticios.
2. Revisión del contador sobre las facturas de prueba (pregunta 12.14).
3. Alta del punto de emisión definitivo y paso a **producción**
   (`cel.sri.gob.ec`) una noche tranquila, igual que toda actualización de
   Dentify: primero el ensayo (`probar-actualizacion.js`), respaldo, y el
   portal del SRI queda intacto como respaldo.
4. Primer periodo en paralelo: las primeras facturas reales se verifican una
   a una en el portal del SRI ("comprobantes electrónicos recibidos/emitidos")
   hasta que el contador dé el visto bueno definitivo.

## Anexo técnico (referencia para el desarrollo, no requiere revisión contable)

- Esquema off-line, ficha técnica 2.34: XML de factura versión vigente,
  firmado en **XAdES-BES** con el `.p12`.
- **Clave de acceso** (49 dígitos): fecha (8) + tipo comprobante `01` (2) +
  RUC (13) + ambiente (1) + serie (6) + secuencial (9) + código numérico (8)
  + tipo emisión `1` (1) + dígito verificador módulo 11 (1).
- Web services SOAP: recepción y autorización de comprobantes off-line en
  `celcer.sri.gob.ec` (pruebas) y `cel.sri.gob.ec` (producción).
- Fuentes consultadas (sep/2026): ficha técnica de comprobantes electrónicos
  del SRI; Resolución NAC-DGERCGC25-00000017 (transmisión inmediata y plazos
  de anulación, vigente desde 1/ene/2026); artículos de referencia sobre la
  tabla de tarifas de IVA y topes de consumidor final 2026. Los valores
  normativos citados quedan sujetos a la confirmación del contador
  (sección 12).
