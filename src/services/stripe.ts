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

// Configuración de precios por plan (en centavos)
export const PLAN_PRICES = {
  pyme: 1997, // $19.97
  pro: 4997,  // $49.97
  plus: 9997  // $99.97
};

export const PLAN_NAMES = {
  pyme: 'Plan PYME',
  pro: 'Plan PRO',
  plus: 'Plan PLUS'
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
        amount: PLAN_PRICES[planId as keyof typeof PLAN_PRICES],
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
