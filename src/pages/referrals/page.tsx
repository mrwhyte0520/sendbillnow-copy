import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { referralsService } from '../../services/database';
import { formatAmount } from '../../utils/numberFormat';

export default function ReferralsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ code: string; visits: number; purchases: number; pending: number; paid: number }>({ code: '', visits: 0, purchases: 0, pending: 0, paid: 0 });
  const [paypalEmail, setPaypalEmail] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [purchases, setPurchases] = useState<Array<{
    id: string;
    referee_user_id: string | null;
    plan_id: string | null;
    amount: number;
    currency: string;
    status: string;
    created_at: string;
    referee_email?: string | null;
    referee_name?: string | null;
  }>>([]);

  const baseUrl = useMemo(() => {
    const configured = (import.meta as any)?.env?.VITE_PUBLIC_SITE_URL as string | undefined;
    if (configured && typeof configured === 'string') return configured.replace(/\/$/, '');
    if (typeof window !== 'undefined') return window.location.origin;
    return 'https://www.contabird.com';
  }, []);

  const referralLink = stats.code ? `${baseUrl}/?ref=${stats.code}#pricing` : '';

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      try {
        await referralsService.getOrCreateCode(user.id);
        const st = await referralsService.getStats(user.id);
        setStats(st);
        const list = await referralsService.listCommissions(user.id);
        setPurchases(list);
      } catch (e) {
        console.error('Load referrals error', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const handleCopy = async () => {
    try {
      if (!referralLink) return;
      await navigator.clipboard.writeText(referralLink);
      alert('Enlace copiado al portapapeles');
    } catch {}
  };

  const handleRequestPayout = async () => {
    if (!user) return;
    const amount = parseFloat(payoutAmount || '0');
    if (!paypalEmail || !amount || amount <= 0) {
      alert('Ingrese correo de PayPal y monto mayor a 0');
      return;
    }
    setSubmitting(true);
    try {
      await referralsService.requestPayout(user.id, paypalEmail, amount, 'USD');
      alert('Solicitud de retiro enviada');
      setPayoutAmount('');
    } catch (e) {
      alert('Error al solicitar retiro');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando referidos...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-sm text-gray-600 mb-1">Gana comisiones por cada compra realizada con tu enlace</p>
            <h1 className="text-2xl font-bold text-gray-900">Referidos</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="text-sm text-gray-500">Clics</div>
            <div className="text-3xl font-bold">{stats.visits}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="text-sm text-gray-500">Compras</div>
            <div className="text-3xl font-bold">{stats.purchases}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="text-sm text-gray-500">Pendiente (USD)</div>
            <div className="text-3xl font-bold">{formatAmount(stats.pending)}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="text-sm text-gray-500">Pagado (USD)</div>
            <div className="text-3xl font-bold">{formatAmount(stats.paid)}</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Tu enlace de referidos</h2>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={referralLink}
              readOnly
            />
            <button onClick={handleCopy} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap">
              Copiar
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">Comparte este enlace. Si el usuario compra un plan, recibirás comisión.</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-3">Solicitar retiro por PayPal</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="email"
              placeholder="Correo de PayPal"
              className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={paypalEmail}
              onChange={(e) => setPaypalEmail(e.target.value)}
            />
            <input
              type="number"
              placeholder="Monto (USD)"
              min="0"
              step="0.01"
              className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
            />
            <button
              onClick={handleRequestPayout}
              disabled={submitting}
              className={`px-4 py-2 rounded-lg text-white whitespace-nowrap ${submitting ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
            >
              Solicitar retiro
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">Pagos sujetos a revisión. Evita auto-referidos. Ventana de atribución: 30 días.</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
          <h2 className="text-lg font-semibold mb-3">Compras registradas por tu enlace</h2>
          {purchases.length === 0 ? (
            <p className="text-sm text-gray-500">Aún no hay compras registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Fecha</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Usuario</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Plan</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Comisión</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Estatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">{new Date(p.created_at).toLocaleString()}</td>
                      <td className="px-4 py-2">{p.referee_name || p.referee_email || p.referee_user_id || 'Usuario'}</td>
                      <td className="px-4 py-2">{p.plan_id || 'Plan'}</td>
                      <td className="px-4 py-2 text-right">{`${p.currency} ${formatAmount(Number(p.amount) || 0)}`}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {p.status === 'paid' ? 'Pagado' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
