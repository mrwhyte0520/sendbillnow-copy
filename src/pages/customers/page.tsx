import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { customersService, paymentTermsService } from '../../services/database';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface Customer {
  id: string;
  name: string;
  document: string;
  phone?: string;
  email?: string;
  address?: string;
  type: 'regular' | 'vip';
  paymentTermId?: string | null;
}

const Modal = ({ children, onClose }: { children: ReactNode; onClose: () => void }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="max-h-[80vh] overflow-y-auto p-6">{children}</div>
      </div>
    </div>,
    document.body
  );
};

export default function CustomersPage() {
  const { user } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<Array<{ id: string; name: string; days?: number }>>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showNew, setShowNew] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Omit<Customer, 'id'>>({ name: '', document: '', phone: '', email: '', address: '', type: 'regular', paymentTermId: null });

  const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

  const formatDocument = (raw: string) => {
    const digits = (raw || '').replace(/\D/g, '').slice(0, 11);
    const parts: string[] = [];
    if (digits.length <= 3) return digits;
    parts.push(digits.slice(0, 3));
    if (digits.length <= 10) { parts.push(digits.slice(3)); return parts.join('-'); }
    parts.push(digits.slice(3, 10));
    parts.push(digits.slice(10));
    return parts.join('-');
  };
  const formatPhone = (raw: string) => {
    const digits = (raw || '').replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0,3)}-${digits.slice(3)}`;
    return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  };

  const anyModalOpen = showNew || showEdit;

  useEffect(() => {
    document.body.style.overflow = anyModalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [anyModalOpen]);

  const load = async () => {
    try {
      if (user?.id) {
        const [rows, terms] = await Promise.all([
          customersService.getAll(user.id),
          paymentTermsService.getAll(user.id),
        ]);

        const mapped: Customer[] = (rows || []).map((c: any) => ({
          id: c.id,
          name: c.name || c.customer_name || 'Customer',
          document: c.document || c.tax_id || '',
          phone: c.phone || c.contact_phone || '',
          email: c.email || c.contact_email || '',
          address: c.address || '',
          type: (c.type === 'vip' ? 'vip' : 'regular') as 'regular' | 'vip',
          paymentTermId: c.paymentTermId ?? c.payment_term_id ?? null,
        }));
        setCustomers(mapped);

        const mappedTerms = (terms || []).map((t: any) => ({
          id: t.id as string,
          name: t.name as string,
          days: typeof t.days === 'number' ? t.days : undefined,
        }));
        setPaymentTerms(mappedTerms);
      } else {
        const local = localStorage.getItem('contabi_customers');
        setCustomers(local ? JSON.parse(local) : []);
      }
    } catch {
      const local = localStorage.getItem('contabi_customers');
      setCustomers(local ? JSON.parse(local) : []);
    }
  };

  useEffect(() => { load(); }, [user]);

  const filtered = useMemo(() => customers.filter(c =>
    (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.document || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  ), [customers, search]);

  useEffect(() => { setPage(1); }, [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const saveLocal = (list: Customer[]) => {
    localStorage.setItem('contabi_customers', JSON.stringify(list));
    setCustomers(list);
  };

  const onCreate = async () => {
    if (!form.name || !form.document) { alert('Name and Document are required'); return; }
    const docOk = /^\d{3}-\d{7}-\d$/.test(form.document);
    const phoneOk = !form.phone || /^\d{3}-\d{3}-\d{4}$/.test(form.phone);
    if (!docOk) return alert('Invalid document. 000-0000000-0');
    if (!phoneOk) return alert('Invalid phone. 000-000-0000');

    if (user?.id) {
      try {
        await customersService.create(user.id, {
          name: form.name,
          document: form.document,
          phone: form.phone || '',
          email: form.email || '',
          address: form.address || '',
          creditLimit: 0,
          status: 'active',
          paymentTermId: form.paymentTermId || null,
        });
        setShowNew(false);
        setForm({ name: '', document: '', phone: '', email: '', address: '', type: 'regular', paymentTermId: null });
        await load();
        return;
      } catch {}
    }
    const local: Customer = { id: `local-${Date.now()}`, ...form } as Customer;
    saveLocal([local, ...customers]);
    setShowNew(false);
    setForm({ name: '', document: '', phone: '', email: '', address: '', type: 'regular', paymentTermId: null });
  };

  const onUpdate = async () => {
    if (!editing) return;
    if (!editing.name || !editing.document) { alert('Name and Document are required'); return; }
    const docOk = /^\d{3}-\d{7}-\d$/.test(editing.document);
    const phoneOk = !editing.phone || /^\d{3}-\d{3}-\d{4}$/.test(editing.phone);
    if (!docOk) return alert('Invalid document. 000-0000000-0');
    if (!phoneOk) return alert('Invalid phone. 000-000-0000');

    if (user?.id && isUuid(editing.id)) {
      try {
        await customersService.update(editing.id, {
          name: editing.name,
          document: editing.document,
          phone: editing.phone || '',
          email: editing.email || '',
          address: editing.address || '',
          creditLimit: 0,
          status: 'active',
          paymentTermId: editing.paymentTermId || null,
        });
        setShowEdit(false);
        setEditing(null);
        await load();
        return;
      } catch {}
    }
    const next = customers.map(c => c.id === editing.id ? editing : c);
    saveLocal(next);
    setShowEdit(false);
    setEditing(null);
  };

  const onDelete = async (id: string) => {
    if (!confirm('Delete customer?')) return;
    if (user?.id && isUuid(id)) {
      try {
        await customersService.delete(id);
        await load();
        return;
      } catch {}
    }
    saveLocal(customers.filter(c => c.id !== id));
  };

  const exportCSV = async () => {
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Customers');

      // Define columns with appropriate widths
      ws.columns = [
        { header: 'Name', key: 'name', width: 30 },
        { header: 'Tax ID/Document', key: 'document', width: 18 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Address', key: 'address', width: 40 },
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Payment Terms', key: 'paymentTerms', width: 20 },
      ];

      // Header style
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0B1F3A' },
      };
      ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
      ws.getRow(1).height = 25;

      // Add data
      filtered.forEach((customer) => {
        const paymentTermName = customer.paymentTermId 
          ? paymentTerms.find(t => t.id === customer.paymentTermId)?.name || 'N/A'
          : 'Cash';

        ws.addRow({
          name: customer.name || '',
          document: customer.document || '',
          phone: customer.phone || '',
          email: customer.email || '',
          address: customer.address || '',
          type: customer.type === 'vip' ? 'VIP' : 'Regular',
          paymentTerms: paymentTermName,
        });
      });

      // Apply borders to all cells
      ws.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          };
          // Alignment for data rows
          if (rowNumber > 1) {
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
          }
        });
      });

      // Generate file
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const fileName = `customers_${new Date().toISOString().split('T')[0]}.xlsx`;
      saveAs(blob, fileName);
    } catch (error) {
      console.error('Error exporting customers:', error);
      alert('Error exporting customers to Excel');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
            <p className="text-gray-600">Centralized customer management</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-80">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, document or email..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
            <button
              onClick={exportCSV}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-download-line mr-2" />
              Export Excel
            </button>
            <button
              onClick={() => { setForm({ name: '', document: '', phone: '', email: '', address: '', type: 'regular' }); setShowNew(true); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-add-line mr-2" />
              New Customer
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Document</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginated.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.document}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${c.type === 'vip' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>{c.type === 'vip' ? 'VIP' : 'Regular'}</span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setEditing({ ...c }); setShowEdit(true); }} className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700" title="Edit"><i className="ri-edit-line" /></button>
                        <button onClick={() => onDelete(c.id)} className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700" title="Delete"><i className="ri-delete-bin-line" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">No customers</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Page {page} of {totalPages} · {filtered.length} records
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className={`px-3 py-1 rounded border ${page <= 1 ? 'text-gray-400 bg-gray-100 cursor-not-allowed' : 'bg-white hover:bg-gray-50'}`}
            >Previous</button>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(1); }}
              className="px-2 py-1 border rounded"
            >
              {[10,20,50,100].map(s => <option key={s} value={s}>{s}/page</option>)}
            </select>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className={`px-3 py-1 rounded border ${page >= totalPages ? 'text-gray-400 bg-gray-100 cursor-not-allowed' : 'bg-white hover:bg-gray-50'}`}
            >Next</button>
          </div>
        </div>

        {showNew && (
          <Modal onClose={() => setShowNew(false)}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">New Customer</h3>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600"><i className="ri-close-line" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} autoComplete="off" spellCheck={false} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document *</label>
                <input type="text" value={form.document} onChange={e => setForm(prev => ({ ...prev, document: e.target.value }))} onBlur={e => setForm(prev => ({ ...prev, document: formatDocument(e.target.value) }))} autoComplete="off" spellCheck={false} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="001-1234567-8" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-red-500">*</span></label>
                <input type="tel" value={form.phone} onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))} onBlur={e => setForm(prev => ({ ...prev, phone: formatPhone(e.target.value) }))} autoComplete="off" spellCheck={false} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="809-123-4567" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} autoComplete="off" spellCheck={false} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="customer@email.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea value={form.address} onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))} autoComplete="off" spellCheck={false} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" rows={2} placeholder="Full address" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Type</label>
                <select value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value as 'regular' | 'vip' }))} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8">
                  <option value="regular">Regular</option>
                  <option value="vip">VIP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                <select
                  value={form.paymentTermId ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, paymentTermId: e.target.value || null }))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                >
                  <option value="">No specific terms</option>
                  {paymentTerms.map(term => (
                    <option key={term.id} value={term.id}>
                      {term.name}{typeof term.days === 'number' ? ` (${term.days} days)` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowNew(false)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50">Cancel</button>
                <button onClick={onCreate} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
              </div>
            </div>
          </Modal>
        )}

        {showEdit && editing && (
          <Modal onClose={() => { setShowEdit(false); setEditing(null); }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Edit Customer</h3>
              <button onClick={() => { setShowEdit(false); setEditing(null); }} className="text-gray-400 hover:text-gray-600"><i className="ri-close-line" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" value={editing.name} onChange={e => setEditing(prev => ({ ...(prev as Customer), name: e.target.value }))} autoComplete="off" spellCheck={false} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document *</label>
                <input type="text" value={editing.document} onChange={e => setEditing(prev => ({ ...(prev as Customer), document: e.target.value }))} onBlur={e => setEditing(prev => ({ ...(prev as Customer), document: formatDocument(e.target.value) }))} autoComplete="off" spellCheck={false} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" value={editing.phone} onChange={e => setEditing(prev => ({ ...(prev as Customer), phone: e.target.value }))} onBlur={e => setEditing(prev => ({ ...(prev as Customer), phone: formatPhone(e.target.value) }))} autoComplete="off" spellCheck={false} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={editing.email} onChange={e => setEditing(prev => ({ ...(prev as Customer), email: e.target.value }))} autoComplete="off" spellCheck={false} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea value={editing.address} onChange={e => setEditing(prev => ({ ...(prev as Customer), address: e.target.value }))} autoComplete="off" spellCheck={false} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Type</label>
                <select value={editing.type} onChange={e => setEditing(prev => ({ ...(prev as Customer), type: e.target.value as 'regular' | 'vip' }))} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8">
                  <option value="regular">Regular</option>
                  <option value="vip">VIP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                <select
                  value={editing.paymentTermId ?? ''}
                  onChange={e => setEditing(prev => ({ ...(prev as Customer), paymentTermId: e.target.value || null }))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                >
                  <option value="">No specific terms</option>
                  {paymentTerms.map(term => (
                    <option key={term.id} value={term.id}>
                      {term.name}{typeof term.days === 'number' ? ` (${term.days} days)` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => { setShowEdit(false); setEditing(null); }} className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50">Cancel</button>
                <button onClick={onUpdate} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save Changes</button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}
