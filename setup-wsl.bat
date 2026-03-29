@echo off
echo 🐧 Configurando proyecto para WSL...
echo.

echo 📁 Copiando archivos a WSL...
wsl mkdir -p /home/mario/voice-detector
wsl cp /mnt/c/Users/Mario/Desktop/TFG/Proyecto-TFG/*.js /home/mario/voice-detector/
wsl cp /mnt/c/Users/Mario/Desktop/TFG/Proyecto-TFG/*.json /home/mario/voice-detector/
wsl cp /mnt/c/Users/Mario/Desktop/TFG/Proyecto-TFG/*.sh /home/mario/voice-detector/

echo 🎤 Configurando dependencias de audio...
wsl sudo apt update
wsl sudo apt install -y alsa-utils sox pulseaudio

echo 📦 Instalando dependencias Node.js...
wsl cd /home/mario/voice-detector && npm install

echo.
echo ✅ ¡Configuración completada!
echo 🚀 Para usar el proyecto en WSL ejecuta:
echo    wsl
echo    cd /home/mario/voice-detector
echo    node main.js
echo.
pause