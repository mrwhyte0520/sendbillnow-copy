import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { cashDrawersService, cashTransactionsService } from '../../../services/contador/cash.service';
import { employeesService } from '../../../services/contador/staff.service';
import type { CashDrawer, CashTransaction } from '../../../services/contador/cash.service';
import { addPdfBrandedHeader, getPdfTableStyles } from '../../../utils/exportImportUtils';

// Importación dinámica de jsPDF para evitar errores de compilación
const loadJsPDF = async () => {
  const jsPDF = await import('jspdf');
  await import('jspdf-autotable');
  return jsPDF.default;
};

interface TransactionDisplay {
  id: string;
  type: 'in' | 'out';
  category: string;
  description: string;
  amount: number;
  date: string;
  time: string;
}

export default function ContadorCajaFinanzaPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'drawer' | 'transactions' | 'summary'>('drawer');
  const [currentDrawer, setCurrentDrawer] = useState<CashDrawer | null>(null);
  const [transactions, setTransactions] = useState<TransactionDisplay[]>([]);
  const [dailySummary, setDailySummary] = useState<{
    sales: number;
    drops: number;
    paidOuts: number;
    refunds: number;
    netCash: number;
  } | null>(null);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingAmount, setOpeningAmount] = useState(200.00);
  const [closingCount, setClosingCount] = useState(0);
  const [txFormData, setTxFormData] = useState({
    type: 'sale_cash_in' as CashTransaction['type'],
    amount: 0,
    description: '',
  });

  const ensureCurrentEmployeeId = async (): Promise<string> => {
    if (!user?.id) throw new Error('user.id required');

    const existing = await employeesService.list(user.id, { status: 'active' });
    if (existing?.[0]?.id) return existing[0].id;

    const fullName = String((user.user_metadata as any)?.full_name || '').trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    const firstName = parts[0] || 'Admin';
    const lastName = parts.slice(1).join(' ') || 'User';
    const employeeNo = `ADM-${user.id.slice(0, 6)}`;
    const hireDate = new Date().toISOString().slice(0, 10);

    const created = await employeesService.create({
      user_id: user.id,
      employee_no: employeeNo,
      first_name: firstName,
      last_name: lastName,
      email: user.email || null,
      hire_date: hireDate,
      status: 'active',
    });

    return created.id;
  };

  const drawerStatus = currentDrawer?.status === 'open' ? 'open' : 'closed';

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Get open drawer for today
      const drawer = await cashDrawersService.getOpenDrawer(user.id);
      setCurrentDrawer(drawer);

      setTransactions([]);
      setDailySummary(null);

      if (drawer) {
        setOpeningAmount(drawer.opening_cash || 0);
        // Load transactions for this drawer
        const txs = await cashTransactionsService.list(user.id, { drawerId: drawer.id });

        const inflowTypes: CashTransaction['type'][] = ['sale_cash_in', 'opening_adjustment'];
        const isInflow = (t: CashTransaction['type']) => inflowTypes.includes(t);

        const mapped: TransactionDisplay[] = txs.map((tx: CashTransaction) => ({
          id: tx.id,
          type: isInflow(tx.type) ? 'in' : 'out',
          category: tx.type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
          description: tx.description || tx.type,
          amount: Number(tx.amount) || 0,
          date: new Date(tx.created_at).toLocaleDateString(),
          time: new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }));
        setTransactions(mapped);

        const drawerDate = new Date(drawer.opened_at || drawer.created_at).toISOString().slice(0, 10);
        const summary = await cashTransactionsService.getDailySummary(user.id, drawerDate);
        setDailySummary(summary);
      }
    } catch (error) {
      console.error('Error loading cash data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDrawer = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const employeeId = await ensureCurrentEmployeeId();
      await cashDrawersService.open({
        user_id: user.id,
        drawer_name: 'Main Drawer',
        opened_by: employeeId,
        opening_cash: openingAmount,
      });
      setShowOpenModal(false);
      await loadData();
    } catch (error) {
      console.error('Error opening drawer:', error);
      alert('Error opening drawer');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseDrawer = async () => {
    if (!currentDrawer) return;
    setSaving(true);
    try {
      const employeeId = await ensureCurrentEmployeeId();
      await cashDrawersService.close(currentDrawer.id, {
        closed_by: employeeId,
        closing_cash_counted: closingCount,
      });
      setShowCloseModal(false);
      await loadData();
    } catch (error) {
      console.error('Error closing drawer:', error);
      alert('Error closing drawer');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTransaction = async () => {
    if (!user?.id || !currentDrawer || !txFormData.amount) return;
    setSaving(true);
    try {
      await cashTransactionsService.create({
        user_id: user.id,
        drawer_id: currentDrawer.id,
        type: txFormData.type,
        amount: Math.abs(txFormData.amount),
        description: txFormData.description || null,
      });
      setShowAddTransaction(false);
      setTxFormData({ type: 'sale_cash_in', amount: 0, description: '' });
      await loadData();
    } catch (error) {
      console.error('Error adding transaction:', error);
      alert('Error adding transaction');
    } finally {
      setSaving(false);
    }
  };

  const txByCategory = transactions.reduce(
    (acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + (Number(t.amount) || 0);
      return acc;
    },
    {} as Record<string, number>,
  );

  const totalIn = transactions
    .filter((t) => t.type === 'in')
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const totalOut = transactions
    .filter((t) => t.type === 'out')
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

  const openingCash = currentDrawer?.opening_cash ?? openingAmount;
  const expectedBalance = openingCash + totalIn - totalOut;

  const stats = {
    opening: openingCash,
    cashIn: totalIn,
    cashOut: totalOut,
    expected: expectedBalance,
  };

  const openedAtLabel = currentDrawer?.opened_at
    ? new Date(currentDrawer.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const handlePrintReport = async () => {
    if (drawerStatus !== 'open' || !currentDrawer) {
      alert('Open a drawer first to print a report');
      return;
    }

    const reportDate = new Date(currentDrawer.opened_at || currentDrawer.created_at).toLocaleDateString();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Cash Drawer Report</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:system-ui,-apple-system,sans-serif;background:#f0f0f0;padding:24px;}
.sheet{max-width:900px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);}
.header{padding:22px 26px;background:linear-gradient(135deg,#008000 0%,#006600 100%);color:#fff;text-align:center;}
.header h1{font-size:22px;font-weight:800;letter-spacing:0.5px;}
.header p{margin-top:6px;font-size:12px;opacity:0.9;}
.section{padding:18px 26px;}
.meta{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:#333;font-size:12px;}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px;}
.card{border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#fafafa;}
.card .label{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.4px;}
.card .value{margin-top:6px;font-size:18px;font-weight:800;color:#111;}
.value.green{color:#008000;}
.value.red{color:#c81e1e;}
table{width:100%;border-collapse:collapse;margin-top:16px;}
th{background:#008000;color:#fff;padding:12px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.4px;}
td{padding:10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#111;}
td.num{text-align:right;font-variant-numeric:tabular-nums;}
.footer{padding:14px 26px;background:#0b1f14;color:#fff;text-align:center;font-size:12px;font-weight:700;}
@media print{body{background:#fff!important;padding:0!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}.sheet{box-shadow:none!important;border-radius:0!important;}}
</style>
</head><body>
<div class="sheet">
  <div class="header">
    <h1>Cash Drawer Report</h1>
    <p>Date: ${reportDate} • Drawer: ${currentDrawer.drawer_name || 'Main Drawer'} • Opened: ${openedAtLabel || '--:--'}</p>
  </div>
  <div class="section">
    <div class="meta">
      <div><strong>Status:</strong> OPEN</div>
      <div><strong>Drawer ID:</strong> ${currentDrawer.id}</div>
    </div>

    <div class="cards">
      <div class="card"><div class="label">Opening Amount</div><div class="value">$${stats.opening.toFixed(2)}</div></div>
      <div class="card"><div class="label">Cash In</div><div class="value green">+$${stats.cashIn.toFixed(2)}</div></div>
      <div class="card"><div class="label">Cash Out</div><div class="value red">-$${stats.cashOut.toFixed(2)}</div></div>
      <div class="card"><div class="label">Expected Balance</div><div class="value green">$${stats.expected.toFixed(2)}</div></div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:110px;">Time</th>
          <th style="width:110px;">Type</th>
          <th style="width:180px;">Category</th>
          <th>Description</th>
          <th style="width:120px;text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${(transactions || [])
          .map((tx) => {
            const sign = tx.type === 'in' ? '+' : '-';
            return `<tr>
              <td>${tx.time}</td>
              <td>${tx.type === 'in' ? 'Cash In' : 'Cash Out'}</td>
              <td>${tx.category}</td>
              <td>${(tx.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
              <td class="num">${sign}$${Number(tx.amount || 0).toFixed(2)}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>
  </div>
  <div class="footer">THANK YOU FOR YOUR BUSINESS!</div>
</div>
<script>window.onload=function(){window.print();};</script>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
      alert('Could not open print window');
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const handleExportPdf = async () => {
    if (drawerStatus !== 'open' || !currentDrawer) {
      alert('Open a drawer first to export a report');
      return;
    }

    try {
      const jsPDF = await loadJsPDF();
      const doc = new jsPDF();
      const pdfStyles = getPdfTableStyles();

      const reportDate = new Date(currentDrawer.opened_at || currentDrawer.created_at).toLocaleDateString();
      const startY = await addPdfBrandedHeader(doc as any, 'Cash Drawer Report', {
        subtitle: `Date: ${reportDate} | Drawer: ${currentDrawer.drawer_name || 'Main Drawer'} | Opened: ${openedAtLabel || '--:--'}`,
      });

      const summaryRows = [
        ['Opening Amount', `$${stats.opening.toFixed(2)}`],
        ['Cash In', `+$${stats.cashIn.toFixed(2)}`],
        ['Cash Out', `-$${stats.cashOut.toFixed(2)}`],
        ['Expected Balance', `$${stats.expected.toFixed(2)}`],
      ];

      (doc as any).autoTable({
        startY,
        head: [['Metric', 'Value']],
        body: summaryRows,
        theme: 'grid',
        styles: pdfStyles.styles,
        headStyles: pdfStyles.headStyles,
        alternateRowStyles: pdfStyles.alternateRowStyles,
        columnStyles: {
          0: { cellWidth: 90 },
          1: { halign: 'right' },
        },
      });

      const txRows = (transactions || []).map((tx) => [
        tx.time,
        tx.type === 'in' ? 'Cash In' : 'Cash Out',
        tx.category,
        tx.description,
        `${tx.type === 'in' ? '+' : '-'}$${Number(tx.amount || 0).toFixed(2)}`,
      ]);

      const nextY = ((doc as any).lastAutoTable?.finalY || startY) + 10;

      (doc as any).autoTable({
        startY: nextY,
        head: [['Time', 'Type', 'Category', 'Description', 'Amount']],
        body: txRows,
        theme: 'grid',
        styles: pdfStyles.styles,
        headStyles: pdfStyles.headStyles,
        alternateRowStyles: pdfStyles.alternateRowStyles,
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 20 },
          2: { cellWidth: 30 },
          3: { cellWidth: 90 },
          4: { halign: 'right', cellWidth: 25 },
        },
      });

      doc.save(`cash_drawer_report_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error exporting cash drawer PDF:', e);
      alert('Could not export PDF');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#008000]/10 rounded-lg">
              <i className="ri-safe-2-line text-2xl text-[#008000]"></i>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Cash & Finance</h1>
              <p className="text-gray-600">Cash Management & Financial Control</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {drawerStatus === 'closed' ? (
              <button
                onClick={() => setShowOpenModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium hover:from-[#097509] hover:to-[#005300] flex items-center gap-2"
              >
                <i className="ri-door-open-line"></i>
                Open Drawer
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowAddTransaction(true)}
                  className="px-4 py-2 border border-[#008000] text-[#008000] rounded-lg font-medium hover:bg-[#008000]/5 flex items-center gap-2"
                >
                  <i className="ri-add-line"></i>
                  Add Transaction
                </button>
                <button
                  onClick={() => setShowCloseModal(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 flex items-center gap-2"
                >
                  <i className="ri-door-closed-line"></i>
                  Close Drawer
                </button>
              </>
            )}
          </div>
        </div>

        {/* Drawer Status Banner */}
        <div className={`rounded-lg p-4 mb-6 ${drawerStatus === 'open' ? 'bg-[#008000] border border-[#006B00]' : 'bg-gray-100 border border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${drawerStatus === 'open' ? 'bg-white/15' : 'bg-gray-200'}`}>
                <i className={`ri-safe-2-line text-xl ${drawerStatus === 'open' ? 'text-white' : 'text-gray-500'}`}></i>
              </div>
              <div>
                <p className={`font-semibold ${drawerStatus === 'open' ? 'text-white' : 'text-gray-900'}`}>
                  Cash Drawer: <span className={drawerStatus === 'open' ? 'text-white' : 'text-gray-500'}>{drawerStatus === 'open' ? 'OPEN' : 'CLOSED'}</span>
                </p>
                <p className={`text-sm ${drawerStatus === 'open' ? 'text-white/90' : 'text-gray-500'}`}>
                  {drawerStatus === 'open'
                    ? `Opened at ${openedAtLabel || '--:--'} • Opening: $${stats.opening.toFixed(2)}`
                    : 'No active session'}
                </p>
              </div>
            </div>
            {drawerStatus === 'open' && (
              <div className="text-right">
                <p className="text-sm text-white/90">Expected Balance</p>
                <p className="text-2xl font-extrabold text-white">${stats.expected.toFixed(2)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        {drawerStatus === 'open' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <i className="ri-wallet-line text-xl text-blue-600"></i>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Opening Amount</p>
                  <p className="text-2xl font-bold text-gray-900">${stats.opening.toFixed(2)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <i className="ri-arrow-down-circle-line text-xl text-green-600"></i>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Cash In</p>
                  <p className="text-2xl font-bold text-green-600">+${stats.cashIn.toFixed(2)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <i className="ri-arrow-up-circle-line text-xl text-red-600"></i>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Cash Out</p>
                  <p className="text-2xl font-bold text-red-600">-${stats.cashOut.toFixed(2)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#008000]/10 rounded-lg">
                  <i className="ri-calculator-line text-xl text-[#008000]"></i>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Expected Balance</p>
                  <p className="text-2xl font-bold text-[#008000]">${stats.expected.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200">
            <div className="flex">
              {[
                { id: 'drawer', label: 'Cash Drawer', icon: 'ri-safe-2-line' },
                { id: 'transactions', label: 'Transactions', icon: 'ri-exchange-dollar-line' },
                { id: 'summary', label: 'Daily Summary', icon: 'ri-file-chart-line' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-[#008000] text-[#008000] bg-[#008000]/5'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <i className={tab.icon}></i>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4">
            {/* Transactions Tab */}
            {activeTab === 'transactions' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600">{tx.time}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            tx.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {tx.type === 'in' ? 'Cash In' : 'Cash Out'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{tx.category}</td>
                        <td className="px-4 py-3 text-gray-900">{tx.description}</td>
                        <td className={`px-4 py-3 text-right font-medium ${tx.type === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                          {tx.type === 'in' ? '+' : '-'}${tx.amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Drawer Tab */}
            {activeTab === 'drawer' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <i className="ri-arrow-down-circle-line text-green-600"></i>
                      Cash Inflows
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Sales</span>
                        <span className="font-medium text-green-600">+${(dailySummary?.sales ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Adjustments</span>
                        <span className="font-medium text-green-600">+${(txByCategory['Opening Adjustment'] || 0).toFixed(2)}</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between font-medium">
                        <span>Total In</span>
                        <span className="text-green-600">+${stats.cashIn.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <i className="ri-arrow-up-circle-line text-red-600"></i>
                      Cash Outflows
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Expenses</span>
                        <span className="font-medium text-red-600">-${(dailySummary?.paidOuts ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Cash Drops</span>
                        <span className="font-medium text-red-600">-${(dailySummary?.drops ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Refunds</span>
                        <span className="font-medium text-red-600">-${(dailySummary?.refunds ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between font-medium">
                        <span>Total Out</span>
                        <span className="text-red-600">-${stats.cashOut.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Summary Tab */}
            {activeTab === 'summary' && (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Daily Financial Summary</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b border-gray-200">
                      <span className="text-gray-600">Opening Balance</span>
                      <span className="font-medium">${stats.opening.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-200">
                      <span className="text-gray-600">Total Cash In</span>
                      <span className="font-medium text-green-600">+${stats.cashIn.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-200">
                      <span className="text-gray-600">Total Cash Out</span>
                      <span className="font-medium text-red-600">-${stats.cashOut.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-2 text-lg">
                      <span className="font-semibold text-gray-900">Expected Closing Balance</span>
                      <span className="font-bold text-[#008000]">${stats.expected.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handlePrintReport}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
                  >
                    <i className="ri-printer-line"></i>
                    Print Report
                  </button>
                  <button
                    onClick={handleExportPdf}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
                  >
                    <i className="ri-download-line"></i>
                    Export PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Open Drawer Modal */}
        {showOpenModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Open Cash Drawer</h2>
                <button onClick={() => setShowOpenModal(false)} className="p-1 hover:bg-gray-100 rounded">
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Opening Amount ($)</label>
                  <input type="number" value={openingAmount} onChange={(e) => setOpeningAmount(parseFloat(e.target.value) || 0)} step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent" rows={2}></textarea>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowOpenModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleOpenDrawer} disabled={saving} className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium disabled:opacity-50">{saving ? 'Opening...' : 'Open Drawer'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Close Drawer Modal */}
        {showCloseModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Close Cash Drawer</h2>
                <button onClick={() => setShowCloseModal(false)} className="p-1 hover:bg-gray-100 rounded">
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">Expected Balance:</span>
                  <span className="font-bold text-[#008000]">${stats.expected.toFixed(2)}</span>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Actual Cash Count ($)</label>
                  <input type="number" value={closingCount} onChange={(e) => setClosingCount(parseFloat(e.target.value) || 0)} step="0.01" placeholder="Enter counted amount" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowCloseModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleCloseDrawer} disabled={saving} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">{saving ? 'Closing...' : 'Close Drawer'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Add Transaction Modal */}
        {showAddTransaction && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Add Transaction</h2>
                <button onClick={() => setShowAddTransaction(false)} className="p-1 hover:bg-gray-100 rounded">
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select 
                    value={txFormData.type}
                    onChange={(e) => setTxFormData({ ...txFormData, type: e.target.value as CashTransaction['type'] })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                  >
                    <option value="sale_cash_in">Cash In (Sale)</option>
                    <option value="cash_drop">Cash Drop</option>
                    <option value="paid_out_expense">Expense Paid Out</option>
                    <option value="refund_cash_out">Refund</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                  <input 
                    type="number" 
                    value={txFormData.amount || ''}
                    onChange={(e) => setTxFormData({ ...txFormData, amount: parseFloat(e.target.value) || 0 })}
                    step="0.01" 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input 
                    type="text" 
                    value={txFormData.description}
                    onChange={(e) => setTxFormData({ ...txFormData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent" 
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowAddTransaction(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleAddTransaction} disabled={saving || !txFormData.amount} className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium disabled:opacity-50">{saving ? 'Adding...' : 'Add Transaction'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
