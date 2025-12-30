import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';
import { bankAccountsService, chartAccountsService } from '../../../services/database';
import { formatMoney, getCurrencyPrefix } from '../../../utils/numberFormat';

interface Bank {
  id: string;
  name: string;
  account_number: string;
  account_type: string;
  balance: number;
  currency: string;
  is_active: boolean;
  bank_code: string;
  swift_code?: string;
  contact_info?: string;
  created_at: string;
  chart_account_id?: string | null;
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

export default function BanksPage() {
  const { user } = useAuth();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  
  const [showBankModal, setShowBankModal] = useState(false);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState('DOP');

  // Función para formatear moneda
  const formatCurrency = (value: number, currency: string = 'DOP') => {
    const label = getCurrencyPrefix(currency);
    return formatMoney(value, label);
  };

  const loadBanks = async () => {
    if (!user?.id) {
      setBanks([]);
      return;
    }
    try {
      const today = new Date().toISOString().slice(0, 10);
      const rows = await bankAccountsService.getBalancesAsOf(user.id, today);
      const mapped: Bank[] = (rows || []).map((b: any) => ({
        id: b.id,
        name: b.bank_name,
        account_number: b.account_number,
        account_type: b.account_type,
        balance: Number(b.accounting_balance ?? 0),
        currency: b.currency || 'DOP',
        is_active: b.is_active !== false,
        bank_code: b.bank_code || '',
        swift_code: b.swift_bic || '',
        contact_info: b.contact_info || '',
        created_at: b.created_at,
        chart_account_id: b.chart_account_id ?? null,
      }));
      setBanks(mapped);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading bank accounts', error);
      setBanks([]);
    }
  };

  useEffect(() => {
    loadBanks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const loadAccounts = async () => {
      if (!user?.id) return;
      setLoadingAccounts(true);
      try {
        const data = await chartAccountsService.getAll(user.id);
        const opts: AccountOption[] = (data || [])
          .filter((acc: any) =>
            acc.isBankAccount &&          // marcadas como cuentas bancarias
            acc.allowPosting &&           // permiten movimientos
            acc.isActive !== false        // y están activas
          )
          .map((acc: any) => ({
            id: acc.id,
            code: acc.code,
            name: acc.name,
          }));
        setAccounts(opts);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading chart of accounts for banks', error);
      } finally {
        setLoadingAccounts(false);
      }
    };

    loadAccounts();
  }, [user?.id]);

  // Función para manejar el envío del formulario
  const handleSubmitBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      toast.error('Debes iniciar sesión para guardar bancos');
      return;
    }

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const currency = (formData.get('currency') as string) || 'DOP';
    const chartAccountId = (formData.get('chart_account_id') as string) || null;

    // Validar que si la moneda es diferente a DOP, debe tener cuenta contable
    if (currency !== 'DOP' && !chartAccountId) {
      toast.error('Para bancos en moneda extranjera es obligatorio asignar una cuenta contable');
      return;
    }

    const initialBalance = parseFloat((formData.get('balance') as string) || '0') || 0;

