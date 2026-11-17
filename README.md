# 🦊 Sistema de Avatar Pervasivo para el Aula

Prototipo del TFG *Sistema de Avatar Pervasivo con Misiones y Logros Adaptativos en Entornos de Aprendizaje Gamificados*.

Una Raspberry Pi en el aula escucha al profesor solo cuando este pasa su **tarjeta NFC**, convierte lo que pide en una **misión** y, cuando el profesor la cierra con su tarjeta, la envía a la API de TecnoCRA (aquí, un servidor local que la simula) y reparte **puntos y logros adaptativos** a los alumnos que han salido. El avatar (el zorro) muestra en un panel web las últimas misiones, el ranking y los últimos logros.

## Flujo en el aula

1. **Horario.** El servidor guarda qué profesor y qué asignatura tocan en cada franja. Fuera del horario el sistema no hace nada.
2. **El profesor pasa su tarjeta en su franja.** Se inicia la sesión de clase y empieza la **escucha activa**.
   - Un profesor que no es el del horario (sustituto) también puede iniciarla; se usa la asignatura de esa franja.
3. **Escucha activa.** Se analizan las frases de entre 3 y 25 palabras hasta saber el **tipo de actividad**: pizarra, ejercicio, lectura, pregunta…
   - Por defecto la misión es **individual**, salvo que se diga que es para toda la clase.
   - Los datos pueden llegar en varias frases.
   - Las frases que no aportan nada se descartan en el acto.
   - Si en 15 minutos no se obtiene el tipo, la misión se descarta.
4. **Los alumnos que salen pasan su tarjeta.** En una misión de toda la clase no hace falta.
5. **El profesor la cierra con su tarjeta.** La misión se envía a TecnoCRA y se reparten los puntos:
   - **individual:** el último alumno que pasó la tarjeta la completa y recibe 10 puntos; los anteriores cuentan como intento y reciben 2;
   - **toda la clase:** todos los alumnos reciben 5 puntos;
   - **sin alumnos:** si no salió nadie, la misión se descarta.
6. **Siguiente misión.** Otra pasada de la tarjeta empieza una nueva misión. Si se pasa mientras todavía escucha, la cancela.
7. **Fin de la franja.** Si la siguiente franja es del mismo profesor, solo cambia la asignatura. Si no, la sesión se cierra hasta que pase la tarjeta el siguiente profesor. Si pasa otro profesor antes, la sesión anterior se cierra.
8. **Fin del horario.** Se cierra todo, se sincroniza la cola sin conexión y se avisa de que ya se puede apagar.

**Qué no se envía a TecnoCRA:** nada que el profesor no haya cerrado con su tarjeta. Las misiones descartadas se anotan solo en `logs/misiones-descartadas.json`, con el motivo y sin las frases.

## Arquitectura

```
Raspberry Pi (main.js)                          Servidor (server/index.js)
┌────────────────────────────────┐  HTTP/JSON  ┌──────────────────────────────┐
│ Lector NFC (USB teclado/PCSC)  │ ──────────▶ │ API simulada de TecnoCRA     │
│ Horario + sesión de clase      │             │  /api/schedule /api/teachers │
│ Escucha activa por frases:     │             │  /api/cards /api/students    │
│  arecord → Vosk (local)        │             │  /api/missions/confirmed     │
│ Intérprete de misiones         │             │  /api/interpret (IA simulada)│
│ Cola sin conexión              │             │ Logros adaptativos           │
│ Registro de misiones descartadas│            │ Panel web del zorro  (/)     │
└────────────────────────────────┘             └──────────────────────────────┘
```

| Fichero o carpeta | Contenido |
|---|---|
| `src/classroom.js` | Lógica del aula: máquina de estados de sesión y misión en curso |
| `src/schedule.js` | Horario: franja actual, franja siguiente y fin del día |
| `src/missions/` | Intérprete de frases (`parser.js`) y cliente del servicio de interpretación (`interpreter.js`) |
| `src/audio/listener.js` | Escucha activa por frases (Vosk, Google o manual) |
| `scripts/vosk_listener.py` | Reconocimiento local con Vosk |
| `src/api/client.js` | Cliente HTTP de la API con cola local si no hay conexión |
| `src/nfc/` | Lector de tarjetas NFC |
| `src/cli.js`, `src/messages.js` | Consola del sistema y sus mensajes |
| `server/` | API simulada, almacén JSON, logros y panel web |
| `test/` | Tests (`npm test`) |

## Instalación

```bash
npm install
```

En la Raspberry Pi 4: `./instalar.sh`, que instala las dependencias de audio, Node.js, Vosk y el modelo en español. Después, `./setup-service.sh` hace que el sistema arranque al encenderla. Detalles, arranque automático y botón de apagado en `RASPBERRY_PI_SETUP.md`.

### Reconocimiento de voz

| `speech.provider` | Funcionamiento |
|---|---|
| `vosk` (por defecto) | Local y sin conexión. `arecord` envía el audio a `scripts/vosk_listener.py`, que devuelve una frase en cada pausa. El audio no sale de la Raspberry ni se guarda |
| `google` | Google Cloud Speech, en fragmentos de `audio.maxRecordSeconds`. Más preciso, pero el audio sale del aula. Credenciales en `credentials/README.md` |
| `manual` | Las frases se escriben en la consola |

Si el proveedor elegido no está disponible (en Windows, sin modelo, sin Python…), se usa el modo manual.

### Lector NFC

