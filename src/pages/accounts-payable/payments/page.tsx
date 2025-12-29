import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { bankAccountsService, supplierPaymentsService, suppliersService, apInvoicesService } from '../../../services/database';
import { exportToExcelStyled } from '../../../utils/exportImportUtils';

export default function PaymentsPage() {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMethod, setFilterMethod] = useState('all');

  const [payments, setPayments] = useState<any[]>([]);

  const [apInvoices, setApInvoices] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    supplierId: '',
    invoice: '',
    method: 'Transferencia',
    amount: '',
    description: '',
    bankAccount: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);

  const paymentMethods = ['Transferencia', 'Cheque', 'Efectivo', 'Tarjeta de Crédito'];

  const resolveApInvoiceBalance = (inv: any) => {
    const totalToPay = Number(inv?.total_to_pay ?? inv?.total_gross ?? 0) || 0;
    const paidAmount = Number(inv?.paid_amount ?? 0) || 0;
    const explicitBalance = Number(inv?.balance_amount ?? 0) || 0;

    if (explicitBalance > 0) return explicitBalance;
    if (totalToPay > 0) return Math.max(totalToPay - paidAmount, 0);
    return 0;
  };

  const filteredPayments = payments.filter(payment => {
    const matchesStatus = filterStatus === 'all' || payment.status === filterStatus;
    const matchesMethod = filterMethod === 'all' || payment.method === filterMethod;
    return matchesStatus && matchesMethod;
  });

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
      console.error('Error loading suppliers for payments', error);
      setSuppliers([]);
    }
  };

  const loadBankAccounts = async () => {
    if (!user?.id) {
      setBankAccounts([]);
      return;
    }
    try {
      const data = await bankAccountsService.getAll(user.id);
      setBankAccounts(data || []);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading bank accounts for payments', error);
      setBankAccounts([]);
    }
  };

  const loadPayments = async () => {
    if (!user?.id) {
      setPayments([]);
      return;
    }
    try {
      const data = await supplierPaymentsService.getAll(user.id);
      const mapped = (data || []).map((p: any) => ({
        id: p.id,
        date: p.payment_date,
        supplier: (p.suppliers as any)?.name || 'Proveedor',
        supplierId: p.supplier_id,
        reference: p.reference,
        invoice: p.invoice_number || '',
        method: p.method,
        amount: Number(p.amount) || 0,
        status: p.status || 'Pendiente',
        description: p.description || '',
        bankAccount: p.bank_account || '',
      }));
      setPayments(mapped);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading supplier payments', error);
      setPayments([]);
    }
  };

  const loadApInvoices = async () => {
    if (!user?.id) {
      setApInvoices([]);
      return;
    }
    try {
      const rows = await apInvoicesService.getAll(user.id);
      const pending = (rows || []).filter((inv: any) => {
        const status = inv.status || 'pending';
        const totalToPay = Number(inv.total_to_pay ?? inv.total_gross ?? 0) || 0;
        const paidAmount = Number((inv as any).paid_amount ?? 0) || 0;
        const explicitBalance = Number((inv as any).balance_amount ?? 0) || 0;

        // Priorizar balance_amount si existe; si no, calcularlo como total_to_pay - paid_amount
        let balance = explicitBalance;
        if (balance === 0 && totalToPay > 0) {
          balance = Math.max(totalToPay - paidAmount, 0);
        }

        // Solo mostrar facturas que NO estén marcadas como pagadas y que tengan saldo pendiente > 0.01
        return status !== 'paid' && balance > 0.01;
      });
      setApInvoices(pending);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading AP invoices for supplier payments', error);
      setApInvoices([]);
    }
  };

  useEffect(() => {
    loadSuppliers();
    loadBankAccounts();
    loadPayments();
    loadApInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      alert('Debes iniciar sesión para registrar pagos');
      return;
    }

    if (!formData.supplierId) {
      alert('Debes seleccionar un proveedor');
      return;
    }

    const amount = parseFloat(formData.amount || '0');
    if (!amount || amount <= 0) {
      alert('El monto debe ser mayor que cero');
      return;
    }

    const reference = `PAY-${new Date().getFullYear()}-${String(payments.length + 1).padStart(3, '0')}`;

    // Resolver banco seleccionado
    const selectedBank = bankAccounts.find((b: any) => String(b.id) === String(formData.bankAccount));
    if (!selectedBank) {
      alert('Debes seleccionar una cuenta bancaria válida');
      return;
    }
    const bankLabel = `${selectedBank.bank_name} - ${selectedBank.account_number}`;

    try {
      await supplierPaymentsService.create(user.id, {
        supplier_id: formData.supplierId,
        payment_date: formData.date,
        reference,
        method: formData.method,
        amount,
        status: 'Pendiente',
        description: formData.description || null,
        bank_account_id: selectedBank.id,
        bank_account: bankLabel,
        invoice_number: formData.invoice || null,
      });
      await loadPayments();
      resetForm();
      alert('Pago registrado exitosamente');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error saving supplier payment', error);
      alert('Error al registrar el pago');
    }
  };

  const resetForm = () => {
    setFormData({
      supplierId: '',
      invoice: '',
      method: 'Transferencia',
      amount: '',
      description: '',
      bankAccount: '',
      date: new Date().toISOString().split('T')[0]
    });
    setShowModal(false);
  };

  const handleApprovePayment = async (id: string | number) => {
    if (!confirm('¿Confirmar este pago?')) return;
    try {
      await supplierPaymentsService.updateStatus(String(id), 'Completado');
      await loadPayments();
      await loadApInvoices();
      alert('Pago aprobado exitosamente');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error approving supplier payment', error);
      alert('No se pudo aprobar el pago');
    }
  };

  const handleRejectPayment = async (id: string | number) => {
    if (!confirm('¿Rechazar este pago?')) return;
    try {
      await supplierPaymentsService.updateStatus(String(id), 'Rechazado');
      await loadPayments();
      alert('Pago rechazado');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error rejecting supplier payment', error);
      alert('No se pudo rechazar el pago');
    }
  };

  const handleViewDetails = (payment: any) => {
    setSelectedPayment(payment);
  };

  const handleExportExcel = async () => {
    if (!filteredPayments.length) {
      alert('No hay pagos para exportar');
      return;
    }

    const today = new Date().toISOString().split('T')[0];

    const rows = filteredPayments.map((payment) => ({
      date: payment.date,
      supplier: payment.supplier,
      reference: payment.reference,
      invoice: payment.invoice,
      method: payment.method,
      amount: payment.amount,
      status: payment.status,
      description: payment.description,
      bankAccount: payment.bankAccount,
    }));

    try {
      await exportToExcelStyled(
        rows,
        [
          { key: 'date', title: 'Fecha', width: 14 },
          { key: 'supplier', title: 'Proveedor', width: 30 },
          { key: 'reference', title: 'Referencia', width: 18 },
          { key: 'invoice', title: 'Factura', width: 18 },
          { key: 'method', title: 'Método', width: 16 },
          { key: 'amount', title: 'Monto', width: 16, numFmt: '#,##0.00' },
          { key: 'status', title: 'Estado', width: 14 },
          { key: 'description', title: 'Descripción', width: 40 },
          { key: 'bankAccount', title: 'Cuenta Bancaria', width: 30 },
        ],
        `pagos_proveedores_${today}`,
        'Pagos'
      );
    } catch (error) {
      alert('No se pudo exportar el archivo de Excel');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Procesamiento de Pagos</h1>
            <p className="text-gray-600">Gestiona pagos a proveedores</p>
          </div>
          <div className="flex space-x-3">
            <button 
              onClick={handleExportExcel}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-file-excel-line mr-2"></i>
              Exportar Excel
            </button>
            <button 
              onClick={() => setShowModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-add-line mr-2"></i>
              Nuevo Pago
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                <i className="ri-money-dollar-circle-line text-xl text-blue-600"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Total Pagado</p>
                <p className="text-2xl font-bold text-gray-900">RD$ {payments.filter(p => p.status === 'Completado').reduce((sum, p) => sum + p.amount, 0).toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mr-4">
                <i className="ri-time-line text-xl text-orange-600"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Pendientes</p>
                <p className="text-2xl font-bold text-gray-900">RD$ {payments.filter(p => p.status === 'Pendiente').reduce((sum, p) => sum + p.amount, 0).toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                <i className="ri-check-line text-xl text-green-600"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Pagos Completados</p>
                <p className="text-2xl font-bold text-gray-900">{payments.filter(p => p.status === 'Completado').length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mr-4">
                <i className="ri-close-line text-xl text-red-600"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Rechazados</p>
                <p className="text-2xl font-bold text-gray-900">{payments.filter(p => p.status === 'Rechazado').length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Estado <span className="text-red-500">*</span></label>
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Todos los Estados</option>
                <option value="Completado">Completado</option>
                <option value="Pendiente">Pendiente</option>
                <option value="Rechazado">Rechazado</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Método de Pago</label>
              <select 
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Todos los Métodos</option>
                {paymentMethods.map(method => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button 
                onClick={() => {setFilterStatus('all'); setFilterMethod('all');}}
                className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Payments Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Lista de Pagos</h3>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{payment.date}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{payment.supplier}</div>
                        <div className="text-sm text-gray-500">{payment.invoice}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{payment.reference}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        payment.method === 'Transferencia' ? 'bg-blue-100 text-blue-800' :
                        payment.method === 'Cheque' ? 'bg-green-100 text-green-800' :
                        payment.method === 'Efectivo' ? 'bg-orange-100 text-orange-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {payment.method}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                      RD$ {payment.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        payment.status === 'Completado' ? 'bg-green-100 text-green-800' :
                        payment.status === 'Pendiente' ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => handleViewDetails(payment)}
                          className="text-blue-600 hover:text-blue-900 whitespace-nowrap"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        {payment.status === 'Pendiente' && (
                          <>
                            <button 
                              onClick={() => handleApprovePayment(payment.id)}
                              className="text-green-600 hover:text-green-900 whitespace-nowrap"
                            >
                              <i className="ri-check-line"></i>
                            </button>
                            <button 
                              onClick={() => handleRejectPayment(payment.id)}
                              className="text-red-600 hover:text-red-900 whitespace-nowrap"
                            >
                              <i className="ri-close-line"></i>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* New Payment Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Nuevo Pago</h3>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Proveedor *</label>
                    <select 
                      required
                      value={formData.supplierId}
                      onChange={(e) => {
                        const supplierId = e.target.value;
                        setFormData({
                          ...formData,
                          supplierId,
                          invoice: '',
                          amount: '',
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar proveedor</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Factura (CxP) <span className="text-red-500">*</span></label>
                    <select
                      required
                      value={formData.invoice}
                      onChange={(e) => {
                        const invoiceNumber = e.target.value;
                        const selectedInv = apInvoices.find((inv: any) => String(inv.invoice_number || '') === String(invoiceNumber));
                        const balance = selectedInv ? resolveApInvoiceBalance(selectedInv) : 0;

                        setFormData({
                          ...formData,
                          invoice: invoiceNumber,
                          amount: balance > 0 ? balance.toFixed(2) : '',
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Sin factura seleccionada</option>
                      {apInvoices
                        .filter((inv: any) => String(inv.supplier_id) === String(formData.supplierId) && inv.status !== 'paid')
                        .map((inv: any) => (
                          <option key={inv.id} value={inv.invoice_number || ''}>
                            {(inv.invoice_number || 'SIN-NUM').toString()} - {(inv.currency || 'DOP')} {Number(inv.balance_amount ?? inv.total_to_pay ?? inv.total_gross ?? 0).toLocaleString()}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Método de Pago *</label>
                    <select 
                      required
                      value={formData.method}
                      onChange={(e) => setFormData({...formData, method: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {paymentMethods.map(method => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Monto *</label>
                    <input 
                      type="number" min="0"
                      required
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({...formData, amount: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Cuenta Bancaria <span className="text-red-500">*</span></label>
                    <select 
                      value={formData.bankAccount}
                      onChange={(e) => setFormData({...formData, bankAccount: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar cuenta</option>
                      {bankAccounts.map((account: any) => {
                        const label = `${account.bank_name} - ${account.account_number}`;
                        return (
                          <option key={account.id} value={account.id}>{label}</option>
                        );
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fecha *</label>
                    <input 
                      type="date"
                      required
                      value={formData.date}
                      onChange={(e) => setFormData({...formData, date: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Descripción</label>
                    <textarea 
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Descripción del pago..."
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button 
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"
                  >
                    Registrar Pago
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Payment Details Modal */}
        {selectedPayment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Detalles del Pago</h3>
                  <button 
                    onClick={() => setSelectedPayment(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Referencia</p>
                    <p className="text-sm text-gray-900">{selectedPayment.reference}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Fecha</p>
                    <p className="text-sm text-gray-900">{selectedPayment.date}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-gray-600">Proveedor</p>
                    <p className="text-sm text-gray-900">{selectedPayment.supplier}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Factura</p>
                    <p className="text-sm text-gray-900">{selectedPayment.invoice}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Método</p>
                    <p className="text-sm text-gray-900">{selectedPayment.method}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Monto</p>
                    <p className="text-lg font-bold text-gray-900">RD$ {selectedPayment.amount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Estado</p>
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      selectedPayment.status === 'Completado' ? 'bg-green-100 text-green-800' :
                      selectedPayment.status === 'Pendiente' ? 'bg-orange-100 text-orange-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {selectedPayment.status}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-gray-600">Cuenta Bancaria</p>
                    <p className="text-sm text-gray-900">{selectedPayment.bankAccount}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-gray-600">Descripción</p>
                    <p className="text-sm text-gray-900">{selectedPayment.description}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}