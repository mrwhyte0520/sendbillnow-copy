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

  const paymentMethodLabels: Record<string, string> = {
    Transferencia: 'Transfer',
    Cheque: 'Check',
    Efectivo: 'Cash',
    'Tarjeta de Crédito': 'Credit Card',
  };

  const paymentStatusLabels: Record<string, string> = {
    Completado: 'Completed',
    Pendiente: 'Pending',
    Rechazado: 'Rejected',
  };

  const getMethodLabel = (method: string) => paymentMethodLabels[method] || method;
  const getStatusLabel = (status: string) => paymentStatusLabels[status] || status || 'Unknown';

  const methodPillClasses = (method: string) => {
    if (method === 'Transferencia') return 'bg-[#d7e2b0] text-[#2f3c24]';
    if (method === 'Cheque') return 'bg-[#b5c38a] text-[#2f3c24]';
    if (method === 'Efectivo') return 'bg-[#f3d8b6] text-[#2f3c24]';
    return 'bg-[#d7d4e3] text-[#2f3c24]';
  };

  const statusBadgeClasses = (status: string) => {
    if (status === 'Completado') return 'bg-[#d7e2b0] text-[#2f3c24]';
    if (status === 'Pendiente') return 'bg-[#f3d8b6] text-[#5b441d]';
    return 'bg-[#f5c2b0] text-[#5b2a1c]';
  };

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
      alert('You must be signed in to record payments');
      return;
    }

    if (!formData.supplierId) {
      alert('Please select a supplier');
      return;
    }

    const amount = parseFloat(formData.amount || '0');
    if (!amount || amount <= 0) {
      alert('Amount must be greater than zero');
      return;
    }

    const reference = `PAY-${new Date().getFullYear()}-${String(payments.length + 1).padStart(3, '0')}`;

    // Resolver banco seleccionado
    const selectedBank = bankAccounts.find((b: any) => String(b.id) === String(formData.bankAccount));
    if (!selectedBank) {
      alert('Please choose a valid bank account');
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
      alert('Payment recorded successfully');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error saving supplier payment', error);
      alert('Unable to record payment');
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
    if (!confirm('Confirm this payment?')) return;

    try {
      await supplierPaymentsService.updateStatus(String(id), 'Completado');
      await loadPayments();
      await loadApInvoices();
      alert('Payment approved');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error approving supplier payment', error);
      alert('Payment could not be approved');
    }
  };

  const handleRejectPayment = async (id: string | number) => {
    if (!confirm('Reject this payment?')) return;
    try {
      await supplierPaymentsService.updateStatus(String(id), 'Rechazado');
      await loadPayments();
      alert('Payment rejected');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error rejecting supplier payment', error);
      alert('Payment could not be rejected');
    }
  };

  const handleViewDetails = (payment: any) => {
    setSelectedPayment(payment);
  };

  const handleExportExcel = async () => {
    if (!filteredPayments.length) {
      alert('There are no payments to export');
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
          { key: 'date', title: 'Date', width: 14 },
          { key: 'supplier', title: 'Supplier', width: 30 },
          { key: 'reference', title: 'Reference', width: 18 },
          { key: 'invoice', title: 'Invoice', width: 18 },
          { key: 'method', title: 'Method', width: 16 },
          { key: 'amount', title: 'Amount', width: 16, numFmt: '#,##0.00' },
          { key: 'status', title: 'Status', width: 14 },
          { key: 'description', title: 'Description', width: 40 },
          { key: 'bankAccount', title: 'Bank Account', width: 30 },
        ],
        `supplier_payments_${today}`,
        'Payments'
      );
    } catch (error) {
      alert('Unable to export spreadsheet');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 bg-[#f8f4ec] min-h-screen p-6 rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#2f3c24]">Payment Processing</h1>
            <p className="text-[#5c6b42]">Manage supplier disbursements and approvals</p>
          </div>
          <div className="flex space-x-3">
            <button 
              onClick={handleExportExcel}
              className="bg-[#7a8b4a] text-white px-4 py-2 rounded-lg hover:bg-[#67753b] transition-colors whitespace-nowrap shadow"
            >
              <i className="ri-file-excel-line mr-2"></i>
              Export Excel
            </button>
            <button 
              onClick={() => setShowModal(true)}
              className="bg-[#3f4d2c] text-white px-4 py-2 rounded-lg hover:bg-[#2f3a1f] transition-colors whitespace-nowrap shadow-sm"
            >
              <i className="ri-add-line mr-2"></i>
              New Payment
            </button>
          </div>

        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-[#d7ccb5] p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-[#dfe9c1] rounded-lg flex items-center justify-center mr-4">
                <i className="ri-money-dollar-circle-line text-xl text-[#3f4d2c]"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-[#4c5b36]">Total Paid</p>
                <p className="text-2xl font-bold text-[#2f3c24]">
                  RD$ {payments.filter(p => p.status === 'Completado').reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-[#d7ccb5] p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-[#f3e2c0] rounded-lg flex items-center justify-center mr-4">
                <i className="ri-time-line text-xl text-[#b3682f]"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-[#4c5b36]">Pending Amount</p>
                <p className="text-2xl font-bold text-[#2f3c24]">
                  RD$ {payments.filter(p => p.status === 'Pendiente').reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-[#d7ccb5] p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-[#e4eed0] rounded-lg flex items-center justify-center mr-4">
                <i className="ri-check-line text-xl text-[#4f5e35]"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-[#4c5b36]">Completed Payments</p>
                <p className="text-2xl font-bold text-[#2f3c24]">
                  {payments.filter(p => p.status === 'Completado').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-[#d7ccb5] p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-[#f5c2b0] rounded-lg flex items-center justify-center mr-4">
                <i className="ri-close-line text-xl text-[#7a2e1b]"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-[#4c5b36]">Rejected</p>
                <p className="text-2xl font-bold text-[#2f3c24]">
                  {payments.filter(p => p.status === 'Rechazado').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-[#d7ccb5] p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#4c5b36] mb-2">
                Status <span className="text-red-500">*</span>
              </label>
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-[#c0b596] rounded-lg focus:ring-2 focus:ring-[#4c5b36] focus:border-[#4c5b36] bg-[#fefaf1]"
              >
                <option value="all">All Statuses</option>
                <option value="Completado">Completed</option>
                <option value="Pendiente">Pending</option>
                <option value="Rechazado">Rejected</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#4c5b36] mb-2">Payment Method</label>
              <select 
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value)}
                className="w-full px-3 py-2 border border-[#c0b596] rounded-lg focus:ring-2 focus:ring-[#4c5b36] focus:border-[#4c5b36] bg-[#fefaf1]"
              >
                <option value="all">All Methods</option>
                {paymentMethods.map(method => (
                  <option key={method} value={method}>{getMethodLabel(method)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button 
                onClick={() => {setFilterStatus('all'); setFilterMethod('all');}}
                className="w-full bg-[#5a5c55] text-white py-2 px-4 rounded-lg hover:bg-[#43443f] transition-colors whitespace-nowrap shadow-sm"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Payments Table */}
        <div className="bg-white rounded-lg shadow-sm border border-[#d7ccb5]">
          <div className="p-6 border-b border-[#d7ccb5] bg-[#fefaf1] rounded-t-lg">
            <h3 className="text-lg font-semibold text-[#2f3c24]">Payment List</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#eadfca]">
              <thead className="bg-[#f5ebd6]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#2f3c24] uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#2f3c24] uppercase tracking-wider">Supplier</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#2f3c24] uppercase tracking-wider">Reference</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#2f3c24] uppercase tracking-wider">Method</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-[#2f3c24] uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#2f3c24] uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#2f3c24] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#f0e4cd]">
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-[#f9f3e3] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2f3c24]">{payment.date}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-[#2f3c24]">{payment.supplier}</div>
                        <div className="text-sm text-[#5c6b42]">{payment.invoice}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2f3c24]">{payment.reference}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${methodPillClasses(payment.method)}`}>
                        {getMethodLabel(payment.method)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-[#2f3c24]">
                      RD$ {payment.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusBadgeClasses(payment.status)}`}>
                        {getStatusLabel(payment.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => handleViewDetails(payment)}
                          className="text-[#3f4d2c] hover:text-[#2f3a1f] whitespace-nowrap"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        {payment.status === 'Pendiente' && (
                          <>
                            <button 
                              onClick={() => handleApprovePayment(payment.id)}
                              className="text-[#4f6131] hover:text-[#2f3c24] whitespace-nowrap"
                            >
                              <i className="ri-check-line"></i>
                            </button>
                            <button 
                              onClick={() => handleRejectPayment(payment.id)}
                              className="text-[#9c3d25] hover:text-[#6c1f12] whitespace-nowrap"
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
              <div className="p-6 border-b border-[#d7ccb5] bg-[#fefaf1] rounded-t-lg">
                <h3 className="text-lg font-semibold text-[#2f3c24]">New Payment</h3>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#4c5b36] mb-2">Supplier *</label>
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
                      <option value="">Select supplier</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4c5b36] mb-2">AP Invoice <span className="text-red-500">*</span></label>
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
                      <option value="">No invoice selected</option>
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
                    <label className="block text-sm font-medium text-[#4c5b36] mb-2">Payment Method *</label>
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
                    <label className="block text-sm font-medium text-[#4c5b36] mb-2">Amount *</label>
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
                    <label className="block text-sm font-medium text-[#4c5b36] mb-2">Bank Account <span className="text-red-500">*</span></label>
                    <select 
                      value={formData.bankAccount}

                      onChange={(e) => setFormData({...formData, bankAccount: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select account</option>
                      {bankAccounts.map((account: any) => {
                        const label = `${account.bank_name} - ${account.account_number}`;
                        return (

                          <option key={account.id} value={account.id}>{label}</option>
                        );
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4c5b36] mb-2">Date *</label>
                    <input 
                      type="date"

                      required
                      value={formData.date}
                      onChange={(e) => setFormData({...formData, date: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[#4c5b36] mb-2">Description</label>
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
                    className="px-4 py-2 border border-[#d7ccb5] rounded-lg text-[#4c5b36] hover:bg-[#fefaf1] whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-[#3f4d2c] text-white rounded-lg hover:bg-[#2f3a1f] whitespace-nowrap shadow-sm"
                  >
                    Save Payment
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
              <div className="p-6 border-b border-[#d7ccb5] bg-[#fefaf1] rounded-t-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-[#2f3c24]">Payment Details</h3>
                  <button 
                    onClick={() => setSelectedPayment(null)}
                    className="text-[#8c7f62] hover:text-[#5c5139]"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-[#5c6b42]">Reference</p>
                    <p className="text-sm text-[#2f3c24]">{selectedPayment.reference}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#5c6b42]">Date</p>
                    <p className="text-sm text-[#2f3c24]">{selectedPayment.date}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-[#5c6b42]">Supplier</p>
                    <p className="text-sm text-[#2f3c24]">{selectedPayment.supplier}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#5c6b42]">Invoice</p>
                    <p className="text-sm text-[#2f3c24]">{selectedPayment.invoice}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#5c6b42]">Method</p>
                    <p className="text-sm text-[#2f3c24]">{getMethodLabel(selectedPayment.method)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#5c6b42]">Amount</p>
                    <p className="text-lg font-bold text-[#2f3c24]">RD$ {selectedPayment.amount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#5c6b42]">Status</p>
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusBadgeClasses(selectedPayment.status)}`}>
                      {getStatusLabel(selectedPayment.status)}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-[#5c6b42]">Bank Account</p>
                    <p className="text-sm text-[#2f3c24]">{selectedPayment.bankAccount}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-[#5c6b42]">Description</p>
                    <p className="text-sm text-[#2f3c24]">{selectedPayment.description}</p>
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