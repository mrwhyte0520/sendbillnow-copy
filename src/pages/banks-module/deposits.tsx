import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { bankAccountsService, bankDepositsService, chartAccountsService, journalEntriesService, financialReportsService } from '../../services/database';
import { formatAmount } from '../../utils/numberFormat';

interface BankDeposit {
  id: string;
  banco: string; // bank_id
  cuentaBanco: string; // bank_account_code (cuenta contable del banco)
  moneda: string; // currency
  monto: number; // amount
  fecha: string; // deposit_date (ISO)
  referencia: string; // referencia / número de depósito
  descripcion: string;
}

export default function BankDepositsPage() {
  const { user } = useAuth();
  const [deposits, setDeposits] = useState<BankDeposit[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [accountsById, setAccountsById] = useState<Record<string, { id: string; code: string; name: string }>>({});
  const [originAccounts, setOriginAccounts] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [form, setForm] = useState({
    banco: '',
    cuentaBanco: '',
    cuentaOrigen: '',
    moneda: 'DOP',
    monto: '',
    fecha: new Date().toISOString().slice(0, 10),
    referencia: '',
    descripcion: '',
  });

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleBankChange = (bankId: string) => {
    setForm((prev) => {
      const next = { ...prev, banco: bankId };
      const selectedBank = (banks || []).find((b: any) => b.id === bankId);
      if (selectedBank) {
        const accountId = selectedBank.chart_account_id as string | undefined;
        if (accountId) {
          const acc = accountsById[accountId];
          if (acc) {
            next.cuentaBanco = acc.code;
          }
        }
        if (selectedBank.currency) {
          next.moneda = selectedBank.currency;
        }
      }
      return next;
    });
  };

  useEffect(() => {
    const loadDeposits = async () => {
      if (!user?.id) return;
      const data = await bankDepositsService.getAll(user.id);
      const mapped: BankDeposit[] = (data || []).map((row: any) => ({
        id: row.id,
        banco: row.bank_id || '',
        cuentaBanco: row.bank_account_code || '',
        moneda: row.currency || 'DOP',
        monto: Number(row.amount) || 0,
        fecha: row.deposit_date || (row.created_at ? row.created_at.slice(0, 10) : ''),
        referencia: row.reference || '',
        descripcion: row.description || '',
      }));
      setDeposits(mapped);
    };

    loadDeposits();
  }, [user?.id]);

  useEffect(() => {
    const loadBanksAndAccounts = async () => {
      if (!user?.id) return;
      try {
        const [bankRows, chartRows] = await Promise.all([
          bankAccountsService.getAll(user.id),
          chartAccountsService.getAll(user.id),
        ]);

        setBanks(bankRows || []);

        const map: Record<string, { id: string; code: string; name: string }> = {};
        const origins: Array<{ id: string; code: string; name: string }> = [];

        (chartRows || []).forEach((acc: any) => {
          const mapped = {
            id: acc.id,
            code: acc.code,
            name: acc.name,
          };
          map[acc.id] = mapped;

          // Para depósitos, solo mostrar activos líquidos como origen:
          // - Caja (código empieza con 10)
          // - Otros Bancos (código empieza con 11, pero excluir el banco destino)
          // - Cuentas por Cobrar (código empieza con 110)
          // - Debe ser cuenta activa y permitir posteo
          const isAsset = acc.type === 'asset' || acc.type === 'activo';
          const code = String(acc.code || '').replace(/\./g, '');
          const isLiquidAsset = code.startsWith('10') || code.startsWith('11') || code.startsWith('110');
          
          if (acc.allowPosting && acc.isActive !== false && isAsset && isLiquidAsset) {
            origins.push(mapped);
          }
        });

        setAccountsById(map);
        setOriginAccounts(origins);
      } catch (error) {
        console.error('Error cargando bancos y cuentas contables para depósitos', error);
      }
    };

    loadBanksAndAccounts();
  }, [user?.id]);

  // La moneda se asume desde la configuración del banco (campo currency en bank_accounts)

  const handleAddDeposit = async (e: React.FormEvent) => {
    e.preventDefault();

    const montoNumber = Number(form.monto);
    if (!form.banco || !form.cuentaBanco || !form.cuentaOrigen || !form.moneda || !form.fecha) {
      alert('Complete banco, cuenta de banco, cuenta de origen, moneda y fecha.');
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
      // Validar saldo disponible en cuenta de origen
      const originAcct = originAccounts.find((acc) => acc.code === form.cuentaOrigen);
      if (originAcct) {
        const saldoDisponible = await financialReportsService.getAccountBalance(user.id, originAcct.id);
        
        if (saldoDisponible < montoNumber) {
          alert(
            `❌ Saldo insuficiente en cuenta de origen\n\n` +
            `Cuenta: ${originAcct.code} - ${originAcct.name}\n` +
            `Saldo disponible: RD$${formatAmount(saldoDisponible)}\n` +
            `Monto a depositar: RD$${formatAmount(montoNumber)}\n\n` +
            `No puede depositar más dinero del que tiene disponible.`
          );
          return;
        }
      }

      const created = await bankDepositsService.create(user.id, {
        bank_id: form.banco,
        bank_account_code: form.cuentaBanco,
        currency: form.moneda,
        amount: montoNumber,
        deposit_date: form.fecha,
        reference: form.referencia.trim(),
        description: form.descripcion.trim(),
      });

      const mapped: BankDeposit = {
        id: created.id,
        banco: created.bank_id || form.banco,
        cuentaBanco: created.bank_account_code || form.cuentaBanco,
        moneda: created.currency || form.moneda,
        monto: Number(created.amount) || montoNumber,
        fecha: created.deposit_date || form.fecha,
        referencia: created.reference || form.referencia.trim(),
        descripcion: created.description || form.descripcion.trim(),
      };

      setDeposits(prev => [mapped, ...prev]);

      // Crear asiento contable: Debe banco, Haber cuenta de origen
      const selectedBank = (banks || []).find((b: any) => b.id === form.banco);
      const bankAccountId = selectedBank?.chart_account_id as string | undefined;
      const originAccount = originAccounts.find((acc) => acc.code === form.cuentaOrigen);

      if (bankAccountId && originAccount) {
        const entryNumber = `DEP-${new Date(form.fecha).toISOString().slice(0, 10)}-${(created.id || '').slice(0, 6)}`;

        await journalEntriesService.createWithLines(user.id, {
          entry_number: entryNumber,
          entry_date: form.fecha,
          description: form.descripcion.trim() || `Depósito bancario ${form.referencia || ''}`.trim(),
          reference: form.referencia.trim() || null,
          status: 'posted',
        }, [
          {
            account_id: bankAccountId,
            description: `Depósito en banco ${selectedBank?.bank_name || ''}`.trim(),
            debit_amount: montoNumber,
            credit_amount: 0,
          },
          {
            account_id: originAccount.id,
            description: `Cuenta de origen ${originAccount.code}`,
            debit_amount: 0,
            credit_amount: montoNumber,
          },
        ]);
      }

      setForm(prev => ({
        ...prev,
        monto: '',
        referencia: '',
        descripcion: '',
      }));
    } catch (error: any) {
      console.error('Error creando depósito bancario:', error);
      alert(error?.message || 'Error al registrar el depósito bancario.');
    }
  };

  const selectedBank = (banks || []).find((b: any) => b.id === form.banco);
  const bankAccountLabel = (() => {
    if (selectedBank?.chart_account_id) {
      const acc = accountsById[selectedBank.chart_account_id];
      if (acc) {
        return `${acc.code} - ${acc.name}`;
      }
    }
    return form.cuentaBanco;
  })();

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Depósitos Bancarios</h1>
          <p className="text-gray-600 text-sm max-w-3xl">
            Registre los depósitos realizados en las cuentas bancarias indicando banco, cuenta contable, moneda,
            monto, fecha y referencia. Estos depósitos, a nivel contable, debitan la cuenta del banco y acreditan
            la cuenta de origen correspondiente.
          </p>
        </div>

        {/* Formulario de registro */}
        <form onSubmit={handleAddDeposit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
          <h2 className="text-lg font-semibold mb-2">Registrar nuevo depósito bancario</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Banco</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta de Banco (Cuenta Contable)</label>
              <input
                type="text"
                value={bankAccountLabel || ''}
                disabled
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-700"
                placeholder="Se asigna automáticamente según el banco seleccionado"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta de Origen (Crédito)</label>
              <select
                value={form.cuentaOrigen}
                onChange={(e) => handleChange('cuentaOrigen', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Seleccione una cuenta...</option>
                {originAccounts.map((acc) => (
                  <option key={acc.id} value={acc.code}>
                    {acc.code} - {acc.name}
                  </option>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto del Depósito</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha del Depósito</label>
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => handleChange('fecha', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Referencia / Número de Depósito</label>
              <input
                type="text"
                value={form.referencia}
                onChange={(e) => handleChange('referencia', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: DEP-0001"
              />
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <input
                type="text"
                value={form.descripcion}
                onChange={(e) => handleChange('descripcion', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: Depósito de ventas del día"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Registrar depósito
            </button>
          </div>
        </form>

        {/* Listado de depósitos registrados */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Depósitos registrados</h2>
            <span className="text-xs text-gray-500">Total: {deposits.length}</span>
          </div>
          {deposits.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">
              No hay depósitos bancarios registrados aún.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Fecha</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Banco</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Cuenta de Banco</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Monto</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Moneda</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Referencia</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {deposits.map(dep => {
                    const currencyLabel =
                      dep.moneda === 'DOP'
                        ? 'Peso Dominicano'
                        : dep.moneda === 'USD'
                        ? 'Dólar Estadounidense'
                        : dep.moneda === 'EUR'
                        ? 'Euro'
                        : dep.moneda;
                    return (
                      <tr key={dep.id}>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{dep.fecha}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{dep.banco}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{dep.cuentaBanco}</td>
                        <td className="px-4 py-2 text-right text-gray-900">
                          {dep.moneda} {formatAmount(dep.monto)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{currencyLabel}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{dep.referencia || '-'}</td>
                        <td className="px-4 py-2 text-gray-900">{dep.descripcion}</td>
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
