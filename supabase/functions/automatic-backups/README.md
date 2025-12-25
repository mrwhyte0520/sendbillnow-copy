# Edge Function: Automatic Backups

Esta función ejecuta respaldos automáticos para todos los usuarios que tienen habilitada la opción en sus configuraciones contables.

## Funcionalidad

1. **Obtiene usuarios** con `auto_backup = true` de la tabla `accounting_settings`
2. **Verifica** si necesitan un nuevo respaldo según su frecuencia configurada (diario/semanal/mensual)
3. **Crea respaldos** completos de datos para los usuarios que lo requieren
4. **Limpia respaldos expirados** según el período de retención configurado

## Configuración del Cron Job

### Opción 1: Usando Supabase Dashboard (Recomendado)

1. Ve a **Supabase Dashboard** → **Edge Functions**
2. Despliega la función `automatic-backups`
3. Ve a **Database** → **Cron Jobs** (o usa pg_cron extension)
4. Crea un nuevo cron job:

```sql
-- Ejecutar diariamente a las 2:00 AM
SELECT cron.schedule(
  'automatic-backups-daily',
  '0 2 * * *', -- Cron expression: cada día a las 2 AM
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/automatic-backups',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
    ) as request_id;
  $$
);
```

### Opción 2: Usando pg_cron directamente

```sql
-- Habilitar extensión pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Programar ejecución diaria
SELECT cron.schedule(
  'automatic-backups-daily',
  '0 2 * * *',
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/automatic-backups',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
    ) as request_id;
  $$
);
```

### Opción 3: Usando servicio externo (Cron-job.org, GitHub Actions, etc.)

```bash
# Ejecutar diariamente con curl
curl -X POST \
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/automatic-backups \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

## Variables de Entorno Requeridas

La función usa automáticamente:
- `SUPABASE_URL` - URL del proyecto Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key para acceso completo

Estas se configuran automáticamente en Supabase.

## Despliegue

```bash
# Desde la raíz del proyecto
supabase functions deploy automatic-backups
```

## Logs

Para ver los logs de ejecución:

```bash
supabase functions logs automatic-backups
```

O desde el Dashboard: **Edge Functions** → **automatic-backups** → **Logs**

## Respuesta de la Función

```json
{
  "success": true,
  "message": "Automatic backup process completed",
  "stats": {
    "totalUsers": 5,
    "processed": 5,
    "created": 3,
    "skipped": 2,
    "errors": 0
  }
}
```

## Frecuencias Soportadas

- **daily**: Crea respaldo cada 24 horas
- **weekly**: Crea respaldo cada 7 días
- **monthly**: Crea respaldo cada 30 días

## Limpieza Automática

La función también ejecuta `delete_expired_backups()` al final de cada ejecución para eliminar respaldos que excedieron su período de retención.

## Testing Manual

Puedes probar la función manualmente:

```bash
curl -X POST \
  http://localhost:54321/functions/v1/automatic-backups \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

## Monitoreo

Se recomienda configurar alertas para:
- Errores en la ejecución de la función
- Respaldos que fallan repetidamente
- Tamaño excesivo de respaldos

## Notas Importantes

⚠️ **Límites de Supabase:**
- Payload máximo: 50 MB
- Timeout: 60 segundos
- Si tienes usuarios con muchos datos, considera particionar los respaldos

⚠️ **Almacenamiento:**
- Los respaldos se guardan en JSONB en la tabla `data_backups`
- Monitorea el uso de almacenamiento regularmente
- Considera migrar a Supabase Storage para respaldos muy grandes
