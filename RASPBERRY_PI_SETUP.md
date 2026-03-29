# 🍓 Guía de Configuración para Raspberry Pi

Esta guía detalla la configuración específica del sistema de detección de voz en Raspberry Pi para entornos educativos.

## 🔧 Configuración Inicial

### 1. Preparación del Sistema Operativo

```bash
# Instalar Raspberry Pi OS Lite (recomendado para mejor rendimiento)
# Usar Raspberry Pi Imager: https://www.raspberrypi.org/software/

# Después del primer inicio:
sudo apt update && sudo apt upgrade -y
sudo raspi-config
```

En `raspi-config`:
- **Advanced Options** → **Audio** → **Force 3.5mm jack** (si usas altavoz analógico)
- **Interfacing Options** → **SSH** → **Enable** (para acceso remoto)
- **Advanced Options** → **Memory Split** → **16** (liberar RAM)

### 2. Configuración de Audio

#### Habilitar Audio USB
```bash
# Verificar dispositivos detectados
lsusb
arecord -l
aplay -l

# Configurar como dispositivo por defecto
sudo nano ~/.asoundrc
```

Contenido de `.asoundrc`:
```
pcm.!default {
    type asym
    capture.pcm "mic"
    playback.pcm "speaker"
}

pcm.mic {
    type plug
    slave {
        pcm "hw:1,0"  # Ajustar según tu dispositivo USB
    }
}

pcm.speaker {
    type plug
    slave {
        pcm "hw:0,0"  # Audio analógico de RPi
    }
}
```

#### Ajustar Volúmenes
```bash
# Configuración interactiva de volumen
alsamixer

# O configurar directamente:
amixer set PCM 80%      # Volumen de salida
amixer set Mic 70%      # Volumen de micrófono
```

## 🎤 Configuración de Micrófono

### Tipos de Micrófono Recomendados

1. **USB Omnidireccional** - Para aulas pequeñas (< 20 estudiantes)
2. **USB Direccional/Cardioide** - Para aulas medianas (20-35 estudiantes)  
3. **Array de Micrófonos USB** - Para aulas grandes (> 35 estudiantes)

### Test de Calidad de Audio

```bash
# Grabación de test (10 segundos)
arecord -d 10 -f cd test.wav

# Reproducir para verificar calidad
aplay test.wav

# Analizar niveles
sox test.wav -n stat
```

### Optimización para Aula

```bash
# Reducir ruido de fondo
sox input.wav output.wav noisered profile.txt 0.21

# Amplificar voz automáticamente  
sox input.wav output.wav compand 0.3,1 6:-70,-60,-20 -5 -90 0.2
```

## ⚡ Optimización de Rendimiento

### Configuración de CPU

```bash
# Aumentar límite de memoria GPU (liberar RAM para CPU)
sudo nano /boot/config.txt

# Agregar/modificar:
gpu_mem=16
arm_freq=1500        # Overclocking moderado (Pi 4)
over_voltage=2       # Solo si es necesario
```

### Configuración de Swap

```bash
# Configurar swap para procesos pesados
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile

# Modificar:
CONF_SWAPSIZE=512

sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### Optimización de Node.js

```bash
# Variables de entorno para mejor rendimiento
export NODE_OPTIONS="--max-old-space-size=512"
export UV_THREADPOOL_SIZE=4
```

## 🔒 Configuración de Seguridad

### Usuario y Permisos

```bash
# Crear usuario específico para el servicio
sudo adduser voicedetector
sudo usermod -aG audio,dialout voicedetector

# Configurar permisos de directorio
sudo chown -R voicedetector:audio /home/voicedetector/voice-detector
sudo chmod 755 /home/voicedetector/voice-detector
```

### Firewall (si es necesario)

```bash
# Instalar y configurar UFW
sudo apt install ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 3000  # Si usas interfaz web
sudo ufw enable
```

## 🌐 Configuración de Red

### WiFi Automático

```bash
sudo nano /etc/wpa_supplicant/wpa_supplicant.conf

# Agregar configuración:
network={
    ssid="WiFi_Aula"
    psk="contraseña_wifi"
    key_mgmt=WPA-PSK
    priority=1
}

network={
    ssid="WiFi_Escuela"
    psk="contraseña_backup"
    key_mgmt=WPA-PSK
    priority=2
}
```

### IP Estática (opcional)

```bash
sudo nano /etc/dhcpcd.conf

