#!/bin/bash

# setup-service.sh - Configurar el detector de voz como servicio del sistema

echo "🔧 Configurando Detector de Voz como servicio del sistema..."

# Verificar que se ejecuta como usuario normal (no root)
if [ "$EUID" -eq 0 ]; then
    echo "❌ No ejecutes este script como root/sudo"
    echo "💡 Ejecuta: ./setup-service.sh"
    exit 1
fi

# Obtener rutas
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_NAME="$(whoami)"
SERVICE_NAME="voice-detector-classroom"

echo "📁 Directorio del proyecto: $SCRIPT_DIR"
echo "👤 Usuario: $USER_NAME"

# Crear archivo de servicio
sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null << EOF
[Unit]
Description=Voice Keyword Detector for Classroom (Raspberry Pi)
Documentation=https://github.com/your-repo/voice-detector
After=network.target sound.target
Wants=network.target

[Service]
Type=simple
User=$USER_NAME
Group=audio
WorkingDirectory=$SCRIPT_DIR
ExecStart=/usr/bin/node main.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=voice-detector

# Variables de entorno
Environment=NODE_ENV=production
Environment=NPM_CONFIG_PREFIX=/home/$USER_NAME/.npm-global

# Configuración de recursos
LimitNOFILE=65536
MemoryLimit=256M

# Configuración de seguridad
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=false
ReadWritePaths=$SCRIPT_DIR/logs
PrivateDevices=false
SupplementaryGroups=audio

[Install]
WantedBy=multi-user.target
EOF

if [ $? -eq 0 ]; then
    echo "✅ Archivo de servicio creado: /etc/systemd/system/$SERVICE_NAME.service"
else
    echo "❌ Error creando archivo de servicio"
    exit 1
fi

# Crear directorio de logs si no existe
if [ ! -d "$SCRIPT_DIR/logs" ]; then
    mkdir -p "$SCRIPT_DIR/logs"
    echo "📁 Directorio de logs creado"
fi

# Establecer permisos
chmod 755 "$SCRIPT_DIR/logs"

# Recargar systemd
echo "🔄 Recargando configuración de systemd..."
sudo systemctl daemon-reload

# Habilitar el servicio
echo "⚡ Habilitando servicio para inicio automático..."
sudo systemctl enable $SERVICE_NAME

echo "✅ Servicio configurado correctamente"
echo
echo "📋 Comandos disponibles:"
echo "   sudo systemctl start $SERVICE_NAME     # Iniciar servicio"
echo "   sudo systemctl stop $SERVICE_NAME      # Detener servicio"
echo "   sudo systemctl restart $SERVICE_NAME   # Reiniciar servicio"
echo "   sudo systemctl status $SERVICE_NAME    # Ver estado"
echo "   journalctl -u $SERVICE_NAME -f         # Ver logs en tiempo real"
echo

read -p "¿Deseas iniciar el servicio ahora? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Iniciando servicio..."
    sudo systemctl start $SERVICE_NAME
    sleep 2
    
    echo "📊 Estado del servicio:"
    sudo systemctl status $SERVICE_NAME --no-pager
    
    echo
    echo "📝 Para ver logs: journalctl -u $SERVICE_NAME -f"
fi

echo
echo "✅ Configuración completada. El detector de voz se iniciará automáticamente al encender el sistema."