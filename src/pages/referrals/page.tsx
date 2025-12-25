import { useEffect, useState, useMemo } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { referralsService } from '../../services/database';
import { formatAmount } from '../../utils/numberFormat';
import { toast } from 'sonner';
import { notifyReferralPayout } from '../../utils/notify';

const MIN_PAYOUT_AMOUNT = 10; // Monto mínimo de retiro en USD

export default function ReferralsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ code: string; visits: number; purchases: number; pending: number; paid: number }>({ code: '', visits: 0, purchases: 0, pending: 0, paid: 0 });
  const [paypalEmail, setPaypalEmail] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'commissions' | 'payouts'>('commissions');
  const [showTerms, setShowTerms] = useState(false);
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
  const [payouts, setPayouts] = useState<Array<{
    id: string;
    paypal_email: string;
    amount: number;
    currency: string;
    status: string;
    created_at: string;
  }>>([]);

  const baseUrl = 'https://www.contabird.com';

  const referralLink = stats.code ? `${baseUrl}/?ref=${stats.code}#pricing` : '';

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      try {
        await referralsService.getOrCreateCode(user.id);
        const st = await referralsService.getStats(user.id);
        setStats(st);
        const [list, payoutsList] = await Promise.all([
          referralsService.listCommissions(user.id),
          referralsService.listPayouts(user.id)
        ]);
        setPurchases(list);
        setPayouts(payoutsList);
      } catch (e) {
        console.error('Load referrals error', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  // Calcular tasa de conversión
  const conversionRate = useMemo(() => {
    if (stats.visits === 0) return 0;
    return ((stats.purchases / stats.visits) * 100).toFixed(1);
  }, [stats.visits, stats.purchases]);

  // Total de ganancias
  const totalEarnings = useMemo(() => stats.pending + stats.paid, [stats.pending, stats.paid]);

  const handleCopy = async () => {
    try {
      if (!referralLink) return;
      await navigator.clipboard.writeText(referralLink);
      toast.success('Enlace copiado al portapapeles');
    } catch {
      toast.error('No se pudo copiar el enlace');
    }
  };

  const handleShareTwitter = () => {
    const text = encodeURIComponent(`¡Prueba ContaBird, el mejor software de contabilidad! Usa mi enlace de referido: ${referralLink}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(`¡Prueba ContaBird, el mejor software de contabilidad! Usa mi enlace de referido: ${referralLink}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleShareLinkedIn = () => {
    const url = encodeURIComponent(referralLink);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank');
  };

  const handleRequestPayout = async () => {
    if (!user) return;
    const amount = parseFloat(payoutAmount || '0');
    if (!paypalEmail) {
      toast.error('Ingrese su correo de PayPal');
      return;
    }
    if (!amount || amount <= 0) {
      toast.error('Ingrese un monto válido');
      return;
    }
    if (amount < MIN_PAYOUT_AMOUNT) {
      toast.error(`El monto mínimo de retiro es $${MIN_PAYOUT_AMOUNT} USD`);
      return;
    }
    if (amount > stats.pending) {
      toast.error(`No tiene suficiente saldo pendiente. Disponible: $${formatAmount(stats.pending)} USD`);
      return;
    }
    setSubmitting(true);
    try {
      await referralsService.requestPayout(user.id, paypalEmail, amount, 'USD');
      toast.success('Solicitud de retiro enviada correctamente');
      setPayoutAmount('');
      // Notificar a WordNotiCenter
      await notifyReferralPayout(user.email || '', amount, paypalEmail);
      // Recargar datos
      const [st, payoutsList] = await Promise.all([
        referralsService.getStats(user.id),
        referralsService.listPayouts(user.id)
      ]);
      setStats(st);
      setPayouts(payoutsList);
    } catch (e) {
      toast.error('Error al solicitar retiro');
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

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Clics</div>
                <div className="text-2xl font-bold text-gray-900">{stats.visits}</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <i className="ri-cursor-line text-blue-600"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Compras</div>
                <div className="text-2xl font-bold text-gray-900">{stats.purchases}</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <i className="ri-shopping-cart-line text-green-600"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Conversión</div>
                <div className="text-2xl font-bold text-purple-600">{conversionRate}%</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <i className="ri-percent-line text-purple-600"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Pendiente</div>
                <div className="text-2xl font-bold text-yellow-600">${formatAmount(stats.pending)}</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                <i className="ri-time-line text-yellow-600"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Pagado</div>
                <div className="text-2xl font-bold text-green-600">${formatAmount(stats.paid)}</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <i className="ri-check-double-line text-green-600"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Total Ganado</div>
                <div className="text-2xl font-bold text-blue-600">${formatAmount(totalEarnings)}</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <i className="ri-money-dollar-circle-line text-blue-600"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Tu enlace de referidos</h2>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
              value={referralLink}
              readOnly
            />
            <button onClick={handleCopy} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap flex items-center justify-center">
              <i className="ri-file-copy-line mr-2"></i>
              Copiar
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-sm text-gray-500 mr-2">Compartir en:</span>
            <button
              onClick={handleShareWhatsApp}
              className="px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm flex items-center"
            >
              <i className="ri-whatsapp-line mr-1"></i>
              WhatsApp
            </button>
            <button
              onClick={handleShareTwitter}
              className="px-3 py-1.5 bg-black text-white rounded-lg hover:bg-gray-800 text-sm flex items-center"
            >
              <i className="ri-twitter-x-line mr-1"></i>
              X / Twitter
            </button>
            <button
              onClick={handleShareLinkedIn}
              className="px-3 py-1.5 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm flex items-center"
            >
              <i className="ri-linkedin-line mr-1"></i>
              LinkedIn
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-3">Comparte este enlace. Si el usuario compra un plan, recibirás comisión del 20%.</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Solicitar retiro por PayPal</h2>
            <span className="text-sm text-gray-500">
              Disponible: <span className="font-semibold text-green-600">${formatAmount(stats.pending)} USD</span>
            </span>
          </div>
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
              placeholder={`Monto mínimo $${MIN_PAYOUT_AMOUNT} USD`}
              min={MIN_PAYOUT_AMOUNT}
              step="0.01"
              className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
            />
            <button
              onClick={handleRequestPayout}
              disabled={submitting || stats.pending < MIN_PAYOUT_AMOUNT}
              className={`px-4 py-2 rounded-lg text-white whitespace-nowrap flex items-center justify-center ${submitting || stats.pending < MIN_PAYOUT_AMOUNT ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
            >
              <i className="ri-paypal-line mr-2"></i>
              Solicitar retiro
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Monto mínimo: ${MIN_PAYOUT_AMOUNT} USD. Pagos procesados en 5-7 días hábiles.
          </p>
        </div>

        {/* Tabs para Comisiones e Historial de Retiros */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('commissions')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'commissions'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="ri-money-dollar-circle-line mr-2"></i>
                Comisiones ({purchases.length})
              </button>
              <button
                onClick={() => setActiveTab('payouts')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'payouts'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="ri-bank-line mr-2"></i>
                Historial de Retiros ({payouts.length})
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'commissions' && (
              <>
                {purchases.length === 0 ? (
                  <div className="text-center py-8">
                    <i className="ri-money-dollar-circle-line text-4xl text-gray-300 mb-2"></i>
                    <p className="text-sm text-gray-500">Aún no hay comisiones registradas.</p>
                    <p className="text-xs text-gray-400 mt-1">Comparte tu enlace para empezar a ganar.</p>
                  </div>
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
                            <td className="px-4 py-2">{new Date(p.created_at).toLocaleDateString()}</td>
                            <td className="px-4 py-2">{p.referee_name || p.referee_email || 'Usuario'}</td>
                            <td className="px-4 py-2">{p.plan_id || 'Plan'}</td>
                            <td className="px-4 py-2 text-right font-medium">${formatAmount(Number(p.amount) || 0)}</td>
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
              </>
            )}

            {activeTab === 'payouts' && (
              <>
                {payouts.length === 0 ? (
                  <div className="text-center py-8">
                    <i className="ri-bank-line text-4xl text-gray-300 mb-2"></i>
                    <p className="text-sm text-gray-500">Aún no has solicitado retiros.</p>
                    <p className="text-xs text-gray-400 mt-1">Cuando tengas saldo disponible, podrás solicitar un retiro.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Fecha</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Correo PayPal</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Monto</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Estatus</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {payouts.map((p) => (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2">{new Date(p.created_at).toLocaleDateString()}</td>
                            <td className="px-4 py-2">{p.paypal_email}</td>
                            <td className="px-4 py-2 text-right font-medium">${formatAmount(Number(p.amount) || 0)}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                p.status === 'paid' ? 'bg-green-100 text-green-800' :
                                p.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                p.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {p.status === 'paid' ? 'Pagado' :
                                 p.status === 'rejected' ? 'Rechazado' :
                                 p.status === 'processing' ? 'Procesando' :
                                 'Solicitado'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Términos del Programa */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-6">
          <button
            onClick={() => setShowTerms(!showTerms)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <span className="font-semibold text-gray-900">
              <i className="ri-information-line mr-2 text-blue-600"></i>
              Términos del Programa de Referidos
            </span>
            <i className={`ri-arrow-${showTerms ? 'up' : 'down'}-s-line text-gray-500`}></i>
          </button>
          {showTerms && (
            <div className="px-4 pb-4 text-sm text-gray-600 space-y-2">
              <p><strong>1. Comisión:</strong> Recibes el 20% del primer pago de cada usuario que se registre usando tu enlace.</p>
              <p><strong>2. Ventana de atribución:</strong> El referido debe completar la compra dentro de 30 días desde el primer clic.</p>
              <p><strong>3. Monto mínimo:</strong> Debes acumular al menos ${MIN_PAYOUT_AMOUNT} USD para solicitar un retiro.</p>
              <p><strong>4. Pagos:</strong> Los retiros se procesan vía PayPal en 5-7 días hábiles después de aprobación.</p>
              <p><strong>5. Restricciones:</strong> No se permiten auto-referidos ni spam. Las comisiones fraudulentas serán canceladas.</p>
              <p><strong>6. Validación:</strong> Las comisiones permanecen pendientes por 30 días para validar que no haya reembolsos.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
