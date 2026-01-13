import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { bankCurrenciesService } from '../../services/database';

type BankCurrency = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  is_base: boolean;
  is_active: boolean;
  created_at: string;
};

type FormState = {
  code: string;
  name: string;
  symbol: string;
  is_base: boolean;
  is_active: boolean;
};

const initialFormState: FormState = {
  code: '',
  name: '',
  symbol: '',
  is_base: false,
  is_active: true,
};

export default function BankCurrenciesPage() {
  const { user } = useAuth();
  const [currencies, setCurrencies] = useState<BankCurrency[]>([]);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await bankCurrenciesService.getAll(user.id);
        setCurrencies(data as BankCurrency[]);
      } catch (e: any) {
        setError(e?.message || 'Error cargando monedas');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.id]);

  const handleChange = (field: keyof FormState, value: string | boolean) => {
    setForm(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    if (!form.code.trim() || !form.name.trim() || !form.symbol.trim()) {
      setError('Código, nombre y símbolo son obligatorios');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await bankCurrenciesService.create(user.id, {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        symbol: form.symbol.trim(),
        is_base: form.is_base,
        is_active: form.is_active,
      });

      setCurrencies(prev => [created as BankCurrency, ...prev]);
      setForm(initialFormState);
    } catch (e: any) {
      setError(e?.message || 'Error guardando la moneda');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Crear Moneda</h1>
          <p className="text-gray-600 text-sm">
            Pantalla para crear y administrar monedas utilizadas en el módulo de bancos.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-lg shadow p-4 space-y-4 lg:col-span-1"
          >
            <h2 className="text-lg font-semibold">Nueva moneda</h2>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Código (ISO)
              </label>
              <input
                type="text"
                maxLength={3}
                value={form.code}
                onChange={e => handleChange('code', e.target.value.toUpperCase())}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Ej: DOP, USD, EUR"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Nombre</label>
              <input
                type="text"
                value={form.name}
                onChange={e => handleChange('name', e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Peso Dominicano, Dólar Estadounidense, Euro, etc."
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Símbolo</label>
              <input
                type="text"
                maxLength={5}
                value={form.symbol}
                onChange={e => handleChange('symbol', e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="$, , €, etc."
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="inline-flex items-center text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_base}
                  onChange={e => handleChange('is_base', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2">Es moneda base</span>
              </label>

              <label className="inline-flex items-center text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => handleChange('is_active', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2">Activa</span>
              </label>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving || !user?.id}
                className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? 'Guardando...' : 'Guardar moneda'}
              </button>
            </div>
          </form>

          <div className="bg-white rounded-lg shadow p-4 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Monedas registradas</h2>
              {loading && (
                <span className="text-xs text-gray-500">Cargando...</span>
              )}
            </div>

            {currencies.length === 0 ? (
              <p className="text-sm text-gray-500">
                No hay monedas registradas todavía.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Código</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Nombre</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Símbolo</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Base</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Estado</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Creada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {currencies.map(currency => (
                      <tr key={currency.id}>
                        <td className="px-3 py-2 font-mono text-xs uppercase">{currency.code}</td>
                        <td className="px-3 py-2">{currency.name}</td>
                        <td className="px-3 py-2">{currency.symbol}</td>
                        <td className="px-3 py-2">
                          {currency.is_base ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              Base
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">
                              Secundaria
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {currency.is_active ? (
                            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                              Activa
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                              Inactiva
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {currency.created_at
                            ? new Date(currency.created_at).toLocaleDateString()
                            : ''}
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
    </DashboardLayout>
  );
}
