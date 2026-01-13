import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { invoicesService, salesRepsService, storesService, settingsService } from '../../../services/database';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { exportToExcelWithHeaders } from '../../../utils/exportImportUtils';

const BASE_CARD_CLASSES =
  'bg-[#FBF7EF] border border-[#D9C8A9] rounded-2xl shadow-[0_18px_38px_rgba(55,74,58,0.12)]';
const INPUT_CLASSES =
  'w-full px-3 py-2 border border-[#D9C8A9] rounded-lg text-sm bg-white text-[#2F3D2E] focus:ring-2 focus:ring-[#3C4F3C] focus:border-[#3C4F3C] transition';
const PRIMARY_BUTTON_CLASSES =
  'px-4 py-2 bg-[#3C4F3C] text-white rounded-lg hover:bg-[#2D3B2E] text-sm font-semibold flex items-center gap-2 shadow-[0_10px_25px_rgba(60,79,60,0.3)] transition disabled:opacity-50 disabled:cursor-not-allowed';
const PDF_BUTTON_CLASSES =
  'px-4 py-2 bg-[#B9583C] text-white rounded-lg hover:bg-[#a24b31] text-sm font-semibold flex items-center gap-2 shadow-[0_10px_20px_rgba(185,88,60,0.35)] transition disabled:opacity-50 disabled:cursor-not-allowed';
const EXCEL_BUTTON_CLASSES =
  'px-4 py-2 bg-[#7A705A] text-white rounded-lg hover:bg-[#6A5F53] text-sm font-semibold flex items-center gap-2 shadow-[0_10px_20px_rgba(122,112,90,0.35)] transition disabled:opacity-50 disabled:cursor-not-allowed';

interface CommissionRow {
  salesRepId: string;
  salesRepName: string;
  storeNames: string[];
  invoiceCount: number;
  totalSales: number;
  commissionRate: number;
  commissionAmount: number;
}

