import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

type PageState = 'loading' | 'form' | 'success' | 'error';

export default function CompleteProfilePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [customerPhone, setCustomerPhone] = useState('');

  // Form fields
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [phone, setPhone] = useState('');

  const formatPhone = (raw: string) => {
    const digits = (raw || '').replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const validateToken = useCallback(async () => {
    if (!token) {
      setErrorMessage('No token provided. This link is invalid.');
      setPageState('error');
      return;
    }

    try {
      const resp = await fetch('/api/validate-customer-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        setErrorMessage(data.error || 'This link has expired or has already been used.');
        setPageState('error');
        return;
      }

      setCustomerPhone(data.customer?.phone || '');
      setPhone(data.customer?.phone || '');
      setPageState('form');
    } catch {
      setErrorMessage('Could not validate this link. Please try again later.');
      setPageState('error');
    }
  }, [token]);

  useEffect(() => {
    validateToken();
  }, [validateToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!businessName.trim()) { alert('Business Name is required'); return; }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { alert('A valid email is required'); return; }
    if (!address.trim()) { alert('Address is required'); return; }
    if (!city.trim()) { alert('City is required'); return; }
    if (!state.trim()) { alert('State is required'); return; }
    if (!zip.trim()) { alert('Zip code is required'); return; }

    setSubmitting(true);

    try {
      const resp = await fetch('/api/complete-customer-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          businessName: businessName.trim(),
          email: email.trim(),
          address: address.trim(),
          city: city.trim(),
          state: state.trim(),
          zip: zip.trim(),
          phone: phone.trim(),
        }),
      });

      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        alert(data.error || 'Error submitting your information. Please try again.');
        setSubmitting(false);
        return;
      }

      setPageState('success');
    } catch {
      alert('Network error. Please check your connection and try again.');
      setSubmitting(false);
    }
  };

  // ─── Loading ───
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f7f0df] to-[#e8e0cc] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2f3e1e] mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Validating your link...</p>
        </div>
      </div>
    );
  }

  // ─── Error ───
  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f7f0df] to-[#e8e0cc] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link Invalid</h1>
          <p className="text-gray-600">{errorMessage}</p>
        </div>
      </div>
    );
  }

  // ─── Success ───
  if (pageState === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f7f0df] to-[#e8e0cc] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Profile Completed!</h1>
          <p className="text-gray-600">
            Thank you for completing your information. Your profile has been updated successfully.
          </p>
        </div>
      </div>
    );
  }

  // ─── Form ───
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f7f0df] to-[#e8e0cc] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#2f3e1e] to-[#4a5e35] px-6 py-5 text-center">
          <h1 className="text-xl font-bold text-white">Complete Your Profile</h1>
          <p className="text-[#d6cfbf] text-sm mt-1">Please fill in the fields below to complete your registration</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Business Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Business Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] transition-colors"
              placeholder="Your business name"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] transition-colors"
              placeholder="email@example.com"
              required
            />
          </div>

          {/* Phone (pre-filled) */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Phone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] transition-colors bg-gray-50"
              placeholder="555-555-5555"
            />
            {customerPhone && (
              <p className="text-xs text-gray-400 mt-1">Pre-filled from your registration</p>
            )}
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Address <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] transition-colors resize-none"
              placeholder="Street address"
              required
            />
          </div>

          {/* City, State, Zip */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                City <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] transition-colors"
                placeholder="City"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                State <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] transition-colors"
                placeholder="State"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Zip <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] transition-colors"
                placeholder="Zip"
                required
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 bg-[#2f3e1e] text-white font-semibold rounded-lg hover:bg-[#4a5e35] focus:ring-2 focus:ring-offset-2 focus:ring-[#2f3e1e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Submitting...
              </span>
            ) : (
              'Complete Profile'
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="px-6 pb-4 text-center">
          <p className="text-xs text-gray-400">Powered by Send Bill Now</p>
        </div>
      </div>
    </div>
  );
}
