import { loadStripe } from '@stripe/stripe-js';
import type { Stripe } from '@stripe/stripe-js';

// Claves de Stripe (Test mode)
const STRIPE_PUBLIC_KEY = 'pk_test_51ShnlT40CPO0GsETAkN5N69t74Ek1upquT65m69K6BMih11V4KjyrPqJ2NQ9we3uKspEM3UHMJ0s0edGjG5e2Zb100Y0I7kk6f';

let stripePromise: Promise<Stripe | null>;

export const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(STRIPE_PUBLIC_KEY);
  }
  return stripePromise;
};

// Configuración de precios por plan (en centavos - USD)
// Los precios se pasan directamente desde el componente, aquí solo para referencia
export const PLAN_PRICES_MONTHLY = {
  'pyme': 3999,                  // USD $39.99
  'pro': 9999,                   // USD $99.99
  'plus': 19999,                 // USD $199.99
  'facturacion-simple': 1999,    // USD $19.99
  'facturacion-premium': 4999,   // USD $49.99
  'pos-basic': 9999,             // USD $99.99
  'pos-premium': 39999           // USD $399.99
};

export const PLAN_PRICES_ANNUAL = {
  'pyme': 23988,                 // USD $239.88
  'pro': 71988,                  // USD $719.88
  'plus': 155988,                // USD $1,559.88
  'facturacion-simple': 10788,   // USD $107.88
  'facturacion-premium': 23988,  // USD $239.88
  'pos-basic': 83992,            // USD $839.92
  'pos-premium': 335992          // USD $3,359.92
};

export const PLAN_NAMES = {
  'pyme': 'PYME',
  'pro': 'PRO',
  'plus': 'PLUS',
  'facturacion-simple': 'Facturación Simple',
  'facturacion-premium': 'Facturación Premium',
  'pos-basic': 'POS Basic',
  'pos-premium': 'POS Premium'
};

interface CreatePaymentIntentParams {
  planId: string;
  userId: string;
  userEmail: string;
}

// Esta función debería llamarse desde un backend seguro
// Por ahora la dejamos aquí pero en producción debe moverse a un Edge Function de Supabase
export const createPaymentIntent = async ({ planId, userId, userEmail }: CreatePaymentIntentParams) => {
  try {
    // En producción, esto debe ser una llamada a tu backend/edge function
    const response = await fetch('/api/create-payment-intent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        planId,
        userId,
        userEmail,
        amount: PLAN_PRICES_MONTHLY[planId as keyof typeof PLAN_PRICES_MONTHLY] || 0,
      }),
    });

    if (!response.ok) {
      throw new Error('Error al crear el payment intent');
    }

    const data = await response.json();
    return {
      clientSecret: data.clientSecret,
      paymentIntentId: data.paymentIntentId,
    };
  } catch (error) {
    console.error('Error creating payment intent:', error);
    throw error;
  }
};

export const confirmPayment = async (stripe: Stripe, clientSecret: string, paymentMethodId: string) => {
  try {
    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: paymentMethodId,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.paymentIntent;
  } catch (error) {
    console.error('Error confirming payment:', error);
    throw error;
  }
};
