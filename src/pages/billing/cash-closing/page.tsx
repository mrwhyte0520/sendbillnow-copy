import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';
import { cashClosingService, invoicesService, receiptsService, settingsService } from '../../../services/database';
import { formatMoney } from '../../../utils/numberFormat';

// Importación dinámica de jsPDF para evitar errores de compilación
const loadJsPDF = async () => {
  const jsPDF = await import('jspdf');
  await import('jspdf-autotable');
  return jsPDF.default;
};

export default function CashClosingPage() {
  const { user } = useAuth();
  const [showNewClosingModal, setShowNewClosingModal] = useState(false);
  const [showViewClosingModal, setShowViewClosingModal] = useState(false);
  const [viewClosing, setViewClosing] = useState<any | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cashClosings, setCashClosings] = useState<any[]>([]);
  const [dailyReceipts, setDailyReceipts] = useState<any[]>([]);

  // Datos del turno actual (por ahora manuales, más adelante se pueden conectar a ventas reales)
  const [currentShift, setCurrentShift] = useState({
    cashier: 'Cajero principal',
    shift: 'Mañana (8:00 AM - 4:00 PM)',
    startTime: '08:00',
    openingBalance: 0,
    currentSales: 0,
    cashSales: 0,
    cardSales: 0,
    transferSales: 0,
    otherSales: 0,
    expenses: 0,
  });

  const paymentMethods = useMemo(() => ([
    { name: 'Efectivo', amount: currentShift.cashSales, icon: 'ri-money-dollar-circle-line', color: 'green' },
    { name: 'Tarjeta', amount: currentShift.cardSales, icon: 'ri-bank-card-line', color: 'blue' },
    { name: 'Transferencia', amount: currentShift.transferSales, icon: 'ri-exchange-line', color: 'purple' },
    { name: 'Otros', amount: currentShift.otherSales, icon: 'ri-more-line', color: 'orange' }
  ]), [currentShift]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'closed': return 'bg-green-100 text-green-800';
      case 'pending_review': return 'bg-yellow-100 text-yellow-800';
      case 'discrepancy': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'closed': return 'Cerrado';
      case 'pending_review': return 'Pendiente Revisión';
      case 'discrepancy': return 'Con Discrepancia';
      default: return 'Desconocido';
    }
  };

  const getDifferenceColor = (difference: number) => {
    if (difference === 0) return 'text-green-600';
    if (difference > 0) return 'text-blue-600';
    return 'text-red-600';
  };

  const filteredClosings = cashClosings.filter((closing) => {
    const cashierName = (closing.cashier_name || closing.cashier || '').toLowerCase();
    const idStr = String(closing.id || '').toLowerCase();
    const term = searchTerm.toLowerCase();
    const matchesSearch = cashierName.includes(term) || idStr.includes(term);
    return matchesSearch;
  });

  const handleStartNewClosing = () => {
    setShowNewClosingModal(true);
  };

  const handleViewClosing = (closingId: string) => {
    const closing = cashClosings.find(c => c.id === closingId);
    if (!closing) return;
    setViewClosing(closing);
    setShowViewClosingModal(true);
  };

  const handleReviewClosing = async (closingId: string) => {
    if (!user?.id) {
      toast.error('Debes iniciar sesión para revisar cierres');
      return;
    }
    const closing = cashClosings.find(c => c.id === closingId);
    if (!closing) return;
    if (!confirm(`¿Marcar como revisado el cierre ${closingId}?`)) return;
    try {
      await cashClosingService.update(closingId, { status: 'closed' });
      await loadClosings();
      toast.success('Cierre marcado como revisado');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error reviewing cash closing:', error);
      toast.error('Error al revisar el cierre');
    }
  };

  const expectedCashBalance = useMemo(
    () => currentShift.openingBalance + currentShift.cashSales - currentShift.expenses,
    [currentShift]
  );

  const loadClosings = async () => {
    if (!user?.id) return;
    try {
      const list = await cashClosingService.getAll(user.id);
      setCashClosings(list || []);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading cash closings:', error);
      toast.error('Error al cargar los cierres de caja');
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadClosings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Cargar facturas reales del usuario y filtrar por la fecha seleccionada
  useEffect(() => {
    const loadInvoices = async () => {
      if (!user?.id) return;
      try {
        const all = await invoicesService.getAll(user.id);
        const invoicesForDay = (all || []).filter((inv: any) => {
          const invDate = (inv.invoice_date || inv.created_at || '').slice(0, 10);
          return invDate === selectedDate;
        });

        const totalSales = invoicesForDay.reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0);

        setCurrentShift(prev => ({
          ...prev,
          currentSales: totalSales,
        }));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading invoices for cash closing:', error);
        toast.error('Error al cargar las ventas del día para el cierre de caja');
      }
    };

    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedDate]);

  // Cargar recibos (cobros) para desglosar métodos de pago
  useEffect(() => {
    const loadReceipts = async () => {
      if (!user?.id) return;
      try {
        const all = await receiptsService.getAll(user.id);
        const receiptsForDay = (all || []).filter((rec: any) => {
          const recDate = (rec.receipt_date || rec.created_at || '').slice(0, 10);
          return recDate === selectedDate && rec.status !== 'void';
        });

        setDailyReceipts(receiptsForDay);

        const sumByMethod = (method: string) =>
          receiptsForDay
            .filter((r: any) => (r.payment_method || '').toLowerCase() === method)
            .reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);

        const cashSales = sumByMethod('cash');
        const cardSales = sumByMethod('card');
        const transferSales = sumByMethod('transfer');

        setCurrentShift(prev => ({
          ...prev,
          cashSales,
          cardSales,
          transferSales,
        }));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading receipts for cash closing:', error);
        toast.error('Error al cargar los cobros del día para el cierre de caja');
      }
    };

    loadReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedDate]);

  const exportToPDF = async () => {
    try {
      const jsPDF = await loadJsPDF();
      const doc = new jsPDF();

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
        console.error('Error obteniendo información de la empresa para PDF de cierre de caja:', error);
      }

      const pageWidth = doc.internal.pageSize.getWidth();

      // Encabezado con nombre de empresa y título
      doc.setFontSize(16);
      doc.text(companyName, pageWidth / 2, 15, { align: 'center' } as any);

      doc.setFontSize(20);
      doc.text('Reporte de Cierre de Caja', 20, 30);
      
      // Información del cierre
      doc.setFontSize(12);
      doc.text(`Fecha: ${selectedDate}`, 20, 50);
      doc.text(`Cajero: ${currentShift.cashier}`, 20, 60);
      doc.text(`Turno: ${currentShift.shift}`, 20, 70);
      
      // Resumen de ventas
      doc.setFontSize(14);
      doc.text('Resumen de Ventas', 20, 90);
      
      // Calcular cantidades reales de transacciones por método a partir de los recibos del día
      const receiptsCount = dailyReceipts.length;
      const countByMethod = (method: string) =>
        dailyReceipts.filter((r: any) => (r.payment_method || '').toLowerCase() === method).length;

      const cashCount = countByMethod('cash');
      const cardCount = countByMethod('card');
      const transferCount = countByMethod('transfer');
      const otherCount = Math.max(receiptsCount - cashCount - cardCount - transferCount, 0);

      const formatMoneyRD = (value: number) => formatMoney(value, 'RD$');

      const salesData = [
        ['Concepto', 'Transacciones', 'Monto'],
        ['Ventas en Efectivo', String(cashCount), formatMoneyRD(currentShift.cashSales)],
        ['Ventas con Tarjeta', String(cardCount), formatMoneyRD(currentShift.cardSales)],
        ['Ventas por Transferencia', String(transferCount), formatMoneyRD(currentShift.transferSales)],
        ['Otros Métodos', String(otherCount), formatMoneyRD(currentShift.otherSales)],
        ['Total Ventas', String(receiptsCount), formatMoneyRD(currentShift.currentSales)]
      ];

      (doc as any).autoTable({
        startY: 100,
        head: [salesData[0]],
        body: salesData.slice(1),
        theme: 'grid',
        styles: { fontSize: 10 },
        headStyles: { fillColor: [59, 130, 246] }
      });

      // Desglose de efectivo
      doc.setFontSize(14);
      doc.text('Desglose de Efectivo', 20, (doc as any).lastAutoTable.finalY + 20);
      
      const cashData = [
        ['Denominación', 'Cantidad', 'Subtotal'],
        ['RD$ 2,000', '5', 'RD$ 10,000.00'],
        ['RD$ 1,000', '8', 'RD$ 8,000.00'],
        ['RD$ 500', '12', 'RD$ 6,000.00'],
        ['RD$ 200', '15', 'RD$ 3,000.00'],
        ['RD$ 100', '20', 'RD$ 2,000.00'],
        ['RD$ 50', '10', 'RD$ 500.00'],
        ['RD$ 20', '25', 'RD$ 500.00'],
        ['RD$ 10', '30', 'RD$ 300.00'],
        ['RD$ 5', '20', 'RD$ 100.00'],
        ['RD$ 1', '50', 'RD$ 50.00'],
        ['Total Efectivo', '', formatMoneyRD(expectedCashBalance)]
      ];

      (doc as any).autoTable({
        startY: (doc as any).lastAutoTable.finalY + 30,
        head: [cashData[0]],
        body: cashData.slice(1),
        theme: 'grid',
        styles: { fontSize: 10 },
        headStyles: { fillColor: [34, 197, 94] }
      });

      // Resumen final
      doc.setFontSize(14);
      doc.text('Resumen Final', 20, (doc as any).lastAutoTable.finalY + 20);
      
      const summaryData = [
        ['Concepto', 'Monto'],
        ['Saldo Inicial', formatMoneyRD(currentShift.openingBalance)],
        ['Total Ventas del Día', formatMoneyRD(currentShift.currentSales)],
        ['Ventas en Efectivo', formatMoneyRD(currentShift.cashSales)],
        ['Gastos del Turno', formatMoneyRD(currentShift.expenses)],
        ['Efectivo Esperado', formatMoneyRD(expectedCashBalance)],
        ['Estado', 'Turno Activo']
      ];

      (doc as any).autoTable({
        startY: (doc as any).lastAutoTable.finalY + 30,
        head: [summaryData[0]],
        body: summaryData.slice(1),
        theme: 'grid',
        styles: { fontSize: 10 },
        headStyles: { fillColor: [239, 68, 68] }
      });

      // Pie de página
      const pageHeight = doc.internal.pageSize.height;
      doc.setFontSize(10);
      doc.text('Generado automáticamente por Sistema Contable', 20, pageHeight - 20);
      doc.text(`Fecha de generación: ${new Date().toLocaleString()}`, 20, pageHeight - 10);

      // Descargar el PDF
      doc.save(`cierre-caja-${selectedDate}-${currentShift.cashier.replace(/\s+/g, '-')}.pdf`);
    } catch (error) {
      console.error('Error al generar PDF:', error);
      alert('Error al generar el PDF. Por favor, intente nuevamente.');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cierre de Caja</h1>
            <p className="text-gray-600">Control y reconciliación diaria de efectivo</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={exportToPDF}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-file-pdf-line mr-2"></i>
              Exportar PDF
            </button>
            <button
              onClick={handleStartNewClosing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-calculator-line mr-2"></i>
              Nuevo Cierre
            </button>
          </div>
        </div>

        {/* Current Shift Summary */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-sm text-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Turno Actual</h3>
              <p className="text-blue-100">{currentShift.cashier} - {currentShift.shift}</p>
            </div>
            <div className="text-right">
              <p className="text-blue-100">Inicio: {currentShift.startTime}</p>
              <p className="text-blue-100">Fecha: {new Date().toLocaleDateString('es-DO')}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white bg-opacity-20 rounded-lg p-4">
              <p className="text-blue-100 text-sm">Saldo Inicial</p>
              <p className="text-2xl font-bold">{formatMoney(currentShift.openingBalance)}</p>
            </div>
            <div className="bg-white bg-opacity-20 rounded-lg p-4">
              <p className="text-blue-100 text-sm">Ventas Actuales</p>
              <p className="text-2xl font-bold">{formatMoney(currentShift.currentSales)}</p>
            </div>
            <div className="bg-white bg-opacity-20 rounded-lg p-4">
              <p className="text-blue-100 text-sm">Gastos</p>
              <p className="text-2xl font-bold">{formatMoney(currentShift.expenses)}</p>
            </div>
            <div className="bg-white bg-opacity-20 rounded-lg p-4">
              <p className="text-blue-100 text-sm">Efectivo Esperado</p>
              <p className="text-2xl font-bold">{formatMoney(expectedCashBalance)}</p>
            </div>
          </div>
        </div>

        {/* Payment Methods Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {paymentMethods.map((method, index) => (
            <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{method.name}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {formatMoney(method.amount)}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center bg-${method.color}-100`}>
                  <i className={`${method.icon} text-xl text-${method.color}-600`}></i>
                </div>
              </div>
              <div className="mt-4">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`bg-${method.color}-600 h-2 rounded-full`}
                    style={{ width: `${(method.amount / currentShift.currentSales) * 100}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {((method.amount / currentShift.currentSales) * 100).toFixed(1)}% del total
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar por cajero o ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fecha</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedDate(new Date().toISOString().split('T')[0]);
                }}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
              >
                <i className="ri-refresh-line mr-2"></i>
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Cash Closings Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Cierres de Caja ({filteredClosings.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cajero
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Turno
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ventas Totales
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Efectivo Esperado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Efectivo Real
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Diferencia
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredClosings.map((closing, index) => (
                  <tr key={closing.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {index + 1}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(closing.closing_date || closing.date).toLocaleDateString('es-DO')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{closing.cashier_name || closing.cashier}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{closing.shift_name || closing.shift}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatMoney(Number(closing.total_sales ?? closing.totalSales ?? 0))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(Number(closing.expected_cash_balance ?? closing.expectedBalance ?? 0))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(Number(closing.actual_cash_balance ?? closing.actualBalance ?? 0))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${getDifferenceColor(Number(closing.difference || 0))}`}>
                        {Number(closing.difference || 0) >= 0 ? '+ ' : ''}{formatMoney(Number(closing.difference || 0))}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(closing.status)}`}>
                        {getStatusText(closing.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleViewClosing(closing.id)}
                          className="text-blue-600 hover:text-blue-900 p-1"
                          title="Ver cierre"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        {closing.status === 'pending_review' && (
                          <button
                            onClick={() => handleReviewClosing(closing.id)}
                            className="text-yellow-600 hover:text-yellow-900 p-1"
                            title="Revisar cierre"
                          >
                            <i className="ri-search-line"></i>
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

        {/* New Closing Modal */}
        {showNewClosingModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Nuevo Cierre de Caja</h3>
                  <button
                    onClick={() => setShowNewClosingModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Cajero</label>
                    <input
                      type="text"
                      value={currentShift.cashier}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Turno</label>
                    <input
                      type="text"
                      value={currentShift.shift}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Saldo Inicial</label>
                    <input
                      type="number" min="0"
                      value={currentShift.openingBalance}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Ventas en Efectivo</label>
                    <input
                      type="number" min="0"
                      value={currentShift.cashSales}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Gastos</label>
                    <input
                      type="number" min="0"
                      value={currentShift.expenses}
                      onChange={(e) => setCurrentShift(prev => ({ ...prev, expenses: Number(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Efectivo Esperado</label>
                    <input
                      type="number" min="0"
                      value={expectedCashBalance}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm font-semibold"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Efectivo Real Contado</label>
                    <input
                      type="number" min="0"
                      placeholder="Ingrese el efectivo contado físicamente"
                      onChange={(e) => {
                        const actual = Number(e.target.value) || 0;
                        setCurrentShift(prev => ({ ...prev, actualCash: actual } as any));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>
                
                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notas del Cierre</label>
                  <textarea
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Observaciones, incidencias o comentarios sobre el cierre..."
                  ></textarea>
                </div>
              </div>
              <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
                <button
                  onClick={() => setShowNewClosingModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    if (!user?.id) {
                      toast.error('Debes iniciar sesión para procesar cierres');
                      return;
                    }

                    const actualCash = (currentShift as any).actualCash || 0;
                    const difference = actualCash - expectedCashBalance;

                    try {
                      await cashClosingService.create(user.id, {
                        closing_date: selectedDate,
                        cashier_name: currentShift.cashier,
                        shift_name: currentShift.shift,
                        opening_balance: currentShift.openingBalance,
                        total_sales: currentShift.currentSales,
                        cash_sales: currentShift.cashSales,
                        card_sales: currentShift.cardSales,
                        transfer_sales: currentShift.transferSales,
                        other_sales: currentShift.otherSales,
                        total_expenses: currentShift.expenses,
                        expected_cash_balance: expectedCashBalance,
                        actual_cash_balance: actualCash,
                        difference,
                        status: difference === 0 ? 'closed' : 'pending_review',
                      });

                      await loadClosings();
                      setShowNewClosingModal(false);
                      toast.success('Cierre de caja procesado correctamente');
                    } catch (error) {
                      // eslint-disable-next-line no-console
                      console.error('Error processing cash closing:', error);
                      toast.error('Error al procesar el cierre de caja');
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  Procesar Cierre
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Closing Modal (read-only) */}
        {showViewClosingModal && viewClosing && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Detalle del Cierre de Caja</h3>
                  <button
                    onClick={() => setShowViewClosingModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fecha</label>
                    <input
                      type="date"
                      value={(viewClosing.closing_date || viewClosing.date || '').slice(0, 10)}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
                    <input
                      type="text"
                      value={getStatusText(viewClosing.status)}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Cajero</label>
                    <input
                      type="text"
                      value={viewClosing.cashier_name || viewClosing.cashier || ''}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Turno</label>
                    <input
                      type="text"
                      value={viewClosing.shift_name || viewClosing.shift || ''}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Saldo Inicial</label>
                    <input
                      type="number" min="0"
                      value={Number(viewClosing.opening_balance || 0)}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Ventas Totales</label>
                    <input
                      type="number" min="0"
                      value={Number(viewClosing.total_sales || 0)}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Ventas en Efectivo</label>
                    <input
                      type="number" min="0"
                      value={Number(viewClosing.cash_sales || 0)}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Ventas con Tarjeta</label>
                    <input
                      type="number" min="0"
                      value={Number(viewClosing.card_sales || 0)}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Ventas por Transferencia</label>
                    <input
                      type="number" min="0"
                      value={Number(viewClosing.transfer_sales || 0)}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Otros Métodos</label>
                    <input
                      type="number" min="0"
                      value={Number(viewClosing.other_sales || 0)}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Gastos</label>
                    <input
                      type="number" min="0"
                      value={Number(viewClosing.total_expenses || 0)}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Efectivo Esperado</label>
                    <input
                      type="number" min="0"
                      value={Number(viewClosing.expected_cash_balance || 0)}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Efectivo Real</label>
                    <input
                      type="number" min="0"
                      value={Number(viewClosing.actual_cash_balance || 0)}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Diferencia</label>
                    <input
                      type="number" min="0"
                      value={Number(viewClosing.difference || 0)}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notas del Cierre</label>
                  <textarea
                    rows={4}
                    value={viewClosing.notes || ''}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                  ></textarea>
                </div>
              </div>
              <div className="p-6 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => setShowViewClosingModal(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}