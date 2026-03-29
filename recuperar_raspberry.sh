#!/bin/bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo "=============================================="
echo "  RECUPERACION DEL PROYECTO EN RASPBERRY PI"
echo "=============================================="
echo

step "[1/7] Revisando estructura basica"
mkdir -p logs credentials

# Archivos que deben existir y no estar vacios
REQUIRED_FILES=(
    "main.js"
    "package.json"
    "config.json"
)

EMPTY_OR_MISSING=()
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -s "$file" ]; then
        EMPTY_OR_MISSING+=("$file")
    fi
done

if [ ${#EMPTY_OR_MISSING[@]} -eq 0 ]; then
    info "No se detectaron archivos criticos vacios"
else
    warn "Archivos criticos vacios o ausentes: ${EMPTY_OR_MISSING[*]}"
fi

step "[2/7] Intentando recuperar desde Git local"
RECOVERED_FROM_GIT=false
if [ -d ".git" ] && command -v git >/dev/null 2>&1; then
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        for file in "${EMPTY_OR_MISSING[@]}"; do
            if git cat-file -e "HEAD:$file" 2>/dev/null; then
                git checkout HEAD -- "$file" || true
            fi
        done

        RECOVERED_FROM_GIT=true
        info "Recuperacion Git local completada"
    else
        warn "Repositorio Git no valido en esta carpeta"
    fi
else
    warn "No hay repositorio Git local disponible"
fi

step "[3/7] Revalidando archivos criticos"
STILL_BROKEN=()
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -s "$file" ]; then
        STILL_BROKEN+=("$file")
    fi
done

if [ ${#STILL_BROKEN[@]} -gt 0 ]; then
    warn "Siguen faltando archivos criticos: ${STILL_BROKEN[*]}"

    if [ -n "$REPO_URL" ]; then
        step "[4/7] Recuperando desde repositorio remoto"
        TMP_DIR="$(mktemp -d)"
        BRANCH="${REPO_BRANCH:-main}"

        if git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMP_DIR"; then
            for file in "${STILL_BROKEN[@]}"; do
                if [ -s "$TMP_DIR/$file" ]; then
                    cp "$TMP_DIR/$file" "$file"
                    info "Restaurado: $file"
                else
                    warn "No encontrado en remoto: $file"
                fi
            done
        else
            error "No se pudo clonar REPO_URL=$REPO_URL"
        fi

        rm -rf "$TMP_DIR"
    else
        warn "No se definio REPO_URL. Saltando recuperacion remota"
    fi
fi

step "[5/7] Generando archivos auxiliares minimos"
if [ ! -s "logs/detections.json" ]; then
    echo "[]" > logs/detections.json
    info "Creado logs/detections.json"
fi

if [ ! -s "credentials/README.md" ]; then
    cat > credentials/README.md << 'EOF'
# Credenciales Google Cloud

Coloca aqui tu archivo de credenciales:

- credentials/google-cloud-key.json

Si usas reconocimiento local y no Google Speech, puedes dejarlo sin configurar.
EOF
    info "Creado credentials/README.md"
fi

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    cp .env.example .env
    info "Creado .env desde .env.example"
fi

if [ ! -s "config.json" ]; then
    cat > config.json << 'EOF'
{
  "targetWord": "voluntario",
  "responseMessage": "Pasa tu tarjeta por el detector de NFCs",
  "enableVoiceResponse": true,
  "enableRemoteLogging": false,
  "useGoogleSpeech": false,
  "language": "es-ES",
  "alternativeLanguages": ["es-MX", "es-AR"],
  "audioSettings": {
    "sampleRate": 16000,
    "channels": 1,
    "device": "plughw:1,0",
    "format": "S16_LE"
  },
  "ttsSettings": {
    "voice": "auto",
    "speed": 150,
    "volume": 0.8,
    "enableFallback": true
  },
  "googleCredentialsPath": "./credentials/google-cloud-key.json"
}
EOF
    info "Generado config.json por defecto"
fi

step "[6/7] Verificando estado final"
FINAL_BROKEN=()
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -s "$file" ]; then
        FINAL_BROKEN+=("$file")
    fi
done

if [ ${#FINAL_BROKEN[@]} -gt 0 ]; then
    error "No fue posible reconstruir completamente: ${FINAL_BROKEN[*]}"
    echo
    echo "Accion recomendada:"
    echo "1) Exporta REPO_URL con tu repositorio"
    echo "2) Ejecuta de nuevo este script"
    echo
    echo "Ejemplo:"
    echo "export REPO_URL='https://github.com/usuario/repositorio.git'"
    echo "export REPO_BRANCH='main'"
    echo "bash recuperar_raspberry.sh"
    exit 1
fi

step "[7/7] Instalando dependencias"
if command -v npm >/dev/null 2>&1; then
    npm install
    info "Dependencias de Node instaladas"
else
    warn "npm no encontrado. Ejecuta instalar.sh para preparar el sistema"
fi

echo
echo "=============================================="
echo "  RECUPERACION COMPLETADA"
echo "=============================================="
info "Siguiente prueba recomendada: npm run test-mic"
info "Ejecucion principal: npm start"
