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

## Contenido de la Fase 3A (refinada tras revisión de usuario)

Ficha clínica odontológica basada en el **Formulario 033 del MSP Ecuador** (SNS-MSP/HCU-form.033/2021), nueva pestaña **"Ficha clínica (F033)"** en la ficha del paciente (`public/paciente.html`). Las secciones B a J se guardan con un **único botón flotante "Guardar ficha clínica"** (esquina inferior derecha, siempre visible al hacer scroll, con un punto rojo cuando hay cambios sin guardar); cada sección conserva su punto de completitud en el encabezado colapsable. El odontograma (H) es la excepción: conserva su propio "Guardar nueva versión" por ser un acto formal de versionado (ver más abajo).

- **B. Motivo de consulta** — texto libre + campo "Embarazada" (visible solo si el sexo del paciente es F).
- **C. Enfermedad actual** — texto libre.
- **D. Antecedentes patológicos personales** — los 10 ítems del F033 (alergia a antibiótico, alergia a anestesia, hemorragias, VIH/SIDA, tuberculosis, asma, diabetes, hipertensión, enfermedad cardíaca, otro), cada uno con **estado explícito Sí / No** (nunca checkbox): el estado inicial es "sin registrar", visualmente distinto de "No". Botón **"Marcar todo No"** registra "No" explícito en los ítems sin respuesta sin tocar los que ya tienen "Sí". Registrar "No" es un dato (anamnesis negativa), no un vacío — queda listo para que la impresión del F033 (Fase 3B) lo muestre como raya (—). Los ítems en "Sí" siguen alimentando el banner de alerta médica.
- **E. Antecedentes patológicos familiares** — los 10 ítems del F033, mismo mecanismo Sí/No/sin registrar + "Marcar todo No".
- **F. Constantes vitales** — temperatura, pulso, frecuencia respiratoria, presión arterial, cada campo con un texto de ayuda discreto con el **rango de referencia en adultos** (temperatura 36.1–37.2 °C, pulso 60–100 lpm, frecuencia respiratoria 12–20 rpm, presión arterial <120/80 mmHg) y nota fija "en niños varían según la edad". Un valor fuera de rango resalta el campo con un borde ámbar sutil, **sin bloquear el guardado**.
- **G. Examen del sistema estomatognático** — los 13 ítems del F033, cada uno con checkbox "con patología" + descripción. Botón **"Sin patología aparente"** al inicio: registra ese estado para toda la sección y atenúa visualmente los 13 ítems; se **desactiva automáticamente** en cuanto se marca cualquier ítem con patología.
- **H. Odontograma** — ver detalle abajo.
- **I. Indicadores de salud bucal** — higiene oral simplificada (Placa/Cálculo/Gingivitis por grupo de piezas). Cada selector inicia en **"—" (sin registrar)**, no en 0 — el 0 solo cuenta si el examinador lo eligió explícitamente. El total por columna es el **promedio** (suma ÷ piezas efectivamente examinadas, las "—" no cuentan en el divisor), mostrado con un decimal o "—" si ninguna pieza de esa columna fue examinada. Enfermedad periodontal, tipo de oclusión (Angle) y **nivel de fluorosis** inician todos en "Sin registrar".
- **J. Índices CPO-ceo** — **fuente única** del CPO-ceo (ya no existe el panel lateral del odontograma). Muestra en **solo lectura por defecto** el autocálculo derivado del odontograma activo (`GET /api/odontograma/:pacienteId/cpo-sugerido`), que se refresca cada vez que se guarda una nueva versión del odontograma. Botón **"Ajustar manualmente"** pide confirmación explícita ("los valores dejarán de actualizarse solos...") antes de habilitar la edición de los campos; al guardar, el valor queda marcado como ajustado manualmente con quién y cuándo (`ajustado_por`/`ajustado_en` en `indices_cpo_json`) **solo si realmente cambió** respecto al último autocálculo cargado — si el usuario entra en modo manual pero no modifica ningún número, J se guarda en modo automático igual, para que no quede "congelado" sin querer con el valor automático duplicado (ver bug corregido más abajo). Botón **"Restaurar cálculo automático"** vuelve al valor derivado. Mientras se edita una versión del odontograma, un contador compacto de una sola línea ("CPO permanente C:x P:x O:x · ceo temporal c:x e:x o:x") acompaña al contador de hallazgos. **Nota de estado del odontograma en J** (ver ronda de correcciones más abajo): siempre que J esté en modo automático, una línea discreta explica por qué el número es 0 o por qué puede no coincidir con lo que se ve en el odontograma — "Sin odontograma registrado", "Hay una edición del odontograma sin guardar" o un aviso de error real de cálculo — en vez de dejar un 0 ambiguo.

### Odontograma interactivo (núcleo de la Fase 3A) — rediseño "paleta de herramientas"

