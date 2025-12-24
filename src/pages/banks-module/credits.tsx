import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { bankAccountsService, bankCreditsService, chartAccountsService } from '../../services/database';
import { formatAmount } from '../../utils/numberFormat';

interface BankCredit {
  id: string;
  banco: string; // bank_id
  cuentaBanco: string; // bank_account_code
  numeroCredito: string; // credit_number
  moneda: string; // currency
  monto: number; // amount
  fechaInicio: string; // start_date (ISO)
  tasaInteres?: number | null; // interest_rate
  descripcion: string;
  estado: string; // status
}

export default function BankCreditsPage() {
  const { user } = useAuth();
  const [credits, setCredits] = useState<BankCredit[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [accountsById, setAccountsById] = useState<Record<string, { id: string; code: string; name: string }>>({});
  const [loanAccounts, setLoanAccounts] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [postableAccounts, setPostableAccounts] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [form, setForm] = useState({
    tipoCredito: 'intereses_ganados',
    banco: '',
    cuentaBanco: '',
    numeroCredito: '',
    cuentaContrapartida: '',
    moneda: 'DOP',
    monto: '',
    fechaInicio: new Date().toISOString().slice(0, 10),
    tasaInteres: '',
    descripcion: '',
  });

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleBankChange = (bankId: string) => {
    setForm(prev => {
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
    const loadCredits = async () => {
      if (!user?.id) return;
      const data = await bankCreditsService.getAll(user.id);
      const mapped: BankCredit[] = (data || []).map((row: any) => ({
        id: row.id,
        banco: row.bank_id || '',
        cuentaBanco: row.bank_account_code || '',
        numeroCredito: row.credit_number || '',
        moneda: row.currency || 'DOP',
        monto: Number(row.amount) || 0,
        fechaInicio: row.start_date || (row.created_at ? row.created_at.slice(0, 10) : ''),
        tasaInteres: row.interest_rate != null ? Number(row.interest_rate) : null,
        descripcion: row.description || '',
        estado: row.status || 'active',
      }));
      setCredits(mapped);
    };

    loadCredits();
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
        const loans: Array<{ id: string; code: string; name: string }> = [];
        const postables: Array<{ id: string; code: string; name: string }> = [];

        (chartRows || []).forEach((acc: any) => {
          const mapped = {
            id: acc.id,
            code: acc.code,
            name: acc.name,
          };
          map[acc.id] = mapped;

          if (acc.allowPosting && acc.isActive !== false) {
            postables.push(mapped);
          }

          if (acc.allowPosting && acc.isActive !== false && acc.type === 'liability') {
            loans.push(mapped);
          }
        });

        setAccountsById(map);
        setLoanAccounts(loans);
        setPostableAccounts(postables);
      } catch (error) {
        console.error('Error cargando bancos y cuentas contables para créditos', error);
      }
    };

    loadBanksAndAccounts();
  }, [user?.id]);

  // Moneda se toma de la configuración del banco seleccionado; no es necesario cargar catálogo de monedas aquí

  const handleAddCredit = async (e: React.FormEvent) => {
    e.preventDefault();

    const montoNumber = Number(form.monto);
    const tasaNumber = form.tasaInteres ? Number(form.tasaInteres) : null;

    if (!form.banco || !form.cuentaBanco || !form.numeroCredito.trim() || !form.cuentaContrapartida || !form.moneda || !form.fechaInicio) {
      alert('Complete banco, cuenta de banco, número de crédito, cuenta de contrapartida, moneda y fecha de inicio.');
      return;
    }
    if (isNaN(montoNumber) || montoNumber <= 0) {
      alert('El monto debe ser un número mayor que cero.');
      return;
    }
    if (form.tasaInteres && (isNaN(tasaNumber as number) || (tasaNumber as number) < 0)) {
      alert('La tasa de interés debe ser un número mayor o igual a cero.');
      return;
    }

    if (!user?.id) {
      alert('Usuario no autenticado. Inicie sesión nuevamente.');
      return;
    }

    try {
      const created = await bankCreditsService.create(user.id, {
        bank_id: form.banco,
        bank_account_code: form.cuentaBanco,
        credit_type: form.tipoCredito,
        credit_number: form.numeroCredito.trim(),
        currency: form.moneda,
        amount: montoNumber,
        start_date: form.fechaInicio,
        interest_rate: tasaNumber,
        description: form.descripcion.trim(),
        contrapartida_account_code: form.cuentaContrapartida,
      });

      const mapped: BankCredit = {
        id: created.id,
        banco: created.bank_id || form.banco,
        cuentaBanco: created.bank_account_code || form.cuentaBanco,
        numeroCredito: created.credit_number || form.numeroCredito.trim(),
        moneda: created.currency || form.moneda,
        monto: Number(created.amount) || montoNumber,
        fechaInicio: created.start_date || form.fechaInicio,
        tasaInteres: created.interest_rate != null ? Number(created.interest_rate) : tasaNumber,
        descripcion: created.description || form.descripcion.trim(),
        estado: created.status || 'active',
      };

      setCredits(prev => [mapped, ...prev]);
      setForm(prev => ({
        ...prev,
        numeroCredito: '',
        cuentaContrapartida: '',
        monto: '',
        tasaInteres: '',
        descripcion: '',
      }));
      alert('Crédito bancario registrado exitosamente');
    } catch (error: any) {
      console.error('Error creando crédito bancario:', error);
      alert(error?.message || 'Error al registrar el crédito bancario.');
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
          <h1 className="text-2xl font-bold mb-2">Créditos Bancarios</h1>
          <p className="text-gray-600 text-sm max-w-3xl">
            Registre créditos bancarios (valores que el banco acredita a su cuenta) como intereses ganados, 
            cheques devueltos, reclamaciones, etc. Indique banco, tipo de crédito, cuenta contable de contrapartida, 
            moneda, monto y descripción.
          </p>
        </div>

        {/* Formulario de registro */}
        <form onSubmit={handleAddCredit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
          <h2 className="text-lg font-semibold mb-2">Registrar nuevo crédito bancario</h2>

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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Crédito *
                <span className="ml-2 text-xs text-gray-500">(Valores que el banco acredita a su cuenta)</span>
              </label>
              <select
                value={form.tipoCredito}
                onChange={(e) => handleChange('tipoCredito', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="intereses_ganados">Intereses Ganados</option>
                <option value="cheques_devueltos">Cheques Devueltos</option>
                <option value="reclamaciones">Reclamaciones</option>
                <option value="otros">Otros Créditos</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cuenta Contable de Contrapartida (Crédito) *
                <span className="ml-2 text-xs text-gray-500">
                  {form.tipoCredito === 'intereses_ganados' && '(Ej: Ingresos por Intereses)'}
                  {form.tipoCredito === 'cheques_devueltos' && '(Ej: Cuentas por Cobrar)'}
                  {form.tipoCredito === 'reclamaciones' && '(Ej: Otros Ingresos)'}
                </span>
              </label>
              <select
                value={form.cuentaContrapartida}
                onChange={(e) => handleChange('cuentaContrapartida', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Seleccione una cuenta...</option>
                {postableAccounts.map((acc) => (
                  <option key={acc.id} value={acc.code}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Catálogo completo de cuentas disponible. El crédito aumenta el banco (Débito) y acredita esta cuenta.
              </p>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Número/Referencia de Crédito *</label>
              <input
                type="text"
                value={form.numeroCredito}
                onChange={(e) => handleChange('numeroCredito', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: INT-2024-12, CHQ-DEV-001"
              />
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto del Crédito *</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha del Crédito *</label>
              <input
                type="date"
                value={form.fechaInicio}
                onChange={(e) => handleChange('fechaInicio', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {form.tipoCredito === 'intereses_ganados' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tasa de Interés (% anual, opcional)</label>
                <input
                  type="number" min="0"
                  step="0.01"
                  value={form.tasaInteres}
                  onChange={(e) => handleChange('tasaInteres', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ej: 2.50"
                />
              </div>
            )}

            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción / Concepto</label>
              <input
                type="text"
                value={form.descripcion}
                onChange={(e) => handleChange('descripcion', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={
                  form.tipoCredito === 'intereses_ganados' ? 'Ej: Intereses del mes de diciembre 2024' :
                  form.tipoCredito === 'cheques_devueltos' ? 'Ej: Cheque #1234 devuelto por fondos insuficientes' :
                  form.tipoCredito === 'reclamaciones' ? 'Ej: Reclamación por cargo indebido' :
                  'Ej: Descripción del crédito bancario'
                }
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Registrar crédito
            </button>
          </div>
        </form>

        {/* Listado de créditos bancarios */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Créditos registrados</h2>
            <span className="text-xs text-gray-500">Total: {credits.length}</span>
          </div>
          {credits.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">
              No hay créditos bancarios registrados aún.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Fecha Inicio</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Banco</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Cuenta de Banco</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Nº Crédito</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Monto</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Moneda</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Tasa %</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Estado</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {credits.map(cr => {
                    const currencyLabel =
                      cr.moneda === 'DOP'
                        ? 'Peso Dominicano'
                        : cr.moneda === 'USD'
                        ? 'Dólar Estadounidense'
                        : cr.moneda === 'EUR'
                        ? 'Euro'
                        : cr.moneda;
                    const statusLabel =
                      cr.estado === 'active'
                        ? 'Activo'
                        : cr.estado === 'cancelled'
                        ? 'Cancelado'
                        : cr.estado;
                    return (
                      <tr key={cr.id}>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{cr.fechaInicio}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{cr.banco}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{cr.cuentaBanco}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{cr.numeroCredito}</td>
                        <td className="px-4 py-2 text-right text-gray-900">
                          {cr.moneda} {formatAmount(cr.monto)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{currencyLabel}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{cr.tasaInteres != null ? formatAmount(cr.tasaInteres) : '-'}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">{statusLabel}</td>
                        <td className="px-4 py-2 text-gray-900">{cr.descripcion}</td>
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
