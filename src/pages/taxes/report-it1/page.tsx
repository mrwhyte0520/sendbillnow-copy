import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { taxService, settingsService } from '../../../services/database';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatMoney } from '../../../utils/numberFormat';

interface IT1Data {
  id?: string;
  period: string;
  total_sales: number;
  itbis_collected: number;
  itbis_withheld?: number;
  total_purchases: number;
  itbis_paid: number;
  net_itbis_due: number;
  generated_date: string;
  locked?: boolean;
  locked_at?: string | null;
}

interface IT1Summary {
  totalDeclaraciones: number;
  totalVentasGravadas: number;
  totalITBISCobrado: number;
  totalComprasGravadas: number;
  totalITBISPagado: number;
  saldoNeto: number;
  ultimaDeclaracion: string | null;
}

const periodToLocalDate = (period: string) => {
  const parts = String(period || '').split('-');
  const year = Number(parts[0]) || 0;
  const month = Number(parts[1]) || 0;
  if (!year || !month) return new Date();
  return new Date(year, month - 1, 1);
};

export default function ReportIT1Page() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [reportData, setReportData] = useState<IT1Data | null>(null);
  const [historicalData, setHistoricalData] = useState<IT1Data[]>([]);
  const [, setSummary] = useState<IT1Summary | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);

  useEffect(() => {
    // Set current month as default
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    setSelectedPeriod(currentPeriod);
    setSelectedYear(now.getFullYear().toString());
    
    loadDashboardData();
    loadHistoricalData();

    const loadCompany = async () => {
      const info = await settingsService.getCompanyInfo();
      setCompanyInfo(info);
    };
    loadCompany();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const summaryData = await taxService.getReportIT1Summary();
      setSummary(summaryData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHistoricalData = async () => {
    try {
      const data = await taxService.getReportIT1History(selectedYear || undefined);
      setHistoricalData(data || []);
    } catch (error) {
      console.error('Error loading historical data:', error);
    }
  };

  const generateReport = async () => {
    if (!selectedPeriod) {
      alert('Por favor seleccione un período');
      return;
    }
    
    setGenerating(true);
    try {
      const data = await taxService.generateReportIT1(selectedPeriod);
      setReportData(data);
      setActiveTab('declaration');
      
      // Actualizar datos históricos
      await loadHistoricalData();
      await loadDashboardData();
    } catch (error) {
      console.error('Error generating report IT-1:', error);
      alert('Error al generar el reporte IT-1. Por favor intente nuevamente.');
    } finally {
      setGenerating(false);
    }
  };

  const closeMonth = async () => {
    if (!selectedPeriod) {
      alert('Por favor seleccione un período');
      return;
    }

    const confirmClose = confirm(
      '¿Deseas cerrar el mes? Esto guardará un snapshot del IT-1 para este período.'
    );
    if (!confirmClose) return;

    setSaving(true);
    try {
      const saved = await (taxService as any).closeReportIT1(selectedPeriod, 'normal');
      setReportData(saved);
      await loadHistoricalData();
      await loadDashboardData();
      alert('Mes cerrado: IT-1 guardado correctamente.');
    } catch (error: any) {
      console.error('Error closing IT-1 month:', error);
      alert(error?.message || 'Error al cerrar el mes (guardar IT-1).');
    } finally {
      setSaving(false);
    }
  };

  const lockDeclaration = async () => {
    if (!reportData?.id) {
      alert('Primero debes cerrar el mes para poder bloquearlo.');
      return;
    }
    if (reportData.locked) {
      alert('Este período ya está bloqueado.');
      return;
    }

    const confirmLock = confirm(
      '¿Seguro que deseas BLOQUEAR esta declaración? Luego no se podrá regenerar ni modificar.'
    );
    if (!confirmLock) return;

    setLocking(true);
    try {
      const locked = await (taxService as any).lockReportIT1(reportData.id);
      setReportData(locked);
      await loadHistoricalData();
      await loadDashboardData();
      alert('Declaración bloqueada correctamente.');
    } catch (error: any) {
      console.error('Error locking IT-1:', error);
      alert(error?.message || 'Error al bloquear la declaración IT-1.');
    } finally {
      setLocking(false);
    }
  };

  const exportToExcel = () => {
    if (!reportData) return;

    const excelData = [
      { 'Campo': 'Período', 'Valor': periodToLocalDate(reportData.period).toLocaleDateString('es-DO', { year: 'numeric', month: 'long' }) },
      { 'Campo': '', 'Valor': '' },
      { 'Campo': 'I. VENTAS Y SERVICIOS GRAVADOS', 'Valor': '' },
      { 'Campo': 'Total de Ventas y Servicios Gravados', 'Valor': formatMoney(reportData.total_sales) },
      { 'Campo': 'ITBIS Cobrado en Ventas', 'Valor': formatMoney(reportData.itbis_collected) },
      { 'Campo': '', 'Valor': '' },
      { 'Campo': 'II. COMPRAS Y GASTOS GRAVADOS', 'Valor': '' },
      { 'Campo': 'Total de Compras y Gastos Gravados', 'Valor': formatMoney(reportData.total_purchases) },
      { 'Campo': 'ITBIS Pagado en Compras', 'Valor': formatMoney(reportData.itbis_paid) },
      { 'Campo': '', 'Valor': '' },
      { 'Campo': 'III. LIQUIDACIÓN DEL IMPUESTO', 'Valor': '' },
      { 'Campo': 'ITBIS Cobrado en Ventas', 'Valor': formatMoney(reportData.itbis_collected) },
      { 'Campo': '(-) ITBIS Pagado en Compras', 'Valor': formatMoney(reportData.itbis_paid) },
      { 'Campo': 'ITBIS NETO A PAGAR', 'Valor': formatMoney(reportData.net_itbis_due) },
      { 'Campo': '', 'Valor': '' },
      { 'Campo': 'Fecha de Generación', 'Valor': new Date(reportData.generated_date).toLocaleDateString('es-DO') }
    ];

    const companyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';

    const companyRnc =
      (companyInfo as any)?.rnc ||
      (companyInfo as any)?.tax_id ||
      '';

    const headerRows: (string | number)[][] = [];

    headerRows.push([companyName]);
    if (companyRnc) {
      headerRows.push([`RNC: ${companyRnc}`]);
    }
    headerRows.push(['Declaración Jurada del ITBIS (IT-1)']);
    headerRows.push([
      `Período: ${periodToLocalDate(reportData.period).toLocaleDateString('es-DO', {
        year: 'numeric',
        month: 'long',
      })}`,
    ]);
    headerRows.push([]);

    const wb = XLSX.utils.book_new();
    const tableStartRow = headerRows.length + 1;
    const ws = XLSX.utils.json_to_sheet(excelData as any, { origin: `A${tableStartRow}` } as any);

    ws['!cols'] = [
      { wch: 40 },
      { wch: 20 }
    ];

    (ws as any);
    (ws as any);
    XLSX.utils.sheet_add_aoa(ws, headerRows, { origin: 'A1' });

    XLSX.utils.book_append_sheet(wb, ws, 'Declaración IT-1');
    XLSX.writeFile(wb, `declaracion_it1_${reportData.period}.xlsx`);
  };

  const exportToCSV = () => {
    if (!reportData) return;
    const separator = ';';

    const companyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';

    const companyRnc =
      (companyInfo as any)?.rnc ||
      (companyInfo as any)?.tax_id ||
      '';

    const headerLines: string[] = [
      ['Empresa', companyName].join(separator),
    ];

    if (companyRnc) {
      headerLines.push(['RNC', companyRnc].join(separator));
    }

    headerLines.push(['Reporte', 'Declaración Jurada del ITBIS (IT-1)'].join(separator));
    headerLines.push([
      'Período',
      periodToLocalDate(reportData.period).toLocaleDateString('es-DO', { year: 'numeric', month: 'long' }),
    ].join(separator));
    headerLines.push('');

    const csvContent = [
      ...headerLines,
      ['Campo', 'Valor'].join(separator),
      ['Período', periodToLocalDate(reportData.period).toLocaleDateString('es-DO', { year: 'numeric', month: 'long' })].join(separator),
      ['Total Ventas Gravadas', formatMoney(reportData.total_sales)].join(separator),
      ['ITBIS Cobrado', formatMoney(reportData.itbis_collected)].join(separator),
      ['Total Compras Gravadas', formatMoney(reportData.total_purchases)].join(separator),
      ['ITBIS Pagado', formatMoney(reportData.itbis_paid)].join(separator),
      ['ITBIS Neto a Pagar', formatMoney(reportData.net_itbis_due)].join(separator),
      ['Fecha de Generación', new Date(reportData.generated_date).toLocaleDateString('es-DO')].join(separator),
    ].join('\n');

    const csvForExcel = '\uFEFF' + csvContent.replace(/\n/g, '\r\n');
    const blob = new Blob([csvForExcel], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `declaracion_it1_${reportData.period}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = () => {
    if (!reportData) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    const companyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';

    // Encabezado con nombre de la empresa
    doc.setFontSize(18);
    doc.text(companyName, pageWidth / 2, 18, { align: 'center' } as any);

    doc.setFontSize(14);
    doc.text('Declaración Jurada del ITBIS (IT-1)', pageWidth / 2, 26, { align: 'center' } as any);

    doc.setFontSize(12);
    doc.text(
      `Período: ${periodToLocalDate(reportData.period).toLocaleDateString('es-DO', { year: 'numeric', month: 'long' })}`,
      14,
      36,
    );
    doc.text(
      `Generado el: ${new Date(reportData.generated_date).toLocaleDateString('es-DO')}`,
      14,
      44,
    );

    // Sección I - Ventas
    doc.setFontSize(14);
    doc.text('I. Ventas y Servicios Gravados', 14, 50);

    (doc as any).autoTable({
      startY: 55,
      head: [['Concepto', 'Valor']],
      body: [
        ['Total de Ventas y Servicios Gravados', formatMoney(reportData.total_sales)],
        ['ITBIS Cobrado en Ventas', formatMoney(reportData.itbis_collected)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
    });

    // Sección II - Compras
    const afterSalesY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.text('II. Compras y Gastos Gravados', 14, afterSalesY);

    (doc as any).autoTable({
      startY: afterSalesY + 5,
      head: [['Concepto', 'Valor']],
      body: [
        ['Total de Compras y Gastos Gravados', formatMoney(reportData.total_purchases)],
        ['ITBIS Pagado en Compras', formatMoney(reportData.itbis_paid)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
    });

    // Sección III - Liquidación
    const afterPurchasesY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.text('III. Liquidación del Impuesto', 14, afterPurchasesY);

    const netLabel = reportData.net_itbis_due >= 0 ? 'ITBIS Neto a Pagar' : 'Saldo a Favor';
    const netValue = formatMoney(Math.abs(reportData.net_itbis_due));

    (doc as any).autoTable({
      startY: afterPurchasesY + 5,
      head: [['Concepto', 'Valor']],
      body: [
        ['ITBIS Cobrado en Ventas', formatMoney(reportData.itbis_collected)],
        ['(-) ITBIS Pagado en Compras', formatMoney(reportData.itbis_paid)],
        [netLabel, netValue],
      ],
      theme: 'grid',
      headStyles: { fillColor: [34, 197, 94] },
    });

    doc.save(`declaracion_it1_${reportData.period}.pdf`);
  };

  const exportToTXT = () => {
    if (!reportData) return;
    
    const content = `
DECLARACIÓN JURADA DEL ITBIS (IT-1)
===================================

Período: ${periodToLocalDate(reportData.period).toLocaleDateString('es-DO', { year: 'numeric', month: 'long' })}

I. VENTAS Y SERVICIOS GRAVADOS
------------------------------
Total de Ventas y Servicios Gravados: ${formatMoney(reportData.total_sales)}
ITBIS Cobrado en Ventas: ${formatMoney(reportData.itbis_collected)}

II. COMPRAS Y GASTOS GRAVADOS
-----------------------------
Total de Compras y Gastos Gravados: ${formatMoney(reportData.total_purchases)}
ITBIS Pagado en Compras: ${formatMoney(reportData.itbis_paid)}

III. LIQUIDACIÓN DEL IMPUESTO
-----------------------------
ITBIS Cobrado en Ventas: ${formatMoney(reportData.itbis_collected)}
(-) ITBIS Pagado en Compras: ${formatMoney(reportData.itbis_paid)}
ITBIS NETO A PAGAR: ${formatMoney(reportData.net_itbis_due)}

Generado el: ${new Date(reportData.generated_date).toLocaleDateString('es-DO')} a las ${new Date(reportData.generated_date).toLocaleTimeString('es-DO')}

---
Sistema de Contabilidad - República Dominicana
Cumple con las normativas de la DGII
    `;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `declaracion_it1_${reportData.period}.txt`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportHistoricalToCSV = () => {
    if (filteredHistoricalData.length === 0) return;
    
    const separator = ';';

    const companyName =
      (companyInfo as any)?.name ||
      (companyInfo as any)?.company_name ||
      'ContaBi';

    const companyRnc =
      (companyInfo as any)?.rnc ||
      (companyInfo as any)?.tax_id ||
      '';

    const headerLines: string[] = [
      ['Empresa', companyName].join(separator),
    ];

    if (companyRnc) {
      headerLines.push(['RNC', companyRnc].join(separator));
    }

    headerLines.push(['Reporte', 'Historial Declaración IT-1 (ITBIS)'].join(separator));
    headerLines.push(['Año', selectedYear || 'Todos los años'].join(separator));
    headerLines.push('');

    const csvLines = [
      ...headerLines,
      ['Período', 'Total Ventas', 'ITBIS Cobrado', 'Total Compras', 'ITBIS Pagado', 'ITBIS Neto', 'Fecha Generación'].join(separator),
      ...filteredHistoricalData.map(record => [
        new Date(record.period + '-01').toLocaleDateString('es-DO', { year: 'numeric', month: 'long' }),
        formatMoney(record.total_sales),
        formatMoney(record.itbis_collected),
        formatMoney(record.total_purchases),
        formatMoney(record.itbis_paid),
        formatMoney(record.net_itbis_due),
        new Date(record.generated_date).toLocaleDateString('es-DO')
      ].join(separator)),
    ];

    const csvContent = csvLines.join('\n');

    const blob = new Blob(['\uFEFF' + csvContent.replace(/\n/g, '\r\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `historial_it1_${selectedYear || 'todos'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredHistoricalData = historicalData.filter(record => {
    const matchesSearch = !searchTerm || 
      record.period.toLowerCase().includes(searchTerm.toLowerCase()) ||
      periodToLocalDate(record.period).toLocaleDateString('es-DO', { year: 'numeric', month: 'long' }).toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesYear = !selectedYear || record.period.startsWith(selectedYear);
    
    return matchesSearch && matchesYear;
  });

  const getMonthName = (period: string) => {
    return periodToLocalDate(period).toLocaleDateString('es-DO', { year: 'numeric', month: 'long' });
  };

  const formatCurrency = (amount: number) => {
    return formatMoney(amount);
  };

  const getStatusColor = (amount: number) => {
    if (amount > 0) return 'text-red-600';
    if (amount < 0) return 'text-green-600';
    return 'text-gray-600';
  };

  const getStatusText = (amount: number) => {
    if (amount > 0) return 'A Pagar';
    if (amount < 0) return 'Saldo a Favor';
    return 'Sin Saldo';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reporte IT-1</h1>
            <p className="text-gray-600">Declaración Jurada Mensual del ITBIS</p>
          </div>
          <button
            onClick={() => navigate('/taxes')}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-arrow-left-line mr-2"></i>
            Volver a Impuestos
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'dashboard'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="ri-dashboard-line mr-2"></i>
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('declaration')}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'declaration'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="ri-file-text-line mr-2"></i>
                Generar Declaración
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'history'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="ri-history-line mr-2"></i>
                Historial
              </button>
            </nav>
          </div>

          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div className="p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Resumen Ejecutivo IT-1</h3>
                
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <i className="ri-loader-4-line animate-spin text-2xl text-blue-600 mr-3"></i>
                    <span className="text-gray-600">Cargando estadísticas...</span>
                  </div>
                ) : (
                  <>
                    {/* Main Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                      <div className="bg-blue-50 rounded-lg p-6">
                        <div className="flex items-center">
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-blue-100">
                            <i className="ri-file-list-3-line text-xl text-blue-600"></i>
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600">Total Declaraciones</p>
                            <p className="text-2xl font-bold text-blue-600">{historicalData.length}</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-green-50 rounded-lg p-6">
                        <div className="flex items-center">
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-green-100">
                            <i className="ri-money-dollar-circle-line text-xl text-green-600"></i>
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600">ITBIS Cobrado Total</p>
                            <p className="text-2xl font-bold text-green-600">
                              {formatCurrency(historicalData.reduce((sum, item) => sum + item.itbis_collected, 0))}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-orange-50 rounded-lg p-6">
                        <div className="flex items-center">
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-orange-100">
                            <i className="ri-shopping-cart-line text-xl text-orange-600"></i>
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600">ITBIS Pagado Total</p>
                            <p className="text-2xl font-bold text-orange-600">
                              {formatCurrency(historicalData.reduce((sum, item) => sum + item.itbis_paid, 0))}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-red-50 rounded-lg p-6">
                        <div className="flex items-center">
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-red-100">
                            <i className="ri-calculator-line text-xl text-red-600"></i>
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600">ITBIS Neto Total</p>
                            <p className="text-2xl font-bold text-red-600">
                              {formatCurrency(historicalData.reduce((sum, item) => sum + item.net_itbis_due, 0))}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Recent Declarations */}
                    <div className="bg-gray-50 rounded-lg p-6">
                      <h4 className="text-md font-semibold text-gray-900 mb-4">Últimas Declaraciones</h4>
                      <div className="space-y-3">
                        {historicalData.slice(0, 5).map((record) => (
                          <div key={record.id} className="flex items-center justify-between bg-white p-4 rounded-lg">
                            <div className="flex items-center">
                              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100">
                                <i className="ri-calendar-line text-blue-600"></i>
                              </div>
                              <div className="ml-3">
                                <p className="font-medium text-gray-900">{getMonthName(record.period)}</p>
                                <p className="text-sm text-gray-500">
                                  Generado: {new Date(record.generated_date).toLocaleDateString('es-DO')}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-semibold ${getStatusColor(record.net_itbis_due)}`}>
                                {formatCurrency(Math.abs(record.net_itbis_due))}
                              </p>
                              <p className="text-sm text-gray-500">{getStatusText(record.net_itbis_due)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Declaration Tab */}
          {activeTab === 'declaration' && (
            <div className="p-6">
              {/* Controls */}
              <div className="bg-gray-50 rounded-lg p-6 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Período
                      </label>
                      <input
                        type="month"
                        value={selectedPeriod}
                        onChange={(e) => setSelectedPeriod(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="pt-6">
                      <button
                        onClick={generateReport}
                        disabled={generating || !selectedPeriod}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {generating ? (
                          <>
                            <i className="ri-loader-4-line animate-spin mr-2"></i>
                            Generando...
                          </>
                        ) : (
                          <>
                            <i className="ri-calendar-check-line mr-2"></i>
                            Generar Declaración
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  {reportData && (
                    <div className="flex space-x-2">
                      <button
                        onClick={closeMonth}
                        disabled={saving || reportData?.locked}
                        className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {saving ? (
                          <>
                            <i className="ri-loader-4-line animate-spin mr-2"></i>
                            Guardando...
                          </>
                        ) : (
                          <>
                            <i className="ri-lock-unlock-line mr-2"></i>
                            Cerrar mes
                          </>
                        )}
                      </button>

                      <button
                        onClick={lockDeclaration}
                        disabled={locking || !reportData?.id || reportData?.locked}
                        className="bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-black transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {locking ? (
                          <>
                            <i className="ri-loader-4-line animate-spin mr-2"></i>
                            Bloqueando...
                          </>
                        ) : (
                          <>
                            <i className="ri-lock-line mr-2"></i>
                            Bloquear
                          </>
                        )}
                      </button>

                      <button
                        onClick={exportToExcel}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
                      >
                        <i className="ri-file-excel-2-line mr-2"></i>
                        Exportar Excel
                      </button>
                      <button
                        onClick={exportToCSV}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                      >
                        <i className="ri-file-excel-line mr-2"></i>
                        Exportar CSV
                      </button>
                      <button
                        onClick={exportToTXT}
                        className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap"
                      >
                        <i className="ri-file-text-line mr-2"></i>
                        Exportar TXT
                      </button>
                      <button
                        onClick={exportToPDF}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                      >
                        <i className="ri-file-pdf-line mr-2"></i>
                        Exportar PDF
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Declaration Form */}
              {reportData && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-6 border-b border-gray-200 bg-blue-50">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <h3 className="text-lg font-semibold text-gray-900">
                      Declaración Jurada del ITBIS (IT-1) - {getMonthName(reportData.period)}
                      </h3>

                      <div className="flex items-center gap-2">
                        {reportData.locked ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-900 text-white">
                            Bloqueado
                          </span>
                        ) : reportData.id ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                            Cerrado (guardado)
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                            Preview (no guardado)
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Formulario oficial según normativas de la DGII
                    </p>
                  </div>
                  <div className="p-6 space-y-8">
                    {/* Sales Section */}
                    <div>
                      <h4 className="text-md font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2">
                        I. VENTAS Y SERVICIOS GRAVADOS
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Total de Ventas y Servicios Gravados
                          </label>
                          <div className="text-2xl font-bold text-blue-600">
                            {formatCurrency(reportData.total_sales)}
                          </div>
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            ITBIS Cobrado en Ventas
                          </label>
                          <div className="text-2xl font-bold text-green-600">
                            {formatCurrency(reportData.itbis_collected)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Purchases Section */}
                    <div>
                      <h4 className="text-md font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2">
                        II. COMPRAS Y GASTOS GRAVADOS
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-orange-50 p-4 rounded-lg">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Total de Compras y Gastos Gravados
                          </label>
                          <div className="text-2xl font-bold text-orange-600">
                            {formatCurrency(reportData.total_purchases)}
                          </div>
                        </div>
                        <div className="bg-purple-50 p-4 rounded-lg">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            ITBIS Pagado en Compras
                          </label>
                          <div className="text-2xl font-bold text-purple-600">
                            {formatCurrency(reportData.itbis_paid)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Calculation Section */}
                    <div>
                      <h4 className="text-md font-semibold text-gray-900 mb-4 border-b border-gray-200 pb-2">
                        III. LIQUIDACIÓN DEL IMPUESTO
                      </h4>
                      <div className="bg-gray-50 p-6 rounded-lg">
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-700">ITBIS Cobrado en Ventas:</span>
                            <span className="font-semibold">{formatCurrency(reportData.itbis_collected)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-700">(-) ITBIS Retenido por Clientes:</span>
                            <span className="font-semibold">{formatCurrency(reportData.itbis_withheld || 0)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-700">(-) ITBIS Pagado en Compras:</span>
                            <span className="font-semibold">{formatCurrency(reportData.itbis_paid)}</span>
                          </div>
                          <div className="border-t border-gray-300 pt-4">
                            <div className="flex justify-between items-center">
                              <span className="text-lg font-semibold text-gray-900">
                                {reportData.net_itbis_due >= 0 ? 'ITBIS a Pagar:' : 'Saldo a Favor:'}
                              </span>
                              <span className={`text-2xl font-bold ${getStatusColor(reportData.net_itbis_due)}`}>
                                {formatCurrency(Math.abs(reportData.net_itbis_due))}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-white border-2 border-blue-200 rounded-lg p-6 text-center">
                        <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-blue-100 mx-auto mb-4">
                          <i className="ri-money-dollar-circle-line text-xl text-blue-600"></i>
                        </div>
                        <h5 className="text-sm font-medium text-gray-600 mb-2">Total Ventas</h5>
                        <p className="text-xl font-bold text-blue-600">
                          {formatCurrency(reportData.total_sales)}
                        </p>
                      </div>
                      <div className="bg-white border-2 border-green-200 rounded-lg p-6 text-center">
                        <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-green-100 mx-auto mb-4">
                          <i className="ri-percent-line text-xl text-green-600"></i>
                        </div>
                        <h5 className="text-sm font-medium text-gray-600 mb-2">ITBIS Cobrado</h5>
                        <p className="text-xl font-bold text-green-600">
                          {formatCurrency(reportData.itbis_collected)}
                        </p>
                      </div>
                      <div className="bg-white border-2 border-red-200 rounded-lg p-6 text-center">
                        <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-red-100 mx-auto mb-4">
                          <i className="ri-calculator-line text-xl text-red-600"></i>
                        </div>
                        <h5 className="text-sm font-medium text-gray-600 mb-2">
                          {reportData.net_itbis_due >= 0 ? 'ITBIS a Pagar' : 'Saldo a Favor'}
                        </h5>
                        <p className={`text-xl font-bold ${getStatusColor(reportData.net_itbis_due)}`}>
                          {formatCurrency(Math.abs(reportData.net_itbis_due))}
                        </p>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="text-center text-sm text-gray-500 border-t border-gray-200 pt-4">
                      Declaración generada el {new Date(reportData.generated_date).toLocaleDateString('es-DO')} a las {new Date(reportData.generated_date).toLocaleTimeString('es-DO')}
                      {reportData.locked && reportData.locked_at ? (
                        <>
                          <br />
                          Bloqueado el {new Date(reportData.locked_at).toLocaleDateString('es-DO')}
                        </>
                      ) : null}
                      <br />
                      <span className="text-xs">Sistema de Contabilidad - Cumple con normativas DGII</span>
                    </div>
                  </div>
                </div>
              )}

              {/* No Data Message */}
              {!reportData && !generating && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                  <div className="w-16 h-16 rounded-lg flex items-center justify-center bg-gray-100 mx-auto mb-4">
                    <i className="ri-calendar-check-line text-2xl text-gray-400"></i>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay declaración generada</h3>
                  <p className="text-gray-600 mb-4">Seleccione un período y genere la declaración IT-1</p>
                  <button
                    onClick={generateReport}
                    disabled={!selectedPeriod}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    <i className="ri-add-line mr-2"></i>
                    Generar Primera Declaración
                  </button>
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="p-6">
              {/* Filters */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Buscar
                      </label>
                      <input
                        type="text"
                        placeholder="Buscar por período..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Año
                      </label>
                      <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Todos los años</option>
                        <option value="2024">2024</option>
                        <option value="2023">2023</option>
                        <option value="2022">2022</option>
                      </select>
                    </div>
                    <div className="pt-6">
                      <span className="text-sm text-gray-600">
                        {filteredHistoricalData.length} declaraciones encontradas
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={exportHistoricalToCSV}
                    disabled={filteredHistoricalData.length === 0}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <i className="ri-download-line mr-2"></i>
                    Exportar Historial
                  </button>
                </div>
              </div>

              {/* Historical Data Table */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Período
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Ventas
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          ITBIS Cobrado
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          ITBIS Pagado
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          ITBIS Neto
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Estado
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Fecha Generación
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredHistoricalData.map((record) => (
                        <tr key={record.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-100">
                                <i className="ri-calendar-line text-blue-600"></i>
                              </div>
                              <div className="ml-3">
                                <div className="text-sm font-medium text-gray-900">
                                  {getMonthName(record.period)}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(record.total_sales)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                            {formatCurrency(record.itbis_collected)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-600 font-medium">
                            {formatCurrency(record.itbis_paid)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <span className={getStatusColor(record.net_itbis_due)}>
                              {formatCurrency(Math.abs(record.net_itbis_due))}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                record.net_itbis_due > 0 
                                  ? 'bg-red-100 text-red-800' 
                                  : record.net_itbis_due < 0 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {getStatusText(record.net_itbis_due)}
                              </span>
                              {record.locked ? (
                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-900 text-white w-fit">
                                  Bloqueado
                                </span>
                              ) : (
                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 w-fit">
                                  Cerrado
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(record.generated_date).toLocaleDateString('es-DO')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filteredHistoricalData.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-lg flex items-center justify-center bg-gray-100 mx-auto mb-4">
                      <i className="ri-search-line text-2xl text-gray-400"></i>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No se encontraron declaraciones</h3>
                    <p className="text-gray-600">Intente ajustar los filtros de búsqueda</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
