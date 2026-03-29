#!/bin/bash
# Script para solucionar el error de creación de cuentas de servicio

echo "🚨 Solucionador: Error de Creación de Cuentas de Servicio"
echo "========================================================"
echo ""

echo "📋 Error detectado:"
echo "   'La creación de claves de la cuenta de servicio está inhabilitada'"
echo "   Política: iam.disableServiceAccountKeyCreation"
echo ""

echo "🔍 Verificando estado actual del sistema..."
echo ""

# Verificar si Google Speech está habilitado
if grep -q '"useGoogleSpeech": true' config.json 2>/dev/null; then
    echo "⚠️ Google Speech está HABILITADO pero sin credenciales válidas"
    GOOGLE_ENABLED=true
else
    echo "✅ Google Speech está DESHABILITADO (configuración actual)"
    GOOGLE_ENABLED=false
fi

# Verificar si existe archivo de credenciales
if [ -f "credentials/google-cloud-key.json" ]; then
    if grep -q "TU-PROYECTO-ID-AQUI" "credentials/google-cloud-key.json"; then
        echo "📄 Archivo de credenciales: EJEMPLO (no válido)"
    else
        echo "📄 Archivo de credenciales: ENCONTRADO"
    fi
else
    echo "📄 Archivo de credenciales: NO ENCONTRADO"
fi

echo ""
echo "🎯 SOLUCIONES DISPONIBLES:"
echo ""

echo "1️⃣ USAR SISTEMA ACTUAL (Recomendado para desarrollo)"
echo "   ✅ Sin configuración adicional necesaria"
echo "   ✅ Funciona inmediatamente"
echo "   ✅ Transcripción manual intuitiva"
echo ""

echo "2️⃣ CREAR PROYECTO PERSONAL"
echo "   • Usar cuenta Gmail personal"
echo "   • Crear proyecto en Google Cloud Console"
echo "   • Sin restricciones organizacionales"
echo ""

echo "3️⃣ SOLICITAR PERMISOS AL ADMINISTRADOR"
echo "   • Contactar departamento IT"
echo "   • Mencionar proyecto educativo"
echo "   • Solicitar excepción para política IAM"
echo ""

echo "4️⃣ ALTERNATIVAS SIN GOOGLE CLOUD"
echo "   • Sistema actual con transcripción manual"
echo "   • Azure Speech Services (alternativa)"
echo "   • AWS Transcribe (alternativa)"
echo ""

echo "💡 ¿Qué opción prefieres?"
echo ""
echo "Para continuar inmediatamente con el sistema actual:"
echo "   1. No hagas nada - el sistema ya funciona"
echo "   2. Ejecuta: node main.js"
echo "   3. Usa transcripción manual cuando aparezca"
echo ""

echo "Para configurar Google Speech más tarde:"
echo "   1. Sigue la Opción 2 (proyecto personal)"
echo "   2. Ejecuta: ./setup_google_speech.sh"
echo ""

# Probar sistema actual
echo "🧪 ¿Quieres probar el sistema actual ahora? (y/n)"
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    echo ""
    echo "🚀 Iniciando prueba del sistema..."
    echo "💡 Recuerda: usar transcripción manual cuando se solicite"
    sleep 2
    node main.js
else
    echo ""
    echo "✅ Configuración completada"
    echo "💡 El sistema está listo para usar cuando lo necesites"
fi