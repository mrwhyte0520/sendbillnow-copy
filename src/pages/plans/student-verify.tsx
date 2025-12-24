import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { usePlans } from '../../hooks/usePlans';
import { useAuth } from '../../hooks/useAuth';

function isInstitutionalEmail(email: string): boolean {
  const at = email.indexOf('@');
  if (at === -1) return false;
  const domain = email.slice(at + 1).toLowerCase();
  // Acepta dominios con .edu, .edu.xx, .ac.xx y variantes comunes
  return domain.includes('.edu') || domain.includes('.ac.');
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const STORAGE_KEY = 'contabi_student_verify_code';

export default function StudentVerifyPage() {
  const navigate = useNavigate();
  const { subscribeToPlan, canSelectPlan } = usePlans();
  useAuth();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    // clear transient
    setError(null);
  }, [email, code]);

  const canSubmit = useMemo(() => email.trim().length > 3 && isInstitutionalEmail(email.trim()), [email]);

  const handleSendCode = async () => {
    setError(null);
    if (!canSelectPlan()) {
      setError('No puedes seleccionar un plan en este momento.');
      return;
    }
    if (!canSubmit) {
      setError('Ingresa un correo institucional válido (ej: dominio .edu o .ac).');
      return;
    }
    try {
      setSending(true);
      const verificationCode = generateCode();
      const payload = {
        email: email.trim(),
        code: verificationCode,
        expiresAt: Date.now() + 15 * 60 * 1000 // 15 min
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setSentTo(email.trim());
      setInfo('Código enviado a tu correo institucional.');
      // En producción: enviar email real (Supabase Function / provider). Por ahora, para pruebas:
      // eslint-disable-next-line no-console
      console.log('[Student Verify] Código para', email.trim(), '=>', verificationCode);
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    setError(null);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { setError('Solicita un código primero.'); return; }
    try {
      setVerifying(true);
      const payload = JSON.parse(raw) as { email: string; code: string; expiresAt: number };
      if (payload.email.toLowerCase() !== email.trim().toLowerCase()) {
        setError('El correo no coincide con el código enviado.');
        return;
      }
      if (Date.now() > payload.expiresAt) {
        setError('El código ha expirado. Solicita uno nuevo.');
        return;
      }
      if (payload.code !== code.trim()) {
        setError('Código incorrecto.');
        return;
      }
      // Verificado: suscribir al plan estudiantil (gratis)
      const result = await subscribeToPlan('student');
      if (result?.success) {
        localStorage.removeItem(STORAGE_KEY);
        // Guardar expiración en 4 meses
        const now = new Date();
        const expiresAtDate = new Date(now);
        expiresAtDate.setMonth(expiresAtDate.getMonth() + 4);
        localStorage.setItem('contabi_student_expires_at', String(expiresAtDate.getTime()));
        localStorage.setItem('contabi_student_email', payload.email);
        alert('Verificación exitosa. Plan Estudiantil activado.');
        navigate('/plans');
      } else {
        setError(result?.error || 'No se pudo activar el plan.');
      }
    } catch (e) {
      setError('Ocurrió un error al verificar.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Verificación Estudiantil</h1>
        <p className="text-gray-600 mb-6">El plan Estudiantil es gratis, pero requiere confirmar un correo institucional.</p>

        <div className="space-y-4 bg-white border border-gray-200 rounded-lg p-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Correo institucional</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tuusuario@universidad.edu"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Aceptamos dominios .edu o .ac (ej. .edu.do, .ac.cr).</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSendCode}
              disabled={sending || !canSubmit}
              className={`px-4 py-2 rounded-lg text-white ${sending || !canSubmit ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {sending ? 'Enviando…' : 'Enviar código'}
            </button>
            {sentTo && (
              <div className="text-sm text-gray-600 self-center">Código enviado a {sentTo}</div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Código de verificación</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
          {info && <div className="text-sm text-green-600">{info}</div>}

          <div className="flex justify-end">
            <button
              onClick={handleVerify}
              disabled={verifying || code.length < 6 || !canSubmit}
              className={`px-4 py-2 rounded-lg text-white ${verifying || code.length < 6 || !canSubmit ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {verifying ? 'Verificando…' : 'Confirmar y activar plan'}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
