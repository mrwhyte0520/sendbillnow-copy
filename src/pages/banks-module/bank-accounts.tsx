import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth';
import {
  bankAccountsService,
  chartAccountsService,
  bankCurrenciesService,
  bankExchangeRatesService,
  bankReconciliationService,
} from '../../services/database';
import { formatMoney } from '../../utils/numberFormat';

interface Bank {
  id: string;
  name: string;
  account_number: string;
  account_type: string;
  balance: number;
  currency: string;
  baseBalance?: number | null;
  is_active: boolean;
  bank_code: string;
  swift_code?: string;
  contact_info?: string;
  rnc?: string | null;
  address?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_fax?: string | null;
  contact_email?: string | null;
  created_at: string;
  chart_account_id?: string | null;
  use_payment_requests?: boolean;
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

export default function BankAccountsPage() {
  const { user } = useAuth();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [baseCurrencyCode, setBaseCurrencyCode] = useState<string>('DOP');
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const [showBankModal, setShowBankModal] = useState(false);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);

  // Estados para campos con máscara
  const [phoneValue, setPhoneValue] = useState('');
  const [faxValue, setFaxValue] = useState('');
  const [rncValue, setRncValue] = useState('');
  const [balanceValue, setBalanceValue] = useState('');

  // Formatear teléfono: 809-000-0000
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  // Formatear RNC: 1-01-12345-6
  const formatRNC = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 1) return digits;
    if (digits.length <= 3) return `${digits.slice(0, 1)}-${digits.slice(1)}`;
    if (digits.length <= 8) return `${digits.slice(0, 1)}-${digits.slice(1, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 1)}-${digits.slice(1, 3)}-${digits.slice(3, 8)}-${digits.slice(8)}`;
  };

  // Formatear monto con separadores de miles: 1,000.00
  const formatAmount = (value: string) => {
    // Remover todo excepto dígitos y punto
    let cleaned = value.replace(/[^\d.]/g, '');
    // Solo permitir un punto decimal
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    // Separar enteros y decimales
    const [intPart, decPart] = cleaned.split('.');
    // Formatear con comas
    const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (decPart !== undefined) {
      return `${formatted}.${decPart.slice(0, 2)}`;
    }
    return formatted;
  };

  // Obtener valor numérico del monto formateado
  const parseFormattedAmount = (value: string) => {
    return parseFloat(value.replace(/,/g, '')) || 0;
  };

  const formatCurrency = (value: number, currency: string = 'DOP') => {
    const label = currency === 'DOP' ? 'RD$' : currency === 'USD' ? '$' : currency;
    return formatMoney(value, label);
  };

  const loadBanks = async () => {
    if (!user?.id) {
      setBanks([]);
      return;
    }
    try {
      const uid = user.id;

      const [rows, currs] = await Promise.all([
        bankAccountsService.getAll(uid),
        bankCurrenciesService.getAll(uid),
      ]);

      type CurrencyInfo = { code: string; is_base: boolean; is_active: boolean };

      const mappedCurrencies: CurrencyInfo[] = ((currs as any[]) || [])
        .map((c: any): CurrencyInfo => ({
          code: c.code as string,
          is_base: !!c.is_base,
          is_active: c.is_active !== false,
        }))
        .filter((c: CurrencyInfo) => c.is_active);

      const baseCurrency = mappedCurrencies.find((c: CurrencyInfo) => c.is_base) || mappedCurrencies[0];
      const baseCode = baseCurrency?.code || 'DOP';
      setBaseCurrencyCode(baseCode);

      const today = new Date().toISOString().slice(0, 10);

      const mapped: Bank[] = await Promise.all((rows || []).map(async (b: any) => {
        let balance = Number(b.current_balance ?? b.initial_balance ?? 0);
        const currency = (b.currency as string) || baseCode;
        const bankId = b.id as string;

        try {
          if (bankId) {
            const bookBalance = await bankReconciliationService.getBookBalanceForBankAccount(
              uid,
              bankId,
              today,
            );
            if (bookBalance !== null && !Number.isNaN(bookBalance)) {
              balance = bookBalance;
            }
          }
        } catch (error) {
          console.error('Error calculando saldo contable para banco', error);
        }

        let baseBalance: number | null = balance;

        if (currency !== baseCode) {
          try {
            const rate = await bankExchangeRatesService.getEffectiveRate(
              uid,
              currency,
              baseCode,
              today,
            );
            if (rate && rate > 0) {
              baseBalance = balance * rate;
            } else {
              baseBalance = null;
            }
          } catch (fxError) {
            // eslint-disable-next-line no-console
            console.error('Error calculando equivalente en moneda base para banco', fxError);
            baseBalance = null;
          }
        }

        return {
          id: b.id,
          name: b.bank_name,
          account_number: b.account_number,
          account_type: b.account_type,
          balance,
          currency,
          baseBalance,
          is_active: b.is_active !== false,
          bank_code: b.bank_code || '',
          swift_code: b.swift_bic || '',
          contact_info: b.contact_info || '',
          rnc: b.rnc ?? null,
          address: b.address ?? null,
          contact_name: b.contact_name ?? null,
          contact_phone: b.contact_phone ?? null,
          contact_fax: b.contact_fax ?? null,
          contact_email: b.contact_email ?? null,
          created_at: b.created_at,
          chart_account_id: b.chart_account_id ?? null,
          use_payment_requests: b.use_payment_requests === true,
        } as Bank;
      }));

      setBanks(mapped);
    } catch (error) {
      console.error('Error loading bank accounts', error);
      setBanks([]);
    }
  };

  useEffect(() => {
    loadBanks();
  }, [user?.id]);

  useEffect(() => {
    const loadAccounts = async () => {
      if (!user?.id) return;
      setLoadingAccounts(true);
      try {
        const data = await chartAccountsService.getAll(user.id);
        const opts: AccountOption[] = (data || [])
          .filter(
            (acc: any) =>
              acc.isBankAccount && acc.allowPosting && acc.isActive !== false
          )
          .map((acc: any) => ({
            id: acc.id,
            code: acc.code,
            name: acc.name,
          }));
        setAccounts(opts);
      } catch (error) {
        console.error('Error loading chart of accounts for banks', error);
      } finally {
        setLoadingAccounts(false);
      }
    };

    loadAccounts();
  }, [user?.id]);

  const handleDeleteBank = async (bank: Bank) => {
    if (!confirm(`¿Eliminar la cuenta bancaria "${bank.name}" (${bank.account_number})?`)) return;

    try {
      await bankAccountsService.delete(bank.id);
      toast.success('Cuenta bancaria eliminada correctamente');
      await loadBanks();
    } catch (error: any) {
      console.error('Error deleting bank account', error);
      const message = error?.message || 'No se pudo eliminar la cuenta bancaria. Verifique si tiene movimientos o relaciones activas.';
      toast.error(message);
    }
  };

  const handleSubmitBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      toast.error('Debes iniciar sesión para guardar bancos');
      return;
    }

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const initialBalance =
      parseFloat((formData.get('balance') as string) || '0') || 0;
    const chartAccountId = (formData.get('chart_account_id') as string) || null;
    const usePaymentRequests = formData.get('use_payment_requests') === 'on';

    if (!chartAccountId) {
      toast.error('Debes seleccionar una cuenta contable para el banco');
      return;
    }

    try {
      const payloadBase = {
        bank_name: formData.get('name') as string,
        account_number: formData.get('account_number') as string,
        account_type: formData.get('account_type') as string,
        currency: (formData.get('currency') as string) || 'DOP',
        bank_code: formData.get('bank_code') as string,
        swift_bic: (formData.get('swift_code') as string) || '',
        contact_info: (formData.get('contact_info') as string) || '',
        rnc: (formData.get('rnc') as string) || null,
        address: (formData.get('address') as string) || null,
        contact_name: (formData.get('contact_name') as string) || null,
        contact_phone: (formData.get('contact_phone') as string) || null,
        contact_fax: (formData.get('contact_fax') as string) || null,
        contact_email: (formData.get('contact_email') as string) || null,
        chart_account_id: chartAccountId,
        use_payment_requests: usePaymentRequests,
      };

      if (editingBank) {
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
              setEditingBank(null);
              setPhoneValue('');
              setFaxValue('');
              setRncValue('');
              setBalanceValue('');
              setShowBankModal(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center"
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            Agregar Banco
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Banco
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Número de Cuenta
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Moneda / SWIFT
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Saldo
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {banks.map((bank) => (
                  <tr key={bank.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-medium">
                            {bank.name.charAt(0)}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {bank.name}
                          </div>
                          <div className="text-sm text-gray-500">{bank.bank_code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {bank.account_number}
                      </div>
                      <div className="text-sm text-gray-500">
                        {bank.rnc ? `RNC: ${bank.rnc}` : ''}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{bank.currency}</div>
                      <div className="text-sm text-gray-500">
                        {bank.swift_code ? `SWIFT/BIC: ${bank.swift_code}` : 'SWIFT/BIC: N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          bank.account_type === 'checking'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {bank.account_type === 'checking'
                          ? 'Corriente'
                          : 'Ahorros'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="text-gray-900">
                        {formatCurrency(bank.balance, bank.currency)}
                      </div>
                      {bank.baseBalance != null && bank.currency !== baseCurrencyCode && (
                        <div className="text-gray-500 text-xs">
                          ≈ {formatCurrency(bank.baseBalance, baseCurrencyCode)}
                        </div>
                      )}
                      <div className="text-gray-500 text-xs">{bank.currency}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBank(bank);
                            setPhoneValue(bank.contact_phone ? formatPhone(bank.contact_phone) : '');
                            setFaxValue(bank.contact_fax ? formatPhone(bank.contact_fax) : '');
                            setRncValue(bank.rnc ? formatRNC(bank.rnc) : '');
                            setBalanceValue(formatAmount(String(bank.balance)));
                            setShowBankModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBank(bank)}
                          className="text-red-600 hover:text-red-800 text-xs font-medium"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showBankModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {editingBank ? 'Editar Banco' : 'Nuevo Banco'}
                  </h2>
                  <button
                    onClick={() => {
                      setShowBankModal(false);
                      setEditingBank(null);
                    }}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <span className="sr-only">Cerrar</span>
                    <svg
                      className="h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
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
                      >
                        <option value="DOP">Peso Dominicano (DOP)</option>
                        <option value="USD">Dólar Estadounidense (USD)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {editingBank ? 'Saldo actual' : 'Saldo Inicial *'}
                      </label>
                      <input
                        type="text"
                        name="balance_display"
                        required={!editingBank}
                        readOnly={!!editingBank}
                        className={
                          'w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500' +
                          (editingBank ? ' bg-gray-100 text-gray-500' : '')
                        }
                        placeholder="0.00"
                        value={balanceValue}
                        onChange={(e) => setBalanceValue(formatAmount(e.target.value))}
                      />
                      <input type="hidden" name="balance" value={parseFormattedAmount(balanceValue)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Código del Banco *
                      </label>
                      <input
                        type="text"
                        name="bank_code"
                        defaultValue={editingBank?.bank_code || ''}
                        required
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Ej: BPDO"
                      />
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
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        RNC del Banco
                      </label>
                      <input
                        type="text"
                        name="rnc"
                        value={rncValue}
                        onChange={(e) => setRncValue(formatRNC(e.target.value))}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Ej: 1-01-12345-6"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Dirección del Banco
                      </label>
                      <input
                        type="text"
                        name="address"
                        defaultValue={editingBank?.address || ''}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Ej: Av. Winston Churchill #123, Santo Domingo"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Nombre del Manejador de Cuenta
                      </label>
                      <input
                        type="text"
                        name="contact_name"
                        defaultValue={editingBank?.contact_name || ''}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Ej: Juan Perez"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Teléfono del Manejador
                      </label>
                      <input
                        type="tel"
                        name="contact_phone"
                        value={phoneValue}
                        onChange={(e) => setPhoneValue(formatPhone(e.target.value))}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Ej: 809-000-0000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Fax del Manejador
                      </label>
                      <input
                        type="tel"
                        name="contact_fax"
                        value={faxValue}
                        onChange={(e) => setFaxValue(formatPhone(e.target.value))}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Ej: 809-000-0001"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email del Manejador
                      </label>
                      <input
                        type="email"
                        name="contact_email"
                        defaultValue={editingBank?.contact_email || ''}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Ej: manejador@banco.com"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Cuenta Contable del Banco *
                      </label>
                      {loadingAccounts ? (
                        <p className="text-sm text-gray-500">
                          Cargando plan de cuentas...
                        </p>
                      ) : (
                        <select
                          name="chart_account_id"
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                          required
                          defaultValue={
                            editingBank ? (editingBank as any).chart_account_id || '' : ''
                          }
                        >
                          <option value="">Seleccionar cuenta contable</option>
                          {accounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.code} - {acc.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <p className="mt-1 text-xs text-gray-500">
                        Esta cuenta se usará para los asientos contables de este banco.
                      </p>
                    </div>
                    <div className="md:col-span-2 flex items-center mt-2">
                      <input
                        type="checkbox"
                        name="use_payment_requests"
                        defaultChecked={editingBank?.use_payment_requests ?? true}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded mr-2"
                      />
                      <span className="text-sm text-gray-700">
                        Usar Solicitudes de Pago para este banco
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 pt-6">
                    <button
                      type="button"
                      onClick={() => setShowBankModal(false)}
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
