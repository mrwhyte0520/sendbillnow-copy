import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useAuth } from '../../../hooks/useAuth';
import { invoicesService, receiptsService } from '../../../services/database';
import { formatDateEsDO } from '../../../utils/date';
import DocumentPreviewModal from '../../../components/common/DocumentPreviewModal';

const BASE_CARD_CLASSES =
  'bg-[#FBF7EF] border border-[#D9C8A9] rounded-2xl shadow-[0_18px_38px_rgba(55,74,58,0.12)]';
const ICON_WRAPPER_BASE = 'w-12 h-12 rounded-xl flex items-center justify-center';
const PRIMARY_BUTTON_CLASSES =
  'px-4 py-2 bg-[#3C4F3C] text-white rounded-lg hover:bg-[#2D3B2E] transition-colors whitespace-nowrap shadow-[0_10px_25px_rgba(60,79,60,0.35)]';
const SECONDARY_BUTTON_CLASSES =
  'px-4 py-2 bg-[#EBDAC0] text-[#2F3D2E] rounded-lg hover:bg-[#DEC6A0] transition-colors whitespace-nowrap shadow-[0_8px_18px_rgba(235,218,192,0.6)]';

export default function SalesReportsPage() {
  const { user } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState('today');
  const [selectedReport, setSelectedReport] = useState('sales-summary');
  const [showFilters, setShowFilters] = useState(false);

  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewFilename, setPreviewFilename] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [downloadBlob, setDownloadBlob] = useState<Blob | null>(null);

  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);

  const [salesSummary, setSalesSummary] = useState({
    totalSales: ' 0',
    salesWithoutTax: ' 0',
    totalInvoices: 0,
    averageTicket: ' 0',
    totalTax: ' 0',
    netSales: ' 0',
    grossProfit: ' 0',
    profitMargin: '0.0%'
  });

  const [topProducts, setTopProducts] = useState<{
    name: string;
    quantity: number;
    revenue: string;
    margin: string;
  }[]>([]);

  const [topCustomers, setTopCustomers] = useState<{
    name: string;
    invoices: number;
    revenue: string;
    lastPurchase: string;
  }[]>([]);

  const [paymentMethods, setPaymentMethods] = useState<{
    method: string;
    amount: string;
    percentage: string;
    transactions: number;
  }[]>([]);

  const summaryCards = [
    {
      id: 'total-sales',
      title: 'Total Sales (with VAT)',
      value: salesSummary.totalSales,
      helper: 'Sum of invoice totals',
      icon: 'ri-money-dollar-circle-line',
      accentBg: 'bg-[#DDE7D0]',
      iconColor: 'text-[#2F3D2E]',
    },
    {
      id: 'sales-without-tax',
      title: 'Sales without VAT',
      value: salesSummary.salesWithoutTax,
      helper: 'Subtotal before taxes',
      icon: 'ri-receipt-line',
      accentBg: 'bg-[#E1EFE3]',
      iconColor: 'text-[#2F3D2E]',
    },
    {
      id: 'issued-invoices',
      title: 'Invoices Issued',
      value: salesSummary.totalInvoices.toString(),
      helper: 'Excludes voided invoices',
      icon: 'ri-file-text-line',
      accentBg: 'bg-[#E7DFC9]',
      iconColor: 'text-[#324532]',
    },
    {
      id: 'average-ticket',
      title: 'Average Ticket',
      value: salesSummary.averageTicket,
      helper: 'Average per invoice',
      icon: 'ri-calculator-line',
      accentBg: 'bg-[#E5E2D9]',
      iconColor: 'text-[#2F3D2E]',
    },
    {
      id: 'profit-margin',
      title: 'Profit Margin',
      value: salesSummary.profitMargin,
      helper: 'Estimated (30% of net sales)',
      icon: 'ri-line-chart-line',
      accentBg: 'bg-[#F1E0C7]',
      iconColor: 'text-[#3E432E]',
    },
  ];

  // Cargar datos iniciales y al cambiar el período
  useEffect(() => {
    if (user) {
      handleGenerateReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedPeriod]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const closePreview = () => {
    setShowPreviewModal(false);
    setPreviewTitle('');
    setPreviewFilename('');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setDownloadBlob(null);
  };

  const handleDownloadFromPreview = () => {
    if (!downloadBlob || !previewFilename) return;
    saveAs(downloadBlob, previewFilename);
  };

  const openHtmlPreview = (html: string, title: string, filename: string, blobToDownload: Blob) => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    setPreviewTitle(title);
    setPreviewFilename(filename);
    setDownloadBlob(blobToDownload);
    setPreviewUrl(url);
    setShowPreviewModal(true);
  };

  const openPdfPreview = (pdfBlob: Blob, title: string, filename: string) => {
    const url = URL.createObjectURL(pdfBlob);
    setPreviewTitle(title);
    setPreviewFilename(filename);
    setDownloadBlob(pdfBlob);
    setPreviewUrl(url);
    setShowPreviewModal(true);
  };

  const reportTypes = [
    { id: 'sales-summary', name: 'Sales Summary', icon: 'ri-bar-chart-line' },
    { id: 'product-sales', name: 'Sales by Product', icon: 'ri-shopping-bag-line' },
    { id: 'customer-sales', name: 'Sales by Customer', icon: 'ri-user-line' },
    { id: 'payment-methods', name: 'Payment Methods', icon: 'ri-bank-card-line' },
    { id: 'tax-summary', name: 'Tax Summary', icon: 'ri-file-text-line' },
    { id: 'profit-analysis', name: 'Profitability Analysis', icon: 'ri-line-chart-line' }
  ];

  const periods = [
    { id: 'today', name: 'Today' },
    { id: 'yesterday', name: 'Yesterday' },
    { id: 'this-week', name: 'This Week' },
    { id: 'last-week', name: 'Last Week' },
    { id: 'this-month', name: 'This Month' },
    { id: 'last-month', name: 'Last Month' },
    { id: 'this-year', name: 'This Year' },
    { id: 'custom', name: 'Custom' }
  ];

  const parseSelectedPeriod = () => {
    const now = new Date();

    const toDate = now.toISOString().slice(0, 10);
    let fromDate = toDate;

    switch (selectedPeriod) {
      case 'today':
        fromDate = toDate;
        break;
      case 'yesterday': {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        fromDate = y.toISOString().slice(0, 10);
        break;
      }
      case 'this-week': {
        const d = new Date(now);
        const day = d.getDay() || 7; // 1-7
        d.setDate(d.getDate() - (day - 1));
        fromDate = d.toISOString().slice(0, 10);
        break;
      }
      case 'last-week': {
        const d = new Date(now);
        const day = d.getDay() || 7;
        d.setDate(d.getDate() - (day - 1 + 7));
        fromDate = d.toISOString().slice(0, 10);
        const end = new Date(d);
        end.setDate(end.getDate() + 6);
        return { fromDate, toDate: end.toISOString().slice(0, 10) };
      }
      case 'this-month': {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        fromDate = d.toISOString().slice(0, 10);
        break;
      }
      case 'last-month': {
        const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        return { fromDate: d.toISOString().slice(0, 10), toDate: end.toISOString().slice(0, 10) };
      }
      case 'this-year': {
        const d = new Date(now.getFullYear(), 0, 1);
        fromDate = d.toISOString().slice(0, 10);
        break;
      }
      default:
        fromDate = toDate;
    }

    return { fromDate, toDate };
  };

  const handleGenerateReport = async () => {
    if (!user) {
      alert('You must be signed in to generate reports.');

      return;
    }

    const { fromDate, toDate } = parseSelectedPeriod();

    setLoading(true);
    try {
      const [invoices, receipts] = await Promise.all([
        invoicesService.getAll(user.id),
        receiptsService.getAll(user.id),
      ]);

      // Filtrar por rango de fechas (invoice_date) y excluir facturas anuladas
      const filteredInvoices = (invoices || []).filter((inv: any) => {
        if (!inv.invoice_date) return false;
        // Excluir facturas anuladas
        const status = String(inv.status || '').toLowerCase();
        if (status === 'voided' || status === 'cancelled' || status === 'anulada' || status === 'anulado') {
          return false;
        }
        const d = String(inv.invoice_date).slice(0, 10);
        return d >= fromDate && d <= toDate;
      });

      // Si no hay facturas en el período, limpiar métricas y marcar sin datos
      if (filteredInvoices.length === 0) {
        setSalesSummary({
          totalSales: ' 0',
          salesWithoutTax: ' 0',
          totalInvoices: 0,
          averageTicket: ' 0',
          totalTax: ' 0',
          netSales: ' 0',
          grossProfit: ' 0',
          profitMargin: '0.0%'
        });
        setTopProducts([]);
        setTopCustomers([]);
        setPaymentMethods([]);
        setHasData(false);
        return;
      }

      // Métricas principales
      const totalSalesNum = filteredInvoices.reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0);
      const totalInvoices = filteredInvoices.length;
      const avgTicketNum = totalInvoices > 0 ? totalSalesNum / totalInvoices : 0;

      const totalTaxNum = filteredInvoices.reduce((sum: number, inv: any) => sum + (Number(inv.tax_amount) || 0), 0);
      const netSalesNum = totalSalesNum - totalTaxNum;

      // Calcular ventas sin ITBIS (subtotal)
      const salesWithoutTaxNum = filteredInvoices.reduce((sum: number, inv: any) => sum + (Number(inv.subtotal) || 0), 0);

      // Por ahora margen aproximado: 30% de ventas netas si hay datos
      const grossProfitNum = netSalesNum > 0 ? netSalesNum * 0.3 : 0;
      const profitMarginNum = netSalesNum > 0 ? (grossProfitNum / netSalesNum) * 100 : 0;

      setSalesSummary({
        totalSales: ` ${totalSalesNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        salesWithoutTax: ` ${salesWithoutTaxNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        totalInvoices,
        averageTicket: ` ${avgTicketNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        totalTax: ` ${totalTaxNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        netSales: ` ${netSalesNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        grossProfit: ` ${grossProfitNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        profitMargin: `${profitMarginNum.toFixed(1)}%`,
      });

      // Top products (desde invoice_lines)
      const productMap = new Map<string, { qty: number; revenue: number }>();
      filteredInvoices.forEach((inv: any) => {
        (inv.invoice_lines || []).forEach((line: any) => {
          const name = line.inventory_items?.name || line.description || 'Producto';
          const qty = Number(line.quantity) || 0;
          const lineTotal = Number(line.line_total) || Number(line.total) || 0;
          const current = productMap.get(name) || { qty: 0, revenue: 0 };
          current.qty += qty;
          current.revenue += lineTotal;
          productMap.set(name, current);
        });
      });

      const productArray = Array.from(productMap.entries())
        .map(([name, v]) => ({
          name,
          quantity: v.qty,
          revenueNum: v.revenue,
        }))
        .sort((a, b) => b.revenueNum - a.revenueNum)
        .slice(0, 5)
        .map((p) => ({
          name: p.name,
          quantity: p.quantity,
          revenue: ` ${p.revenueNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
          margin: 'N/A',
        }));
      setTopProducts(productArray);

      // Top customers
      const customerMap = new Map<string, { name: string; invoices: number; revenue: number; last: string }>();
      filteredInvoices.forEach((inv: any) => {
        const id = inv.customer_id || 'sin-cliente';
        const name = inv.customers?.name || 'Sin cliente';
        const amount = Number(inv.total_amount) || 0;
        const dateStr = String(inv.invoice_date).slice(0, 10);
        const current = customerMap.get(id) || { name, invoices: 0, revenue: 0, last: dateStr };
        current.invoices += 1;
        current.revenue += amount;
        if (dateStr > current.last) current.last = dateStr;
        customerMap.set(id, current);
      });

      const customerArray = Array.from(customerMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
        .map((c) => ({
          name: c.name,
          invoices: c.invoices,
          revenue: ` ${c.revenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
          lastPurchase: formatDateEsDO(c.last),
        }));
      setTopCustomers(customerArray);

      // Métodos de pago desde recibos (receipt_date)
      const filteredReceipts = (receipts || []).filter((r: any) => {
        if (!r.receipt_date) return false;
        const d = String(r.receipt_date).slice(0, 10);
        return d >= fromDate && d <= toDate;
      });

      const methodMap = new Map<string, { amount: number; count: number }>();
      filteredReceipts.forEach((r: any) => {
        const method = r.payment_method || 'Other';

        const amount = Number(r.amount) || 0;
        const current = methodMap.get(method) || { amount: 0, count: 0 };
        current.amount += amount;
        current.count += 1;
        methodMap.set(method, current);
      });

      const totalReceiptsAmount = Array.from(methodMap.values()).reduce((s, m) => s + m.amount, 0) || 1;
      const methodsArray = Array.from(methodMap.entries()).map(([method, v]) => ({
        method,
        amountNum: v.amount,
        percentageNum: (v.amount / totalReceiptsAmount) * 100,
        transactions: v.count,
      }));

      const methodsUi = methodsArray
        .sort((a, b) => b.amountNum - a.amountNum)
        .map((m) => ({
          method: m.method,
          amount: ` ${m.amountNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
          percentage: `${m.percentageNum.toFixed(1)}%`,
          transactions: m.transactions,
        }));

      setPaymentMethods(methodsUi);
      setHasData(true);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error generating sales report:', error);
      alert('Error al generar el reporte de ventas.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportReport = async (format: 'excel' | 'pdf') => {
    try {
      if (!user) {
        alert('Debe iniciar sesión para exportar reportes.');
        return;
      }

      // Asegurar que haya datos actualizados antes de exportar
      if (!hasData && !loading) {
        await handleGenerateReport();
      }

      if (format === 'excel') {
        await exportToExcel();
      } else {
        await exportToPdf();
      }
    } catch (error) {
      console.error('Error al exportar:', error);
      alert('Error al exportar el reporte. Por favor, intente nuevamente.');
    }
  };

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reporte de Ventas');

    // Título del reporte
    const reportTitle = reportTypes.find(r => r.id === selectedReport)?.name || 'Reporte de Ventas';
    const periodTitle = periods.find(p => p.id === selectedPeriod)?.name || 'Período';

    // Encabezados
    worksheet.addRow([reportTitle]);
    worksheet.addRow([`Período: ${periodTitle}`]);
    worksheet.addRow([`Generado el: ${formatDateEsDO(new Date())}`]);
    worksheet.addRow([]);

    // Datos según el tipo de reporte seleccionado
    if (selectedReport === 'sales-summary') {
      // Encabezados del resumen de ventas
      const headerRow = worksheet.addRow([
        'Total de Ventas', 'Facturas', 'Ticket Promedio', 'Impuestos', 'Ventas Netas', 'Ganancia Bruta', 'Margen de Ganancia'
      ]);

      // Datos del resumen
      worksheet.addRow([
        salesSummary.totalSales,
        salesSummary.totalInvoices,
        salesSummary.averageTicket,
        salesSummary.totalTax,
        salesSummary.netSales,
        salesSummary.grossProfit,
        salesSummary.profitMargin
      ]);

      // Estilo para los encabezados
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0B1F3A' }
      };

      // Ajustar anchos de columna
      worksheet.columns = [
        { key: 'totalSales', width: 20 },
        { key: 'totalInvoices', width: 15 },
        { key: 'averageTicket', width: 20 },
        { key: 'totalTax', width: 15 },
        { key: 'netSales', width: 20 },
        { key: 'grossProfit', width: 20 },
        { key: 'profitMargin', width: 20 }
      ];

    } else if (selectedReport === 'product-sales') {
      // Encabezados de productos más vendidos
      const headerRow = worksheet.addRow([
        'Producto', 'Cantidad', 'Ingresos', 'Margen'
      ]);

      // Datos de productos
      topProducts.forEach(product => {
        worksheet.addRow([
          product.name,
          product.quantity,
          product.revenue,
          product.margin
        ]);
      });

      // Estilo para los encabezados
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0B1F3A' }
      };

      // Ajustar anchos de columna
      worksheet.columns = [
        { key: 'name', width: 40 },
        { key: 'quantity', width: 15 },
        { key: 'revenue', width: 20 },
        { key: 'margin', width: 15 }
      ];
    }

    // Generar archivo
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });

    const fileName = `reporte_ventas_${selectedReport}_${new Date().toISOString().split('T')[0]}.xlsx`;

    const tableHtml = (() => {
      const escape = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      if (selectedReport === 'sales-summary') {
        const rows = [
          ['Total de Ventas', salesSummary.totalSales],
          ['Número de Facturas', salesSummary.totalInvoices],
          ['Ticket Promedio', salesSummary.averageTicket],
          ['Total de Impuestos', salesSummary.totalTax],
          ['Ventas Netas', salesSummary.netSales],
          ['Ganancia Bruta', salesSummary.grossProfit],
          ['Margen de Ganancia', salesSummary.profitMargin],
        ];
        return `
          <table>
            <thead><tr><th>Concepto</th><th>Valor</th></tr></thead>
            <tbody>
              ${rows.map(r => `<tr><td>${escape(r[0])}</td><td>${escape(r[1])}</td></tr>`).join('')}
            </tbody>
          </table>
        `;
      }

      if (selectedReport === 'product-sales') {
        return `
          <table>
            <thead><tr><th>Producto</th><th>Cantidad</th><th>Ingresos</th><th>Margen</th></tr></thead>
            <tbody>
              ${topProducts
                .map(p => `<tr><td>${escape(p.name)}</td><td>${escape(p.quantity)}</td><td>${escape(p.revenue)}</td><td>${escape(p.margin)}</td></tr>`)
                .join('')}
            </tbody>
          </table>
        `;
      }

      if (selectedReport === 'customer-sales') {
        return `
          <table>
            <thead><tr><th>Cliente</th><th>Facturas</th><th>Ingresos</th><th>Última compra</th></tr></thead>
            <tbody>
              ${topCustomers
                .map(c => `<tr><td>${escape(c.name)}</td><td>${escape(c.invoices)}</td><td>${escape(c.revenue)}</td><td>${escape(c.lastPurchase)}</td></tr>`)
                .join('')}
            </tbody>
          </table>
        `;
      }

      if (selectedReport === 'payment-methods') {
        return `
          <table>
            <thead><tr><th>Método</th><th>Monto</th><th>%</th><th>Transacciones</th></tr></thead>
            <tbody>
              ${paymentMethods
                .map(m => `<tr><td>${escape(m.method)}</td><td>${escape(m.amount)}</td><td>${escape(m.percentage)}</td><td>${escape(m.transactions)}</td></tr>`)
                .join('')}
            </tbody>
          </table>
        `;
      }

      return `<div>No hay vista previa HTML para este reporte.</div>`;
    })();

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${reportTitle}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; }
            h1 { font-size: 18px; margin: 0 0 6px 0; }
            .meta { color: #555; font-size: 12px; margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>${reportTitle}</h1>
          <div class="meta">Generado el: ${escape(formatDateEsDO(new Date()))}</div>
          ${tableHtml}
        </body>
      </html>
    `;

    openHtmlPreview(html, reportTitle, fileName, blob);
  };

  const exportToPdf = () => {
    const doc = new jsPDF();
    const reportTitle = reportTypes.find(r => r.id === selectedReport)?.name || 'Reporte de Ventas';
    const periodTitle = periods.find(p => p.id === selectedPeriod)?.name || 'Período';

    // Título
    doc.setFontSize(18);
    doc.text(reportTitle, 14, 22);

    // Subtítulo
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Período: ${periodTitle}`, 14, 30);
    doc.text(`Generado el: ${formatDateEsDO(new Date())}`, 14, 36);

    // Datos según el tipo de reporte
    if (selectedReport === 'sales-summary') {
      // Datos del resumen de ventas
      const data = [
        ['Total de Ventas', salesSummary.totalSales],
        ['Número de Facturas', salesSummary.totalInvoices],
        ['Ticket Promedio', salesSummary.averageTicket],
        ['Total de Impuestos', salesSummary.totalTax],
        ['Ventas Netas', salesSummary.netSales],
        ['Ganancia Bruta', salesSummary.grossProfit],
        ['Margen de Ganancia', salesSummary.profitMargin],
      ];

      // Añadir tabla
      (doc as any).autoTable({
        startY: 45,
        head: [['Concepto', 'Valor']],
        body: data,
        theme: 'grid',
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { cellWidth: 60, fontStyle: 'bold' },
          1: { cellWidth: 40 }
        }
      });

    } else if (selectedReport === 'product-sales') {
      // Datos de productos más vendidos
      const headers = ['Producto', 'Cantidad', 'Ingresos', 'Margen'];
      const data = topProducts.map(product => [
        product.name,
        product.quantity,
        product.revenue,
        product.margin
      ]);

      // Añadir tabla
      (doc as any).autoTable({
        startY: 45,
        head: [headers],
        body: data,
        theme: 'grid',
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 30 },
          2: { cellWidth: 40 },
          3: { cellWidth: 30 }
        }
      });
    }

    const fileName = `reporte_ventas_${selectedReport}_${new Date().toISOString().split('T')[0]}.pdf`;
    const pdfBlob = doc.output('blob');
    openPdfPreview(pdfBlob, reportTitle, fileName);
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 bg-[#F4ECDC] min-h-screen rounded-[32px] p-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <span className="inline-flex items-center text-xs font-semibold tracking-[0.2em] uppercase text-[#7A705A]">
              Performance
            </span>
            <h1 className="text-3xl font-semibold text-[#2F3D2E] mt-1">Sales Reports</h1>
            <p className="text-[#5F6652]">Comprehensive insights across sales, customers, and payments.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {loading && (
              <span className="text-sm text-[#7A705A] flex items-center">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-[#3C4F3C] border-t-transparent animate-spin mr-2" />
                Updating...
              </span>
            )}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={SECONDARY_BUTTON_CLASSES}
            >
              <i className="ri-filter-line mr-2"></i>
              Filters
            </button>
            <button
              onClick={handleGenerateReport}
              className={PRIMARY_BUTTON_CLASSES}
            >
              <i className="ri-refresh-line mr-2"></i>
              Generate Report
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className={`${BASE_CARD_CLASSES} p-6`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-[#5F6652] mb-2">Report Type</label>
                <select
                  value={selectedReport}
                  onChange={(e) => setSelectedReport(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D9C8A9] rounded-lg focus:ring-2 focus:ring-[#3C4F3C] focus:border-[#3C4F3C] pr-8 bg-white text-[#2F3D2E]"
                >
                  {reportTypes.map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#5F6652] mb-2">Period</label>
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="w-full px-3 py-2 border border-[#D9C8A9] rounded-lg focus:ring-2 focus:ring-[#3C4F3C] focus:border-[#3C4F3C] pr-8 bg-white text-[#2F3D2E]"
                >
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>{period.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#5F6652] mb-2">Quick Actions</label>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleExportReport('pdf')}
                    className="flex-1 px-3 py-2 bg-[#B9583C] text-white rounded-lg hover:bg-[#a24b31] transition-colors text-sm whitespace-nowrap shadow-[0_10px_20px_rgba(185,88,60,0.35)]"
                  >
                    <i className="ri-file-pdf-line mr-1"></i>
                    PDF
                  </button>
                  <button
                    onClick={() => handleExportReport('excel')}
                    className="flex-1 px-3 py-2 bg-[#3C4F3C] text-white rounded-lg hover:bg-[#2D3B2E] transition-colors text-sm whitespace-nowrap shadow-[0_10px_20px_rgba(60,79,60,0.35)]"
                  >
                    <i className="ri-file-excel-line mr-1"></i>
                    Excel
                  </button>
                  <button
                    onClick={handlePrintReport}
                    className="flex-1 px-3 py-2 bg-[#7C6D5E] text-white rounded-lg hover:bg-[#6A5F53] transition-colors text-sm whitespace-nowrap shadow-[0_10px_20px_rgba(124,109,94,0.35)]"
                  >
                    <i className="ri-printer-line mr-1"></i>
                    Print
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sales Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {summaryCards.map((card) => (
            <div key={card.id} className={`${BASE_CARD_CLASSES} p-6`}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[#5F6652]">{card.title}</p>
                  <p className="text-2xl font-semibold text-[#2F3D2E] mt-1">{card.value}</p>
                </div>
                <div className={`${ICON_WRAPPER_BASE} ${card.accentBg}`}>
                  <i className={`${card.icon} text-xl ${card.iconColor}`}></i>
                </div>
              </div>
              <div className="mt-4">
                <span className="text-xs text-[#7A705A]">{card.helper}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Products */}
          <div className={`${BASE_CARD_CLASSES}`}>
            <div className="p-6 border-b border-[#D9C8A9]">
              <h3 className="text-lg font-semibold text-[#2F3D2E]">Top Products</h3>
              <p className="text-sm text-[#7A705A] mt-1">Leaders by revenue and volume</p>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {topProducts.map((product, index) => (
                  <div key={index} className="flex items-center justify-between p-4 rounded-2xl bg-[#FFF9EE] border border-[#EADDC4]">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-[#DDE7D0] flex items-center justify-center mr-3 text-[#2F3D2E] font-semibold">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-[#2F3D2E]">{product.name}</p>
                        <p className="text-sm text-[#7A705A]">Units sold: {product.quantity}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-[#3C4F3C]">{product.revenue}</p>
                      <p className="text-sm text-[#7A705A]">Margin: {product.margin}</p>
                    </div>
                  </div>
                ))}
                {!topProducts.length && (
                  <p className="text-sm text-[#7A705A] text-center">No product performance data for this period.</p>
                )}
              </div>
            </div>
          </div>

          {/* Top Customers */}
          <div className={`${BASE_CARD_CLASSES}`}>
            <div className="p-6 border-b border-[#D9C8A9]">
              <h3 className="text-lg font-semibold text-[#2F3D2E]">Top Customers</h3>
              <p className="text-sm text-[#7A705A] mt-1">Most valuable client relationships</p>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {topCustomers.map((customer, index) => (
                  <div key={index} className="flex items-center justify-between p-4 rounded-2xl bg-[#FFF9EE] border border-[#EADDC4]">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-[#E7DFC9] flex items-center justify-center mr-3 text-[#2F3D2E] font-semibold">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-[#2F3D2E]">{customer.name}</p>
                        <p className="text-sm text-[#7A705A]">{customer.invoices} invoices</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-[#3C4F3C]">{customer.revenue}</p>
                      <p className="text-sm text-[#7A705A]">Last purchase: {customer.lastPurchase}</p>
                    </div>
                  </div>
                ))}
                {!topCustomers.length && (
                  <p className="text-sm text-[#7A705A] text-center">No customer insights available.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className={`${BASE_CARD_CLASSES}`}>
          <div className="p-6 border-b border-[#D9C8A9]">
            <h3 className="text-lg font-semibold text-[#2F3D2E]">Payment Methods</h3>
            <p className="text-sm text-[#7A705A] mt-1">Breakdown of collected payments</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {paymentMethods.map((method, index) => (
                <div key={index} className="text-center rounded-2xl border border-[#EADDC4] p-4 bg-white shadow-[0_10px_25px_rgba(55,74,58,0.08)]">
                  <div className="w-16 h-16 rounded-2xl bg-[#DDE7D0] flex items-center justify-center mx-auto mb-4">
                    <i className="ri-bank-card-line text-2xl text-[#2F3D2E]"></i>
                  </div>
                  <h4 className="font-semibold text-[#2F3D2E] mb-1">{method.method}</h4>
                  <p className="text-2xl font-bold text-[#3C4F3C] mb-1">{method.amount}</p>
                  <p className="text-sm text-[#7A705A] mb-1">{method.percentage} of total</p>
                  <p className="text-xs text-[#7A705A]">{method.transactions} transactions</p>
                </div>
              ))}
              {!paymentMethods.length && (
                <p className="text-sm text-[#7A705A] text-center col-span-full">No payment activity for the selected period.</p>
              )}
            </div>
          </div>
        </div>

        <DocumentPreviewModal
          open={showPreviewModal}
          title={previewTitle}
          filename={previewFilename}
          url={previewUrl}
          onClose={closePreview}
          onDownload={handleDownloadFromPreview}
          onPrint={previewFilename.endsWith('.pdf') ? () => {} : undefined}
        />
      </div>
    </DashboardLayout>
  );
}