# Configuración de Google Cloud Speech API

## Archivo de credenciales requerido

Este archivo debe contener las credenciales de servicio de Google Cloud.

### Pasos para obtener las credenciales:

1. **Ir a Google Cloud Console:**
   - Visita: https://console.cloud.google.com/

2. **Crear o seleccionar un proyecto:**
   - Nombre sugerido: "voice-detector-classroom"

3. **Habilitar la API de Speech-to-Text:**
   - En el menú: APIs y servicios > Biblioteca
   - Buscar "Cloud Speech-to-Text API"
   - Hacer clic en "Habilitar"

4. **Crear credenciales de cuenta de servicio:**
   - Ir a: APIs y servicios > Credenciales
   - Crear credenciales > Cuenta de servicio
   - Nombre: "voice-detector-service"
   - Rol: "Editor de Cloud Speech"

5. **Descargar la clave JSON:**
   - En la cuenta de servicio creada
   - Ir a "Claves" > "Agregar clave" > "Crear nueva clave"
   - Tipo: JSON
   - Descargar el archivo

   **⚠️ ERROR: "La creación de claves está inhabilitada"**
   Si aparece este error, ve a la sección "Solución de Problemas" más abajo.

6. **Colocar el archivo:**
   - Renombrar a: `google-cloud-key.json`
   - Guardar en esta carpeta: `/credentials/`

### Formato esperado del archivo JSON:

```json
{
  "type": "service_account",
  "project_id": "tu-proyecto-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "voice-detector-service@tu-proyecto.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

### Habilitar Google Speech en el sistema:

Una vez que tengas el archivo `google-cloud-key.json` en esta carpeta:

1. Editar `/config.json`
2. Cambiar: `"useGoogleSpeech": false` → `"useGoogleSpeech": true`
3. Reiniciar el programa

### Costos aproximados:

- **Gratis:** Primeros 60 minutos por mes
- **Después:** ~$0.006 USD por cada 15 segundos
- **Para aula típica:** Muy económico (~$1-2 USD/mes)

### Ventajas de Google Speech:

- ✅ Reconocimiento automático preciso
- ✅ No requiere transcripción manual
- ✅ Funciona con cualquier palabra en español
- ✅ Ideal para uso en producción

---

## 🚨 Solución de Problemas

### Error: "La creación de claves de la cuenta de servicio está inhabilitada"

**Causa:** Tu organización (empresa, universidad, etc.) tiene políticas que impiden crear cuentas de servicio.

**Mensaje completo de Google Cloud:**
```
Causas posibles: el administrador correspondiente aplicó la política de la 
organización para evitar incidentes de seguridad relacionados con las claves 
de cuenta de servicio. Como alternativa, es posible que se haya aplicado 
automáticamente la política a tu organización como parte de las aplicaciones 
de Seguridad de forma predeterminada.

