/**
 * Intérprete local de las frases del profesor.
 *
 * A partir de una transcripción ("Que salga alguien a la pizarra a corregir
 * el ejercicio") deduce el tipo de actividad, la asignatura y si la misión es
 * individual o para toda la clase. Es el mismo intérprete que expone el
 * servidor simulado en /api/interpret, de modo que puede sustituirse por un
 * flujo de Node-RED o un servicio de IA sin cambiar el resto del sistema.
 *
 * El único dato obligatorio para crear una misión es el tipo (`typeFound`).
 * Si no se dice lo contrario, la misión es individual.
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
    pizarra: { label: 'Pizarra', words: ['pizarra'] },
    ejercicio: {
        label: 'Ejercicio',
        words: ['ejercicio', 'ejercicios', 'problema', 'problemas', 'operacion', 'cuenta', 'actividad',
            'ficha', 'deberes', 'corregir', 'corregimos', 'resolver']
    },
    lectura: { label: 'Lectura', words: ['leer', 'lee', 'leemos', 'lectura', 'texto', 'cuento'] },
    pregunta: { label: 'Pregunta', words: ['pregunta', 'responder', 'responde', 'contestar', 'contesta', 'adivinanza'] },
    exposicion: { label: 'Exposición', words: ['explicar', 'explica', 'exponer', 'presentar', 'contar a la clase'] },
    interpretacion: { label: 'Interpretación', words: ['cantar', 'cantamos', 'tocar', 'bailar'] },
    ayuda: { label: 'Ayuda en el aula', words: ['repartir', 'reparte', 'recoger', 'recoge', 'ordenar', 'ayudar', 'borrar', 'borra'] }
};

const DEFAULT_TYPE = 'ejercicio';
// "Sal", "que salga"... indican que un alumno sale delante de la clase. Si la
// frase no dice otra actividad (leer, contestar...), se entiende que a la pizarra.
const STEP_OUT_WORDS = ['sal', 'salga', 'salir', 'sale', 'salgas'];
// Mismas palabras para el intérprete local y para el del servidor.
const VOLUNTEER_WORDS = ['voluntario', 'voluntaria', 'voluntarios', 'alguien', 'quien quiere', 'quien sale', 'que salga', 'sal'];
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

function countWords(text) {
    const normalized = normalize(text);
    return normalized ? normalized.split(' ').length : 0;
}

/** Recorta la frase a sus primeras `max` palabras. */
function limitWords(text, max) {
    const words = (text || '').trim().split(/\s+/);
    return words.length > max ? words.slice(0, max).join(' ') : (text || '').trim();
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

function missionTitle(type, subject) {
    const typeLabel = TYPES[type] ? TYPES[type].label : type;
    return subject ? `${typeLabel} de ${subjectLabel(subject)}` : typeLabel;
}

/**
 * Interpreta una frase del profesor.
 * @param {string} transcript Texto reconocido.
 * @param {object} [options]
 * @param {string} [options.subject] Asignatura del horario; tiene prioridad
 *   sobre la que se deduzca de la frase.
 * @param {string} [options.defaultSubject] Asignatura si no se puede deducir.
 */
function parseMission(transcript, options = {}) {
    const normalized = normalize(transcript);

    const isVolunteer = VOLUNTEER_WORDS.some((word) => containsWord(normalized, word));
    const isGroup = !isVolunteer && GROUP_WORDS.some((word) => containsWord(normalized, word));

    const subject = options.subject || findFirst(normalized, SUBJECTS) || options.defaultSubject || null;
    const stepsOut = STEP_OUT_WORDS.some((word) => containsWord(normalized, word));
    const foundType = findFirst(normalized, TYPES) || (stepsOut ? 'pizarra' : null);
    const type = foundType || DEFAULT_TYPE;

    return {
        typeFound: foundType !== null,
        isMission: foundType !== null || isVolunteer || isGroup,
        groupFound: isGroup,
        title: missionTitle(type, subject),
        subject,
        type,
        modality: isGroup ? 'grupal' : 'individual',
        transcript: (transcript || '').trim()
    };
}

module.exports = { parseMission, normalize, countWords, limitWords, missionTitle, subjectLabel, SUBJECTS, TYPES };