# Agregar al final:
interface wlan0
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=192.168.1.1 8.8.8.8
```

## 📊 Monitoreo del Sistema

### Servicios de Sistema

```bash
# Instalar el detector como servicio
./setup-service.sh

# Comandos de control:
sudo systemctl status voice-detector-classroom
sudo systemctl restart voice-detector-classroom
journalctl -u voice-detector-classroom -f
```

### Monitoreo de Recursos

```bash
# Script de monitoreo simple
cat > monitor.sh << 'EOF'
#!/bin/bash
while true; do
    echo "$(date): CPU: $(vcgencmd measure_temp) | RAM: $(free -h | awk '/^Mem:/ {print $3"/"$2}') | Audio: $(arecord -l | grep -c card)"
    sleep 60
done
EOF

chmod +x monitor.sh
./monitor.sh > system.log &
```

### Logs Rotativos

```bash
# Configurar logrotate
sudo nano /etc/logrotate.d/voice-detector

# Contenido:
/home/pi/Proyecto-TFG/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

## 🔧 Solución de Problemas Comunes

### Problema: No detecta micrófono

```bash
# 1. Verificar conexión USB
lsusb | grep -i audio

# 2. Verificar reconocimiento del sistema
cat /proc/asound/cards

# 3. Recargar módulos de audio
sudo modprobe snd_usb_audio
```

### Problema: Audio distorsionado

```bash
# Verificar configuración de buffer
cat /proc/asound/card1/pcm0c/sub0/hw_params

# Ajustar buffer size en el código:
# audioSettings.bufferSize en config.json
```

### Problema: Alta latencia

```bash
# Reducir buffer de PulseAudio
sudo nano /etc/pulse/daemon.conf

# Modificar:
default-sample-rate = 16000
default-fragments = 2
default-fragment-size-msec = 25
```

### Problema: Consumo excesivo de CPU

```bash
# Verificar procesos
htop

# Limitar frecuencia de procesamiento
# Modificar config.json:
"processingInterval": 3000  # Procesar cada 3 segundos
```

## 📚 Scripts de Mantenimiento

### Backup Automático

```bash
cat > backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
tar -czf "backup_voice_detector_$DATE.tar.gz" \
    config.json logs/ credentials/ .env
echo "Backup creado: backup_voice_detector_$DATE.tar.gz"
EOF

chmod +x backup.sh
```

### Actualización del Sistema

```bash
cat > update.sh << 'EOF'
#!/bin/bash
echo "Actualizando sistema..."
sudo apt update && sudo apt upgrade -y

echo "Actualizando Node.js..."
npm update

echo "Reiniciando servicio..."
sudo systemctl restart voice-detector-classroom

echo "Actualización completada"
EOF

chmod +x update.sh
```

### Diagnóstico Completo

```bash
cat > diagnostico.sh << 'EOF'
#!/bin/bash
echo "=== DIAGNÓSTICO DEL SISTEMA ==="
echo "Fecha: $(date)"
echo

echo "--- Sistema ---"
uname -a
cat /proc/cpuinfo | grep "Model"
vcgencmd measure_temp
free -h

echo
echo "--- Audio ---"
arecord -l
aplay -l

echo
echo "--- Red ---"
ip addr show | grep inet

echo
echo "--- Servicio ---"
systemctl status voice-detector-classroom --no-pager

echo
echo "--- Logs recientes ---"
journalctl -u voice-detector-classroom --since "1 hour ago" --no-pager | tail -10
EOF

chmod +x diagnostico.sh
```

## 🎯 Configuración Específica por Tipo de Aula

### Aula Tradicional (30 estudiantes)

```json
{
  "classroom": {
    "type": "traditional",
    "noiseReduction": true,
    "teacherMicDistance": "medium",
    "ambientNoiseThreshold": 4000,
    "processingInterval": 2000
  }
}
```

### Laboratorio (15 estudiantes)

```json
{
  "classroom": {
    "type": "lab", 
    "noiseReduction": false,
    "teacherMicDistance": "close",
    "ambientNoiseThreshold": 2500,
    "processingInterval": 1500
  }
}
```

### Auditorio (100+ estudiantes)

```json
{
  "classroom": {
    "type": "auditorium",
    "noiseReduction": true,
    "teacherMicDistance": "far", 
    "ambientNoiseThreshold": 6000,
    "processingInterval": 3000,
    "useExternalMicrophone": true
  }
}
```

---

**💡 Esta configuración está optimizada para el rendimiento en Raspberry Pi y la detección confiable de voz en entornos educativos.**