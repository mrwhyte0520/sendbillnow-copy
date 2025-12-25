# Configuración de Respaldos Automáticos

## 📋 Resumen

Sistema completo de respaldos automáticos usando Supabase Edge Functions y pg_cron.

---

## 🚀 Pasos de Instalación

### 1. Aplicar Migraciones a la Base de Datos

```bash
# Desde la raíz del proyecto
supabase db push
```

Esto aplicará:
- `20251225000001_create_data_backups_table.sql` - Tabla de respaldos
- `20251225000002_setup_automatic_backups_cron.sql` - Configuración de cron job

### 2. Desplegar Edge Function

```bash
# Desplegar la función de respaldos automáticos
supabase functions deploy automatic-backups

# Verificar que se desplegó correctamente
supabase functions list
```

### 3. Configurar Variables de Entorno en Supabase

Ve a **Supabase Dashboard** → **Settings** → **Database** → **Configuration**

Añade las siguientes variables (ajusta según tu proyecto):

```sql
-- Configurar URL de Supabase
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';

-- Configurar Service Role Key (obtenerla del Dashboard)
ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
```

### 4. Verificar el Cron Job

```sql
-- Ver todos los cron jobs programados
SELECT * FROM cron.job;

-- Ver historial de ejecuciones
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 10;
```

---

## ⚙️ Configuración del Usuario

Los usuarios configuran sus respaldos desde:
**Configuración → Configuración Contable → Configuración de Respaldos**

### Opciones Disponibles:
- ✅ Habilitar respaldos automáticos
- 📅 Frecuencia: Diario / Semanal / Mensual
- 🗓️ Período de retención: 1-365 días

---

## 🔄 Cómo Funciona

### Flujo Automático:

1. **Cron Job ejecuta diariamente** (2:00 AM por defecto)
2. **Edge Function se activa** y consulta `accounting_settings`
3. **Para cada usuario con `auto_backup = true`:**
   - Verifica última fecha de respaldo
   - Compara con frecuencia configurada
   - Si es necesario, crea nuevo respaldo completo
4. **Limpia respaldos expirados** según `retention_days`
5. **Retorna estadísticas** de ejecución

### Frecuencias:
- **Diario:** Crea respaldo cada 24 horas
- **Semanal:** Crea respaldo cada 7 días
- **Mensual:** Crea respaldo cada 30 días

---

## 📊 Monitoreo

### Ver Logs de la Edge Function

```bash
# En tiempo real
supabase functions logs automatic-backups --tail

# Últimas 50 líneas
supabase functions logs automatic-backups -n 50
```

### Consultar Respaldos Creados

```sql
-- Respaldos de las últimas 24 horas
SELECT 
  backup_name,
  backup_type,
  backup_date,
  status,
  file_size / 1024 as size_kb
FROM data_backups
WHERE backup_date > NOW() - INTERVAL '24 hours'
ORDER BY backup_date DESC;

-- Estadísticas por usuario
SELECT 
  user_id,
  COUNT(*) as total_backups,
  SUM(file_size) / 1024 / 1024 as total_size_mb,
  MAX(backup_date) as last_backup
FROM data_backups
GROUP BY user_id;
```

### Verificar Estado del Cron Job

```sql
-- Ver próximas ejecuciones
SELECT jobid, schedule, command, nodename, nodeport, database, username, active
FROM cron.job
WHERE jobname = 'automatic-backups-daily';

-- Ver últimas ejecuciones
SELECT 
  jobid,
  runid,
  start_time,
  end_time,
  status,
  return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'automatic-backups-daily')
ORDER BY start_time DESC
LIMIT 10;
```

---

## 🧪 Testing Manual

### Probar Edge Function Localmente

```bash
# Iniciar Supabase local
supabase start

# Servir la función localmente
supabase functions serve automatic-backups

# En otra terminal, probar la función
curl -X POST \
  http://localhost:54321/functions/v1/automatic-backups \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### Probar en Producción

```bash
curl -X POST \
  https://YOUR_PROJECT_REF.supabase.co/functions/v1/automatic-backups \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

### Forzar Ejecución del Cron Job

```sql
-- Ejecutar manualmente (sin esperar al schedule)
SELECT trigger_automatic_backups();
```

---

## 🔧 Troubleshooting

### Problema: Cron job no se ejecuta

**Solución:**
```sql
-- Verificar que pg_cron está habilitado
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Si no está, habilitarlo
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Re-programar el job
SELECT cron.unschedule('automatic-backups-daily');
SELECT cron.schedule(
  'automatic-backups-daily',
  '0 2 * * *',
  $$SELECT trigger_automatic_backups();$$
);
```

### Problema: Edge Function falla

**Ver logs detallados:**
```bash
supabase functions logs automatic-backups --tail
```

**Verificar variables de entorno:**
```sql
SELECT current_setting('app.settings.supabase_url', true);
SELECT current_setting('app.settings.service_role_key', true);
```

### Problema: Respaldos muy grandes

**Solución:** Los respaldos muy grandes pueden fallar. Recomendaciones:
- Reducir frecuencia (semanal en vez de diario)
- Implementar respaldos incrementales
- Migrar a Supabase Storage en vez de JSONB

---

## 📅 Modificar Schedule del Cron

### Cambiar a cada 6 horas:
```sql
SELECT cron.unschedule('automatic-backups-daily');
SELECT cron.schedule(
  'automatic-backups-6h',
  '0 */6 * * *',
  $$SELECT trigger_automatic_backups();$$
);
```

### Cambiar a semanal (lunes 3 AM):
```sql
SELECT cron.unschedule('automatic-backups-daily');
SELECT cron.schedule(
  'automatic-backups-weekly',
  '0 3 * * 1',
  $$SELECT trigger_automatic_backups();$$
);
```

### Cambiar a mensual (día 1 de cada mes, 3 AM):
```sql
SELECT cron.unschedule('automatic-backups-daily');
SELECT cron.schedule(
  'automatic-backups-monthly',
  '0 3 1 * *',
  $$SELECT trigger_automatic_backups();$$
);
```

---

## 🔒 Seguridad

- ✅ Edge Function usa `SUPABASE_SERVICE_ROLE_KEY` para acceso completo
- ✅ RLS policies protegen datos por usuario
- ✅ Solo usuarios autenticados pueden crear/ver sus respaldos
- ⚠️ Service Role Key debe mantenerse segura y nunca exponerse al frontend

---

## 📈 Límites y Consideraciones

### Límites de Supabase:
- **Payload máximo:** 50 MB por respaldo
- **Timeout:** 60 segundos para Edge Function
- **pg_cron:** Máximo 1000 jobs programados

### Recomendaciones:
- Monitorear uso de almacenamiento regularmente
- Configurar retención apropiada (no más de 30-90 días)
- Considerar backups externos para compliance estricto
- Para datos muy grandes, usar Supabase Storage

---

## 🆘 Soporte

Si encuentras problemas:
1. Revisar logs de Edge Function
2. Verificar historial de cron jobs
3. Consultar tabla `data_backups` para errores
4. Revisar este documento para troubleshooting

---

**Última actualización:** 25 de Diciembre de 2024
