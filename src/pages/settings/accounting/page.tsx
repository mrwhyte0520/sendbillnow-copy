import { useState, useEffect, type FormEvent } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { auxiliariesReconciliationService, settingsService, chartAccountsService, invoicesService } from '../../../services/database';
import { useAuth } from '../../../hooks/useAuth';
import { useAccountingFormat } from '../../../providers/AccountingFormatProvider';

interface AccountingSettings {
  id?: string;
  fiscal_year_start: string;
  fiscal_year_end: string;
  default_currency: string;
  decimal_places: number;
  date_format: string;
  number_format: string;
  auto_backup: boolean;
  backup_frequency: string;
  retention_period: number;
  ar_account_id?: string | null;
  sales_account_id?: string | null;
  sales_tax_account_id?: string | null;
  purchase_tax_account_id?: string | null;
  ap_account_id?: string | null;
  ap_bank_account_id?: string | null;
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

export default function AccountingSettingsPage() {
  const { user } = useAuth();
  const { refresh: refreshAccountingFormat } = useAccountingFormat();
  const [settings, setSettings] = useState<AccountingSettings>({
    fiscal_year_start: '2024-01-01',
    fiscal_year_end: '2024-12-31',
    default_currency: 'DOP',
    decimal_places: 2,
    date_format: 'MM/DD/YYYY',
    number_format: '1,234.56',
    auto_backup: true,
    backup_frequency: 'daily',
    retention_period: 30,
    ar_account_id: null,
    sales_account_id: null,
    sales_tax_account_id: null,
    purchase_tax_account_id: null,
    ap_account_id: null,
    ap_bank_account_id: null,
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [reconcilingAuxiliaries, setReconcilingAuxiliaries] = useState(false);
  const [recalculatingBalances, setRecalculatingBalances] = useState(false);
  const [regeneratingMovements, setRegeneratingMovements] = useState(false);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadSettings();
  }, [user]);

  useEffect(() => {
    const loadAccounts = async () => {
      if (!user) return;
      setLoadingAccounts(true);
      try {
        const data = await chartAccountsService.getAll(user.id);
        const options: AccountOption[] = (data || [])
          .map((acc: any) => ({
            id: acc.id,
            code: acc.code,
            name: acc.name,
          }));
        setAccounts(options);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading chart of accounts:', error);
      } finally {
        setLoadingAccounts(false);
      }
    };

    loadAccounts();
  }, [user]);

  const loadSettings = async () => {
    try {
      if (!user) return;
      const data = await settingsService.getAccountingSettings(user.id);
      if (data) {
        setSettings(data);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setMessage(null);

    try {
      await settingsService.saveAccountingSettings(settings, user.id);
      await refreshAccountingFormat();
      setMessage({ type: 'success', text: 'Configuración contable guardada exitosamente. Recargando página...' });
      
      // Recargar la página después de 1 segundo para aplicar los nuevos formatos
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Error al guardar la configuración' });
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof AccountingSettings, value: any) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleReconcileAuxiliaries = async () => {
    if (!user?.id) return;
    if (!confirm('¿Reconciliar auxiliares CxC/CxP? Esto creará asientos contables faltantes.')) return;
    setReconcilingAuxiliaries(true);
    setMessage(null);
    try {
      const { ar, ap } = await auxiliariesReconciliationService.reconcileAll(user.id);

      setMessage({
        type: 'success',
        text:
          `Reconciliación completada. ` +
          `CxC: facturas ${ar.createdInvoiceEntries}, pagos ${ar.createdPaymentEntries}, omitidos ${ar.skipped}. ` +
          `CxP: facturas ${ap.createdInvoiceEntries}, pagos ${ap.createdPaymentEntries}, omitidos ${ap.skipped}.`,
      });
    } catch (error) {
      setMessage({ type: 'error', text: 'No se pudo reconciliar CxC/CxP. Revisa la consola.' });
      // eslint-disable-next-line no-console
      console.error('Error reconciliando auxiliares CxC/CxP:', error);
    } finally {
      setReconcilingAuxiliaries(false);
    }
  };

  const handleRecalculateBalances = async () => {
    if (!user?.id) return;
    if (!confirm('¿Recalcular saldos auxiliares de clientes y suplidores? Esto actualizará current_balance.')) return;
    setRecalculatingBalances(true);
    setMessage(null);
    try {
      const res = await auxiliariesReconciliationService.recalculateAllBalances(user.id);
      setMessage({
        type: 'success',
        text: `Saldos recalculados. Clientes actualizados: ${res.customersUpdated}, Suplidores actualizados: ${res.suppliersUpdated}.`,
      });
    } catch (error) {
      setMessage({ type: 'error', text: 'No se pudieron recalcular los saldos. Revisa la consola.' });
      // eslint-disable-next-line no-console
      console.error('Error recalculando saldos auxiliares:', error);
    } finally {
      setRecalculatingBalances(false);
    }
  };

  const handleRegenerateInventoryMovements = async () => {
    if (!user?.id) return;
    if (!confirm('¿Regenerar movimientos de salida de inventario para facturas existentes? Esto creará las salidas faltantes para el Estado de Costos.')) return;
    setRegeneratingMovements(true);
    setMessage(null);
    try {
      const res = await invoicesService.regenerateInventoryMovements(user.id);
      setMessage({
        type: 'success',
        text: `Movimientos regenerados. Facturas procesadas: ${res.processed}, Movimientos creados: ${res.created}.`,
      });
    } catch (error) {
      setMessage({ type: 'error', text: 'No se pudieron regenerar los movimientos. Revisa la consola.' });
      // eslint-disable-next-line no-console
      console.error('Error regenerando movimientos de inventario:', error);
    } finally {
      setRegeneratingMovements(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 bg-[#F8F3E7] min-h-full p-6">

        {/* Header */}
        <div className="bg-gradient-to-r from-[#3B4A2A] to-[#1F2616] rounded-2xl shadow-lg shadow-[#1F2616]/30 border border-[#2A351E] p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Accounting Settings</h1>
              <p className="text-[#CFE6AB] mt-1">
                Configure fiscal periods, currencies, and accounting policies
              </p>
            </div>
            <button
              onClick={() => window.REACT_APP_NAVIGATE('/settings')}
              className="flex items-center space-x-2 text-white hover:text-[#D7E5C1]"
            >
              <i className="ri-arrow-left-line"></i>
              <span>Back</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-[#1F2618]">Quick actions</h2>
              <p className="text-[#5B6844] text-sm mt-1">
                Fix missing entries so AR/AP match your accounting.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleReconcileAuxiliaries}
                disabled={reconcilingAuxiliaries}
                className="bg-[#3E4D2C] text-white px-4 py-2 rounded-lg hover:bg-[#2D3A1C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow shadow-[#3E4D2C]/30"
              >
                {reconcilingAuxiliaries ? 'Reconciling…' : 'Reconcile AR/AP ledgers'}
              </button>
              <button
                type="button"
                onClick={handleRecalculateBalances}
                disabled={recalculatingBalances}
                className="bg-[#1F2616] text-white px-4 py-2 rounded-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow shadow-black/30"
              >
                {recalculatingBalances ? 'Recalculating…' : 'Recalculate auxiliary balances'}
              </button>
              <button
                type="button"
                onClick={handleRegenerateInventoryMovements}
                disabled={regeneratingMovements}
                className="bg-[#566738] text-white px-4 py-2 rounded-lg hover:bg-[#45532B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow shadow-[#566738]/30"
              >
                {regeneratingMovements ? 'Regenerating…' : 'Regenerate inventory movements'}
              </button>
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Fiscal Year Settings */}
          <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
            <h2 className="text-lg font-semibold text-[#1F2618] mb-4">Fiscal Period</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fiscal Year Start *
                </label>

                <input
                  type="date"
                  required
                  value={settings.fiscal_year_start || ''}
                  onChange={(e) => handleInputChange('fiscal_year_start', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fiscal Year End *
                </label>

                <input
                  type="date"
                  required
                  value={settings.fiscal_year_end || ''}
                  onChange={(e) => handleInputChange('fiscal_year_end', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Default Accounts Settings */}
          <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
            <h2 className="text-lg font-semibold text-[#1F2618] mb-4">Default Accounting Accounts</h2>
            {loadingAccounts ? (
              <p className="text-gray-500 text-sm">Loading chart of accounts…</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Accounts Receivable (Customers)
                  </label>

                  <select
                    value={settings.ar_account_id || ''}
                    onChange={(e) => handleInputChange('ar_account_id', e.target.value || null)}
                    className="w-full px-3 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#C6B383] focus:border-[#C6B383]"
                  >
                    <option value="">Select account</option>
                    {accounts.map((acc) => (

                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sales Account
                  </label>

                  <select
                    value={settings.sales_account_id || ''}
                    onChange={(e) => handleInputChange('sales_account_id', e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Seleccionar cuenta</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sales Tax Payable
                  </label>

                  <select
                    value={settings.sales_tax_account_id || ''}
                    onChange={(e) => handleInputChange('sales_tax_account_id', e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Seleccionar cuenta</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Purchase Tax Receivable
                  </label>

                  <select
                    value={settings.purchase_tax_account_id || ''}
                    onChange={(e) => handleInputChange('purchase_tax_account_id', e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Seleccionar cuenta</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Accounts Payable (Vendors)
                  </label>

                  <select
                    value={settings.ap_account_id || ''}
                    onChange={(e) => handleInputChange('ap_account_id', e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Seleccionar cuenta</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Default Bank Account for Vendor Payments
                  </label>

                  <select
                    value={settings.ap_bank_account_id || ''}
                    onChange={(e) => handleInputChange('ap_bank_account_id', e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Seleccionar cuenta</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => window.REACT_APP_NAVIGATE('/settings')}
              className="px-6 py-2 border border-[#E2D6BD] text-[#675F4B] rounded-lg hover:bg-[#F0E8D7]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-[#927B4E] text-white rounded-lg hover:bg-[#7D683E] disabled:opacity-50 shadow shadow-[#927B4E]/30"
            >
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>

      </div>
    </DashboardLayout>
  );
}