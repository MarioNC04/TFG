# 📋 Guía de Despliegue en Aula Educativa

Esta guía proporciona instrucciones paso a paso para implementar el sistema de detección de voz en un entorno educativo real.

## 🎯 Resumen del Sistema

**Propósito**: Detectar automáticamente cuando un profesor dice "voluntario" en clase y responder con "Hola mundo" por consola, diseñado para funcionar en Raspberry Pi.

**Caso de uso**: Sistema embebido para aulas que monitoriza continuamente y registra interacciones específicas del profesor.

## 📦 Lista de Materiales

### Hardware Requerido
- **Raspberry Pi 4** (2GB RAM mínimo, 4GB recomendado)
- **Tarjeta MicroSD** 32GB Clase 10 o superior
- **Micrófono USB** (direccional recomendado para aulas)
- **Fuente de alimentación** oficial Raspberry Pi (5V/3A)
- **Cable Ethernet** o acceso WiFi confiable
- **Carcasa** para protección del dispositivo

### Hardware Opcional  
- **Altavoz USB** (para respuesta audible)
- **LED indicador** (para estado visual del sistema)
- **Botón de reinicio** (para control manual)

## 🚀 Instalación Rápida

### 1. Preparar Raspberry Pi

```bash
# 1. Grabar Raspberry Pi OS Lite en SD
# Usar Raspberry Pi Imager: https://www.raspberrypi.org/software/

# 2. Habilitar SSH (crear archivo 'ssh' en boot/)
touch /boot/ssh

# 3. Configurar WiFi (opcional, crear wpa_supplicant.conf en boot/)
```

### 2. Instalación Automática

```bash
# Conectar por SSH o terminal local
ssh pi@192.168.1.xxx

# Descargar e instalar proyecto
git clone <repositorio-url>
cd Proyecto-TFG

# Ejecutar instalador automático
chmod +x instalar.sh
./instalar.sh

# Configurar como servicio del sistema  
chmod +x setup-service.sh
./setup-service.sh
```

### 3. Configuración Inicial

```bash
# Copiar configuración base
cp .env.example .env

# Editar configuración según el aula
nano config.json

# Probar funcionamiento
npm run test-mic
npm start
```

## ⚙️ Configuración por Entorno

### 🏫 Aula Estándar (20-30 estudiantes)

**Ubicación del dispositivo**: Escritorio del profesor, cerca del área de exposición

**Configuración recomendada**:
```json
{
  "targetWord": "voluntario",
  "responseMessage": "Hola mundo", 
  "enableVoiceResponse": false,
  "classroom": {
    "noiseReduction": true,
    "teacherMicDistance": "medium",
    "ambientNoiseThreshold": 3500
  },
  "audioSettings": {
    "device": "plughw:1,0",
    "sampleRate": 16000
  }
}
```

### 🔬 Laboratorio (10-15 estudiantes)

**Ubicación del dispositivo**: Mesa central o área de demostración

**Configuración recomendada**:
```json
{
  "targetWord": "voluntario",
  "classroom": {
    "type": "laboratory",
    "noiseReduction": false,
    "teacherMicDistance": "close",
    "ambientNoiseThreshold": 2000
  }
}
```

### 🎭 Auditorio (50+ estudiantes)

**Ubicación del dispositivo**: Junto al sistema de sonido principal

**Configuración recomendada**:
```json
{
  "targetWord": "voluntario", 
  "classroom": {
    "type": "auditorium",
    "noiseReduction": true,
    "teacherMicDistance": "far",
    "ambientNoiseThreshold": 5000,
    "useExternalMicrophone": true
  }
}
```

## 📡 Monitoreo y Mantenimiento

### Dashboard de Estado

Crear un dashboard simple para verificar el estado del sistema:

```bash
# Crear script de estado
cat > status.sh << 'EOF'
#!/bin/bash
clear
echo "🎤 ESTADO DEL DETECT DE VOZ - $(date)"
echo "=================================="
echo

# Estado del servicio
if systemctl is-active --quiet voice-detector-classroom; then
    echo "✅ Servicio: ACTIVO"
else
    echo "❌ Servicio: INACTIVO"
fi

# Uso de recursos
echo "🖥️  CPU: $(vcgencmd measure_temp)"
echo "💾 RAM: $(free -h | awk '/^Mem:/ {print $3"/"$2}')"

# Dispositivos de audio
echo "🎵 Dispositivos de audio:"
arecord -l | grep "card" | head -2

# Últimas detecciones
echo
echo "📝 Últimas 3 activaciones:"
if [ -f logs/detections.json ]; then
    tail -3 logs/detections.json | jq -r '.timestamp + " - " + .keyword'
else
    echo "No hay logs disponibles"
fi

echo
echo "📊 Logs del sistema (últimas 5 líneas):"
journalctl -u voice-detector-classroom -n 5 --no-pager | tail -5
EOF

chmod +x status.sh
```

### Verificación Diaria

