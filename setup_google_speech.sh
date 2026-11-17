#!/bin/bash
# Script para configurar Google Cloud Speech API

echo "🔧 Configurador de Google Cloud Speech API"
echo "==========================================="
echo ""

# Verificar si existe el archivo de credenciales
CREDENTIALS_FILE="./credentials/google-cloud-key.json"

if [ ! -f "$CREDENTIALS_FILE" ]; then
    echo "❌ Archivo de credenciales no encontrado:"
    echo "   $CREDENTIALS_FILE"
    echo ""
    echo "📋 Pasos para configurar:"
    echo "   1. Lee el archivo: credentials/README.md"
    echo "   2. Descarga tu archivo de credenciales de Google Cloud"
    echo "   3. Guárdalo como: credentials/google-cloud-key.json" 
    echo "   4. Ejecuta este script nuevamente"
    echo ""
    exit 1
fi

echo "✅ Archivo de credenciales encontrado"

# Verificar que el archivo no sea el de ejemplo
if grep -q "TU-PROYECTO-ID-AQUI" "$CREDENTIALS_FILE"; then
    echo "⚠️  Detectado archivo de ejemplo - reemplázalo con credenciales reales"
    echo ""
    exit 1
fi

echo "✅ Archivo de credenciales válido"

# Habilitar Google Speech en config.json
CONFIG_FILE="./config.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Archivo config.json no encontrado"
    exit 1
fi

echo "🔄 Habilitando Google Speech en configuración..."

# Cambiar useGoogleSpeech a true
sed -i 's/"useGoogleSpeech": false/"useGoogleSpeech": true/g' "$CONFIG_FILE"

echo "✅ Google Speech habilitado"
echo ""
echo "🎉 Configuración completada exitosamente"
echo ""
echo "💡 Próximos pasos:"
echo "   1. Ejecuta: node main.js"
echo "   2. Selecciona opción 1 (Iniciar detección)"
echo "   3. Di 'voluntario' cuando escuches el prompt"
echo "   4. ¡El reconocimiento será automático!"
echo ""
echo "📊 Beneficios habilitados:"
echo "   ✅ Reconocimiento automático de voz"
echo "   ✅ No más transcripción manual"
echo "   ✅ Detección precisa en español"
echo ""