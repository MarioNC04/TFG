/**
 * Logros adaptativos.
 *
 * Los logros no son una lista fija: se calculan a partir del historial de
 * cada alumno, y los de asignatura se generan para cualquier asignatura en la
 * que el alumno complete misiones. Así se adaptan a lo que ocurre en el aula.
 */

const { subjectLabel } = require('../src/missions/parser');

const SUBJECT_EXPERT_THRESHOLD = 3;
const STREAK_THRESHOLD = 5;
const STAR_POINTS = 100;

/**
 * Catálogo para el panel: qué logros hay y cómo se consiguen. Los textos usan
 * las mismas constantes que evaluateAchievements, así no se desincronizan.
 */
const CATALOG = [
    { id: 'voluntario-valiente', icon: '🙋', title: 'Voluntario Valiente', howTo: 'Completar tu primera misión individual: salir, hacerla y ser el último en pasar la tarjeta antes de que el profesor la cierre.' },
    { id: 'trabajo-en-equipo', icon: '🤝', title: 'Trabajo en Equipo', howTo: 'Participar en tu primera misión de toda la clase.' },
    { id: 'experto', icon: '🎓', title: 'Experto en…', howTo: `Completar ${SUBJECT_EXPERT_THRESHOLD} misiones de una misma asignatura. Hay uno por cada asignatura: Experto en Matemáticas, en Lengua…` },
    { id: 'racha-imparable', icon: '🔥', title: 'Racha Imparable', howTo: `Completar ${STREAK_THRESHOLD} misiones en total.` },
    { id: 'estrella-de-clase', icon: '⭐', title: 'Estrella de la Clase', howTo: `Llegar a ${STAR_POINTS} puntos.` }
];

function evaluateAchievements(student, completedMissions) {
    const earned = [];
    const individual = completedMissions.filter((m) => m.modality === 'individual');
    const group = completedMissions.filter((m) => m.modality === 'grupal');

    if (individual.length >= 1) {
        earned.push({ id: 'voluntario-valiente', title: 'Voluntario Valiente', description: 'Primera misión como voluntario' });
    }
    if (group.length >= 1) {
        earned.push({ id: 'trabajo-en-equipo', title: 'Trabajo en Equipo', description: 'Primera misión de toda la clase' });
    }
    if (completedMissions.length >= STREAK_THRESHOLD) {
        earned.push({ id: 'racha-imparable', title: 'Racha Imparable', description: `${STREAK_THRESHOLD} misiones completadas` });
    }
    if (student.points >= STAR_POINTS) {
        earned.push({ id: 'estrella-de-clase', title: 'Estrella de la Clase', description: `${STAR_POINTS} puntos acumulados` });
    }

    const bySubject = {};
    for (const mission of completedMissions) {
        if (mission.subject) bySubject[mission.subject] = (bySubject[mission.subject] || 0) + 1;
    }
    for (const [subject, count] of Object.entries(bySubject)) {
        if (count >= SUBJECT_EXPERT_THRESHOLD) {
            earned.push({
                id: `experto-${subject}`,
                title: `Experto en ${subjectLabel(subject)}`,
                description: `${SUBJECT_EXPERT_THRESHOLD} misiones de ${subjectLabel(subject)}`
            });
        }
    }

    return earned;
}

module.exports = { evaluateAchievements, CATALOG };
