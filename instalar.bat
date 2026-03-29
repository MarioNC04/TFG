@echo off
echo ========================================
echo   INSTALADOR DETECTOR VOZ - JAVASCRIPT
echo ========================================
echo.

echo [1/4] Verificando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js no encontrado
    echo.
    echo 💡 SOLUCIÓN:
    echo   1. Descarga Node.js desde: https://nodejs.org
    echo   2. Instala la versión LTS (Long Term Support)
    echo   3. Reinicia esta terminal y ejecuta nuevamente
    pause
    exit /b 1
) else (
    echo ✅ Node.js encontrado
    node --version
)

echo.
echo [2/4] Verificando npm...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm no encontrado
    echo 💡 npm debería venir con Node.js - reinstala Node.js
    pause
    exit /b 1
) else (
    echo ✅ npm encontrado
    npm --version
)

echo.
echo [3/4] Instalando dependencias de Node.js...
npm install

if %errorlevel% neq 0 (
    echo.
    echo ⚠️  Algunos paquetes fallaron. Intentando soluciones...
    echo.
    echo Limpiando cache de npm...
    npm cache clean --force
    
    echo Eliminando node_modules...
    if exist node_modules rmdir /s /q node_modules
    if exist package-lock.json del package-lock.json
    
    echo Reinstalando...
    npm install
    
    if %errorlevel% neq 0 (
        echo.
        echo ❌ No se pudieron instalar las dependencias
        echo.
        echo 💡 SOLUCIONES MANUALES:
        echo.
        echo 1. Verificar conexión a Internet
        echo 2. Ejecutar como administrador
        echo 3. Instalar Visual Studio Build Tools si aparecen errores de compilación
        echo 4. Usar: npm install --no-optional
        echo.
        pause
        exit /b 1
    )
)

echo.
echo [4/4] Verificando instalación...
echo.

node -e "try { require('mic'); console.log('✅ mic OK'); } catch(e) { console.log('❌ mic NO INSTALADO'); }" 2>nul
node -e "try { require('@google-cloud/speech'); console.log('✅ @google-cloud/speech OK'); } catch(e) { console.log('❌ @google-cloud/speech NO INSTALADO'); }" 2>nul
node -e "try { require('say'); console.log('✅ say OK'); } catch(e) { console.log('❌ say NO INSTALADO'); }" 2>nul

echo.
echo ========================================
echo   🚀 INSTRUCCIONES FINALES
echo ========================================
echo.
echo 1. Si todos los paquetes muestran ✅, ejecuta: node main.js
echo 2. Si alguno muestra ❌, revisa el log de npm install
echo 3. Para Raspberry Pi, usa el script install-rpi.sh
echo 4. Consulta el README.md para configuración adicional
echo.
echo ⚠️  NOTA IMPORTANTE:
echo Este sistema está diseñado para Raspberry Pi en aulas.
echo En Windows es solo para desarrollo/pruebas.
echo.
echo 🎤 Para probar micrófono: npm run test-mic
echo 🚀 Para iniciar: npm start
echo.
pause