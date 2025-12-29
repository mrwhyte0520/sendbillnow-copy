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
    totalSales: 'RD$ 0',
    salesWithoutTax: 'RD$ 0',
    totalInvoices: 0,
    averageTicket: 'RD$ 0',
    totalTax: 'RD$ 0',
    netSales: 'RD$ 0',
    grossProfit: 'RD$ 0',
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
    { id: 'sales-summary', name: 'Resumen de Ventas', icon: 'ri-bar-chart-line' },
    { id: 'product-sales', name: 'Ventas por Producto', icon: 'ri-shopping-bag-line' },
    { id: 'customer-sales', name: 'Ventas por Cliente', icon: 'ri-user-line' },
    { id: 'payment-methods', name: 'Métodos de Pago', icon: 'ri-bank-card-line' },
    { id: 'tax-summary', name: 'Resumen de Impuestos', icon: 'ri-file-text-line' },
    { id: 'profit-analysis', name: 'Análisis de Rentabilidad', icon: 'ri-line-chart-line' }
  ];

  const periods = [
    { id: 'today', name: 'Hoy' },
    { id: 'yesterday', name: 'Ayer' },
    { id: 'this-week', name: 'Esta Semana' },
    { id: 'last-week', name: 'Semana Pasada' },
    { id: 'this-month', name: 'Este Mes' },
    { id: 'last-month', name: 'Mes Pasado' },
    { id: 'this-year', name: 'Este Año' },
    { id: 'custom', name: 'Personalizado' }
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
      alert('Debe iniciar sesión para generar reportes.');
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
          totalSales: 'RD$ 0',
          salesWithoutTax: 'RD$ 0',
          totalInvoices: 0,
          averageTicket: 'RD$ 0',
          totalTax: 'RD$ 0',
          netSales: 'RD$ 0',
          grossProfit: 'RD$ 0',
          profitMargin: '0.0%',
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
        totalSales: `RD$ ${totalSalesNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        salesWithoutTax: `RD$ ${salesWithoutTaxNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        totalInvoices,
        averageTicket: `RD$ ${avgTicketNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        totalTax: `RD$ ${totalTaxNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        netSales: `RD$ ${netSalesNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        grossProfit: `RD$ ${grossProfitNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
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
          revenue: `RD$ ${p.revenueNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
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
          revenue: `RD$ ${c.revenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
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
        const method = r.payment_method || 'Otro';
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
          amount: `RD$ ${m.amountNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
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
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reportes de Ventas</h1>
            <p className="text-gray-600">Análisis detallado de ventas y rendimiento</p>
          </div>
          <div className="flex items-center space-x-3">
            {loading && (
              <span className="text-sm text-gray-500 flex items-center">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mr-2" />
                Actualizando...
              </span>
            )}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
            >
              <i className="ri-filter-line mr-2"></i>
              Filtros
            </button>
            <button
              onClick={handleGenerateReport}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-refresh-line mr-2"></i>
              Generar Reporte
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Reporte</label>
                <select
                  value={selectedReport}
                  onChange={(e) => setSelectedReport(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                >
                  {reportTypes.map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Período</label>
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                >
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>{period.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Acciones</label>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleExportReport('pdf')}
                    className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm whitespace-nowrap"
                  >
                    <i className="ri-file-pdf-line mr-1"></i>
                    PDF
                  </button>
                  <button
                    onClick={() => handleExportReport('excel')}
                    className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm whitespace-nowrap"
                  >
                    <i className="ri-file-excel-line mr-1"></i>
                    Excel
                  </button>
                  <button
                    onClick={handlePrintReport}
                    className="flex-1 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm whitespace-nowrap"
                  >
                    <i className="ri-printer-line mr-1"></i>
                    Imprimir
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sales Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ventas Totales (con ITBIS)</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{salesSummary.totalSales}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-blue-100">
                <i className="ri-money-dollar-circle-line text-xl text-blue-600"></i>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-xs text-gray-500">Suma de totales de facturas</span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ventas sin ITBIS</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{salesSummary.salesWithoutTax}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-teal-100">
                <i className="ri-receipt-line text-xl text-teal-600"></i>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-xs text-gray-500">Subtotal antes de impuestos</span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Facturas Emitidas</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{salesSummary.totalInvoices}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-green-100">
                <i className="ri-file-text-line text-xl text-green-600"></i>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-xs text-gray-500">No incluye anuladas</span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ticket Promedio</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{salesSummary.averageTicket}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-purple-100">
                <i className="ri-calculator-line text-xl text-purple-600"></i>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-xs text-gray-500">Promedio por factura</span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Margen de Ganancia</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{salesSummary.profitMargin}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-orange-100">
                <i className="ri-line-chart-line text-xl text-orange-600"></i>
              </div>
            </div>
            <div className="mt-4">
              <span className="text-xs text-gray-500">Estimado (30% de ventas netas)</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Products */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Productos Más Vendidos</h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {topProducts.map((product, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                        <span className="text-sm font-bold text-blue-600">{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{product.name}</p>
                        <p className="text-sm text-gray-600">Vendidos: {product.quantity} unidades</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-600">{product.revenue}</p>
                      <p className="text-sm text-gray-500">Margen: {product.margin}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Customers */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Mejores Clientes</h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {topCustomers.map((customer, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mr-3">
                        <span className="text-sm font-bold text-green-600">{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{customer.name}</p>
                        <p className="text-sm text-gray-600">{customer.invoices} facturas</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-600">{customer.revenue}</p>
                      <p className="text-sm text-gray-500">{customer.lastPurchase}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Métodos de Pago</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {paymentMethods.map((method, index) => (
                <div key={index} className="text-center">
                  <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                    <i className="ri-bank-card-line text-2xl text-blue-600"></i>
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-2">{method.method}</h4>
                  <p className="text-2xl font-bold text-green-600 mb-1">{method.amount}</p>
                  <p className="text-sm text-gray-600 mb-1">{method.percentage} del total</p>
                  <p className="text-xs text-gray-500">{method.transactions} transacciones</p>
                </div>
              ))}
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