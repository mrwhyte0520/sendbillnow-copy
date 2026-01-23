import { loadStripe } from '@stripe/stripe-js';
import type { Stripe } from '@stripe/stripe-js';

const STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

let stripePromise: Promise<Stripe | null>;

export const getStripe = () => {
  if (!STRIPE_PUBLIC_KEY) {
    throw new Error('Missing VITE_STRIPE_PUBLISHABLE_KEY');
  }
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
export const createTestPaymentIntent = async (_planId: string, _amount: number) => {
  // Para modo testing, usamos Stripe Checkout en lugar de Payment Intents
  // Esto es más simple y no requiere backend
  return {
    clientSecret: 'test_secret', // Placeholder
    useCheckout: true // Flag para indicar que usamos Checkout
  };
};
