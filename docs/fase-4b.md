# Fase 4B — Pagos, abonos y caja

> Especificación de referencia para esta fase. Guardada antes de implementar para que futuras
> sesiones puedan retomar el trabajo sin perder contexto. Arquitectura: Express + better-sqlite3 +
> JS vanilla (sin build step). Identidad visual: negro `#1A1A1A`, dorado `#9C7A30`, marfil,
> Cormorant Garamond + Montserrat. Todo en español. **No se toca** el versionado del odontograma,
> las exclusiones clínicas, los consentimientos, los planes de tratamiento ni la sincronización
> con Google Calendar. Los stubs de las tablas `presupuestos`/`pagos` del esquema se revisan primero
> y se reemplazan con una migración **no destructiva** (base en producción).

## Contexto de negocio

World Dental cobra: (a) tratamientos puntuales pagados por sesión o al contado, y (b) ortodoncia
con entrada inicial + cuotas mensuales durante el tratamiento. Métodos de pago: Efectivo,
Transferencia (Banco Pichincha), Tarjeta, Otro. Moneda USD.

## 1. Modelo de datos

- Tabla `pagos`: `id`, `paciente_id`, `plan_id` (nullable — un pago puede o no estar atado a un
  plan), `plan_item_id` (nullable), `plan_pago_id` (nullable — abona un acuerdo de cuotas),
  `concepto` (texto), `monto` (USD 2 decimales, > 0), `metodo`
  (`'efectivo' | 'transferencia' | 'tarjeta' | 'otro'`), `referencia` (nullable, ej. nro de
  comprobante de transferencia), `fecha_pago`, `registrado_por` (usuario), `doctor_id` (nullable,
  quien atendió), `anulado` (bool), `motivo_anulacion`, `fecha_creacion`.
- Tabla `planes_pago` (para cuotas de ortodoncia u otros acuerdos): `id`, `paciente_id`, `plan_id`
  (nullable), `descripcion`, `monto_total`, `entrada` (monto inicial), `numero_cuotas`,
  `monto_cuota`, `dia_pago_mes` (1-28), `fecha_inicio`, `estado`
  (`'activo' | 'completado' | 'cancelado'`), `notas`, `creado_por`.
- Los pagos registrados con `plan_pago_id` van abonando el acuerdo.
- Un pago REGISTRADO es **INMUTABLE**: no se edita ni elimina; solo admin puede ANULAR con motivo
  (queda visible tachado, excluido de totales). Correcciones = anular + registrar de nuevo.

## 2. Registro de pagos

- Desde la ficha del paciente, nueva pestaña/subsección "Pagos": botón "Registrar pago" → modal con
  concepto (autocompletable desde los ítems pendientes del plan aceptado del paciente, o texto
  libre), monto, método (con campo referencia visible solo para transferencia/tarjeta), fecha (hoy
  por defecto), doctor opcional.
- Si el paciente tiene plan aceptado/en_curso: mostrar arriba del modal el resumen financiero —
  total del plan, total pagado, SALDO PENDIENTE — y permitir vincular el pago al plan (por defecto
  sí).
- **Recibo imprimible**: al registrar, ofrecer "Imprimir recibo" — media hoja A5 con membrete World
  Dental (el de consentimientos), número de recibo secuencial (`REC-AAAA-####`), paciente,
  concepto, monto en cifras y letras, método, fecha, y quien registró. También accesible después
  desde el listado.

## 3. Cuotas de ortodoncia (planes de pago)

- En la subsección Pagos del paciente: botón "Crear plan de cuotas" → monto total (sugerir desde
  el plan de tratamiento aceptado si existe), entrada, número de cuotas, monto de cuota
  (autocalculado editable: `(total − entrada) / cuotas`), día de pago del mes, fecha de inicio.
- Vista del plan de cuotas: tabla de cuotas esperadas (número, fecha esperada, monto) contra pagos
  vinculados; estado por cuota (pagada / parcial / vencida / por vencer) calculado dinámicamente
  comparando pagos acumulados vs cronograma.
- Un paciente puede tener varios planes de pago históricos, uno activo por plan de tratamiento.

