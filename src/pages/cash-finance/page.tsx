import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { resolveTenantId, settingsService, cashFinanceService } from '../../services/database';
import { supabase } from '../../lib/supabase';

type CashFinanceTab = 'open-close' | 'petty-cash' | 'expenses' | 'income' | 'accounts-payable' | 'reports';

interface CashRegister {
  id: string;
  name: string;
  is_active: boolean;
  created_at?: string;
}

interface CashShift {
  id: string;
  register_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  status: 'open' | 'closed';
  notes: string | null;
}

interface Denomination {
  value: number;
  qty: number;
}

interface ShiftMovement {
  id: string;
  type: 'in' | 'out';
  amount: number;
  description: string;
  created_at: string;
}

interface ClosedShiftHistoryItem {
  id: string;
  opened_at: string;
  closed_at: string;
  opening_cash: number;
  closing_cash: number;
  difference: number;
  notes: string;
}

interface PettyCashItem {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'in' | 'out';
  category: string;
  created_at?: string;
}

interface ExpenseItem {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  vendor: string;
  status: 'pending' | 'paid';
}

interface IncomeItem {
  id: string;
  date: string;
  description: string;
  amount: number;
  source: string;
  category: string;
}

interface AccountPayable {
  id: string;
  vendor: string;
  description: string;
  amount: number;
  due_date: string;
  status: 'pending' | 'paid' | 'overdue';
}

const DEFAULT_DENOMINATIONS: Denomination[] = [
  { value: 100, qty: 0 },
  { value: 50, qty: 0 },
  { value: 20, qty: 0 },
  { value: 10, qty: 0 },
  { value: 5, qty: 0 },
  { value: 1, qty: 0 },
  { value: 0.25, qty: 0 },
  { value: 0.10, qty: 0 },
  { value: 0.05, qty: 0 },
  { value: 0.01, qty: 0 },
];

