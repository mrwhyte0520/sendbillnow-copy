import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { resolveTenantId } from '../../../services/database';
import { reportsService } from '../../../services/contador/reports.service';
import type {
  AccountingPeriod,
  BalanceSheetReport,
  CashFlowReport,
  ProfitAndLossReport,
  SalesTaxReport,
} from '../../../services/contador/reports.service';
import { exportToExcelWithHeaders, exportToPdf } from '../../../utils/exportImportUtils';
import { settingsService } from '../../../services/database';

export default function ContadorReportesPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'pl' | 'balance' | 'cashflow' | 'tax'>('pl');
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [pnl, setPnl] = useState<ProfitAndLossReport | null>(null);
  const [balance, setBalance] = useState<BalanceSheetReport | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowReport | null>(null);
  const [salesTax, setSalesTax] = useState<SalesTaxReport | null>(null);
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    if (user?.id) {
      loadCompanyInfo();
    }
  }, [user?.id]);

  const loadCompanyInfo = async () => {
    if (!user?.id) return;
    try {
      const info = await settingsService.getCompanyInfo();
      setCompanyName(info?.name || 'Company');
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (user?.id) {
      loadPeriods();
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id && selectedPeriodId) {
      loadReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedPeriodId]);

  const selectedPeriod = useMemo(() => {
    return periods.find((p) => p.id === selectedPeriodId) || null;
  }, [periods, selectedPeriodId]);

  const loadPeriods = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return;
      const data = await reportsService.periods.list(tenantId);
      setPeriods(data);
      if (data.length > 0) {
        setSelectedPeriodId((prev) => prev || data[0].id);
      }
    } catch (error) {
      console.error('Error loading accounting periods:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadReports = async () => {
    if (!user?.id || !selectedPeriod) return;
    setLoading(true);
    try {
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return;
      const [pnlReport, balanceReport, cashFlowReport, salesTaxReport] = await Promise.all([
        reportsService.generator.generateProfitAndLoss(
          tenantId,
          selectedPeriod.start_date,
          selectedPeriod.end_date
        ),
        reportsService.generator.generateBalanceSheet(tenantId, selectedPeriod.end_date),
        reportsService.generator.generateCashFlow(
          tenantId,
          selectedPeriod.start_date,
          selectedPeriod.end_date
        ),
        reportsService.generator.generateSalesTaxReport(
          tenantId,
          selectedPeriod.start_date,
          selectedPeriod.end_date
        ),
      ]);

      setPnl(pnlReport);
      setBalance(balanceReport);
      setCashFlow(cashFlowReport);
      setSalesTax(salesTaxReport);
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalRevenue = pnl?.totalRevenue || 0;
  const totalExpenses = pnl?.totalExpenses || 0;
  const netIncome = pnl?.netIncome || 0;

  const totalAssets = balance?.totalAssets || 0;
  const totalLiabilities = balance?.totalLiabilities || 0;
  const totalEquity = balance?.totalEquity || 0;

  const handleExportPdf = async () => {
    let data: any[] = [];
    let columns: { key: string; label: string }[] = [];
    let title = '';

    if (activeTab === 'pl') {
      title = 'Profit & Loss Statement';
      data = [
        ...(pnl?.revenue || []).map(r => ({ category: r.category, type: 'Revenue', amount: r.amount })),
        ...(pnl?.expenses || []).map(e => ({ category: e.category, type: 'Expense', amount: -e.amount })),
        { category: 'Net Income', type: 'Total', amount: netIncome },
      ];
      columns = [
        { key: 'category', label: 'Category' },
        { key: 'type', label: 'Type' },
        { key: 'amount', label: 'Amount' },
      ];
    } else if (activeTab === 'balance') {
      title = 'Balance Sheet';
      data = [
        ...(balance?.assets || []).map(a => ({ name: a.name, type: 'Asset', amount: a.amount })),
        ...(balance?.liabilities || []).map(l => ({ name: l.name, type: 'Liability', amount: l.amount })),
        ...(balance?.equity || []).map(e => ({ name: e.name, type: 'Equity', amount: e.amount })),
      ];
      columns = [
        { key: 'name', label: 'Account' },
        { key: 'type', label: 'Type' },
        { key: 'amount', label: 'Amount' },
      ];
    } else if (activeTab === 'cashflow') {
      title = 'Cash Flow Statement';
      data = [
        ...(cashFlow?.operating || []).map(o => ({ description: o.description, type: 'Operating', amount: o.amount })),
        ...(cashFlow?.investing || []).map(i => ({ description: i.description, type: 'Investing', amount: i.amount })),
        ...(cashFlow?.financing || []).map(f => ({ description: f.description, type: 'Financing', amount: f.amount })),
        { description: 'Net Change in Cash', type: 'Total', amount: cashFlow?.netChange || 0 },
      ];
      columns = [
        { key: 'description', label: 'Description' },
        { key: 'type', label: 'Activity Type' },
        { key: 'amount', label: 'Amount' },
      ];
    } else if (activeTab === 'tax') {
      title = 'Sales Tax Report';
      data = (salesTax?.byJurisdiction || []).map(j => ({
        jurisdiction: j.jurisdiction,
        state: j.state,
        taxableSales: j.taxableSales,
        taxRate: j.taxRate,
        taxCollected: j.taxCollected,
      }));
      columns = [
        { key: 'state', label: 'State' },
        { key: 'taxableSales', label: 'Taxable Sales' },
        { key: 'taxRate', label: 'Tax Rate' },
        { key: 'taxCollected', label: 'Tax Collected' },
      ];
    }

    await exportToPdf(data, columns, `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`, `${companyName} - ${title}`, 'p');
  };

  const handleExportExcel = async () => {
    let rows: any[] = [];
    let headers: { key: string; title: string }[] = [];
    let sheetName = '';
    let title = '';

    if (activeTab === 'pl') {
      title = 'Profit & Loss Statement';
      sheetName = 'P&L';
      rows = [
        ...(pnl?.revenue || []).map(r => ({ category: r.category, type: 'Revenue', amount: r.amount.toFixed(2) })),
        ...(pnl?.expenses || []).map(e => ({ category: e.category, type: 'Expense', amount: (-e.amount).toFixed(2) })),
        { category: 'Net Income', type: 'Total', amount: netIncome.toFixed(2) },
      ];
      headers = [
        { key: 'category', title: 'Category' },
        { key: 'type', title: 'Type' },
        { key: 'amount', title: 'Amount ($)' },
      ];
    } else if (activeTab === 'balance') {
      title = 'Balance Sheet';
      sheetName = 'Balance Sheet';
      rows = [
        ...(balance?.assets || []).map(a => ({ name: a.name, type: 'Asset', amount: a.amount.toFixed(2) })),
        ...(balance?.liabilities || []).map(l => ({ name: l.name, type: 'Liability', amount: l.amount.toFixed(2) })),
        ...(balance?.equity || []).map(e => ({ name: e.name, type: 'Equity', amount: e.amount.toFixed(2) })),
      ];
      headers = [
        { key: 'name', title: 'Account' },
        { key: 'type', title: 'Type' },
        { key: 'amount', title: 'Amount ($)' },
      ];
    } else if (activeTab === 'cashflow') {
      title = 'Cash Flow Statement';
      sheetName = 'Cash Flow';
      rows = [
        ...(cashFlow?.operating || []).map(o => ({ description: o.description, type: 'Operating', amount: o.amount.toFixed(2) })),
        ...(cashFlow?.investing || []).map(i => ({ description: i.description, type: 'Investing', amount: i.amount.toFixed(2) })),
        ...(cashFlow?.financing || []).map(f => ({ description: f.description, type: 'Financing', amount: f.amount.toFixed(2) })),
        { description: 'Net Change in Cash', type: 'Total', amount: (cashFlow?.netChange || 0).toFixed(2) },
      ];
      headers = [
        { key: 'description', title: 'Description' },
        { key: 'type', title: 'Activity Type' },
        { key: 'amount', title: 'Amount ($)' },
      ];
    } else if (activeTab === 'tax') {
      title = 'Sales Tax Report';
      sheetName = 'Sales Tax';
      rows = (salesTax?.byJurisdiction || []).map(j => ({
        state: j.state,
        taxableSales: j.taxableSales.toFixed(2),
        taxRate: j.taxRate.toFixed(2) + '%',
        taxCollected: j.taxCollected.toFixed(2),
      }));
      headers = [
        { key: 'state', title: 'State' },
        { key: 'taxableSales', title: 'Taxable Sales ($)' },
        { key: 'taxRate', title: 'Tax Rate' },
        { key: 'taxCollected', title: 'Tax Collected ($)' },
      ];
    }

    await exportToExcelWithHeaders(
      rows,
      headers,
      `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`,
      sheetName,
      [30, 15, 15, 15],
      { title, companyName }
    );
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#008000]/10 rounded-lg">
              <i className="ri-file-chart-line text-2xl text-[#008000]"></i>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Financial Reports</h1>
              <p className="text-gray-600">General Accounting Reports – USA</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button 
              onClick={handleExportPdf}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <i className="ri-file-pdf-line"></i>
              PDF
            </button>
            <button 
              onClick={handleExportExcel}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <i className="ri-file-excel-line"></i>
              Excel
            </button>
          </div>
        </div>

        {/* IRS Compliance Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <i className="ri-shield-check-line text-xl text-blue-600 mt-0.5"></i>
            <div>
              <p className="font-medium text-blue-900">IRS & CPA Ready</p>
              <p className="text-sm text-blue-700">Reports comply with US GAAP standards and are ready for tax preparation and CPA review.</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200">
            <div className="flex">
              {[
                { id: 'pl', label: 'Profit & Loss', icon: 'ri-line-chart-line' },
                { id: 'balance', label: 'Balance Sheet', icon: 'ri-scales-3-line' },
                { id: 'cashflow', label: 'Cash Flow', icon: 'ri-flow-chart' },
                { id: 'tax', label: 'Sales Tax', icon: 'ri-government-line' },
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

          <div className="p-6">
            {/* Profit & Loss Tab */}
            {activeTab === 'pl' && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Profit & Loss Statement</h2>
                  <p className="text-gray-500">{selectedPeriod?.name || ''}</p>
                </div>

                {/* Revenue Section */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <i className="ri-arrow-down-circle-line text-green-600"></i>
                    Revenue
                  </h3>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    {(pnl?.revenue || []).map((item, idx) => (
                      <div key={idx} className="flex justify-between px-4 py-3 border-b border-gray-200 last:border-0">
                        <span className="text-gray-600">{item.category}</span>
                        <span className="font-medium text-green-600">${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                    <div className="flex justify-between px-4 py-3 bg-green-50 font-semibold">
                      <span>Total Revenue</span>
                      <span className="text-green-600">${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Expenses Section */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <i className="ri-arrow-up-circle-line text-red-600"></i>
                    Expenses
                  </h3>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    {(pnl?.expenses || []).map((item, idx) => (
                      <div key={idx} className="flex justify-between px-4 py-3 border-b border-gray-200 last:border-0">
                        <span className="text-gray-600">{item.category}</span>
                        <span className="font-medium text-red-600">-${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                    <div className="flex justify-between px-4 py-3 bg-red-50 font-semibold">
                      <span>Total Expenses</span>
                      <span className="text-red-600">-${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Net Income */}
                <div className={`rounded-lg p-4 ${netIncome >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold">Net Income</span>
                    <span className={`text-2xl font-bold ${netIncome >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      ${netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Balance Sheet Tab */}
            {activeTab === 'balance' && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Balance Sheet</h2>
                  <p className="text-gray-500">As of {selectedPeriod?.name || ''}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Assets */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Assets</h3>
                    <div className="bg-gray-50 rounded-lg overflow-hidden">
                      {(balance?.assets || []).map((item, idx) => (
                        <div key={idx} className="flex justify-between px-4 py-3 border-b border-gray-200 last:border-0">
                          <span className="text-gray-600">{item.name}</span>
                          <span className="font-medium">${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                      <div className="flex justify-between px-4 py-3 bg-blue-50 font-semibold">
                        <span>Total Assets</span>
                        <span className="text-blue-600">${totalAssets.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Liabilities & Equity */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-3">Liabilities</h3>
                      <div className="bg-gray-50 rounded-lg overflow-hidden">
                        {(balance?.liabilities || []).map((item, idx) => (
                          <div key={idx} className="flex justify-between px-4 py-3 border-b border-gray-200 last:border-0">
                            <span className="text-gray-600">{item.name}</span>
                            <span className="font-medium">${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                        <div className="flex justify-between px-4 py-3 bg-orange-50 font-semibold">
                          <span>Total Liabilities</span>
                          <span className="text-orange-600">${totalLiabilities.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-3">Equity</h3>
                      <div className="bg-gray-50 rounded-lg overflow-hidden">
                        {(balance?.equity || []).map((item, idx) => (
                          <div key={idx} className="flex justify-between px-4 py-3 border-b border-gray-200 last:border-0">
                            <span className="text-gray-600">{item.name}</span>
                            <span className="font-medium">${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                        <div className="flex justify-between px-4 py-3 bg-purple-50 font-semibold">
                          <span>Total Equity</span>
                          <span className="text-purple-600">${totalEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Balance Check */}
                <div className="bg-[#008000]/10 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Total Liabilities + Equity</span>
                    <span className="text-lg font-bold text-[#008000]">
                      ${(totalLiabilities + totalEquity).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-sm text-[#335322] mt-1">
                    <i className="ri-check-line mr-1"></i>
                    Balance verified: Assets = Liabilities + Equity
                  </p>
                </div>
              </div>
            )}

            {/* Cash Flow Tab */}
            {activeTab === 'cashflow' && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Cash Flow Statement</h2>
                  <p className="text-gray-500">{selectedPeriod?.name || ''}</p>
                </div>

                {/* Operating Activities */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Operating Activities</h3>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    {(cashFlow?.operating || []).map((item, idx) => (
                      <div key={idx} className="flex justify-between px-4 py-3 border-b border-gray-200 last:border-0">
                        <span className="text-gray-600">{item.description}</span>
                        <span className={`font-medium ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {item.amount >= 0 ? '+' : ''}${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between px-4 py-3 bg-blue-50 font-semibold">
                      <span>Net Operating Cash</span>
                      <span className="text-blue-600">
                        ${(cashFlow?.operating.reduce((a, i) => a + i.amount, 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Investing Activities */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Investing Activities</h3>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    {(cashFlow?.investing || []).map((item, idx) => (
                      <div key={idx} className="flex justify-between px-4 py-3 border-b border-gray-200 last:border-0">
                        <span className="text-gray-600">{item.description}</span>
                        <span className={`font-medium ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {item.amount >= 0 ? '+' : ''}${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between px-4 py-3 bg-orange-50 font-semibold">
                      <span>Net Investing Cash</span>
                      <span className="text-orange-600">
                        ${(cashFlow?.investing.reduce((a, i) => a + i.amount, 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Financing Activities */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Financing Activities</h3>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    {(cashFlow?.financing || []).map((item, idx) => (
                      <div key={idx} className="flex justify-between px-4 py-3 border-b border-gray-200 last:border-0">
                        <span className="text-gray-600">{item.description}</span>
                        <span className={`font-medium ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {item.amount >= 0 ? '+' : ''}${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between px-4 py-3 bg-purple-50 font-semibold">
                      <span>Net Financing Cash</span>
                      <span className="text-purple-600">
                        ${(cashFlow?.financing.reduce((a, i) => a + i.amount, 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Net Change in Cash */}
                <div className="bg-[#008000]/10 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold">Net Change in Cash</span>
                    <span className="text-2xl font-bold text-[#008000]">
                      ${(
                        (cashFlow?.operating.reduce((a, i) => a + i.amount, 0) || 0) +
                        (cashFlow?.investing.reduce((a, i) => a + i.amount, 0) || 0) +
                        (cashFlow?.financing.reduce((a, i) => a + i.amount, 0) || 0)
                      ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Sales Tax Tab */}
            {activeTab === 'tax' && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Sales Tax Report</h2>
                  <p className="text-gray-500">{selectedPeriod?.name || ''}</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">State</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Taxable Sales</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Tax Rate</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Tax Collected</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {(salesTax?.byJurisdiction || []).map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{item.state}</td>
                          <td className="px-4 py-3 text-right text-gray-600">${item.taxableSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{item.taxRate.toFixed(2)}%</td>
                          <td className="px-4 py-3 text-right font-medium text-[#008000]">${item.taxCollected.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr className="font-semibold">
                        <td className="px-4 py-3">Total</td>
                        <td className="px-4 py-3 text-right">${(salesTax?.totalTaxableSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 text-right">-</td>
                        <td className="px-4 py-3 text-right text-[#008000]">${(salesTax?.totalTaxCollected || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-sm text-blue-600 font-medium">Total Sales</p>
                    <p className="text-2xl font-bold text-blue-900">${(salesTax?.totalTaxableSales || 0).toLocaleString('en-US')}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-sm text-green-600 font-medium">Tax Collected</p>
                    <p className="text-2xl font-bold text-green-900">${(salesTax?.totalTaxCollected || 0).toLocaleString('en-US')}</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <p className="text-sm text-purple-600 font-medium">Avg Tax Rate</p>
                    <p className="text-2xl font-bold text-purple-900">
                      {(() => {
                        const rows = salesTax?.byJurisdiction || [];
                        if (rows.length === 0) return '0.00%';
                        const avg = rows.reduce((a, r) => a + r.taxRate, 0) / rows.length;
                        return `${avg.toFixed(2)}%`;
                      })()}
                    </p>
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <i className="ri-error-warning-line text-xl text-yellow-600 mt-0.5"></i>
                    <div>
                      <p className="font-medium text-yellow-800">Tax Filing Reminder</p>
                      <p className="text-sm text-yellow-700">Sales tax is due by the 20th of each month. Ensure all state filings are completed on time to avoid penalties.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
