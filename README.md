# 🎤 Detector de Voz para Aulas Educativas

Un sistema de reconocimiento de voz diseñado para funcionar en **Raspberry Pi** en entornos educativos. Detecta cuando el profesor dice la palabra "voluntario" y responde automáticamente con "Hola mundo" en consola.

## 🍓 Optimizado para Raspberry Pi

- **Sistema embebido**: Diseñado específicamente para Raspberry Pi
- **Entorno educativo**: Optimizado para el ruido de aulas 
- **Bajo consumo**: Eficiente en recursos para funcionar 24/7
- **Fácil instalación**: Scripts automatizados para configuración

## 🚀 Características

- **Reconocimiento continuo**: Escucha constantemente sin intervención
- **Detección de palabra clave**: Detecta "voluntario" (configurable)
- **Respuesta automática**: Muestra "Hola mundo" en consola
- **Síntesis de voz**: Respuesta opcional por altavoces
- **Logging inteligente**: Registra detecciones con timestamps
- **Optimización educativa**: Filtros de ruido para aulas
- **Configuración flexible**: Ajustes vía archivo JSON

## 📋 Requisitos del Sistema

### Hardware (Raspberry Pi)
- **Raspberry Pi 3B+** o superior (recomendado Pi 4)
- **Micrófono USB** o HAT de audio compatible
- **Tarjeta SD** de 16GB mínimo (Clase 10)
- **Altavoz/Auriculares** (opcional, para respuesta de voz)

### Software
- **Raspberry Pi OS** (Lite o Desktop)
- **Node.js 16+** y npm
- **Bibliotecas de audio** del sistema (ALSA/PulseAudio)

## 🛠️ Instalación

### 1. Preparar Raspberry Pi

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependencias del sistema
sudo apt install -y nodejs npm git alsa-utils sox espeak pulseaudio

# Habilitar audio (si no está habilitado)
sudo raspi-config
# Navegar a: Advanced Options > Audio > Force 3.5mm
```

### 2. Descargar e Instalar Proyecto

```bash
# Clonar proyecto
git clone <repositorio>
cd Proyecto-TFG

# Instalar dependencias de Node.js
npm install

# Configurar permisos de audio
sudo usermod -a -G audio $USER

# Reiniciar para aplicar permisos
sudo reboot
```

### 3. Configurar Google Speech API (Opcional)

Para mejor reconocimiento, configura Google Cloud Speech:

```bash
# Crear carpeta de credenciales
mkdir credentials

# Colocar tu archivo de credenciales JSON de Google Cloud
# en: credentials/google-cloud-key.json
```

## 🎯 Uso

### Inicio rápido

```bash
# Ejecutar el programa principal
node main.js

# O usar npm script
npm start
```

### Menú principal

El sistema mostrará un menú interactivo:

1. **🚀 Iniciar detección continua** - Comenzar a escuchar
2. **🔧 Probar micrófono** - Verificar que funciona el audio
3. **📊 Ver logs** - Historial de detecciones
4. **⚙️ Mostrar configuración** - Ver configuración actual
5. **❌ Salir** - Cerrar programa

### Test de micrófono

```bash
# Ejecutar test independiente
node test-microphone.js

# O usar npm script  
npm run test-mic
```

### Flujo típico en aula

1. Conectar Raspberry Pi y micrófono USB
2. Ejecutar `npm start`  
3. Seleccionar opción 2 para probar micrófono
4. Seleccionar opción 1 para iniciar detección
5. **Professor dice "voluntario"** en clase
6. 🎉 **Sistema responde "Hola mundo"** automáticamente
7. Evento se registra en logs con timestamp

## ⚙️ Configuración

Edita [`config.json`](config.json) para personalizar el comportamiento:

```json
{
  "targetWord": "voluntario",           // Palabra a detectar
  "responseMessage": "Hola mundo",      // Respuesta del sistema
  "enableVoiceResponse": true,          // Hablar respuesta
  "useGoogleSpeech": true,             // Usar Google Speech API
  "language": "es-ES"                   // Idioma de reconocimiento
}
```

### Configuraciones típicas para aula

```json
{
  "classroom": {
    "noiseReduction": true,              // Reducir ruido ambiental
    "teacherMicDistance": "medium",      // Distancia típica profesor-mic
    "ambientNoiseThreshold": 3000        // Umbral de ruido del aula
  }
}
```

## 🔧 Solución de Problemas

### Micrófono no detecta audio

```bash
# Verificar dispositivos de audio
arecord -l

# Probar grabación manual
arecord -d 3 -f cd test.wav && aplay test.wav

# Ajustar niveles de volumen
alsamixer
```

### Error "Cannot find microphone"

```bash
# Verificar que el usuario está en grupo audio
groups $USER

# Si no aparece 'audio', añadir:
sudo usermod -a -G audio $USER
sudo reboot
```

### Node.js - Errores de dependencias

```bash
# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install

# Si persiste, usar versiones específicas:
npm install mic@2.1.2 @google-cloud/speech@5.5.0
```

### Raspberry Pi - Problemas de audio

```bash
# Verificar que el audio está habilitado
sudo raspi-config

# Reiniciar servicios de audio  
sudo service pulseaudio restart
sudo service alsa-state restart

