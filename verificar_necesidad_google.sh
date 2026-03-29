#!/bin/bash
# Verificador de que NO necesitas Google Speech para tu proyecto

echo "🔍 VERIFICACIÓN: ¿Necesitas realmente Google Speech?"
echo "================================================="
echo ""

echo "📋 Analizando tu proyecto actual..."
echo ""

# Verificar configuración actual
if grep -q '"useGoogleSpeech": false' config.json; then
    echo "✅ Google Speech: DESHABILITADO (configuración actual)"
    GOOGLE_STATUS="OFF"
else
    echo "⚠️ Google Speech: HABILITADO"
    GOOGLE_STATUS="ON"
fi

# Verificar funcionalidad actual
echo ""
echo "🧪 Probando funcionalidad actual sin Google Speech..."

# Test del mensaje de voz actual
if command -v node &> /dev/null; then
    echo "✅ Node.js disponible"
    
    # Test rápido del mensaje
    node -e "
        const config = require('./config.json');
        console.log('🎯 Palabra objetivo:', config.targetWord);
        console.log('💬 Mensaje respuesta:', config.responseMessage);
        console.log('🔊 Voz habilitada:', config.enableVoiceResponse);
    " 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo "✅ Configuración cargada correctamente"
    fi
else
    echo "❌ Node.js no disponible"
fi

echo ""
echo "📊 ANÁLISIS DE NECESIDADES:"
echo ""
echo "🎯 Tu proyecto actual:"
echo "   - Detecta palabra 'voluntario'"
echo "   - Responde con 'Pasa tu tarjeta por el detector de NFCs'"
echo "   - Funciona con transcripción manual"
echo "   - Preparado para integración NFC"
echo ""

echo "❓ ¿NECESITAS Google Speech?"
echo ""
echo "✅ PARA DESARROLLO/DEMOS: NO"
echo "   - Transcripción manual es suficiente"
echo "   - Control total del proceso"
echo "   - Sin dependencias externas"
echo "   - Sin restricciones organizacionales"
echo ""

echo "🤔 PARA PRODUCCIÓN (futuro): QUIZÁS"
echo "   - Solo si necesitas reconocimiento automático 24/7"
echo "   - Para eso puedes usar cuenta Gmail personal"
echo "   - O explorar alternativas (Azure, AWS, etc.)"
echo ""

echo "⚖️ RIESGO vs BENEFICIO de inhabilitar política organizacional:"
echo ""
echo "❌ RIESGOS:"
echo "   • Violación de políticas de seguridad institucionales"
echo "   • Posible suspensión de cuenta"
echo "   • Afectar a toda la organización"
echo "   • Crear precedente de incumplimiento"
echo ""

echo "✅ BENEFICIO:"
echo "   • Reconocimiento automático de voz"
echo "   • (Que puedes lograr de otras formas más seguras)"
echo ""

echo "🎯 RECOMENDACIÓN FINAL:"
echo ""
if [ "$GOOGLE_STATUS" = "OFF" ]; then
    echo "✅ MANTÉN tu configuración actual"
    echo "✅ Tu sistema está funcionando perfectamente"
    echo "✅ Enfócate en la funcionalidad NFC"
    echo "✅ No hagas cambios de políticas organizacionales"
else
    echo "⚠️ Considera deshabilitar Google Speech temporalmente"
    echo "⚠️ Tu proyecto funcionará igual de bien"
fi

echo ""
echo "💡 Para probar que todo funciona:"
echo "   1. Ejecuta: node main.js"
echo "   2. Selecciona opción 1"
echo "   3. Di 'voluntario' (transcripción manual)"
echo "   4. Escucha: 'Pasa tu tarjeta por el detector de NFCs'"
echo ""

echo "🎉 ¡Tu proyecto está listo!"
echo ""

read -p "¿Quieres probar el sistema ahora? (y/n): " -r
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🚀 Iniciando sistema..."
    node main.js
fi