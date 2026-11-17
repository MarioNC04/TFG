#!/bin/bash
# Script de configuración para WSL
echo "🐧 Configurando entorno WSL para proyecto de voz..."

# Detectar si estamos en WSL
if [[ $(uname -r) == *"WSL"* || $(uname -r) == *"microsoft"* ]]; then
    echo "✅ WSL detectado correctamente"
else
    echo "⚠️ No parece ser WSL, continuando..."
fi

# Actualizar sistema
echo "📦 Actualizando sistema..."
sudo apt update -y

# Instalar herramientas de audio
echo "🎵 Instalando herramientas de audio..."
sudo apt install -y \
    alsa-utils \
    sox \
    pulseaudio \
    libasound2-dev \
    build-essential

# Configurar variables de audio para WSL
echo "🔧 Configurando variables de audio..."
echo "export PULSE_RUNTIME_PATH=/mnt/wslg/PulseAudio" >> ~/.bashrc
echo "export PULSE_SERVER=unix:\${PULSE_RUNTIME_PATH}/pulse/native" >> ~/.bashrc

# Instalar Node.js si no existe
if ! command -v node &> /dev/null; then
    echo "📦 Instalando Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# Instalar dependencias del proyecto
echo "📦 Instalando dependencias del proyecto..."
npm install

# Configurar permisos de audio
echo "🎤 Configurando permisos de audio..."
sudo usermod -a -G audio $USER

echo ""
echo "✅ ¡Configuración de WSL completada!"
echo "🎯 Para usar micrófono real:"
echo "   1. Reinicia WSL: exit && wsl"  
echo "   2. Ejecuta: node main.js"
echo "   3. ¡El micrófono funcionará como en Raspberry Pi!"
echo ""