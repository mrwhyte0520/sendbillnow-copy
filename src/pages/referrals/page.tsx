import { useEffect, useState, useMemo } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { referralsService } from '../../services/database';
import { formatAmount } from '../../utils/numberFormat';
import { toast } from 'sonner';

const MIN_PAYOUT_AMOUNT = 10; // Minimum payout amount in USD

export default function ReferralsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ code: string; visits: number; purchases: number; pending: number; paid: number }>({ code: '', visits: 0, purchases: 0, pending: 0, paid: 0 });
  const [paypalEmail, setPaypalEmail] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'commissions' | 'payouts'>('commissions');
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setError(null);
      try {
        const codeData = await referralsService.getOrCreateCode(user.id);
        if (codeData?.code) {
          setStats(prev => ({ ...prev, code: codeData.code }));
        }
        const st = await referralsService.getStats(user.id);
        setStats(st);
        const [list, payoutsList] = await Promise.all([
          referralsService.listCommissions(user.id),
          referralsService.listPayouts(user.id)
        ]);
        setPurchases(list);
        setPayouts(payoutsList);
      } catch (e: any) {
        console.error('Load referrals error', e);
        setError(e?.message || 'Error loading referral data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  // Calculate conversion rate
  const conversionRate = useMemo(() => {
    if (stats.visits === 0) return 0;
    return ((stats.purchases / stats.visits) * 100).toFixed(1);
  }, [stats.visits, stats.purchases]);

  // Total earnings
  const totalEarnings = useMemo(() => stats.pending + stats.paid, [stats.pending, stats.paid]);

  const handleCopy = async () => {
    try {
      if (!referralLink) return;
      await navigator.clipboard.writeText(referralLink);
      toast.success('Referral link copied to clipboard');
    } catch {
      toast.error('Could not copy the link');
    }
  };

  const handleShareTwitter = () => {
    const text = encodeURIComponent(`Try ContaBird, the best accounting software! Use my referral link: ${referralLink}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(`Try ContaBird, the best accounting software! Use my referral link: ${referralLink}`);
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
      toast.error('Enter your PayPal email');
      return;
    }
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (amount < MIN_PAYOUT_AMOUNT) {
      toast.error(`The minimum payout amount is $${MIN_PAYOUT_AMOUNT} USD`);
      return;
    }
    if (amount > stats.pending) {
      toast.error(`You do not have enough pending balance. Available: $${formatAmount(stats.pending)} USD`);
      return;
    }
    setSubmitting(true);
    try {
      await referralsService.requestPayout(user.id, paypalEmail, amount, 'USD');
      toast.success('Payout request submitted successfully');
      setPayoutAmount('');
      // Recargar datos
      const [st, payoutsList] = await Promise.all([
        referralsService.getStats(user.id),
        referralsService.listPayouts(user.id)
      ]);
      setStats(st);
      setPayouts(payoutsList);
    } catch (e) {
      toast.error('Error submitting payout request');
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
            <p className="mt-4 text-gray-600">Loading referrals...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
              <i className="ri-error-warning-line text-3xl text-red-600"></i>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Unable to load</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 bg-[#F8F3E7] min-h-full">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-[#5B6844] mb-1">Earn commissions for each purchase made with your link</p>
            <h1 className="text-2xl font-bold text-[#1F2618]">Referrals</h1>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="bg-[#F6F8ED] rounded-xl shadow-sm border border-[#E0E7C8] p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-[#5B6844]">Clicks</div>
                <div className="text-2xl font-bold text-[#1F2618]">{stats.visits}</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#E1E9C8] flex items-center justify-center">
                <i className="ri-cursor-line text-[#3B4A2A]"></i>
              </div>
            </div>
          </div>
          <div className="bg-[#F6F8ED] rounded-xl shadow-sm border border-[#E0E7C8] p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-[#5B6844]">Purchases</div>
                <div className="text-2xl font-bold text-[#1F2618]">{stats.purchases}</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#D9E7B5] flex items-center justify-center">
                <i className="ri-shopping-cart-line text-[#2F5020]"></i>
              </div>
            </div>
          </div>
          <div className="bg-[#F6F8ED] rounded-xl shadow-sm border border-[#E0E7C8] p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-[#5B6844]">Conversion</div>
                <div className="text-2xl font-bold text-[#51476F]">{conversionRate}%</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#ECE6F6] flex items-center justify-center">
                <i className="ri-percent-line text-[#51476F]"></i>
              </div>
            </div>
          </div>
          <div className="bg-[#F6F8ED] rounded-xl shadow-sm border border-[#E0E7C8] p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-[#5B6844]">Pending</div>
                <div className="text-2xl font-bold text-[#C28A21]">${formatAmount(stats.pending)}</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#F6E5C1] flex items-center justify-center">
                <i className="ri-time-line text-[#C28A21]"></i>
              </div>
            </div>
          </div>
          <div className="bg-[#F6F8ED] rounded-xl shadow-sm border border-[#E0E7C8] p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-[#5B6844]">Paid</div>
                <div className="text-2xl font-bold text-[#2F5020]">${formatAmount(stats.paid)}</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#D9E7B5] flex items-center justify-center">
                <i className="ri-check-double-line text-[#2F5020]"></i>
              </div>
            </div>
          </div>
          <div className="bg-[#F6F8ED] rounded-xl shadow-sm border border-[#E0E7C8] p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-[#5B6844]">Total Earned</div>
                <div className="text-2xl font-bold text-[#3B4A2A]">${formatAmount(totalEarnings)}</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#E1E9C8] flex items-center justify-center">
                <i className="ri-money-dollar-circle-line text-[#3B4A2A]"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
          <h2 className="text-lg font-semibold mb-3 text-[#1F2618]">Your referral link</h2>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              className="flex-1 p-3 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383] bg-[#FBF8EE]"
              value={referralLink}
              readOnly
            />
            <button onClick={handleCopy} className="px-4 py-2 bg-[#566738] text-white rounded-lg hover:bg-[#45532B] whitespace-nowrap flex items-center justify-center shadow shadow-[#566738]/30">
              <i className="ri-file-copy-line mr-2"></i>
              Copy
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-sm text-gray-500 mr-2">Share on:</span>
            <button
              onClick={handleShareWhatsApp}
              className="px-3 py-1.5 bg-[#3E4D2C] text-white rounded-lg hover:bg-[#2D3A1C] text-sm flex items-center shadow-sm"
            >
              <i className="ri-whatsapp-line mr-1"></i>
              WhatsApp
            </button>
            <button
              onClick={handleShareTwitter}
              className="px-3 py-1.5 bg-[#1F2616] text-white rounded-lg hover:bg-black text-sm flex items-center shadow-sm"
            >
              <i className="ri-twitter-x-line mr-1"></i>
              X / Twitter
            </button>
            <button
              onClick={handleShareLinkedIn}
              className="px-3 py-1.5 bg-[#3B4A6C] text-white rounded-lg hover:bg-[#2A3550] text-sm flex items-center shadow-sm"
            >
              <i className="ri-linkedin-line mr-1"></i>
              LinkedIn
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-3">Share this link. If the user buys a plan, you will earn a 20% commission.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-[#1F2618]">Request payout via PayPal</h2>
            <span className="text-sm text-[#5B6844]">
              Available: <span className="font-semibold text-[#2F5020]">${formatAmount(stats.pending)} USD</span>
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="email"
              placeholder="PayPal email"
              className="p-3 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383]"
              value={paypalEmail}
              onChange={(e) => setPaypalEmail(e.target.value)}
            />
            <input
              type="number"
              placeholder={`Minimum amount $${MIN_PAYOUT_AMOUNT} USD`}
              min={MIN_PAYOUT_AMOUNT}
              step="0.01"
              className="p-3 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383]"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
            />
            <button
              onClick={handleRequestPayout}
              disabled={submitting || stats.pending < MIN_PAYOUT_AMOUNT}
              className={`px-4 py-2 rounded-lg text-white whitespace-nowrap flex items-center justify-center ${
                submitting || stats.pending < MIN_PAYOUT_AMOUNT
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-[#3E4D2C] hover:bg-[#2D3A1C] shadow shadow-[#3E4D2C]/30'
              }`}
            >
              <i className="ri-paypal-line mr-2"></i>
              Request payout
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Minimum amount: ${MIN_PAYOUT_AMOUNT} USD. Payouts are processed in 5-7 business days.
          </p>
        </div>

        {/* Tabs for commissions and payout history */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8]">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('commissions')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'commissions'
                    ? 'border-[#566738] text-[#3B4A2A]'
                    : 'border-transparent text-gray-500 hover:text-[#384726] hover:border-[#C6B383]'
                }`}
              >
                <i className="ri-money-dollar-circle-line mr-2"></i>
                Commissions ({purchases.length})
              </button>
              <button
                onClick={() => setActiveTab('payouts')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'payouts'
                    ? 'border-[#566738] text-[#3B4A2A]'
                    : 'border-transparent text-gray-500 hover:text-[#384726] hover:border-[#C6B383]'
                }`}
              >
                <i className="ri-bank-line mr-2"></i>
                Payout History ({payouts.length})
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'commissions' && (
              <>
                {purchases.length === 0 ? (
                  <div className="text-center py-8">
                    <i className="ri-money-dollar-circle-line text-4xl text-gray-300 mb-2"></i>
                    <p className="text-sm text-[#5B6844]">There are no commissions yet.</p>
                    <p className="text-xs text-gray-400 mt-1">Share your link to start earning.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Date</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">User</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Plan</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Commission</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {purchases.map((p) => (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2">{new Date(p.created_at).toLocaleDateString()}</td>
                            <td className="px-4 py-2">{p.referee_name || p.referee_email || 'User'}</td>
                            <td className="px-4 py-2">{p.plan_id || 'Plan'}</td>
                            <td className="px-4 py-2 text-right font-medium">${formatAmount(Number(p.amount) || 0)}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                {p.status === 'paid' ? 'Paid' : 'Pending'}
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
                    <p className="text-sm text-[#5B6844]">You have not requested any payouts yet.</p>
                    <p className="text-xs text-gray-400 mt-1">When you have available balance, you’ll be able to request a payout.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Date</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">PayPal email</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Amount</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Status</th>
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
                                {p.status === 'paid' ? 'Paid' :
                                 p.status === 'rejected' ? 'Rejected' :
                                 p.status === 'processing' ? 'Processing' :
                                 'Requested'}
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

        {/* Program terms */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-6">
          <button
            onClick={() => setShowTerms(!showTerms)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <span className="font-semibold text-gray-900">
              <i className="ri-information-line mr-2 text-blue-600"></i>
              Referral Program Terms
            </span>
            <i className={`ri-arrow-${showTerms ? 'up' : 'down'}-s-line text-gray-500`}></i>
          </button>
          {showTerms && (
            <div className="px-4 pb-4 text-sm text-gray-600 space-y-2">
              <p><strong>1. Commission:</strong> You earn 20% of the first payment for every user who signs up through your link.</p>
              <p><strong>2. Attribution window:</strong> The referral must complete the purchase within 30 days of the first click.</p>
              <p><strong>3. Minimum amount:</strong> You must accumulate at least ${MIN_PAYOUT_AMOUNT} USD before requesting a payout.</p>
              <p><strong>4. Payments:</strong> Payouts are processed via PayPal within 5-7 business days after approval.</p>
              <p><strong>5. Restrictions:</strong> Self-referrals and spam are not allowed. Fraudulent commissions will be cancelled.</p>
              <p><strong>6. Validation:</strong> Commissions remain pending for 30 days to ensure there are no refunds.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
