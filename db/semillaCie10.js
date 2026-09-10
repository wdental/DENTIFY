// =====================================================================
// Catalogo CIE-10 odontologico precargado (seed), para el buscador de la
// seccion N (Diagnostico) del Formulario 033. Cubre K00-K14 completos con
// sus subcodigos mas frecuentes en la practica odontologica, mas S02.5
// (fractura dental) y Z01.2 (examen dental).
// =====================================================================
module.exports = [
    // K00 - Trastornos del desarrollo y erupcion de los dientes
    { codigo: 'K00.0', descripcion: 'Anodoncia' },
    { codigo: 'K00.1', descripcion: 'Dientes supernumerarios' },
    { codigo: 'K00.2', descripcion: 'Anomalías del tamaño y la forma de los dientes' },
    { codigo: 'K00.3', descripcion: 'Moteado dental (fluorosis dental)' },
    { codigo: 'K00.4', descripcion: 'Trastornos de la formación dental' },
    { codigo: 'K00.5', descripcion: 'Trastornos hereditarios de la estructura dental, no clasificados en otra parte' },
    { codigo: 'K00.6', descripcion: 'Trastornos de la erupción dentaria' },
    { codigo: 'K00.7', descripcion: 'Síndrome de la erupción dental' },
    { codigo: 'K00.8', descripcion: 'Otros trastornos del desarrollo dentario' },
    { codigo: 'K00.9', descripcion: 'Trastorno del desarrollo dentario, no especificado' },

    // K01 - Dientes incluidos e impactados
    { codigo: 'K01.0', descripcion: 'Dientes incluidos' },
    { codigo: 'K01.1', descripcion: 'Diente impactado' },

    // K02 - Caries dental
    { codigo: 'K02.0', descripcion: 'Caries limitada al esmalte' },
    { codigo: 'K02.1', descripcion: 'Caries de la dentina' },
    { codigo: 'K02.2', descripcion: 'Caries del cemento' },
    { codigo: 'K02.3', descripcion: 'Caries dental detenida' },
    { codigo: 'K02.4', descripcion: 'Odontoclasia' },
    { codigo: 'K02.8', descripcion: 'Otras caries dentales' },
    { codigo: 'K02.9', descripcion: 'Caries dental, no especificada' },

    // K03 - Otras enfermedades de los tejidos duros de los dientes
    { codigo: 'K03.0', descripcion: 'Atrición excesiva' },
    { codigo: 'K03.1', descripcion: 'Abrasión dentaria' },
    { codigo: 'K03.2', descripcion: 'Erosión dentaria' },
    { codigo: 'K03.3', descripcion: 'Reabsorción patológica de los dientes' },
    { codigo: 'K03.4', descripcion: 'Hipercementosis' },
    { codigo: 'K03.5', descripcion: 'Anquilosis dental' },
    { codigo: 'K03.6', descripcion: 'Depósitos [acreciones] en los dientes' },
    { codigo: 'K03.7', descripcion: 'Cambios de color posteruptivos de los tejidos dentales duros' },
    { codigo: 'K03.8', descripcion: 'Otras enfermedades especificadas de los tejidos duros de los dientes' },
    { codigo: 'K03.9', descripcion: 'Enfermedad no especificada de los tejidos duros de los dientes' },

    // K04 - Enfermedades de la pulpa y de los tejidos periapicales
    { codigo: 'K04.0', descripcion: 'Pulpitis' },
    { codigo: 'K04.1', descripcion: 'Necrosis de la pulpa' },
    { codigo: 'K04.2', descripcion: 'Degeneración de la pulpa' },
    { codigo: 'K04.3', descripcion: 'Formación anormal de tejido duro en la pulpa' },
    { codigo: 'K04.4', descripcion: 'Periodontitis apical aguda originada en la pulpa' },
    { codigo: 'K04.5', descripcion: 'Periodontitis apical crónica' },
    { codigo: 'K04.6', descripcion: 'Absceso periapical con fístula' },
    { codigo: 'K04.7', descripcion: 'Absceso periapical sin fístula' },
    { codigo: 'K04.8', descripcion: 'Quiste radicular' },
    { codigo: 'K04.9', descripcion: 'Otras enfermedades y las no especificadas de la pulpa y de los tejidos periapicales' },

    // K05 - Gingivitis y enfermedades periodontales
    { codigo: 'K05.0', descripcion: 'Gingivitis aguda' },
    { codigo: 'K05.1', descripcion: 'Gingivitis crónica' },
    { codigo: 'K05.2', descripcion: 'Periodontitis aguda' },
    { codigo: 'K05.3', descripcion: 'Periodontitis crónica' },
    { codigo: 'K05.4', descripcion: 'Periodontosis' },
    { codigo: 'K05.5', descripcion: 'Otras enfermedades periodontales' },
    { codigo: 'K05.6', descripcion: 'Enfermedad periodontal, no especificada' },

    // K06 - Otros trastornos de la encía y del reborde alveolar edéntulo
    { codigo: 'K06.0', descripcion: 'Retracción gingival' },
    { codigo: 'K06.1', descripcion: 'Hiperplasia gingival' },
    { codigo: 'K06.2', descripcion: 'Lesiones de la encía y del reborde alveolar edéntulo asociadas con traumatismos' },
    { codigo: 'K06.8', descripcion: 'Otros trastornos especificados de la encía y del reborde alveolar edéntulo' },
    { codigo: 'K06.9', descripcion: 'Trastorno de la encía y del reborde alveolar edéntulo, no especificado' },

    // K07 - Anomalías dentofaciales [incluso maloclusión]
    { codigo: 'K07.0', descripcion: 'Anomalías importantes del tamaño maxilar' },
    { codigo: 'K07.1', descripcion: 'Anomalías de la relación maxilobasilar' },
    { codigo: 'K07.20', descripcion: 'Maloclusión Clase I de Angle' },
    { codigo: 'K07.21', descripcion: 'Maloclusión Clase II de Angle' },
    { codigo: 'K07.22', descripcion: 'Maloclusión Clase III de Angle' },
    { codigo: 'K07.3', descripcion: 'Anomalías de la posición del diente' },
    { codigo: 'K07.4', descripcion: 'Maloclusión, no especificada' },
    { codigo: 'K07.5', descripcion: 'Anomalías dentofaciales funcionales' },
    { codigo: 'K07.6', descripcion: 'Trastornos de la articulación temporomandibular' },
    { codigo: 'K07.8', descripcion: 'Otras anomalías dentofaciales' },
    { codigo: 'K07.9', descripcion: 'Anomalía dentofacial, no especificada' },

    // K08 - Otros trastornos de los dientes y de sus estructuras de sosten
    { codigo: 'K08.0', descripcion: 'Exfoliación de los dientes debida a causas sistémicas' },
    { codigo: 'K08.1', descripcion: 'Pérdida de dientes debida a accidente, extracción o enfermedad periodontal local' },
    { codigo: 'K08.2', descripcion: 'Atrofia del reborde alveolar edéntulo' },
    { codigo: 'K08.3', descripcion: 'Raíz dental retenida' },
    { codigo: 'K08.8', descripcion: 'Otros trastornos especificados de los dientes y de sus estructuras de sostén' },
    { codigo: 'K08.9', descripcion: 'Trastorno no especificado de los dientes y de sus estructuras de sostén' },

    // K12 - Estomatitis y lesiones afines
    { codigo: 'K12.0', descripcion: 'Aftas orales recurrentes' },
    { codigo: 'K12.1', descripcion: 'Otras formas de estomatitis' },
    { codigo: 'K12.2', descripcion: 'Celulitis y absceso de la boca' },
    { codigo: 'K12.3', descripcion: 'Mucositis oral (ulcerativa)' },

    // K13 - Otras enfermedades del labio y de la mucosa oral
    { codigo: 'K13.0', descripcion: 'Enfermedades de los labios' },
    { codigo: 'K13.1', descripcion: 'Mordedura del carrillo y del labio' },
    { codigo: 'K13.2', descripcion: 'Leucoplasia y otras alteraciones del epitelio bucal, incluso de la lengua' },
    { codigo: 'K13.3', descripcion: 'Leucoplasia vellosa' },
    { codigo: 'K13.4', descripcion: 'Granuloma y lesiones tipo granuloma de la mucosa oral' },
    { codigo: 'K13.5', descripcion: 'Fibrosis submucosa oral' },
    { codigo: 'K13.6', descripcion: 'Hiperplasia de la mucosa oral debida a irritación' },
    { codigo: 'K13.7', descripcion: 'Otras lesiones y las no especificadas de la mucosa oral' },

    // K14 - Enfermedades de la lengua
    { codigo: 'K14.0', descripcion: 'Glositis' },
    { codigo: 'K14.1', descripcion: 'Lengua geográfica' },
    { codigo: 'K14.2', descripcion: 'Glositis romboidal media' },
    { codigo: 'K14.3', descripcion: 'Hipertrofia de las papilas linguales' },
    { codigo: 'K14.4', descripcion: 'Atrofia de las papilas linguales' },
    { codigo: 'K14.5', descripcion: 'Lengua fisurada' },
    { codigo: 'K14.6', descripcion: 'Glosodinia' },
    { codigo: 'K14.8', descripcion: 'Otras enfermedades de la lengua' },
    { codigo: 'K14.9', descripcion: 'Enfermedad de la lengua, no especificada' },

    // Adicionales frecuentes fuera de K00-K14
    { codigo: 'S02.5', descripcion: 'Fractura de diente' },
    { codigo: 'Z01.2', descripcion: 'Examen dental' }
];
