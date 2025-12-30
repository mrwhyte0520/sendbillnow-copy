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
      alert('Debe seleccionar un período de depreciación');
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
      const msg = error?.message || String(error) || 'Error al calcular y registrar la depreciación';
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
    if (!confirm(`¿Está seguro de que desea marcar esta depreciación como "${newStatus}"?`)) return;

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
      alert('Error al actualizar el estado de la depreciación');
    }
  };

  const exportToPDF = () => {
    // Crear contenido del PDF
    const filteredData = filteredDepreciations;

    // Función auxiliar para formatear moneda
    const formatCurrency = (amount: number) => {
      return formatMoney(amount, 'RD$');
    };

    // Generar contenido HTML para el PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Depreciación de Activos Fijos</title>
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
          <h1>Depreciación de Activos Fijos</h1>
          <p>Reporte generado el ${new Date().toLocaleDateString('es-DO')} a las ${new Date().toLocaleTimeString('es-DO')}</p>
        </div>
        
        <div class="summary">
          <h3>Resumen de Depreciaciones</h3>
          <div class="summary-grid">
            <div class="summary-item">
              <div>Depreciación del Mes</div>
              <div class="summary-value">${formatCurrency(totalDepreciationMonth)}</div>
            </div>
            <div class="summary-item">
              <div>Depreciación Acumulada</div>
              <div class="summary-value">${formatCurrency(totalAccumulated)}</div>
            </div>
            <div class="summary-item">
              <div>Valor Remanente</div>
              <div class="summary-value">${formatCurrency(totalRemainingValue)}</div>
            </div>
            <div class="summary-item">
              <div>Activos Depreciados</div>
              <div class="summary-value">${filteredData.length}</div>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Activo</th>
              <th>Categoría</th>
              <th>Costo Adquisición</th>
              <th>Depreciación Mensual</th>
              <th>Depreciación Acumulada</th>
              <th>Valor Remanente</th>
              <th>Período</th>
              <th>Método</th>
              <th>Estado</th>
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
                <td class="status-${dep.status.toLowerCase()}">${dep.status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <p>Sistema de Gestión de Activos Fijos - Depreciaciones</p>
          <p>Filtros aplicados: ${searchTerm ? `Búsqueda: "${searchTerm}"` : ''} ${filterPeriod ? `Período: "${filterPeriod}"` : ''} ${filterStatus ? `Estado: "${filterStatus}"` : ''}</p>
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
      alert('No se pudo abrir la ventana de impresión. Verifique que no esté bloqueada por el navegador.');
    }
  };

  const exportToExcel = async () => {
    // Preparar datos para Excel
    const filteredData = filteredDepreciations;

    if (!filteredData || filteredData.length === 0) {
      alert('No hay depreciaciones para exportar.');
      return;
    }

    let companyName = 'ContaBi';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName = (info as any).name || (info as any).company_name || (info as any).legal_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error obteniendo información de la empresa para Excel de depreciaciones:', error);
    }

    const rows = filteredData.map(dep => ({
      assetCode: dep.assetCode,
      assetName: dep.assetName,
      category: dep.category,
      acquisitionCost: dep.acquisitionCost,
      monthlyDepreciation: dep.monthlyDepreciation,
      accumulatedDepreciation: dep.accumulatedDepreciation,
      remainingValue: dep.remainingValue,
      depreciationDate: new Date(dep.depreciationDate).toLocaleDateString('es-DO'),
      period: dep.period,
      method: dep.method,
      status: dep.status,
    }));

    const headers = [
      { key: 'assetCode', title: 'Código Activo' },
      { key: 'assetName', title: 'Nombre del Activo' },
      { key: 'category', title: 'Categoría' },
      { key: 'acquisitionCost', title: 'Costo Adquisición' },
      { key: 'monthlyDepreciation', title: 'Depreciación Mensual' },
      { key: 'accumulatedDepreciation', title: 'Depreciación Acumulada' },
      { key: 'remainingValue', title: 'Valor Remanente' },
      { key: 'depreciationDate', title: 'Fecha Depreciación' },
      { key: 'period', title: 'Período' },
      { key: 'method', title: 'Método Depreciación' },
      { key: 'status', title: 'Estado' },
    ];

    const fileBase = `depreciaciones_${new Date().toISOString().split('T')[0]}`;
    const title = 'Depreciación de Activos Fijos';

    const periodText = `Periodo: ${new Date().toISOString().slice(0, 7)}`;

    exportToExcelWithHeaders(
      rows,
      headers,
      fileBase,
      'Depreciaciones',
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
    return formatMoney(amount, 'RD$');
  };

  const getDepreciationJournalEntryNumber = (dep: DepreciationEntry) => {
    const explicit = typeof dep.journalEntryNumber === 'string' ? dep.journalEntryNumber.trim() : '';
    if (explicit) return explicit;

    const period = String(dep.period || '').trim();
    if (!period) return null;
    return `DEP-${period}`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate('/fixed-assets')}
              className="flex items-center text-blue-600 hover:text-blue-700 mb-2"
            >
              <i className="ri-arrow-left-line mr-1"></i>
              Volver a Activos Fijos
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Depreciación de Activos</h1>
            <p className="text-gray-600">Cálculo y registro de depreciaciones mensuales</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={exportToPDF}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-printer-line mr-2"></i>
              Exportar PDF
            </button>
            <button
              onClick={exportToExcel}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-file-excel-line mr-2"></i>
              Exportar Excel
            </button>
            <button
              onClick={handleCalculateDepreciation}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-calculator-line mr-2"></i>
              Calcular Depreciación
            </button>
          </div>
        </div>

        {lastJournalEntryNumber && (
          <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg px-4 py-3 flex items-center justify-between">
            <div className="text-sm">
              Asiento generado: <span className="font-semibold">{lastJournalEntryNumber}</span>
            </div>

            <button
              onClick={() => navigate(`/accounting/general-journal?entry=${encodeURIComponent(lastJournalEntryNumber)}`)}
              className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm whitespace-nowrap"
            >
              Ver en Diario
            </button>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Depreciación del Mes</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalDepreciationMonth)}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-blue-100">
                <i className="ri-calendar-line text-xl text-blue-600"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Depreciación Acumulada</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(totalAccumulated)}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-red-100">
                <i className="ri-line-chart-line text-xl text-red-600"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Valor Remanente</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalRemainingValue)}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-green-100">
                <i className="ri-money-dollar-circle-line text-xl text-green-600"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Activos Depreciados</p>
                <p className="text-2xl font-bold text-purple-600">{filteredDepreciations.length}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-purple-100">
                <i className="ri-archive-line text-xl text-purple-600"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  placeholder="Buscar por activo o código..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Período</label>
              <select
                value={filterPeriod}
                onChange={(e) => setFilterPeriod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos los períodos</option>
                {periods.map((period) => (
                  <option key={period} value={period}>{period}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos los estados</option>
                <option value="Calculado">Calculado</option>
                <option value="Pendiente">Pendiente</option>
                <option value="Reversado">Reversado</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterPeriod('');
                  setFilterStatus('');
                }}
                className="w-full bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors whitespace-nowrap"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Depreciation Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Depreciaciones Registradas ({filteredDepreciations.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Costo Adquisición</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Depreciación Mensual</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Depreciación Acumulada</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Remanente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha Depreciación</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Período</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDepreciations.map((depreciation) => (
                  <tr key={depreciation.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{depreciation.assetName}</div>
                        <div className="text-sm text-gray-500">{depreciation.assetCode} - {depreciation.category}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(depreciation.acquisitionCost)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">
                      -{formatCurrency(depreciation.monthlyDepreciation)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                      -{formatCurrency(depreciation.accumulatedDepreciation)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                      {formatCurrency(depreciation.remainingValue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {depreciation.depreciationDate ? new Date(depreciation.depreciationDate).toLocaleDateString('es-DO') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {depreciation.period}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        depreciation.status === 'Calculado' ? 'bg-green-100 text-green-800' :
                        depreciation.status === 'Pendiente' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {depreciation.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleViewDetails(depreciation.id)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Ver detalles"
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
                            className="text-indigo-600 hover:text-indigo-900"
                            title="Ver en Diario"
                          >
                            <i className="ri-book-open-line"></i>
                          </button>
                        )}

                        {(depreciation.status === 'Calculado' || depreciation.status === 'Reversado') && (
                          <button
                            onClick={() => handleReverseDepreciation(depreciation.id)}
                            className="text-red-600 hover:text-red-900"
                            title={depreciation.status === 'Reversado' ? 'Marcar como calculado' : 'Reversar depreciación'}
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

        {showModal && selectedDepreciation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Detalle de Depreciación</h3>
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
                      className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm whitespace-nowrap"
                    >
                      Ver en Diario
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setSelectedDepreciation(null);
                      setShowModal(false);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Activo</label>
                    <p className="text-sm text-gray-900">{selectedDepreciation.assetName}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Código</label>
                    <p className="text-sm text-gray-900">{selectedDepreciation.assetCode}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Costo Adquisición</label>
                    <p className="text-sm text-gray-900">{formatCurrency(selectedDepreciation.acquisitionCost)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Depreciación Mensual</label>
                    <p className="text-sm text-gray-900">{formatCurrency(selectedDepreciation.monthlyDepreciation)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fecha Depreciación</label>
                    <p className="text-sm text-gray-900">{selectedDepreciation.depreciationDate ? new Date(selectedDepreciation.depreciationDate).toLocaleDateString('es-DO') : '-'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Período</label>
                    <p className="text-sm text-gray-900">{selectedDepreciation.period}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
                    <p className="text-sm text-gray-900">{selectedDepreciation.status}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Depreciación Acumulada</label>
                    <p className="text-sm text-gray-900">{formatCurrency(selectedDepreciation.accumulatedDepreciation)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Valor Remanente</label>
                    <p className="text-sm text-gray-900">{formatCurrency(selectedDepreciation.remainingValue)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Calculate Depreciation Modal */}
        {showCalculateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  Calcular Depreciación Mensual
                </h3>
                <button
                  onClick={() => setShowCalculateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <form onSubmit={handleProcessDepreciation} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Período de Depreciación *
                    </label>
                    <input
                      type="month"
                      required
                      name="period"
                      value={calculationPeriod}
                      onChange={(e) => setCalculationPeriod(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha de Proceso *
                    </label>
                    <input
                      type="date"
                      required
                      name="processDate"
                      defaultValue={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Categorías a Incluir
                  </label>
                  <div className="space-y-2">
                    {availableCategories.map(category => (
                      <label key={category} className="flex items-center">
                        <input
                          type="checkbox"
                          className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          checked={selectedCategories.includes(category)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCategories(prev => Array.from(new Set([...prev, category])));
                            } else {
                              setSelectedCategories(prev => prev.filter(c => c !== category));
                            }
                          }}
                        />
                        <span className="text-sm">{category}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Resumen del Cálculo</h4>
                  <div className="text-sm text-blue-800 space-y-1">
                    {(() => {
                      // Filtrar activos depreciables según las categorías seleccionadas
                      // Debe tener status activo, categoría seleccionada, y valor depreciable
                      const depreciableAssets = assets.filter((a: any) => {
                        const cat = a.category || '';
                        const status = String(a.status || '').toLowerCase();
                        const isActive = status === 'active' || status === 'activo';
                        const inCategory = selectedCategories.includes(cat);
                        
                        // Calcular si tiene valor depreciable
                        const purchaseValue = Number(a.purchase_value ?? a.purchase_cost ?? 0) || 0;
                        const salvageValue = Number(a.salvage_value ?? 0) || 0;
                        const depreciableAmount = purchaseValue - salvageValue;
                        const accumulatedDepr = Number(a.accumulated_depreciation ?? 0) || 0;
                        const remainingValue = depreciableAmount - accumulatedDepr;
                        
                        return isActive && inCategory && depreciableAmount > 0 && remainingValue > 0;
                      });
                      
                      // Calcular depreciación mensual estimada (igual que el servicio)
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
                            const usefulLifeMonths = Math.round(100 / depreciationRate * 12);
                            monthlyDepr = depreciableAmount / usefulLifeMonths;
                          }
                        }
                        
                        // No exceder el valor remanente
                        const remainingValue = depreciableAmount - accumulatedDepr;
                        const finalDepr = Math.min(monthlyDepr, remainingValue);
                        
                        return sum + (finalDepr > 0 ? finalDepr : 0);
                      }, 0);
                      
                      const periodDate = new Date(calculationPeriod + '-01');
                      const periodLabel = periodDate.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
                      
                      return (
                        <>
                          <p>• Activos a depreciar: {depreciableAssets.length}</p>
                          <p>• Depreciación total estimada: {formatCurrency(totalEstimatedDepr)}</p>
                          <p>• Período: {periodLabel}</p>
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowCalculateModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    Procesar Depreciación
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