El odontograma (`public/js/odontograma.js`) usa un layout de **dos zonas** (paleta / centro) y el paradigma **paleta → pintar**: se activa una herramienta a la izquierda y se aplica con clics sobre el diagrama al centro. El panel lateral de índices CPO-ceo que existía aquí se eliminó — la sección J de la ficha es ahora la única fuente de ese cálculo (ver arriba); la columna liberada queda para el plan de tratamiento de la Fase 3B. Sigue siendo **inmutable por versión** (sin cambios en esa lógica): un odontograma guardado nunca se edita — "Registrar odontograma de evolución"/"Registrar nuevo odontograma" parte de una copia de trabajo de la versión activa y, al guardar (con confirmación explícita), crea una nueva fila en `odontogramas` con `es_version_activa = 1` dentro de una transacción que desactiva la anterior.

**Tipos de odontograma (inicial / evolución / alta)**: la tabla `odontogramas` tiene una columna `tipo` (`'inicial' | 'evolucion' | 'alta'`, migración: el odontograma más antiguo de cada paciente quedó como `'inicial'`, el resto como `'evolucion'`). Si el paciente **no tiene ningún odontograma**, la sección H entra **directo en modo edición de un INICIAL** al abrir la ficha (sin exigir el clic en "Registrar nuevo odontograma"), con un aviso claro de que aún no está guardado. Si ya existe al menos uno, el botón pasa a **"Registrar odontograma de evolución"** (tipo por defecto: evolución) con un selector para marcarlo como **"Alta"** cuando corresponda; solo puede existir un `'inicial'` por paciente (validado también en el servidor, `routes/odontograma.js`). El selector de versiones muestra el tipo: "Inicial — dd/mmm/yyyy", "Evolución — dd/mmm/yyyy", "Alta — dd/mmm/yyyy".

