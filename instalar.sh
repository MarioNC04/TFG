#!/bin/bash

echo "========================================="
echo "  INSTALADOR DETECTOR VOZ - RASPBERRY PI"
echo "========================================="
echo

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para imprimir con colores
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Detectar si es Raspberry Pi
if grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
    print_status "🍓 Raspberry Pi detectado"
    IS_RPI=true
else
    print_warning "⚠️  No es Raspberry Pi, continuando instalación genérica..."
    IS_RPI=false
fi

print_step "[1/6] Actualizando sistema..."
sudo apt update
if [ $? -ne 0 ]; then
    print_error "Error actualizando repositorios"
    exit 1
fi

print_step "[2/6] Instalando dependencias del sistema..."
# Dependencias básicas
sudo apt install -y curl wget gnupg2 software-properties-common

# Dependencias de audio para Raspberry Pi
if [ "$IS_RPI" = true ]; then
    print_status "Instalando dependencias de audio para Raspberry Pi..."
    sudo apt install -y alsa-utils sox espeak pulseaudio pulseaudio-utils
else
    sudo apt install -y alsa-utils sox espeak
fi

print_step "[3/6] Verificando/Instalando Node.js..."
# Verificar si Node.js ya está instalado
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | sed 's/v//')
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1)
    
    if [ "$MAJOR_VERSION" -ge 16 ]; then
        print_status "✅ Node.js $NODE_VERSION ya instalado (versión adecuada)"
    else
        print_warning "Node.js versión $NODE_VERSION es muy antigua, instalando versión LTS..."
        INSTALL_NODE=true
    fi
else
    print_status "Node.js no encontrado, instalando..."
    INSTALL_NODE=true
fi

if [ "$INSTALL_NODE" = true ]; then
    # Instalar Node.js LTS usando NodeSource
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    if [ $? -ne 0 ]; then
        print_error "Error instalando Node.js"
        exit 1
    fi
fi

# Verificar instalación
if command -v node &> /dev/null && command -v npm &> /dev/null; then
    print_status "✅ Node.js $(node --version) y npm $(npm --version) instalados"
else
    print_error "❌ Error: Node.js o npm no disponibles después de instalación"
    exit 1
fi

print_step "[4/6] Configurando audio para Raspberry Pi..."
if [ "$IS_RPI" = true ]; then
    # Añadir usuario al grupo audio
    sudo usermod -a -G audio $USER
    
    # Configurar ALSA para Raspberry Pi
    if [ ! -f ~/.asoundrc ]; then
        print_status "Creando configuración ALSA..."
        cat > ~/.asoundrc << 'EOF'
pcm.!default {
    type asym
    capture.pcm "mic"
}
pcm.mic {
    type plug
    slave {
        pcm "hw:1,0"
    }
}
EOF
    fi
    
    # Habilitar audio en raspi-config si es necesario
    print_status "Verificando configuración de audio..."
    if ! sudo raspi-config nonint get_camera 2>/dev/null; then
        print_warning "Ejecuta 'sudo raspi-config' y habilita audio si es necesario"
    fi
fi

print_step "[5/6] Instalando dependencias de Node.js..."
npm install

if [ $? -ne 0 ]; then
    print_warning "Algunos paquetes fallaron, intentando solucionar..."
    
    # Limpiar cache y reinstalar
    npm cache clean --force
    rm -rf node_modules package-lock.json
    npm install
    
    if [ $? -ne 0 ]; then
        print_error "❌ Error instalando dependencias de Node.js"
        echo
        echo "💡 Soluciones posibles:"
        echo "   1. Verificar conexión a Internet"
        echo "   2. Liberar espacio en disco"
        echo "   3. Ejecutar: npm install --no-optional"
        echo "   4. Si persiste, instalar manualmente cada paquete"
        exit 1
    fi
fi

print_step "[6/6] Verificando instalación..."
echo
print_status "📋 Verificando paquetes instalados:"

# Verificar cada dependencia
node -e "try { require('mic'); console.log('✅ mic OK'); } catch(e) { console.log('❌ mic FALLO'); }" 2>/dev/null
node -e "try { require('@google-cloud/speech'); console.log('✅ @google-cloud/speech OK'); } catch(e) { console.log('❌ @google-cloud/speech FALLO'); }" 2>/dev/null
node -e "try { require('say'); console.log('✅ say OK'); } catch(e) { console.log('❌ say FALLO'); }" 2>/dev/null
node -e "try { require('wav'); console.log('✅ wav OK'); } catch(e) { console.log('❌ wav FALLO'); }" 2>/dev/null

echo
print_status "🔧 Verificando sistema de audio..."

# Verificar dispositivos de audio
if command -v arecord &> /dev/null; then
    if arecord -l | grep -q "card"; then
        print_status "✅ Dispositivos de grabación encontrados:"
        arecord -l | grep "card" | head -3
    else
        print_warning "⚠️  No se encontraron dispositivos de grabación"
        print_status "Conecta un micrófono USB y reinicia"
    fi
fi

echo
echo "========================================="
echo "   🚀 INSTALACIÓN COMPLETADA"
echo "========================================="
echo
print_status "✅ Sistema listo para usar en aula educativa"
echo
print_status "🎯 Comandos disponibles:"
echo "   • npm start        - Iniciar detector de voz"
echo "   • npm run test-mic - Probar micrófono"
echo "   • node main.js     - Ejecutar directamente"
echo
if [ "$IS_RPI" = true ]; then
    print_status "🍓 Configuración específica Raspberry Pi:"
    echo "   • sudo raspi-config  - Configurar audio si hay problemas"
    echo "   • alsamixer         - Ajustar volúmenes"
    echo "   • arecord -l        - Listar dispositivos de audio"
    echo
    print_warning "⚠️  IMPORTANTE: Reinicia el sistema para aplicar permisos de audio"
    echo "   sudo reboot"
fi

echo
print_status "📖 Consulta README.md para configuración detallada"
echo

if [ "$IS_RPI" = true ]; then
    read -p "¿Deseas reiniciar ahora para aplicar cambios? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Reiniciando sistema..."
        sudo reboot
    fi
fi