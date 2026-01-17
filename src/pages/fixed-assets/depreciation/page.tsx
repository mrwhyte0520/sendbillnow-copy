import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { fixedAssetsService, assetDepreciationService, settingsService } from '../../../services/database';
import { exportToExcelWithHeaders } from '../../../utils/exportImportUtils';
import { formatMoney } from '../../../utils/numberFormat';

interface DepreciationEntry {
  id: string;
  assetCode: string;
  assetName: string;
  category: string;
  acquisitionCost: number;
  accumulatedDepreciation: number;
  monthlyDepreciation: number;
  remainingValue: number;
  depreciationDate: string;
  period: string;
  status: string;
  method: string;
  journalEntryNumber?: string | null;
}

export default function DepreciationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [showCalculateModal, setShowCalculateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [lastJournalEntryNumber, setLastJournalEntryNumber] = useState<string | null>(null);

  const [depreciations, setDepreciations] = useState<DepreciationEntry[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedDepreciation, setSelectedDepreciation] = useState<DepreciationEntry | null>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [calculationPeriod, setCalculationPeriod] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      try {
        const [deprData, assetsData] = await Promise.all([
          assetDepreciationService.getAll(user.id),
          fixedAssetsService.getAll(user.id),
        ]);

        const mappedDepr: DepreciationEntry[] = (deprData || []).map((d: any) => ({
          id: d.id,
          assetCode: d.asset_code,
          assetName: d.asset_name,
          category: d.category,
          acquisitionCost: Number(d.acquisition_cost) || 0,
          accumulatedDepreciation: Number(d.accumulated_depreciation) || 0,
          monthlyDepreciation: Number(d.monthly_depreciation) || 0,
          remainingValue: Number(d.remaining_value) || 0,
          depreciationDate: d.depreciation_date,
          period: d.period,
          status: d.status,
          method: d.method,
          journalEntryNumber: d.journal_entry_number,
        }));
        setDepreciations(mappedDepr);

        const periodSet = Array.from(new Set(mappedDepr.map(d => d.period))).sort().reverse();
        setPeriods(periodSet);

        const categorySet = Array.from(new Set((assetsData || []).map((a: any) => a.category).filter(Boolean)));
        setAvailableCategories(categorySet);
        setSelectedCategories(categorySet);
        setAssets(assetsData || []);
      } catch (error) {
        console.error('Error loading depreciation data:', error);
      }
    };

    loadData();
  }, [user]);

  const filteredDepreciations = depreciations.filter(dep => {
    const matchesSearch = dep.assetName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         dep.assetCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPeriod = !filterPeriod || dep.period === filterPeriod;
    const matchesStatus = !filterStatus || dep.status === filterStatus;
    
    return matchesSearch && matchesPeriod && matchesStatus;
  });

  // Excluir depreciaciones reversadas de los totales del dashboard
  const activeDepreciations = filteredDepreciations.filter(dep => dep.status !== 'Reversado');
  const totalDepreciationMonth = activeDepreciations.reduce((sum, dep) => sum + dep.monthlyDepreciation, 0);
  const totalAccumulated = activeDepreciations.reduce((sum, dep) => sum + dep.accumulatedDepreciation, 0);
  const totalRemainingValue = activeDepreciations.reduce((sum, dep) => sum + dep.remainingValue, 0);

  const handleCalculateDepreciation = () => {
    setShowCalculateModal(true);
  };

  const handleProcessDepreciation = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const formData = new FormData(e.currentTarget);
    const period = String(formData.get('period') || '').trim();
    const processDate = String(formData.get('processDate') || '').trim() || new Date().toISOString().split('T')[0];
    if (!period) {
      alert('You must select a depreciation period');
      return;
    }

    try {
      // Usar la rutina centralizada que calcula la depreciación, actualiza los activos
      // y genera el asiento contable automático en el Diario.
      const result = await assetDepreciationService.calculateMonthlyDepreciation(user.id, processDate);

      const entryNumber = result?.journalEntry?.entry_number || result?.journalEntry?.entryNumber || null;
      setLastJournalEntryNumber(typeof entryNumber === 'string' && entryNumber.trim().length > 0 ? entryNumber : null);

      const created = result?.depreciations || [];
      const mappedCreated: DepreciationEntry[] = (created || []).map((d: any) => ({
        id: d.id,
        assetCode: d.asset_code,
        assetName: d.asset_name,
        category: d.category,
        acquisitionCost: Number(d.purchase_value ?? d.acquisition_cost ?? 0) || 0,
        accumulatedDepreciation: Number(d.accumulated_depreciation) || 0,
        monthlyDepreciation: Number(d.depreciation_amount ?? d.monthly_depreciation ?? 0) || 0,
        remainingValue: Number(d.book_value ?? d.remaining_value ?? 0) || 0,
        depreciationDate: d.depreciation_date,
        period: d.depreciation_date ? String(d.depreciation_date).slice(0, 7) : period,
        status: d.status || 'Calculado',
        method: d.method || 'Línea Recta',
        journalEntryNumber: d.journal_entry_number,
      }));

      // Refrescar la lista mostrando primero las depreciaciones más recientes
      setDepreciations(prev => [...mappedCreated, ...prev]);
      setShowCalculateModal(false);

      if (result?.message) {
        alert(result.message);
      }
    } catch (error: any) {
      console.error('Error calculating depreciation:', error);
      const msg = error?.message || String(error) || 'Error calculating and recording depreciation';
      alert(msg);
    }
  };

  const handleViewDetails = (depreciationId: string) => {
    const dep = depreciations.find(d => d.id === depreciationId);
    if (!dep) return;
    setSelectedDepreciation(dep);
    setShowModal(true);
  };

  const handleReverseDepreciation = async (depreciationId: string) => {
    if (!user) return;

    const dep = depreciations.find(d => d.id === depreciationId);
    if (!dep) return;

    const newStatus = dep.status === 'Reversado' ? 'Calculado' : 'Reversado';
    const newStatusLabel = statusLabelMap[newStatus] || newStatus;
    if (!confirm(`Are you sure you want to mark this depreciation as "${newStatusLabel}"?`)) return;

    try {
      const payload: any = {
        asset_code: dep.assetCode,
        asset_name: dep.assetName,
        category: dep.category,
        acquisition_cost: dep.acquisitionCost,
        monthly_depreciation: dep.monthlyDepreciation,
        accumulated_depreciation: dep.accumulatedDepreciation,
        remaining_value: dep.remainingValue,
        depreciation_date: dep.depreciationDate,
        period: dep.period,
        method: dep.method,
        status: newStatus,
      };

      const updated = await assetDepreciationService.update(depreciationId, payload);
      setDepreciations(prev => prev.map(d => d.id === depreciationId ? {
        ...d,
        status: updated.status || newStatus,
      } : d));
    } catch (error) {
      console.error('Error updating depreciation status:', error);
      alert('Error updating the depreciation status');
    }
  };

  const exportToPDF = () => {
    // Crear contenido del PDF
    const filteredData = filteredDepreciations;

    // Función auxiliar para formatear moneda
    const formatCurrency = (amount: number) => {
      return formatMoney(amount, '');
    };

    const locale = 'en-US';

    // Generar contenido HTML para el PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Fixed Asset Depreciation</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .summary { background: #f8f9fa; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
          .summary-item { text-align: center; }
          .summary-value { font-size: 18px; font-weight: bold; color: #2563eb; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f8f9fa; font-weight: bold; }
          .currency { text-align: right; }
          .negative { color: #dc2626; }
          .positive { color: #059669; }
          .status-calculado { color: #059669; font-weight: bold; }
          .status-pendiente { color: #d97706; font-weight: bold; }
          .status-reversado { color: #dc2626; font-weight: bold; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Fixed Asset Depreciation</h1>
          <p>Report generated on ${new Date().toLocaleDateString(locale)} at ${new Date().toLocaleTimeString(locale)}</p>
        </div>
        
        <div class="summary">
          <h3>Depreciation Summary</h3>
          <div class="summary-grid">
            <div class="summary-item">
              <div>Depreciation This Month</div>
              <div class="summary-value">${formatCurrency(totalDepreciationMonth)}</div>
            </div>
            <div class="summary-item">
              <div>Accumulated Depreciation</div>
              <div class="summary-value">${formatCurrency(totalAccumulated)}</div>
            </div>
            <div class="summary-item">
              <div>Remaining Value</div>
              <div class="summary-value">${formatCurrency(totalRemainingValue)}</div>
            </div>
            <div class="summary-item">
              <div>Assets Depreciated</div>
              <div class="summary-value">${filteredData.length}</div>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Asset</th>
              <th>Category</th>
              <th>Acquisition Cost</th>
              <th>Monthly Depreciation</th>
              <th>Accumulated Depreciation</th>
              <th>Remaining Value</th>
              <th>Period</th>
              <th>Method</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${filteredData.map(dep => `
              <tr>
                <td>${dep.assetCode}</td>
                <td>${dep.assetName}</td>
                <td>${dep.category}</td>
                <td class="currency">${formatCurrency(dep.acquisitionCost)}</td>
                <td class="currency negative">-${formatCurrency(dep.monthlyDepreciation)}</td>
                <td class="currency negative">-${formatCurrency(dep.accumulatedDepreciation)}</td>
                <td class="currency positive">${formatCurrency(dep.remainingValue)}</td>
                <td>${dep.period}</td>
                <td>${dep.method}</td>
                <td class="status-${dep.status.toLowerCase()}">${statusLabelMap[dep.status] || dep.status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <p>Fixed Asset Management - Depreciations</p>
          <p>Filters applied: ${searchTerm ? `Search: "${searchTerm}"` : ''} ${filterPeriod ? `Period: "${filterPeriod}"` : ''} ${filterStatus ? `Status: "${filterStatus}"` : ''}</p>
        </div>
      </body>
      </html>
    `;

    // Crear y abrir ventana para imprimir
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    } else {
      alert('Could not open the print window. Please check your browser popup blocker.');
    }
  };

  const exportToExcel = async () => {
    // Preparar datos para Excel
    const filteredData = filteredDepreciations;

    if (!filteredData || filteredData.length === 0) {
      alert('There are no depreciations to export.');
      return;
    }

    let companyName = '';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName = (info as any).name || (info as any).company_name || (info as any).legal_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      console.error('Error fetching company info for depreciation Excel export:', error);
    }

    const rows = filteredData.map(dep => ({
      assetCode: dep.assetCode,
      assetName: dep.assetName,
      category: dep.category,
      acquisitionCost: dep.acquisitionCost,
      monthlyDepreciation: dep.monthlyDepreciation,
      accumulatedDepreciation: dep.accumulatedDepreciation,
      remainingValue: dep.remainingValue,
      depreciationDate: new Date(dep.depreciationDate).toLocaleDateString('en-US'),
      period: dep.period,
      method: dep.method,
      status: statusLabelMap[dep.status] || dep.status,
    }));

    const headers = [
      { key: 'assetCode', title: 'Asset Code' },
      { key: 'assetName', title: 'Asset Name' },
      { key: 'category', title: 'Category' },
      { key: 'acquisitionCost', title: 'Acquisition Cost' },
      { key: 'monthlyDepreciation', title: 'Monthly Depreciation' },
      { key: 'accumulatedDepreciation', title: 'Accumulated Depreciation' },
      { key: 'remainingValue', title: 'Remaining Value' },
      { key: 'depreciationDate', title: 'Depreciation Date' },
      { key: 'period', title: 'Period' },
      { key: 'method', title: 'Method' },
      { key: 'status', title: 'Status' },
    ];

    const fileBase = `depreciations_${new Date().toISOString().split('T')[0]}`;

    const title = 'Fixed Asset Depreciation';

    const periodText = `Period: ${new Date().toISOString().slice(0, 7)}`;

    exportToExcelWithHeaders(
      rows,
      headers,
      fileBase,
      'Depreciations',
      [16, 32, 22, 18, 20, 22, 20, 18, 12, 22, 14],
      {
        title,
        companyName,
        headerStyle: 'dgii_606',
        periodText,
      },
    );
  };

  const formatCurrency = (amount: number) => {
    return formatMoney(amount, '');
  };

  const getDepreciationJournalEntryNumber = (dep: DepreciationEntry) => {
    const explicit = typeof dep.journalEntryNumber === 'string' ? dep.journalEntryNumber.trim() : '';
    if (explicit) return explicit;

    const period = String(dep.period || '').trim();
    if (!period) return null;
    return `DEP-${period}`;
  };

  const statusLabelMap: Record<string, string> = {
    Calculado: 'Posted',
    Pendiente: 'Pending',
    Reversado: 'Reversed',
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6 bg-[#f7f3e8] min-h-screen">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <button
              onClick={() => navigate('/fixed-assets')}
              className="flex items-center text-[#2f3e1e] hover:text-[#1f2913] mb-2 transition-colors"
            >
              <i className="ri-arrow-left-line mr-1"></i>
              Back to Fixed Assets
            </button>
            <h1 className="text-3xl font-bold text-[#2f3e1e]">Asset Depreciation</h1>
            <p className="text-[#6b5c3b]">Monthly depreciation tracking and automated postings.</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={exportToPDF}
              className="bg-[#4a3c24] text-white px-4 py-2 rounded-lg hover:bg-[#362b17] transition-colors whitespace-nowrap shadow-sm border border-[#362b17]"
            >
              <i className="ri-printer-line mr-2"></i>
              Export PDF
            </button>
            <button
              onClick={exportToExcel}
              className="bg-[#3f5d2a] text-white px-4 py-2 rounded-lg hover:bg-[#2d451f] transition-colors whitespace-nowrap shadow-sm border border-[#2d451f]"
            >
              <i className="ri-file-excel-line mr-2"></i>
              Export Excel
            </button>
            <button
              onClick={handleCalculateDepreciation}
              className="bg-[#2f3e1e] text-white px-4 py-2 rounded-lg hover:bg-[#1f2913] transition-colors whitespace-nowrap shadow-sm border border-[#1f2913]"
            >
              <i className="ri-calculator-line mr-2"></i>
              Calculate Depreciation
            </button>
          </div>
        </div>

        {lastJournalEntryNumber && (
          <div className="bg-[#e9f3dd] border border-[#c7dfaa] text-[#2f3e1e] rounded-lg px-4 py-3 flex items-center justify-between">
            <div className="text-sm">
              Journal entry generated: <span className="font-semibold">{lastJournalEntryNumber}</span>
            </div>

            <button
              onClick={() => navigate(`/accounting/general-journal?entry=${encodeURIComponent(lastJournalEntryNumber)}`)}
              className="bg-[#2f3e1e] text-white px-3 py-2 rounded-lg hover:bg-[#1f2913] transition-colors text-sm whitespace-nowrap shadow-sm border border-[#1f2913]"
            >
              View in Journal
            </button>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-[#e4d8c4] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#6b5c3b]">Depreciation This Month</p>
                <p className="text-2xl font-bold text-[#2f3e1e]">{formatCurrency(totalDepreciationMonth)}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#f0ead7]">
                <i className="ri-calendar-line text-xl text-[#2f3e1e]"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-[#e4d8c4] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#6b5c3b]">Accumulated Depreciation</p>
                <p className="text-2xl font-bold text-[#7a2e1b]">{formatCurrency(totalAccumulated)}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#f9e3dc]">
                <i className="ri-line-chart-line text-xl text-[#7a2e1b]"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-[#e4d8c4] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#6b5c3b]">Remaining Value</p>
                <p className="text-2xl font-bold text-[#245c39]">{formatCurrency(totalRemainingValue)}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#e2f1e5]">
                <i className="ri-money-dollar-circle-line text-xl text-[#245c39]"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-[#e4d8c4] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#6b5c3b]">Assets Depreciated</p>
                <p className="text-2xl font-bold text-purple-600">{filteredDepreciations.length}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#f1e8ff]">
                <i className="ri-archive-line text-xl text-purple-600"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#e4d8c4] p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#4a3c24] mb-2">Search</label>
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-[#b29a71]"></i>
                <input
                  type="text"
                  placeholder="Search by asset or code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-[#d8cbb5] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#4a3c24] mb-2">Period</label>
              <select
                value={filterPeriod}
                onChange={(e) => setFilterPeriod(e.target.value)}
                className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
              >
                <option value="">All periods</option>
                {periods.map((period) => (
                  <option key={period} value={period}>{period}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#4a3c24] mb-2">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
              >
                <option value="">All statuses</option>
                <option value="Calculado">Posted</option>
                <option value="Pendiente">Pending</option>
                <option value="Reversado">Reversed</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterPeriod('');
                  setFilterStatus('');
                }}
                className="w-full bg-[#4a3c24] text-white px-4 py-2 rounded-lg hover:bg-[#2f3e1e] transition-colors whitespace-nowrap shadow-sm border border-[#2f3e1e]"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Depreciation Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#e4d8c4]">
          <div className="p-6 border-b border-[#e4d8c4]">
            <h3 className="text-lg font-semibold text-[#2f3e1e]">
              Recorded Depreciations ({filteredDepreciations.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#ede7d7]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Asset</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Acquisition Cost</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Monthly Depreciation</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Accumulated Depreciation</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Remaining Value</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Depreciation Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Period</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#f3ecda]">
                {filteredDepreciations.map((depreciation) => (
                  <tr key={depreciation.id} className="hover:bg-[#fffdf6]">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-semibold text-[#2f3e1e]">{depreciation.assetName}</div>
                        <div className="text-sm text-[#6b5c3b]">{depreciation.assetCode} - {depreciation.category}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2f3e1e]">
                      {formatCurrency(depreciation.acquisitionCost)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#7a2e1b] font-semibold">
                      -{formatCurrency(depreciation.monthlyDepreciation)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#7a2e1b]">
                      -{formatCurrency(depreciation.accumulatedDepreciation)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#245c39] font-semibold">
                      {formatCurrency(depreciation.remainingValue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2f3e1e]">
                      {depreciation.depreciationDate ? new Date(depreciation.depreciationDate).toLocaleDateString('en-US') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2f3e1e]">
                      {depreciation.period}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        depreciation.status === 'Calculado' ? 'bg-[#d7e4c0] text-[#1f2913]' :
                        depreciation.status === 'Pendiente' ? 'bg-[#fbe4b9] text-[#5c3a04]' :
                        'bg-[#f4d9d4] text-[#7a2e1b]'
                      }`}>
                        {statusLabelMap[depreciation.status] || depreciation.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleViewDetails(depreciation.id)}
                          className="text-[#2f3e1e] hover:text-[#1f2913]"
                          title="View details"
                        >
                          <i className="ri-eye-line"></i>
                        </button>

                        {getDepreciationJournalEntryNumber(depreciation) && (
                          <button
                            onClick={() =>
                              navigate(
                                `/accounting/general-journal?entry=${encodeURIComponent(
                                  String(getDepreciationJournalEntryNumber(depreciation)),
                                )}`,
                              )
                            }
                            className="text-[#3f5d2a] hover:text-[#2d451f]"
                            title="View in journal"
                          >
                            <i className="ri-book-open-line"></i>
                          </button>
                        )}

                        {(depreciation.status === 'Calculado' || depreciation.status === 'Reversado') && (
                          <button
                            onClick={() => handleReverseDepreciation(depreciation.id)}
                            className="text-[#7a2e1b] hover:text-[#5c1f12]"
                            title={depreciation.status === 'Reversado' ? 'Mark as posted' : 'Reverse depreciation'}
                          >
                            <i className="ri-arrow-go-back-line"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Modal */}
        {showModal && selectedDepreciation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#fffaf1] rounded-2xl p-6 w-full max-w-2xl border border-[#e4d8c4] shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-[#2f3e1e]">Depreciation Details</h3>
                <div className="flex items-center space-x-2">
                  {getDepreciationJournalEntryNumber(selectedDepreciation) && (
                    <button
                      onClick={() =>
                        navigate(
                          `/accounting/general-journal?entry=${encodeURIComponent(
                            String(getDepreciationJournalEntryNumber(selectedDepreciation)),
                          )}`,
                        )
                      }
                      className="px-3 py-2 bg-[#2f3e1e] text-white rounded-lg hover:bg-[#1f2913] transition-colors text-sm whitespace-nowrap shadow-sm border border-[#1f2913]"
                    >
                      View in Journal
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setSelectedDepreciation(null);
                      setShowModal(false);
                    }}
                    className="text-[#6b5c3b] hover:text-[#2f3e1e]"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">Asset</label>
                    <p className="text-sm text-[#2f3e1e]">{selectedDepreciation.assetName}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">Code</label>
                    <p className="text-sm text-[#2f3e1e]">{selectedDepreciation.assetCode}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">Acquisition Cost</label>
                    <p className="text-sm text-[#2f3e1e]">{formatCurrency(selectedDepreciation.acquisitionCost)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">Monthly Depreciation</label>
                    <p className="text-sm text-[#2f3e1e]">{formatCurrency(selectedDepreciation.monthlyDepreciation)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">Depreciation Date</label>
                    <p className="text-sm text-[#2f3e1e]">{selectedDepreciation.depreciationDate ? new Date(selectedDepreciation.depreciationDate).toLocaleDateString('en-US') : '-'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">Period</label>
                    <p className="text-sm text-[#2f3e1e]">{selectedDepreciation.period}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">Status</label>
                    <p className="text-sm text-[#2f3e1e]">{statusLabelMap[selectedDepreciation.status] || selectedDepreciation.status}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">Accumulated Depreciation</label>
                    <p className="text-sm text-[#2f3e1e]">{formatCurrency(selectedDepreciation.accumulatedDepreciation)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">Remaining Value</label>
                    <p className="text-sm text-[#2f3e1e]">{formatCurrency(selectedDepreciation.remainingValue)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Calculate Modal */}
        {showCalculateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#fffaf1] rounded-2xl p-6 w-full max-w-2xl border border-[#e4d8c4] shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-[#2f3e1e]">
                  Run Monthly Depreciation
                </h3>
                <button
                  onClick={() => setShowCalculateModal(false)}
                  className="text-[#6b5c3b] hover:text-[#2f3e1e]"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <form onSubmit={handleProcessDepreciation} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Depreciation Period *
                    </label>
                    <input
                      type="month"
                      required
                      name="period"
                      value={calculationPeriod}
                      onChange={(e) => setCalculationPeriod(e.target.value)}
                      lang="en"
                      className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Process Date *
                    </label>
                    <input
                      type="date"
                      required
                      name="processDate"
                      defaultValue={new Date().toISOString().split('T')[0]}
                      lang="en"
                      className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                    Categories to Include
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {availableCategories.map(category => (
                      <label key={category} className="flex items-center text-sm text-[#2f3e1e]">
                        <input
                          type="checkbox"
                          className="mr-2 h-4 w-4 text-[#2f3e1e] border-[#d8cbb5] rounded focus:ring-[#2f3e1e]"
                          checked={selectedCategories.includes(category)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCategories(prev => Array.from(new Set([...prev, category])));
                            } else {
                              setSelectedCategories(prev => prev.filter(c => c !== category));
                            }
                          }}
                        />
                        {category}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="bg-[#f0ead7] p-4 rounded-2xl border border-[#e4d8c4]">
                  <h4 className="font-medium text-[#2f3e1e] mb-2">Calculation Summary</h4>
                  <div className="text-sm text-[#4a3c24] space-y-1">
                    {(() => {
                      const depreciableAssets = assets.filter((a: any) => {
                        const cat = a.category || '';
                        const status = String(a.status || '').toLowerCase();
                        const isActive = status === 'active' || status === 'activo';
                        const inCategory = selectedCategories.includes(cat);

                        const purchaseValue = Number(a.purchase_value ?? a.purchase_cost ?? 0) || 0;
                        const salvageValue = Number(a.salvage_value ?? 0) || 0;
                        const depreciableAmount = purchaseValue - salvageValue;
                        const accumulatedDepr = Number(a.accumulated_depreciation ?? 0) || 0;
                        const remainingValue = depreciableAmount - accumulatedDepr;

                        return isActive && inCategory && depreciableAmount > 0 && remainingValue > 0;
                      });

                      const totalEstimatedDepr = depreciableAssets.reduce((sum: number, a: any) => {
                        const purchaseValue = Number(a.purchase_value ?? a.purchase_cost ?? 0) || 0;
                        const salvageValue = Number(a.salvage_value ?? 0) || 0;
                        const depreciableAmount = purchaseValue - salvageValue;
                        const usefulLifeYears = Number(a.useful_life ?? 0) || 0;
                        const accumulatedDepr = Number(a.accumulated_depreciation ?? 0) || 0;

                        let monthlyDepr = 0;
                        if (usefulLifeYears > 0) {
                          monthlyDepr = depreciableAmount / (usefulLifeYears * 12);
                        } else {
                          const depreciationRate = Number(a.depreciation_rate ?? 0) || 0;
                          if (depreciationRate > 0) {
                            const usefulLifeMonths = Math.round((100 / depreciationRate) * 12);
                            monthlyDepr = depreciableAmount / usefulLifeMonths;
                          }
                        }

                        const remainingValue = depreciableAmount - accumulatedDepr;
                        const finalDepr = Math.min(monthlyDepr, remainingValue);

                        return sum + (finalDepr > 0 ? finalDepr : 0);
                      }, 0);

                      const periodDate = new Date(calculationPeriod + '-01');
                      const periodLabel = periodDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

                      return (
                        <>
                          <p>• Assets to depreciate: {depreciableAssets.length}</p>
                          <p>• Estimated monthly depreciation: {formatCurrency(totalEstimatedDepr)}</p>
                          <p>• Period: {periodLabel}</p>
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowCalculateModal(false)}
                    className="px-4 py-2 text-[#2f3e1e] bg-[#f0ead7] rounded-lg hover:bg-[#e1d5ba] border border-[#d8cbb5] transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#2f3e1e] text-white rounded-lg hover:bg-[#1f2913] transition-colors whitespace-nowrap shadow-sm border border-[#1f2913]"
                  >
                    Process Depreciation
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}