export default function CashFinancePage() {
  const { user } = useAuth();
  const location = useLocation();

  const getTabFromPath = (): CashFinanceTab => {
    if (location.pathname.includes('/petty-cash')) return 'petty-cash';
    if (location.pathname.includes('/expenses')) return 'expenses';
    if (location.pathname.includes('/income')) return 'income';
    if (location.pathname.includes('/reports')) return 'reports';
    return 'open-close';
  };

  const [activeTab, setActiveTab] = useState<CashFinanceTab>(getTabFromPath());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Stats
  const [cashOnHand, setCashOnHand] = useState(0);
  const [shiftIncome, setShiftIncome] = useState(0);
  const [shiftOutflows, setShiftOutflows] = useState(0);

  // Registers & Shifts
  const [_registers, setRegisters] = useState<CashRegister[]>([]);
  const [selectedRegisterId, setSelectedRegisterId] = useState<string>('');
  const [currentShift, setCurrentShift] = useState<CashShift | null>(null);

  // Denominations for closing
  const [denominations, setDenominations] = useState<Denomination[]>(DEFAULT_DENOMINATIONS);
  const [closingNotes, setClosingNotes] = useState('');

  // Opening
  const [openingAmount, setOpeningAmount] = useState<string>('');
  const [showOpenRegisterModal, setShowOpenRegisterModal] = useState(false);
  const [openRegisterAmount, setOpenRegisterAmount] = useState<number>(0);

  // Close confirmation
  const [showCloseConfirmModal, setShowCloseConfirmModal] = useState(false);

  // Movements
  const [movements, setMovements] = useState<ShiftMovement[]>([]);

  // Closed shift history
  const [closedShifts, setClosedShifts] = useState<ClosedShiftHistoryItem[]>([]);

  // Petty Cash
  const [pettyCashItems, setPettyCashItems] = useState<PettyCashItem[]>([]);
  const [pettyCashBalance, setPettyCashBalance] = useState(0);
  const [showPettyCashModal, setShowPettyCashModal] = useState(false);
  const [pettyCashForm, setPettyCashForm] = useState({ description: '', amount: 0, type: 'out' as 'in' | 'out', category: 'Office Supplies' });

  // Expenses
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: 0, category: 'Operations', vendor: '', status: 'pending' as 'pending' | 'paid' });

  // Income
  const [incomeItems, setIncomeItems] = useState<IncomeItem[]>([]);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [incomeForm, setIncomeForm] = useState({ description: '', amount: 0, source: '', category: 'Other Income' });

  // Accounts Payable
  const [accountsPayable, setAccountsPayable] = useState<AccountPayable[]>([]);
  const [showAPModal, setShowAPModal] = useState(false);
  const [apForm, setAPForm] = useState({ vendor: '', description: '', amount: 0, due_date: '', status: 'pending' as 'pending' | 'paid' | 'overdue' });

  useEffect(() => {
    setActiveTab(getTabFromPath());
  }, [location.pathname]);

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  useEffect(() => {
    if (!selectedRegisterId || !user?.id) return;
    (async () => {
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return;
      await loadShiftForRegister(selectedRegisterId);
      await loadClosedShiftHistory(tenantId, selectedRegisterId);
    })();
  }, [selectedRegisterId]);

  const loadClosedShiftHistory = async (tenantId: string, registerId: string) => {
    try {
      const { data: shifts, error } = await supabase
        .from('cash_shifts')
        .select('id, opened_at, closed_at, opening_cash, closing_cash, notes')
        .eq('tenant_id', tenantId)
        .eq('register_id', registerId)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const shiftRows = (shifts || []).filter((s: any) => s.closed_at) as any[];
      const shiftIds = shiftRows.map((s) => s.id);

      let closingTxByShift = new Map<string, { type: 'in' | 'out'; amount: number }>();
      if (shiftIds.length > 0) {
        const { data: txs, error: txErr } = await supabase
          .from('cash_shift_transactions')
          .select('shift_id, type, amount, description')
          .eq('tenant_id', tenantId)
          .in('shift_id', shiftIds);

        if (txErr) throw txErr;

        (txs || []).forEach((tx: any) => {
          const desc = String(tx.description || '');
          if (!desc.startsWith('Shift closed.')) return;
          const shiftId = String(tx.shift_id);
          if (closingTxByShift.has(shiftId)) return;
          closingTxByShift.set(shiftId, { type: tx.type, amount: Number(tx.amount) || 0 });
        });
      }

      setClosedShifts(
        shiftRows.map((s: any) => {
          const closingTx = closingTxByShift.get(String(s.id));
          const signedDiff = closingTx ? (closingTx.type === 'in' ? closingTx.amount : -closingTx.amount) : 0;
          return {
            id: s.id,
            opened_at: s.opened_at,
            closed_at: s.closed_at,
            opening_cash: Number(s.opening_cash) || 0,
            closing_cash: Number(s.closing_cash) || 0,
            difference: signedDiff,
            notes: s.notes || '',
          };
        })
      );
    } catch (error) {
      console.error('Error loading closed shift history:', error);
      setClosedShifts([]);
    }
  };

  const pickMainRegister = (regs: CashRegister[]) => {
    if (!regs || regs.length === 0) return null;

    const parseRegNumber = (name: string) => {
      const match = String(name || '').match(/(\d+)/);
      return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
    };

    const preferred = regs
      .slice()
      .sort((a, b) => {
        const aN = parseRegNumber(a.name);
        const bN = parseRegNumber(b.name);
        if (aN !== bN) return aN - bN;
        const aC = a.created_at ? new Date(a.created_at).getTime() : Number.POSITIVE_INFINITY;
        const bC = b.created_at ? new Date(b.created_at).getTime() : Number.POSITIVE_INFINITY;
        return aC - bC;
      });

    return preferred[0] || regs[0];
  };

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [regs, assignments] = await Promise.all([
        settingsService.getCashRegisters(),
        settingsService.getUserCashRegisterAssignments(),
      ]);

      const list = (regs as CashRegister[]) || [];
      const assigned = (assignments || []).find((a: any) => String(a.user_id) === String(user.id));
      const assignedRegisterId = assigned?.cash_register_id ? String(assigned.cash_register_id) : '';
      const assignedRegister = assignedRegisterId
        ? list.find((r) => String(r.id) === String(assignedRegisterId))
        : null;

      const main = assignedRegister || pickMainRegister(list);
      if (main) {
        setRegisters([main]);
        setSelectedRegisterId(main.id);
      } else {
        setRegisters([]);
        setSelectedRegisterId('');
        setMessage({ type: 'error', text: 'No cash register configured. Please create/assign a register in Settings.' });
      }

      // Load all finance data
      const [pettyCash, expensesData, incomeData, apData] = await Promise.all([
        cashFinanceService.getPettyCash(user.id),
        cashFinanceService.getExpenses(user.id),
        cashFinanceService.getIncome(user.id),
        cashFinanceService.getAccountsPayable(user.id),
      ]);

      const mappedPettyCash = (pettyCash || []).map((p: any) => ({
        id: p.id,
        date: p.date,
        description: p.description,
        amount: Number(p.amount) || 0,
        type: p.type as 'in' | 'out',
        category: p.category,
        created_at: p.created_at,
      }));
      setPettyCashItems(mappedPettyCash);
      setPettyCashBalance(mappedPettyCash.reduce((sum, p) => p.type === 'in' ? sum + p.amount : sum - p.amount, 0));

      setExpenses((expensesData || []).map((e: any) => ({
        id: e.id,
        date: e.date,
        description: e.description,
        amount: Number(e.amount) || 0,
        category: e.category,
        vendor: e.vendor || '',
        status: e.status as 'pending' | 'paid',
      })));

      setIncomeItems((incomeData || []).map((i: any) => ({
        id: i.id,
        date: i.date,
        description: i.description,
        amount: Number(i.amount) || 0,
        source: i.source || '',
        category: i.category,
      })));

      setAccountsPayable((apData || []).map((a: any) => ({
        id: a.id,
        vendor: a.vendor,
        description: a.description || '',
        amount: Number(a.amount) || 0,
        due_date: a.due_date,
        status: a.status as 'pending' | 'paid' | 'overdue',
      })));
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePettyCash = async () => {
    if (!user?.id) return;
    try {
      const date = new Date().toISOString().slice(0, 10);
      const saved = await cashFinanceService.savePettyCash(user.id, { ...pettyCashForm, date });
      setPettyCashItems(items => [...items, { id: String((saved as any)?.id || `PC-${Date.now()}`), date, ...pettyCashForm, created_at: (saved as any)?.created_at || new Date().toISOString() }]);
      setPettyCashBalance(b => pettyCashForm.type === 'in' ? b + pettyCashForm.amount : b - pettyCashForm.amount);

      if (currentShift?.id && pettyCashForm.amount > 0) {
        const tenantId = await resolveTenantId(user.id);
        if (!tenantId) throw new Error('Tenant not found');
        const { error: txError } = await supabase
          .from('cash_shift_transactions')
          .insert({
            tenant_id: tenantId,
            shift_id: currentShift.id,
            type: pettyCashForm.type,
            amount: Number(pettyCashForm.amount) || 0,
            description: `[Petty Cash] ${pettyCashForm.category}: ${pettyCashForm.description}`,
          });

        if (txError) throw txError;
        await loadShiftStats(tenantId, currentShift);
        await loadShiftMovements(tenantId, currentShift.id);
      }

      setPettyCashForm({ description: '', amount: 0, type: 'out', category: 'Office Supplies' });
      setShowPettyCashModal(false);
      setMessage({ type: 'success', text: 'Petty cash saved' });
    } catch (error) {
      console.error('Error saving petty cash:', error);
      setMessage({ type: 'error', text: 'Error saving petty cash' });
    }
  };

  const handleSaveExpense = async () => {
    if (!user?.id) return;
    try {
      const date = new Date().toISOString().slice(0, 10);
      const saved = await cashFinanceService.saveExpense(user.id, { ...expenseForm, date });
      setExpenses(items => [...items, { id: String((saved as any)?.id || `EXP-${Date.now()}`), date, ...expenseForm }]);

      if (currentShift?.id && expenseForm.amount > 0) {
        const tenantId = await resolveTenantId(user.id);
        if (!tenantId) throw new Error('Tenant not found');
        const { error: txError } = await supabase
          .from('cash_shift_transactions')
          .insert({
            tenant_id: tenantId,
            shift_id: currentShift.id,
            type: 'out',
            amount: Number(expenseForm.amount) || 0,
            description: `[Expense] ${expenseForm.category}${expenseForm.vendor ? ` - ${expenseForm.vendor}` : ''}: ${expenseForm.description}`,
          });

        if (txError) throw txError;
        await loadShiftStats(tenantId, currentShift);
        await loadShiftMovements(tenantId, currentShift.id);
      }

      setExpenseForm({ description: '', amount: 0, category: 'Operations', vendor: '', status: 'pending' });
      setShowExpenseModal(false);
      setMessage({ type: 'success', text: 'Expense saved' });
    } catch (error) {
      console.error('Error saving expense:', error);
      setMessage({ type: 'error', text: 'Error saving expense' });
    }
  };

  const handleSaveIncome = async () => {
    if (!user?.id) return;
    try {
      const date = new Date().toISOString().slice(0, 10);
      const saved = await cashFinanceService.saveIncome(user.id, { ...incomeForm, date });
      setIncomeItems(items => [...items, { id: String((saved as any)?.id || `INC-${Date.now()}`), date, ...incomeForm }]);

      if (currentShift?.id && incomeForm.amount > 0) {
        const tenantId = await resolveTenantId(user.id);
        if (!tenantId) throw new Error('Tenant not found');
        const { error: txError } = await supabase
          .from('cash_shift_transactions')
          .insert({
            tenant_id: tenantId,
            shift_id: currentShift.id,
            type: 'in',
            amount: Number(incomeForm.amount) || 0,
            description: `[Income] ${incomeForm.category}${incomeForm.source ? ` - ${incomeForm.source}` : ''}: ${incomeForm.description}`,
          });

        if (txError) throw txError;
        await loadShiftStats(tenantId, currentShift);
        await loadShiftMovements(tenantId, currentShift.id);
      }

      setIncomeForm({ description: '', amount: 0, source: '', category: 'Other Income' });
      setShowIncomeModal(false);
      setMessage({ type: 'success', text: 'Income saved' });
    } catch (error) {
      console.error('Error saving income:', error);
      setMessage({ type: 'error', text: 'Error saving income' });
    }
  };

  const handleSaveAccountPayable = async () => {
    if (!user?.id) return;
    try {
      await cashFinanceService.saveAccountPayable(user.id, apForm);
      setAccountsPayable(items => [...items, { id: `AP-${Date.now()}`, ...apForm }]);
      setAPForm({ vendor: '', description: '', amount: 0, due_date: '', status: 'pending' });
      setShowAPModal(false);
      setMessage({ type: 'success', text: 'Account payable saved' });
    } catch (error) {
      console.error('Error saving account payable:', error);
      setMessage({ type: 'error', text: 'Error saving account payable' });
    }
  };

  const handleMarkAPPaid = async (id: string) => {
    try {
      await cashFinanceService.updateAccountPayableStatus(id, 'paid');
      setAccountsPayable(items => items.map(i => i.id === id ? { ...i, status: 'paid' } : i));
      setMessage({ type: 'success', text: 'Marked as paid' });
    } catch (error) {
      console.error('Error updating status:', error);
      setMessage({ type: 'error', text: 'Error updating status' });
    }
  };

  const handleExportPDF = async () => {
    const jsPDF = (await import('jspdf')).default;
    await import('jspdf-autotable');
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Cash & Finance Report', 14, 22);
    doc.setFontSize(11);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);

    let yPos = 40;

    // Summary
    doc.setFontSize(14);
    doc.text('Summary', 14, yPos);
    yPos += 8;
    doc.setFontSize(10);
    doc.text(`Cash on Hand: ${formatCurrency(cashOnHand)}`, 14, yPos);
    doc.text(`Petty Cash Balance: ${formatCurrency(pettyCashBalance)}`, 100, yPos);
    yPos += 6;
    doc.text(`Total Expenses: ${formatCurrency(expenses.reduce((s, e) => s + e.amount, 0))}`, 14, yPos);
    doc.text(`Total Income: ${formatCurrency(incomeItems.reduce((s, i) => s + i.amount, 0))}`, 100, yPos);
    yPos += 12;

    // Expenses table
    if (expenses.length > 0) {
      doc.setFontSize(12);
      doc.text('Expenses', 14, yPos);
      yPos += 4;
      (doc as any).autoTable({
        startY: yPos,
        head: [['Date', 'Vendor', 'Category', 'Description', 'Status', 'Amount']],
        body: expenses.map(e => [e.date, e.vendor, e.category, e.description, e.status, formatCurrency(e.amount)]),
        theme: 'striped',
        headStyles: { fillColor: [59, 74, 42] },
        styles: { fontSize: 8 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // Accounts Payable table
    if (accountsPayable.length > 0) {
      doc.setFontSize(12);
      doc.text('Accounts Payable', 14, yPos);
      yPos += 4;
      (doc as any).autoTable({
        startY: yPos,
        head: [['Vendor', 'Description', 'Due Date', 'Status', 'Amount']],
        body: accountsPayable.map(a => [a.vendor, a.description, a.due_date, a.status, formatCurrency(a.amount)]),
        theme: 'striped',
        headStyles: { fillColor: [59, 74, 42] },
        styles: { fontSize: 8 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // Cash Flow Summary
    const inflows = shiftIncome + incomeItems.reduce((s, i) => s + i.amount, 0) + pettyCashItems.filter(p => p.type === 'in').reduce((s, p) => s + p.amount, 0);
    const outflows = shiftOutflows + expenses.reduce((s, e) => s + e.amount, 0) + pettyCashItems.filter(p => p.type === 'out').reduce((s, p) => s + p.amount, 0);
    
    doc.setFontSize(12);
    doc.text('Cash Flow Summary', 14, yPos);
    yPos += 8;
    doc.setFontSize(10);
    doc.text(`Inflows: ${formatCurrency(inflows)}`, 14, yPos);
    doc.text(`Outflows: ${formatCurrency(outflows)}`, 80, yPos);
    doc.text(`Net: ${formatCurrency(inflows - outflows)}`, 146, yPos);

    doc.save('cash-finance-report.pdf');
    setMessage({ type: 'success', text: 'PDF downloaded' });
  };

  const loadCashSalesForShift = async (tenantId: string, shift: CashShift) => {
    const startTs = shift.opened_at || new Date().toISOString();
    const endTs = shift.closed_at || new Date().toISOString();

    const { data, error } = await supabase
      .from('receipts')
      .select('amount, receipt_date, payment_method, status, created_at')
      .eq('user_id', tenantId)
      .gte('created_at', startTs)
      .lte('created_at', endTs)
      .neq('status', 'void')
      .or('payment_method.ilike.*cash*,payment_method.ilike.*efectivo*');

    if (error) throw error;
    return (data || []).reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);
  };

  const loadShiftForRegister = async (registerId: string) => {
    if (!user?.id) return;
    try {
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return;

      // Check for open shift
      const { data: shifts, error } = await supabase
        .from('cash_shifts')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('register_id', registerId)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (shifts && shifts.length > 0) {
        const shift = shifts[0] as CashShift;
        setCurrentShift(shift);
        await loadShiftStats(tenantId, shift);
        await loadShiftMovements(tenantId, shift.id);
      } else {
        setCurrentShift(null);
        setCashOnHand(0);
        setShiftIncome(0);
        setShiftOutflows(0);
        setMovements([]);
      }
    } catch (error) {
      console.error('Error loading shift:', error);
    }
  };

  const loadShiftStats = async (tenantId: string, shift: CashShift) => {
    try {
      const { data: txs, error } = await supabase
        .from('cash_shift_transactions')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('shift_id', shift.id);

      if (error) throw error;

      let manualIn = 0;
      let manualOut = 0;

      (txs || []).forEach((tx: any) => {
        if (tx.type === 'in') {
          manualIn += Number(tx.amount) || 0;
        } else {
          manualOut += Number(tx.amount) || 0;
        }
      });

      const cashSales = await loadCashSalesForShift(tenantId, shift);

      // Shift income (UI) should represent cash sales only
      setShiftIncome(cashSales);
      setShiftOutflows(manualOut);

      // Expected / Cash on hand = opening + cash sales + manual in - manual out
      const opening = Number(shift.opening_cash) || 0;
      setCashOnHand(opening + cashSales + manualIn - manualOut);
    } catch (error) {
      console.error('Error loading shift stats:', error);
    }
  };

  const loadShiftMovements = async (tenantId: string, shiftId: string) => {
    try {
      const { data, error } = await supabase
        .from('cash_shift_transactions')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('shift_id', shiftId)
        .order('created_at', { ascending: false })
        .limit(2000);

      if (error) throw error;

      setMovements((data || []).map((tx: any) => ({
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount) || 0,
        description: tx.description || '',
        created_at: tx.created_at,
      })));
    } catch (error) {
      console.error('Error loading movements:', error);
    }
  };

  const handleOpenRegister = async (amountOverride?: number) => {
    if (!user?.id || !selectedRegisterId) return;
    setLoading(true);
    try {
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('Tenant not found');

      const opening = typeof amountOverride === 'number' ? amountOverride : openingAmountValue;

      const { error } = await supabase
        .from('cash_shifts')
        .insert({
          tenant_id: tenantId,
          register_id: selectedRegisterId,
          opened_at: new Date().toISOString(),
          opening_cash: opening,
          status: 'open',
        })
        .select()
        .single();

      if (error) throw error;

      // Reload from DB so stats/movements are consistent
      await loadShiftForRegister(selectedRegisterId);
      await loadClosedShiftHistory(tenantId, selectedRegisterId);
      setOpeningAmount(String(opening));
      setMessage({ type: 'success', text: 'Register opened successfully' });
    } catch (error) {
      console.error('Error opening register:', error);
      setMessage({ type: 'error', text: 'Error opening register' });
    } finally {
      setLoading(false);
    }
  };

  const countedCashTotal = denominations.reduce((sum, d) => sum + d.value * d.qty, 0);
  const expectedCash = cashOnHand;
  const difference = countedCashTotal - expectedCash;

  const openingAmountValue = Number(openingAmount) || 0;

  const pettyCashItemsForShift = (() => {
    if (!currentShift?.opened_at) return [] as PettyCashItem[];
    const startTs = new Date(currentShift.opened_at).getTime();
    return pettyCashItems.filter((p) => {
      const raw = p.created_at || (p.date ? `${p.date}T00:00:00` : '');
      const t = raw ? new Date(raw).getTime() : 0;
      return t >= startTs;
    });
  })();

  const pettyCashBalanceForShift = pettyCashItemsForShift.reduce(
    (sum, p) => (p.type === 'in' ? sum + p.amount : sum - p.amount),
    0
  );

  const handleCloseRegister = async () => {
    if (!user?.id || !currentShift) return;
    setLoading(true);
    try {
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) throw new Error('Tenant not found');
      const { error } = await supabase
        .from('cash_shifts')
        .update({
          closed_at: new Date().toISOString(),
          closing_cash: countedCashTotal,
          status: 'closed',
          notes: closingNotes || null,
        })
        .eq('id', currentShift.id)
        .eq('tenant_id', tenantId);

      if (error) throw error;

      const closeTxType: 'in' | 'out' = difference >= 0 ? 'in' : 'out';
      const closeTxAmount = Math.abs(difference);
      const closeTxDescription = `Shift closed. Counted: ${countedCashTotal.toFixed(2)} Expected: ${expectedCash.toFixed(2)} Difference: ${difference.toFixed(2)}`;

      const { error: closeTxError } = await supabase
        .from('cash_shift_transactions')
        .insert({
          tenant_id: tenantId,
          shift_id: currentShift.id,
          type: closeTxType,
          amount: closeTxAmount,
          description: closeTxDescription,
        });

      if (closeTxError) throw closeTxError;

      await loadShiftMovements(tenantId, currentShift.id);

      if (selectedRegisterId) {
        await loadClosedShiftHistory(tenantId, selectedRegisterId);
      }

      // Prepare the next opening amount with the last counted cash
      setOpeningAmount(String(countedCashTotal));

      setCurrentShift(null);
      setDenominations(DEFAULT_DENOMINATIONS);
      setClosingNotes('');
      setCashOnHand(0);
      setShiftIncome(0);
      setShiftOutflows(0);
      setMovements([]);
      setMessage({ type: 'success', text: 'Register closed successfully' });
    } catch (error) {
      console.error('Error closing register:', error);
      setMessage({ type: 'error', text: 'Error closing register' });
    } finally {
      setLoading(false);
    }
  };

  const updateDenomQty = (value: number, qty: number) => {
    setDenominations(prev => prev.map(d => d.value === value ? { ...d, qty: Math.max(0, qty) } : d));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const tabs: { id: CashFinanceTab; label: string }[] = [
    { id: 'open-close', label: 'Open/Close' },
    { id: 'petty-cash', label: 'Petty Cash' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'income', label: 'Income' },
    { id: 'accounts-payable', label: 'Accounts Payable' },
    { id: 'reports', label: 'Reports' },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#1F2618]">Cash & Finance</h1>
          <p className="text-gray-500 text-sm">Cash and finance control</p>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {message.text}
            <button onClick={() => setMessage(null)} className="float-right text-lg leading-none">&times;</button>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Cash on hand</p>
              <p className="text-2xl font-bold text-[#1F2618]">{formatCurrency(cashOnHand)}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <i className="ri-money-dollar-circle-line text-2xl text-blue-600"></i>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Shift income</p>
              <p className="text-2xl font-bold text-[#1F2618]">{formatCurrency(shiftIncome)}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <i className="ri-money-dollar-circle-line text-2xl text-green-600"></i>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Shift outflows</p>
              <p className="text-2xl font-bold text-[#1F2618]">{formatCurrency(shiftOutflows)}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <i className="ri-money-dollar-circle-line text-2xl text-red-600"></i>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#3B4A2A] text-[#3B4A2A]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Open/Close Tab */}
        {activeTab === 'open-close' && (
          <div className="space-y-6">
            {/* Open and Close Register */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#1F2618]">Open and Close Register</h2>
                  {currentShift && (
                    <p className="text-sm text-gray-500">
                      Shift started: {new Date(currentShift.opened_at).toLocaleString()}
                    </p>
                  )}
                </div>

                {!currentShift && (
                  <button
                    onClick={() => {
                      const hasValue = String(openingAmount || '').trim() !== '';
                      if (hasValue) {
                        handleOpenRegister(openingAmountValue);
                        return;
                      }
                      setOpenRegisterAmount(0);
                      setShowOpenRegisterModal(true);
                    }}
                    disabled={loading || !selectedRegisterId}
                    className="px-4 py-2 bg-[#3B4A2A] text-white rounded-lg hover:bg-[#2D3B1E] disabled:opacity-50 text-sm font-medium"
                  >
                    Register open
                  </button>
                )}
              </div>

              {showOpenRegisterModal && !currentShift && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl p-6 w-full max-w-sm">
                    <h3 className="text-lg font-semibold mb-2">Open register</h3>
                    <p className="text-sm text-gray-500 mb-4">How much cash are you starting with?</p>
                    <input
                      type="number"
                      value={openRegisterAmount}
                      onChange={(e) => setOpenRegisterAmount(Number(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                      step="0.01"
                      min="0"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2 mt-6">
                      <button
                        onClick={() => setShowOpenRegisterModal(false)}
                        className="px-4 py-2 border rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          setShowOpenRegisterModal(false);
                          await handleOpenRegister(openRegisterAmount);
                        }}
                        className="px-4 py-2 bg-[#3B4A2A] text-white rounded-lg"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-xs text-gray-500">Opening</p>
                  <p className="text-lg font-semibold">{formatCurrency(currentShift?.opening_cash || openingAmountValue)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Sales (cash)</p>
                  <p className="text-lg font-semibold">{formatCurrency(shiftIncome)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Sales (non-cash)</p>
                  <p className="text-lg font-semibold">{formatCurrency(0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Expected cash</p>
                  <p className="text-lg font-semibold">{formatCurrency(expectedCash)}</p>
                </div>
              </div>

              {/* Opening amount if no shift */}
              {!currentShift && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Opening Amount</label>
                  <input
                    type="number"
                    value={openingAmount}
                    onChange={(e) => setOpeningAmount(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm w-40"
                    step="0.01"
                    min="0"
                  />
                </div>
              )}
            </div>

            {/* Close Register Section */}
            {currentShift && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[#1F2618]">Close register</h3>
                    <p className="text-sm text-gray-500">Count cash by denominations and close the shift.</p>
                  </div>
                  <p className="text-sm text-gray-600">Expected: {formatCurrency(expectedCash)}</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: Active shift info */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                      <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-bold">
                        CA
                      </div>
                      <div>
                        <p className="font-medium">Active shift</p>
                        <p className="text-sm text-gray-500">
                          Start: {new Date(currentShift.opened_at).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500">Counted cash</p>
                      <p className="text-3xl font-bold text-[#1F2618]">{formatCurrency(countedCashTotal)}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 border border-gray-200 rounded-lg">
                        <p className="text-xs text-gray-500">Difference</p>
                        <p className={`text-lg font-semibold ${difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(difference)}
                        </p>
                      </div>
                      <div className="p-3 border border-gray-200 rounded-lg">
                        <p className="text-xs text-gray-500">Sales by method</p>
                        <p className="text-lg font-semibold text-gray-400">—</p>
                      </div>
                    </div>
                  </div>

                  {/* Right: Denominations */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium">Denominations</h4>
                      <p className="text-sm text-gray-500">Total: {formatCurrency(countedCashTotal)}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 font-medium px-2">
                        <span>Value</span>
                        <span>Qty</span>
                        <span className="text-right">Total</span>
                      </div>
                      {denominations.map((d) => (
                        <div key={d.value} className="grid grid-cols-3 gap-2 items-center">
                          <span className="text-sm font-medium">{d.value}</span>
                          <input
                            type="number"
                            value={d.qty}
                            onChange={(e) => updateDenomQty(d.value, parseInt(e.target.value) || 0)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm w-20"
                            min="0"
                          />
                          <span className="text-sm text-right">{formatCurrency(d.value * d.qty)}</span>
                        </div>
                      ))}
                      <div className="grid grid-cols-3 gap-2 items-center pt-2 border-t border-gray-200">
                        <span className="font-semibold">Total</span>
                        <span></span>
                        <span className="text-right font-semibold">{formatCurrency(countedCashTotal)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes and actions */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                    <textarea
                      value={closingNotes}
                      onChange={(e) => setClosingNotes(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Counted cash (auto)</label>
                    <input
                      type="text"
                      value={countedCashTotal.toFixed(2)}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                    />
                  </div>
                </div>

                <div className="flex justify-end mt-6">
                  <button
                    onClick={() => {
                      setShowCloseConfirmModal(true);
                    }}
                    disabled={loading}
                    className="px-6 py-2 bg-[#3B4A2A] text-white rounded-lg hover:bg-[#2D3B1E] disabled:opacity-50 text-sm font-medium"
                  >
                    Close register
                  </button>
                </div>

                {showCloseConfirmModal && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-md">
                      <h3 className="text-lg font-semibold mb-2">Confirm close register</h3>
                      <p className="text-sm text-gray-500 mb-4">Please confirm the cash count before closing.</p>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                        <div className="p-3 border border-gray-200 rounded-lg">
                          <p className="text-xs text-gray-500">Expected</p>
                          <p className="text-sm font-semibold text-[#1F2618]">{formatCurrency(expectedCash)}</p>
                        </div>
                        <div className="p-3 border border-gray-200 rounded-lg">
                          <p className="text-xs text-gray-500">Counted</p>
                          <p className="text-sm font-semibold text-[#1F2618]">{formatCurrency(countedCashTotal)}</p>
                        </div>
                        <div className="p-3 border border-gray-200 rounded-lg">
                          <p className="text-xs text-gray-500">Difference</p>
                          <p className={`text-sm font-semibold ${difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(difference)}</p>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 mt-6">
                        <button
                          onClick={() => setShowCloseConfirmModal(false)}
                          className="px-4 py-2 border rounded-lg"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            setShowCloseConfirmModal(false);
                            await handleCloseRegister();
                          }}
                          disabled={loading}
                          className="px-4 py-2 bg-[#3B4A2A] text-white rounded-lg hover:bg-[#2D3B1E] disabled:opacity-50"
                        >
                          Confirm close
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Shift Movements */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[#1F2618]">Shift movements</h3>
                <span className="text-sm text-gray-500">Showing last 2000</span>
              </div>
              {movements.length === 0 ? (
                <p className="text-gray-500 text-sm">No movements yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="py-2 pr-4">Type</th>
                        <th className="py-2 pr-4">Amount</th>
                        <th className="py-2 pr-4">Description</th>
                        <th className="py-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((m) => (
                        <tr key={m.id} className="border-b border-gray-100">
                          <td className="py-2 pr-4">
                            <span className={`text-xs px-2 py-1 rounded ${m.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {m.type === 'in' ? 'Income' : 'Outflow'}
                            </span>
                          </td>
                          <td className="py-2 pr-4">{formatCurrency(m.amount)}</td>
                          <td className="py-2 pr-4">{m.description}</td>
                          <td className="py-2 text-gray-500">{new Date(m.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-md font-semibold text-[#1F2618]">Close history</h4>
                  <span className="text-sm text-gray-500">Last 20</span>
                </div>
                {closedShifts.length === 0 ? (
                  <p className="text-gray-500 text-sm">No closed shifts yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="py-2">Opened</th>
                          <th>Closed</th>
                          <th className="text-right">Opening</th>
                          <th className="text-right">Closing</th>
                          <th className="text-right">Difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {closedShifts.map((s) => (
                          <tr key={s.id} className="border-b border-gray-100">
                            <td className="py-2">{new Date(s.opened_at).toLocaleString()}</td>
                            <td>{new Date(s.closed_at).toLocaleString()}</td>
                            <td className="text-right">{formatCurrency(s.opening_cash)}</td>
                            <td className="text-right">{formatCurrency(s.closing_cash)}</td>
                            <td className={`text-right font-medium ${s.difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(s.difference)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Petty Cash Tab */}
        {activeTab === 'petty-cash' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">Fund Balance</p>
                <p className="text-2xl font-bold text-[#1F2618]">{formatCurrency(pettyCashBalanceForShift)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">Total In</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(pettyCashItemsForShift.filter(i => i.type === 'in').reduce((s, i) => s + i.amount, 0))}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">Total Out</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(pettyCashItemsForShift.filter(i => i.type === 'out').reduce((s, i) => s + i.amount, 0))}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[#1F2618]">Petty Cash Transactions</h2>
                <button onClick={() => setShowPettyCashModal(true)} className="px-4 py-2 bg-[#3B4A2A] text-white rounded-lg hover:bg-[#2D3B1E] text-sm font-medium">
                  <i className="ri-add-line mr-1"></i> Add Transaction
                </button>
              </div>
              {pettyCashItemsForShift.length === 0 ? (
                <p className="text-gray-500 text-sm">No petty cash transactions yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-gray-500 border-b"><th className="py-2">Date</th><th>Type</th><th>Category</th><th>Description</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {pettyCashItemsForShift.map(item => (
                      <tr key={item.id} className="border-b border-gray-100">
                        <td className="py-2">{item.date}</td>
                        <td><span className={`text-xs px-2 py-1 rounded ${item.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.type === 'in' ? 'Fund' : 'Expense'}</span></td>
                        <td>{item.category}</td>
                        <td>{item.description}</td>
                        <td className="text-right">{formatCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {showPettyCashModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl p-6 w-full max-w-md">
                  <h3 className="text-lg font-semibold mb-4">Add Petty Cash Transaction</h3>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <label className="flex items-center"><input type="radio" checked={pettyCashForm.type === 'in'} onChange={() => setPettyCashForm(f => ({ ...f, type: 'in' }))} className="mr-2" /> Fund</label>
                      <label className="flex items-center"><input type="radio" checked={pettyCashForm.type === 'out'} onChange={() => setPettyCashForm(f => ({ ...f, type: 'out' }))} className="mr-2" /> Expense</label>
                    </div>
                    <input type="text" placeholder="Description" value={pettyCashForm.description} onChange={e => setPettyCashForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" />
                    <input type="number" placeholder="Amount" value={pettyCashForm.amount || ''} onChange={e => setPettyCashForm(f => ({ ...f, amount: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg" />
                    <select value={pettyCashForm.category} onChange={e => setPettyCashForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 border rounded-lg">
                      <option>Office Supplies</option><option>Transportation</option><option>Meals</option><option>Miscellaneous</option><option>Fund Replenishment</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 mt-6">
                    <button onClick={() => setShowPettyCashModal(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
                    <button onClick={handleSavePettyCash} className="px-4 py-2 bg-[#3B4A2A] text-white rounded-lg">Save</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Expenses Tab */}
        {activeTab === 'expenses' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">Total Expenses</p>
                <p className="text-2xl font-bold text-[#1F2618]">{formatCurrency(expenses.reduce((s, e) => s + e.amount, 0))}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">Paid</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(expenses.filter(e => e.status === 'paid').reduce((s, e) => s + e.amount, 0))}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">Pending</p>
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(expenses.filter(e => e.status === 'pending').reduce((s, e) => s + e.amount, 0))}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[#1F2618]">Expenses</h2>
                <button onClick={() => setShowExpenseModal(true)} className="px-4 py-2 bg-[#3B4A2A] text-white rounded-lg hover:bg-[#2D3B1E] text-sm font-medium">
                  <i className="ri-add-line mr-1"></i> Add Expense
                </button>
              </div>
              {expenses.length === 0 ? (
                <p className="text-gray-500 text-sm">No expenses recorded yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-gray-500 border-b"><th className="py-2">Date</th><th>Vendor</th><th>Category</th><th>Description</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {expenses.map(exp => (
                      <tr key={exp.id} className="border-b border-gray-100">
                        <td className="py-2">{exp.date}</td>
                        <td>{exp.vendor}</td>
                        <td>{exp.category}</td>
                        <td>{exp.description}</td>
                        <td><span className={`text-xs px-2 py-1 rounded ${exp.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{exp.status}</span></td>
                        <td className="text-right">{formatCurrency(exp.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {showExpenseModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl p-6 w-full max-w-md">
                  <h3 className="text-lg font-semibold mb-4">Add Expense</h3>
                  <div className="space-y-4">
                    <input type="text" placeholder="Vendor" value={expenseForm.vendor} onChange={e => setExpenseForm(f => ({ ...f, vendor: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" />
                    <input type="text" placeholder="Description" value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" />
                    <input type="number" placeholder="Amount" value={expenseForm.amount || ''} onChange={e => setExpenseForm(f => ({ ...f, amount: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg" />
                    <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 border rounded-lg">
                      <option>Operations</option><option>Utilities</option><option>Rent</option><option>Supplies</option><option>Marketing</option><option>Other</option>
                    </select>
                    <select value={expenseForm.status} onChange={e => setExpenseForm(f => ({ ...f, status: e.target.value as 'pending' | 'paid' }))} className="w-full px-3 py-2 border rounded-lg">
                      <option value="pending">Pending</option><option value="paid">Paid</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 mt-6">
                    <button onClick={() => setShowExpenseModal(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
                    <button onClick={handleSaveExpense} className="px-4 py-2 bg-[#3B4A2A] text-white rounded-lg">Save</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Income Tab */}
        {activeTab === 'income' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">Total Additional Income</p>
                <p className="text-2xl font-bold text-[#1F2618]">{formatCurrency(incomeItems.reduce((s, i) => s + i.amount, 0))}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">This Month</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(incomeItems.filter(i => i.date.startsWith(new Date().toISOString().slice(0, 7))).reduce((s, i) => s + i.amount, 0))}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[#1F2618]">Additional Income</h2>
                <button onClick={() => setShowIncomeModal(true)} className="px-4 py-2 bg-[#3B4A2A] text-white rounded-lg hover:bg-[#2D3B1E] text-sm font-medium">
                  <i className="ri-add-line mr-1"></i> Add Income
                </button>
              </div>
              {incomeItems.length === 0 ? (
                <p className="text-gray-500 text-sm">No additional income recorded yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-gray-500 border-b"><th className="py-2">Date</th><th>Source</th><th>Category</th><th>Description</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {incomeItems.map(item => (
                      <tr key={item.id} className="border-b border-gray-100">
                        <td className="py-2">{item.date}</td>
                        <td>{item.source}</td>
                        <td>{item.category}</td>
                        <td>{item.description}</td>
                        <td className="text-right text-green-600 font-medium">{formatCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {showIncomeModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl p-6 w-full max-w-md">
                  <h3 className="text-lg font-semibold mb-4">Add Income</h3>
                  <div className="space-y-4">
                    <input type="text" placeholder="Source" value={incomeForm.source} onChange={e => setIncomeForm(f => ({ ...f, source: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" />
                    <input type="text" placeholder="Description" value={incomeForm.description} onChange={e => setIncomeForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" />
                    <input type="number" placeholder="Amount" value={incomeForm.amount || ''} onChange={e => setIncomeForm(f => ({ ...f, amount: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg" />
                    <select value={incomeForm.category} onChange={e => setIncomeForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 border rounded-lg">
                      <option>Other Income</option><option>Interest</option><option>Refunds</option><option>Commissions</option><option>Rentals</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 mt-6">
                    <button onClick={() => setShowIncomeModal(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
                    <button onClick={handleSaveIncome} className="px-4 py-2 bg-[#3B4A2A] text-white rounded-lg">Save</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Accounts Payable Tab */}
        {activeTab === 'accounts-payable' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">Total Payable</p>
                <p className="text-2xl font-bold text-[#1F2618]">{formatCurrency(accountsPayable.reduce((s, a) => s + a.amount, 0))}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">Pending</p>
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(accountsPayable.filter(a => a.status === 'pending').reduce((s, a) => s + a.amount, 0))}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">Overdue</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(accountsPayable.filter(a => a.status === 'overdue').reduce((s, a) => s + a.amount, 0))}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[#1F2618]">Accounts Payable</h2>
                <button onClick={() => setShowAPModal(true)} className="px-4 py-2 bg-[#3B4A2A] text-white rounded-lg hover:bg-[#2D3B1E] text-sm font-medium">
                  <i className="ri-add-line mr-1"></i> Add Payable
                </button>
              </div>
              {accountsPayable.length === 0 ? (
                <p className="text-gray-500 text-sm">No accounts payable recorded yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-gray-500 border-b"><th className="py-2">Vendor</th><th>Description</th><th>Due Date</th><th>Status</th><th className="text-right">Amount</th><th></th></tr></thead>
                  <tbody>
                    {accountsPayable.map(ap => (
                      <tr key={ap.id} className="border-b border-gray-100">
                        <td className="py-2 font-medium">{ap.vendor}</td>
                        <td>{ap.description}</td>
                        <td>{ap.due_date}</td>
                        <td><span className={`text-xs px-2 py-1 rounded ${ap.status === 'paid' ? 'bg-green-100 text-green-700' : ap.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{ap.status}</span></td>
                        <td className="text-right">{formatCurrency(ap.amount)}</td>
                        <td className="text-right">
                          {ap.status !== 'paid' && <button onClick={() => handleMarkAPPaid(ap.id)} className="text-xs text-green-600 hover:underline">Mark Paid</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {showAPModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl p-6 w-full max-w-md">
                  <h3 className="text-lg font-semibold mb-4">Add Account Payable</h3>
                  <div className="space-y-4">
                    <input type="text" placeholder="Vendor" value={apForm.vendor} onChange={e => setAPForm(f => ({ ...f, vendor: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" />
                    <input type="text" placeholder="Description" value={apForm.description} onChange={e => setAPForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" />
                    <input type="number" placeholder="Amount" value={apForm.amount || ''} onChange={e => setAPForm(f => ({ ...f, amount: Number(e.target.value) }))} className="w-full px-3 py-2 border rounded-lg" />
                    <input type="date" value={apForm.due_date} onChange={e => setAPForm(f => ({ ...f, due_date: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                  <div className="flex justify-end gap-2 mt-6">
                    <button onClick={() => setShowAPModal(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
                    <button onClick={handleSaveAccountPayable} className="px-4 py-2 bg-[#3B4A2A] text-white rounded-lg">Save</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#1F2618]">Cash & Finance Reports</h2>
              <button onClick={handleExportPDF} className="px-4 py-2 bg-[#3B4A2A] text-white rounded-lg hover:bg-[#2D3B1E] text-sm font-medium flex items-center gap-2">
                <i className="ri-file-pdf-line"></i> Download PDF
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">Cash on Hand</p>
                <p className="text-2xl font-bold text-[#1F2618]">{formatCurrency(cashOnHand)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">Petty Cash Balance</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(pettyCashBalance)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">Total Expenses</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(expenses.reduce((s, e) => s + e.amount, 0))}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500">Total Income</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(incomeItems.reduce((s, i) => s + i.amount, 0))}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-[#1F2618] mb-4">Expenses by Category</h3>
                {expenses.length === 0 ? <p className="text-gray-500 text-sm">No data</p> : (
                  <div className="space-y-2">
                    {Object.entries(expenses.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + e.amount; return acc; }, {} as Record<string, number>)).map(([cat, amt]) => (
                      <div key={cat} className="flex justify-between items-center">
                        <span className="text-sm">{cat}</span>
                        <span className="font-medium">{formatCurrency(amt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-[#1F2618] mb-4">Accounts Payable Summary</h3>
                <div className="space-y-3">
                  <div className="flex justify-between"><span className="text-gray-600">Total Payable</span><span className="font-semibold">{formatCurrency(accountsPayable.reduce((s, a) => s + a.amount, 0))}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Paid</span><span className="font-semibold text-green-600">{formatCurrency(accountsPayable.filter(a => a.status === 'paid').reduce((s, a) => s + a.amount, 0))}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Pending</span><span className="font-semibold text-orange-600">{formatCurrency(accountsPayable.filter(a => a.status === 'pending').reduce((s, a) => s + a.amount, 0))}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Overdue</span><span className="font-semibold text-red-600">{formatCurrency(accountsPayable.filter(a => a.status === 'overdue').reduce((s, a) => s + a.amount, 0))}</span></div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-[#1F2618] mb-4">Cash Flow Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-gray-500 mb-2">Inflows</p>
                  <p className="text-xl font-bold text-green-600">{formatCurrency(shiftIncome + incomeItems.reduce((s, i) => s + i.amount, 0) + pettyCashItems.filter(p => p.type === 'in').reduce((s, p) => s + p.amount, 0))}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-2">Outflows</p>
                  <p className="text-xl font-bold text-red-600">{formatCurrency(shiftOutflows + expenses.reduce((s, e) => s + e.amount, 0) + pettyCashItems.filter(p => p.type === 'out').reduce((s, p) => s + p.amount, 0))}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-2">Net Cash Flow</p>
                  <p className={`text-xl font-bold ${(shiftIncome + incomeItems.reduce((s, i) => s + i.amount, 0)) - (shiftOutflows + expenses.reduce((s, e) => s + e.amount, 0)) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency((shiftIncome + incomeItems.reduce((s, i) => s + i.amount, 0) + pettyCashItems.filter(p => p.type === 'in').reduce((s, p) => s + p.amount, 0)) - (shiftOutflows + expenses.reduce((s, e) => s + e.amount, 0) + pettyCashItems.filter(p => p.type === 'out').reduce((s, p) => s + p.amount, 0)))}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
