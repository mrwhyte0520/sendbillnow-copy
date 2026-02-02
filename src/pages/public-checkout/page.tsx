import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

type CheckoutData = {
  token?: string | null;
  status?: string | null;
  payload?: any;
  expires_at?: string | null;
  customer_submitted_at?: string | null;
  invoice_public_token?: string | null;
};

export default function PublicCheckoutPage() {
  const { token } = useParams();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [checkout, setCheckout] = useState<CheckoutData | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [secondEmail, setSecondEmail] = useState('');

  const canSubmit = useMemo(() => {
    const n = fullName.trim();
    const e = email.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return n.length > 1 && emailPattern.test(e);
  }, [fullName, email]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      setSuccess('');
      setCheckout(null);

      if (!token) {
        setError('Invalid link.');
        setLoading(false);
        return;
      }

      try {
        const { data, error: rpcError } = await supabase.rpc('get_public_pos_checkout_by_token', {
          p_checkout_token: String(token),
        });
        if (rpcError) throw rpcError;
        if (!data) {
          setError('Checkout not found or expired.');
          setLoading(false);
          return;
        }
        setCheckout(data as any);
      } catch (e: any) {
        setError(e?.message || 'Could not load checkout');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async () => {
    if (!token) return;
    if (!canSubmit) {
      setError('Please enter your name and a valid email.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const { data, error: rpcError } = await supabase.rpc('submit_public_pos_checkout_details', {
        p_checkout_token: String(token),
        p_full_name: fullName.trim(),
        p_email: email.trim(),
        p_phone: phone.trim() || null,
        p_second_email: secondEmail.trim() || null,
      });
      if (rpcError) throw rpcError;
      if (!data || !(data as any)?.success) {
        throw new Error('Could not save details');
      }

      setSuccess('Saved. Please pay at the cashier. Your invoice will be emailed after payment.');
    } catch (e: any) {
      setError(e?.message || 'Could not save');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: '#0b1220' }}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-3xl rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
          <div
            className="px-6 py-5"
            style={{
              background:
                'radial-gradient(circle at 20% 20%, rgba(37,99,235,0.55), rgba(37,99,235,0.0) 55%), linear-gradient(135deg, rgba(15,23,42,0.95), rgba(2,132,199,0.55))',
            }}
          >
            <div className="text-2xl font-semibold text-white">Invoice details</div>
            <div className="text-sm text-white/80 mt-1">
              Fill in your details and we will email your invoice when the order is paid.
            </div>
          </div>

          <div className="bg-white p-6">
            {loading ? (
              <div className="text-gray-600 text-sm">Loading...</div>
            ) : null}

            {error ? (
              <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>
            ) : null}

            {success ? (
              <div className="mb-4 text-sm text-green-800 bg-green-50 border border-green-200 rounded-xl p-3">{success}</div>
            ) : null}

            {!loading && !error ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full name *</label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Enter your name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="name@email.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Optional"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Second email (optional)</label>
                  <input
                    value={secondEmail}
                    onChange={(e) => setSecondEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Optional"
                  />
                </div>

                <div className="md:col-span-2 flex items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFullName('');
                      setEmail('');
                      setPhone('');
                      setSecondEmail('');
                      setError('');
                      setSuccess('');
                    }}
                    className="px-5 py-3 rounded-2xl border border-gray-300 bg-white hover:bg-gray-50"
                  >
                    Skip
                  </button>

                  <button
                    type="button"
                    disabled={submitting || !canSubmit}
                    onClick={() => void handleSubmit()}
                    className="px-6 py-3 rounded-2xl text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg, #2563eb, #06b6d4)' }}
                  >
                    {submitting ? 'Saving…' : 'Save'}
                  </button>
                </div>

                {checkout?.status ? (
                  <div className="md:col-span-2 text-xs text-gray-500 pt-2">
                    Status: {String(checkout.status)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
