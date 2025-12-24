import { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import type { StripeCardElementChangeEvent } from '@stripe/stripe-js';

interface StripePaymentFormProps {
  planId: string;
  planName: string;
  amount: number;
  onSuccess: () => void;
  onCancel: () => void;
  userId: string;
  userEmail: string;
}

export default function StripePaymentForm({
  planId,
  planName,
  amount,
  onSuccess,
  onCancel,
  userId,
  userEmail,
}: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);

  const handleCardChange = (event: StripeCardElementChangeEvent) => {
    setCardComplete(event.complete);
    if (event.error) {
      setError(event.error.message);
    } else {
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      console.error('Stripe not loaded');
      return;
    }

    if (!cardComplete) {
      setError('Por favor completa la información de la tarjeta');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      console.log('Starting payment process...', { planId, userId, userEmail });
      
      // Obtener el CardElement
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('No se pudo obtener el elemento de tarjeta');
      }

      console.log('Calling Edge Function...');

      // Crear Payment Intent desde el backend
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          planId,
          userId,
          userEmail,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
        console.error('Edge Function error:', errorData);
        throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Payment Intent created:', data);
      const { clientSecret } = data;

      // Confirmar el pago
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            email: userEmail,
          },
        },
      });

      if (stripeError) {
        console.error('Stripe confirmation error:', stripeError);
        throw new Error(stripeError.message);
      }

      console.log('Payment Intent status:', paymentIntent?.status);

      if (paymentIntent?.status === 'succeeded') {
        console.log('Payment succeeded!');
        onSuccess();
      } else {
        throw new Error(`El pago no se completó correctamente. Estado: ${paymentIntent?.status || 'desconocido'}`);
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      });
      setError(err.message || 'Error al procesar el pago');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-700 font-medium">Plan seleccionado:</span>
          <span className="text-gray-900 font-bold">{planName}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-700 font-medium">Monto a pagar:</span>
          <span className="text-2xl font-bold text-blue-600">${amount.toFixed(2)} USD</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Información de la tarjeta
        </label>
        <div className="border border-gray-300 rounded-lg p-3 bg-white">
          <CardElement
            onChange={handleCardChange}
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#424770',
                  '::placeholder': {
                    color: '#aab7c4',
                  },
                },
                invalid: {
                  color: '#9e2146',
                },
              },
            }}
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex items-center">
            <i className="ri-error-warning-line text-xl mr-2"></i>
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-start">
          <i className="ri-shield-check-line text-blue-600 text-xl mr-2 mt-0.5"></i>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Pago seguro con Stripe</p>
            <p className="text-blue-700">
              Tu información está protegida con encriptación de nivel bancario.
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!stripe || isProcessing || !cardComplete}
          className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center"
        >
          {isProcessing ? (
            <>
              <i className="ri-loader-4-line animate-spin mr-2"></i>
              Procesando...
            </>
          ) : (
            <>
              <i className="ri-secure-payment-line mr-2"></i>
              Pagar ${amount.toFixed(2)}
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-gray-500 text-center mt-4">
        Al confirmar el pago, aceptas nuestros términos y condiciones de servicio.
      </p>
    </form>
  );
}
