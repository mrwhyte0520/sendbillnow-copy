import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function Register() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [isPaid, setIsPaid] = useState(false);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const plan = String(params.get('plan') || localStorage.getItem('selected_plan') || '').trim();
    if (plan) {
      setSelectedPlanId(plan);
      try {
        localStorage.setItem('selected_plan', plan);
      } catch {}
    }
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const sessionId = String(params.get('session_id') || '').trim();
    if (!sessionId) return;

    (async () => {
      setIsCheckingPayment(true);
      try {
        const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
        const resp = await fetch(`${apiBase}/api/get-checkout-session`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const data = await resp.json().catch(() => null);
        if (!resp.ok || !data?.ok) {
          throw new Error(data?.error || 'Could not verify payment session.');
        }
        const status = String(data?.session?.status || '');
        if (status === 'complete') {
          setIsPaid(true);
          try {
            localStorage.setItem('pending_checkout_session_id', sessionId);
          } catch {}
        }
      } catch (err: any) {
        setError(err?.message || 'Could not verify payment session.');
      } finally {
        setIsCheckingPayment(false);
      }
    })();
  }, [location.search]);

  const startCheckout = async () => {
    const planId = String(selectedPlanId || '').trim();
    if (!planId) {
      setError('Please select a plan first.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(formData.email)) {
      setError('Please enter a valid email');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
      const refCode = localStorage.getItem('ref_code') || undefined;
      const billingPeriod = localStorage.getItem('selected_billing') === 'annual' ? 'annual' : 'monthly';

      const resp = await fetch(`${apiBase}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          planId,
          billingPeriod,
          refCode,
          userEmail: formData.email,
        }),
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.url) {
        throw new Error(data?.error || 'Could not start checkout.');
      }

      window.location.href = data.url;
    } catch (err: any) {
      setError(err?.message || 'Could not start checkout. Please try again.');
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validaciones
    if (!formData.fullName || !formData.email || !formData.password || !formData.confirmPassword) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    if (!/\S+@\S+\.\S+/.test(formData.email)) {
      setError('Please enter a valid email');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (!isPaid) {
      setLoading(false);
      await startCheckout();
      return;
    }

    try {
      const { data, error: signUpError } = await signUp(
        formData.email,
        formData.password,
        formData.fullName
      );

      if (signUpError) {
        if (signUpError.includes('already registered')) {
          setError('This email is already registered');
        } else if (signUpError.includes('User already registered')) {
          setError('This email is already registered');
        } else {
          setError(signUpError);
        }
        setLoading(false);
        return;
      }

      if (data?.user) {
        setSuccess(true);
        // Esperar 3 segundos antes de redirigir
        setTimeout(() => {
          navigate('/auth/login');
        }, 3000);
      }
    } catch (err: any) {
      setError('Error creating account. Please try again.');
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-100 via-white to-stone-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
              <i className="ri-mail-check-line text-4xl text-green-600"></i>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Registration Successful!</h2>
            <p className="text-gray-600 mb-6">
              We have sent a confirmation email to <strong>{formData.email}</strong>
            </p>
            <div className="bg-[#008000]/10 border border-[#008000]/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-[#008000]">
                <i className="ri-information-line mr-2"></i>
                Please check your inbox and click the confirmation link to activate your account.
              </p>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              You will be redirected to login in a few seconds...
            </p>
            <Link
              to="/auth/login"
              className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-[#008000] to-[#008000] text-white rounded-lg font-medium hover:from-[#008000] hover:to-[#008000] transition-all whitespace-nowrap"
            >
              <i className="ri-login-box-line mr-2"></i>
              Go to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 via-white to-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo y título */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#008000] to-[#008000] rounded-2xl mb-4">
              <i className="ri-user-add-line text-3xl text-white"></i>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Account</h1>
            <p className="text-gray-600">Sign up to get started</p>
          </div>

          {/* Mensaje de error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <i className="ri-error-warning-line text-red-600 text-xl mr-3 mt-0.5"></i>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="ri-user-line text-gray-400"></i>
                </div>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  value={formData.fullName}
                  onChange={handleChange}
                  className="block w-full pl-10 pr-3 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent transition-all"
                  placeholder="John Doe"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="ri-mail-line text-gray-400"></i>
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="block w-full pl-10 pr-3 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent transition-all"
                  placeholder="tu@email.com"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="ri-lock-line text-gray-400"></i>
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleChange}
                  className="block w-full pl-10 pr-10 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent transition-all"
                  placeholder="Minimum 6 characters"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  disabled={loading}
                >
                  <i className={`${showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} text-gray-400 hover:text-gray-600`}></i>
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="ri-lock-line text-gray-400"></i>
                </div>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="block w-full pl-10 pr-10 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent transition-all"
                  placeholder="Repeat your password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  disabled={loading}
                >
                  <i className={`${showConfirmPassword ? 'ri-eye-off-line' : 'ri-eye-line'} text-gray-400 hover:text-gray-600`}></i>
                </button>
              </div>
            </div>

            <div className="flex items-start">
              <input
                id="terms"
                type="checkbox"
                required
                className="h-4 w-4 text-[#008000] focus:ring-[#008000] border-stone-300 rounded cursor-pointer mt-1"
                disabled={loading}
              />
              <label htmlFor="terms" className="ml-2 block text-sm text-gray-700 cursor-pointer">
                I accept the{' '}
                <a href="#" className="text-[#008000] hover:text-[#008000] font-medium whitespace-nowrap">
                  terms and conditions
                </a>{' '}
                and the{' '}
                <a href="#" className="text-[#008000] hover:text-[#008000] font-medium whitespace-nowrap">
                  privacy policy
                </a>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || isCheckingPayment}
              className="w-full bg-gradient-to-r from-[#008000] to-[#008000] text-white py-3 px-4 rounded-lg font-medium hover:from-[#008000] hover:to-[#008000] focus:outline-none focus:ring-2 focus:ring-[#008000] focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap"
            >
              {isCheckingPayment ? (
                <>
                  <i className="ri-loader-4-line animate-spin mr-2"></i>
                  Verifying payment...
                </>
              ) : loading ? (
                <>
                  <i className="ri-loader-4-line animate-spin mr-2"></i>
                  {isPaid ? 'Creating account...' : 'Redirecting to payment...'}
                </>
              ) : (
                <>
                  <i className="ri-user-add-line mr-2"></i>
                  {isPaid ? 'Create Account' : 'Continue to Payment'}
                </>
              )}
            </button>
          </form>

          {/* Login */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link
                to="/auth/login"
                className="font-medium text-[#008000] hover:text-[#008000] transition-colors whitespace-nowrap"
              >
                Sign in here
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            © 2024 Send Bill Now. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