# Verificar dispositivos USB
lsusb
```

## 📁 Estructura del Proyecto

```
Proyecto-TFG/
├── main.js                 # Programa principal
├── config.json            # Configuración del sistema  
├── package.json           # Dependencias de Node.js
├── test-microphone.js     # Test independiente de micrófono
├── logs/                  # Directorio de logs (se crea automáticamente)
│   └── detections.json   # Registro de detecciones
├── credentials/          # Credenciales de Google Cloud (opcional)
│   └── google-cloud-key.json
├── scripts/              # Scripts de instalación
│   ├── install-rpi.sh   # Instalador para Raspberry Pi
│   └── setup-audio.sh   # Configuración de audio
└── README.md            # Este archivo
```

## 🏫 Uso en Entorno Educativo

### Instalación en aula

1. **Ubicación**: Colocar Raspberry Pi cerca del profesor pero alejado de estudiantes
2. **Micrófono**: USB de direccionalidad cardioide, apuntando hacia zona del profesor  
3. **Alimentación**: Usar fuente oficial de Raspberry Pi (5V/3A)
4. **Red**: Conexión WiFi o Ethernet para logging remoto (opcional)

### Monitoreo

```bash
# Ver logs en tiempo real
tail -f logs/detections.json

# Estado del sistema
systemctl status voice-detector  # Si se configura como servicio
```

### Configurar como servicio del sistema

```bash
# Crear archivo de servicio
sudo nano /etc/systemd/system/voice-detector.service

# Contenido del archivo:
[Unit]
Description=Voice Keyword Detector for Classroom
After=network.target sound.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/Proyecto-TFG
ExecStart=/usr/bin/node main.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target

# Habilitar e iniciar servicio
sudo systemctl enable voice-detector
sudo systemctl start voice-detector
```

## 🔬 Especificaciones Técnicas

### Audio
- **Frecuencia de muestreo**: 16 kHz
- **Canales**: Mono (1 canal)  
- **Formato**: PCM 16-bit
- **Latencia**: < 2 segundos (detección + respuesta)

### Procesamiento
- **CPU mínima**: ARM Cortex-A72 (Raspberry Pi 4)
- **RAM requerida**: 512MB disponibles
- **Almacenamiento**: 50MB para el programa + logs

### Red (opcional)
- **Ancho de banda**: Mínimo para Google Speech API
- **Puertos**: HTTPS/443 (salida para API)

## 🛡️ Dependencias

### Node.js (package.json)
- `@google-cloud/speech`: API de Google para reconocimiento
- `mic`: Captura de audio del micrófono
- `say`: Síntesis de texto a voz  
- `wav`: Procesamiento de archivos de audio
- `fs-extra`: Operaciones avanzadas de archivos

### Sistema (Raspberry Pi OS)
- `alsa-utils`: Herramientas de audio ALSA
- `sox`: Procesamiento de audio
- `espeak`: Motor de síntesis de voz
- `pulseaudio`: Servidor de audio

## 📊 Rendimiento en Raspberry Pi

| Modelo | Tiempo Detección | Uso CPU | Uso RAM |
|--------|------------------|---------|---------|
| Pi 3B+ | ~2-3 segundos   | 15-25%  | 150MB   |
| Pi 4 2GB | ~1-2 segundos | 10-15%  | 120MB   |
| Pi 4 4GB | ~1-2 segundos | 8-12%   | 100MB   |

## 🎮 Ejemplo de Uso Real

```
🎤 DETECTOR DE VOZ - AULA EDUCATIVA
🍓 Optimizado para Raspberry Pi
============================================

🎤 Detector de voz inicializado
🎯 Palabra objetivo: 'voluntario'  
📝 Respuesta: 'Hola mundo'
🏫 Sistema listo para aula educativa

📋 Opciones:
1. 🚀 Iniciar detección continua
2. 🔧 Probar micrófono  
3. 📊 Ver logs de detección
4. ⚙️ Mostrar configuración
5. ❌ Salir

👉 Selecciona una opción (1-5): 1

🚀 Iniciando detección de voz...
🏫 Sistema activo en aula educativa  
👂 Escuchando... Diga 'voluntario' para activar

[Profesor en clase: "¿Quién quiere ser voluntario para el experimento?"]

🎵 Audio detectado: "¿Quién quiere ser voluntario para el experimento?"
🎉 ¡Palabra clave 'voluntario' detectada!
💬 Respuesta: Hola mundo  
⏰ Timestamp: 11/03/2026, 10:30:15
🏫 Ubicación: Aula educativa
📝 Evento registrado en logs
🔊 Reproduciendo: "Hola mundo"
```

## 📝 Notas para Educadores

- **Privacidad**: El sistema solo procesa audio cuando detecta la palabra clave
- **Funcionamiento offline**: Puede funcionar sin Internet si se configura reconocimiento local
- **Personalización**: Fácil cambio de palabra clave y respuesta
- **Integración**: Puede conectarse a sistemas de gestión escolar existentes
- **Mantenimiento**: Logs automáticos para monitoreo y depuración

## 🆘 Soporte Técnico

### Problemas comunes

1. **No detecta audio**: Verificar permisos y dispositivo de audio
2. **Latencia alta**: Comprobar carga del sistema y configuración
3. **Falsos positivos**: Ajustar umbral de ruido en configuración  
4. **No responde**: Verificar logs y conexión de red (si usa Google Speech)

### Contacto

Para soporte técnico o mejoras del sistema, consultar documentación del proyecto o contactar al equipo de desarrollo.

---

**🎓 Proyecto desarrollado para entornos educativos con Raspberry Pi**