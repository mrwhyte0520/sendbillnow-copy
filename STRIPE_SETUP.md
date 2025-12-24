# Configuración de Stripe para Pagos de Planes

## 🔑 Claves de Stripe

Las claves de Stripe ya están configuradas en el código:

- **Clave Pública (Frontend)**: `pk_test_51ShnlT40CPO0GsETAkN5N69t74Ek1upquT65m69K6BMih11V4KjyrPqJ2NQ9we3uKspEM3UHMJ0s0edGjG5e2Zb100Y0I7kk6f`
- **Clave Secreta (Backend)**: `sk_test_51ShnlT40CPO0GsETq1rsp2QUIhmeJc6NzFFEjAERHvmbMWV3YabUdfJapGkm7NDvJx7M35p3bTyKvCf0vfFSfgaN00R7SKTzhH`

⚠️ **IMPORTANTE**: Estas son claves de TEST. Para producción, debes reemplazarlas con tus claves LIVE de Stripe.

## 📦 Instalación

Las dependencias de Stripe ya están instaladas:
```bash
npm install stripe @stripe/react-stripe-js
```

## 🚀 Despliegue de Edge Function

Para que los pagos funcionen, debes desplegar la Edge Function de Supabase:

```bash
# Instalar Supabase CLI si no lo tienes
npm install -g supabase

# Login a Supabase
supabase login

# Desplegar la función
supabase functions deploy create-payment-intent
```

## 🔧 Configuración

### 1. Variables de Entorno

Asegúrate de tener estas variables en tu archivo `.env`:

```env
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_ANON_KEY=tu_anon_key_de_supabase
```

### 2. Archivos Creados

- `src/services/stripe.ts` - Servicio de Stripe para el frontend
- `src/components/StripePaymentForm.tsx` - Componente de formulario de pago
- `supabase/functions/create-payment-intent/index.ts` - Edge Function para crear Payment Intents
- `src/pages/plans/page.tsx` - Actualizado con integración de Stripe

## 💳 Flujo de Pago

1. Usuario selecciona un plan en `/plans`
2. Se abre el modal de pago con el formulario de Stripe
3. Usuario ingresa los datos de su tarjeta
4. Se crea un Payment Intent en el backend (Edge Function)
5. Se confirma el pago con Stripe
6. Se actualiza la suscripción del usuario en la base de datos
7. Se envía notificación de compra

## 🧪 Tarjetas de Prueba

Para probar los pagos en modo TEST, usa estas tarjetas:

- **Éxito**: `4242 4242 4242 4242`
- **Requiere autenticación**: `4000 0025 0000 3155`
- **Declinada**: `4000 0000 0000 9995`

- **Fecha de expiración**: Cualquier fecha futura
- **CVC**: Cualquier 3 dígitos
- **ZIP**: Cualquier código postal

## 📊 Precios de Planes

Los precios están definidos en `src/services/stripe.ts`:

```typescript
export const PLAN_PRICES = {
  pyme: 1997,  // $19.97
  pro: 4997,   // $49.97
  plus: 9997   // $99.97
};
```

## 🔐 Seguridad

- Las claves secretas NUNCA deben estar en el frontend
- La Edge Function maneja la creación de Payment Intents de forma segura
- Stripe maneja toda la información sensible de tarjetas
- Los pagos están protegidos con encriptación de nivel bancario

## 📝 Webhooks (Opcional)

Para recibir eventos de Stripe (pagos exitosos, fallos, etc.), puedes configurar webhooks:

1. Ve a tu Dashboard de Stripe
2. Configura un webhook endpoint: `https://tu-proyecto.supabase.co/functions/v1/stripe-webhook`
3. Selecciona los eventos que quieres recibir
4. Crea una nueva Edge Function para manejar los webhooks

## 🌐 Producción

Para pasar a producción:

1. Obtén tus claves LIVE de Stripe
2. Reemplaza las claves en:
   - `src/services/stripe.ts` (clave pública)
   - `supabase/functions/create-payment-intent/index.ts` (clave secreta)
3. Despliega la Edge Function actualizada
4. Prueba con una tarjeta real
5. Configura webhooks para producción

## 📞 Soporte

Si tienes problemas con la integración de Stripe:
- Revisa la consola del navegador para errores
- Verifica los logs de la Edge Function en Supabase
- Consulta la documentación de Stripe: https://stripe.com/docs