export default function CommissionReportPage() {
  const { user } = useAuth();

  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [salesReps, setSalesReps] = useState<Array<{ id: string; name: string; commission_rate?: number | null }>>([]);
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);

  const [selectedSalesRepId, setSelectedSalesRepId] = useState<string>('all');
  const [selectedStoreName, setSelectedStoreName] = useState<string>('all');

  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const loadFilters = async () => {
      try {
        const [reps, sts] = await Promise.all([
          salesRepsService.getAll(user.id),
          storesService.getAll(user.id),
        ]);
        setSalesReps((reps || []) as any[]);
        setStores((sts || []).map((s: any) => ({ id: String(s.id), name: String(s.name || '') })));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error cargando vendedores/tiendas para reporte de comisión:', error);
      }
    };
    loadFilters();
  }, [user?.id]);

  const handleGenerate = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const invoices = await invoicesService.getAll(user.id);

      const filtered = (invoices || []).filter((inv: any) => {
        if (!inv.invoice_date) return false;
        const d = String(inv.invoice_date).slice(0, 10);
        if (d < fromDate || d > toDate) return false;

        const repId = (inv as any).sales_rep_id ? String((inv as any).sales_rep_id) : '';
        if (selectedSalesRepId !== 'all' && repId !== selectedSalesRepId) return false;

        const storeName = (inv as any).store_name ? String((inv as any).store_name) : '';
        if (selectedStoreName !== 'all' && storeName !== selectedStoreName) return false;

        return true;
      });

      const repMap = new Map<string, CommissionRow>();

      filtered.forEach((inv: any) => {
        const repId = (inv as any).sales_rep_id ? String((inv as any).sales_rep_id) : 'sin-vendedor';
        const repInfo = salesReps.find(r => String(r.id) === repId);
        const repName = repInfo?.name || 'Sin vendedor';
        const rate = typeof repInfo?.commission_rate === 'number' ? repInfo!.commission_rate! : 0;

        const storeName = (inv as any).store_name ? String((inv as any).store_name) : '';
        const total = Number(inv.total_amount) || 0;

        const current = repMap.get(repId) || {
          salesRepId: repId,
          salesRepName: repName,
          storeNames: [],
          invoiceCount: 0,
          totalSales: 0,
          commissionRate: rate,
          commissionAmount: 0,
        };

        if (storeName && !current.storeNames.includes(storeName)) {
          current.storeNames.push(storeName);
        }
        current.invoiceCount += 1;
        current.totalSales += total;
        current.commissionRate = rate;
        current.commissionAmount = current.totalSales * (rate / 100);

        repMap.set(repId, current);
      });

      const rowsArray = Array.from(repMap.values()).sort((a, b) => b.totalSales - a.totalSales);
      setRows(rowsArray);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error generando reporte de comisión:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const totalSalesAll = rows.reduce((sum, r) => sum + r.totalSales, 0);
  const totalCommissionAll = rows.reduce((sum, r) => sum + r.commissionAmount, 0);

  const handleExportPdf = async () => {
    if (!rows || rows.length === 0) return;

    let companyName = 'ContaBi';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName = (info as any).name || (info as any).company_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error obteniendo información de la empresa para PDF de comisión:', error);
    }

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.text(companyName, pageWidth / 2, 15, { align: 'center' } as any);

    const title = 'Reporte de Comisión por Vendedor';
    doc.setFontSize(14);
    doc.text(title, 14, 24);

    const periodText = `Período: ${fromDate} a ${toDate}`;
    doc.setFontSize(10);
    doc.text(periodText, 14, 30);

    const headers = [
      ['Vendedor', 'Tiendas', '# Facturas', 'Ventas ()', '% Comisión', 'Comisión ()'],
    ];

    const body = rows.map((row) => [
      row.salesRepName,
      row.storeNames.length > 0 ? row.storeNames.join(', ') : 'Sin tienda',
      String(row.invoiceCount),
      row.totalSales.toLocaleString('es-DO', { maximumFractionDigits: 2 }),
      `${row.commissionRate.toLocaleString('es-DO', { maximumFractionDigits: 2 })}%`,
      row.commissionAmount.toLocaleString('es-DO', { maximumFractionDigits: 2 }),
    ]);

    // @ts-expect-error - autotable está inyectado por el import de 'jspdf-autotable'
    doc.autoTable({
      head: headers,
      body,
      startY: 38,
      styles: { fontSize: 8 },
    });

    const fileName = `reporte_comision_${fromDate}_a_${toDate}.pdf`;
    doc.save(fileName);
  };

  const handleExportExcel = async () => {
    if (!rows || rows.length === 0) return;

    const data = rows.map((row) => ({
      salesRepName: row.salesRepName,
      stores: row.storeNames.length > 0 ? row.storeNames.join(', ') : 'Sin tienda',
      invoiceCount: row.invoiceCount,
      totalSales: row.totalSales,
      commissionRate: row.commissionRate,
      commissionAmount: row.commissionAmount,
    }));

    let companyName = 'ContaBi';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName = (info as any).name || (info as any).company_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error obteniendo información de la empresa para Excel de comisión:', error);
    }

    const headers = [
      { key: 'salesRepName', title: 'Vendedor' },
      { key: 'stores', title: 'Tiendas' },
      { key: 'invoiceCount', title: '# Facturas' },
      { key: 'totalSales', title: 'Ventas ()' },
      { key: 'commissionRate', title: '% Comisión' },
      { key: 'commissionAmount', title: 'Comisión ()' },
    ];

    const fileBase = `reporte-comision-${fromDate}-a-${toDate}`;
    const title = `Reporte de Comisión por Vendedor (${fromDate} a ${toDate})`;

    exportToExcelWithHeaders(
      data,
      headers,
      fileBase,
      'Comisiones',
      [26, 32, 14, 18, 16, 18],
      {
        title,
        companyName,
      },
    );
  };

  const summaryCards = [
    {
      id: 'total-sales',
      title: 'Total Sales',
      value: ` ${totalSalesAll.toLocaleString('es-DO', { maximumFractionDigits: 2 })}`,
      helper: 'All sales for the selected filters',
      icon: 'ri-funds-box-line',
      accentBg: 'bg-[#DDE7D0]',
      iconColor: 'text-[#2F3D2E]',
    },
    {
      id: 'total-commission',
      title: 'Total Commissions',
      value: ` ${totalCommissionAll.toLocaleString('es-DO', { maximumFractionDigits: 2 })}`,
      helper: 'Estimated payouts',
      icon: 'ri-hand-coin-line',
      accentBg: 'bg-[#E7DFC9]',
      iconColor: 'text-[#324532]',
    },
    {
      id: 'active-reps',
      title: 'Reps with Sales',
      value: rows.length.toString(),
      helper: 'Unique sales reps',
      icon: 'ri-user-star-line',
      accentBg: 'bg-[#E5E2D9]',
      iconColor: 'text-[#2F3D2E]',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8 bg-[#F4ECDC] min-h-screen rounded-[32px] p-6">
        {/* Header */}
        <div>
          <span className="inline-flex items-center text-xs font-semibold tracking-[0.2em] uppercase text-[#7A705A]">
            Performance
          </span>
          <h1 className="text-3xl font-semibold text-[#2F3D2E] mt-2">Commission Report</h1>
          <p className="text-[#5F6652] max-w-2xl">
            Review sales by representative, store, and time period to calculate commissions with confidence.
          </p>
        </div>

        {/* Filters */}
        <div className={`${BASE_CARD_CLASSES} space-y-4 p-6`}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#5F6652] mb-1">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={INPUT_CLASSES}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#5F6652] mb-1">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={INPUT_CLASSES}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#5F6652] mb-1">Sales Representative</label>
              <select
                value={selectedSalesRepId}
                onChange={(e) => setSelectedSalesRepId(e.target.value)}
                className={`${INPUT_CLASSES} pr-8`}
              >
                <option value="all">All sales reps</option>
                {salesReps.map((rep) => (
                  <option key={rep.id} value={String(rep.id)}>{rep.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#5F6652] mb-1">Store / Branch</label>
              <select
                value={selectedStoreName}
                onChange={(e) => setSelectedStoreName(e.target.value)}
                className={`${INPUT_CLASSES} pr-8`}
              >
                <option value="all">All stores</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={handleGenerate} className={PRIMARY_BUTTON_CLASSES}>
              <i className="ri-file-chart-line" />
              <span>Generate Report</span>
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={rows.length === 0}
              className={PDF_BUTTON_CLASSES}
            >
              <i className="ri-file-pdf-line" />
              <span>Export PDF</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={rows.length === 0}
              className={EXCEL_BUTTON_CLASSES}
            >
              <i className="ri-file-excel-line" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {summaryCards.map((card) => (
            <div key={card.id} className={`${BASE_CARD_CLASSES} p-6`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#5F6652]">{card.title}</p>
                  <p className="text-2xl font-semibold text-[#2F3D2E] mt-1">{card.value}</p>
                  <p className="text-xs text-[#7A705A] mt-1">{card.helper}</p>
                </div>
                <div className={`${card.accentBg} ${card.iconColor} ${'w-12 h-12 rounded-xl flex items-center justify-center'}`}>
                  <i className={`${card.icon} text-xl`}></i>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Results Table */}
        <div className={`${BASE_CARD_CLASSES} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-[#D9C8A9] flex items-center justify-between bg-[#F8F1E3] rounded-t-2xl">
            <div>
              <h2 className="text-sm font-semibold text-[#2F3D2E]">Sales by Representative</h2>
              <p className="text-xs text-[#7A705A]">Detailed commission breakdown</p>
            </div>
            {loading && (
              <span className="text-xs text-[#7A705A] flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-[#3C4F3C] border-t-transparent animate-spin" />
                Loading...
              </span>
            )}
          </div>
          {rows.length === 0 && !loading ? (
            <div className="p-6 text-center text-sm text-[#7A705A]">
              No sales match the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#EADDC4] text-sm text-[#2F3D2E]">
                <thead className="bg-[#FFF9EE] text-xs uppercase tracking-wide text-[#7A705A]">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold">Sales Rep</th>
                    <th className="px-6 py-3 text-left font-semibold">Stores</th>
                    <th className="px-6 py-3 text-right font-semibold"># Invoices</th>
                    <th className="px-6 py-3 text-right font-semibold">Sales ()</th>
                    <th className="px-6 py-3 text-right font-semibold">Commission %</th>
                    <th className="px-6 py-3 text-right font-semibold">Commission ()</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0E4CF] bg-white">
                  {rows.map((row) => (
                    <tr key={row.salesRepId} className="hover:bg-[#FFF7E8] transition">
                      <td className="px-6 py-3 whitespace-nowrap">{row.salesRepName}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-xs text-[#5F6652]">
                        {row.storeNames.length > 0 ? row.storeNames.join(', ') : 'No store'}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-right">{row.invoiceCount}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-right">
                         {row.totalSales.toLocaleString('es-DO', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-right">
                        {row.commissionRate.toLocaleString('es-DO', { maximumFractionDigits: 2 })}%
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-right font-semibold">
                         {row.commissionAmount.toLocaleString('es-DO', { maximumFractionDigits: 2 })}
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