    try {
      const payloadBase = {
        bank_name: formData.get('name') as string,
        account_number: formData.get('account_number') as string,
        account_type: formData.get('account_type') as string,
        currency: currency,
        bank_code: formData.get('bank_code') as string,
        swift_bic: (formData.get('swift_code') as string) || '',
        contact_info: (formData.get('contact_info') as string) || '',
        chart_account_id: chartAccountId,
      };

      if (editingBank) {
        // En edición no tocamos initial_balance ni current_balance, solo los demás datos
        await bankAccountsService.update(editingBank.id, payloadBase as any);
        toast.success('Banco actualizado correctamente');
      } else {
        await bankAccountsService.create(user.id, {
          ...payloadBase,
          initial_balance: initialBalance,
          current_balance: initialBalance,
          is_active: true,
        } as any);
        toast.success('Banco agregado correctamente');
      }

      await loadBanks();
      setShowBankModal(false);
      setEditingBank(null);
      form.reset();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error saving bank account', error);
      toast.error('Error al guardar el banco');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestión Bancaria</h1>
            <p className="text-gray-600 mt-1">Bancos registrados</p>
          </div>
          <button
            onClick={() => {
              setSelectedCurrency('DOP');
              setShowBankModal(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Agregar Banco
          </button>
        </div>

        {/* Lista de Bancos */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Banco</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Número de Cuenta</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {banks.map((bank) => (
                  <tr key={bank.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-medium">{bank.name.charAt(0)}</span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{bank.name}</div>
                          <div className="text-sm text-gray-500">{bank.bank_code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{bank.account_number}</div>
                      <div className="text-sm text-gray-500">{bank.swift_code || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        bank.account_type === 'checking' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {bank.account_type === 'checking' ? 'Corriente' : 'Ahorros'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="text-gray-900">{formatCurrency(bank.balance, bank.currency)}</div>
                      <div className="text-gray-500 text-xs">{bank.currency}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBank(bank);
                          setSelectedCurrency(bank.currency || 'DOP');
                          setShowBankModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      {/* Modal para agregar banco */}
      {showBankModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-900">{editingBank ? 'Editar Banco' : 'Nuevo Banco'}</h2>
                <button
                  onClick={() => {
                    setShowBankModal(false);
                    setEditingBank(null);
                    setSelectedCurrency('DOP');
                  }}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <span className="sr-only">Cerrar</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
                
                <form onSubmit={handleSubmitBank} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Nombre del Banco *
                      </label>
                      <input
                        type="text"
                        name="name"
                        defaultValue={editingBank?.name || ''}
                        required
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Ej: Banco Popular"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Número de Cuenta *
                      </label>
                      <input
                        type="text"
                        name="account_number"
                        defaultValue={editingBank?.account_number || ''}
                        required
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Ej: 1234567890"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tipo de Cuenta *
                      </label>
                      <select
                        name="account_type"
                        required
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                        defaultValue={editingBank?.account_type || 'checking'}
                      >
                        <option value="checking">Cuenta Corriente</option>
                        <option value="savings">Cuenta de Ahorros</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Moneda *
                      </label>
                      <select
                        name="currency"
                        required
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                        defaultValue={editingBank?.currency || 'DOP'}
                        onChange={(e) => setSelectedCurrency(e.target.value)}
                      >
                        <option value="DOP">Peso Dominicano (DOP)</option>
                        <option value="USD">Dólar Estadounidense (USD)</option>
                        <option value="EUR">Euro (EUR)</option>
                      </select>
                      {selectedCurrency !== 'DOP' && (
                        <p className="mt-1 text-xs text-orange-600 font-medium">
                          <i className="ri-alert-line mr-1"></i>
                          Moneda extranjera: debe asignar cuenta contable obligatoriamente
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {editingBank ? 'Saldo actual' : 'Saldo Inicial *'}
                      </label>
                      <input
                        type="number"
                        name="balance"
                        step="0.01"
                        min="0"
                        required={!editingBank}
                        readOnly={!!editingBank}
                        className={
                          "w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" +
                          (editingBank ? " bg-gray-100 text-gray-500" : "")
                        }
                        placeholder="0.00"
                        defaultValue={editingBank ? String(editingBank.balance) : ''}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                        Código del Banco *
                        <span className="ml-2 group relative">
                          <i className="ri-information-line text-blue-500 cursor-help"></i>
                          <div className="hidden group-hover:block absolute left-0 top-6 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-10">
                            <p className="font-semibold mb-1">¿Qué es el código del banco?</p>
                            <p>Es el identificador único del banco en República Dominicana. Ejemplos:</p>
                            <ul className="mt-1 space-y-1">
                              <li>• BPDO - Banco Popular</li>
                              <li>• BHD - BHD León</li>
                              <li>• BDI - Banco BDI</li>
                              <li>• BANRESERVAS - Banreservas</li>
                            </ul>
                          </div>
                        </span>
                      </label>
                      <input
                        type="text"
                        name="bank_code"
                        defaultValue={editingBank?.bank_code || ''}
                        required
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Ej: BPDO, BHD, BANRESERVAS"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Código de identificación del banco (generalmente 3-4 letras)
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Código SWIFT/BIC
                      </label>
                      <input
                        type="text"
                        name="swift_code"
                        defaultValue={editingBank?.swift_code || ''}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Ej: BPDODOSX"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Información de Contacto
                      </label>
                      <input
                        type="email"
                        name="contact_info"
                        defaultValue={editingBank?.contact_info || ''}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Ej: contacto@bancopopular.com"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Cuenta Contable del Banco {selectedCurrency !== 'DOP' && <span className="text-red-500">*</span>}
                      </label>
                      {loadingAccounts ? (
                        <p className="text-sm text-gray-500">Cargando plan de cuentas...</p>
                      ) : (
                        <select
                          name="chart_account_id"
                          required={selectedCurrency !== 'DOP'}
                          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8 ${
                            selectedCurrency !== 'DOP' ? 'border-orange-300 bg-orange-50' : 'border-gray-300'
                          }`}
                          defaultValue={editingBank ? (editingBank as any).chart_account_id || '' : ''}
                        >
                          <option value="">
                            {selectedCurrency !== 'DOP' 
                              ? 'Seleccionar cuenta contable (OBLIGATORIO)' 
                              : 'Seleccionar cuenta contable (opcional)'}
                          </option>
                          {accounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.code} - {acc.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <p className="mt-1 text-xs text-gray-500">
                        {selectedCurrency !== 'DOP' 
                          ? '⚠️ Obligatorio para bancos en moneda extranjera. Esta cuenta se usará para los asientos contables.' 
                          : 'Esta cuenta se usará para los asientos contables de este banco (opcional para DOP).'}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 pt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setShowBankModal(false);
                        setSelectedCurrency('DOP');
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      Guardar Banco
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
