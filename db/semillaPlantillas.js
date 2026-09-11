// =====================================================================
// Plantillas iniciales de consentimiento informado (Fase 3C), migradas
// palabra por palabra desde el proyecto WD_DOCS (textos ya validados
// por la clinica), convertidas del patron de spans out-* al sistema de
// marcadores {marcador} de Dentify. Solo se siembran una vez (si la
// tabla plantillas_documento esta vacia) - ver db/migraciones.js.
//
// Marcadores disponibles: {paciente_nombre} {paciente_cedula}
// {paciente_edad} {representante_nombre} {representante_cedula}
// {doctor_nombre} {doctor_registro} {fecha} {piezas}
// {procedimiento_detalle} y el ayudante {representante_clausula}
// (frase ", representado(a) legalmente por X (C.I. Y)" que se arma sola
// cuando el paciente es menor de edad; queda vacio para un adulto).
// =====================================================================

const APERTURA = (procedimiento) => `<p>Yo, <strong>{paciente_nombre}</strong>, identificado(a) con cédula <strong>{paciente_cedula}</strong>, de {paciente_edad} años de edad{representante_clausula}, declaro que el/la <strong>{doctor_nombre}</strong>, con registro profesional N.° {doctor_registro}, me ha explicado de forma clara y en lenguaje comprensible la naturaleza ${procedimiento}, sus alcances, riesgos y alternativas, conforme a lo establecido en la Ley Orgánica de Salud del Ecuador y normativa vigente sobre derechos del paciente.</p>`;