**Layout compacto, sin scroll horizontal**: el `.odonto-layout` de dos columnas (paleta 190px / centro) solo se activa a **partir de 1280px de ancho de viewport** — por debajo de eso (incluida la tablet horizontal, 1024px) la paleta se apila arriba como tira horizontal scrolleable y el centro toma el ancho completo. Las piezas se compactaron (27px las permanentes, 13px de radio externo las temporales, 2px de separación) para que las 16 piezas de una arcada permanente quepan sin scroll — verificado en navegador tanto a 1280px como a 1024px de viewport, incluyendo las filas propias rotuladas **"MOV"**/**"REC"** al margen izquierdo.

- **Izquierda — paleta fija y sticky**: una fila superior de **"Acceso rápido"** (Caries, Obturado, Ausente, Extracción indicada, Borrador) seguida de los grupos "Patología actual · Rojo", "Tratamiento realizado · Azul", "Otros", "Adicionales" y "Herramientas" (Movilidad, Recesión, Borrar hallazgo), cada uno en una **cuadrícula compacta** (2-3 columnas) en vez de lista vertical, para que la paleta completa sea visible sin scroll en una pantalla de 1080p. El **Borrador** está siempre visible (en acceso rápido y al final de la paleta). Cada botón dibuja el **símbolo verdadero en miniatura y en su color real** (nada de cuadrados genéricos): el asterisco de sellante, la X de extracción/pérdida, el triángulo de endodoncia, el doble contorno concéntrico fino de corona, el ⊡—⊡/(—)/=== de las prótesis, el ⊗ de pérdida por otra causa, la "A" de ausente y el tornillo del implante — la leyenda bajo el odontograma reutiliza exactamente los mismos íconos **y siempre los muestra en su color real**, incluso en modo lectura (solo la paleta se atenúa entonces, `aria-disabled="true"`). Un clic activa la herramienta (borde dorado, una sola a la vez; ESC o un segundo clic la desactiva).
- **Centro**: el diagrama SVG con las cuatro arcadas del F033, seguido de la leyenda completa y un recuadro dorado con la regla de inmutabilidad del F033.

> Nota de implementación: las clases de color/forma de los símbolos (`.pieza-zona--rojo`, `.color-azul`, `.pieza-simbolo-fino`, etc.) se definieron originalmente con el selector `.odontograma-svg` como ancestro obligatorio; como los mismos símbolos se reutilizan en miniatura fuera del SVG (paleta, leyenda), esas reglas se generalizaron para aplicar en cualquier contexto — antes de esta corrección los íconos de la paleta/leyenda se veían en negro en vez de su color real.

### Reglas de exclusión clínica entre hallazgos

Ausente, Pérdida por caries, Pérdida (otra causa) y Extracción indicada son **mutuamente excluyentes** entre sí y con **cualquier otro hallazgo** de la misma pieza (superficie, movilidad/recesión u otro hallazgo de pieza): aplicar uno de estos cuatro sobre una pieza con otros hallazgos pide confirmación ("Esto eliminará los demás hallazgos de la pieza N. ¿Continuar?") y los elimina; intentar agregar cualquier otro hallazgo sobre una pieza ya marcada con uno de estos cuatro se bloquea con un mensaje ("La pieza N está marcada como... Quite ese hallazgo para registrar otros."). Caries/Obturado en la misma superficie, Sellante necesario/realizado, Corona indicada/realizada, Endodoncia por realizar/realizada e Implante indicado/realizado son pares excluyentes con **reemplazo directo** (sin diálogo) dentro de su propio grupo — pero **corona y endodoncia SÍ coexisten entre sí** en la misma pieza (son clínicamente independientes: ver `GRUPOS_PIEZA_DIRECTOS` en `public/js/odontograma.js`, que permite varios hallazgos de "pieza completa" a la vez siempre que sean de grupos distintos). Todo esto se valida en el cliente y se **revalida en el servidor** al guardar la versión (`validarExclusiones` en `routes/odontograma.js`).

**Exclusiones de prótesis (tramo)**: las piezas cubiertas por un tramo de **prótesis total o removible** no admiten caries, obturado, sellantes, corona, endodoncia ni implante; las cubiertas por **prótesis fija** no admiten caries ni sellantes, pero sí corona y endodoncia (compatibles clínicamente con un puente). Aplicar un tramo sobre piezas con hallazgos incompatibles pide confirmación y los elimina; aplicar uno de esos hallazgos sobre una pieza ya cubierta por un tramo incompatible se bloquea con un mensaje. Dos tramos que se solapan (comparten al menos una pieza cubierta, no solo los extremos) piden confirmación de reemplazo. "Piezas cubiertas" se calcula sobre **toda la fila del diagrama entre ambos extremos** (`piezasCubiertasPorTramo`), no solo el inicio y el fin — así una pieza intermedia de un tramo de 3+ piezas también queda protegida y también permite borrar el tramo completo. Validado en cliente y en servidor.

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

**Interacción**: herramientas de **superficie** (caries, obturado, sellantes) marcan/desmarcan (toggle) la cara donde se hace clic — el sellante nunca rellena la superficie, solo dibuja el asterisco bajo el diente. Herramientas de **pieza completa** hacen toggle con un clic en la pieza o su número. Herramientas de **tramo** (las tres prótesis) piden dos clics — pieza inicial y final —, muestran el hint "seleccione la pieza final" y **validan que ambas piezas sean de la misma arcada** (se rechaza con una alerta). El conector del tramo se dibuja **fino (2.5px) y corre cerca del borde de la pieza** (zona de coronas, no por el centro), para no tapar otros hallazgos de las mismas piezas. El hover ilumina la zona bajo el cursor con el color de la herramienta activa. **Borrar hallazgo**: un clic sobre el símbolo dibujado (sea de superficie, de pieza completa, el asterisco de sellante bajo el diente, o la cajita de movilidad/recesión) lo quita; si la pieza participa de un tramo de prótesis, un clic en **cualquiera de las piezas cubiertas** (no solo los dos extremos) pide confirmación y borra el tramo completo. Doble clic limpia toda la pieza (todos sus hallazgos, movilidad, recesión y cualquier tramo donde participe). Un contador discreto "N hallazgos" acompaña al botón Guardar, junto con una línea compacta de CPO en vivo mientras se edita.

**Autocálculo CPO-ceo**: tanto el panel en vivo (cliente) como `GET /api/odontograma/:pacienteId/cpo-sugerido` cuentan piezas distintas por prioridad pérdida/ausente > caries > obturado, separando permanente de temporal por el primer dígito FDI, **ignorando siempre el implante**.

**Simplificaciones conocidas**: la alineación horizontal de las piezas temporales bajo sus sucesoras permanentes es aproximada (cada fila se centra por su propio ancho); extracción indicada/pérdida por caries comparten la misma forma (X) distinguida solo por color, y las prótesis también, siguiendo la definición literal de la sección K del F033 — la única distinción de forma además de color es endodoncia (contorno vs. relleno) y corona (cuadrado vs. círculo según denticion).

### Corrección de defectos tras prueba adversarial (odontograma)

Ronda de corrección dedicada, con una matriz de pruebas deliberadamente agresiva (cada herramienta sobre cada tipo de pieza y cada estado previo, todas las combinaciones de exclusión, borrado de cada tipo de hallazgo, tramos solapados/desde el medio/temporales, guardar-y-recargar bit a bit). Defectos reales encontrados y corregidos:

- **El borrador no alcanzaba la mayoría de los hallazgos.** `manejarBorrado()` retornaba inmediatamente tras intentar borrar en la superficie exacta del clic, sin importar si encontró algo ahí — por lo que nunca llegaba a revisar el hallazgo de pieza completa ni el tramo cuando el clic caía sobre el símbolo dibujado (que casi nunca coincide con la superficie 'completa' literal). Esto rompía el borrado de ausente, pérdidas, extracción, endodoncia, corona e implante con un solo clic. Corregido para que el borrador siga probando: superficie exacta → pieza completa → tramo que cubra la pieza.
- **El asterisco de sellante y las piezas intermedias de un tramo no tenían ningún elemento clicable.** El asterisco se dibuja fuera del cuerpo de la pieza (banda propia) sin ningún `[data-pieza]` debajo; agregada una zona de clic invisible dedicada solo al borrado. Los tramos solo se podían borrar clickeando el extremo inicial o final tal cual quedó guardado; ahora `piezasCubiertasPorTramo()` calcula todas las piezas físicamente cubiertas (fila completa entre ambos extremos), así que un clic en cualquiera de ellas —incluida una pieza del medio— borra el tramo completo (con confirmación).
- **La cajita de movilidad/recesión no se podía vaciar con el borrador**, encontrado durante la prueba adversarial: el clic llegaba con `superficie="completa"` pero `manejarBorrado()` solo revisaba el campo `hallazgo`, nunca `movilidad`/`recesion`. Corregido para que un clic en la cajita limpie solo ese valor específico (sin tocar el otro).
- **Corona y endodoncia no podían coexistir en la misma pieza**, encontrado durante la prueba adversarial de las nuevas exclusiones de prótesis fija (que exige explícitamente que sí coexistan): el modelo de datos solo permitía un hallazgo de "pieza completa" a la vez por pieza, así que aplicar uno reemplazaba automáticamente cualquier otro sin distinción. Corregido con un sistema de grupos (`GRUPOS_PIEZA_DIRECTOS`) que permite varios hallazgos de pieza completa simultáneos si son de grupos distintos (corona / endodoncia / implante), preservando el reemplazo directo indicado↔realizado dentro de cada grupo y la exclusión total de los 4 estados verdaderamente excluyentes (ausente, pérdidas, extracción). El SVG ahora dibuja todos los símbolos de pieza completa presentes, no solo uno.
- **Los íconos rojos de la leyenda "no se dibujaban"**: verificado en navegador con viewport funcional — ya estaban corregidos desde la ronda anterior (la causa real era que las reglas de color en CSS exigían `.odontograma-svg` como ancestro, y los íconos de paleta/leyenda viven fuera de ese SVG). Los 8 íconos de la columna roja se comprobaron uno por uno: tamaño y color correctos.
- **El cálculo automático de CPO podía quedar "congelado" en modo manual sin que el usuario lo notara.** No se encontró un flujo que activara el modo manual sin un clic explícito en "Ajustar manualmente", pero sí se identificó el mecanismo más probable del reporte: como el guardado de la ficha es un solo botón para las 8 secciones, entrar en modo manual "solo para mirar" y luego guardar cualquier otra sección deja J marcado como ajustado manualmente con el mismo valor automático duplicado. Corregido con una confirmación explícita al entrar en modo manual, y guardando en modo automático (sin marcar `ajustado_manualmente`) si al momento de guardar los valores coinciden exactamente con el último autocálculo cargado.

No se encontraron combinaciones de exclusión permitidas indebidamente en la matriz probada; todas bloquean o piden confirmación según lo especificado, tanto en cliente como en servidor.

### Pulido visual del odontograma y verificación definitiva del CPO

- **CPO automático verificado con dos guardados consecutivos**: un odontograma con hallazgos (C/P/O en vivo) se guarda → la sección J refleja esos valores de inmediato y tras recargar la página; se registra una segunda versión con hallazgos distintos y J vuelve a actualizarse igual, ambas veces sin ninguna acción manual. La lógica ya era correcta desde la ronda anterior — lo que se encontró fue un registro real ya atascado en modo manual con ceros (ningún odontograma nunca guardado para ese paciente), corregido en producción usando el propio botón "Restaurar cálculo automático" de la app seguido de "Guardar ficha clínica", que sí persiste el modo automático correctamente.
- **Íconos de prótesis recortados en la paleta**: `dibujarSimboloTramo()` (que posiciona el trazo real sobre las piezas del diagrama) se reutilizaba para dibujar la miniatura de la paleta con coordenadas ficticias que no cabían en el `viewBox` de 26×26 del ícono — quedaban cortados por abajo. Se separó una miniatura propia (`iconoMiniaturaTramo`) centrada y dimensionada para el tamaño del botón, independiente de la geometría real del diagrama.
- **Asterisco de sellante**: la distancia desde el borde de la pieza hasta el asterisco es ahora una constante fija (`DISTANCIA_BANDA_INFERIOR = 9px`) para las cuatro combinaciones posibles (permanente/temporal × superior/inferior) — verificado en navegador que el hueco es idéntico en los cuatro casos. Por diseño de la geometría, el sellante y las cajitas MOV/REC quedan siempre en lados opuestos de la pieza (exterior vs. interior), así que nunca compiten por el mismo espacio.
- **Tramos de prótesis**: el trazo ahora empieza y termina exactamente en el borde exterior de la primera y la última pieza del tramo (antes iba de centro a centro, sin cubrir del todo las piezas extremas) y se dibuja claramente separado de la silueta de las piezas (banda "interior", la misma que usa el sellante — nunca chocan porque un tramo excluye el sellante en sus piezas cubiertas). Verificado con un tramo de 3 piezas que el trazo no alcanza ninguna pieza vecina fuera del tramo.
- **Símbolos superpuestos en una misma pieza**: cuando corona, endodoncia y sellante coinciden en la misma pieza (ahora posible, ver exclusiones arriba), cada uno tiene una posición fija sin colisión: el contorno de corona rodea la pieza, el triángulo de endodoncia se dibuja en la banda bajo la pieza (no ya centrado, donde chocaba con el contorno de la corona) apilado junto al asterisco de sellante si ambos coinciden, y el implante queda centrado. Verificado con las tres combinaciones simultáneas.
- Verificado sin scroll horizontal en 1280px, 1024px y 1920px tras estos cambios (la banda inferior se agrandó verticalmente para dar cabida a los símbolos apilados, sin afectar el ancho).

### Guardado unificado de la ficha clínica y aviso de salida

- **Un solo botón** ("Guardar ficha clínica", flotante, esquina inferior derecha) guarda las 8 secciones B, C, D, E, F, G, I, J de una vez (8 `PUT` en paralelo a `routes/ficha-clinica.js`); ya no hay botones "Guardar" por sección. Un punto rojo en el botón indica cambios sin guardar; al guardar aparece una confirmación discreta "Ficha guardada ✓".
- **Aviso de salida**: si hay cambios sin guardar (en cualquier sección B-J, o una versión de odontograma en edición) y el usuario intenta cambiar de pestaña interna, hacer clic en un enlace de navegación (sidebar, "Volver al listado", etc.) o cerrar el navegador, aparece el diálogo "Tienes cambios sin guardar. ¿Deseas guardarlos antes de salir?" con **Guardar** / **Salir sin guardar** / **Cancelar**. `beforeunload` cubre el cierre real del navegador (con el diálogo nativo, no personalizable por las restricciones de los navegadores modernos). Si se elige "Guardar" y además hay un odontograma en edición, se guardan las secciones pero **no se navega**: se avisa que el odontograma debe resolverse aparte con "Guardar nueva versión" o "Cancelar edición", para no forzar un versionado no deliberado.
- El seguimiento de cambios usa delegación de eventos (`input`/`change`) sobre el panel de la ficha clínica, excluyendo el odontograma (que marca sus propios cambios al entrar/salir/guardar el modo de edición vía `marcarCambioPendiente('odontograma')`/`limpiarCambioPendiente('odontograma')`).

### Alerta médica visible

Si en **D. Antecedentes patológicos personales** se marca alergia a antibiótico, alergia a anestesia, hemorragias, diabetes, hipertensión o enfermedad cardíaca, aparece un banner rojo/dorado permanente (`GET /api/ficha-clinica/:pacienteId/alertas`, fuente única de verdad) en la cabecera de la ficha del paciente **y** en el modal de nueva/editar cita de la Agenda al seleccionar ese paciente.

### API y roles

- `routes/ficha-clinica.js`: `GET /api/ficha-clinica/:pacienteId`, `GET /api/ficha-clinica/:pacienteId/alertas`, `PUT /api/ficha-clinica/:pacienteId/seccion/:seccion`.
- `routes/odontograma.js`: `GET /api/odontograma/:pacienteId/versiones`, `GET /api/odontograma/:pacienteId/activo`, `GET /api/odontograma/version/:id`, `GET /api/odontograma/:pacienteId/cpo-sugerido`, `POST /api/odontograma/:pacienteId` (crea nueva versión; acepta `tipo` y valida las reglas de exclusión clínica y el único `'inicial'` por paciente).
- Cualquier usuario logueado (`admin` o `asistencial`) puede registrar y consultar todo el historial clínico — es una clínica pequeña con un solo consultorio compartido. Solo `admin` conserva la exclusividad de eliminar pacientes y citas.

### Migración de base de datos

La tabla `odontogramas` de las Fases 1–2 era un *stub* sin interfaz de usuario (columnas `fecha`/`datos_json`, sin versión) y **nunca tuvo datos reales**: `db/migraciones.js` la reemplaza automáticamente por el esquema de Fase 3A (`fecha_registro`, `es_version_activa`) la primera vez que arranca el servidor con este código, junto con la nueva tabla `odontograma_piezas`. La tabla `fichas_clinicas` es nueva. Ninguna migración toca la tabla `pacientes` ni ningún otro dato existente.

**Rediseño de la paleta (implante + tramos)**: agregó la columna `odontograma_piezas.fuera_simbologia_f033` y amplió el `CHECK` de `color_tipo` para admitir `'neutro'` (pérdida por otra causa, ausente). SQLite no permite alterar un `CHECK` existente, así que `db/migraciones.js` reconstruye la tabla `odontograma_piezas` (crea la versión nueva, copia todos los hallazgos ya guardados fila por fila, borra la vieja y renombra) — no se pierde ningún hallazgo previamente registrado. Se probó explícitamente contra una copia de la base de datos real (477 pacientes) antes de aplicarla.

**Ronda de refinamiento (tipos de odontograma + antecedentes Sí/No)**: agregó `odontogramas.tipo` con `ALTER TABLE ADD COLUMN` (columna nueva con `CHECK`, sin reconstrucción de tabla) y marcó como `'inicial'` el odontograma más antiguo (`MIN(id)`) de cada paciente. Además convirtió el formato de `antecedentes_personales_json`/`antecedentes_familiares_json` de `{marcados: [...]}` (checkbox) a `{estados: {codigo: 'si'}}` (Sí/No explícito): los ítems previamente marcados quedan en `'si'`, el resto queda sin registrar en `estados` (nunca se infiere un "No" que el profesional no ingresó). Ambas migraciones se probaron contra una copia de la base de datos real antes de aplicarlas.

La base de datos ya incluye las tablas necesarias para las siguientes fases (presupuestos, pagos, firma digital), listas para desarrollarse sin modificar el esquema actual.

## Contenido de la Fase 3B

Completa las secciones L a P del Formulario 033 y agrega su **impresión oficial**.

### N. Diagnóstico CIE-10

Hasta **6 diagnósticos** por ficha (`routes/diagnosticos.js`, tabla `diagnosticos`), cada uno con descripción, código CIE-10, doctor y tipo **PRE** (presuntivo) o **DEF** (definitivo). Un diagnóstico se registra en PRE y puede **promoverse a DEF** con un clic (`PUT /api/diagnosticos/:id/promover`) conservando ambas fechas (`fecha_pre`/`fecha_def`) para trazabilidad — nunca se sobrescribe la fecha original. El **buscador CIE-10 en vivo** (`GET /api/cie10?q=`) consulta la tabla `cie10_odontologia`, precargada (seed, `db/semillaCie10.js`) con **91 códigos**: K00–K14 completos con sus subcódigos más frecuentes (incluye K07.20/21/22 para las clases de Angle), más S02.5 (fractura dental) y Z01.2 (examen dental).

### P. Tratamiento — evoluciones por sesión

El corazón de esta fase (`routes/evoluciones.js`, tabla `evoluciones`, rediseñada por completo respecto al *stub* sin uso de fases anteriores). Cada evolución tiene `numero_sesion` autoincremental **por paciente**, fecha, doctor, diagnóstico/complicaciones (con un botón "Sin complicaciones" de un clic), procedimientos, prescripciones y piezas tratadas (FDI, opcional).

- **Inmutable**: una vez guardada no existe ruta para editarla ni borrarla — un error se corrige registrando una evolución aclaratoria nueva, nunca alterando la anterior. Solo `admin` puede **anularla** (`PUT /api/evoluciones/:id/anular`, con motivo obligatorio): es un borrado lógico, la evolución sigue visible pero tachada con el motivo y quién/cuándo la anuló.
- **Vínculo opcional con la agenda**: al elegir la fecha, si existe una cita de ese paciente con estado `atendida` ese día (`GET /api/evoluciones/:pacienteId/cita-del-dia`), se ofrece vincularla automáticamente (se puede desvincular con un clic antes de guardar).
- **"Registrar ALTA"**: crea una evolución marcada `es_alta = 1` con el campo de procedimientos pre-rellenado en "ALTA" (editable) — según el instructivo, al finalizar el tratamiento se escribe eso textualmente. Si el paciente no tiene todavía un odontograma de tipo `'alta'`, se sugiere registrarlo en la sección H.
- **UI en dos lugares**: un panel compacto en la **columna derecha del odontograma** (antes vacía) con las últimas 3 sesiones y acceso directo a "Nueva evolución"; la lista completa, en orden cronológico inverso, vive como subsección P de la ficha.
- **Firma digital del paciente y del doctor, obligatoria**: el modal "Nueva evolución" incluye dos pads de firma (`public/js/firma.js`, canvas sin dependencias externas, funciona con mouse/touch/lápiz) — no se puede guardar la sesión sin ambas firmas (`POST /api/evoluciones/:pacienteId` las exige, 400 si falta alguna). Se guardan en la tabla `firmas` (ya existía como *stub* de fases futuras, reutilizada: `documento_tipo` = `'evolucion_paciente'`/`'evolucion_doctor'`, `documento_id` = la evolución), una fila por firma, por sesión — inmutables junto con el resto del registro. Se muestran en miniatura en la lista de evoluciones en pantalla y, en la impresión del F033, cada sesión de la sección P imprime sus propias dos firmas (no solo la más reciente): revisar la evolución 3 de un paciente en la impresión muestra las firmas de la sesión 3, no las de una sesión posterior.

### L, M y O

- **L — Pedido de exámenes complementarios**: checkboxes (Biometría, Química sanguínea, Rayos X, Otros con texto) + detalle libre.
- **M — Informe de exámenes**: **condicionada a L** (ver ronda de correcciones más abajo) — permanece oculta mientras L no tenga ningún examen marcado; al marcar uno o más, M muestra un bloque de informe (fecha + texto + documentos) **solo para los exámenes efectivamente marcados**, cada uno independiente. Referencia opcional a documentos ya subidos en la pestaña **Documentos** de la ficha (reutiliza `documentos_pacientes`, no hay un mecanismo de subida aparte).
- **O — Datos del profesional responsable**: selector de doctor (autocompleta registro profesional desde la tabla `doctores`) + fecha/hora de apertura de la ficha (`fichas_clinicas.fecha_creacion`) + firma del profesional (mismo pad de `public/js/firma.js`, guardada como parte de `profesional_responsable_json.firma`). Editable libremente la primera vez; una vez registrado, **solo un administrador** puede modificarlo — incluida la firma (`routes/ficha-clinica.js`, `SECCIONES_SOLO_ADMIN_SI_YA_TIENE_DATOS`).

Las tres viven como columnas JSON nuevas en `fichas_clinicas` (`examenes_solicitados_json`, `examenes_informe_json`, `profesional_responsable_json`) y se guardan con el mismo botón único "Guardar ficha clínica" que el resto de la ficha — no se agregó ningún botón de guardado nuevo. `examenes_informe_json` pasó de un único informe plano a un objeto **por tipo de examen** (`{biometria: {...}, rayos_x: {...}, ...}`, cada uno con `fecha`/`texto`/`documento_ids`) — ver ronda de correcciones.

### Impresión oficial del Formulario 033

Botón **"Imprimir F033"** en la ficha del paciente, abre `imprimir-f033.html?id=X` en una pestaña nueva. Si hay cambios sin guardar en la ficha, se avisa antes de continuar — **la impresión siempre usa los últimos datos guardados**, nunca un borrador en edición (llama a las mismas API que el resto de la app, no lee el estado en memoria del formulario).

- **Dos páginas A4** (`public/css/impresion.css`, `@media print` con `@page { size: A4; margin: 10mm; }` y `page-break-after` entre hojas): página 1 con las secciones A–K (encabezado con condición de edad H-D-M-A, motivo entre comillas, antecedentes D/E con "—" para lo no registrado, odontograma dibujado, índices, simbología); página 2 con L–P, observaciones y el pie `SNS-MSP / HCU-form.033/2021 — ODONTOLOGÍA (1)/(2)` con el nombre y número de historia del paciente en ambas.
- **El odontograma se dibuja reutilizando el renderizador real**: `imprimir-f033.html` carga `public/js/odontograma.js` (que no ejecuta nada por sí solo — sin `DOMContentLoaded`, solo define funciones) y llama directamente a `renderizarSvgOdontograma()` sobre un `<svg id="odontograma-svg">` propio, con `piezasVisibles` cargado desde la versión activa y `modoEdicion = false`. Mismos símbolos, mismos colores, mismas correcciones visuales que en pantalla — cero duplicación de lógica de dibujo. La leyenda (sección K) reutiliza igual `construirLeyenda()`.
- **Observaciones de la impresión**: lista como texto cada hallazgo `fuera_simbologia_f033 = 1` (implantes: "Pieza 36: implante realizado") y las observaciones de texto libre de la versión del odontograma activa.
- El contenido se ajustó para caber en una sola hoja A4 por página (tipografía compacta 8.5px, listas de antecedentes en dos columnas, odontograma y leyenda escalados) — verificado midiendo que la altura renderizada de cada página coincide exactamente con 297mm.

### Migración de base de datos (Fase 3B)

- `fichas_clinicas` gana tres columnas nuevas (`examenes_solicitados_json`, `examenes_informe_json`, `profesional_responsable_json`) vía `ALTER TABLE ADD COLUMN`, nulas por defecto — no se pierde ningún dato existente.
- La tabla `evoluciones` (stub sin interfaz de usuario de fases anteriores, **sin datos reales**) se recrea con el esquema completo de la sección P.
- **Incidente encontrado y corregido durante las pruebas**: la columna `evoluciones.cita_id` referenciaba `citas(id)` sin `ON DELETE SET NULL`. Borrar una cita vinculada a una evolución hacía fallar la sentencia `DELETE` con una excepción no controlada en `routes/citas.js`, **tumbando el servidor completo** (reproducido y confirmado en esta misma sesión). Corregido en dos frentes: (1) migración que reconstruye `evoluciones` con `ON DELETE SET NULL` en `cita_id` — borrar la cita ahora solo desvincula la referencia, nunca afecta ni borra la evolución (el registro legal se preserva siempre), conservando las evoluciones ya existentes; (2) `routes/citas.js` ahora envuelve el `DELETE` en un `try/catch` y responde con un error 400 claro ante cualquier restricción de base de datos, en vez de dejar caer una excepción no controlada que tumbe el proceso — protección general, no solo para este caso.

## Ronda de correcciones — ficha clínica y odontograma (tras revisión de usuario)

Ronda de correcciones dedicada sobre seis puntos reportados tras revisión de la ficha clínica y el odontograma en uso real. No tocó la lógica de versionado inmutable, las exclusiones clínicas ni la sincronización con Google Calendar.

- **Bug del CPO automático en J**: el cálculo en sí (`/api/odontograma/:pacienteId/cpo-sugerido`) ya era correcto — el problema real era la **falta de una señal visible** de por qué J podía mostrar 0 o no coincidir con lo que se ve en el odontograma. J **siempre** refleja la última versión **guardada** del odontograma (nunca una edición en curso sin guardar, por diseño), pero no había ningún aviso de esto. Se agregó una nota de estado (`actualizarAvisoEstadoOdontogramaEnCpo()` en `public/js/ficha-clinica.js`) con tres estados posibles: **"Sin odontograma registrado"** (paciente sin ninguna versión guardada — J=0 es correcto), **"Hay una edición del odontograma sin guardar"** (J sigue mostrando la última guardada, con la nota explicándolo) y un aviso de error real si la consulta al servidor falla (antes se tragaba en silencio y mostraba 0 como si fuera un cálculo válido). El endpoint ahora también devuelve `existeOdontograma` para poder distinguir "sin datos" de "cero real". Probado con tres pacientes ficticios cubriendo los tres estados.
- **M condicionada a L**: `examenes_informe_json` pasó de un informe único y plano a un objeto por tipo de examen. La sección M (`#seccion-examenes-informe`) permanece oculta mientras ningún examen esté marcado en L; al marcar uno, aparece un bloque de informe independiente solo para ese examen. Al desmarcar un examen que ya tiene informe registrado, se pide confirmación informativa y los datos se **conservan ocultos** (nunca se borran) — reaparecen si se vuelve a marcar. La impresión del F033 (`bloqueM` en `public/js/imprimir-f033.js`) solo puebla los informes que realmente tienen datos.
- **Higiene oral por trío de piezas**: `PIEZAS_HIGIENE` (`public/js/ficha-clinica.js`) pasó de una fila fija por trío (`"16 / 17 / 55"` como texto) a un `<select>` por fila que examina **una sola pieza** del trío, elegida automáticamente según disponibilidad en el odontograma activo (la titular; si está ausente/perdida/con extracción indicada, la primera alterna; si tampoco existe, la temporal — mismos cuatro estados excluyentes que en el odontograma, `ESTADOS_PIEZA_NO_DISPONIBLE_HIGIENE`). La pieza sugerida se resalta (negrita/dorada) con un tooltip "Pieza sugerida según odontograma"; el examinador puede elegir manualmente otra del trío. Si ninguna de las tres existe, la fila queda con raya y **fuera del divisor del promedio**. Sin odontograma activo, se sugiere siempre la titular. La impresión marca con negrita/subrayado la pieza efectivamente examinada dentro del trío.
- **Paleta del odontograma sin overlaps**: `.paleta-boton` (flex, dentro de una grilla CSS) no tenía `min-width: 0`, así que no podía encogerse por debajo del ancho de su contenido — el texto empujaba el botón (y la grilla) más allá del ancho de su columna `1fr`, desbordando el panel beige unos 40px en la segunda columna. Corregido agregando `min-width: 0` a `.paleta-boton` y una nueva regla `.paleta-boton__texto` con `overflow-wrap: break-word`. Verificado sin overflow ni overlap de títulos en 1280px, 1440px y 1920px.
- **Columna derecha del odontograma a ancho completo**: el panel de Evoluciones (antes una tercera columna angosta de 172px) ahora ocupa el ancho completo de una columna derecha de 320px (`.odonto-columna-derecha`, que envuelve ambos paneles con `position: sticky`). Debajo se agregó un nuevo panel **"Resumen del paciente"** (`cargarPanelResumenPaciente()` en `public/js/odontograma.js`): diagnósticos CIE-10 activos (código + descripción + PRE/DEF), alerta médica si existe (mismo estilo visual que el banner de la ficha) y un placeholder discreto "Plan de tratamiento — disponible en próxima fase". Por debajo de 1280px, la columna completa pasa a una sola columna estática debajo del odontograma (mismo breakpoint que ya existía para la paleta).
- **Banda de símbolos en la arcada inferior**: `ALTURA_BANDA_SELLANTE` (22px) se quedaba corta para el peor caso real — sellante + endodoncia apilados en la misma pieza alcanzaban 27.5px desde el borde de la pieza, pero solo había 26px reservados, causando una invasión de ~1.5px sobre la fila vecina en la arcada inferior. Ampliado a 24px (28px reservados totales) — verificado midiendo en el DOM que los símbolos apilados quedan dentro de la banda reservada, sin chocar con la fila de temporales, tanto en una pieza superior como inferior con endodoncia y sellante coincidiendo.

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
│   ├── semillaCie10.js         Catalogo CIE-10 odontologico precargado (solo se usa una vez)
│   ├── schema.sql              Esquema de base de datos
│   └── dentify.db              Base de datos (se crea automaticamente)
├── routes/                     Rutas de la API (auth, pacientes, usuarios, importador, dashboard,
│                                doctores, citas, sync, ficha-clinica, odontograma, cie10,
│                                diagnosticos, evoluciones)
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
