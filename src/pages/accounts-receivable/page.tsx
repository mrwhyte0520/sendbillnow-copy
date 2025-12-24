import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { invoicesService, customersService, journalEntriesService } from '../../services/database';
import { supabase } from '../../lib/supabase';
import { formatAmount } from '../../utils/numberFormat';
import { formatDate } from '../../utils/dateFormat';

interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  reference: string | null;
  total_debit: number;
  total_credit: number;
  status: string;
}

export default function AccountsReceivablePage() {
  const { user } = useAuth();

  const [summary, setSummary] = useState({
    totalReceivables: 0,
    overdueAmount: 0,
    currentAmount: 0,
    activeCustomers: 0,
  });
  const [recentEntries, setRecentEntries] = useState<JournalEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [entryLines, setEntryLines] = useState<any[]>([]);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);

  useEffect(() => {
    const loadDashboard = async () => {
      if (!user?.id) {
        setSummary({
          totalReceivables: 0,
          overdueAmount: 0,
          currentAmount: 0,
          activeCustomers: 0,
        });
        return;
      }

      try {
        const [invoices, customers] = await Promise.all([
          invoicesService.getAll(user.id),
          customersService.getAll(user.id),
        ]);

        let totalReceivables = 0;
        let overdueAmount = 0;
        let currentAmount = 0;
        const today = new Date();

        (invoices || []).forEach((inv: any) => {
          // Excluir facturas anuladas y pagadas
          const status = String(inv.status || 'pending').toLowerCase();
          if (status === 'cancelled' || status === 'paid') return;

          const total = Number(
            inv.total_amount ??
            inv.total ??
            inv.subtotal ??
            0,
          );
          const paid = Number(inv.paid_amount ?? 0);
          const remaining = Math.max(total - paid, 0);
          if (remaining <= 0) return;

          totalReceivables += remaining;

          const dueStr = inv.due_date as string | null;
          if (dueStr) {
            const due = new Date(dueStr);
            if (!Number.isNaN(due.getTime()) && due < today) {
              overdueAmount += remaining;
            } else {
              currentAmount += remaining;
            }
          } else {
            currentAmount += remaining;
          }
        });

        const activeCustomers = (customers || []).filter(
          (c: any) => c.is_active !== false && c.status !== 'inactive',
        ).length;

        setSummary({
          totalReceivables,
          overdueAmount,
          currentAmount,
          activeCustomers,
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading Accounts Receivable dashboard data', error);
        setSummary({
          totalReceivables: 0,
          overdueAmount: 0,
          currentAmount: 0,
          activeCustomers: 0,
        });
      }
    };

    loadDashboard();
  }, [user?.id]);

  // Cargar asientos recientes relacionados con CxC
  useEffect(() => {
    const loadRecentEntries = async () => {
      if (!user?.id) {
        setRecentEntries([]);
        return;
      }
      try {
        const entries = await journalEntriesService.getAll(user.id);
        // Filtrar asientos relacionados con CxC (pagos de clientes, facturas, etc.)
        const cxcEntries = (entries || [])
          .filter((e: any) => {
            const desc = String(e.description || '').toLowerCase();
            const ref = String(e.reference || '').toLowerCase();
            const entryNum = String(e.entry_number || '').toLowerCase();
            return (
              desc.includes('cliente') ||
              desc.includes('cobro') ||
              desc.includes('pago') ||
              desc.includes('factura') ||
              desc.includes('cxc') ||
              desc.includes('cuentas por cobrar') ||
              ref.includes('pago') ||
              ref.includes('fac') ||
              entryNum.includes('fac') ||
              entryNum.includes('cp-')
            );
          })
          .sort((a: any, b: any) => {
            const dateA = new Date(a.entry_date || 0).getTime();
            const dateB = new Date(b.entry_date || 0).getTime();
            return dateB - dateA;
          })
          .slice(0, 10)
          .map((e: any) => ({
            id: e.id,
            entry_number: e.entry_number,
            entry_date: e.entry_date,
            description: e.description,
            reference: e.reference,
            total_debit: Number(e.total_debit || 0),
            total_credit: Number(e.total_credit || 0),
            status: e.status,
          }));
        setRecentEntries(cxcEntries);
      } catch (error) {
        console.error('Error loading recent CxC entries:', error);
        setRecentEntries([]);
      }
    };
    loadRecentEntries();
  }, [user?.id]);

  const handleViewEntry = async (entry: JournalEntry) => {
    setSelectedEntry(entry);
    setShowEntryModal(true);
    setLoadingLines(true);
    try {
      const { data, error } = await supabase
        .from('journal_entry_lines')
        .select(`
          id,
          account_id,
          description,
          debit_amount,
          credit_amount,
          line_number,
          chart_accounts(id, code, name)
        `)
        .eq('journal_entry_id', entry.id)
        .order('line_number', { ascending: true });
      
      if (error) throw error;
      setEntryLines(data || []);
    } catch (error) {
      console.error('Error loading entry lines:', error);
      setEntryLines([]);
    } finally {
      setLoadingLines(false);
    }
  };

  const modules = [
    {
      title: 'Facturas por Cobrar',
      description: 'Gestión de facturas pendientes de cobro',
      icon: 'ri-file-list-3-line',
      path: '/accounts-receivable/invoices',
      color: 'bg-blue-500',
      stats: ''
    },
    {
      title: 'Gestión de Clientes',
      description: 'Administración de información de clientes',
      icon: 'ri-user-line',
      path: '/accounts-receivable/customers',
      color: 'bg-purple-500',
      stats: ''
    },
    {
      title: 'Tipos de Clientes',
      description: 'Configuración de tipos de clientes (descuentos, límites, cuentas CxC)',
      icon: 'ri-user-settings-line',
      path: '/accounts-receivable/customer-types',
      color: 'bg-teal-500',
      stats: ''
    },
    {
      title: 'Condiciones de Pago',
      description: 'Catálogo de condiciones de pago para clientes',
      icon: 'ri-time-line',
      path: '/accounts-receivable/payment-terms',
      color: 'bg-yellow-500',
      stats: ''
    },
    {
      title: 'Pagos Recibidos',
      description: 'Registro y seguimiento de pagos',
      icon: 'ri-money-dollar-circle-line',
      path: '/accounts-receivable/payments',
      color: 'bg-green-500',
      stats: ''
    },
    {
      title: 'Recibos de Cobro',
      description: 'Emisión y gestión de recibos',
      icon: 'ri-receipt-line',
      path: '/accounts-receivable/receipts',
      color: 'bg-indigo-500',
      stats: ''
    },
    {
      title: 'Anticipos de Clientes',
      description: 'Gestión de anticipos recibidos',
      icon: 'ri-wallet-line',
      path: '/accounts-receivable/advances',
      color: 'bg-orange-500',
      stats: ''
    },
    {
      title: 'Devoluciones en Ventas',
      description: 'Reclasificación de ingresos a devoluciones en ventas',
      icon: 'ri-refresh-line',
      path: '/accounts-receivable/returns',
      color: 'bg-amber-500',
      stats: ''
    },
    {
      title: 'Descuentos en Ventas',
      description: 'Reclasificación de ingresos a descuentos en ventas',
      icon: 'ri-percent-line',
      path: '/accounts-receivable/discounts',
      color: 'bg-lime-500',
      stats: ''
    },
    {
      title: 'Notas de Crédito',
      description: 'Gestión de notas de crédito',
      icon: 'ri-file-reduce-line',
      path: '/accounts-receivable/credit-notes',
      color: 'bg-emerald-500',
      stats: ''
    },
    {
      title: 'Notas de Débito',
      description: 'Gestión de notas de débito',
      icon: 'ri-file-add-line',
      path: '/accounts-receivable/debit-notes',
      color: 'bg-red-500',
      stats: ''
    },
    {
      title: 'Reportes CxC',
      description: 'Reportes y análisis de cuentas por cobrar',
      icon: 'ri-bar-chart-line',
      path: '/accounts-receivable/reports',
      color: 'bg-cyan-500',
      stats: ''
    }
  ];

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cuentas por Cobrar</h1>
            <p className="text-gray-600 mt-1">Gestión integral de cuentas por cobrar y clientes</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total por Cobrar</p>
                <p className="text-2xl font-bold text-gray-900">RD${formatAmount(summary.totalReceivables)}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <i className="ri-money-dollar-circle-line text-2xl text-blue-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Vencidas</p>
                <p className="text-2xl font-bold text-red-600">RD${formatAmount(summary.overdueAmount)}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <i className="ri-alarm-warning-line text-2xl text-red-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Corrientes</p>
                <p className="text-2xl font-bold text-green-600">RD${formatAmount(summary.currentAmount)}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <i className="ri-time-line text-2xl text-green-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Clientes Activos</p>
                <p className="text-2xl font-bold text-gray-900">{summary.activeCustomers}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <i className="ri-user-line text-2xl text-purple-600"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {modules.map((module, index) => (
            <Link
              key={index}
              to={module.path}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200 group"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 ${module.color} rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                  <i className={`${module.icon} text-2xl text-white`}></i>
                </div>
                <span className="text-sm font-medium text-gray-500">{module.stats}</span>
              </div>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                {module.title}
              </h3>
              
              <p className="text-gray-600 text-sm">
                {module.description}
              </p>
              
              <div className="mt-4 flex items-center text-blue-600 text-sm font-medium">
                <span>Acceder</span>
                <i className="ri-arrow-right-line ml-2 group-hover:translate-x-1 transition-transform duration-200"></i>
              </div>
            </Link>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Acciones Rápidas</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              to="/accounts-receivable/invoices"
              className="flex items-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <i className="ri-add-line text-2xl text-blue-600 mr-3"></i>
              <div>
                <p className="font-medium text-blue-900">Nueva Factura</p>
                <p className="text-sm text-blue-600">Crear factura por cobrar</p>
              </div>
            </Link>
            
            <Link
              to="/accounts-receivable/payments"
              className="flex items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
            >
              <i className="ri-money-dollar-circle-line text-2xl text-green-600 mr-3"></i>
              <div>
                <p className="font-medium text-green-900">Registrar Pago</p>
                <p className="text-sm text-green-600">Registrar pago recibido</p>
              </div>
            </Link>
            
            <Link
              to="/accounts-receivable/customers"
              className="flex items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
            >
              <i className="ri-user-add-line text-2xl text-purple-600 mr-3"></i>
              <div>
                <p className="font-medium text-purple-900">Nuevo Cliente</p>
                <p className="text-sm text-purple-600">Agregar nuevo cliente</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Recent CxC Journal Entries */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              <i className="ri-book-2-line mr-2 text-blue-600"></i>
              Últimos Movimientos Contables (CxC)
            </h3>
            <Link
              to="/accounting/general-journal"
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Ver todos <i className="ri-arrow-right-line ml-1"></i>
            </Link>
          </div>
          
          {recentEntries.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">No hay movimientos contables recientes relacionados con CxC</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No. Asiento</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Débito</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Crédito</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acción</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(entry.entry_date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-600">
                        {entry.entry_number}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate" title={entry.description}>
                        {entry.description}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                        RD$ {formatAmount(entry.total_debit)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                        RD$ {formatAmount(entry.total_credit)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          entry.status === 'posted' ? 'bg-green-100 text-green-800' :
                          entry.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                          entry.status === 'reversed' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {entry.status === 'posted' ? 'Contabilizado' : 
                           entry.status === 'draft' ? 'Borrador' : 
                           entry.status === 'reversed' ? 'Anulado' : 
                           entry.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleViewEntry(entry)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Ver detalle"
                        >
                          <i className="ri-eye-line text-lg"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Entry Detail Modal */}
        {showEntryModal && selectedEntry && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-white">Asiento #{selectedEntry.entry_number}</h3>
                  <p className="text-indigo-100 text-sm">{selectedEntry.description}</p>
                </div>
                <button
                  onClick={() => {
                    setShowEntryModal(false);
                    setSelectedEntry(null);
                    setEntryLines([]);
                  }}
                  className="text-white hover:text-indigo-200 transition-colors"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Entry Info */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 uppercase">Fecha</p>
                    <p className="font-semibold text-gray-900">{formatDate(selectedEntry.entry_date)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 uppercase">Estado</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      selectedEntry.status === 'posted' ? 'bg-green-100 text-green-800' :
                      selectedEntry.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedEntry.status === 'posted' ? 'Contabilizado' : selectedEntry.status === 'draft' ? 'Borrador' : selectedEntry.status}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 uppercase">Total Débito</p>
                    <p className="font-semibold text-gray-900">RD$ {formatAmount(selectedEntry.total_debit)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 uppercase">Total Crédito</p>
                    <p className="font-semibold text-gray-900">RD$ {formatAmount(selectedEntry.total_credit)}</p>
                  </div>
                </div>

                {selectedEntry.reference && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs text-blue-600 uppercase">Referencia</p>
                    <p className="font-medium text-blue-900">{selectedEntry.reference}</p>
                  </div>
                )}

                {/* Entry Lines */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-500 uppercase mb-3">
                    <i className="ri-list-check mr-2"></i>Líneas del Asiento
                  </h4>
                  {loadingLines ? (
                    <div className="text-center py-8 text-gray-500">
                      <i className="ri-loader-4-line animate-spin text-2xl"></i>
                      <p className="mt-2">Cargando líneas...</p>
                    </div>
                  ) : entryLines.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No se encontraron líneas para este asiento</p>
                  ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600">Código</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600">Cuenta</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600">Descripción</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-600">Débito</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-600">Crédito</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {entryLines.map((line: any, idx: number) => (
                            <tr key={line.id || idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-mono text-blue-600">
                                {(line.chart_accounts as any)?.code || '-'}
                              </td>
                              <td className="px-4 py-3 text-gray-900 font-medium">
                                {(line.chart_accounts as any)?.name || 'Cuenta no encontrada'}
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {line.description || '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-gray-900">
                                {Number(line.debit_amount || 0) > 0 ? `RD$ ${formatAmount(line.debit_amount)}` : '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-gray-900">
                                {Number(line.credit_amount || 0) > 0 ? `RD$ ${formatAmount(line.credit_amount)}` : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 font-semibold">
                          <tr>
                            <td colSpan={3} className="px-4 py-3 text-right text-gray-700">Totales:</td>
                            <td className="px-4 py-3 text-right text-green-700">
                              RD$ {formatAmount(entryLines.reduce((sum: number, l: any) => sum + Number(l.debit_amount || 0), 0))}
                            </td>
                            <td className="px-4 py-3 text-right text-green-700">
                              RD$ {formatAmount(entryLines.reduce((sum: number, l: any) => sum + Number(l.credit_amount || 0), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200">
                <Link
                  to="/accounting/general-journal"
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                >
                  <i className="ri-book-2-line"></i>
                  Ir al Diario General
                </Link>
                <button
                  onClick={() => {
                    setShowEntryModal(false);
                    setSelectedEntry(null);
                    setEntryLines([]);
                  }}
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
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
