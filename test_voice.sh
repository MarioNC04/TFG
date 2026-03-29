#!/bin/bash
# Script para probar automáticamente la detección de voz

echo "🧪 Iniciando test automático del detector de voz..."
echo ""

# Enviar opción 1 al programa
(echo "1"; sleep 2; echo "") | timeout 10 node main.js

echo ""
echo "✅ Test completado"