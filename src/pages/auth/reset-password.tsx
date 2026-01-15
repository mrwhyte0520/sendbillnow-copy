import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { resetPassword, updatePassword } = useAuth();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    // Verificar si hay un hash de recuperación en la URL
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');
    
    if (type === 'recovery') {
      setIsResetMode(true);
    }
  }, []);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!email) {
      setError('Please enter your email address.');
      setLoading(false);
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email.');
      setLoading(false);
      return;
    }

    try {
      const { error: resetError } = await resetPassword(email);

      if (resetError) {
        setError(resetError);
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
    } catch (err: any) {
      setError('We could not send the email. Please try again.');
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!newPassword || !confirmPassword) {
      setError('Please complete all the fields.');
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await updatePassword(newPassword);

      if (updateError) {
        setError(updateError);
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        navigate('/auth/login');
      }, 2000);
    } catch (err: any) {
      setError('We could not update your password. Please try again.');
      setLoading(false);
    }
  };

  if (success && !isResetMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#FDFBF3] via-white to-[#E7F2D9] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-[#008000]/10 rounded-full mb-6">
              <i className="ri-mail-send-line text-4xl text-[#008000]"></i>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Email sent!</h2>
            <p className="text-gray-600 mb-6">
              We sent a recovery link to <strong>{email}</strong>
            </p>
            <div className="bg-[#E7F2D9] border border-[#C7E5A8] rounded-lg p-4 mb-6">
              <p className="text-sm text-[#335322]">
                <i className="ri-information-line mr-2"></i>
                Please check your inbox and click the link to reset your password.
              </p>
            </div>
            <Link
              to="/auth/login"
              className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium hover:from-[#097509] hover:to-[#005300] transition-all whitespace-nowrap"
            >
              <i className="ri-arrow-left-line mr-2"></i>
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success && isResetMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#FDFBF3] via-white to-[#E7F2D9] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-[#008000]/10 rounded-full mb-6">
              <i className="ri-check-line text-4xl text-[#008000]"></i>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Password updated!</h2>
            <p className="text-gray-600 mb-6">
              Your password was updated successfully.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              You will be redirected to the sign-in page in a few seconds…
            </p>
            <Link
              to="/auth/login"
              className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium hover:from-[#097509] hover:to-[#005300] transition-all whitespace-nowrap"
            >
              <i className="ri-login-box-line mr-2"></i>
              Go to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FDFBF3] via-white to-[#E7F2D9] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo y título */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#0A8A0A] to-[#006B00] rounded-2xl mb-4">
              <i className={`${isResetMode ? 'ri-lock-password-line' : 'ri-lock-unlock-line'} text-3xl text-white`}></i>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {isResetMode ? 'Create new password' : 'Reset your password'}
            </h1>
            <p className="text-gray-600">
              {isResetMode
                ? 'Enter your new password'
                : 'We will send you a link to reset your password'}
            </p>
          </div>

          {/* Mensaje de error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <i className="ri-error-warning-line text-red-600 text-xl mr-3 mt-0.5"></i>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Formulario */}
          {!isResetMode ? (
            <form onSubmit={handleRequestReset} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email address
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
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent transition-all"
                    placeholder="you@email.com"
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white py-3 px-4 rounded-lg font-semibold hover:from-[#097509] hover:to-[#005300] focus:outline-none focus:ring-2 focus:ring-[#008000]/60 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap"
              >
                {loading ? (
                  <>
                    <i className="ri-loader-4-line animate-spin mr-2"></i>
                    Sending…
                  </>
                ) : (
                  <>
                    <i className="ri-mail-send-line mr-2"></i>
                    Send recovery link
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleUpdatePassword} className="space-y-6">
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  New password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <i className="ri-lock-line text-gray-400"></i>
                  </div>
                  <input
                    id="newPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
                  Confirm password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <i className="ri-lock-line text-gray-400"></i>
                  </div>
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white py-3 px-4 rounded-lg font-semibold hover:from-[#097509] hover:to-[#005300] focus:outline-none focus:ring-2 focus:ring-[#008000]/60 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap"
              >
                {loading ? (
                  <>
                    <i className="ri-loader-4-line animate-spin mr-2"></i>
                    Updating…
                  </>
                ) : (
                  <>
                    <i className="ri-check-line mr-2"></i>
                    Update password
                  </>
                )}
              </button>
            </form>
          )}

          {/* Volver al login */}
          <div className="mt-6 text-center">
            <Link
              to="/auth/login"
              className="text-sm font-semibold text-[#0A8A0A] hover:text-[#056105] transition-colors inline-flex items-center whitespace-nowrap"
            >
              <i className="ri-arrow-left-line mr-1"></i>
              Back to sign in
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} Send Bill Now. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