## 4. Saldos y caja

- Saldo pendiente por paciente = total de planes de tratamiento aceptados/en_curso + planes de pago
  activos − pagos válidos vinculados. Mostrarlo en: ficha del paciente (cabecera de la subsección
  Pagos) y panel "Resumen del paciente" del odontograma.
- Página "Caja" (menú lateral, admin y asistencial):
  - Vista DÍA: todos los pagos de la fecha seleccionada, agrupados por método, con totales por
    método y total general; pagos anulados visibles tachados sin sumar. Botón "Cerrar caja del
    día" (informativo: imprime el resumen del día en A4 con membrete, totales por método, cantidad
    de transacciones y espacio para firma de quien cierra — no bloquea registrar pagos
    posteriores, solo deja constancia impresa).
  - Vista MES: totales por día (mini tabla), total del mes, desglose por método.
- Dashboard: activar la tarjeta "Saldos pendientes" (suma de saldos de todos los pacientes con
  saldo > 0, y conteo de pacientes) y agregar tarjeta "Ingresos del mes" (pagos válidos del mes en
  curso).

## 5. Vencimientos

- En el dashboard, tarjeta compacta "Cuotas vencidas" (planes de pago con cuotas vencidas impagas:
  conteo de pacientes y monto), con enlace a un listado filtrable (paciente, teléfono/WhatsApp
  visible para gestión de cobro, cuota vencida, días de atraso).

## Pruebas en navegador (pacientes ficticios, eliminación física o purga en cadena al final)

1. Pago simple al contado con recibo impreso (verificar monto en letras y numeración
   `REC-AAAA-####`).
2. Paciente con plan de tratamiento aceptado: registrar 2 pagos vinculados → saldo pendiente
   correcto en ficha y panel derecho.
3. Anular un pago (admin) → tachado, excluido de totales, saldo recalculado.
4. Plan de cuotas de ortodoncia: total 1800, entrada 300, 12 cuotas de 125, día 15 → tabla de
   cronograma correcta; registrar la entrada y 2 cuotas → estados por cuota correctos; simular una
   cuota vencida (`fecha_inicio` en el pasado) → aparece en "Cuotas vencidas" del dashboard.
5. Caja día: varios pagos con métodos distintos → totales por método correctos; imprimir cierre de
   caja.
6. Caja mes: totales por día y del mes correctos.
7. Dashboard: "Saldos pendientes" e "Ingresos del mes" con valores correctos.
8. Verificar que todo lo previo (planes, consentimientos, F033, sincronización) sigue intacto.

Al terminar: actualizar README y CLAUDE.md (4B completa; pendiente Fase 5 reportes). Commit y push
con mensaje descriptivo.

## Decisiones de implementación (registradas durante el desarrollo)

- **Stubs `presupuestos`/`pagos`**: en la base de producción ambas tablas tienen 0 filas y nunca
  tuvieron interfaz. La migración en `db/migraciones.js` detecta la tabla `pagos` antigua (sin
  columna `concepto`) y la reconstruye con el esquema nuevo **copiando** cualquier fila que
  pudiera existir (`fecha` → `fecha_pago`, `notas` → `concepto`, `presupuesto_id` se descarta al no
  existir presupuestos). `presupuestos` se conserva tal cual (no se usa en 4B; el "presupuesto"
  real de Dentify es el plan de tratamiento aceptado de la Fase 4A).
- **Numeración de recibos**: tabla `contador_recibos (anio, ultimo_numero)` con el mismo patrón de
  `contador_historias`; el número se asigna dentro de la misma transacción que inserta el pago
  (`utils/numeroRecibo.js`). Un pago anulado conserva su número (nunca se reutiliza).
