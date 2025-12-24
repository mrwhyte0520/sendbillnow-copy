import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { bankAccountsService, bankChargesService, chartAccountsService } from '../../services/database';
import { formatAmount } from '../../utils/numberFormat';

interface BankCharge {
  id: string;
  descripcion: string;
  banco: string; // bank_id
  moneda: string; // currency
  monto: number; // amount
  fecha: string; // charge_date (ISO)
  ncf: string;
  cuentaGasto: string; // expense_account_code
}

export default function BankChargesPage() {
  const { user } = useAuth();
  const [charges, setCharges] = useState<BankCharge[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [form, setForm] = useState({
    descripcion: '',
    banco: '',
    moneda: 'DOP',
    monto: '',
    fecha: new Date().toISOString().slice(0, 10),
    ncf: '',
    cuentaGasto: '',
  });

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleBankChange = (bankId: string) => {
    setForm(prev => {
      const next = { ...prev, banco: bankId };
      const selected = (banks || []).find((b: any) => b.id === bankId);
      if (selected?.currency) {
        next.moneda = selected.currency;
      }
      return next;
    });
  };

  useEffect(() => {
    const loadCharges = async () => {
      if (!user?.id) return;
      const data = await bankChargesService.getAll(user.id);
      const mapped: BankCharge[] = (data || []).map((row: any) => ({
        id: row.id,
        descripcion: row.description || '',
        banco: row.bank_id || '',
        moneda: row.currency || 'DOP',
        monto: Number(row.amount) || 0,
        fecha: row.charge_date || (row.created_at ? row.created_at.slice(0, 10) : ''),
        ncf: row.ncf || '',
        cuentaGasto: row.expense_account_code || '',
      }));
      setCharges(mapped);
    };

    loadCharges();
  }, [user?.id]);

  useEffect(() => {
    const loadBanksCurrenciesAndExpenses = async () => {
      if (!user?.id) return;
      try {
        const [bankRows, chartRows] = await Promise.all([
          bankAccountsService.getAll(user.id),
          chartAccountsService.getAll(user.id),
        ]);

        setBanks(bankRows || []);

        const expenses = (chartRows || [])
          .filter((acc: any) => {
            const code = String(acc.code || '');
            return (
              acc.allowPosting &&
              acc.isActive !== false &&
              code.startsWith('61')
            );
          })
          .map((acc: any) => ({ id: acc.id, code: acc.code, name: acc.name }));
        setExpenseAccounts(expenses);
      } catch (error) {
        console.error('Error cargando bancos, monedas y cuentas de gasto para cargos bancarios', error);
      }
    };

    loadBanksCurrenciesAndExpenses();
  }, [user?.id]);

  const handleAddCharge = async (e: React.FormEvent) => {
    e.preventDefault();

    const montoNumber = Number(form.monto);
    if (!form.descripcion.trim() || !form.banco || !form.moneda || !form.cuentaGasto || !form.fecha) {
      alert('Complete descripción, banco, moneda, cuenta de gasto y fecha.');
      return;
    }
    if (isNaN(montoNumber) || montoNumber <= 0) {
      alert('El monto debe ser un número mayor que cero.');
      return;
    }

    if (!user?.id) {
      alert('Usuario no autenticado. Inicie sesión nuevamente.');
      return;
    }

    try {
      const created = await bankChargesService.create(user.id, {
        bank_id: form.banco,
        currency: form.moneda,
        amount: montoNumber,
        charge_date: form.fecha,
        ncf: form.ncf.trim(),
        description: form.descripcion.trim(),
        expense_account_code: form.cuentaGasto,
      });

      const mapped: BankCharge = {
        id: created.id,
        descripcion: created.description || form.descripcion.trim(),
        banco: created.bank_id || form.banco,
        moneda: created.currency || form.moneda,
        monto: Number(created.amount) || montoNumber,
        fecha: created.charge_date || form.fecha,
        ncf: created.ncf || form.ncf.trim(),
        cuentaGasto: created.expense_account_code || form.cuentaGasto,
      };

      setCharges(prev => [mapped, ...prev]);
      setForm(prev => ({
        ...prev,
        descripcion: '',
        monto: '',
        ncf: '',
      }));
    } catch (error: any) {
      console.error('Error creando cargo bancario:', error);
      alert(error?.message || 'Error al registrar el cargo bancario.');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Cargos Bancarios</h1>
          <p className="text-gray-600 text-sm max-w-3xl">
            Registre cargos y comisiones bancarias indicando el banco afectado, la moneda, el monto, el NCF y la cuenta de gastos financieros.
            Estos cargos, a nivel contable, acreditan la cuenta del banco y debitan la cuenta de gastos financieros seleccionada.
          </p>
        </div>

        {/* Formulario de registro */}
        <form onSubmit={handleAddCharge} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
          <h2 className="text-lg font-semibold mb-2">Registrar nuevo cargo bancario</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción del Cargo</label>
              <input
                type="text"
                value={form.descripcion}
                onChange={(e) => handleChange('descripcion', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: Comisión por manejo de cuenta"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Banco Afectado</label>
              <select
                value={form.banco}
                onChange={(e) => handleBankChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Seleccione un banco...</option>
                {banks.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.bank_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
              <input
                type="text"
                value={form.moneda}
                disabled
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto del Cargo</label>
              <input
                type="number" min="0"
                step="0.01"
                value={form.monto}
                onChange={(e) => handleChange('monto', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha del Cargo</label>
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => handleChange('fecha', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">NCF emitido por el Banco</label>
              <input
                type="text"
                value={form.ncf}
                onChange={(e) => handleChange('ncf', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: B01-00000000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta de Gastos Financieros (Débito)</label>
              <select
                value={form.cuentaGasto}
                onChange={(e) => handleChange('cuentaGasto', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Seleccione una cuenta...</option>
                {expenseAccounts.map(acc => (
                  <option key={acc.id} value={acc.code}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Registrar cargo
            </button>
          </div>
        </form>

        {/* Listado de cargos registrados */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Cargos registrados (solo en esta sesión)</h2>
            <span className="text-xs text-gray-500">Total: {charges.length}</span>
          </div>
          {charges.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">
              No hay cargos bancarios registrados aún.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Fecha</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Banco</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Descripción</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Monto</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Moneda</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">NCF</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Cuenta Gasto (Débito)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {charges.map(charge => {
                    const currencyLabel =
                      charge.moneda === 'DOP'
                        ? 'Peso Dominicano'
                        : charge.moneda === 'USD'
                        ? 'Dólar Estadounidense'
                        : charge.moneda === 'EUR'
                        ? 'Euro'
                        : charge.moneda;
                    return (
                      <tr key={charge.id}>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{charge.fecha}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{charge.banco}</td>
                        <td className="px-4 py-2 text-gray-900">{charge.descripcion}</td>
                        <td className="px-4 py-2 text-right text-gray-900">
                          {charge.moneda} {formatAmount(charge.monto)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{currencyLabel}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{charge.ncf || '-'}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{charge.cuentaGasto}</td>
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
