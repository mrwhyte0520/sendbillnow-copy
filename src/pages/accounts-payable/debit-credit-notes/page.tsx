import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { suppliersService, apInvoicesService, apInvoiceNotesService, chartAccountsService } from '../../../services/database';

const palette = {
  cream: '#F6F1E7',
  green: '#2F4F30',
  greenDark: '#1F2B1A',
  greenMid: '#4B5E2F',
  greenSoft: '#7E8F63',
  badgeNeutral: '#E5DCC3',
};

export default function APDebitCreditNotesPage() {
  const { user } = useAuth();

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);

  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');

  const [form, setForm] = useState({
    noteType: 'credit',
    noteDate: new Date().toISOString().slice(0, 10),
    currency: 'DOP',
    amount: '',
    accountId: '',
    reason: '',
  });

  const loadLookups = async () => {
    if (!user?.id) return;
    try {
      const [supRows, accRows] = await Promise.all([
        suppliersService.getAll(user.id),
        chartAccountsService.getAll(user.id),
      ]);

      setSuppliers(supRows || []);

      const postable = (accRows || []).filter((acc: any) => acc.allow_posting !== false && acc.type !== 'header');
      setAccounts(postable);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading supplier note lookups', error);
      setSuppliers([]);
      setAccounts([]);
    }
  };

  const loadNotes = async () => {
    if (!user?.id) return;
    try {
      const data = await apInvoiceNotesService.getAll(user.id);
      setNotes(data || []);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading supplier notes', error);
      setNotes([]);
    }
  };

  const loadInvoicesForSupplier = async (supplierId: string) => {
    if (!user?.id || !supplierId) {
      setInvoices([]);
      return;
    }
    try {
      const rows = await apInvoicesService.getAll(user.id);
      const filtered = (rows || []).filter((inv: any) => {
        const sameSupplier = String(inv.supplier_id) === String(supplierId);
        const balance = Number(inv.balance_amount ?? inv.total_to_pay ?? 0);
        return sameSupplier && balance > 0;
      });
      setInvoices(filtered);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading invoices for supplier note', error);
      setInvoices([]);
    }
  };

  useEffect(() => {
    loadLookups();
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSupplierChange = (supplierId: string) => {
    setSelectedSupplierId(supplierId);
    setSelectedInvoiceId('');
    loadInvoicesForSupplier(supplierId);
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      alert('You must sign in to record supplier notes.');
      return;
    }

    if (!selectedSupplierId) {
      alert('Select a supplier.');
      return;
    }

    if (!selectedInvoiceId) {
      alert('Select an outstanding invoice for that supplier.');
      return;
    }

    const amount = Number(form.amount || 0);
    if (amount <= 0) {
      alert('The note amount must be greater than 0.');
      return;
    }

    try {
      await apInvoiceNotesService.create(user.id, {
        supplier_id: selectedSupplierId,
        ap_invoice_id: selectedInvoiceId,
        note_type: form.noteType,
        note_date: form.noteDate,
        currency: form.currency,
        amount,
        account_id: form.accountId || null,
        reason: form.reason,
      });

      alert('Note saved successfully.');
      setForm({
        noteType: 'credit',
        noteDate: new Date().toISOString().slice(0, 10),
        currency: 'DOP',
        amount: '',
        accountId: '',
        reason: '',
      });
      loadInvoicesForSupplier(selectedSupplierId);
      loadNotes();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error creating supplier note', error);
      alert('The note could not be saved.');
    }
  };

  return (
    <DashboardLayout>
      <div
        className="space-y-6 rounded-3xl"
        style={{ backgroundColor: palette.cream, minHeight: '100vh', padding: '24px' }}
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide font-semibold" style={{ color: palette.greenSoft }}>
              Accounts Payable · Adjustments
            </p>
            <h1 className="text-3xl font-bold" style={{ color: palette.greenDark }}>Supplier Debit / Credit Notes</h1>
            <p className="text-base" style={{ color: palette.greenSoft }}>
              Register invoice adjustments by selecting a supplier and an outstanding bill.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[rgba(47,79,48,0.15)] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: palette.greenDark }}>New Note</h2>
          </div>
          <form onSubmit={handleCreateNote} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier *</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => handleSupplierChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select supplier...</option>
                {suppliers.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Outstanding invoice *</label>
              <select
                value={selectedInvoiceId}
                onChange={(e) => setSelectedInvoiceId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select an invoice...</option>
                {invoices.map((inv: any) => {
                  const balance = Number(inv.balance_amount ?? inv.total_to_pay ?? 0);
                  return (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number || inv.id} · {inv.invoice_date} · Balance {inv.currency || 'DOP'} {balance.toLocaleString()}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note type *</label>
              <select
                value={form.noteType}
                onChange={(e) => setForm(prev => ({ ...prev, noteType: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="credit">Credit Note (reduces balance)</option>
                <option value="debit">Debit Note (increases balance)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={form.noteDate}
                onChange={(e) => setForm(prev => ({ ...prev, noteDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <input
                type="text"
                value={form.currency}
                onChange={(e) => setForm(prev => ({ ...prev, currency: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
              <input
                type="number" min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ledger account *</label>
              <select
                value={form.accountId}
                onChange={(e) => setForm(prev => ({ ...prev, accountId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Seleccione cuenta...</option>
                {accounts
                  .filter((acc: any) => {
                    const rawType = (acc.type || acc.account_type || '').toString().toLowerCase();
                    if (!rawType) return false;
                    if (form.noteType === 'debit') {
                      return (
                        rawType.includes('expense') ||
                        rawType.includes('gasto') ||
                        rawType.includes('asset') ||
                        rawType.includes('activo')
                      );
                    }
                    return (
                      rawType.includes('expense') ||
                      rawType.includes('gasto') ||
                      rawType.includes('income') ||
                      rawType.includes('ingreso')
                    );
                  })
                  .map((acc: any) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason / Description</label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm(prev => ({ ...prev, reason: e.target.value }))}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="E.g. early payment discount, price adjustment, partial return..."
              />
            </div>

            <div className="md:col-span-2 lg:col-span-3 flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-white text-sm font-semibold shadow"
                style={{ backgroundColor: palette.greenMid }}
              >
                Save Note
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[rgba(47,79,48,0.15)] p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold" style={{ color: palette.greenDark }}>Recorded Notes</h2>
            <span className="text-xs" style={{ color: palette.greenSoft }}>Total: {notes.length}</span>
          </div>
          {notes.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No debit/credit notes recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Date</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Type</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Supplier</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Invoice</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Amount</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Reason</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {notes.map((n: any) => {
                    const supplierName = (n.suppliers as any)?.name || 'Supplier';
                    const inv = n.ap_invoices as any;
                    return (
                      <tr key={n.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap">{n.note_date}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{n.note_type === 'debit' ? 'Debit' : 'Credit'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{supplierName}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{inv?.invoice_number || inv?.id || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-right">{n.currency} {Number(n.amount || 0).toLocaleString()}</td>
                        <td className="px-3 py-2 whitespace-nowrap max-w-xs truncate" title={n.reason || ''}>{n.reason || '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap capitalize">{n.status || 'Pending'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
