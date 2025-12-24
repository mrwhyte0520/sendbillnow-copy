
import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { useAuth } from '../../../hooks/useAuth';
import {
  apInvoicesService,
  supplierPaymentsService,
  suppliersService,
  bankCurrenciesService,
  bankExchangeRatesService,
  settingsService,
} from '../../../services/database';
import { formatMoney } from '../../../utils/numberFormat';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [reportType, setReportType] = useState('aging');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [supplier, setSupplier] = useState('all');
  const [showReport, setShowReport] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [apInvoices, setApInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [agingData, setAgingData] = useState<any[]>([]);
  const [paymentsData, setPaymentsData] = useState<any[]>([]);
  const [baseCurrencyCode, setBaseCurrencyCode] = useState<string>('DOP');
  const [isGenerating, setIsGenerating] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);

  const loadSuppliers = async () => {
    if (!user?.id) {
      setSuppliers([]);
      return;
    }
    try {
      const data = await suppliersService.getAll(user.id);
      setSuppliers(data || []);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading suppliers for AP reports', error);
      setSuppliers([]);
    }
  };

  const loadApInvoices = async () => {
    if (!user?.id) {
      setApInvoices([]);
      return;
    }
    try {
      const data = await apInvoicesService.getAll(user.id);
      setApInvoices(data || []);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading AP invoices for AP reports', error);
      setApInvoices([]);
    }
  };

  const loadPayments = async () => {
    if (!user?.id) {
      setPayments([]);
      return;
    }
    try {
      const data = await supplierPaymentsService.getAll(user.id);
      setPayments(data || []);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading supplier payments for AP reports', error);
      setPayments([]);
    }
  };

  const loadCurrencies = async () => {
    if (!user?.id) {
      setBaseCurrencyCode('DOP');
      return;
    }
    try {
      const rows = await bankCurrenciesService.getAll(user.id);
      const mapped = (rows || []).map((c: any) => ({
        code: c.code as string,
        is_base: !!c.is_base,
        is_active: c.is_active !== false,
      })).filter((c: any) => c.is_active);
      const base = mapped.find((c: any) => c.is_base) || mapped[0];
      setBaseCurrencyCode(base?.code || 'DOP');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading currencies for AP reports', error);
      setBaseCurrencyCode('DOP');
    }
  };

  useEffect(() => {
    loadSuppliers();
    loadApInvoices();
    loadPayments();
    loadCurrencies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const loadCompanyInfo = async () => {
      try {
        const info = await settingsService.getCompanyInfo();
        setCompanyInfo(info);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading company info for AP reports', error);
      }
    };

    loadCompanyInfo();
  }, [user?.id]);

  const companyName =
    (companyInfo as any)?.name ||
    (companyInfo as any)?.company_name ||
    (companyInfo as any)?.legal_name ||
    '';

  const generateReport = async () => {
    if (!user?.id) {
      alert('Debes iniciar sesión para generar reportes');
      return;
    }

    setIsGenerating(true);
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const selectedSupplierId = supplier === 'all' ? null : supplier;

      if (reportType === 'aging') {
      const bySupplier: Record<string, any> = {};
      const baseCode = baseCurrencyCode || 'DOP';
      const uid = user.id;

      // Mapa de pagos por número de factura (supplier_payments.invoice_number)
      const paymentsByInvoice = payments.reduce<Record<string, number>>((acc, p: any) => {
        const status = p.status || '';
        if (status !== 'Completado' && status !== 'completed') return acc;
        const invNumber = (p.invoice_number || '').toString();
        if (!invNumber) return acc;
        const amount = Number(p.amount) || 0;
        if (!acc[invNumber]) acc[invNumber] = 0;
        acc[invNumber] += amount;
        return acc;
      }, {});

      for (const inv of apInvoices as any[]) {
        if (inv.status === 'cancelled') continue;

        const invoiceDate = inv.invoice_date ? new Date(inv.invoice_date) : null;
        if (invoiceDate && (invoiceDate < start || invoiceDate > end)) continue;

        if (selectedSupplierId && inv.supplier_id !== selectedSupplierId) continue;

        const invoiceNumber = (inv.invoice_number || '').toString();
        const invoiceTotal = Number(inv.total_to_pay ?? inv.total_gross ?? inv.total_net ?? 0) || 0;
        const paidForInvoice = invoiceNumber ? (paymentsByInvoice[invoiceNumber] || 0) : 0;
        const outstanding = Math.max(invoiceTotal - paidForInvoice, 0);
        if (outstanding <= 0) continue; // factura totalmente pagada

        const supplierId = inv.supplier_id as string;
        const supplierName = (inv.suppliers as any)?.name || 'Proveedor';
        if (!bySupplier[supplierId]) {
          bySupplier[supplierId] = {
            supplierId,
            supplier: supplierName,
            total: 0,
            current: 0,
            days1_30: 0,
            days31_60: 0,
            days61_90: 0,
            over90: 0,
          };
        }

        const due = inv.due_date ? new Date(inv.due_date) : invoiceDate;
        const today = new Date();
        let days = 0;
        if (due) {
          days = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        }

        const currency = (inv.currency as string) || baseCode;
        let outstandingBase = outstanding;

        if (currency !== baseCode) {
          try {
            const rate = await bankExchangeRatesService.getEffectiveRate(
              uid,
              currency,
              baseCode,
              (inv.invoice_date as string) || startDate,
            );
            if (rate && rate > 0) {
              outstandingBase = outstanding * rate;
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Error calculando equivalente en moneda base para factura CxP (aging)', error);
          }
        }

        bySupplier[supplierId].total += outstandingBase;
        if (!due || days <= 0) {
          bySupplier[supplierId].current += outstandingBase;
        } else if (days <= 30) {
          bySupplier[supplierId].days1_30 += outstandingBase;
        } else if (days <= 60) {
          bySupplier[supplierId].days31_60 += outstandingBase;
        } else if (days <= 90) {
          bySupplier[supplierId].days61_90 += outstandingBase;
        } else {
          bySupplier[supplierId].over90 += outstandingBase;
        }
      }

      setAgingData(Object.values(bySupplier));
    } else {
      const filteredPayments = payments.filter((p: any) => {
        const payDate = p.payment_date ? new Date(p.payment_date) : null;
        if (!payDate || payDate < start || payDate > end) return false;
        if (p.status && p.status !== 'Completado' && p.status !== 'completed') return false;
        if (selectedSupplierId && p.supplier_id !== selectedSupplierId) return false;
        return true;
      });

      const rows = filteredPayments.map((p: any) => ({
        date: p.payment_date,
        supplier: (p.suppliers as any)?.name || 'Proveedor',
        reference: p.reference,
        method: p.method,
        amount: Number(p.amount) || 0,
      }));
      setPaymentsData(rows);
    }

    setShowReport(true);
    alert('Reporte generado exitosamente');
    } finally {
      setIsGenerating(false);
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();

    const headerCompanyName = companyName || 'ContaBi';

    // Encabezado con nombre de empresa y título
    doc.setFontSize(16);
    if (headerCompanyName) {
      doc.text(headerCompanyName, 20, 20);
    }

    doc.setFontSize(14);
    doc.text('Reporte de Cuentas por Pagar', 20, 30);
    
    // Información del reporte
    doc.setFontSize(12);
    doc.text(
      `Tipo de Reporte: ${reportType === 'aging' ? 'Antigüedad de Saldos' : 'Reporte de Pagos'}`,
      20,
      46,
    );
    doc.text(`Período: ${startDate} - ${endDate}`, 20, 54);
    doc.text(`Fecha de Generación: ${new Date().toLocaleDateString()}`, 20, 62);

    if (reportType === 'aging') {
      // Reporte de Antigüedad de Saldos
      const agingTableData = agingData.map(item => [
        item.supplier,
        formatMoney(item.total),
        formatMoney(item.current),
        formatMoney(item.days1_30),
        formatMoney(item.days31_60),
        formatMoney(item.days61_90),
        formatMoney(item.over90)
      ]);

      doc.autoTable({
        head: [['Proveedor', 'Total', 'Corriente', '1-30 días', '31-60 días', '61-90 días', '+90 días']],
        body: agingTableData,
        startY: 80,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 10 }
      });

      // Totales
      const totals = agingData.reduce((acc, item) => ({
        total: acc.total + item.total,
        current: acc.current + item.current,
        days1_30: acc.days1_30 + item.days1_30,
        days31_60: acc.days31_60 + item.days31_60,
        days61_90: acc.days61_90 + item.days61_90,
        over90: acc.over90 + item.over90
      }), { total: 0, current: 0, days1_30: 0, days31_60: 0, days61_90: 0, over90: 0 });

      doc.autoTable({
        head: [['', 'Total General', 'Corriente', '1-30 días', '31-60 días', '61-90 días', '+90 días']],
        body: [[
          'TOTALES',
          formatMoney(totals.total),
          formatMoney(totals.current),
          formatMoney(totals.days1_30),
          formatMoney(totals.days31_60),
          formatMoney(totals.days61_90),
          formatMoney(totals.over90)
        ]],
        startY: ((((doc as any).lastAutoTable?.finalY) ?? 80) + 10),
        theme: 'plain',
        styles: { fontStyle: 'bold', fillColor: [240, 240, 240] }
      });
    } else {
      // Reporte de Pagos
      const paymentsTableData = paymentsData.map(item => [
        item.date,
        item.supplier,
        item.reference,
        item.method,
        formatMoney(item.amount)
      ]);

      doc.autoTable({
        head: [['Fecha', 'Proveedor', 'Referencia', 'Método', 'Monto']],
        body: paymentsTableData,
        startY: 80,
        theme: 'striped',
        headStyles: { fillColor: [34, 197, 94] },
        styles: { fontSize: 10 }
      });

      // Total de pagos
      const totalPayments = paymentsData.reduce((sum, payment) => sum + payment.amount, 0);
      doc.autoTable({
        body: [['TOTAL DE PAGOS', formatMoney(totalPayments)]],
        startY: ((((doc as any).lastAutoTable?.finalY) ?? 80) + 10),
        theme: 'plain',
        styles: { fontStyle: 'bold', fillColor: [240, 240, 240] }
      });
    }

    // Pie de página
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(10);
      doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width - 50, doc.internal.pageSize.height - 10);
      doc.text('Sistema Contable - Cuentas por Pagar', 20, doc.internal.pageSize.height - 10);
    }

    doc.save(`reporte-cuentas-por-pagar-${reportType}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const isAging = reportType === 'aging';
    const sheetName = isAging ? 'Antigüedad' : 'Pagos';
    const worksheet = workbook.addWorksheet(sheetName);

    const headerCompanyName = companyName || 'ContaBi';
    const today = new Date().toLocaleDateString('es-DO');
    const periodLabel = `${startDate} - ${endDate}`;

    // Encabezado principal
    let currentRow = 1;
    worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = headerCompanyName;
    worksheet.getCell(`A${currentRow}`).font = { bold: true, size: 16 };
    worksheet.getCell(`A${currentRow}`).alignment = { horizontal: 'center' } as any;

    currentRow += 1;
    worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = isAging
      ? 'Reporte de Antigüedad de Saldos - Cuentas por Pagar'
      : 'Reporte de Pagos a Proveedores';
    worksheet.getCell(`A${currentRow}`).font = { bold: true, size: 13 };
    worksheet.getCell(`A${currentRow}`).alignment = { horizontal: 'center' } as any;

    currentRow += 1;
    worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = `Período: ${periodLabel}`;
    worksheet.getCell(`A${currentRow}`).alignment = { horizontal: 'center' } as any;

    currentRow += 1;
    worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = `Fecha de generación: ${today}`;
    worksheet.getCell(`A${currentRow}`).alignment = { horizontal: 'center' } as any;

    currentRow += 2; // línea en blanco

    if (isAging) {
      // Encabezados de columnas para Antigüedad
      const headerRow = worksheet.addRow([
        'Proveedor',
        'Total',
        'Corriente',
        '1-30 días',
        '31-60 días',
        '61-90 días',
        '+90 días',
      ]);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0B1F3A' },
      } as any;
      headerRow.alignment = { horizontal: 'center' } as any;

      // Datos
      agingData.forEach((item: any) => {
        worksheet.addRow([
          item.supplier,
          item.total,
          item.current,
          item.days1_30,
          item.days31_60,
          item.days61_90,
          item.over90,
        ]);
      });

      // Fila de totales
      const totals = agingData.reduce(
        (acc: any, item: any) => ({
          total: acc.total + item.total,
          current: acc.current + item.current,
          days1_30: acc.days1_30 + item.days1_30,
          days31_60: acc.days31_60 + item.days31_60,
          days61_90: acc.days61_90 + item.days61_90,
          over90: acc.over90 + item.over90,
        }),
        { total: 0, current: 0, days1_30: 0, days31_60: 0, days61_90: 0, over90: 0 },
      );

      const totalRow = worksheet.addRow([
        'TOTALES',
        totals.total,
        totals.current,
        totals.days1_30,
        totals.days31_60,
        totals.days61_90,
        totals.over90,
      ]);
      totalRow.font = { bold: true };

      // Ajustar anchos de columna
      worksheet.columns = [
        { width: 35 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
      ];

      // Formato numérico para montos
      ['B', 'C', 'D', 'E', 'F', 'G'].forEach((col) => {
        const column = worksheet.getColumn(col);
        column.numFmt = '"RD$"#,##0.00';
        column.alignment = { horizontal: 'right' } as any;
      });
    } else {
      // Encabezados de columnas para Pagos
      const headerRow = worksheet.addRow([
        'Fecha',
        'Proveedor',
        'Referencia',
        'Método',
        'Monto',
      ]);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0B1F3A' },
      } as any;
      headerRow.alignment = { horizontal: 'center' } as any;

      // Datos
      paymentsData.forEach((item: any) => {
        const dateValue = item.date ? new Date(item.date) : null;
        const formattedDate = dateValue
          ? dateValue.toLocaleDateString('es-DO')
          : item.date;

        worksheet.addRow([
          formattedDate,
          item.supplier,
          item.reference,
          item.method,
          item.amount,
        ]);
      });

      const totalPayments = paymentsData.reduce(
        (sum: number, payment: any) => sum + payment.amount,
        0,
      );

      const totalRow = worksheet.addRow([
        'TOTAL DE PAGOS',
        '',
        '',
        '',
        totalPayments,
      ]);
      totalRow.font = { bold: true };

      worksheet.columns = [
        { width: 14 },
        { width: 32 },
        { width: 18 },
        { width: 16 },
        { width: 18 },
      ];

      const amountColumn = worksheet.getColumn('E');
      amountColumn.numFmt = '"RD$"#,##0.00';
      amountColumn.alignment = { horizontal: 'right' } as any;
    }

    // Generar y descargar archivo
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const safeType = isAging ? 'antiguedad' : 'pagos';
    const fileName = `reporte_cxp_${safeType}_${new Date()
      .toISOString()
      .split('T')[0]}.xlsx`;
    saveAs(blob, fileName);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes de Cuentas por Pagar</h1>
          {companyName && (
            <p className="text-sm font-medium text-gray-700">{companyName}</p>
          )}
          <p className="text-gray-600">Genera reportes detallados de proveedores y pagos</p>
        </div>

        {/* Report Configuration */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuración del Reporte</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Reporte</label>
              <select 
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="aging">Antigüedad de Saldos</option>
                <option value="payments">Reporte de Pagos</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fecha Inicio</label>
              <input 
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fecha Fin</label>
              <input 
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Proveedor</label>
              <select 
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Todos los Proveedores</option>
                {suppliers.map((sup: any) => (
                  <option key={sup.id} value={sup.id}>{sup.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button 
                onClick={generateReport}
                disabled={isGenerating}
                className={`w-full bg-blue-600 text-white py-2 px-4 rounded-lg transition-colors whitespace-nowrap ${
                  isGenerating ? 'opacity-60 cursor-not-allowed' : 'hover:bg-blue-700'
                }`}
              >
                {isGenerating ? 'Generando...' : 'Generar Reporte'}
              </button>
            </div>
          </div>
        </div>

        {/* Report Results */}
        {showReport && (
          <>
            {/* Export Buttons */}
            <div className="flex justify-end space-x-3">
              <button 
                onClick={exportToPDF}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
              >
                <i className="ri-file-pdf-line mr-2"></i>
                Exportar PDF
              </button>
              <button 
                onClick={exportToExcel}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
              >
                <i className="ri-file-excel-line mr-2"></i>
                Exportar Excel
              </button>
            </div>

            {reportType === 'aging' ? (
              /* Aging Report */
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Reporte de Antigüedad de Saldos</h3>
                  <p className="text-gray-600">Período: {startDate} - {endDate}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proveedor</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Corriente</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">1-30 días</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">31-60 días</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">61-90 días</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">+90 días</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {agingData.map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.supplier}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900">{formatMoney(item.total)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600">{formatMoney(item.current)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-yellow-600">{formatMoney(item.days1_30)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-orange-600">{formatMoney(item.days31_60)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600">{formatMoney(item.days61_90)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-800">{formatMoney(item.over90)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">TOTALES</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-gray-900">
                          {formatMoney(agingData.reduce((sum, item) => sum + item.total, 0))}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-green-600">
                          {formatMoney(agingData.reduce((sum, item) => sum + item.current, 0))}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-yellow-600">
                          {formatMoney(agingData.reduce((sum, item) => sum + item.days1_30, 0))}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-orange-600">
                          {formatMoney(agingData.reduce((sum, item) => sum + item.days31_60, 0))}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-red-600">
                          {formatMoney(agingData.reduce((sum, item) => sum + item.days61_90, 0))}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-red-800">
                          {formatMoney(agingData.reduce((sum, item) => sum + item.over90, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ) : (
              /* Payments Report */
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Reporte de Pagos</h3>
                  <p className="text-gray-600">Período: {startDate} - {endDate}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proveedor</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Referencia</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Método</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paymentsData.map((payment, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{payment.date}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{payment.supplier}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{payment.reference}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                              payment.method === 'Transferencia' ? 'bg-blue-100 text-blue-800' :
                              payment.method === 'Cheque' ? 'bg-green-100 text-green-800' :
                              'bg-orange-100 text-orange-800'
                            }`}>
                              {payment.method}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                            {formatMoney(payment.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={4} className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">TOTAL DE PAGOS</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-gray-900">
                          {formatMoney(paymentsData.reduce((sum, payment) => sum + payment.amount, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
