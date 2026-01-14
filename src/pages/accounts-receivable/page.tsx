import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { invoicesService, customersService } from '../../services/database';
import { supabase } from '../../lib/supabase';
import { formatAmount, formatMoney } from '../../utils/numberFormat';
import { formatDate } from '../../utils/dateFormat';

const theme = {
  primary: '#4b5c4b',
  primaryHover: '#3f4f3f',
  accent: '#6d806d',
  muted: '#eef2ea',
  softBorder: '#dfe4db',
  softText: '#2f3a2f',
  badgeBg: '#e3e8dd',
};

interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  reference: string | null;
  total_debit: number;
  total_credit: number;
  status: string;
}

export default function AccountsReceivablePage() {
  const { user } = useAuth();

  const [summary, setSummary] = useState({
    totalReceivables: 0,
    overdueAmount: 0,
    currentAmount: 0,
    activeCustomers: 0,
  });
  const [recentEntries, setRecentEntries] = useState<JournalEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [entryLines, setEntryLines] = useState<any[]>([]);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
  const money = (value: number) => formatMoney(value ?? 0);

  useEffect(() => {
    const loadDashboard = async () => {
      if (!user?.id) {
        setSummary({
          totalReceivables: 0,
          overdueAmount: 0,
          currentAmount: 0,
          activeCustomers: 0,
        });
        return;
      }

      try {
        const [invoices, customers] = await Promise.all([
          invoicesService.getAll(user.id),
          customersService.getAll(user.id),
        ]);

        let totalReceivables = 0;
        let overdueAmount = 0;
        let currentAmount = 0;
        const today = new Date();

        (invoices || []).forEach((inv: any) => {
          // Excluir facturas anuladas y pagadas
          const status = String(inv.status || 'pending').toLowerCase();
          if (status === 'cancelled' || status === 'paid') return;

          const total = Number(
            inv.total_amount ??
            inv.total ??
            inv.subtotal ??
            0,
          );
          const paid = Number(inv.paid_amount ?? 0);
          const remaining = Math.max(total - paid, 0);
          if (remaining <= 0) return;

          totalReceivables += remaining;

          const dueStr = inv.due_date as string | null;
          if (dueStr) {
            const due = new Date(dueStr);
            if (!Number.isNaN(due.getTime()) && due < today) {
              overdueAmount += remaining;
            } else {
              currentAmount += remaining;
            }
          } else {
            currentAmount += remaining;
          }
        });

        const activeCustomers = (customers || []).filter(
          (c: any) => c.is_active !== false && c.status !== 'inactive',
        ).length;

        setSummary({
          totalReceivables,
          overdueAmount,
          currentAmount,
          activeCustomers,
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading Accounts Receivable dashboard data', error);
        setSummary({
          totalReceivables: 0,
          overdueAmount: 0,
          currentAmount: 0,
          activeCustomers: 0,
        });
      }
    };

    loadDashboard();
  }, [user?.id]);

  // Cargar asientos recientes relacionados con CxC
  useEffect(() => {
    // Journal entries removed - no longer loading recent entries
    setRecentEntries([]);
  }, [user?.id]);

  const handleViewEntry = async (entry: JournalEntry) => {
    setSelectedEntry(entry);
    setShowEntryModal(true);
    setLoadingLines(true);
    try {
      const { data, error } = await supabase
        .from('journal_entry_lines')
        .select(`
          id,
          account_id,
          description,
          debit_amount,
          credit_amount,
          line_number,
          chart_accounts(id, code, name)
        `)
        .eq('journal_entry_id', entry.id)
        .order('line_number', { ascending: true });
      
      if (error) throw error;
      setEntryLines(data || []);
    } catch (error) {
      console.error('Error loading entry lines:', error);
      setEntryLines([]);
    } finally {
      setLoadingLines(false);
    }
  };

  const modules = [
    {
      title: 'Invoices',
      description: 'Manage outstanding invoices',
      icon: 'ri-file-list-3-line',
      path: '/accounts-receivable/invoices',
      accentBg: '#f3ecda',
      accentText: '#2f3e1e',
    },
    {
      title: 'Customer Management',
      description: 'Maintain client records and limits',
      icon: 'ri-user-line',
      path: '/accounts-receivable/customers',
      accentBg: '#e3dcc8',
      accentText: '#4a3c24',
    },
    {
      title: 'Customer Types',
      description: 'Configure customer tiers, discounts, limits',
      icon: 'ri-user-settings-line',
      path: '/accounts-receivable/customer-types',
      accentBg: '#d8cbb5',
      accentText: '#2f3e1e',
    },
    {
      title: 'Payment Terms',
      description: 'Catalog of customer payment conditions',
      icon: 'ri-time-line',
      path: '/accounts-receivable/payment-terms',
      accentBg: '#f3ecda',
      accentText: '#6b5c3b',
    },
    {
      title: 'Payments Received',
      description: 'Register and track incoming payments',
      icon: 'ri-money-dollar-circle-line',
      path: '/accounts-receivable/payments',
      accentBg: '#e3dcc8',
      accentText: '#2f3e1e',
    },
    {
      title: 'Receipts',
      description: 'Issue and track receipts',
      icon: 'ri-receipt-line',
      path: '/accounts-receivable/receipts',
      accentBg: '#d8cbb5',
      accentText: '#2f3e1e',
    },
    {
      title: 'Customer Advances',
      description: 'Manage advance payments',
      icon: 'ri-wallet-line',
      path: '/accounts-receivable/advances',
      accentBg: '#f3ecda',
      accentText: '#7a2e1b',
    },
    {
      title: 'Sales Discounts',
      description: 'Reclassify revenue to discounts',
      icon: 'ri-percent-line',
      path: '/accounts-receivable/discounts',
      accentBg: '#e3dcc8',
      accentText: '#2f3e1e',
    },
    {
      title: 'Credit Notes',
      description: 'Manage credit notes',
      icon: 'ri-file-reduce-line',
      path: '/accounts-receivable/credit-notes',
      accentBg: '#d8cbb5',
      accentText: '#2f3e1e',
    },
    {
      title: 'Debit Notes',
      description: 'Manage debit notes',
      icon: 'ri-file-add-line',
      path: '/accounts-receivable/debit-notes',
      accentBg: '#f3ecda',
      accentText: '#2f3e1e',
    },
    {
      title: 'AR Reports',
      description: 'Analyze receivables performance',
      icon: 'ri-bar-chart-line',
      path: '/accounts-receivable/reports',
      accentBg: '#e3dcc8',
      accentText: '#4a3c24',
    }
  ];

  const summaryCards = [
    {
      label: 'Total Receivables',
      value: money(summary.totalReceivables),
      valueColor: '#2f3e1e',
      icon: 'ri-money-dollar-circle-line',
      iconBg: '#e3dcc8',
      iconColor: '#2f3e1e',
    },
    {
      label: 'Overdue',
      value: money(summary.overdueAmount),
      valueColor: '#7a2e1b',
      icon: 'ri-alarm-warning-line',
      iconBg: '#f4d9d4',
      iconColor: '#7a2e1b',
    },
    {
      label: 'Current',
      value: money(summary.currentAmount),
      valueColor: '#2f3e1e',
      icon: 'ri-time-line',
      iconBg: '#d7e4c0',
      iconColor: '#2f3e1e',
    },
    {
      label: 'Active Customers',
      value: summary.activeCustomers.toString(),
      valueColor: '#2f3e1e',
      icon: 'ri-user-line',
      iconBg: '#e6ddf5',
      iconColor: '#4a3c24',
    },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 bg-gradient-to-br from-[#f6f1e3] to-[#ebe5d5] min-h-screen space-y-6 rounded-2xl">
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-sm uppercase tracking-wide text-[#6b5c3b]">Collections</p>
            <h1 className="text-3xl font-bold text-[#2f3e1e] drop-shadow-sm">Accounts Receivable</h1>
            <p className="text-[#6b5c3b] mt-1">Full receivables and customer management</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {summaryCards.map((card, index) => (
            <div
              key={index}
              className="p-6 rounded-2xl border border-[#e8e0d0] bg-gradient-to-br from-white to-[#faf9f5] shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#6b5c3b]">{card.label}</p>
                  <p className="text-3xl font-bold mt-1 drop-shadow-sm" style={{ color: card.valueColor }}>
                    {card.value}
                  </p>
                </div>
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center shadow-lg"
                  style={{ backgroundColor: card.iconBg }}
                >
                  <i className={`${card.icon} text-2xl`} style={{ color: card.iconColor }}></i>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {modules.map((module, index) => (
            <Link
              key={index}
              to={module.path}
              className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl border border-[#e8e0d0] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.12)] hover:-translate-y-1 transition-all duration-300 group"
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-200"
                  style={{ backgroundColor: module.accentBg, color: module.accentText }}
                >
                  <i className={`${module.icon} text-2xl`}></i>
                </div>
              </div>
              
              <h3 className="text-lg font-semibold text-[#2f3e1e] mb-2 group-hover:text-[#2f3e1e] transition-colors">
                {module.title}
              </h3>
              
              <p className="text-[#6b5c3b] text-sm">
                {module.description}
              </p>
              
              <div className="mt-4 flex items-center text-sm font-medium text-[#2f3e1e]">
                <span>Open</span>
                <i className="ri-arrow-right-line ml-2 group-hover:translate-x-1 transition-transform duration-200 text-[#2f3e1e]"></i>
              </div>
            </Link>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mt-8 bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl border border-[#e8e0d0] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
          <div className="flex items-center gap-2 mb-4 text-[#6b5c3b]">
            <i className="ri-flashlight-line"></i>
            <h3 className="text-lg font-semibold text-[#2f3e1e]">Quick Actions</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              to="/accounts-receivable/invoices"
              className="flex items-center p-4 rounded-xl border border-[#e4d8c4] bg-[#fffdf6] hover:bg-[#f3ecda] transition-colors shadow-sm"
            >
              <i className="ri-add-line text-2xl mr-3 text-[#2f3e1e]"></i>
              <div>
                <p className="font-medium text-[#2f3e1e]">New Invoice</p>
                <p className="text-sm text-[#6b5c3b]">Create receivable invoice</p>
              </div>
            </Link>
            
            <Link
              to="/accounts-receivable/payments"
              className="flex items-center p-4 rounded-xl border border-[#e4d8c4] bg-[#fffdf6] hover:bg-[#f3ecda] transition-colors shadow-sm"
            >
              <i className="ri-money-dollar-circle-line text-2xl mr-3 text-[#4b5c4b]"></i>
              <div>
                <p className="font-medium text-[#2f3e1e]">Record Payment</p>
                <p className="text-sm text-[#6b5c3b]">Register customer payment</p>
              </div>
            </Link>
            
            <Link
              to="/accounts-receivable/customers"
              className="flex items-center p-4 rounded-xl border border-[#e4d8c4] bg-[#fffdf6] hover:bg-[#f3ecda] transition-colors shadow-sm"
            >
              <i className="ri-user-add-line text-2xl mr-3 text-[#6b5c3b]"></i>
              <div>
                <p className="font-medium text-[#2f3e1e]">New Customer</p>
                <p className="text-sm text-[#6b5c3b]">Add customer record</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Recent AR Journal Entries */}
        <div className="mt-8 bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl border border-[#e8e0d0] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-[#2f3e1e]">
              <i className="ri-book-2-line mr-2 text-[#2f3e1e]"></i>
              Recent Accounting Entries (AR)
            </h3>
            <Link
              to="/accounting/general-journal"
              className="text-sm font-medium text-[#2f3e1e]"
            >
              View all <i className="ri-arrow-right-line ml-1"></i>
            </Link>
          </div>
          
          {recentEntries.length === 0 ? (
            <p className="text-[#6b5c3b] text-sm py-4 text-center">No recent accounting entries related to AR.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#e4d8c4]">
                <thead className="bg-[#f7f3e8]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#6b5c3b] uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#6b5c3b] uppercase">Entry No.</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#6b5c3b] uppercase">Description</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-[#6b5c3b] uppercase">Debit</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-[#6b5c3b] uppercase">Credit</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-[#6b5c3b] uppercase">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-[#6b5c3b] uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-[#f3ecda]">
                  {recentEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-[#fffdf6]">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-[#2f3e1e]">
                        {formatDate(entry.entry_date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-[#2f3e1e]">
                        {entry.entry_number}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#6b5c3b] max-w-xs truncate" title={entry.description}>
                        {entry.description}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-[#2f3e1e]">
                         {formatAmount(entry.total_debit)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-[#2f3e1e]">
                         {formatAmount(entry.total_credit)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          entry.status === 'posted' ? 'bg-green-100 text-green-800' :
                          entry.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                          entry.status === 'reversed' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {entry.status === 'posted' ? 'Posted' : 
                           entry.status === 'draft' ? 'Draft' : 
                           entry.status === 'reversed' ? 'Reversed' : 
                           entry.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleViewEntry(entry)}
                          className="text-sm font-medium"
                          style={{ color: theme.primary }}
                          title="View details"
                        >
                          <i className="ri-eye-line text-lg"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Entry Detail Modal */}
        {showEntryModal && selectedEntry && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="px-6 py-4 flex justify-between items-center" style={{ backgroundColor: theme.primary }}>
                <div>
                  <h3 className="text-xl font-bold text-white">Entry #{selectedEntry.entry_number}</h3>
                  <p className="text-gray-100 text-sm">{selectedEntry.description}</p>
                </div>
                <button
                  onClick={() => {
                    setShowEntryModal(false);
                    setSelectedEntry(null);
                    setEntryLines([]);
                  }}
                  className="text-white hover:text-indigo-200 transition-colors"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Entry Info */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 uppercase">Date</p>
                    <p className="font-semibold text-gray-900">{formatDate(selectedEntry.entry_date)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 uppercase">Status</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      selectedEntry.status === 'posted' ? 'bg-green-100 text-green-800' :
                      selectedEntry.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedEntry.status === 'posted' ? 'Posted' : selectedEntry.status === 'draft' ? 'Draft' : selectedEntry.status}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 uppercase">Total Debit</p>
                    <p className="font-semibold text-gray-900"> {formatAmount(selectedEntry.total_debit)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 uppercase">Total Credit</p>
                    <p className="font-semibold text-gray-900"> {formatAmount(selectedEntry.total_credit)}</p>
                  </div>
                </div>

                {selectedEntry.reference && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs text-blue-600 uppercase">Reference</p>
                    <p className="font-medium text-blue-900">{selectedEntry.reference}</p>
                  </div>
                )}

                {/* Entry Lines */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-500 uppercase mb-3">
                    <i className="ri-list-check mr-2"></i>Entry Lines
                  </h4>
                  {loadingLines ? (
                    <div className="text-center py-8 text-gray-500">
                      <i className="ri-loader-4-line animate-spin text-2xl"></i>
                      <p className="mt-2">Loading lines...</p>
                    </div>
                  ) : entryLines.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No lines were found for this entry.</p>
                  ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600">Code</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600">Account</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600">Description</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-600">Debit</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-600">Credit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {entryLines.map((line: any, idx: number) => (
                            <tr key={line.id || idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-mono" style={{ color: theme.primary }}>
                                {(line.chart_accounts as any)?.code || '-'}
                              </td>
                              <td className="px-4 py-3 text-gray-900 font-medium">
                                {(line.chart_accounts as any)?.name || 'Account not found'}
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {line.description || '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-gray-900">
                                {Number(line.debit_amount || 0) > 0 ? ` ${formatAmount(line.debit_amount)}` : '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-gray-900">
                                {Number(line.credit_amount || 0) > 0 ? ` ${formatAmount(line.credit_amount)}` : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 font-semibold">
                          <tr>
                            <td colSpan={3} className="px-4 py-3 text-right text-gray-700">Totals:</td>
                            <td className="px-4 py-3 text-right text-green-700">
                               {formatAmount(entryLines.reduce((sum: number, l: any) => sum + Number(l.debit_amount || 0), 0))}
                            </td>
                            <td className="px-4 py-3 text-right text-green-700">
                               {formatAmount(entryLines.reduce((sum: number, l: any) => sum + Number(l.credit_amount || 0), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200">
                <Link
                  to="/accounting/general-journal"
                  className="text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                  style={{ backgroundColor: theme.primary }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = theme.primaryHover; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = theme.primary; }}
                >
                  <i className="ri-book-2-line"></i>
                  Go to General Journal
                </Link>
                <button
                  onClick={() => {
                    setShowEntryModal(false);
                    setSelectedEntry(null);
                    setEntryLines([]);
                  }}
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