```bash
# Script para verificación diaria automática
cat > check-daily.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y-%m-%d)
LOG_FILE="daily-check-$DATE.log"

{
    echo "=== VERIFICACIÓN DIARIA - $DATE ==="
    
    # Verificar servicio
    if systemctl is-active --quiet voice-detector-classroom; then
        echo "✅ Servicio funcionando correctamente"
    else
        echo "❌ PROBLEMA: Servicio no activo"
        systemctl restart voice-detector-classroom
    fi
    
    # Verificar audio
    if arecord -l | grep -q "card"; then
        echo "✅ Dispositivos de audio detectados"
    else
        echo "⚠️ ADVERTENCIA: No se detectan dispositivos de audio"
    fi
    
    # Verificar logs
    DETECTIONS_TODAY=$(journalctl -u voice-detector-classroom --since today | grep -c "detectada" || echo "0")
    echo "📊 Detecciones hoy: $DETECTIONS_TODAY"
    
    # Verificar espacio en disco
    DISK_USAGE=$(df /home | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ $DISK_USAGE -gt 80 ]; then
        echo "⚠️ ADVERTENCIA: Disco casi lleno ($DISK_USAGE%)"
    else
        echo "✅ Espacio en disco: $DISK_USAGE%"
    fi
    
} >> $LOG_FILE

# Enviar por email si hay problemas (opcional)
if grep -q "PROBLEMA\|ADVERTENCIA" $LOG_FILE; then
    echo "Se encontraron problemas en la verificación diaria"
fi
EOF

chmod +x check-daily.sh

# Programar ejecución diaria
(crontab -l 2>/dev/null; echo "0 8 * * * /home/pi/Proyecto-TFG/check-daily.sh") | crontab -
```

## 🔧 Solución de Problemas en Producción

### Problema: Sistema no responde

```bash
# 1. Verificar estado del servicio
sudo systemctl status voice-detector-classroom

# 2. Reiniciar servicio
sudo systemctl restart voice-detector-classroom

# 3. Si persiste, reiniciar sistema
sudo reboot
```

### Problema: No detecta la palabra clave

```bash
# 1. Probar micrófono manualmente
arecord -d 5 test.wav && aplay test.wav

# 2. Verificar configuración
cat config.json | grep -A5 -B5 "targetWord"

# 3. Ver logs en tiempo real
journalctl -u voice-detector-classroom -f
```

### Problema: Falsos positivos

```bash
# Ajustar sensibilidad en config.json:
{
  "classroom": {
    "ambientNoiseThreshold": 4000,  // Aumentar valor
    "noiseReduction": true
  }
}

# Reiniciar servicio
sudo systemctl restart voice-detector-classroom
```

## 📊 Métricas y Reportes

### Reporte Semanal Automático

```bash
cat > weekly-report.sh << 'EOF'
#!/bin/bash
WEEK_START=$(date -d "last monday" +%Y-%m-%d)
WEEK_END=$(date -d "next sunday" +%Y-%m-%d)

echo "📊 REPORTE SEMANAL: $WEEK_START a $WEEK_END"
echo "==========================================="

# Contar detecciones por día
for i in {0..6}; do
    DAY=$(date -d "$WEEK_START +$i days" +%Y-%m-%d)
    COUNT=$(journalctl -u voice-detector-classroom --since "$DAY 00:00:00" --until "$DAY 23:59:59" | grep -c "detectada" || echo "0")
    DAYNAME=$(date -d "$DAY" +%A)
    echo "$DAYNAME ($DAY): $COUNT detecciones"
done

echo
echo "🖥️ Estadísticas del sistema:"
echo "Tiempo activo: $(uptime -p)"
echo "Uso de disco: $(df /home | tail -1 | awk '{print $5}')"
echo "Temperatura promedio: $(vcgencmd measure_temp)"

echo
echo "⚠️ Problemas reportados:"
journalctl -u voice-detector-classroom --since "$WEEK_START" --until "$WEEK_END" | grep -i "error\|warning\|problema" | wc -l
EOF

chmod +x weekly-report.sh

# Programar reporte semanal (lunes a las 9:00)
(crontab -l 2>/dev/null; echo "0 9 * * 1 /home/pi/Proyecto-TFG/weekly-report.sh > weekly-report-$(date +%Y%W).txt") | crontab -
```

## 🔒 Consideraciones de Seguridad y Privacidad

### Configuración de Privacidad

```json
{
  "_privacy": "Configuración de privacidad para entorno educativo",
  
  "privacySettings": {
    "recordFullAudio": false,
    "logOnlyKeywords": true,
    "anonymizeData": true,
    "dataRetentionDays": 30,
    "enableRemoteLogging": false
  },
  
  "compliance": {
    "gdprCompliant": true,
    "educationalUseOnly": true,
    "noPersonalDataCollection": true
  }
}
```

### Backup y Recuperación

```bash
# Script de backup diario
cat > backup-system.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/pi/backups"
DATE=$(date +%Y%m%d)

mkdir -p $BACKUP_DIR

# Backup de configuración
tar -czf "$BACKUP_DIR/config-$DATE.tar.gz" config.json .env

# Backup de logs (solo últimos 7 días)
find logs/ -name "*.json" -mtime -7 | tar -czf "$BACKUP_DIR/logs-$DATE.tar.gz" -T -

# Limpiar backups antiguos (>30 días)
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "✅ Backup completado: $DATE"
EOF

chmod +x backup-system.sh

# Programar backup diario (2:00 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /home/pi/Proyecto-TFG/backup-system.sh") | crontab -
```

## 📞 Contacto y Soporte

### Información del Sistema
- **Versión del software**: 1.0.0
- **Plataforma objetivo**: Raspberry Pi OS
- **Entorno**: Node.js 16+

### Documentación Adicional
- [README.md](README.md) - Información general del proyecto
- [RASPBERRY_PI_SETUP.md](RASPBERRY_PI_SETUP.md) - Configuración detallada de RPi
- Logs del sistema: `journalctl -u voice-detector-classroom`

### Checklist de Instalación Completa

- [ ] Hardware conectado y funcionando
- [ ] Sistema operativo actualizado
- [ ] Node.js y dependencias instaladas
- [ ] Configuración de audio completada
- [ ] Servicio configurado y activo
- [ ] Pruebas de detección exitosas
- [ ] Monitoreo y logs funcionando
- [ ] Backup automático configurado

---

**🎓 Sistema listo para despliegue en entorno educativo con Raspberry Pi.**