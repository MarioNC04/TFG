/**
 * Mensajes de consola para los eventos del aula (Classroom).
 */

const { subjectLabel } = require('./missions/parser');

const modalityLabel = (modality) => (modality === 'grupal' ? 'toda la clase' : 'individual');

function describeEvent(event, { manual = false } = {}) {
    switch (event.kind) {
        case 'rejected':
            return `⛔ ${event.teacher.name}: ${event.reason}`;
        case 'session-start': {
            const { teacher, subject, slot, substitute } = event;
            return `👩‍🏫 Sesión iniciada: ${teacher.name} · ${subjectLabel(subject)} (${slot.start}-${slot.end})${substitute ? ' · sustituye al profesor del horario' : ''}`;
        }
        case 'listening': {
            const hint = manual ? ' Escribe lo que dice el profesor.' : '';
            return `🎤 Escuchando la misión (máx. ${event.minutes} min).${hint}`;
        }
        case 'phrase':
            return event.used ? null : `   · frase descartada: ${event.reason}`;
        case 'mission-ready': {
            const next = event.modality === 'grupal'
                ? 'El profesor pasa su tarjeta al terminar y toda la clase recibe los puntos.'
                : 'Quien salga pasa su tarjeta; el profesor la cierra con la suya.';
            return `🎯 Misión preparada: ${event.title} [${modalityLabel(event.modality)}]. ${next}`;
        }
        case 'student':
            return describeStudent(event);
        case 'confirmed':
            return describeConfirmed(event);
        case 'discarded':
            return `🗑️  Misión descartada${event.title ? ` (${event.title})` : ''}: ${event.reason}`;
        case 'subject-change':
            return `🔄 Cambio de franja: ${event.teacher.name} sigue con ${subjectLabel(event.subject)}`;
        case 'session-end':
            return `👋 Sesión de ${event.teacher.name} cerrada: ${event.reason}`;
        case 'day-end': {
            const { sent, remaining } = event.sync;
            if (event.afterHours) return '📅 Las clases de hoy ya han terminado: no se iniciarán sesiones hasta la próxima franja del horario.';
            const pending = remaining > 0 ? ` Quedan ${remaining} misión/es sin enviar (se enviarán al volver a encenderla).` : '';
            return `🏁 Fin del horario. Todo cerrado${sent ? ` y ${sent} misión/es sincronizadas` : ''}.${pending}\n   Ya se puede apagar la Raspberry Pi con el botón.`;
        }
        case 'error':
            return `❌ ${event.message}`;
        default:
            return null;
    }
}

function describeStudent({ student, status, attempts }) {
    const name = student.name;
    if (status === 'sin-sesion') return `🙋 ${name}: no hay ninguna clase en marcha`;
    if (status === 'sin-actividad') return `🙋 ${name}: no hay ninguna misión en curso`;
    if (status === 'grupal') return `🙋 ${name}: es una misión de toda la clase, no hace falta pasar la tarjeta`;
    const before = attempts.length ? ` (antes: ${attempts.map((s) => s.name).join(', ')}, cuentan como intento)` : '';
    return `🙋 ${name} ha salido${before}`;
}

function describeConfirmed({ mission, results, queued }) {
    const lines = [`✅ Misión cerrada: ${mission.title} [${modalityLabel(mission.modality)}]`];
    if (queued) {
        lines.push('   📦 Sin conexión: se enviará a TecnoCRA al sincronizar (los puntos se darán entonces)');
        return lines.join('\n');
    }
    if (mission.modality === 'grupal') {
        lines.push(`   ⭐ Toda la clase +${results[0] ? results[0].pointsAwarded : 0} puntos (${results.length} alumnos)`);
    } else {
        for (const r of results) {
            const icon = r.outcome === 'completada' ? '⭐' : '🔁';
            const what = r.outcome === 'completada' ? 'la ha completado' : 'lo ha intentado';
            lines.push(`   ${icon} ${r.student.name} ${what}: +${r.pointsAwarded} puntos (total ${r.student.points})`);
        }
    }
    // Un mismo logro conseguido por varios alumnos (misiones grupales) va en una línea.
    const byAchievement = new Map();
    for (const r of results) {
        for (const a of r.newAchievements) {
            if (!byAchievement.has(a.title)) byAchievement.set(a.title, { achievement: a, names: [] });
            byAchievement.get(a.title).names.push(r.student.name);
        }
    }
    for (const { achievement, names } of byAchievement.values()) {
        const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0];
        const verb = names.length > 1 ? 'consiguen' : 'consigue';
        lines.push(`   🏆 ¡${who} ${verb} el logro "${achievement.title}"! (${achievement.description})`);
    }
    return lines.join('\n');
}

module.exports = { describeEvent, modalityLabel };
