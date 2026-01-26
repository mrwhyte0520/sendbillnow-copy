import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';
import { customersService, invoicesService, recurringSubscriptionsService } from '../../../services/database';

export default function RecurringBillingPage() {
  const { user } = useAuth();
  const [showNewSubscriptionModal, setShowNewSubscriptionModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; email: string }>>([]);

  const [editingSubscriptionId, setEditingSubscriptionId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [frequency, setFrequency] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [applyItbis, setApplyItbis] = useState(true);
  const [itbisRate, setItbisRate] = useState<number>(18);

  const [formErrors, setFormErrors] = useState<{ customer?: string; service?: string; amount?: string; frequency?: string; startDate?: string }>({});

  const loadData = async () => {
    if (!user?.id) return;
    try {
      const [subs, custs] = await Promise.all([
        recurringSubscriptionsService.getAll(user.id),
        customersService.getAll(user.id),
      ]);

      setSubscriptions(subs);
      setCustomers(custs.map((c: any) => ({ id: c.id, name: c.name, email: c.email })));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading recurring billing data:', error);
      toast.error('Failed to load recurring subscriptions');
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const getStatusColor = (status: string) => {
    return 'bg-[#001B9E] text-white';
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'paused': return 'Paused';
      case 'cancelled': return 'Cancelled';
      case 'expired': return 'Expired';
      default: return 'Unknown';
    }
  };

  const getFrequencyText = (frequency: string) => {
    switch (frequency) {
      case 'weekly': return 'Weekly';
      case 'monthly': return 'Monthly';
      case 'quarterly': return 'Quarterly';
      case 'yearly': return 'Annual';
      default: return 'Unknown';
    }
  };

  const filteredSubscriptions = subscriptions.filter(subscription => {
    const customerName = customers.find(c => c.id === subscription.customer_id)?.name || '';
    const matchesSearch = customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         String(subscription.id).toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (subscription.service_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || subscription.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatActionError = (error: any) => {
    const code = error?.code ? String(error.code) : '';
    const msg = error?.message ? String(error.message) : '';
    const hint = error?.hint ? String(error.hint) : '';
    const details = error?.details ? String(error.details) : '';

    const parts = [msg, details, hint].filter(Boolean);
    const base = parts.length > 0 ? parts.join(' | ') : 'Unknown error';
    return code ? `[${code}] ${base}` : base;
  };

  const handleCreateSubscription = () => {
    setEditingSubscriptionId(null);
    setSelectedCustomerId('');
    setServiceName('');
    setAmount('');
    setFrequency('');
    setStartDate('');
    setEndDate('');
    setDescription('');
    setApplyItbis(true);
    setItbisRate(18);
    setFormErrors({});
    setShowNewSubscriptionModal(true);
    toast.info('📝 Creating new subscription');
  };

  const handleViewSubscription = (subscriptionId: string) => {
    const sub = subscriptions.find(s => s.id === subscriptionId);
    if (!sub) {
      toast.error('Subscription not found');

      return;
    }

    setEditingSubscriptionId(subscriptionId);
    setSelectedCustomerId(sub.customer_id || '');
    setServiceName(sub.service_name || '');
    setAmount(Number(sub.amount) || '');
    setFrequency(sub.frequency || '');
    setStartDate(sub.start_date || '');
    setEndDate(sub.end_date || '');
    setDescription(sub.description || '');
    setApplyItbis(sub.apply_itbis !== false);
    setItbisRate(Number(sub.itbis_rate) || 18);
    setFormErrors({});
    setShowNewSubscriptionModal(true);
    toast.info(`📋 Editing subscription: ${sub.service_name || 'Untitled'}`);
  };

  const handleEditSubscription = (subscriptionId: string) => {
    handleViewSubscription(subscriptionId);
  };

  const handlePauseSubscription = async (subscriptionId: string) => {
    if (!user?.id) {
      toast.error('You must sign in to pause subscriptions');
      return;
    }
    if (!confirm(`Pause subscription ${subscriptionId}?`)) return;

    const sub = subscriptions.find(s => s.id === subscriptionId);
    try {
      await recurringSubscriptionsService.update(subscriptionId, { status: 'paused' });
      await loadData();
      toast.success(`⏸️ Subscription paused: ${sub?.service_name || subscriptionId}`);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Error pausing subscription:', error);
      toast.error(`❌ Failed to pause: ${formatActionError(error)}`, { duration: 9000 });
    }
  };

  const handleResumeSubscription = async (subscriptionId: string) => {
    if (!user?.id) {
      toast.error('You must sign in to resume subscriptions');
      return;
    }
    if (!confirm(`Resume subscription ${subscriptionId}?`)) return;

    const sub = subscriptions.find(s => s.id === subscriptionId);
    try {
      await recurringSubscriptionsService.update(subscriptionId, { status: 'active' });
      await loadData();
      toast.success(`▶️ Subscription resumed: ${sub?.service_name || subscriptionId}`);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Error resuming subscription:', error);
      toast.error(`❌ Failed to resume: ${formatActionError(error)}`, { duration: 9000 });
    }
  };

  const handleCancelSubscription = async (subscriptionId: string) => {
    if (!user?.id) {
      toast.error('You must sign in to cancel subscriptions');
      return;
    }
    if (!confirm(`Cancel subscription ${subscriptionId}? This action cannot be undone.`)) return;

    const sub = subscriptions.find(s => s.id === subscriptionId);
    try {
      await recurringSubscriptionsService.update(subscriptionId, { status: 'cancelled' });
      await loadData();
      toast.success(`🚫 Subscription cancelled: ${sub?.service_name || subscriptionId}`);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Error cancelling subscription:', error);
      toast.error(`❌ Failed to cancel: ${formatActionError(error)}`, { duration: 9000 });
    }
  };

  const handleGenerateInvoice = async (subscriptionId: string) => {
    const sub = subscriptions.find(s => s.id === subscriptionId);
    if (!sub) return;
    if (!user?.id) {
      toast.error('You must sign in to generate invoices');
      return;
    }
    if (!sub.customer_id) {
      toast.error('Subscription is missing a valid customer');
      return;
    }

    if (!confirm(`Generate an invoice for subscription ${subscriptionId}?`)) return;

    try {
      const loadingId = toast.loading('Creating invoice...');

      const today = new Date().toISOString().slice(0, 10);
      const amt = Number(sub.amount) || 0;

      // Calculate ITBIS if applicable

      const subApplyItbis = sub.apply_itbis !== false;
      const subItbisRate = Number(sub.itbis_rate) || 18;
      const taxAmount = subApplyItbis ? Number((amt * subItbisRate / 100).toFixed(2)) : 0;
      const totalAmount = Number((amt + taxAmount).toFixed(2));

      const invoicePayload = {
        customer_id: sub.customer_id,
        invoice_date: today,
        due_date: today,
        currency: 'DOP',
        subtotal: amt,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        paid_amount: 0,
        status: 'pending',
        notes: `Recurring invoice - Subscription ID: ${sub.id} | ${sub.service_name || 'Service'}`,
      };

      const linesPayload = [
        {
          description: sub.service_name || 'Recurring service',

          quantity: 1,
          unit_price: amt,
          line_total: amt,
          line_number: 1,
        },
      ];

      const { invoice } = await invoicesService.create(user.id, invoicePayload, linesPayload);

      // Move to the next billing date

      let nextDate: string | null = null;
      const billingDate = sub.next_billing_date as string;
      if (billingDate) {
        const d = new Date(billingDate);
        if (sub.frequency === 'weekly') d.setDate(d.getDate() + 7);
        else if (sub.frequency === 'monthly') d.setMonth(d.getMonth() + 1);
        else if (sub.frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
        else if (sub.frequency === 'yearly') d.setFullYear(d.getFullYear() + 1);
        nextDate = d.toISOString().slice(0, 10);
      }

      await recurringSubscriptionsService.update(subscriptionId, {
        last_invoice_id: invoice.id,
        last_billed_date: billingDate || today,
        next_billing_date: nextDate,
      });

      await loadData();
      toast.dismiss(loadingId);
      const issued = String((invoice as any)?.invoice_number || (invoice as any)?.id || '').trim();
      toast.success(`✅ Invoice generated: ${issued}${taxAmount > 0 ? ` (includes ITBIS:  ${taxAmount.toLocaleString()})` : ''}`);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Error generating invoice for subscription:', error);
      toast.error(`❌ Invoice could not be generated: ${formatActionError(error)}`, { duration: 9000 });
    }
  };

  const handleViewInvoices = async (subscriptionId: string) => {
    const sub = subscriptions.find(s => s.id === subscriptionId);
    if (!sub) {
      toast.error('Subscription not found');
      return;
    }
    if (!user?.id) {
      toast.error('You must sign in to view invoices');
      return;
    }
    if (!sub.customer_id) {
      toast.error('Subscription is missing a valid customer');
      return;
    }

    try {
      const loadingId = toast.loading('Searching invoices...');

      const allInvoices = await invoicesService.getAll(user.id);
      const customerInvoices = allInvoices.filter((inv: any) => inv.customer_id === sub.customer_id);

      if (customerInvoices.length === 0) {
        toast.dismiss(loadingId);
        toast.info('No invoices exist for this subscription (customer)');
        return;
      }

      const total = customerInvoices.reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0);
      toast.dismiss(loadingId);
      toast.info(`Invoices for this customer/subscription: ${customerInvoices.length} | Total:  ${total.toLocaleString()}`);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Error loading invoices for subscription:', error);
      toast.error(`❌ Invoices could not be loaded: ${formatActionError(error)}`, { duration: 9000 });
    }
  };

  const handleProcessPendingBilling = async () => {
    if (!user?.id) {
      toast.error('You must sign in to process billing runs');
      return;
    }
    if (!confirm('Process all pending recurring invoices now?')) return;

    try {
      const result = await recurringSubscriptionsService.processPending(user.id);
      await loadData();

      // Show detailed results

      if (result.errors && result.errors.length > 0) {
        // Surface errors if any

        result.errors.forEach((err: string) => {
          toast.error(err, { duration: 8000 });
        });
      }

      if (result.processed > 0) {
        toast.success(`✅ Invoices generated: ${result.processed}`);
      } else if (result.skipped > 0) {
        toast.info(`ℹ️ Subscriptions skipped: ${result.skipped} (already billed or expired)`);
      } else if (result.errors.length === 0) {
        toast.info('No subscriptions are pending billing');
      }
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Error processing pending recurring billing:', error);
      toast.error(error?.message || 'Failed to process pending recurring billing');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-[#F7F1E3] border border-[#E4DAC7] rounded-2xl p-6">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-[#6A7458]">Recurring Suite</p>
            <h1 className="text-3xl font-semibold text-[#2F3E2C]">Recurring Billing</h1>
            <p className="text-[#4B5640]">Manage subscriptions, automate invoices, and keep revenue steady.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleProcessPendingBilling}
              className="px-4 py-2 bg-[#3E4B31] text-[#F7F1E3] rounded-lg hover:bg-[#2f3a28] transition-colors whitespace-nowrap flex items-center shadow-sm"
            >
              <i className="ri-refresh-line mr-2"></i>
              Process Pending
            </button>
            <button
              onClick={handleCreateSubscription}
              className="px-4 py-2 bg-[#FDFBF6] text-[#2F3E2C] border border-[#2F3E2C] rounded-lg hover:bg-[#F2E9D7] transition-colors whitespace-nowrap flex items-center shadow-sm"
            >
              <i className="ri-add-line mr-2"></i>
              New Subscription
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-[#e8e0d0] p-6 hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#6B6A5E]">Active Subscriptions</p>
                <p className="text-3xl font-semibold text-[#2F3E2C] mt-1">
                  {subscriptions.filter(s => s.status === 'active').length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#DCE4C9] text-[#2F3E2C]">
                <i className="ri-check-line text-xl"></i>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-[#e8e0d0] p-6 hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#6B6A5E]">Monthly Revenue</p>
                <p className="text-3xl font-semibold text-[#2F3E2C] mt-1">
                   {subscriptions
                    .filter(s => s.status === 'active' && s.frequency === 'monthly')
                    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0)
                    .toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#E0E5D4] text-[#2F3E2C]">
                <i className="ri-money-dollar-circle-line text-xl"></i>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-[#e8e0d0] p-6 hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#6B6A5E]">Upcoming Invoices</p>
                <p className="text-3xl font-semibold text-[#2F3E2C] mt-1">
                  {subscriptions.filter(s => s.status === 'active' && s.next_billing_date).length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#EDE3C9] text-[#6A5A38]">
                <i className="ri-calendar-line text-xl"></i>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-[#e8e0d0] p-6 hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#6B6A5E]">Total Subscriptions</p>
                <p className="text-3xl font-semibold text-[#2F3E2C] mt-1">{subscriptions.length}</p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#E5DCDA] text-[#5B4A47]">
                <i className="ri-repeat-line text-xl"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by customer, service or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm pr-8"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                }}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
              >
                <i className="ri-refresh-line mr-2"></i>
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Subscriptions Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Subscriptions ({filteredSubscriptions.length})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Service
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Frequency
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Next Invoice
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>

                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSubscriptions.map((subscription) => {
                  const customer = customers.find(c => c.id === subscription.customer_id);
                  const customerName = customer?.name || '';
                  const customerEmail = customer?.email || '';

                  return (
                  <tr key={subscription.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{subscription.id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{customerName}</div>
                      <div className="text-sm text-gray-500">{customerEmail}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{subscription.service_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="font-medium"> {Number(subscription.amount || 0).toLocaleString()}</div>
                      {subscription.apply_itbis !== false && (
                        <div className="text-xs text-green-600">
                          +Tax ({Number(subscription.itbis_rate) || 18}%)
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {getFrequencyText(subscription.frequency)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {subscription.next_billing_date ? new Date(subscription.next_billing_date).toLocaleDateString('es-DO') : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(subscription.status)}`}>
                        {getStatusText(subscription.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleViewSubscription(subscription.id)}
                          className="text-[#2F3E2C] hover:text-[#3E4B31] p-1"
                          title="View subscription"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        <button
                          onClick={() => handleEditSubscription(subscription.id)}
                          className="text-[#3E4B31] hover:text-[#2F3E2C] p-1"
                          title="Edit subscription"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => handleViewInvoices(subscription.id)}
                          className="text-[#6A5A38] hover:text-[#4B3F2A] p-1"
                          title="View invoices"
                        >
                          <i className="ri-file-list-line"></i>
                        </button>
                        {subscription.status === 'active' && (
                          <>
                            <button
                              onClick={() => handleGenerateInvoice(subscription.id)}
                              className="text-[#3E4B31] hover:text-[#2F3E2C] p-1"
                              title="Generate invoice"
                            >
                              <i className="ri-file-add-line"></i>
                            </button>
                            <button
                              onClick={() => handlePauseSubscription(subscription.id)}
                              className="text-[#B2822D] hover:text-[#8C6420] p-1"
                              title="Pause subscription"
                            >
                              <i className="ri-pause-line"></i>
                            </button>
                          </>
                        )}
                        {subscription.status === 'paused' && (
                          <button
                            onClick={() => handleResumeSubscription(subscription.id)}
                            className="text-[#3E4B31] hover:text-[#2F3E2C] p-1"
                            title="Resume subscription"
                          >
                            <i className="ri-play-line"></i>
                          </button>
                        )}
                        {subscription.status !== 'cancelled' && (
                          <button
                            onClick={() => handleCancelSubscription(subscription.id)}
                            className="text-[#8F2F2F] hover:text-[#6C1F1F] p-1"
                            title="Cancel subscription"
                          >
                            <i className="ri-close-line"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* New Subscription Modal */}
        {showNewSubscriptionModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">New Subscription</h3>
                  <button
                    onClick={() => setShowNewSubscriptionModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Customer</label>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="">Select customer...</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>{customer.name}</option>
                      ))}
                    </select>
                    {formErrors.customer && (
                      <p className="mt-1 text-xs text-red-600">{formErrors.customer}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Service</label>
                    <input
                      type="text"
                      value={serviceName}
                      onChange={(e) => setServiceName(e.target.value)}
                      placeholder="Service name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {formErrors.service && (
                      <p className="mt-1 text-xs text-red-600">{formErrors.service}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                    <input
                      type="number" min="0"
                      value={amount === '' ? '' : amount}
                      onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {formErrors.amount && (
                      <p className="mt-1 text-xs text-red-600">{formErrors.amount}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Frequency</label>
                    <select
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="">Select frequency...</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Annual</option>
                    </select>
                    {formErrors.frequency && (
                      <p className="mt-1 text-xs text-red-600">{formErrors.frequency}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {formErrors.startDate && (
                      <p className="mt-1 text-xs text-red-600">{formErrors.startDate}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">End Date (Optional)</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                
                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Service Description</label>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Detailed description of the service..."
                  ></textarea>
                </div>

                {/* Tax Settings */}
                <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Tax Settings</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="applyItbis"
                        checked={applyItbis}
                        onChange={(e) => setApplyItbis(e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="applyItbis" className="ml-2 text-sm text-gray-700">
                        Apply tax automatically
                      </label>
                    </div>
                    {applyItbis && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%)</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={itbisRate}
                          onChange={(e) => setItbisRate(Number(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    )}
                  </div>
                  {applyItbis && amount !== '' && Number(amount) > 0 && (
                    <div className="mt-3 text-sm text-gray-600">
                      <span className="font-medium">Preview:</span> Amount:  {Number(amount).toLocaleString()} + Tax ({itbisRate}%):  {(Number(amount) * itbisRate / 100).toLocaleString()} = <span className="font-bold text-gray-900"> {(Number(amount) * (1 + itbisRate / 100)).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
                <button
                  onClick={() => setShowNewSubscriptionModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!user?.id) {
                      toast.error('You must sign in to create subscriptions');
                      return;
                    }

                    const errors: typeof formErrors = {};
                    if (!selectedCustomerId) errors.customer = 'Select a customer';
                    if (!serviceName.trim()) errors.service = 'Enter a service name';
                    if (amount === '' || Number(amount) <= 0) errors.amount = 'Enter an amount greater than 0';
                    if (!frequency) errors.frequency = 'Select a frequency';
                    if (!startDate) errors.startDate = 'Select the start date';

                    setFormErrors(errors);
                    if (Object.keys(errors).length > 0) return;

                    try {
                      if (editingSubscriptionId) {
                        await recurringSubscriptionsService.update(editingSubscriptionId, {
                          customer_id: selectedCustomerId,
                          service_name: serviceName,
                          amount: Number(amount) || 0,
                          frequency,
                          start_date: startDate,
                          end_date: endDate || null,
                          description: description || null,
                          apply_itbis: applyItbis,
                          itbis_rate: applyItbis ? itbisRate : 0,
                        });
                      } else {
                        await recurringSubscriptionsService.create(user.id, {
                          customer_id: selectedCustomerId,
                          service_name: serviceName,
                          amount: Number(amount) || 0,
                          frequency,
                          start_date: startDate,
                          end_date: endDate || null,
                          next_billing_date: startDate,
                          status: 'active',
                          description: description || null,
                          apply_itbis: applyItbis,
                          itbis_rate: applyItbis ? itbisRate : 0,
                        });
                      }

                      await loadData();
                      setShowNewSubscriptionModal(false);
                      toast.success(editingSubscriptionId ? 'Subscription updated successfully' : 'Subscription created successfully');
                    } catch (err) {
                      // eslint-disable-next-line no-console
                      console.error('Error saving subscription:', err);
                      toast.error('Subscription could not be saved');
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  {editingSubscriptionId ? 'Save Changes' : 'Create Subscription'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}