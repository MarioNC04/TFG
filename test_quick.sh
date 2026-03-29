#!/bin/bash
# Script de prueba rápida del detector de voz

echo "🧪 Prueba rápida del detector de voz en WSL"
echo "==========================================="
echo ""

# Verificar entorno
if [ ! -f "/proc/version" ] || ! grep -qi microsoft /proc/version; then
    echo "⚠️ Este script está optimizado para WSL"
    echo "💡 Puedes ejecutar 'node main.js' directamente"
    echo ""
fi

echo "✅ Entorno WSL detectado"
echo "🎤 Verificando configuración de audio..."

# Test básico de PulseAudio
if ! command -v pactl &> /dev/null; then
    echo "❌ PulseAudio no encontrado"
    echo "💡 Instala con: sudo apt install pulseaudio-utils"
    exit 1
fi

echo "✅ PulseAudio disponible"

# Verificar servidor de audio
if ! pactl info &> /dev/null; then
    echo "⚠️ Servidor de audio no conectado"
    echo "💡 Verifica que WSL esté configurado correctamente"
else
    echo "✅ Servidor de audio funcionando"
fi

echo ""
echo "🚀 Iniciando detector de voz..."
echo "📝 Configuración actual:"
echo "   - Google Speech: DESHABILITADO (transcripción manual)"
echo "   - Palabra objetivo: voluntario"  
echo "   - Ambiente: WSL con PulseAudio"
echo ""
echo "💡 Instrucciones de uso:"
echo "   1. Selecciona opción 1 cuando aparezca el menú"
echo "   2. Habla cuando veas: '🎤 Grabando desde micrófono WSL...'"
echo "   3. Presiona ENTER cuando termines de hablar"
echo "   4. Escribe 'voluntario' en la transcripción manual"
echo "   5. ¡Deberías ver 'Hola mundo'!"
echo ""

read -p "Presiona ENTER para continuar..."

# Ejecutar el programa principal
node main.js