const PLANTILLAS = [
    {
        nombre: 'Consentimiento Informado · Ortodoncia',
        tipo: 'consentimiento',
        procedimiento_asociado: 'ortodoncia',
        contenido: `
${APERTURA('del tratamiento de ortodoncia')}
<h4>1. Naturaleza del tratamiento</h4>
<ul>
<li>El tratamiento de ortodoncia consiste en la corrección de la posición de los dientes y/o maxilares mediante el uso de brackets, alineadores u otros aparatos, con el fin de mejorar la función masticatoria, la oclusión y la estética dental.</li>
<li>El plan de tratamiento, duración estimada y tipo de aparatología fueron explicados específicamente para mi caso. Piezas involucradas: {piezas}.</li>
</ul>
<h4>2. Duración estimada y controles</h4>
<p>{procedimiento_detalle}</p>
<h4>3. Riesgos y posibles complicaciones</h4>
<ul>
<li>Molestias, sensibilidad dental o dolor leve los primeros días tras la colocación o ajuste de la aparatología.</li>
<li>Irritación o ulceraciones leves en mucosa oral (mejillas, labios, encías) por la presencia de los brackets.</li>
<li>Reabsorción radicular leve, recesión gingival o movilidad dental temporal, en casos poco frecuentes.</li>
<li>Descalcificación o caries si no se mantiene una higiene oral adecuada durante el tratamiento.</li>
<li>Recidiva (retorno parcial a la posición original) si no se usa la retención indicada al finalizar el tratamiento.</li>
<li>Posible necesidad de tratamientos adicionales (extracciones, cirugía ortognática, etc.) según evolución del caso.</li>
<li>Reacciones alérgicas infrecuentes a los materiales utilizados.</li>
</ul>
<h4>4. Alternativas de tratamiento</h4>
<p>Se me informó que existen alternativas, incluyendo no realizar tratamiento alguno, así como otras técnicas u opciones de aparatología, y que la opción propuesta es la que el profesional considera más adecuada para mi caso particular.</p>
<h4>5. Responsabilidades del paciente</h4>
<ul>
<li>Asistir puntualmente a las citas y controles programados.</li>
<li>Mantener una higiene oral adecuada durante todo el tratamiento.</li>
<li>Seguir las indicaciones del odontólogo respecto al uso de ligas, alineadores, retenedores u otros dispositivos.</li>
<li>Informar oportunamente cualquier molestia, rotura de aparatología o complicación.</li>
<li>Comprender que el incumplimiento de estas indicaciones puede prolongar el tratamiento o afectar el resultado final.</li>
</ul>
<h4>6. Costos y forma de pago</h4>
<p>El costo del tratamiento, el plan de pagos y la política de citas no asistidas o canceladas fueron informados y aceptados de forma independiente a este documento. World Dental acepta pagos con tarjeta de crédito, transferencia bancaria o efectivo.</p>
<ul>
<li>El tratamiento de ortodoncia puede iniciarse con un abono inicial aproximado de una cuarta parte del valor total, con el saldo diferido en cuotas mensuales según lo acordado con la clínica.</li>
<li>El valor de la cita de valoración inicial se descuenta del costo total si el paciente decide iniciar el tratamiento.</li>
</ul>
<h4>7. Declaración de consentimiento</h4>
<p>Declaro que he leído y comprendido la información anterior, que he tenido la oportunidad de formular preguntas y que estas han sido respondidas satisfactoriamente. Otorgo mi consentimiento de manera libre y voluntaria para iniciar el tratamiento de ortodoncia descrito, entendiendo que puedo revocar este consentimiento en cualquier momento, dejándolo constancia por escrito, sin que esto afecte la atención de urgencias relacionadas con el tratamiento ya iniciado.</p>
`.trim()
    },
    {
        nombre: 'Consentimiento Informado · Exodoncia / Cirugía Oral',
        tipo: 'consentimiento',
        procedimiento_asociado: 'exodoncia',
        contenido: `
${APERTURA('del procedimiento de exodoncia')}
<h4>1. Naturaleza del procedimiento</h4>
<p>Pieza(s) a extraer: {piezas} · {procedimiento_detalle}</p>
<ul>
<li>La exodoncia es la extracción quirúrgica de una o varias piezas dentales, indicada por caries extensa, fractura, enfermedad periodontal avanzada, piezas retenidas/incluidas (como terceros molares), motivos ortodónticos u otra indicación clínica.</li>
<li>El procedimiento se realiza bajo anestesia local. Según la complejidad de la pieza, puede requerir incisión, sutura y/o división de la raíz.</li>
<li>El tipo de exodoncia (simple o quirúrgica) y la pieza específica fueron explicados para mi caso particular.</li>
</ul>
<h4>2. Riesgos y posibles complicaciones</h4>
<ul>
<li>Dolor, inflamación (edema) y/o hematoma en la zona, de intensidad variable durante los días posteriores.</li>
<li>Sangrado postoperatorio, generalmente controlable con las medidas indicadas por el odontólogo.</li>
<li>Trismo (dificultad temporal para abrir la boca), especialmente en extracciones quirúrgicas.</li>
<li>Alveolitis seca (dolor intenso por pérdida del coágulo), más frecuente en molares inferiores.</li>
<li>Infección postoperatoria, que de presentarse requiere tratamiento adicional con antibióticos.</li>
<li>Lesión a estructuras vecinas: dientes adyacentes, restauraciones existentes, o en casos poco frecuentes, lesión a nervios cercanos (parestesia/anestesia temporal o, rara vez, permanente de labio, mentón o lengua).</li>
<li>En piezas superiores posteriores, posible comunicación oroantral con el seno maxilar, que de ocurrir puede requerir manejo adicional.</li>
<li>Fractura radicular, de la pieza vecina o, excepcionalmente, del hueso maxilar/mandibular, especialmente en raíces curvas o piezas muy retenidas.</li>
<li>Posible necesidad de procedimientos adicionales (cirugía, injerto óseo, o derivación a especialista) según hallazgos durante el procedimiento.</li>
</ul>
<h4>3. Alternativas de tratamiento</h4>
<p>Se me informó que, según el caso, pueden existir alternativas a la extracción —como tratamiento de conducto (endodoncia), tratamiento periodontal, u observación sin intervención inmediata— y que la extracción es la opción que el profesional considera más adecuada dado el diagnóstico actual.</p>
<h4>4. Cuidados y responsabilidades del paciente</h4>
<ul>
<li>Seguir estrictamente las indicaciones postoperatorias entregadas por el odontólogo (dieta, higiene, medicación y reposo relativo).</li>
<li>No fumar, no usar pajilla/sorbete y evitar enjuagues vigorosos durante las primeras 24-48 horas, para no perder el coágulo.</li>
<li>Tomar la medicación prescrita (analgésicos y/o antibióticos) según lo indicado, completando el tratamiento si corresponde.</li>
<li>Informar de inmediato a la clínica ante sangrado persistente, dolor que empeora, fiebre o hinchazón progresiva.</li>
<li>Asistir a la cita de control y/o retiro de puntos si el procedimiento lo requiere.</li>
</ul>
<h4>5. Anestesia</h4>
<p>Entiendo que el procedimiento se realizará con anestesia local y que, en casos excepcionales, pueden presentarse reacciones alérgicas o respuesta insuficiente a la anestesia, lo cual será manejado por el profesional tratante.</p>
<h4>6. Costos y forma de pago</h4>
<p>El costo del procedimiento, la forma de pago y la política de citas no asistidas o canceladas fueron informados y aceptados de forma independiente a este documento. World Dental acepta pagos con tarjeta de crédito, transferencia bancaria o efectivo.</p>
<ul>
<li>El valor de la cita de valoración inicial se descuenta del costo total del procedimiento si el paciente decide proceder con la extracción en World Dental.</li>
</ul>
<h4>7. Declaración de consentimiento</h4>
<p>Declaro que he leído y comprendido la información anterior, que he tenido la oportunidad de formular preguntas y que estas han sido respondidas satisfactoriamente. Otorgo mi consentimiento de manera libre y voluntaria para que se me realice la exodoncia descrita, entendiendo los riesgos, beneficios y alternativas expuestos, y que puedo revocar este consentimiento antes del inicio del procedimiento.</p>
`.trim()
    },
    {
        nombre: 'Consentimiento Informado · Implante Dental',
        tipo: 'consentimiento',
        procedimiento_asociado: 'implantes',
        contenido: `
${APERTURA('del tratamiento de implante(s) dental(es)')}
<h4>1. Naturaleza del procedimiento</h4>
<p>Pieza(s) a reemplazar: {piezas} · {procedimiento_detalle}</p>
<ul>
<li>El implante dental es un tornillo de titanio (u otro biomaterial compatible) que se coloca quirúrgicamente en el hueso maxilar o mandibular para sustituir la raíz de una pieza dental perdida, sobre el cual posteriormente se coloca una corona, puente o prótesis.</li>
<li>El tratamiento se desarrolla normalmente en dos fases: (1) colocación quirúrgica del implante y un período de cicatrización/oseointegración de aproximadamente 3 a 6 meses, y (2) colocación de la corona o prótesis definitiva una vez confirmada la oseointegración.</li>
<li>Según la cantidad de hueso disponible, puede ser necesario un injerto óseo o una elevación de seno maxilar previos o simultáneos a la colocación del implante.</li>
</ul>
<h4>2. Evaluación previa y contraindicaciones</h4>
<ul>
<li>El tratamiento requiere evaluación clínica y radiográfica/tomográfica previa para determinar cantidad y calidad de hueso disponible.</li>
<li>Condiciones como diabetes no controlada, tabaquismo, enfermedad periodontal activa no tratada, uso de bifosfonatos u otros medicamentos que afectan el metabolismo óseo, inmunosupresión o tratamientos de radioterapia en cabeza/cuello pueden aumentar el riesgo de complicaciones o falla del implante, y fueron evaluadas/declaradas por el paciente.</li>
</ul>
<h4>3. Riesgos y posibles complicaciones</h4>
<ul>
<li>Dolor, inflamación (edema) y/o hematoma en la zona durante los días posteriores a la cirugía.</li>
<li>Sangrado postoperatorio e infección, que de presentarse puede requerir tratamiento adicional con antibióticos.</li>
<li>Falta de oseointegración o rechazo del implante, lo que puede requerir su retiro y, eventualmente, un nuevo intento tras un período de cicatrización.</li>
<li>Lesión a estructuras vecinas: dientes adyacentes, o en casos poco frecuentes, lesión a nervios cercanos (parestesia/anestesia temporal o, rara vez, permanente de labio, mentón o lengua).</li>
<li>En implantes superiores posteriores, posible comunicación o perforación del seno maxilar, que de ocurrir puede requerir manejo adicional.</li>
<li>Periimplantitis (inflamación e infección del tejido alrededor del implante) a mediano o largo plazo, especialmente si no se mantiene una higiene adecuada o existen factores de riesgo como el tabaquismo.</li>
<li>Fractura del implante, del tornillo protésico o de la corona, en casos poco frecuentes.</li>
<li>Necesidad de procedimientos adicionales (injerto óseo, elevación de seno, retiro y reemplazo del implante) según la evolución del caso.</li>
</ul>
<h4>4. Alternativas de tratamiento</h4>
<p>Se me informó que existen alternativas para reemplazar la(s) pieza(s) faltante(s), como un puente fijo sobre dientes naturales, una prótesis removible, o no realizar reemplazo alguno, y que el implante es la opción que el profesional considera más adecuada para mi caso según el diagnóstico realizado.</p>
<h4>5. Cuidados y responsabilidades del paciente</h4>
<ul>
<li>Seguir estrictamente las indicaciones postoperatorias entregadas (higiene, dieta, medicación y reposo relativo) tras la cirugía.</li>
<li>Mantener una higiene oral rigurosa durante todo el tratamiento y posterior a la colocación de la corona o prótesis definitiva.</li>
<li>Asistir a todas las citas de control durante el período de oseointegración y a los controles periódicos posteriores.</li>
<li>Evitar o reducir el consumo de tabaco, ya que afecta significativamente la cicatrización y el éxito del implante.</li>
<li>Informar de inmediato ante dolor persistente, movilidad del implante, sangrado o inflamación que no mejore.</li>
<li>Comprender que el éxito a largo plazo del implante depende en gran parte del cuidado y los controles del paciente.</li>
</ul>
<h4>6. Anestesia</h4>
<p>Entiendo que el procedimiento quirúrgico se realizará con anestesia local y que, en casos excepcionales, pueden presentarse reacciones alérgicas o respuesta insuficiente a la anestesia, lo cual será manejado por el profesional tratante.</p>
<h4>7. Costos y forma de pago</h4>
<p>El costo del tratamiento (incluyendo, si aplica, los procedimientos adicionales como injerto óseo o elevación de seno), la forma de pago y la política de citas no asistidas o canceladas fueron informados y aceptados de forma independiente a este documento. World Dental acepta pagos con tarjeta de crédito, transferencia bancaria o efectivo.</p>
<ul>
<li>El valor de la cita de valoración inicial se descuenta del costo total del tratamiento si el paciente decide proceder con el implante en World Dental.</li>
</ul>
<h4>8. Declaración de consentimiento</h4>
<p>Declaro que he leído y comprendido la información anterior, que he tenido la oportunidad de formular preguntas y que estas han sido respondidas satisfactoriamente. Otorgo mi consentimiento de manera libre y voluntaria para que se me realice el tratamiento de implante dental descrito, entendiendo los riesgos, beneficios, fases del tratamiento y alternativas expuestos, y que puedo revocar este consentimiento en cualquier momento antes de cada fase del procedimiento.</p>
`.trim()
    },
    {
        nombre: 'Consentimiento Informado · Rehabilitación Oral',
        tipo: 'consentimiento',
        procedimiento_asociado: 'rehabilitacion',
        contenido: `
${APERTURA('del tratamiento de rehabilitación oral')}
<h4>1. Naturaleza del procedimiento</h4>
<p>Pieza(s) involucrada(s): {piezas} · {procedimiento_detalle}</p>
<ul>
<li>La rehabilitación oral es un tratamiento integral orientado a restaurar la función masticatoria, la mordida (oclusión) y la estética dental mediante coronas, puentes fijos, prótesis removibles o totales, ajustes oclusales, o una combinación de estos según el diagnóstico.</li>
<li>Cuando el caso lo requiere, la rehabilitación puede integrarse con otros tratamientos (endodoncia, periodoncia, implantes o cirugía), por lo que el plan puede desarrollarse en varias fases y citas.</li>
<li>El plan específico, materiales a utilizar (cerámica, metal-cerámica, resina, zirconio u otros) y secuencia de fases fueron explicados para mi caso particular.</li>
</ul>
<h4>2. Evaluación previa</h4>
<ul>
<li>El tratamiento requiere una evaluación clínica, radiográfica y, en algunos casos, registros de mordida o modelos de estudio, para determinar el diseño más adecuado y anticipar los cambios en la oclusión.</li>
<li>Puede ser necesario el uso de restauraciones provisionales (temporales) durante el proceso, antes de la colocación de las piezas definitivas.</li>
</ul>
<h4>3. Riesgos y posibles complicaciones</h4>
<ul>
<li>Sensibilidad dental transitoria tras la preparación de las piezas o la colocación de las restauraciones.</li>
<li>Irritación o inflamación gingival leve y temporal en los tejidos adyacentes a las restauraciones.</li>
<li>Período de adaptación a la nueva mordida, que puede generar molestias musculares o articulares transitorias mientras el paciente se acostumbra.</li>
<li>Necesidad de ajustes posteriores a la colocación (oclusión, contactos o forma) para lograr el resultado funcional óptimo.</li>
<li>Posible aflojamiento, desgaste o fractura de las restauraciones con el tiempo, especialmente si no se siguen los cuidados indicados o existen hábitos como el bruxismo.</li>
<li>Reacciones alérgicas infrecuentes a los materiales utilizados (metales, resinas u otros componentes).</li>
<li>En prótesis removibles, posibles molestias iniciales con el habla, masticación o retención, que generalmente mejoran con el uso y los ajustes correspondientes.</li>
</ul>
<h4>4. Alternativas de tratamiento</h4>
<p>Se me informó que, según el caso, pueden existir alternativas de menor o mayor complejidad —incluyendo no realizar tratamiento, opciones más conservadoras o el uso de otros materiales/diseños— y que el plan propuesto es el que el profesional considera más adecuado para mi caso según el diagnóstico realizado.</p>
<h4>5. Cuidados y responsabilidades del paciente</h4>
<ul>
<li>Asistir a todas las citas programadas, incluyendo pruebas, ajustes y controles posteriores a la colocación definitiva.</li>
<li>Mantener una higiene oral rigurosa, incluyendo el cuidado específico de prótesis removibles si corresponde.</li>
<li>Seguir las indicaciones sobre el uso de restauraciones provisionales (evitar alimentos duros o pegajosos) hasta la colocación de las piezas definitivas.</li>
<li>Informar oportunamente cualquier molestia, movilidad de una restauración o cambio en la mordida.</li>
<li>Usar, si así se indica, una guarda o férula nocturna para proteger las restauraciones en caso de bruxismo.</li>
<li>Comprender que la duración de las restauraciones depende en gran parte del cuidado, los hábitos y los controles periódicos del paciente.</li>
</ul>
<h4>6. Costos y forma de pago</h4>
<p>El costo del tratamiento, la forma de pago y la política de citas no asistidas o canceladas fueron informados y aceptados de forma independiente a este documento. World Dental acepta pagos con tarjeta de crédito, transferencia bancaria o efectivo.</p>
<ul>
<li>El valor de la cita de valoración inicial se descuenta del costo total del tratamiento si el paciente decide proceder con la rehabilitación oral en World Dental.</li>
</ul>
<h4>7. Declaración de consentimiento</h4>
<p>Declaro que he leído y comprendido la información anterior, que he tenido la oportunidad de formular preguntas y que estas han sido respondidas satisfactoriamente. Otorgo mi consentimiento de manera libre y voluntaria para iniciar el tratamiento de rehabilitación oral descrito, entendiendo los riesgos, beneficios, fases del tratamiento y alternativas expuestos, y que puedo revocar este consentimiento en cualquier momento antes de cada fase del procedimiento, dejándolo constancia por escrito.</p>
`.trim()
    },
    {
        nombre: 'Consentimiento Informado · Apicectomía',
        tipo: 'consentimiento',
        procedimiento_asociado: 'apicectomia',
        contenido: `
${APERTURA('del procedimiento de apicectomía (cirugía periapical)')}
<h4>1. Descripción del procedimiento</h4>
<p>Pieza dental: {piezas} · {procedimiento_detalle}</p>
<p>La apicectomía es un procedimiento quirúrgico odontológico indicado cuando una endodoncia previa no ha logrado eliminar completamente una infección localizada en el ápice o extremo de la raíz dental. Durante el procedimiento se realiza una pequeña incisión en la encía para acceder al hueso que rodea la raíz del diente. Se elimina el tejido infectado, se retira la punta de la raíz dental y se realiza un sellado del conducto radicular con materiales especializados para evitar reinfecciones. Posteriormente se colocan suturas para permitir la correcta cicatrización del tejido. El procedimiento se realiza bajo anestesia local.</p>
<h4>2. Objetivo del tratamiento</h4>
<p>El objetivo principal del tratamiento es eliminar la infección persistente alrededor de la raíz dental y preservar el diente natural en boca. Este procedimiento favorece la regeneración del hueso periapical, reduce dolor o inflamación y evita tratamientos más invasivos como la extracción dental.</p>
<h4>3. Beneficios del procedimiento</h4>
<ul>
<li>Eliminación de infección persistente.</li>
<li>Disminución de dolor o inflamación.</li>
<li>Conservación del diente natural.</li>
<li>Prevención de complicaciones infecciosas mayores.</li>
<li>Recuperación de la salud del hueso periapical.</li>
</ul>
<h4>4. Riesgos y posibles complicaciones</h4>
<p>Como en cualquier procedimiento quirúrgico pueden presentarse complicaciones tales como dolor postoperatorio, inflamación, sangrado leve, infección, retraso en la cicatrización, persistencia de la infección o necesidad de extracción dental si el tratamiento no resulta exitoso. En casos poco frecuentes pueden presentarse lesiones temporales o permanentes de estructuras anatómicas cercanas dependiendo de la localización del diente tratado.</p>
<h4>5. Alternativas de tratamiento</h4>
<p>Dependiendo del diagnóstico clínico pueden existir otras alternativas terapéuticas como retratamiento endodóntico, control clínico periódico, extracción dental o rehabilitación posterior mediante implantes o prótesis dentales. El odontólogo tratante ha explicado las opciones disponibles y ha recomendado la apicectomía como una alternativa para intentar conservar el diente natural.</p>
<h4>6. Cuidados postoperatorios</h4>
<ul>
<li>Tomar los medicamentos prescritos.</li>
<li>Aplicar frío externo durante las primeras horas.</li>
<li>Evitar masticar alimentos duros en la zona tratada.</li>
<li>Mantener adecuada higiene oral.</li>
<li>Evitar fumar o consumir alcohol durante la cicatrización.</li>
<li>Asistir a los controles clínicos indicados.</li>
</ul>
<h4>7. Reconocimiento de riesgos</h4>
<p>Declaro haber recibido información clara sobre la naturaleza del procedimiento, beneficios, riesgos y posibles complicaciones. Comprendo que, aunque el tratamiento se realizará siguiendo protocolos clínicos aceptados, no es posible garantizar resultados absolutos debido a las variaciones biológicas de cada paciente.</p>
<h4>8. Declaración de información médica</h4>
<p>Declaro haber proporcionado información veraz y completa sobre mi estado de salud general, enfermedades sistémicas, medicamentos que consumo, alergias y cualquier condición médica relevante que pueda influir en el tratamiento odontológico.</p>
<h4>9. Autorización del procedimiento</h4>
<p>Habiendo comprendido el procedimiento, sus beneficios, riesgos y alternativas, autorizo de manera libre y voluntaria al odontólogo tratante y a su equipo a realizar el procedimiento de apicectomía y cualquier maniobra clínica necesaria para resolver situaciones imprevistas durante el tratamiento.</p>
<h4>10. Constancia de lectura y aceptación</h4>
<p>Declaro que he leído íntegramente este consentimiento informado, que su contenido me ha sido explicado en lenguaje claro y comprensible, que he tenido la oportunidad de realizar preguntas y que mis inquietudes han sido atendidas satisfactoriamente. Firmo este documento de manera libre y voluntaria en señal de aceptación del tratamiento propuesto.</p>
`.trim()
    },
    {
        nombre: 'Consentimiento Informado · Escaneo Intraoral Digital',
        tipo: 'consentimiento',
        procedimiento_asociado: 'escaneo',
        contenido: `
${APERTURA('del escaneo intraoral digital')}
<h4>1. Información del procedimiento</h4>
<p>El escaneo intraoral es un procedimiento odontológico no invasivo que utiliza un escáner digital para capturar imágenes tridimensionales de dientes y encías, permitiendo diagnóstico y planificación del tratamiento. {procedimiento_detalle}</p>
<h4>2. Beneficios</h4>
<ul>
<li>Mayor precisión en diagnóstico.</li>
<li>Reducción de impresiones tradicionales.</li>
<li>Mejor comunicación con laboratorio dental.</li>
</ul>
<h4>3. Riesgos o molestias</h4>
<p>Puede presentarse leve incomodidad o reflejo nauseoso temporal durante el escaneo.</p>
<h4>4. Uso de la información</h4>
<p>Las imágenes digitales podrán utilizarse para diagnóstico, planificación y seguimiento clínico.</p>
<h4>5. Autorización</h4>
<p>Declaro haber recibido información suficiente y autorizo voluntariamente la realización del escaneo intraoral digital.</p>
`.trim()
    },
    {
        nombre: 'Consentimiento Informado · Preservación Alveolar',
        tipo: 'consentimiento',
        procedimiento_asociado: 'preservacion-alveolar',
        contenido: `
<p><strong>Paciente:</strong> {paciente_nombre} · <strong>Cédula:</strong> {paciente_cedula} · <strong>Edad:</strong> {paciente_edad} años{representante_clausula} · <strong>Fecha:</strong> {fecha}</p>
<p>Yo, <strong>{paciente_nombre}</strong>, declaro que el/la {doctor_nombre}, con registro profesional N.° {doctor_registro}, me ha explicado de forma clara y comprensible el procedimiento quirúrgico denominado "Preservación Alveolar", así como sus objetivos, beneficios, riesgos y alternativas, con el fin de otorgar mi consentimiento de forma libre, voluntaria e informada.</p>
<h4>1. ¿En qué consiste el procedimiento?</h4>
<p>Pieza(s) a tratar: {piezas} · {procedimiento_detalle}</p>
<p>La preservación alveolar (o preservación de reborde) es un procedimiento quirúrgico que se realiza inmediatamente después de la extracción de una pieza dental, con el objetivo de minimizar la reabsorción ósea y de tejidos blandos que ocurre naturalmente tras la pérdida del diente. Consiste en el relleno del alveolo (cavidad ósea remanente) con material de injerto óseo y, cuando el caso lo requiere, la colocación de una membrana biológica o sintética que protege el injerto y favorece la regeneración del hueso.</p>
<p>Este procedimiento busca mantener el volumen y la calidad del hueso y la encía en la zona tratada, facilitando tratamientos futuros como la colocación de implantes dentales o el uso de prótesis.</p>
<h4>2. Objetivo y beneficios esperados</h4>
<ul>
<li>Minimizar la pérdida de volumen óseo y de tejidos blandos tras la extracción dental.</li>
<li>Mantener condiciones óseas favorables para una futura rehabilitación con implantes u otras prótesis.</li>
<li>Reducir la necesidad de procedimientos de regeneración ósea más complejos en el futuro.</li>
<li>Favorecer un mejor resultado estético y funcional en la zona intervenida.</li>
</ul>
<h4>3. Descripción del procedimiento</h4>
<ul>
<li>Aplicación de anestesia local en la zona a tratar.</li>
<li>Extracción atraumática de la pieza dental (cuando el procedimiento incluye la extracción).</li>
<li>Limpieza y desinfección del alveolo (cavidad ósea).</li>
<li>Colocación del material de injerto óseo dentro del alveolo.</li>
<li>Colocación de una membrana de protección sobre el injerto, cuando el caso lo requiera.</li>
<li>Sutura de la zona intervenida.</li>
<li>Indicaciones postoperatorias y programación de citas de control.</li>
</ul>
<p>La duración aproximada del procedimiento es de 30 a 60 minutos, dependiendo de la complejidad del caso.</p>
<h4>4. Riesgos y posibles complicaciones</h4>
<p>Como todo procedimiento quirúrgico, la preservación alveolar conlleva riesgos inherentes que, si bien son poco frecuentes, es importante conocer:</p>
<ul>
<li>Dolor, inflamación o molestias postoperatorias de intensidad variable.</li>
<li>Sangrado durante o después del procedimiento.</li>
<li>Infección de la zona intervenida.</li>
<li>Exposición o pérdida parcial del material de injerto o de la membrana.</li>
<li>Dehiscencia (apertura) de la herida quirúrgica.</li>
<li>Reacción alérgica a los materiales utilizados (injerto, membrana, anestesia o medicación indicada).</li>
<li>Resultado óseo o estético menor al esperado, requiriendo procedimientos adicionales.</li>
<li>Alteraciones sensitivas temporales o, en casos excepcionales, permanentes en la zona tratada.</li>
<li>Necesidad de retratamiento o de un procedimiento complementario según la evolución del caso.</li>
</ul>
<p>Estos riesgos pueden aumentar en pacientes fumadores, con enfermedades sistémicas no controladas (como diabetes), con higiene oral deficiente o que no sigan las indicaciones postoperatorias.</p>
<h4>5. Alternativas al tratamiento</h4>
<p>Se me ha informado que existen alternativas a este procedimiento, entre ellas:</p>
<ul>
<li>No realizar ningún procedimiento de preservación y permitir la cicatrización natural del alveolo, asumiendo una mayor reabsorción ósea.</li>
<li>Realizar en el futuro un procedimiento de regeneración ósea más amplio, en caso de requerir tratamiento con implantes.</li>
<li>Optar por otras opciones protésicas que no requieran preservación del reborde alveolar.</li>
</ul>
<p>El odontólogo tratante ha explicado las ventajas y desventajas de cada alternativa en relación con mi caso particular.</p>
<h4>6. Cuidados e indicaciones postoperatorias</h4>
<ul>
<li>Aplicar frío local (hielo) en las primeras 24 a 48 horas para reducir la inflamación.</li>
<li>Tomar la medicación prescrita (analgésicos, antiinflamatorios y/o antibióticos) según indicación.</li>
<li>Evitar enjuagues bruscos, fumar y consumir alcohol durante el período de cicatrización.</li>
<li>Mantener una dieta blanda y fría durante los primeros días.</li>
<li>Evitar tocar o presionar la zona intervenida con la lengua, dedos u objetos.</li>
<li>Acudir a los controles postoperatorios programados por la clínica.</li>
<li>Comunicar de inmediato cualquier signo de alarma (sangrado abundante, dolor intenso, fiebre, inflamación excesiva).</li>
</ul>
<h4>7. Declaración de consentimiento</h4>
<p>Declaro que:</p>
<ul>
<li>He recibido información clara, suficiente y comprensible sobre el procedimiento de preservación alveolar, sus objetivos, beneficios, riesgos y alternativas.</li>
<li>He podido realizar las preguntas que consideré necesarias y estas fueron respondidas satisfactoriamente.</li>
<li>Conozco que ningún procedimiento médico u odontológico garantiza un resultado absoluto, y que pueden presentarse complicaciones a pesar de una correcta técnica.</li>
<li>He informado al odontólogo tratante sobre mis antecedentes médicos, alergias y medicación actual de forma veraz y completa.</li>
<li>Autorizo al odontólogo tratante y su equipo a realizar el procedimiento descrito, así como los actos complementarios que, a su juicio profesional, sean necesarios durante la intervención.</li>
<li>Entiendo que puedo revocar este consentimiento en cualquier momento antes del procedimiento, sin que ello afecte mi atención posterior.</li>
</ul>
<p>En constancia de lo anterior, firmo el presente documento de forma libre y voluntaria.</p>
`.trim()
    }
];

// Poblar plantillas_documento solo si esta vacia (primera vez)
function sembrarPlantillas(db) {
    const total = db.prepare('SELECT COUNT(*) AS total FROM plantillas_documento').get().total;
    if (total > 0) return;

    const insertar = db.prepare(
        'INSERT INTO plantillas_documento (nombre, tipo, procedimiento_asociado, contenido, activo) VALUES (?, ?, ?, ?, 1)'
    );
    const transaccion = db.transaction((plantillas) => {
        for (const p of plantillas) insertar.run(p.nombre, p.tipo, p.procedimiento_asociado, p.contenido);
    });
    transaccion(PLANTILLAS);
    console.log(`Plantillas de consentimiento informado sembradas (${PLANTILLAS.length}, migradas de WD_DOCS)`);
}

module.exports = { sembrarPlantillas };
