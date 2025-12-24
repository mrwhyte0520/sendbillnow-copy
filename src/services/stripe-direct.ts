import { loadStripe } from '@stripe/react-stripe-js';
import type { Stripe } from '@stripe/stripe-js';

// ⚠️ SOLO PARA TESTING - En producción usa Edge Functions
const STRIPE_PUBLIC_KEY = 'pk_test_51ShnlT40CPO0GsETAkN5N69t74Ek1upquT65m69K6BMih11V4KjyrPqJ2NQ9we3uKspEM3UHMJ0s0edGjG5e2Zb100Y0I7kk6f';

let stripePromise: Promise<Stripe | null>;

export const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(STRIPE_PUBLIC_KEY);
  }
  return stripePromise;
};

export const PLAN_PRICES = {
  pyme: 1997,
  pro: 4997,
  plus: 9997
};

// Versión simplificada para testing sin backend
// En producción, esto debe hacerse desde un servidor seguro
export const createTestPaymentIntent = async (planId: string, amount: number) => {
  // Para modo testing, usamos Stripe Checkout en lugar de Payment Intents
  // Esto es más simple y no requiere backend
  return {
    clientSecret: 'test_secret', // Placeholder
    useCheckout: true // Flag para indicar que usamos Checkout
  };
};