- `nfc.mode: "keyboard"` (por defecto): lectores USB que escriben el UID como un teclado. También permite simular tarjetas escribiendo su UID en la consola.
- `nfc.mode: "pcsc"`: lectores PC/SC como el ACR122U. Requiere `npm install nfc-pcsc`.

Para usar tarjetas reales, regístralas desde la consola:

```
registrar profesor 04A1B2C3 Ana matematicas,ciencias
registrar alumno 04D5E6F7 Lucía
```

El horario se cambia con `PUT /api/schedule` o editando `schedule` en `server/seed.json` y borrando `data/db.json`.

## Uso

```bash
npm run server   # terminal 1: API simulada + panel del zorro en http://localhost:3000/
npm start        # terminal 2: sistema del aula
npm run demo     # demo sin hardware: una mañana de clase con un reloj simulado
```

Salida de `npm run demo` (resumida):

```
[09:32] 💳 PROF-ANA
👩‍🏫 Sesión iniciada: Ana · Matemáticas (09:00-10:00)
🎤 Escuchando la misión (máx. 15 min).
[09:32] 🗣️  "Sacad el cuaderno de matemáticas"
   · frase descartada: no indica ninguna actividad
[09:32] 🗣️  "Que salga alguien a la pizarra a corregir el ejercicio"
🎯 Misión preparada: Pizarra de Matemáticas [individual]. Quien salga pasa su tarjeta; el profesor la cierra con la suya.
[09:32] 💳 ALU-001
🙋 Lucía ha salido
[09:32] 💳 ALU-002
🙋 Hugo ha salido (antes: Lucía, cuentan como intento)
[09:32] 💳 PROF-ANA
✅ Misión cerrada: Pizarra de Matemáticas [individual]
   ⭐ Hugo la ha completado: +10 puntos (total 10)
   🔁 Lucía lo ha intentado: +2 puntos (total 2)
   🏆 ¡Hugo consigue el logro "Voluntario Valiente"! (Primera misión como voluntario)
```

En la consola real, sin micrófono, las tarjetas de ejemplo se pasan escribiendo su UID (`PROF-ANA`, `PROF-LUIS`, `PROF-MARTA`, `ALU-001`… `ALU-004`). Mientras se escucha, lo que dice el profesor se escribe tal cual. Solo funciona dentro del horario de `server/seed.json`: de lunes a viernes, de 9:00 a 14:00.

Comandos: `ayuda`, `estado`, `horario [actualizar]`, `misiones`, `alumnos`, `puntos <alumno> <n> [motivo]`, `avatar`, `registrar …`, `tarjetas`, `sincronizar`, `microfono [segundos]`, `salir`.

### Configuración de la sesión (`config.json` → `session`)

| Clave | Por defecto | Significado |
|---|---|---|
| `listenMinutes` | 15 | Minutos máximos de escucha activa |
| `minWords` / `maxWords` | 3 / 25 | Las frases más cortas se descartan; las más largas se analizan solo hasta ese número de palabras |
| `allowSubstitutes` | `true` | Permitir que otro profesor inicie la sesión en una franja que no es suya |
| `requireTimeSync` | `true` | No iniciar sesiones hasta que la hora esté sincronizada por internet |

### Conectar Node-RED o un servicio de IA

`interpreter.url` apunta por defecto a `/api/interpret` del servidor simulado. Se puede sustituir por un flujo de Node-RED (nodo *http in*) o por un servicio de IA. Debe recibir `POST { transcript, subject }` y devolver `{ title, subject, type, modality, typeFound, groupFound }`. Si no responde, se usa el intérprete local.

### Sin conexión

- **Misiones:** si la API no responde al cerrar una misión, se guarda en `logs/pending-missions.json` y se envía al arrancar, con `sincronizar` o al terminar el horario. Cada misión lleva su propio id, así que reenviarla no duplica los puntos.
- **Horario:** se guarda una copia en `logs/horario.json`.

## API simulada

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado |
| GET | `/api/teachers`, `/api/teachers/:id` | Profesores y sus asignaturas |
| GET/PUT | `/api/schedule` | Horario del aula `{ classroom, slots: [{ days, start, end, teacherId, subject }] }` |
| GET/POST | `/api/cards`, GET `/api/cards/:uid` | Tarjetas de profesor y alumno |
| GET | `/api/students`, `/api/students/:id` | Alumnos, puntos y logros |
| POST | `/api/students/:id/rewards` | Puntos del profesor `{ points, reason }` |
| GET | `/api/missions`, `/api/missions/:id` | Misiones registradas |
| POST | `/api/missions/confirmed` | Misión cerrada por el profesor `{ id, title, subject, type, modality, teacherId, completedBy, attempts }` |
| POST | `/api/interpret` | Interpretar frase (simula IA / Node-RED) |
| GET | `/api/avatar` | Estado del zorro: mensaje, últimas misiones, ranking, logros |

Los datos se guardan en `data/db.json`. Bórralo para volver a los datos de ejemplo.

## Logros adaptativos

| Logro | Condición |
|---|---|
| Voluntario Valiente | Primera misión individual |
| Trabajo en Equipo | Primera misión de toda la clase |
| Experto en *asignatura* | 3 misiones de una misma asignatura (se genera para cada asignatura) |
| Racha Imparable | 5 misiones |
| Estrella de la Clase | 100 puntos |

**Puntos:**
- 10 por misión individual completada;
- 5 a cada alumno por misión de toda la clase;
- 2 por intento: el alumno salió pero otro la completó después. Los intentos no cuentan para los logros;
- además, los que asigne el profesor con `puntos`.