- **Monto en letras**: `utils/montoEnLetras.js`, formato "CIENTO VEINTICINCO DÓLARES CON 00/100".
- **Cronograma de cuotas**: no se persiste; se calcula en el servidor (`calcularCronograma`) a
  partir de `fecha_inicio`, `dia_pago_mes`, `numero_cuotas` y `monto_cuota`. La entrada vence el
  día de inicio; la cuota 1 vence el `dia_pago_mes` del mes **siguiente** al de inicio y cada
  cuota siguiente un mes después. La última cuota absorbe la diferencia para que la suma cuadre
  con `monto_total` si el usuario editó el monto de cuota sugerido (se rechaza un acuerdo cuyas
  cuotas superen el monto a financiar). Los pagos válidos vinculados al plan de pago se aplican en orden cronológico primero a la
  entrada y luego a las cuotas (método de imputación "el más antiguo primero"), de modo que un
  abono parcial se refleja como `parcial` en la cuota correspondiente.
- **Saldo pendiente**: se evita contar dos veces cuando un plan de pago está vinculado a un plan
  de tratamiento (`planes_pago.plan_id`): en ese caso el monto exigible es el `monto_total` del
  plan de pago (que reemplaza al total del plan de tratamiento) y se restan todos los pagos
  válidos vinculados a cualquiera de los dos.
- **Roles**: `admin` y `asistencial` pueden registrar pagos y crear planes de cuotas; solo `admin`
  anula pagos y cancela planes de pago.
- **Pagos directos previos a un acuerdo**: si un plan de cuotas se liga a un plan de tratamiento que ya
  tenía pagos directos (sin `plan_pago_id`), esos pagos también abonan el cronograma del acuerdo
  (`pagosDelPlanPago` en `utils/finanzas.js`) — el modal de creación propone justamente lo ya pagado
  como entrada. Así la cuenta y el cronograma cuadran siempre. Los pagos posteriores heredan
  automáticamente `plan_id` del acuerdo.
- **Planes finalizados (corrección de regla de negocio, 11/sep/2026)**: los planes de tratamiento
  `aceptado`, `en_curso` **y `finalizado`** cuentan como cuenta exigible (total del plan − pagos
  válidos vinculados). Un plan finalizado con pagos incompletos sigue siendo deuda — es común
  terminar el tratamiento antes de que el paciente termine de pagar (ortodoncia). Aplica en todos
  los lugares que usan `resumenFinancieroPaciente`/`saldosGlobales`: ficha del paciente, panel
  "Resumen del paciente", tarjeta "Saldos pendientes" y modal de registro. `rechazado`,
  `borrador` y `presentado` siguen sin contar (no son deuda). En la vista de Pagos, junto al saldo y
  en la tabla de cuentas se muestra la etiqueta "(tratamiento finalizado)" para dar contexto.
- **Cuotas parciales vencidas**: una cuota con abono parcial y fecha vencida se muestra como
  `parcial` y a la vez cuenta como vencida (por su saldo restante) en el dashboard y en el listado.
- **Instancia de pruebas**: `node server.js --puerto=3100` (o `PUERTO=3100`) levanta una segunda
  instancia contra la misma base sin detener la de la clínica en el puerto 3000. Configuración
  `dentify-pruebas` en `.claude/launch.json` (ignorado por git).

## Resultado de las pruebas en navegador (11/sep/2026)

Ejecutadas en una instancia de pruebas (puerto 3100) con un usuario admin temporal y dos pacientes
ficticios `ZZ-QA-4B`, purgados en cadena al terminar (pagos, planes de cuotas, plan de tratamiento,
odontograma, pacientes, carpeta de uploads, usuarios QA, contadores de recibos e historias
retrocedidos). Las 8 pruebas de la lista pasaron: recibo A5 con `REC-2026-0002` y "CIENTO
VEINTICINCO DÓLARES CON 50/100"; saldo $150 tras dos pagos vinculados a un plan de $450 (ficha y
panel derecho); anulación admin → tachado y saldo recalculado a $250; plan de cuotas 1800/300/12×125
día 15 con inicio en el pasado → entrada y cuotas 1-2 vencidas, luego entrada + 2 abonos → pagada /
pagada / parcial (27 días de atraso), visible en "Cuotas vencidas"; caja día con totales por método
correctos y cierre impreso; caja mes por día; dashboard con $1925 de saldos (4 pacientes), $361 de
ingresos del mes y $65 vencidos; F033, impresión del plan aceptado, consentimientos, agenda y estado
de sincronización intactos. Rol asistencial: registra pagos (201) pero no anula ni cancela (403).
