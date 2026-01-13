  import React, { useState, useEffect, useRef } from 'react';

import { Link } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { exportToExcelWithHeaders } from '../../../utils/exportImportUtils';
import { useAuth } from '../../../hooks/useAuth';
import { useBankCatalog } from '../../../hooks/useBankCatalog';
import {
  pettyCashService,
  chartAccountsService,
  pettyCashCategoriesService,
  suppliersService,
} from '../../../services/database';

interface PettyCashFund {
  id: string;
  name: string;
  location: string;
  custodian: string;
  initialAmount: number;
  currentBalance: number;
  status: 'active' | 'inactive';
  createdAt: string;
  pettyCashAccountId?: string;
  bankAccountId?: string;
}

interface PettyCashExpense {
  id: string;
  fundId: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  receipt: string;
  approvedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  expenseAccountId?: string;
  ncf?: string;
  itbis?: number | null;
  supplierTaxId?: string;
  supplierName?: string;
}

interface PettyCashReimbursement {
  id: string;
  fundId: string;
  date: string;
  amount: number;
  description: string;
  bankAccountId?: string;
}

const PettyCashPage: React.FC = () => {
  const { user } = useAuth();
  const { banks: bankAccounts } = useBankCatalog({
    userId: user?.id || null,
  });

  const [activeTab, setActiveTab] = useState<'funds' | 'expenses' | 'reimbursements' | 'categories'>('funds');

  const [funds, setFunds] = useState<PettyCashFund[]>([]);
  const [expenses, setExpenses] = useState<PettyCashExpense[]>([]);
  const [reimbursements, setReimbursements] = useState<PettyCashReimbursement[]>([]);
  const [showFundModal, setShowFundModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showReimbursementModal, setShowReimbursementModal] = useState(false);

  const [selectedFund, setSelectedFund] = useState<PettyCashFund | null>(null);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any | null>(null);
  const [selectedSupplierTaxId, setSelectedSupplierTaxId] = useState('');

  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  const [loadingFunds, setLoadingFunds] = useState(false);
  const [loadingExpenses, setLoadingExpenses] = useState(false);

  const lowBalanceFunds = funds.filter((fund) => {
    const initial = Number(fund.initialAmount) || 0;
    const current = Number(fund.currentBalance) || 0;
    if (initial <= 0) return false;
    return current <= initial * 0.1;
  });

  useEffect(() => {
    const loadData = async () => {
      if (!user) return;

      try {
        setLoadingFunds(true);
        const [fundsData, accountsData, expensesData, reimbursementsData, categoriesData] = await Promise.all([
          pettyCashService.getFunds(user.id),
          chartAccountsService.getAll(user.id),
          pettyCashService.getExpenses(user.id),
          pettyCashService.getReimbursements(user.id),
          pettyCashCategoriesService.getAll(user.id),
        ]);

        const mappedFunds: PettyCashFund[] = (fundsData || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          location: f.location || '',
          custodian: f.custodian || '',
          initialAmount: Number(f.initial_amount) || 0,
          currentBalance: Number(f.current_balance) || 0,
          status: (f.status as 'active' | 'inactive') || 'active',
          createdAt: f.created_at ? String(f.created_at).split('T')[0] : '',
          pettyCashAccountId: f.petty_cash_account_id || undefined,
          bankAccountId: f.bank_account_id || undefined,
        }));
        setFunds(mappedFunds);

        try {
          const criticalFunds = mappedFunds.filter((fund) => {
            const initial = Number(fund.initialAmount) || 0;
            const current = Number(fund.currentBalance) || 0;
            if (initial <= 0) return false;
            return current <= initial * 0.1;
          });
          if (criticalFunds.length > 0) {
            console.info(`Critical petty cash funds detected: ${criticalFunds.length}`);
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Error evaluando fondos críticos de caja chica:', e);
        }

        setAccounts(accountsData || []);
        setCategories(categoriesData || []);

        const mappedExpenses: PettyCashExpense[] = (expensesData || []).map((e: any) => ({
          id: e.id,
          fundId: e.fund_id,
          date: e.expense_date,
          description: e.description,
          category: e.category || '',
          amount: Number(e.amount) || 0,
          receipt: e.receipt_number || '',
          approvedBy: e.approved_by || '',
          status: (e.status as 'pending' | 'approved' | 'rejected') || 'pending',
          expenseAccountId: e.expense_account_id || undefined,
          ncf: e.ncf || '',
          itbis: e.itbis != null ? Number(e.itbis) : null,
          supplierTaxId: e.supplier_tax_id || '',
          supplierName: e.supplier_name || '',
        }));
        setExpenses(mappedExpenses);

        const mappedReimbursements: PettyCashReimbursement[] = (reimbursementsData || []).map((r: any) => ({
          id: r.id,
          fundId: r.fund_id,
          date: r.reimbursement_date,
          amount: Number(r.amount) || 0,
          description: r.description || '',
          bankAccountId: r.bank_account_id || undefined,
        }));
        setReimbursements(mappedReimbursements);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading petty cash data:', error);
      } finally {
        setLoadingFunds(false);
        setLoadingExpenses(false);
      }
    };

    loadData();
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;

    const loadSuppliers = async () => {
      try {
        const rows = await suppliersService.getAll(user.id);
        setSuppliers(rows || []);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading suppliers for petty cash expenses:', error);
      }
    };

    loadSuppliers();
  }, [user?.id]);

  const handleFundSelection = (fund: PettyCashFund) => {
    setSelectedFund(fund);
    setShowFundModal(true);
  };

  const handleSubmitFund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const formData = new FormData(e.target as HTMLFormElement);
    const name = String(formData.get('name') || '').trim();
    const location = String(formData.get('location') || '').trim();
    const custodian = String(formData.get('custodian') || '').trim();
    const initialAmount = parseFloat(String(formData.get('initialAmount') || '0')) || 0;
    const pettyCashAccountId = String(formData.get('pettyCashAccountId') || '');
    const bankAccountId = String(formData.get('bankAccountId') || '');

    if (!name) {
      alert('Debe indicar el nombre del fondo.');
      return;
    }

    try {
      if (selectedFund) {
        // Edición básica: solo nombre, ubicación y custodio
        const updated = await pettyCashService.updateFund(user.id, selectedFund.id, {
          name,
          location,
          custodian,
        });

        setFunds(prev => prev.map(f => (
          f.id === selectedFund.id
            ? {
                ...f,
                name: updated.name,
                location: updated.location || '',
                custodian: updated.custodian || '',
              }
            : f
        )));
        setSelectedFund(null);
        setShowFundModal(false);
      } else {
        // Creación de fondo (usa cuentas y monto)
        if (!pettyCashAccountId || !bankAccountId) {
          alert('Debe seleccionar la cuenta de Caja Chica y la cuenta de Banco.');
          return;
        }

        const created = await pettyCashService.createFund(user.id, {
          name,
          location,
          custodian,
          initial_amount: initialAmount,
          petty_cash_account_id: pettyCashAccountId,
          bank_account_id: bankAccountId,
        });

        const mapped: PettyCashFund = {
          id: created.id,
          name: created.name,
          location: created.location || '',
          custodian: created.custodian || '',
          initialAmount: Number(created.initial_amount) || 0,
          currentBalance: Number(created.current_balance) || 0,
          status: (created.status as 'active' | 'inactive') || 'active',
          createdAt: created.created_at ? String(created.created_at).split('T')[0] : '',
          pettyCashAccountId: created.petty_cash_account_id || undefined,
          bankAccountId: created.bank_account_id || undefined,
        };

        setFunds(prev => [mapped, ...prev]);
        setShowFundModal(false);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error saving petty cash fund:', error);
      alert('Error al guardar el fondo de caja chica');
    }
  };

  const pettyCashAccounts = accounts.filter((acc) => {
    if (acc.allow_posting === false || acc.type !== 'asset') return false;

    // Caja chica: activo que NO esté marcado explícitamente como banco
    const isFlaggedBank = acc.is_bank_account === true;
    return !isFlaggedBank;
  });

  // bankAccounts state already contains real bank_accounts rows loaded above

  // Cuentas permitidas para gastos de Caja Chica:
  // - Cuentas por cobrar Accionistas
  // - Cuentas por cobrar funcionarios y empleados
  // - Categoría 5 (Costos) -> type 'cost'
  // - Categoría 6 (Gastos) -> type 'expense'
  const expenseAccounts = accounts.filter((acc) => {
    if (acc.allow_posting === false) return false;

    if (acc.type === 'expense' || acc.type === 'cost') return true;

    const name = String(acc.name || '').toLowerCase();
    if (name.includes('cuentas por cobrar accionistas')) return true;
    if (name.includes('cuentas por cobrar funcionarios') || name.includes('cuentas por cobrar empleados')) return true;

    return false;
  });

  const totalReimbursementsByFund: Record<string, number> = reimbursements.reduce((acc, r) => {
    const fundId = r.fundId;
    const amount = Number(r.amount) || 0;
    if (!fundId || amount <= 0) return acc;
    acc[fundId] = (acc[fundId] || 0) + amount;
    return acc;
  }, {} as Record<string, number>);

  const totalExpensesByFund: Record<string, number> = expenses.reduce((acc, e) => {
    const fundId = e.fundId;
    const amount = Number(e.amount) || 0;
    if (!fundId || amount <= 0) return acc;
    if (e.status === 'rejected') return acc;
    acc[fundId] = (acc[fundId] || 0) + amount;
    return acc;
  }, {} as Record<string, number>);

  const getTotalFunds = () => {
    return funds.reduce((sum, fund) => {
      const amount = Number(fund.currentBalance) || 0;
      return sum + amount;
    }, 0);
  };

  const getPendingExpenses = () => {
    return expenses.filter((e) => e.status === 'pending').length;
  };

  const getTotalExpenses = () => {
    return expenses.reduce((sum, e) => {
      if (e.status === 'rejected') return sum;
      const amount = Number(e.amount) || 0;
      if (amount <= 0) return sum;
      return sum + amount;
    }, 0);
  };

  const categoryOptions: { value: string; label: string }[] = (categories || [])
    .map((cat: any) => ({
      value: String(cat.name || ''),
      label: String(cat.name || ''),
    }))
    .filter((opt) => opt.value.trim().length > 0);

  const reimbursementReceiptOptions: string[] = Array.from(
    new Set(
      (expenses || [])
        .map((e) => e.receipt)
        .filter((r): r is string => typeof r === 'string' && r.trim().length > 0),
    ),
  );

  const handleApproveExpense = async (expenseId: string) => {
    if (!window.confirm('Approve this petty cash disbursement?')) return;
    if (!user) return;

    try {
      const updated = await pettyCashService.approveExpense(user.id, expenseId, user.id);

      setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error approving petty cash expense:', error);
      alert('Error approving petty cash disbursement');
    }
  };

  const handleRejectExpense = async (expenseId: string) => {
    if (!window.confirm('Reject this petty cash disbursement?')) return;
    if (!user) return;

    try {
      const updated = await pettyCashService.rejectExpense(user.id, expenseId, user.id);

      setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error rejecting petty cash expense:', error);
      alert('Error rejecting petty cash disbursement');
    }
  };

  const handleCreateExpense = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    const formData = new FormData(event.currentTarget);
    const fundId = String(formData.get('fundId') || '').trim();
    const date =
      String(formData.get('date') || '').trim() || new Date().toISOString().split('T')[0];
    const description = String(formData.get('description') || '').trim();
    const category = String(formData.get('category') || '').trim();
    const amount = parseFloat(String(formData.get('amount') || '0')) || 0;
    const receipt = String(formData.get('receipt') || '').trim();
    const ncf = String(formData.get('ncf') || '').trim();
    const supplierId = String(formData.get('supplierId') || '').trim();
    const itbisRaw = String(formData.get('itbis') || '').trim();
    const expenseAccountId = String(formData.get('expenseAccountId') || '').trim();

    if (!fundId) {
      alert('You must select a petty cash fund.');
      return;
    }
    if (!description || !category || !receipt || !expenseAccountId) {
      alert('Please complete all required disbursement fields.');
      return;
    }
    if (ncf && !supplierId) {
      alert('If you provide an NCF you must select a supplier.');
      return;
    }

    let supplierTaxId: string | null = null;
    let supplierName: string | null = null;
    if (supplierId) {
      const supplierRow = suppliers.find((s: any) => s.id === supplierId);
      if (supplierRow) {
        supplierTaxId = supplierRow.tax_id || null;
        supplierName = (supplierRow.name || supplierRow.legal_name || '') || null;
      }
    }

    const itbis = itbisRaw.length > 0 ? parseFloat(itbisRaw) || 0 : null;

    try {
      const created = await pettyCashService.createExpense(user.id, {
        fund_id: fundId,
        expense_date: date,
        description,
        category,
        amount,
        receipt_number: receipt,
        status: 'pending',
        expense_account_id: expenseAccountId,
        ncf: ncf || null,
        itbis,
        supplier_tax_id: supplierTaxId,
        supplier_name: supplierName,
      });

      const mapped: PettyCashExpense = {
        id: created.id,
        fundId: created.fund_id,
        date: created.expense_date,
        description: created.description,
        category: created.category || '',
        amount: Number(created.amount) || amount,
        receipt: created.receipt_number || receipt,
        approvedBy: created.approved_by || '',
        status: (created.status as 'pending' | 'approved' | 'rejected') || 'pending',
        expenseAccountId: created.expense_account_id || expenseAccountId,
        ncf: created.ncf || ncf || undefined,
        itbis: created.itbis != null ? Number(created.itbis) : itbis,
        supplierTaxId: created.supplier_tax_id || supplierTaxId || undefined,
        supplierName: created.supplier_name || supplierName || undefined,
      };

      setExpenses((prev) => [mapped, ...prev]);

      // Refresh funds to reflect updated balance if backend updates them
      const fundsData = await pettyCashService.getFunds(user.id);
      const mappedFunds: PettyCashFund[] = (fundsData || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        location: f.location || '',
        custodian: f.custodian || '',
        initialAmount: Number(f.initial_amount) || 0,
        currentBalance: Number(f.current_balance) || 0,
        status: (f.status as 'active' | 'inactive') || 'active',
        createdAt: f.created_at ? String(f.created_at).split('T')[0] : '',
        pettyCashAccountId: f.petty_cash_account_id || undefined,
        bankAccountId: f.bank_account_id || undefined,
      }));
      setFunds(mappedFunds);

      setShowExpenseModal(false);
      setSelectedSupplierTaxId('');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error creating petty cash expense:', error);
      alert('Error creating petty cash disbursement');
    }
  };

  const downloadExcel = () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      if (activeTab === 'funds') {
        const headers = [
          { key: 'name', title: 'Fondo' },
          { key: 'location', title: 'Ubicación' },
          { key: 'custodian', title: 'Custodio' },
          { key: 'initialAmount', title: 'Monto Inicial' },
          { key: 'totalReplenishments', title: 'Total Reposiciones' },
          { key: 'fundTotal', title: 'Monto Fondo (Inicial + Reposición)' },
          { key: 'totalExpenses', title: 'Total Gastos' },
          { key: 'theoreticalCash', title: 'Saldo Teórico en Caja' },
          { key: 'currentBalance', title: 'Balance Actual' },
          { key: 'difference', title: 'Diferencia' },
          { key: 'status', title: 'Estado' },
          { key: 'createdAt', title: 'Creado' },
        ];

        const rows = funds.map((f) => ({
          name: f.name,
          location: f.location,
          custodian: f.custodian,
          initialAmount: f.initialAmount || 0,
          totalReplenishments: totalReimbursementsByFund[f.id] || 0,
          fundTotal: (f.initialAmount || 0) + (totalReimbursementsByFund[f.id] || 0),
          totalExpenses: totalExpensesByFund[f.id] || 0,
          theoreticalCash:
            (f.initialAmount || 0) +
            (totalReimbursementsByFund[f.id] || 0) -
            (totalExpensesByFund[f.id] || 0),
          currentBalance: f.currentBalance || 0,
          difference:
            (f.currentBalance || 0) -
            ((f.initialAmount || 0) +
              (totalReimbursementsByFund[f.id] || 0) -
              (totalExpensesByFund[f.id] || 0)),
          status: f.status === 'active' ? 'Activo' : 'Inactivo',
          createdAt: f.createdAt,
        }));

        exportToExcelWithHeaders(
          rows,
          headers,
          `caja_chica_fondos_${today}`,
          'Fondos',
          [24, 18, 18, 16, 18, 18, 18, 16, 12, 14],
          { title: 'Fondos de Caja Chica' },
        );
        return;
      }

      if (activeTab === 'expenses') {
        const headers = [
          { key: 'date', title: 'Fecha' },
          { key: 'fund', title: 'Fondo' },
          { key: 'description', title: 'Descripción' },
          { key: 'category', title: 'Categoría' },
          { key: 'amount', title: 'Monto' },
          { key: 'status', title: 'Estado' },
          { key: 'approvedBy', title: 'Aprobado Por' },
          { key: 'ncf', title: 'NCF' },
          { key: 'itbis', title: 'ITBIS' },
        ];

        const fundNameById = new Map(funds.map((f) => [f.id, f.name] as const));
        const rows = expenses.map((e) => ({
          date: e.date,
          fund: fundNameById.get(e.fundId) || e.fundId || '',
          description: e.description,
          category: e.category,
          amount: e.amount || 0,
          status:
            e.status === 'approved'
              ? 'Aprobado'
              : e.status === 'pending'
              ? 'Pendiente'
              : 'Rechazado',
          approvedBy: e.approvedBy || 'N/A',
          ncf: e.ncf || '',
          itbis: e.itbis || 0,
        }));

        exportToExcelWithHeaders(
          rows,
          headers,
          `caja_chica_gastos_${today}`,
          'Gastos',
          [12, 22, 40, 18, 14, 12, 18, 12, 12],
          { title: 'Gastos de Caja Chica' },
        );
        return;
      }

      if (activeTab === 'reimbursements') {
        const headers = [
          { key: 'date', title: 'Fecha' },
          { key: 'fund', title: 'Fondo' },
          { key: 'amount', title: 'Monto' },
          { key: 'description', title: 'Descripción' },
        ];

        const fundNameById = new Map(funds.map((f) => [f.id, f.name] as const));
        const rows = reimbursements.map((r) => ({
          date: r.date,
          fund: fundNameById.get(r.fundId) || r.fundId || '',
          amount: r.amount || 0,
          description: r.description || '',
        }));

        exportToExcelWithHeaders(
          rows,
          headers,
          `caja_chica_reposiciones_${today}`,
          'Reposiciones',
          [12, 22, 14, 40],
          { title: 'Reposiciones de Caja Chica' },
        );
        return;
      }

      if (activeTab === 'categories') {
        const headers = [
          { key: 'name', title: 'Nombre' },
          { key: 'description', title: 'Descripción' },
          { key: 'status', title: 'Estado' },
        ];

        const rows = (categories || [])
          .map((cat: any) => ({
            name: cat.name,
            description: cat.description || '',
            status: cat.is_active ? 'Activa' : 'Inactiva',
          }))
          .filter((row) => row.name.trim().length > 0);

        if (!rows.length) {
          alert('No hay categorías configuradas para exportar.');
          return;
        }

        exportToExcelWithHeaders(
          rows,
          headers,
          `caja_chica_categorias_${today}`,
          'Categorías',
          [24, 40, 14],
          { title: 'Categorías de Caja Chica' },
        );
        return;
      }

      // Otras pestañas sin exportación definida
      alert('No hay datos para exportar en esta pestaña.');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error downloading Excel:', error);
      alert('Error al descargar el archivo');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6 bg-[#f7f3e8] min-h-screen">

        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-[#e4d8c4] p-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-[#6b5c3b]">Cash Management</p>
            <h1 className="text-3xl font-bold text-[#2f3e1e]">Petty Cash</h1>
            <p className="text-[#6b5c3b]">Manage small-expense funds and replenishments.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={downloadExcel}
              className="bg-[#2f3e1e] text-white px-6 py-2 rounded-lg hover:bg-[#1f2a15] transition-colors whitespace-nowrap flex items-center"
            >
              <i className="ri-file-excel-line mr-2"></i>
              Download Excel
            </button>
            <Link
              to="/accounting/petty-cash/report"
              className="border border-[#d9ceb5] text-[#2f3e1e] px-6 py-2 rounded-lg hover:bg-[#f3e7cf] transition-colors whitespace-nowrap flex items-center"
            >
              <i className="ri-file-list-2-line mr-2"></i>
              Petty Cash Report
            </Link>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="bg-[#4b5f36] text-white px-6 py-2 rounded-lg hover:bg-[#3a4b2a] transition-colors whitespace-nowrap flex items-center"
            >
              <i className="ri-home-line mr-2"></i>
              Back to Home
            </button>
          </div>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            {
              label: 'Total Funds',
              value: `${getTotalFunds().toLocaleString()}`,
              icon: 'ri-wallet-3-line',
            },
            {
              label: 'Active Funds',
              value: funds.filter(f => f.status === 'active').length,
              icon: 'ri-money-dollar-circle-line',
            },
            {
              label: 'Pending Expenses',
              value: getPendingExpenses(),
              icon: 'ri-file-list-3-line',
            },
            {
              label: 'Total Expenses',
              value: `${getTotalExpenses().toLocaleString()}`,
              icon: 'ri-shopping-cart-line',
            },
          ].map((metric, idx) => (
            <div key={metric.label} className="bg-white p-6 rounded-xl shadow-sm border border-[#e4d8c4]">
              <div className="flex items-center">
                <div className="p-2 rounded-lg bg-[#eef2ea] text-[#4b5f36]">
                  <i className={`${metric.icon} text-xl`}></i>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-[#6b5c3b]">{metric.label}</p>
                  <p className={`text-2xl font-bold ${idx === 1 ? 'text-[#2f3e1e]' : 'text-[#2f3e1e]'}`}>
                    {metric.value}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {lowBalanceFunds.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg flex items-start space-x-3">
            <i className="ri-alert-line mt-0.5"></i>
            <div>
              <p className="font-semibold">Petty Cash Alert</p>
              <p className="text-sm">
                The following funds have availability at or below 10% of the initial amount. Consider requesting a replenishment.
              </p>
              <ul className="mt-2 list-disc list-inside text-sm">
                {lowBalanceFunds.map((fund) => (
                  <li key={fund.id}>
                    {fund.name}: {fund.currentBalance.toLocaleString()} of {fund.initialAmount.toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Navegación por pestañas */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('funds')}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'funds'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="ri-wallet-3-line mr-2"></i>
                Petty Cash Funds
              </button>
              <button
                onClick={() => setActiveTab('expenses')}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'expenses'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="ri-shopping-cart-line mr-2"></i>
                Disbursements
              </button>
              <button
                onClick={() => setActiveTab('reimbursements')}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'reimbursements'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="ri-refund-2-line mr-2"></i>
                Replenishments
              </button>
              <button
                onClick={() => setActiveTab('categories')}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'categories'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="ri-price-tag-3-line mr-2"></i>
                Categories
              </button>
            </nav>
          </div>

          <div className="p-6">
            {/* Tab: Fondos */}
            {activeTab === 'funds' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-gray-900">Petty Cash Funds</h2>
                  <button
                    onClick={() => {
                      setSelectedFund(null);
                      setShowFundModal(true);
                    }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-add-line mr-2"></i>
                    Create Fund
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {loadingFunds && funds.length === 0 && (
                    <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center text-gray-500">
                      Loading petty cash funds...
                    </div>
                  )}
                  {funds.map((fund) => (
                    <div key={fund.id} className="bg-gray-50 p-6 rounded-lg border">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="font-semibold text-gray-900">{fund.name}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          fund.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {fund.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      
                      <div className="space-y-2 text-sm text-gray-600">
                        <p><i className="ri-map-pin-line mr-2"></i>{fund.location}</p>
                        <p><i className="ri-user-line mr-2"></i>Custodian: {fund.custodian}</p>
                        <p><i className="ri-calendar-line mr-2"></i>Created: {fund.createdAt}</p>
                      </div>

                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-gray-600">Initial Amount:</span>
                          <span className="font-medium">{fund.initialAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Current Balance:</span>
                          <span className="font-bold text-lg text-blue-600">
                            {fund.currentBalance.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 flex space-x-2">
                        <button
                          className="flex-1 bg-blue-600 text-white py-2 px-3 rounded text-sm hover:bg-blue-700 transition-colors whitespace-nowrap"
                          onClick={() => {
                            const details = [
                              `Fund: ${fund.name}`,
                              `Location: ${fund.location || 'N/A'}`,
                              `Custodian: ${fund.custodian || 'N/A'}`,
                              `Initial amount: ${fund.initialAmount.toLocaleString()}`,
                              `Current balance: ${fund.currentBalance.toLocaleString()}`,
                              `Status: ${fund.status === 'active' ? 'Active' : 'Inactive'}`,
                            ].join('\n');
                            alert(details);
                          }}
                        >
                          View Details
                        </button>
                        <button
                          className="flex-1 bg-gray-600 text-white py-2 px-3 rounded text-sm hover:bg-gray-700 transition-colors whitespace-nowrap"
                          onClick={() => handleFundSelection(fund)}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab: Desembolsos */}
            {activeTab === 'expenses' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-gray-900">Desembolsos</h2>
                  <button
                    onClick={() => setShowExpenseModal(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-add-line mr-2"></i>
                    Registrar Desembolso
                  </button>
                </div>

                <div className="bg-white border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Fecha
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Descripción
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Categoría
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Monto
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Estado
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Acciones
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          NCF
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          ITBIS
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {loadingExpenses && expenses.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-6 py-4 text-center text-sm text-gray-500">
                            Cargando desembolsos de caja chica...
                          </td>
                        </tr>
                      )}
                      {expenses.map((expense) => (
                        <tr key={expense.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {expense.date}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {expense.description}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {expense.category}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {expense.amount.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              expense.status === 'approved' 
                                ? 'bg-green-100 text-green-800'
                                : expense.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {expense.status === 'approved' ? 'Aprobado' : 
                               expense.status === 'pending' ? 'Pendiente' : 'Rechazado'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              className="text-blue-600 hover:text-blue-900 mr-3"
                              onClick={() => {
                                const details = [
                                  `Fund: ${funds.find(f => f.id === expense.fundId)?.name || expense.fundId}`,
                                  `Description: ${expense.description}`,
                                  `Category: ${expense.category}`,
                                  `Amount: ${expense.amount.toLocaleString()}`,
                                  `Status: ${expense.status}`,
                                  `Receipt: ${expense.receipt}`,
                                  `NCF: ${expense.ncf || 'N/A'}`,
                                ].join('\n');
                                alert(details);
                              }}
                            >
                              View
                            </button>
                            {expense.status === 'pending' && (
                              <button
                                onClick={() => handleApproveExpense(expense.id)}
                                className="text-green-600 hover:text-green-900 mr-3"
                              >
                                Aprobar
                              </button>
                            )}
                            {expense.status !== 'rejected' && (
                              <button
                                className="text-red-600 hover:text-red-900"
                                onClick={() => handleRejectExpense(expense.id)}
                              >
                                Rechazar
                              </button>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {expense.ncf || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {expense.itbis || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab: Reembolsos */}
            {activeTab === 'reimbursements' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-gray-900">Solicitudes de Reposición</h2>
                  <button
                    onClick={() => setShowReimbursementModal(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-add-line mr-2"></i>
                    Nueva Solicitud de Reposición
                  </button>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex">
                    <i className="ri-information-line text-yellow-600 mr-3 mt-1"></i>
                    <div>
                      <h3 className="text-sm font-medium text-yellow-800">
                        Proceso de Reposición
                      </h3>
                      <p className="text-sm text-yellow-700 mt-1">
                        Las reposiciones se registran cuando se repone el fondo de caja chica desde la cuenta bancaria.
                        Cada reposición aumenta el saldo del fondo y genera un asiento contable Banco vs Caja Chica.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fondo</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {reimbursements.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                            No hay reposiciones registradas.
                          </td>
                        </tr>
                      )}
                      {reimbursements.map((r) => (
                        <tr key={r.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{r.date}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {funds.find(f => f.id === r.fundId)?.name || r.fundId}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {r.amount.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700">{r.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab: Categorías */}
            {activeTab === 'categories' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-gray-900">Categorías de Desembolsos de Caja Chica</h2>
                  <button
                    onClick={() => {
                      setEditingCategory(null);
                      setShowCategoryModal(true);
                    }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-add-line mr-2"></i>
                    Nueva Categoría
                  </button>
                </div>

                <div className="bg-white border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {(!categories || categories.length === 0) && (
                        <tr>
                          <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                            No hay categorías configuradas. Puede crear nuevas usando el botón "Nueva Categoría".
                          </td>
                        </tr>
                      )}
                      {categories.map((cat: any) => (
                        <tr key={cat.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{cat.name}</td>
                          <td className="px-6 py-4 text-sm text-gray-700">{cat.description || ''}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              cat.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {cat.is_active ? 'Activa' : 'Inactiva'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                            <button
                              className="text-blue-600 hover:text-blue-900"
                              onClick={() => {
                                setEditingCategory(cat);
                                setShowCategoryModal(true);
                              }}
                            >
                              Editar
                            </button>
                            <button
                              className={cat.is_active ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}
                              onClick={async () => {
                                if (!user) return;
                                const confirmMsg = cat.is_active
                                  ? '¿Desea desactivar esta categoría? Ya no estará disponible para nuevos desembolsos.'
                                  : '¿Desea activar nuevamente esta categoría?';
                                if (!confirm(confirmMsg)) return;
                                try {
                                  const updated = await pettyCashCategoriesService.toggleActive(cat.id, !cat.is_active);
                                  setCategories(prev => prev.map((c: any) => (c.id === cat.id ? updated : c)));
                                } catch (error) {
                                  // eslint-disable-next-line no-console
                                  console.error('Error actualizando estado de categoría de caja chica:', error);
                                  alert('Error al actualizar el estado de la categoría');
                                }
                              }}
                            >
                              {cat.is_active ? 'Desactivar' : 'Activar'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal: Crear / Editar Categoría */}
        {showCategoryModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
              </h3>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!user) return;

                  const formData = new FormData(e.currentTarget as HTMLFormElement);
                  const name = String(formData.get('name') || '').trim();
                  const description = String(formData.get('description') || '').trim();

                  if (!name) {
                    alert('Debe indicar el nombre de la categoría.');
                    return;
                  }

                  try {
                    if (editingCategory) {
                      const updated = await pettyCashCategoriesService.update(editingCategory.id, {
                        name,
                        description,
                      });
                      setCategories((prev) => prev.map((c: any) => (c.id === updated.id ? updated : c)));
                    } else {
                      const created = await pettyCashCategoriesService.create(user.id, {
                        name,
                        description,
                        is_active: true,
                      });
                      setCategories((prev) => [created, ...prev]);
                    }

                    setShowCategoryModal(false);
                    setEditingCategory(null);
                  } catch (error) {
                    // eslint-disable-next-line no-console
                    console.error('Error guardando categoría de caja chica:', error);
                    alert('Error al guardar la categoría de desembolsos de caja chica');
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre de la Categoría
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    defaultValue={editingCategory?.name || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ej: Suministros de Oficina, Viáticos, Transporte"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción (opcional)
                  </label>
                  <textarea
                    name="description"
                    rows={3}
                    defaultValue={editingCategory?.description || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    placeholder="Descripción interna de la categoría"
                  />
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCategoryModal(false);
                      setEditingCategory(null);
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Crear Fondo */}
        {showFundModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {selectedFund ? 'Editar Fondo' : 'Crear Nuevo Fondo'}
              </h3>
              
              <form onSubmit={handleSubmitFund} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre del Fondo
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    defaultValue={selectedFund?.name || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ej: Caja Chica Oficina Principal"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ubicación
                  </label>
                  <input
                    type="text"
                    name="location"
                    required
                    defaultValue={selectedFund?.location || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ej: Santo Domingo - Oficina Central"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Custodio Responsable
                  </label>
                  <input
                    type="text"
                    name="custodian"
                    required
                    defaultValue={selectedFund?.custodian || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Nombre del responsable"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Monto Inicial ()
                  </label>
                  <input
                    type="number"
                    name="initialAmount"
                    required
                    min="0"
                    step="0.01"
                    defaultValue={selectedFund ? selectedFund.initialAmount : ''}
                    disabled={!!selectedFund}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cuenta de Caja Chica
                  </label>
                  <select
                    name="pettyCashAccountId"
                    required
                    defaultValue={selectedFund?.pettyCashAccountId || ''}
                    disabled={!!selectedFund}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8 disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="">Seleccionar cuenta</option>
                    {pettyCashAccounts
                      .filter(acc => acc.code || acc.name)
                      .map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code || ''} - {acc.name || ''}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cuenta de Banco / Origen
                  </label>
                  <select
                    name="bankAccountId"
                    required
                    defaultValue={selectedFund?.bankAccountId || ''}
                    disabled={!!selectedFund}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8 disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="">Seleccionar cuenta</option>
                    {bankAccounts
                      .map((acc: any) => {
                        const code = acc.code || '';
                        const name = acc.name || acc.bank_name || '';
                        return { ...acc, __display: `${code}${code && name ? ' - ' : ''}${name}` };
                      })
                      .filter((acc: any) => acc.__display.trim().length > 0)
                      .map((acc: any) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.__display}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowFundModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    {selectedFund ? 'Actualizar' : 'Crear Fondo'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Registrar Desembolso */}
        {showExpenseModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Registrar Desembolso</h3>
              
              <form onSubmit={handleCreateExpense} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fondo de Caja Chica
                  </label>
                  <select
                    name="fundId"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="">Seleccionar fondo</option>
                    {funds.filter(f => f.status === 'active').map(fund => (
                      <option key={fund.id} value={fund.id}>{fund.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    name="date"
                    required
                    defaultValue={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción
                  </label>
                  <input
                    type="text"
                    name="description"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Descripción del gasto"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Categoría
                  </label>
                  <select
                    name="category"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="">Seleccionar categoría</option>
                    {categoryOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Monto ()
                  </label>
                  <input
                    type="number"
                    name="amount"
                    required
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Número de Recibo
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      name="receipt"
                      required
                      ref={receiptInputRef}
                      placeholder="Ej: REC-20251127-1430"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const y = now.getFullYear();
                        const m = String(now.getMonth() + 1).padStart(2, '0');
                        const d = String(now.getDate()).padStart(2, '0');
                        const hh = String(now.getHours()).padStart(2, '0');
                        const mm = String(now.getMinutes()).padStart(2, '0');
                        const generated = `REC-${y}${m}${d}-${hh}${mm}`;
                        if (receiptInputRef.current) {
                          receiptInputRef.current.value = generated;
                        }
                      }}
                      className="px-3 py-2 text-xs bg-gray-100 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-200 whitespace-nowrap"
                    >
                      Generar
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    NCF (opcional)
                  </label>
                  <input
                    type="text"
                    name="ncf"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Número de comprobante fiscal, si aplica"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Proveedor (requerido si hay NCF)
                  </label>
                  <select
                    name="supplierId"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    onChange={(e) => {
                      const id = e.target.value;
                      const supplierRow = suppliers.find((s: any) => s.id === id);
                      if (supplierRow) {
                        setSelectedSupplierTaxId(String(supplierRow.tax_id || ''));
                      } else {
                        setSelectedSupplierTaxId('');
                      }
                    }}
                  >
                    <option value="">Seleccionar proveedor</option>
                    {suppliers.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {`${s.tax_id || ''}${s.tax_id && s.name ? ' - ' : ''}${s.name || s.legal_name || ''}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    RNC/Cédula del proveedor (solo lectura)
                  </label>
                  <input
                    type="text"
                    value={selectedSupplierTaxId}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                    placeholder="Se completará al seleccionar el proveedor"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ITBIS (, opcional)
                  </label>
                  <input
                    type="number"
                    name="itbis"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cuenta de Gasto
                  </label>
                  <select
                    name="expenseAccountId"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="">Seleccionar cuenta</option>
                    {expenseAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowExpenseModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    Registrar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Nuevo Reembolso */}
        {showReimbursementModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Registrar Reposición</h3>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!user) return;
                  const formData = new FormData(e.currentTarget as HTMLFormElement);
                  const fundId = String(formData.get('fundId') || '');
                  const date = String(formData.get('date') || '').trim() || new Date().toISOString().split('T')[0];
                  const amount = parseFloat(String(formData.get('amount') || '0')) || 0;
                  const description = String(formData.get('description') || '').trim();
                  const startReceiptNumber = String(formData.get('startReceiptNumber') || '').trim();
                  const bankAccountId = String(formData.get('bankAccountId') || '');

                  if (!fundId) {
                    alert('Debe seleccionar un fondo de caja chica.');
                    return;
                  }
                  if (!bankAccountId) {
                    alert('Debe seleccionar la cuenta bancaria de origen.');
                    return;
                  }

                  try {
                    const created = await pettyCashService.createReimbursement(user.id, {
                      fund_id: fundId,
                      reimbursement_date: date,
                      amount,
                      description,
                      bank_account_id: bankAccountId,
                      start_receipt_number: startReceiptNumber || null,
                    });

                    const mapped: PettyCashReimbursement = {
                      id: created.id,
                      fundId: created.fund_id,
                      date: created.reimbursement_date,
                      amount: Number(created.amount) || 0,
                      description: created.description || '',
                      bankAccountId: created.bank_account_id || undefined,
                    };

                    setReimbursements(prev => [mapped, ...prev]);

                    // Refresh funds to reflect updated balance
                    const fundsData = await pettyCashService.getFunds(user.id);
                    const mappedFunds: PettyCashFund[] = (fundsData || []).map((f: any) => ({
                      id: f.id,
                      name: f.name,
                      location: f.location || '',
                      custodian: f.custodian || '',
                      initialAmount: Number(f.initial_amount) || 0,
                      currentBalance: Number(f.current_balance) || 0,
                      status: (f.status as 'active' | 'inactive') || 'active',
                      createdAt: f.created_at ? String(f.created_at).split('T')[0] : '',
                      pettyCashAccountId: f.petty_cash_account_id || undefined,
                      bankAccountId: f.bank_account_id || undefined,
                    }));
                    setFunds(mappedFunds);

                    setShowReimbursementModal(false);
                  } catch (error) {
                    // eslint-disable-next-line no-console
                    console.error('Error creating petty cash reimbursement:', error);
                    alert('Error al registrar la reposición de caja chica');
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fondo de Caja Chica
                  </label>
                  <select
                    name="fundId"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="">Seleccionar fondo</option>
                    {funds.filter(f => f.status === 'active').map(fund => (
                      <option key={fund.id} value={fund.id}>{fund.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de Reposición
                  </label>
                  <input
                    type="date"
                    name="date"
                    required
                    defaultValue={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Monto ()
                  </label>
                  <input
                    type="number"
                    name="amount"
                    required
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción
                  </label>
                  <input
                    type="text"
                    name="description"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Descripción de la reposición (opcional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Número inicial de recibos de reposición (opcional)
                  </label>
                  <select
                    name="startReceiptNumber"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="">Seleccionar recibo inicial</option>
                    {reimbursementReceiptOptions.map(receipt => (
                      <option key={receipt} value={receipt}>
                        {receipt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cuenta de Banco / Origen
                  </label>
                  <select
                    name="bankAccountId"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="">Seleccionar cuenta</option>
                    {bankAccounts
                      .map((acc: any) => {
                        const code = acc.code || '';
                        const name = acc.name || acc.bank_name || '';
                        return { ...acc, __display: `${code}${code && name ? ' - ' : ''}${name}` };
                      })
                      .filter((acc: any) => acc.__display.trim().length > 0)
                      .map((acc: any) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.__display}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowReimbursementModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    Registrar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default PettyCashPage;