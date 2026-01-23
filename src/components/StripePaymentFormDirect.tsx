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

// Price is received as prop directly in USD
// It's converted to cents for Stripe

export default function StripePaymentFormDirect({
  planId: _planId,
  planName,
  amount,
  onSuccess: _onSuccess,
  onCancel,
  userId: _userId,
  userEmail: _userEmail,
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
      setError('Please complete the card information');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      throw new Error('Direct card payments are disabled. Please use Stripe Checkout.');
    } catch (err: any) {
      console.error('Payment error:', err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      });
      setError(err.message || 'Error processing payment');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
        <div className="flex items-start">
          <i className="ri-alert-line text-yellow-600 text-xl mr-2 mt-0.5"></i>
          <div className="text-sm text-yellow-800">
            <p className="font-medium mb-1">Direct Testing Mode</p>
            <p className="text-yellow-700">
              Using direct connection to Stripe API (testing only).
            </p>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-700 font-medium">Selected plan:</span>
          <span className="text-gray-900 font-bold">{planName}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-700 font-medium">Amount to pay:</span>
          <span className="text-2xl font-bold text-blue-600">USD ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Card information
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
            <p className="font-medium mb-1">Secure payment with Stripe</p>
            <p className="text-blue-700">
              Your information is protected with bank-level encryption.
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
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || isProcessing || !cardComplete}
          className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center"
        >
          {isProcessing ? (
            <>
              <i className="ri-loader-4-line animate-spin mr-2"></i>
              Processing...
            </>
          ) : (
            <>
              <i className="ri-secure-payment-line mr-2"></i>
              Pay USD ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-gray-500 text-center mt-4">
        By confirming the payment, you accept our terms and conditions of service.
      </p>
    </form>
  );
}
