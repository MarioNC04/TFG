/**
 * Intérprete local de las frases del profesor.
 *
 * A partir de una transcripción ("Necesito un voluntario para el ejercicio de
 * matemáticas") deduce la asignatura, el tipo de actividad y si la misión es
 * individual o para toda la clase. Es el mismo intérprete que expone el
 * servidor simulado en /api/interpret, de modo que puede sustituirse por un
 * flujo de Node-RED o un servicio de IA sin cambiar el resto del sistema.
 */

const SUBJECTS = {
    matematicas: {
        label: 'Matemáticas',
        words: ['matematicas', 'mates', 'suma', 'sumas', 'resta', 'restas', 'multiplicacion',
            'multiplicaciones', 'division', 'divisiones', 'numeros', 'cuentas', 'geometria', 'fracciones']
    },
    lengua: {
        label: 'Lengua',
        words: ['lengua', 'dictado', 'ortografia', 'gramatica', 'escritura', 'redaccion', 'poesia']
    },
    ingles: { label: 'Inglés', words: ['ingles', 'english'] },
    ciencias: {
        label: 'Ciencias',
        words: ['ciencias', 'naturales', 'sociales', 'science', 'experimento', 'animales', 'plantas']
    },
    musica: { label: 'Música', words: ['musica', 'cancion', 'flauta', 'ritmo'] },
    plastica: { label: 'Plástica', words: ['plastica', 'dibujo', 'dibujar', 'pintar', 'manualidad', 'arte'] },
    educacion_fisica: { label: 'Educación Física', words: ['gimnasia', 'educacion fisica', 'deporte'] }
};

const TYPES = {
    ejercicio: { label: 'Ejercicio', words: ['ejercicio', 'problema', 'operacion', 'cuenta', 'actividad'] },
    lectura: { label: 'Lectura', words: ['leer', 'lectura', 'texto', 'cuento'] },
    pregunta: { label: 'Pregunta', words: ['pregunta', 'responder', 'contestar', 'adivinanza'] },
    pizarra: { label: 'Pizarra', words: ['pizarra', 'salir a la pizarra'] },
    exposicion: { label: 'Exposición', words: ['explicar', 'exponer', 'presentar', 'contar a la clase'] },
    ayuda: { label: 'Ayuda en el aula', words: ['repartir', 'recoger', 'ordenar', 'ayudar', 'borrar'] }
};

const DEFAULT_TYPE = 'ejercicio';
const VOLUNTEER_WORDS = ['voluntario', 'voluntaria', 'voluntarios', 'alguien', 'quien quiere'];
const GROUP_WORDS = ['todos', 'todas', 'toda la clase', 'entre todos', 'equipo', 'equipos', 'grupo', 'grupos'];

function normalize(text) {
    return (text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9ñ\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function containsWord(normalized, word) {
    return new RegExp(`(^| )${word}( |$)`).test(normalized);
}

// Devuelve la clave del catálogo cuya palabra aparece antes en la frase.
function findFirst(normalized, catalog) {
    let best = null;
    for (const [key, entry] of Object.entries(catalog)) {
        for (const word of entry.words) {
            const match = new RegExp(`(^| )${word}( |$)`).exec(normalized);
            if (match && (best === null || match.index < best.index)) {
                best = { key, index: match.index };
            }
        }
    }
    return best ? best.key : null;
}

function subjectLabel(subject) {
    return SUBJECTS[subject] ? SUBJECTS[subject].label : subject;
}

/**
 * Interpreta una frase del profesor.
 * @param {string} transcript Texto reconocido.
 * @param {object} [options]
 * @param {string} [options.subject] Asignatura de la tarjeta del profesor; tiene
 *   prioridad sobre la que se deduzca de la frase.
 * @param {string} [options.defaultSubject] Asignatura si no se puede deducir.
 * @param {string[]} [options.volunteerKeywords] Palabras que indican misión individual.
 */
function parseMission(transcript, options = {}) {
    const normalized = normalize(transcript);
    const volunteerWords = (options.volunteerKeywords || VOLUNTEER_WORDS).map(normalize);

    const isVolunteer = volunteerWords.some((word) => containsWord(normalized, word));
    const isGroup = !isVolunteer && GROUP_WORDS.some((word) => containsWord(normalized, word));

    const subject = options.subject || findFirst(normalized, SUBJECTS) || options.defaultSubject || null;
    const type = findFirst(normalized, TYPES) || DEFAULT_TYPE;
    const modality = isGroup ? 'grupal' : 'individual';

    const typeLabel = TYPES[type].label;
    const title = subject ? `${typeLabel} de ${subjectLabel(subject)}` : typeLabel;

    return {
        isMission: isVolunteer || isGroup,
        title,
        subject,
        type,
        modality,
        transcript: (transcript || '').trim()
    };
}

module.exports = { parseMission, normalize, subjectLabel, SUBJECTS, TYPES };
