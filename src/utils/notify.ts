/* ==========================================================
   WordNotiCenter Integration Service
   URL: https://web-noti-center.vercel.app
   
   Configuración requerida en .env.local:
   - VITE_NOTI_CENTER_API_KEY: API key de la aplicación en WordNotiCenter
   
   Para obtener el API key:
   1. Ir a https://web-noti-center.vercel.app/dashboard
   2. Crear una aplicación llamada "ContaBird"
   3. Copiar el API key generado
========================================================== */

const NOTI_CENTER_BASE_URL = 'https://web-noti-center.vercel.app/api/v1';

// Tipos
export type PlanNotifyPayload = {
  to: string;
  userEmail: string;
  planId: string;
  planName: string;
  amount: number;
  method: string;
  purchasedAt: string;
};

export type NotificationType = 'info' | 'success' | 'warning' | 'error';
export type NotificationPriority = 'low' | 'normal' | 'high';

export interface NotificationPayload {
  user_id: string;
  title: string;
  message: string;
  type?: NotificationType;
  priority?: NotificationPriority;
  data?: Record<string, any>;
}

// Obtener API key
function getApiKey(): string {
  return (import.meta as any).env?.VITE_NOTI_CENTER_API_KEY || '';
}

// Registrar usuario en WordNotiCenter (app_users)
export async function registerUserInNotiCenter(userId: string, email: string): Promise<boolean> {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return false;

    const response = await fetch(`${NOTI_CENTER_BASE_URL}/app-users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        external_user_id: userId,
        email: email
      })
    });

    return response.ok;
  } catch (e) {
    console.error('registerUserInNotiCenter error:', e);
    return false;
  }
}

// Enviar notificación genérica
export async function sendNotification(payload: NotificationPayload): Promise<boolean> {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      console.warn('VITE_NOTI_CENTER_API_KEY not configured');
      return false;
    }

    const response = await fetch(`${NOTI_CENTER_BASE_URL}/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        user_id: payload.user_id,
        title: payload.title,
        message: payload.message,
        type: payload.type || 'info',
        priority: payload.priority || 'normal',
        data: payload.data
      })
    });

    if (!response.ok) {
      console.error('WordNotiCenter notification failed:', await response.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('sendNotification error:', e);
    return false;
  }
}

// Notificar compra de plan (función específica)
export async function notifyPlanPurchase(payload: PlanNotifyPayload): Promise<void> {
  await sendNotification({
    user_id: 'admin', // Usuario admin que recibe las notificaciones de compra
    title: '🎉 Nueva compra de plan',
    message: `${payload.userEmail} compró el plan ${payload.planName} por $${payload.amount}`,
    type: 'success',
    priority: 'high',
    data: {
      event: 'plan_purchase',
      userEmail: payload.userEmail,
      planId: payload.planId,
      planName: payload.planName,
      amount: payload.amount,
      currency: 'USD',
      method: payload.method,
      purchasedAt: payload.purchasedAt,
      phone: payload.to
    }
  });
}

// Notificar nuevo registro de usuario
export async function notifyNewUser(email: string, userId?: string): Promise<void> {
  await sendNotification({
    user_id: 'admin',
    title: '👤 Nuevo usuario registrado',
    message: `Se registró un nuevo usuario: ${email}`,
    type: 'info',
    priority: 'normal',
    data: {
      event: 'user_registration',
      userEmail: email,
      userId: userId,
      registeredAt: new Date().toISOString()
    }
  });
}

// Notificar solicitud de retiro de referidos
export async function notifyReferralPayout(email: string, amount: number, paypalEmail: string): Promise<void> {
  await sendNotification({
    user_id: 'admin',
    title: '💰 Solicitud de retiro de referidos',
    message: `${email} solicitó retiro de $${amount} USD a PayPal: ${paypalEmail}`,
    type: 'warning',
    priority: 'high',
    data: {
      event: 'referral_payout_request',
      userEmail: email,
      amount: amount,
      currency: 'USD',
      paypalEmail: paypalEmail,
      requestedAt: new Date().toISOString()
    }
  });
}
