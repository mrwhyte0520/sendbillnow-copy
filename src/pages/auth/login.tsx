import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

export default function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Animation states
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [cardTransform, setCardTransform] = useState({ rotateX: 0, rotateY: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Trigger entrance animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Parallax effect on mouse move (very subtle)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 20;
      const y = (e.clientY / window.innerHeight - 0.5) * 20;
      setMousePosition({ x, y });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // 3D Tilt effect on card
  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -8;
    const rotateY = ((x - centerX) / centerX) * 8;
    setCardTransform({ rotateX, rotateY });
  };

  const handleCardMouseLeave = () => {
    setCardTransform({ rotateX: 0, rotateY: 0 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validaciones
    if (!email || !password) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email');
      setLoading(false);
      return;
    }

    try {
      const { data, error: signInError } = await signIn(email, password);

      if (signInError) {
        if (signInError.includes('Invalid login credentials')) {
          setError('Incorrect email or password');
        } else if (signInError.includes('Email not confirmed')) {
          setError('Please confirm your email before signing in');
        } else {
          setError(signInError);
        }
        setLoading(false);
        return;
      }

      if (data?.user) {
        if (Boolean((data.user as any)?.user_metadata?.htc_portal_only)) {
          try { localStorage.setItem('htc_portal_only', '1'); } catch {}
          navigate('/htc/service-hours');
          return;
        }

        try {
          const { data: roleRows, error: roleErr } = await supabase
            .from('user_roles')
            .select('id, roles!inner(name)')
            .eq('user_id', data.user.id);

          const isHtcRole = !roleErr && Array.isArray(roleRows) && roleRows.some((r: any) => String((r as any)?.roles?.name || '').toLowerCase() === 'htc_portal');
          if (isHtcRole) {
            try { localStorage.setItem('htc_portal_only', '1'); } catch {}
            navigate('/htc/service-hours');
            return;
          }
        } catch {
        }

        const pendingSessionId = localStorage.getItem('pending_checkout_session_id');
        if (pendingSessionId) {
          try {
            const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
            const resp = await fetch(`${apiBase}/api/claim-checkout-session`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                sessionId: pendingSessionId,
                userId: data.user.id,
                userEmail: data.user.email,
              }),
            });
            const claimData = await resp.json().catch(() => null);
            if (!resp.ok || !claimData?.ok) {
              throw new Error(claimData?.error || 'Could not apply plan after checkout.');
            }
            localStorage.removeItem('pending_checkout_session_id');
          } catch (claimErr: any) {
            console.error('Error claiming checkout session:', claimErr);
            alert(claimErr?.message || 'Could not apply the purchased plan. Please contact support.');
          }
        }

        try {
          const { data: urow } = await supabase
            .from('users')
            .select('htc_portal_only')
            .eq('id', data.user.id)
            .maybeSingle();
          if (Boolean((urow as any)?.htc_portal_only)) {
            try { localStorage.setItem('htc_portal_only', '1'); } catch {}
            navigate('/htc/service-hours');
            return;
          }
        } catch {
        }

        // Not an HTC portal-only user: clear any stale cache from previous sessions.
        try { localStorage.removeItem('htc_portal_only'); } catch {}

        // Check if there's a selected plan from landing page
        const selectedPlan = localStorage.getItem('selected_plan');
        if (selectedPlan) {
          // Clear the stored plan and redirect to plans page
          localStorage.removeItem('selected_plan');
          localStorage.removeItem('selected_billing');
          navigate('/plans');
        } else {
          // Redirigir al dashboard
          navigate('/dashboard');
        }
      }
    } catch (err: any) {
      setError('Login error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 via-white to-stone-50 flex items-center justify-center p-4 overflow-hidden relative">
      {/* Parallax background elements */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: `translate(${mousePosition.x}px, ${mousePosition.y}px)`,
          transition: 'transform 0.3s ease-out',
        }}
      >
        <div className="absolute top-20 left-20 w-64 h-64 bg-[#008000]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-[#008000]/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/4 w-40 h-40 bg-emerald-200/20 rounded-full blur-2xl" />
      </div>

      <div 
        className={`w-full max-w-md transition-all duration-700 ease-out ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
        style={{ perspective: '1000px' }}
      >
        <div 
          ref={cardRef}
          onMouseMove={handleCardMouseMove}
          onMouseLeave={handleCardMouseLeave}
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 transition-all duration-200 ease-out"
          style={{
            transform: `rotateX(${cardTransform.rotateX}deg) rotateY(${cardTransform.rotateY}deg)`,
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Logo y título */}
          <div 
            className={`text-center mb-8 transition-all duration-500 delay-100 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
            }`}
          >
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#008000] to-[#006400] rounded-2xl mb-4 shadow-lg shadow-[#008000]/25 transition-transform duration-300 hover:scale-110">
              <i className="ri-shield-user-line text-3xl text-white"></i>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome</h1>
            <p className="text-gray-600">Sign in to your account</p>
          </div>

          {/* Mensaje de error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <i className="ri-error-warning-line text-red-600 text-xl mr-3 mt-0.5"></i>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div 
              className={`transition-all duration-500 delay-200 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
            >
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="ri-mail-line text-gray-400"></i>
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent transition-all"
                  placeholder="tu@email.com"
                  disabled={loading}
                />
              </div>
            </div>

            <div 
              className={`transition-all duration-500 delay-300 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
            >
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="ri-lock-line text-gray-400"></i>
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent transition-all"
                  placeholder="••••••••"
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

            <div 
              className={`flex items-center justify-between transition-all duration-500 delay-[350ms] ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
            >
              <div className="flex items-center">
                <input
                  id="remember"
                  type="checkbox"
                  className="h-4 w-4 text-[#008000] focus:ring-[#008000] border-stone-300 rounded cursor-pointer transition-transform duration-200 hover:scale-110"
                />
                <label htmlFor="remember" className="ml-2 block text-sm text-gray-700 cursor-pointer">
                  Remember me
                </label>
              </div>
              <Link
                to="/auth/reset-password"
                className="text-sm font-medium text-[#008000] hover:text-[#006400] transition-all duration-300 whitespace-nowrap hover:underline underline-offset-2"
              >
                Forgot your password?
              </Link>
            </div>

            <div 
              className={`transition-all duration-500 delay-[400ms] ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
            >
            <button
              type="submit"
              disabled={loading}
              className="group w-full bg-gradient-to-r from-[#008000] to-[#006400] text-white py-3 px-4 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-[#008000] focus:ring-offset-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap hover:scale-[1.02] hover:shadow-lg hover:shadow-[#008000]/30 active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <i className="ri-loader-4-line animate-spin mr-2"></i>
                  Signing in...
                </>
              ) : (
                <>
                  <i className="ri-login-box-line mr-2 transition-transform duration-300 group-hover:translate-x-1"></i>
                  Sign In
                </>
              )}
            </button>
            </div>
          </form>

          {/* Registro */}
          <div 
            className={`mt-6 text-center transition-all duration-500 delay-500 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <a
                href="/#pricing"
                className="font-medium text-[#008000] hover:text-[#006400] transition-all duration-300 whitespace-nowrap hover:underline underline-offset-2"
              >
                Sign up here
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div 
        className={`absolute bottom-6 left-0 right-0 text-center transition-all duration-700 delay-700 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <p className="text-sm text-gray-500">
          © 2024 Send Bill Now. All rights reserved.
        </p>
      </div>
    </div>
  );
}
