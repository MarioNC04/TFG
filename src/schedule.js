/**
 * Horario del aula: qué profesor y qué asignatura tocan en cada franja.
 *
 * Formato (lo devuelve GET /api/schedule):
 *   { classroom: 'aula-1',
 *     slots: [{ days: ['lunes', ...], start: '09:00', end: '10:00',
 *               teacherId: 'prof-ana', subject: 'matematicas' }] }
 */

const DAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

function toMinutes(hhmm) {
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + (m || 0);
}

function dayName(date) {
    return DAYS[date.getDay()];
}

function minutesOf(date) {
    return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function slotKey(slot) {
    return slot ? `${slot.start}-${slot.end}-${slot.teacherId}-${slot.subject}` : null;
}

class Schedule {
    constructor(data = { slots: [] }) {
        this.classroom = data.classroom || null;
        this.slots = (data.slots || []).map((slot) => ({
            ...slot,
            days: slot.days.map((d) => d.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')),
            startMin: toMinutes(slot.start),
            endMin: toMinutes(slot.end)
        }));
    }

    slotsOn(date) {
        const day = dayName(date);
        return this.slots.filter((s) => s.days.includes(day)).sort((a, b) => a.startMin - b.startMin);
    }

    /** Franja en curso, o null si ahora no hay clase. */
    slotAt(date) {
        const now = minutesOf(date);
        return this.slotsOn(date).find((s) => now >= s.startMin && now < s.endMin) || null;
    }

    /** Franja que empieza justo cuando termina `slot` (clases seguidas). */
    following(slot, date) {
        return this.slotsOn(date).find((s) => s.startMin === slot.endMin) || null;
    }

    /** true si hoy hubo clases y ya ha terminado la última. */
    dayFinished(date) {
        const today = this.slotsOn(date);
        return today.length > 0 && minutesOf(date) >= Math.max(...today.map((s) => s.endMin));
    }
}

module.exports = { Schedule, slotKey, dayName };
