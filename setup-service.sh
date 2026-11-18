#!/bin/bash
#
# setup-service.sh - Arranque automático del sistema del aula en la Raspberry Pi
#
# Al encender la Raspberry Pi:
#   1. inicia sesión sola en la consola (tty1), sin pedir contraseña;
#   2. arranca el sistema del aula en esa consola. Así el lector NFC de tipo
#      teclado escribe directamente en él y la pantalla muestra lo que pasa;
#   3. si el sistema se cierra por un error, vuelve a arrancarlo a los 5 s;
#   4. (opcional) arranca también el servidor que simula TecnoCRA como servicio
#      del sistema, con el panel en http://<ip-de-la-raspberry>:3000
#
# El sistema no inicia sesiones de clase hasta que la hora esté sincronizada
# por internet (la Raspberry Pi no tiene reloj propio).
#
# Opcional: botón de apagado seguro entre GPIO3 (pin 5) y GND (pin 6).

if [ "$EUID" -eq 0 ]; then
    echo "❌ No ejecutes este script como root/sudo"
    echo "💡 Ejecuta: ./setup-service.sh"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="$HOME/.bash_profile"
MARK="# avatar-aula: arranque automático"

echo "📁 Proyecto: $SCRIPT_DIR"
echo "👤 Usuario: $(whoami)"

# Servicio de versiones anteriores del proyecto
if systemctl list-unit-files 2>/dev/null | grep -q '^voice-detector-classroom'; then
    echo "🧹 Desactivando el servicio antiguo voice-detector-classroom"
    sudo systemctl disable --now voice-detector-classroom
fi

# 1. Inicio de sesión automático en la consola
if command -v raspi-config > /dev/null; then
    echo "🔑 Activando el inicio de sesión automático en la consola (tty1)"
    sudo raspi-config nonint do_boot_behaviour B2
else
    echo "⚠️  raspi-config no disponible: activa a mano el inicio de sesión automático en tty1"
fi

# 2 y 3. Arrancar el sistema al iniciar sesión en tty1, y reiniciarlo si se cierra
if ! grep -q "$MARK" "$PROFILE" 2>/dev/null; then
    cat >> "$PROFILE" << EOF

$MARK
if [ "\$(tty)" = "/dev/tty1" ]; then
    cd "$SCRIPT_DIR"
    while true; do
        node main.js
        echo "🔄 El sistema se ha cerrado; se vuelve a arrancar en 5 s (Ctrl+C para salir a la consola)"
        sleep 5 || break
    done
fi
EOF
    echo "✅ Arranque automático añadido a $PROFILE"
else
    echo "✅ El arranque automático ya estaba configurado"
fi

mkdir -p "$SCRIPT_DIR/logs"

# 4. Servidor simulado de TecnoCRA (API + panel) como servicio del sistema
SERVICE=avatar-tecnocra
echo
echo "🌐 El servidor que simula TecnoCRA guarda tarjetas, horario y puntos, y sirve el panel."
read -p "¿Arrancarlo también en esta Raspberry al encenderla? (Y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    NODE_BIN="$(command -v node)"
    sudo tee /etc/systemd/system/$SERVICE.service > /dev/null << UNIT
[Unit]
Description=Servidor simulado de TecnoCRA (API y panel del avatar)
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$SCRIPT_DIR
ExecStart=$NODE_BIN server/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
    sudo systemctl daemon-reload
    sudo systemctl enable --now $SERVICE
    IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    echo "✅ Servidor activado. Panel: http://${IP:-<ip-de-la-raspberry>}:3000"
    echo "   Ver su registro: journalctl -u $SERVICE -f"
fi

# Botón de apagado (opcional)
CONFIG_TXT=/boot/firmware/config.txt
[ -f "$CONFIG_TXT" ] || CONFIG_TXT=/boot/config.txt
if [ -f "$CONFIG_TXT" ] && ! grep -q "dtoverlay=gpio-shutdown" "$CONFIG_TXT"; then
    echo
    echo "🔘 Botón de apagado: un pulsador entre GPIO3 (pin 5) y GND (pin 6)."
    echo "   Al pulsarlo se apaga de forma segura; con la Raspberry apagada, la enciende."
    read -p "¿Activarlo en $CONFIG_TXT? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "dtoverlay=gpio-shutdown" | sudo tee -a "$CONFIG_TXT" > /dev/null
        echo "✅ Botón de apagado activado (se aplica al reiniciar)"
    fi
fi

echo
echo "✅ Listo. Reinicia para comprobarlo: sudo reboot"
echo "   Para desactivarlo, borra el bloque \"$MARK\" de $PROFILE"
