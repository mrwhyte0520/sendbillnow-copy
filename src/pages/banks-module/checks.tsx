import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { bankAccountsService, chartAccountsService, bankChecksService, suppliersService, apInvoicesService } from '../../services/database';
import { formatAmount } from '../../utils/numberFormat';

interface BankCheck {
  id: string;
  bank_id: string;
  check_number: string;
  payment_type: 'accounts_payable' | 'cash' | 'internal_transfer';
  supplier_id?: string;
  payee_name?: string;
  account_id?: string;
  destination_bank_id?: string;
  currency: string;
  amount: number;
  check_date: string;
  description: string;
  status: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_to_pay: number;
  paid_amount: number;
  balance: number;
}

export default function BankChecksPage() {
  const { user } = useAuth();
  const [checks, setChecks] = useState<BankCheck[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    bank_id: '',
    check_number: '',
    payment_type: 'cash' as 'accounts_payable' | 'cash' | 'internal_transfer',
    supplier_id: '',
    payee_name: '',
    account_id: '',
    destination_bank_id: '',
    amount: '',
    description: '',
  });

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      const [chks, bnks, sups, accs] = await Promise.all([
        bankChecksService.getAll(user.id),
        bankAccountsService.getAll(user.id),
        suppliersService.getAll(user.id),
        chartAccountsService.getAll(user.id),
      ]);
      setChecks(chks || []);
      setBanks(bnks || []);
      setSuppliers(sups || []);
      setAccounts(accs || []);
    };
    load();
  }, [user?.id]);

  useEffect(() => {
    const loadInv = async () => {
      if (!user?.id || !form.supplier_id || form.payment_type !== 'accounts_payable') {
        setPendingInvoices([]);
        setSelectedInvoices(new Map());
        return;
      }
      const invs = await apInvoicesService.getAll(user.id);
      const pending = (invs || []).filter((i: any) => {
        const st = String(i.status || '').toLowerCase();
        if (i.supplier_id !== form.supplier_id) return false;
        if (st === 'paid') return false;
        if (st === 'cancelled' || st === 'cancelada' || st === 'void' || st === 'anulada' || st === 'draft') return false;
        return true;
      }).map((i: any) => {
        const totalToPay = Number(i.total_to_pay) || 0;
        const paid = Number(i.paid_amount) || 0;
        const balRaw = Number(i.balance_amount);
        const balance = Number.isFinite(balRaw) ? Math.max(balRaw, 0) : Math.max(totalToPay - paid, 0);
        return {
          id: i.id,
          invoice_number: i.invoice_number,
          invoice_date: i.invoice_date,
          total_to_pay: totalToPay,
          paid_amount: paid,
          balance,
        };
      });
      setPendingInvoices(pending);
    };
    loadInv();
  }, [user?.id, form.supplier_id, form.payment_type]);

  useEffect(() => {
    if (form.payment_type !== 'accounts_payable') return;
    if (selectedInvoices.size === 0) {
      setForm(p => ({ ...p, amount: '0.00' }));
    } else {
      const total = Array.from(selectedInvoices.values()).reduce((s, a) => s + a, 0);
      setForm(p => ({ ...p, amount: total.toFixed(2) }));
    }
  }, [selectedInvoices, form.payment_type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !form.bank_id || !form.check_number.trim()) return alert('Complete banco y numero de cheque');
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) return alert('Monto invalido');
    if (form.payment_type === 'accounts_payable' && (!form.supplier_id || selectedInvoices.size === 0)) return alert('Seleccione suplidor y facturas');
    if (form.payment_type === 'cash' && (!form.payee_name.trim() || !form.account_id)) return alert('Complete beneficiario y cuenta a cargar');
    if (form.payment_type === 'internal_transfer' && !form.destination_bank_id) return alert('Seleccione banco destino');
    try {
      setLoading(true);
      const bank = banks.find(b => b.id === form.bank_id);
      const supplier = suppliers.find(s => s.id === form.supplier_id);
      const invoicePayments = form.payment_type === 'accounts_payable' ? Array.from(selectedInvoices.entries()).map(([id, amount]) => {
        const inv = pendingInvoices.find(i => i.id === id);
        return { invoice_id: id, invoice_number: inv?.invoice_number || '', amount_to_pay: amount, invoice_total: inv?.total_to_pay || 0 };
      }) : undefined;
      await bankChecksService.create(user.id, {
        bank_id: form.bank_id,
        bank_account_code: bank?.chart_account_id || '',
        check_number: form.check_number.trim(),
        payment_type: form.payment_type,
        supplier_id: form.supplier_id || undefined,
        payee_name: form.payment_type === 'cash' ? form.payee_name : form.payment_type === 'internal_transfer' ? 'Transferencia Interna' : (supplier?.name || ''),
        account_id: form.account_id || undefined,
        destination_bank_id: form.destination_bank_id || undefined,
        currency: bank?.currency || 'DOP',
        amount: amt,
        check_date: new Date().toISOString().split('T')[0],
        description: form.description,
        invoice_payments: invoicePayments,
      });
      alert('Cheque registrado');
      const data = await bankChecksService.getAll(user.id);
      setChecks(data || []);
      setForm({ bank_id: '', check_number: '', payment_type: 'cash', supplier_id: '', payee_name: '', account_id: '', destination_bank_id: '', amount: '', description: '' });
      setSelectedInvoices(new Map());
    } catch (err: any) {
      alert(err?.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  const selectedBank = banks.find(b => b.id === form.bank_id);
  const selectedBankAccount = selectedBank?.chart_account_id ? accounts.find(a => a.id === selectedBank.chart_account_id) : null;
  const destinationBank = banks.find(b => b.id === form.destination_bank_id);
  const destinationBankAccount = destinationBank?.chart_account_id ? accounts.find(a => a.id === destinationBank.chart_account_id) : null;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div><h1 className="text-2xl font-bold">Cheques Bancarios</h1><p className="text-gray-600 text-sm">Registre cheques para pagos a proveedores, gastos de contado o transferencias internas</p></div>
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Nuevo Cheque</h2>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium mb-1">Banco Emisor *</label><select value={form.bank_id} onChange={e => setForm(p => ({...p, bank_id: e.target.value}))} className="w-full border rounded px-3 py-2" required><option value="">Seleccione...</option>{banks.map(b => <option key={b.id} value={b.id}>{b.bank_name}</option>)}</select></div>
            <div><label className="block text-sm font-medium mb-1">Cuenta Bancaria</label><input type="text" value={selectedBankAccount ? `${selectedBankAccount.code} - ${selectedBankAccount.name}` : ''} disabled className="w-full border rounded px-3 py-2 bg-gray-100" /></div>
            <div><label className="block text-sm font-medium mb-1">Numero de Cheque *</label><input type="text" value={form.check_number} onChange={e => setForm(p => ({...p, check_number: e.target.value}))} className="w-full border rounded px-3 py-2" required /></div>
          </div>
          <div><label className="block text-sm font-medium mb-2">Tipo de Pago *</label><div className="flex gap-4"><label className="flex items-center"><input type="radio" checked={form.payment_type === 'accounts_payable'} onChange={() => { setForm(p => ({...p, payment_type: 'accounts_payable', supplier_id: '', payee_name: '', account_id: '', destination_bank_id: '', amount: '', description: ''})); setSelectedInvoices(new Map()); }} className="mr-2" /><span className="text-sm">Cuentas por Pagar (CxP)</span></label><label className="flex items-center"><input type="radio" checked={form.payment_type === 'cash'} onChange={() => { setForm(p => ({...p, payment_type: 'cash', supplier_id: '', payee_name: '', account_id: '', destination_bank_id: '', amount: '', description: ''})); setSelectedInvoices(new Map()); }} className="mr-2" /><span className="text-sm">Pago de Contado</span></label><label className="flex items-center"><input type="radio" checked={form.payment_type === 'internal_transfer'} onChange={() => { setForm(p => ({...p, payment_type: 'internal_transfer', supplier_id: '', payee_name: '', account_id: '', destination_bank_id: '', amount: '', description: ''})); setSelectedInvoices(new Map()); }} className="mr-2" /><span className="text-sm">Transferencia Interna</span></label></div></div>
          {form.payment_type === 'accounts_payable' && <div className="space-y-4 border-t pt-4"><div><label className="block text-sm font-medium mb-1">Suplidor *</label><select value={form.supplier_id} onChange={e => { setForm(p => ({...p, supplier_id: e.target.value})); setSelectedInvoices(new Map()); }} className="w-full border rounded px-3 py-2" required><option value="">Seleccione...</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>{form.supplier_id && pendingInvoices.length > 0 && <div><label className="block text-sm font-medium mb-2">Facturas Pendientes</label><div className="border rounded overflow-hidden"><table className="min-w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left">Sel.</th><th className="px-4 py-2 text-left">Factura</th><th className="px-4 py-2 text-right">Saldo</th><th className="px-4 py-2 text-right">Pagar</th></tr></thead><tbody>{pendingInvoices.map(inv => { const sel = selectedInvoices.has(inv.id); const amt = selectedInvoices.get(inv.id) || inv.balance; return <tr key={inv.id}><td className="px-4 py-2"><input type="checkbox" checked={sel} onChange={e => { const next = new Map(selectedInvoices); if (e.target.checked) next.set(inv.id, inv.balance); else next.delete(inv.id); setSelectedInvoices(next); }} /></td><td className="px-4 py-2">{inv.invoice_number}</td><td className="px-4 py-2 text-right">{formatAmount(inv.balance)}</td><td className="px-4 py-2">{sel && <input type="number" min="0" max={inv.balance} step="0.01" value={amt} onChange={e => { const next = new Map(selectedInvoices); next.set(inv.id, parseFloat(e.target.value) || 0); setSelectedInvoices(next); }} className="w-full border rounded px-2 py-1 text-right" />}</td></tr>; })}</tbody></table></div></div>}</div>}
          {form.payment_type === 'cash' && <div className="grid grid-cols-2 gap-4 border-t pt-4"><div><label className="block text-sm font-medium mb-1">Beneficiario *</label><input type="text" value={form.payee_name} onChange={e => setForm(p => ({...p, payee_name: e.target.value}))} className="w-full border rounded px-3 py-2" required /></div><div><label className="block text-sm font-medium mb-1">Cuenta a Cargar *</label><select value={form.account_id} onChange={e => setForm(p => ({...p, account_id: e.target.value}))} className="w-full border rounded px-3 py-2" required><option value="">Seleccione...</option>{accounts.filter(a => a.type === 'expense' || a.type === 'asset' || a.type === 'liability').map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></div><div><label className="block text-sm font-medium mb-1">Monto *</label><input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(p => ({...p, amount: e.target.value}))} className="w-full border rounded px-3 py-2" required /></div></div>}
          {form.payment_type === 'internal_transfer' && <div className="grid grid-cols-2 gap-4 border-t pt-4"><div><label className="block text-sm font-medium mb-1">Banco Destino *</label><select value={form.destination_bank_id} onChange={e => setForm(p => ({...p, destination_bank_id: e.target.value}))} className="w-full border rounded px-3 py-2" required><option value="">Seleccione...</option>{banks.filter(b => b.id !== form.bank_id).map(b => <option key={b.id} value={b.id}>{b.bank_name}</option>)}</select></div><div><label className="block text-sm font-medium mb-1">Cuenta Destino</label><input type="text" value={destinationBankAccount ? `${destinationBankAccount.code} - ${destinationBankAccount.name}` : ''} disabled className="w-full border rounded px-3 py-2 bg-gray-100" /></div><div><label className="block text-sm font-medium mb-1">Monto *</label><input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(p => ({...p, amount: e.target.value}))} className="w-full border rounded px-3 py-2" required /></div></div>}
          <div><label className="block text-sm font-medium mb-1">Descripcion / Concepto</label><textarea value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} className="w-full border rounded px-3 py-2" rows={2} /></div>
          {form.payment_type === 'accounts_payable' && <div><label className="block text-sm font-medium mb-1">Total</label><input type="text" value={` ${formatAmount(parseFloat(form.amount) || 0)}`} disabled className="w-full border rounded px-3 py-2 bg-gray-100 font-bold" /></div>}
          <div className="flex justify-end gap-3"><button type="button" onClick={() => { setForm({ bank_id: '', check_number: '', payment_type: 'cash', supplier_id: '', payee_name: '', account_id: '', destination_bank_id: '', amount: '', description: '' }); setSelectedInvoices(new Map()); }} className="px-4 py-2 border rounded">Cancelar</button><button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">{loading ? 'Procesando...' : 'Registrar Cheque'}</button></div>
        </form>
        <div className="bg-white rounded-lg shadow border overflow-hidden"><div className="px-4 py-3 border-b bg-gray-50"><h2 className="text-lg font-semibold">Cheques Registrados</h2></div>{checks.length === 0 ? <div className="p-6 text-center text-gray-500">No hay cheques registrados</div> : <table className="min-w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left">Fecha</th><th className="px-4 py-2 text-left">Numero</th><th className="px-4 py-2 text-left">Banco</th><th className="px-4 py-2 text-left">Tipo</th><th className="px-4 py-2 text-left">Beneficiario</th><th className="px-4 py-2 text-right">Monto</th><th className="px-4 py-2 text-left">Estado</th></tr></thead><tbody>{checks.map(c => { const bank = banks.find(b => b.id === c.bank_id); return <tr key={c.id}><td className="px-4 py-2">{c.check_date}</td><td className="px-4 py-2">{c.check_number}</td><td className="px-4 py-2">{bank?.bank_name || '-'}</td><td className="px-4 py-2">{c.payment_type === 'accounts_payable' ? 'CxP' : c.payment_type === 'cash' ? 'Contado' : 'Transf. Interna'}</td><td className="px-4 py-2">{c.payee_name || '-'}</td><td className="px-4 py-2 text-right">{c.currency} {formatAmount(c.amount)}</td><td className="px-4 py-2"><span className={`px-2 py-1 text-xs rounded ${c.status === 'issued' ? 'bg-blue-100 text-blue-800' : c.status === 'cleared' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{c.status === 'issued' ? 'Emitido' : c.status === 'cleared' ? 'Cobrado' : c.status}</span></td></tr>; })}</tbody></table>}</div>
      </div>
    </DashboardLayout>
  );
}