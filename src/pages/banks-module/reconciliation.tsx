import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import {
  bankDepositsService,
  bankChecksService,
  bankTransfersService,
  bankCreditsService,
  bankChargesService,
  supplierPaymentsService,
  bankReconciliationService,
  bankAccountsService,
  customerPaymentsService,
} from '../../services/database';
import { formatDateEsDO } from '../../utils/date';
import { formatAmount } from '../../utils/numberFormat';

type MovementType = 'deposit' | 'check' | 'transfer' | 'credit' | 'charge' | 'supplier_payment' | 'customer_payment';

type BankMovement = {
  id: string;
  date: string;
  type: MovementType;
  bank_id?: string | null;
  bank_account_code?: string | null;
  currency: string;
  amount: number;
  reference?: string | null;
  description?: string | null;
};

type Filters = {
  bankAccountSearch: string;
  fromDate: string;
  toDate: string;
};

type StatementBalances = {
  opening: string;
  closing: string;
};

export default function BankReconciliationPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [movements, setMovements] = useState<BankMovement[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState('');
  const [reconciliationDate, setReconciliationDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [selectedMonth, setSelectedMonth] = useState('');
  const [filters, setFilters] = useState<Filters>({
    bankAccountSearch: '',
    fromDate: '',
    toDate: '',
  });
  const [statement, setStatement] = useState<StatementBalances>({
    opening: '',
    closing: '',
  });
  const [reconciledIds, setReconciledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookBalance, setBookBalance] = useState<number | null>(null);
  const [historicalItems, setHistoricalItems] = useState<any[] | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const bankAccountId = params.get('bank_account_id');
    const dateParam = params.get('date');
    const reconciliationIdParam = params.get('reconciliation_id');

    if (bankAccountId) {
      setSelectedBankAccountId(bankAccountId);
    }

    if (dateParam) {
      // Si viene una fecha específica, usamos su mes para el filtro de periodo
      const [yearStr, monthStr] = dateParam.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      if (year && month) {
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        const from = firstDay.toISOString().slice(0, 10);
        const to = lastDay.toISOString().slice(0, 10);

        setSelectedMonth(`${yearStr}-${monthStr}`);
        setFilters((prev) => ({
          ...prev,
          fromDate: from,
          toDate: to,
        }));
        setReconciliationDate(to);
      } else {
        setReconciliationDate(dateParam);
        setFilters((prev) => ({
          ...prev,
          toDate: dateParam,
        }));
      }
    }

    if (reconciliationIdParam) {
      bankReconciliationService
        .getItems(reconciliationIdParam)
        .then((items: any[]) => {
          setHistoricalItems(items || []);
        })
        .catch((err: any) => {
          // eslint-disable-next-line no-console
          console.error('Error loading historical reconciliation items:', err);
          setHistoricalItems(null);
        });
    } else {
      setHistoricalItems(null);
    }
  }, [location.search]);

  useEffect(() => {
    if (!user?.id) return;

    const loadBankAccounts = async () => {
      try {
        const data = await bankAccountsService.getAll(user.id);
        const mapped = (data || [])
          .filter((ba: any) => ba.chart_account_id)
          .map((ba: any) => ({
            id: ba.id as string,
            name: `${ba.bank_name} - ${ba.account_number}`,
          }));
        setBankAccounts(mapped);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error loading bank accounts for reconciliation (banks module):', err);
      }
    };

    loadBankAccounts();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [deposits, checks, transfers, credits, charges, supplierPayments, customerPayments] = await Promise.all([
          bankDepositsService.getAll(user.id),
          bankChecksService.getAll(user.id),
          bankTransfersService.getAll(user.id),
          bankCreditsService.getAll(user.id),
          bankChargesService.getAll(user.id),
          supplierPaymentsService.getAll(user.id),
          customerPaymentsService.getAll(user.id),
        ]);

        const normalized: BankMovement[] = [];

        // Depósitos
        (deposits as any[]).forEach((d) => {
          normalized.push({
            id: d.id,
            date: d.deposit_date,
            type: 'deposit',
            bank_id: d.bank_id ?? null,
            bank_account_code: d.bank_account_code ?? null,
            currency: d.currency,
            amount: Number(d.amount) || 0,
            reference: d.reference ?? null,
            description: d.description ?? null,
          });
        });

        // Cheques
        (checks as any[]).forEach((c) => {
          normalized.push({
            id: c.id,
            date: c.check_date,
            type: 'check',
            bank_id: c.bank_id ?? null,
            bank_account_code: c.bank_account_code ?? null,
            currency: c.currency,
            amount: Number(c.amount) || 0,
            reference: c.check_number ?? null,
            description: c.description ?? null,
          });
        });

        // Transferencias (solo lado del banco origen para conciliación)
        (transfers as any[]).forEach((t) => {
          normalized.push({
            id: t.id,
            date: t.transfer_date,
            type: 'transfer',
            bank_id: t.from_bank_id ?? null,
            bank_account_code: t.from_bank_account_code ?? null,
            currency: t.currency,
            amount: Number(t.amount) || 0,
            reference: t.reference ?? null,
            description: t.description ?? null,
          });
        });

        // Créditos bancarios
        (credits as any[]).forEach((cr) => {
          normalized.push({
            id: cr.id,
            date: cr.start_date,
            type: 'credit',
            bank_id: cr.bank_id ?? null,
            bank_account_code: cr.bank_account_code ?? null,
            currency: cr.currency,
            amount: Number(cr.amount) || 0,
            reference: cr.credit_number ?? null,
            description: cr.description ?? null,
          });
        });

        // Cargos bancarios
        (charges as any[]).forEach((ch) => {
          normalized.push({
            id: ch.id,
            date: ch.charge_date,
            type: 'charge',
            bank_id: ch.bank_id ?? null,
            bank_account_code: ch.bank_account_code ?? null,
            currency: ch.currency,
            amount: Number(ch.amount) || 0,
            reference: ch.ncf ?? null,
            description: ch.description ?? null,
          });
        });

        // Pagos a suplidores (salidas bancarias) - solo completados y no-cheque
        (supplierPayments as any[])
          .filter((p) => {
            const status = String(p?.status || '');
            if (status !== 'Completado' && status !== 'completed') return false;
            const method = String(p?.method || '').toLowerCase();
            const isCheck = method.includes('cheque') || method.includes('check');
            if (isCheck) return false;
            return Boolean(p?.bank_account_id);
          })
          .forEach((p) => {
            const supplierName = (p.suppliers as any)?.name || '';
            const invoiceNo = p.invoice_number ? String(p.invoice_number) : '';
            const labelParts = [invoiceNo ? `Pago a proveedor ${invoiceNo}` : 'Pago a proveedor', supplierName]
              .filter(Boolean)
              .join(' - ');

            normalized.push({
              id: p.id,
              date: p.payment_date,
              type: 'supplier_payment',
              bank_id: p.bank_account_id ?? null,
              bank_account_code: p.bank_account ?? null,
              currency: p.currency ?? 'DOP',
              amount: Number(p.amount) || 0,
              reference: p.reference ?? null,
              description: p.description || labelParts,
            });
          });

        // Pagos de clientes (entradas bancarias) - solo con cuenta bancaria
        (customerPayments as any[])
          .filter((p) => Boolean(p?.bank_account_id))
          .forEach((p) => {
            const customerName = (p.customers as any)?.name || '';
            const invoiceNo = (p.invoices as any)?.invoice_number || '';
            const labelParts = [invoiceNo ? `Cobro factura ${invoiceNo}` : 'Cobro de cliente', customerName]
              .filter(Boolean)
              .join(' - ');

            normalized.push({
              id: `cp-${p.id}`,
              date: p.payment_date,
              type: 'customer_payment',
              bank_id: p.bank_account_id ?? null,
              bank_account_code: null,
              currency: 'DOP',
              amount: Number(p.amount) || 0,
              reference: p.reference ?? null,
              description: labelParts,
            });
          });

        // Orden por fecha ascendente (útil para conciliación)
        normalized.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));

        setMovements(normalized);
        setReconciledIds(new Set(normalized.map((m) => m.id)));
      } catch (e: any) {
        setError(e?.message || 'Error cargando movimientos bancarios para conciliación');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !selectedBankAccountId || !reconciliationDate) {
      setBookBalance(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const balance = await bankReconciliationService.getBookBalanceForBankAccount(
          user.id,
          selectedBankAccountId,
          reconciliationDate,
        );
        const normalizedBalance = Number.isNaN(balance) ? null : balance;
        if (!cancelled) {
          setBookBalance(normalizedBalance);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error loading book balance for bank reconciliation:', err);
        if (!cancelled) {
          setBookBalance(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, selectedBankAccountId, reconciliationDate]);

  const handleFilterChange = (field: keyof Filters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleStatementChange = (field: keyof StatementBalances, value: string) => {
    setStatement((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleMonthChange = (value: string) => {
    setSelectedMonth(value);
    if (!value) return;

    const [yearStr, monthStr] = value.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || !month) return;

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const from = firstDay.toISOString().slice(0, 10);
    const to = lastDay.toISOString().slice(0, 10);

    setFilters((prev) => ({
      ...prev,
      fromDate: from,
      toDate: to,
    }));
    setReconciliationDate(to);
  };

  const toggleReconciled = (id: string) => {
    setReconciledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      if (selectedBankAccountId && m.bank_id !== selectedBankAccountId) {
        return false;
      }

      if (
        filters.bankAccountSearch &&
        !(
          (m.bank_account_code || '').toLowerCase().includes(filters.bankAccountSearch.toLowerCase()) ||
          (m.bank_id || '').toLowerCase().includes(filters.bankAccountSearch.toLowerCase())
        )
      ) {
        return false;
      }

      if (filters.fromDate && m.date < filters.fromDate) return false;
      if (filters.toDate && m.date > filters.toDate) return false;

      return true;
    });
  }, [movements, filters, selectedBankAccountId]);

  const parseAmountValue = (raw: string): number => {
    const input = String(raw || '').trim().replace(/\s+/g, '');
    if (!input) return 0;

    const hasComma = input.includes(',');
    const hasDot = input.includes('.');

    let normalized = input;
    if (hasComma && hasDot) {
      const lastComma = input.lastIndexOf(',');
      const lastDot = input.lastIndexOf('.');
      const decimalSep = lastComma > lastDot ? ',' : '.';
      const thousandSep = decimalSep === ',' ? '.' : ',';

      normalized = normalized.split(thousandSep).join('');
      if (decimalSep === ',') {
        normalized = normalized.replace(',', '.');
      }
    } else if (hasComma && !hasDot) {
      normalized = normalized.replace(',', '.');
    } else {
      normalized = normalized;
    }

    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  };

  const getSignedAmount = (m: BankMovement) => {
    // Para conciliación, tratamos:
    // - Depósitos, créditos y cobros de clientes como entradas (+)
    // - Cheques, transferencias (origen), cargos y pagos a proveedores como salidas (-)
    const positiveTypes: MovementType[] = ['deposit', 'credit', 'customer_payment'];
    const sign = positiveTypes.includes(m.type) ? 1 : -1;
    return sign * m.amount;
  };

  const totals = useMemo(() => {
    let totalAll = 0;
    let totalReconciled = 0;

    filteredMovements.forEach((m) => {
      const signed = getSignedAmount(m);
      totalAll += signed;
      if (reconciledIds.has(m.id)) {
        totalReconciled += signed;
      }
    });

    const opening = parseAmountValue(statement.opening);
    const closing = parseAmountValue(statement.closing);

    const calculatedClosing = opening + totalReconciled;
    const difference = closing ? closing - calculatedClosing : 0;

    return {
      totalAll,
      totalReconciled,
      opening,
      closing,
      calculatedClosing,
      difference,
    };
  }, [filteredMovements, reconciledIds, statement]);

  const reconciliationMetrics = useMemo(() => {
    // Fórmula de conciliación bancaria estándar:
    // LADO BANCO: Saldo extracto + Depósitos en tránsito - Cheques en circulación = Saldo ajustado banco
    // LADO LIBROS: Saldo libros + Notas crédito banco - Cargos bancarios = Saldo ajustado libros
    // Ambos saldos ajustados deben coincidir

    let depositsInTransit = 0;      // En libros pero NO en banco (no marcados)
    let checksInTransit = 0;        // En libros pero NO cobrados en banco (no marcados)
    let bankChargesNotRecorded = 0; // Cargos banco no registrados en libros
    let bankCreditsNotRecorded = 0; // Créditos banco no registrados en libros
    let customerPaymentsInTransit = 0; // Cobros en tránsito

    filteredMovements.forEach((m) => {
      const amount = Math.abs(m.amount);
      const isReconciled = reconciledIds.has(m.id);
      
      // Partidas NO conciliadas (en tránsito)
      if (!isReconciled) {
        switch (m.type) {
          case 'deposit':
            depositsInTransit += amount;
            break;
          case 'customer_payment':
            customerPaymentsInTransit += amount;
            break;
          case 'check':
          case 'transfer':
          case 'supplier_payment':
            checksInTransit += amount;
            break;
          case 'charge':
            bankChargesNotRecorded += amount;
            break;
          case 'credit':
            bankCreditsNotRecorded += amount;
            break;
        }
      }
    });

    // Total depósitos en tránsito (incluye cobros de clientes)
    const totalDepositsInTransit = depositsInTransit + customerPaymentsInTransit;
    
    // Saldo ajustado del banco
    const bankStatementBalance = totals.closing;
    const adjustedBankBalance = bankStatementBalance + totalDepositsInTransit - checksInTransit;
    
    // Saldo ajustado de libros
    const bookBalanceValue = bookBalance !== null && !Number.isNaN(bookBalance) ? bookBalance : 0;
    const adjustedBookBalance = bookBalanceValue + bankCreditsNotRecorded - bankChargesNotRecorded;
    
    // Diferencia (debe ser 0 para conciliación perfecta)
    const difference = adjustedBankBalance - adjustedBookBalance;

    return {
      depositsInTransit: totalDepositsInTransit,
      checksInTransit,
      bankChargesNotRecorded,
      bankCreditsNotRecorded,
      bankStatementBalance,
      adjustedBankBalance,
      bookBalanceValue,
      adjustedBookBalance,
      difference,
    };
  }, [filteredMovements, reconciledIds, totals, bookBalance]);

  const inTransitMovements = useMemo(
    () => filteredMovements.filter((m) => !reconciledIds.has(m.id)),
    [filteredMovements, reconciledIds],
  );

  const historicalConciliated = useMemo(
    () => (historicalItems || []).filter((i: any) => i.is_reconciled),
    [historicalItems],
  );

  const historicalInTransit = useMemo(
    () => (historicalItems || []).filter((i: any) => !i.is_reconciled),
    [historicalItems],
  );

  const formatCurrency = (value: number) => formatAmount(value);

  const formatTypeLabel = (type: MovementType) => {
    switch (type) {
      case 'deposit':
        return 'Depósito';
      case 'check':
        return 'Cheque';
      case 'transfer':
        return 'Transferencia';
      case 'credit':
        return 'Crédito bancario';
      case 'charge':
        return 'Cargo bancario';
      case 'supplier_payment':
        return 'Pago a proveedor';
      case 'customer_payment':
        return 'Cobro de cliente';
      default:
        return type;
    }
  };

  const handleSaveReconciliation = async () => {
    if (!user?.id) {
      alert('Debe iniciar sesión para guardar la conciliación.');
      return;
    }

    if (!selectedBankAccountId) {
      alert('Debe seleccionar una cuenta de banco para guardar la conciliación.');
      return;
    }

    if (!reconciliationDate) {
      alert('Debe seleccionar una fecha de conciliación.');
      return;
    }

    const closingStr = statement.closing.trim();
    if (!closingStr) {
      alert('Debe indicar el saldo final del extracto del banco.');
      return;
    }

    try {
      const closing = parseAmountValue(closingStr);
      const bookBalanceValue =
        bookBalance !== null && !Number.isNaN(bookBalance) ? bookBalance : totals.calculatedClosing;

      const reconciliation = await bankReconciliationService.getOrCreateReconciliation(
        user.id,
        selectedBankAccountId,
        reconciliationDate,
        closing,
        bookBalanceValue,
      );

      // Persistir items de conciliación para todos los movimientos visibles
      await bankReconciliationService.upsertItemsFromBankMovements(
        reconciliation.id,
        user.id,
        filteredMovements,
        reconciledIds,
      );

      alert(
        `Conciliación guardada correctamente para la cuenta seleccionada y fecha ${reconciliationDate}.`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error saving bank reconciliation from banks module:', err);
      alert('Error al guardar la conciliación bancaria.');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Conciliación Bancaria</h1>
          <p className="text-gray-600 text-sm">
            Seleccione la cuenta, el periodo y marque los movimientos que aparecen en el extracto bancario para calcular la conciliación.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="bg-white rounded-lg shadow p-4 space-y-4 lg:col-span-2">
            <h2 className="text-lg font-semibold">Parámetros de conciliación</h2>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  Cuenta de Banco
                </label>
                <select
                  value={selectedBankAccountId}
                  onChange={(e) => setSelectedBankAccountId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 pr-8"
                >
                  <option value="">Seleccionar cuenta</option>
                  {bankAccounts.map((ba) => (
                    <option key={ba.id} value={ba.id}>
                      {ba.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Mes a conciliar</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Desde</label>
                <input
                  type="date"
                  value={filters.fromDate}
                  onChange={(e) => handleFilterChange('fromDate', e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Hasta / Fecha de Conciliación</label>
                <input
                  type="date"
                  value={filters.toDate}
                  onChange={(e) => {
                    handleFilterChange('toDate', e.target.value);
                    setReconciliationDate(e.target.value || new Date().toISOString().split('T')[0]);
                  }}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  Saldo inicial en banco
                </label>
                <input
                  type="text"
                  value={statement.opening}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9.,]/g, '');
                    handleStatementChange('opening', raw);
                  }}
                  onBlur={(e) => {
                    const num = parseAmountValue(e.target.value);
                    if (num > 0) {
                      handleStatementChange('opening', formatAmount(num));
                    }
                  }}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="Ej: 150,000.00"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  Saldo final del extracto
                </label>
                <input
                  type="text"
                  value={statement.closing}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9.,]/g, '');
                    handleStatementChange('closing', raw);
                  }}
                  onBlur={(e) => {
                    const num = parseAmountValue(e.target.value);
                    if (num > 0) {
                      handleStatementChange('closing', formatAmount(num));
                    }
                  }}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="Ej: 175,000.00"
                />
              </div>
            </div>

            <div className="pt-2 text-xs text-gray-600">
              {loading
                ? 'Cargando movimientos bancarios...'
                : `${filteredMovements.length} movimiento(s) encontrados para los filtros actuales.`}
            </div>

            <div className="pt-3 flex justify-end">
              <button
                type="button"
                onClick={handleSaveReconciliation}
                className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50"
                disabled={!selectedBankAccountId || !reconciliationDate}
              >
                <i className="ri-save-line mr-2" />
                Guardar Conciliación
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 space-y-4">
            <h2 className="text-lg font-semibold">Conciliación Bancaria</h2>

            {/* LADO DEL BANCO */}
            <div className="bg-blue-50 rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold text-blue-800 flex items-center">
                <i className="ri-bank-line mr-2" />
                Saldo según Banco
              </h3>
              <div className="text-sm space-y-1">
                <div className="flex justify-between py-1">
                  <span className="text-gray-700">Saldo según extracto bancario:</span>
                  <span className="font-mono font-medium">
                    {formatCurrency(reconciliationMetrics.bankStatementBalance)}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-emerald-700">
                  <span>(+) Depósitos en tránsito:</span>
                  <span className="font-mono">
                    {formatCurrency(reconciliationMetrics.depositsInTransit)}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-red-700">
                  <span>(-) Cheques en circulación:</span>
                  <span className="font-mono">
                    {formatCurrency(reconciliationMetrics.checksInTransit)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-t border-blue-200 mt-1 pt-2">
                  <span className="font-semibold text-blue-900">= Saldo ajustado banco:</span>
                  <span className="font-mono font-bold text-blue-900">
                    {formatCurrency(reconciliationMetrics.adjustedBankBalance)}
                  </span>
                </div>
              </div>
            </div>

            {/* LADO DE LIBROS */}
            <div className="bg-amber-50 rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold text-amber-800 flex items-center">
                <i className="ri-book-2-line mr-2" />
                Saldo según Libros
              </h3>
              <div className="text-sm space-y-1">
                <div className="flex justify-between py-1">
                  <span className="text-gray-700">Saldo según libros contables:</span>
                  <span className="font-mono font-medium">
                    {formatCurrency(reconciliationMetrics.bookBalanceValue)}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-emerald-700">
                  <span>(+) Notas crédito banco no registradas:</span>
                  <span className="font-mono">
                    {formatCurrency(reconciliationMetrics.bankCreditsNotRecorded)}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-red-700">
                  <span>(-) Cargos bancarios no registrados:</span>
                  <span className="font-mono">
                    {formatCurrency(reconciliationMetrics.bankChargesNotRecorded)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-t border-amber-200 mt-1 pt-2">
                  <span className="font-semibold text-amber-900">= Saldo ajustado libros:</span>
                  <span className="font-mono font-bold text-amber-900">
                    {formatCurrency(reconciliationMetrics.adjustedBookBalance)}
                  </span>
                </div>
              </div>
            </div>

            {/* DIFERENCIA */}
            <div className={`rounded-lg p-3 ${
              Math.abs(reconciliationMetrics.difference) < 0.01 
                ? 'bg-emerald-50' 
                : 'bg-red-50'
            }`}>
              <div className="flex justify-between items-center">
                <span className={`font-semibold flex items-center ${
                  Math.abs(reconciliationMetrics.difference) < 0.01 
                    ? 'text-emerald-800' 
                    : 'text-red-800'
                }`}>
                  <i className={`mr-2 ${
                    Math.abs(reconciliationMetrics.difference) < 0.01 
                      ? 'ri-checkbox-circle-line' 
                      : 'ri-error-warning-line'
                  }`} />
                  Diferencia:
                </span>
                <span className={`font-mono font-bold text-lg ${
                  Math.abs(reconciliationMetrics.difference) < 0.01 
                    ? 'text-emerald-600' 
                    : 'text-red-600'
                }`}>
                  {formatCurrency(reconciliationMetrics.difference)}
                </span>
              </div>
              {Math.abs(reconciliationMetrics.difference) < 0.01 && (
                <p className="text-xs text-emerald-700 mt-1">
                  ✓ Conciliación perfecta - Los saldos coinciden
                </p>
              )}
              {Math.abs(reconciliationMetrics.difference) >= 0.01 && (
                <p className="text-xs text-red-700 mt-1">
                  Revise las partidas no conciliadas para identificar la diferencia
                </p>
              )}
            </div>

            {/* Resumen adicional */}
            <div className="text-xs text-gray-500 border-t pt-3 mt-2">
              Para una conciliación perfecta, el saldo por conciliar debe ser 0.00.
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Movimientos a conciliar</h2>
            {loading && (
              <span className="text-xs text-gray-500">Cargando...</span>
            )}
          </div>

          {filteredMovements.length === 0 ? (
            <p className="text-sm text-gray-500">
              No hay movimientos que coincidan con los filtros actuales.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-center">
                      <span className="sr-only">Conciliado</span>
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Fecha</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Cuenta/Banco</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Moneda</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Monto (+/-)</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Referencia</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredMovements.map((m) => {
                    const signed = getSignedAmount(m);
                    const checked = reconciledIds.has(m.id);
                    return (
                      <tr key={`${m.type}-${m.id}`} className={checked ? 'bg-emerald-50/40' : ''}>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleReconciled(m.id)}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600">
                          {m.date ? formatDateEsDO(m.date) : ''}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
                            {formatTypeLabel(m.type)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">
                          {m.bank_account_code || m.bank_id || '-'}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">{m.currency}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {signed >= 0 ? '+' : '-'}
                          {formatCurrency(Math.abs(signed))}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">
                          {m.reference || '-'}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700 max-w-xs truncate">
                          {m.description || ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Transacciones en tránsito (no conciliadas)</h2>
          </div>

          {inTransitMovements.length === 0 ? (
            <p className="text-sm text-gray-500">
              No hay transacciones en tránsito para los filtros actuales.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Fecha</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Cuenta/Banco</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Moneda</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Monto (+/-)</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Referencia</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {inTransitMovements.map((m) => {
                    const signed = getSignedAmount(m);
                    return (
                      <tr key={`${m.type}-${m.id}`}>
                        <td className="px-3 py-2 text-xs text-gray-600">
                          {m.date ? formatDateEsDO(m.date) : ''}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
                            {formatTypeLabel(m.type)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">
                          {m.bank_account_code || m.bank_id || '-'}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">{m.currency}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {signed >= 0 ? '+' : '-'}
                          {formatCurrency(Math.abs(signed))}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">
                          {m.reference || '-'}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700 max-w-xs truncate">
                          {m.description || ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {historicalItems && historicalItems.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Detalle histórico de la conciliación guardada</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">Movimientos conciliados</h3>
                {historicalConciliated.length === 0 ? (
                  <p className="text-xs text-gray-500">No hay movimientos conciliados en esta conciliación.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Fecha</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Descripción</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-700">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {historicalConciliated.map((item: any) => (
                          <tr key={item.id}>
                            <td className="px-3 py-2 text-gray-600">
                              {item.transaction_date
                                ? formatDateEsDO(item.transaction_date)
                                : ''}
                            </td>
                            <td className="px-3 py-2 text-gray-700 max-w-xs truncate">{item.description}</td>
                            <td className="px-3 py-2 text-right font-mono">
                              {formatCurrency(Number(item.amount) || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">Movimientos en tránsito</h3>
                {historicalInTransit.length === 0 ? (
                  <p className="text-xs text-gray-500">No hay movimientos en tránsito en esta conciliación.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Fecha</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Descripción</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-700">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {historicalInTransit.map((item: any) => (
                          <tr key={item.id}>
                            <td className="px-3 py-2 text-gray-600">
                              {item.transaction_date
                                ? formatDateEsDO(item.transaction_date)
                                : ''}
                            </td>
                            <td className="px-3 py-2 text-gray-700 max-w-xs truncate">{item.description}</td>
                            <td className="px-3 py-2 text-right font-mono">
                              {formatCurrency(Number(item.amount) || 0)}
                            </td>
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
      </div>
    </DashboardLayout>
  );
}