Pasos siguientes recomendados: las claves de cuenta de servicio son un riesgo 
de seguridad si no se administran correctamente. Debes elegir una alternativa 
más segura siempre que sea posible.
```

## ⚠️ ¿Es Realmente Necesario Inhabilitar la Restricción?

**RESPUESTA CORTA: NO** - Para tu proyecto no necesitas hacer esto.

### 🚨 Riesgos de Inhabilitar la Política Organizacional

**¿Qué implica inhabilitar la restricción?**
1. **Requiere permisos de administrador organizacional** (`roles/orgpolicy.policyAdmin`)
2. **Puede afectar a toda la organización** (universidad/empresa)
3. **Potencial riesgo de seguridad** si se crean claves mal gestionadas
4. **Puede violar políticas de IT** de tu institución
5. **Tu cuenta podría ser suspendida** por violar políticas

**¿Deberías hacerlo?**
- ❌ **Para proyecto educativo**: No vale la pena el riesgo
- ❌ **En cuenta institucional**: Definitivamente NO
- ⚠️ **Solo si eres administrador**: Y entiendes las implicaciones

## ✅ Soluciones Prácticas (Recomendadas)

## ✅ Soluciones Prácticas (Recomendadas)

#### Opción A: Continuar Sin Google Speech (MÁS RECOMENDADA) 
**🎯 Para tu proyecto actual, esto es lo mejor:**

```bash
# Tu configuración actual ya funciona perfectamente
"useGoogleSpeech": false
```

**Beneficios:**
- ✅ **Funciona inmediatamente** - Sin configuración adicional
- ✅ **Sin riesgos de seguridad** - No viola políticas organizacionales  
- ✅ **Ideal para desarrollo** - Transcripción manual rápida
- ✅ **Perfecto para demos** - Control total del proceso
- ✅ **Sin costos** - Completamente gratuito
- ✅ **Sin dependencias externas** - No requiere internet

**Para tu proyecto de detector de voz NFC, esto es suficiente.**

#### Opción B: Usar Cuenta Personal Google (Para el futuro)
1. **Crear proyecto personal:**
   - Usa tu cuenta Gmail personal (@gmail.com)
   - No usa cuenta institucional
   - Sin restricciones organizacionales

2. **Proceso completo:**
   ```
   1. Ir a console.cloud.google.com con tu Gmail personal
   2. Crear proyecto: "detector-voz-personal"  
   3. Habilitar Speech API
   4. Crear cuenta de servicio (debería funcionar)
   5. Descargar JSON
   ```

#### Opción C: Solicitar Excepción (Solo si es crítico)
**⚠️ IMPORTANTE: Solo para casos realmente críticos**

```
1. Contactar administrador IT/sistemas de tu organización
2. Explicar que es un proyecto educativo específico
3. Solicitar excepción temporal para tu cuenta
4. Proporcionar justificación técnica del uso
5. Compromiso de seguir mejores prácticas de seguridad
```

**Política específica a mencionar:**
- `constraints/iam.disableServiceAccountKeyCreation`
- Solicitar excepción para tu proyecto específico

## 🤔 ¿Cómo Inhabilitar la Restricción? (NO Recomendado)

**Si fueras administrador organizacional (que probablemente no eres):**

1. **Ir a:** Google Cloud Console > IAM y seguridad > Políticas de la organización
2. **Buscar:** `constraints/iam.disableServiceAccountKeyCreation`
3. **Configurar:** Cambiar de "Aplicada" a "Excepción" para proyecto específico
4. **Aplicar:** Solo al proyecto necesario (no a toda la organización)

**⚠️ PERO ESTO:**
- Requiere rol `roles/orgpolicy.policyAdmin` (alta seguridad)
- Puede violar políticas de tu institución
- Podría resultar en suspensión de cuenta
- Es desproporcionado para un proyecto educativo

## 💡 Recomendación Final

**Para tu proyecto detector de voz + NFC:**

1. **Mantén la configuración actual** (`useGoogleSpeech: false`)
2. **El sistema funciona perfectamente** con transcripción manual
3. **Cuando necesites reconocimiento automático** (futuro), usa Opción B (cuenta personal)
4. **No trates de cambiar políticas organizacionales** - no vale la pena el riesgo

**Tu proyecto está 100% funcional sin Google Speech. Enfócate en la funcionalidad NFC.** ✅

### Otros errores comunes:

**"API no habilitada"**
- Solución: Ir a API Library y habilitar "Cloud Speech-to-Text API"

**"Permisos insuficientes"**  
- Solución: Usar rol "Project > Editor" o "Speech > Admin"

**"Archivo JSON inválido"**
- Solución: Verificar que el archivo no esté corrupto o sea de ejemplo

---

## 💡 Recomendación para tu caso

**Para desarrollo inmediato:** Continúa usando transcripción manual
```bash
node main.js  # Sistema funciona perfectamente sin Google Speech
```

**Para producción futura:** Considera la Opción A (cuenta personal) cuando necesites reconocimiento automático.

---

**Nota:** El sistema funciona perfectamente sin Google Speech usando transcripción manual.
Para desarrollo y pruebas, la transcripción manual es más que suficiente.