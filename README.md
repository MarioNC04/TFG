# 🦊 Sistema de Avatar Pervasivo para el Aula

Prototipo del TFG *Sistema de Avatar Pervasivo con Misiones y Logros Adaptativos en Entornos de Aprendizaje Gamificados*.

Una Raspberry Pi en el aula escucha al profesor, convierte lo que pide en **misiones**, las guarda en la API de TecnoCRA (aquí, un servidor local que la simula) y, cuando un alumno pasa su **tarjeta NFC**, le da puntos y **logros adaptativos**. El avatar (el zorro) muestra en un panel web las misiones abiertas, el ranking y los últimos logros.

## Flujo en el aula

1. El profesor pasa **su tarjeta**, que indica la asignatura (p. ej. Matemáticas).
2. Dice la actividad: *"Necesito un voluntario para el ejercicio de la pizarra"*.
3. El sistema interpreta la frase (nombre, tipo, individual o para toda la clase) y **guarda la misión sin avisar a nadie**.
4. El alumno que la realiza pasa **su tarjeta**: se le asigna la misión, recibe puntos y, si corresponde, un logro (*Voluntario Valiente*, *Experto en Matemáticas*…).
5. El profesor puede dar puntos extra o cerrar las misiones de toda la clase.

También existe una escucha libre (`escuchar`): si el profesor pide un voluntario sin pasar la tarjeta, se crea la misión con la asignatura activa.

## Arquitectura

```
Raspberry Pi (main.js)                         Servidor (server/index.js)
┌───────────────────────────────┐   HTTP/JSON  ┌──────────────────────────────┐
│ Micrófono → arecord           │ ───────────▶ │ API simulada de TecnoCRA     │
│ Google Speech (Speech to Text)│              │  /api/cards  /api/missions   │
│ Lector NFC (USB teclado/PCSC) │              │  /api/students /api/avatar   │
│ Classroom (lógica del aula)   │              │  /api/interpret (IA simulada)│
│ Cola sin conexión             │              │ Logros adaptativos           │
└───────────────────────────────┘              │ Panel web del zorro  (/)     │
                                               └──────────────────────────────┘
```

| Carpeta | Contenido |
|---|---|
| `src/missions/` | Intérprete de frases (`parser.js`) y cliente del servicio de interpretación (`interpreter.js`) |
| `src/api/` | Cliente HTTP de la API con cola local si no hay conexión |
| `src/audio/` | Grabación (`arecord`/`parecord`), reconocimiento (Google Speech) y voz (`espeak`) |
| `src/nfc/` | Lector de tarjetas NFC |
| `src/classroom.js` | Lógica del aula (tarjeta → voz → misión → alumno → logro) |
| `src/cli.js` | Consola del sistema |
| `server/` | API simulada, almacén JSON, logros y panel web |
| `test/` | Tests (`npm test`) |

## Instalación

```bash
npm install
```

En la Raspberry Pi: `sudo apt install -y alsa-utils espeak` (o ejecuta `./instalar.sh`). Node.js 18 o superior.

### Reconocimiento de voz

Con `speech.provider: "google"` se usa Google Cloud Speech. Credenciales: un fichero de cuenta de servicio en `credentials/google-cloud-key.json` o `gcloud auth application-default login` (ver `credentials/README.md`). Si no está disponible, o en Windows (sin captura de audio), el sistema pide la frase por teclado.

### Lector NFC

- `nfc.mode: "keyboard"` (por defecto): lectores USB que escriben el UID como un teclado. También permite simular tarjetas escribiendo su UID en la consola.
- `nfc.mode: "pcsc"`: lectores PC/SC como el ACR122U. Requiere `npm install nfc-pcsc`.

Para usar tarjetas reales, regístralas desde la consola:

```
registrar profesor 04A1B2C3 matematicas
registrar alumno 04D5E6F7 Lucía
```

## Uso

```bash
npm run server   # terminal 1: API simulada + panel del zorro en http://localhost:3000/
npm start        # terminal 2: sistema del aula
```

Demo sin hardware (tarjetas de ejemplo de `server/seed.json`):

```
aula> PROF-MATES
Escribe lo que ha dicho el profesor: necesito un voluntario para el ejercicio de la pizarra
🎯 Misión guardada: Pizarra de Matemáticas [voluntario] (pending)
aula> ALU-001
✅ Lucía ha realizado "Pizarra de Matemáticas" (+10 puntos, total 10)
🏆 ¡Lucía consigue el logro "Voluntario Valiente"! (Primera misión como voluntario)
```

Comandos: `ayuda`, `escuchar`, `misiones`, `alumnos`, `puntos <alumno> <n> [motivo]`, `cerrar [id]`, `avatar`, `registrar …`, `tarjetas`, `sincronizar`, `microfono`, `estado`, `salir`.

### Conectar Node-RED o un servicio de IA

`interpreter.url` apunta por defecto a `/api/interpret` del servidor simulado. Puede sustituirse por un flujo de Node-RED (nodo *http in*) o un servicio de IA que reciba `POST { transcript, subject }` y devuelva `{ title, subject, type, modality, isMission }`. Si no responde, se usa el intérprete local.

### Sin conexión

Si la API no responde al crear una misión, se guarda en `logs/pending-missions.json` y se envía al arrancar o con `sincronizar`.

## API simulada

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado |
| GET/POST | `/api/cards`, GET `/api/cards/:uid` | Tarjetas de profesor y alumno |
| GET | `/api/students`, `/api/students/:id` | Alumnos, puntos y logros |
| POST | `/api/students/:id/rewards` | Puntos del profesor `{ points, reason }` |
| GET/POST | `/api/missions` (`?status=pending`) | Misiones |
| POST | `/api/missions/:id/complete` | Alumno realiza la misión `{ studentId }` |
| POST | `/api/missions/:id/close` | Cerrar misión grupal |
| POST | `/api/interpret` | Interpretar frase (simula IA / Node-RED) |
| GET | `/api/avatar` | Estado del zorro: mensaje, misiones, ranking, logros |

Los datos se guardan en `data/db.json` (bórralo para volver a los datos de ejemplo).

## Logros adaptativos

| Logro | Condición |
|---|---|
| Voluntario Valiente | Primera misión individual |
| Trabajo en Equipo | Primera misión de toda la clase |
| Experto en *asignatura* | 3 misiones de una misma asignatura (se genera para cada asignatura) |
| Racha Imparable | 5 misiones |
| Estrella de la Clase | 100 puntos |

Puntos: 10 por misión individual, 5 por misión grupal, más los que asigne el profesor.

## Servicio en la Raspberry Pi

`./setup-service.sh` instala el sistema como servicio de systemd. Más detalles en `RASPBERRY_PI_SETUP.md` y `DEPLOYMENT_GUIDE.md`.
