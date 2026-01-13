import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { customersService, invoicesService } from '../../../services/database';

interface ArDiscount {
  id: string;
  entryNumber: string;
  date: string;
  customerId?: string;
  customerName: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amount: number;
  concept: string;
}

const STORAGE_PREFIX = 'contabi_ar_discounts_';

export default function DiscountsPage() {
  const { user } = useAuth();
  const [discounts, setDiscounts] = useState<ArDiscount[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [invoices, setInvoices] = useState<
    Array<{
      id: string;
      invoiceNumber: string;
      customerId: string;
      totalAmount: number;
      paidAmount: number;
      pendingAmount: number;
    }>
  >([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [noteCustomerId, setNoteCustomerId] = useState<string>('');
  const [noteInvoiceId, setNoteInvoiceId] = useState<string>('');
  const [noteAmount, setNoteAmount] = useState<number>(0);
  const [notePercent, setNotePercent] = useState<number>(0);
  const [noteOriginAccountId, setNoteOriginAccountId] = useState<string>('');
  const [noteDiscountsAccountId, setNoteDiscountsAccountId] = useState<string>('');
  const [noteConcept, setNoteConcept] = useState<string>('');

  const incomeAccounts = accounts.filter((acc) => acc.allowPosting && acc.type === 'income');

  const resetDiscountForm = () => {
    setNoteCustomerId('');
    setNoteInvoiceId('');
    setNoteAmount(0);
    setNotePercent(0);
    setNoteOriginAccountId('');
    setNoteDiscountsAccountId('');
    setNoteConcept('');
  };

  const storageKey = user?.id ? `${STORAGE_PREFIX}${user.id}` : null;

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [custList, invList] = await Promise.all([
        customersService.getAll(user.id),
        invoicesService.getAll(user.id),
      ]);

      const customersArray = (custList || []).map((c: any) => ({ id: String(c.id), name: String(c.name) }));
      setCustomers(customersArray);

      const invoicesArray = (invList as any[]).map((inv) => {
        const totalAmount = Number(inv.total_amount) || 0;
        const paidAmount = Number((inv as any).paid_amount) || 0;
        const pendingAmount = totalAmount > 0 ? Math.max(totalAmount - paidAmount, 0) : 0;

        return {
          id: String(inv.id),
          invoiceNumber: inv.invoice_number as string,
          customerId: String(inv.customer_id),
          totalAmount,
          paidAmount,
          pendingAmount,
        };
      });
      setInvoices(invoicesArray);

      if (storageKey) {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              setDiscounts(parsed);
            } else {
              setDiscounts([]);
            }
          } catch {
            setDiscounts([]);
          }
        } else {
          setDiscounts([]);
        }
      } else {
        setDiscounts([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!showModal) return;
    if (!accounts.length) return;
    if (noteDiscountsAccountId) return;

    const norm = (v: any) => String(v || '').toLowerCase().trim();
    const normalizeCode = (code: any) => String(code || '').replace(/\./g, '');

    const candidates = accounts.filter((acc: any) => acc?.allowPosting);
    const byName = candidates.find((acc: any) => norm(acc.name) === 'descuentos en ventas');
    const byContains = candidates.find((acc: any) => norm(acc.name).includes('descuento') && norm(acc.name).includes('venta'));
    const byCode = candidates.find((acc: any) => ['4104', '410401', '4204', '420401'].includes(normalizeCode(acc.code)));

    const selected = byName || byContains || byCode;
    if (selected?.id) {
      setNoteDiscountsAccountId(String(selected.id));
    }
  }, [showModal, accounts, noteDiscountsAccountId]);

  const filteredDiscounts = discounts.filter((d) => {
    const term = searchTerm.toLowerCase();
    return (
      d.customerName.toLowerCase().includes(term) ||
      (d.invoiceNumber || '').toLowerCase().includes(term) ||
      d.entryNumber.toLowerCase().includes(term) ||
      d.concept.toLowerCase().includes(term)
    );
  });

  const selectedInvoiceForDiscount = noteInvoiceId
    ? invoices.find((inv) => inv.id === noteInvoiceId)
    : undefined;

  const selectedInvoicePending = selectedInvoiceForDiscount
    ? Number(selectedInvoiceForDiscount.pendingAmount) || 0
    : 0;

  const previewNewInvoiceTotal = selectedInvoiceForDiscount
    ? Math.max((Number(selectedInvoiceForDiscount.totalAmount) || 0) - (noteAmount || 0), 0)
    : 0;

  const handleInvoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newInvoiceId = e.target.value;
    setNoteInvoiceId(newInvoiceId);

    if (!newInvoiceId) {
      setNoteAmount(0);
      return;
    }

    const invoice = invoices.find((inv) => inv.id === newInvoiceId);
    if (!invoice) {
      setNoteAmount(0);
      return;
    }

    const pending = Number(invoice.pendingAmount) || 0;
    if (pending <= 0) {
      setNoteAmount(0);
      return;
    }

    if (notePercent > 0) {
      const calc = (pending * notePercent) / 100;
      setNoteAmount(Number(calc.toFixed(2)));
    } else {
      setNoteAmount(0);
    }
  };

  const handlePercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value || 0);
    const value = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    setNotePercent(value);

    if (!noteInvoiceId) {
      // Sin factura, solo guardamos el porcentaje; el usuario puede escribir el monto manualmente.
      return;
    }

    const invoice = invoices.find((inv) => inv.id === noteInvoiceId);
    if (!invoice) return;

    const pending = Number(invoice.pendingAmount) || 0;
    if (pending <= 0 || value <= 0) {
      setNoteAmount(0);
      return;
    }

    const calc = (pending * value) / 100;
    setNoteAmount(Number(calc.toFixed(2)));
  };

  const handleSaveDiscount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id) {
      alert('Debes iniciar sesión para registrar descuentos');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const customerId = String(formData.get('customer_id') || '');
    const date = String(formData.get('date') || '');
    const amount = Number(formData.get('amount') || 0);
    const invoiceId = String(formData.get('invoice_id') || '');
    const concept = String(formData.get('concept') || '');

    if (!invoiceId) {
      alert('Debes seleccionar una factura relacionada para aplicar el descuento');
      return;
    }

    if (!amount || amount <= 0) {
      alert('El monto debe ser mayor que 0');
      return;
    }

    // Validar contra saldo pendiente
    {
      const targetInvoice = invoices.find((inv) => inv.id === invoiceId);
      if (targetInvoice) {
        const pending = Number(targetInvoice.pendingAmount) || 0;
        if (pending <= 0) {
          alert('La factura seleccionada no tiene saldo pendiente para aplicar descuentos.');
          return;
        }
        if (amount > pending) {
          alert(
            `El monto del descuento no puede ser mayor que el saldo pendiente de la factura (pendiente: ${pending.toLocaleString()}).`,
          );
          return;
        }
      }
    }

    const entryDate = date || new Date().toISOString().slice(0, 10);
    const entryNumber = `DSC-${Date.now()}`;

    const customerName = customerId
      ? customers.find((c) => c.id === customerId)?.name || ''
      : '';
    const invoiceNumber = invoiceId
      ? invoices.find((inv) => inv.id === invoiceId)?.invoiceNumber || ''
      : '';

    const descriptionParts = ['Descuento en ventas'];
    if (customerName) descriptionParts.push(`Cliente: ${customerName}`);
    if (invoiceNumber) descriptionParts.push(`Factura: ${invoiceNumber}`);

    const description = descriptionParts.join(' - ');
    const reference = `DSC|${customerId}|${invoiceId}|${concept}`;

    try {
      // Si hay una factura relacionada, actualizar su total y estado
      if (invoiceId) {
        const targetInvoice = invoices.find((inv) => inv.id === invoiceId);
        if (targetInvoice) {
          const originalTotal = Number(targetInvoice.totalAmount) || 0;
          const paidAmount = Number(targetInvoice.paidAmount) || 0;
          let newInvoiceTotal = originalTotal - amount;
          if (newInvoiceTotal < 0) newInvoiceTotal = 0;

          let newInvoiceStatus: string;
          if (paidAmount >= newInvoiceTotal) {
            newInvoiceStatus = 'paid';
          } else if (paidAmount > 0) {
            newInvoiceStatus = 'partial';
          } else {
            newInvoiceStatus = 'pending';
          }

          await invoicesService.updateTotals(invoiceId, newInvoiceTotal, newInvoiceStatus);
        }
      }

      const now = entryDate;
      const newDiscount: ArDiscount = {
        id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
        entryNumber,
        date: now,
        customerId,
        customerName,
        invoiceId,
        invoiceNumber,
        amount,
        concept,
      };

      setDiscounts(prev => {
        const updated = [newDiscount, ...prev];
        if (storageKey) {
          localStorage.setItem(storageKey, JSON.stringify(updated));
        }
        return updated;
      });

      alert('Discount saved successfully');
      setShowModal(false);
      resetDiscountForm();
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[Discounts] Error al registrar descuento', error);
      alert(error?.message || 'Error al registrar el descuento.');
    }
  };

  const totalAmount = filteredDiscounts.reduce((sum, d) => sum + d.amount, 0);

  return (
    <DashboardLayout>
      <div className="min-h-screen p-6 bg-[#f7f3e8]">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#2f3e1e]">Sales Discounts (A/R)</h1>
            <nav className="flex space-x-2 text-sm text-[#6b5c3b] mt-2">
              <Link to="/accounts-receivable" className="hover:text-[#2f3e1e]">Accounts Receivable</Link>
              <span>/</span>
              <span>Discounts</span>
            </nav>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-[#2f3e1e] text-white px-4 py-2 rounded-lg hover:bg-[#1f2913] transition-colors whitespace-nowrap shadow-sm"
          >
            <i className="ri-add-line mr-2"></i>
            New Discount
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-[#e4d8c4]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#6b5c3b]">Total Discounts</p>
                <p className="text-2xl font-semibold text-[#2f3e1e]">
                  {`${totalAmount.toLocaleString()}`}
                </p>
              </div>
              <div className="w-12 h-12 bg-[#f3ecda] rounded-xl flex items-center justify-center text-[#2f3e1e]">
                <i className="ri-percent-line text-2xl"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-[#e4d8c4]">
            <p className="text-sm font-medium text-[#6b5c3b]">Discount Count</p>
            <p className="text-2xl font-semibold text-[#2f3e1e]">{filteredDiscounts.length}</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-[#e4d8c4]">
            <p className="text-sm font-medium text-[#6b5c3b]">Customers impacted</p>
            <p className="text-2xl font-semibold text-[#2f3e1e]">
              {new Set(filteredDiscounts.map((d) => d.customerName).filter(Boolean)).size}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="ri-search-line text-[#9b8a64]"></i>
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-[#d8cbb5] bg-[#fffdf6] rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b] text-sm placeholder:text-[#9b8a64]"
                placeholder="Search by customer, document number, invoice, or concept..."
              />
            </div>
          </div>
        </div>

        {/* Discounts Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {loading && (
            <div className="px-6 pt-3 text-sm text-gray-500">Loading data...</div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Document
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoice
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Concept
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDiscounts.map((disc) => (
                  <tr key={disc.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {disc.entryNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {disc.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {disc.customerName || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {disc.invoiceNumber || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      {disc.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {disc.concept}
                    </td>
                  </tr>
                ))}
                {filteredDiscounts.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-sm text-gray-500 text-center">
                      No discounts have been registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* New Discount Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-[#2f3e1e]">New Sales Discount</h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>

              <form onSubmit={handleSaveDiscount} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Customer
                    </label>
                    <select
                      required
                      name="customer_id"
                      value={noteCustomerId}
                      onChange={(e) => {
                        const newCustomerId = e.target.value;
                        setNoteCustomerId(newCustomerId);
                        setNoteInvoiceId('');
                        setNoteAmount(0);
                        setNotePercent(0);
                        setNoteConcept('');
                      }}
                      className="w-full p-3 border border-[#d8cbb5] bg-[#fffdf6] rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b] pr-8"
                    >
                      <option value="">Select a customer</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Date
                    </label>
                    <input
                      type="date"
                      name="date"
                      defaultValue={new Date().toISOString().split('T')[0]}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Discount % (over pending balance)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={notePercent || ''}
                      onChange={handlePercentChange}
                      className="w-full p-3 border border-[#d8cbb5] bg-white rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b]"
                      placeholder="0.00"
                    />
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2 mt-3">
                      Amount
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      name="amount"
                      required
                      value={noteAmount || ''}
                      onChange={(e) => setNoteAmount(Number(e.target.value || 0))}
                      className="w-full p-3 border border-[#d8cbb5] bg-white rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b]"
                      placeholder="0.00"
                    />
                    {selectedInvoiceForDiscount && (
                      <p className="mt-1 text-xs text-[#6b5c3b]">
                        Pending balance: {selectedInvoicePending.toLocaleString()} · New invoice total: {previewNewInvoiceTotal.toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Related invoice
                    </label>
                    <select
                      name="invoice_id"
                      required
                      value={noteInvoiceId}
                      onChange={handleInvoiceChange}
                      className="w-full p-3 border border-[#d8cbb5] bg-[#fffdf6] rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b] pr-8"
                    >
                      <option value="">Select an invoice</option>
                      {invoices
                        .filter((inv) => (!noteCustomerId || inv.customerId === noteCustomerId) && (Number(inv.pendingAmount) || 0) > 0)
                        .map((inv) => (
                          <option key={inv.id} value={inv.id}>{inv.invoiceNumber}</option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Original income account
                    </label>
                    <select
                      name="origin_account_id"
                      value={noteOriginAccountId}
                      onChange={(e) => setNoteOriginAccountId(e.target.value)}
                      className="w-full p-3 border border-[#d8cbb5] bg-[#fffdf6] rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b] pr-8"
                    >
                      <option value="">Select an original income account</option>
                      {incomeAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code ? `${acc.code} · ${acc.name}` : acc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      “Sales discounts” account
                    </label>
                    <select
                      name="discounts_account_id"
                      value={noteDiscountsAccountId}
                      onChange={(e) => setNoteDiscountsAccountId(e.target.value)}
                      className="w-full p-3 border border-[#d8cbb5] bg-[#fffdf6] rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b] pr-8"
                    >
                      <option value="">Select the discounts account</option>
                      {accounts
                        .filter((acc) => acc.allowPosting)
                        .map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code ? `${acc.code} · ${acc.name}` : acc.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Concept
                    </label>
                    <textarea
                      name="concept"
                      className="w-full p-3 border border-[#d8cbb5] bg-white rounded-lg focus:ring-2 focus:ring-[#6b5c3b] focus:border-[#6b5c3b]"
                      rows={3}
                      placeholder="Describe the discount details..."
                      value={noteConcept}
                      onChange={(e) => setNoteConcept(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowModal(false);
                        resetDiscountForm();
                      }}
                      className="flex-1 bg-[#f3ecda] text-[#6b5c3b] py-2 rounded-lg hover:bg-[#e6ddc4] transition-colors whitespace-nowrap"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-[#2f3e1e] text-white py-2 rounded-lg hover:bg-[#1f2913] transition-colors whitespace-nowrap"
                    >
                      Save Discount
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
