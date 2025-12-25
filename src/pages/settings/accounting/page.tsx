import { useState, useEffect, type FormEvent } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { auxiliariesReconciliationService, settingsService, chartAccountsService, dataBackupsService } from '../../../services/database';
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
    date_format: 'DD/MM/YYYY',
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
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);

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

  const handleCreateBackup = async () => {
    if (!user?.id) return;
    if (!confirm('¿Crear un respaldo manual de la base de datos? Esto guardará una copia de todos los datos contables.')) return;
    setCreatingBackup(true);
    setMessage(null);
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `Respaldo_Manual_${timestamp}`;
      
      // Crear respaldo en la base de datos con configuración actual
      const backup = await dataBackupsService.createBackup({
        backup_type: 'manual',
        backup_name: backupName,
        retention_days: settings.retention_period
      });
      
      // Descargar el respaldo como archivo JSON
      const backupJson = JSON.stringify(backup.backup_data, null, 2);
      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${backupName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      const sizeKB = (backup.file_size / 1024).toFixed(2);
      setMessage({
        type: 'success',
        text: `Respaldo creado exitosamente: ${backupName}.json (${sizeKB} KB). El archivo se ha descargado y también se guardó en la base de datos.`,
      });
    } catch (error) {
      setMessage({ type: 'error', text: 'No se pudo crear el respaldo. Verifica la consola para más detalles.' });
      console.error('Error creando respaldo:', error);
    } finally {
      setCreatingBackup(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Configuración Contable</h1>
              <p className="text-gray-600 mt-1">
                Configura períodos fiscales, monedas y políticas contables
              </p>
            </div>
            <button
              onClick={() => window.REACT_APP_NAVIGATE('/settings')}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
            >
              <i className="ri-arrow-left-line"></i>
              <span>Volver</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Acciones rápidas</h2>
              <p className="text-gray-600 text-sm mt-1">
                Repara asientos faltantes para que CxC/CxP coincidan con contabilidad.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleReconcileAuxiliaries}
                disabled={reconcilingAuxiliaries}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {reconcilingAuxiliaries ? 'Reconciliando...' : 'Reconciliar auxiliares CxC/CxP'}
              </button>
              <button
                type="button"
                onClick={handleRecalculateBalances}
                disabled={recalculatingBalances}
                className="bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {recalculatingBalances ? 'Recalculando...' : 'Recalcular saldos auxiliares'}
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Período Fiscal</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Inicio del Año Fiscal *
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
                  Fin del Año Fiscal *
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Cuentas Contables por Defecto</h2>
            {loadingAccounts ? (
              <p className="text-gray-500 text-sm">Cargando plan de cuentas...</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cuenta de Cuentas por Cobrar (Clientes)
                  </label>
                  <select
                    value={settings.ar_account_id || ''}
                    onChange={(e) => handleInputChange('ar_account_id', e.target.value || null)}
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
                    Cuenta de Ventas
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
                    Cuenta de ITBIS por Pagar
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
                    Cuenta de ITBIS por Compra
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
                    Cuenta de Cuentas por Pagar (Proveedores)
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
                    Cuenta de Banco por Defecto para Pagos a Proveedores
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

          {/* Currency and Format Settings */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Formatos</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Decimales *
                </label>
                <select
                  value={settings.decimal_places ?? 2}
                  onChange={(e) => handleInputChange('decimal_places', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value={0}>0 decimales</option>
                  <option value={2}>2 decimales</option>
                  <option value={4}>4 decimales</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Formato de Fecha
                </label>
                <select
                  value={settings.date_format || 'DD/MM/YYYY'}
                  onChange={(e) => handleInputChange('date_format', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Formato de Números
                </label>
                <select
                  value={settings.number_format || '1,234.56'}
                  onChange={(e) => handleInputChange('number_format', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="1,234.56">1,234.56</option>
                  <option value="1.234,56">1.234,56</option>
                  <option value="1 234.56">1 234.56</option>
                </select>
              </div>
            </div>
          </div>

          {/* Backup Settings */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Configuración de Respaldos</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Protege tus datos con respaldos automáticos o manuales
                </p>
              </div>
              <button
                type="button"
                onClick={handleCreateBackup}
                disabled={creatingBackup}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-2"
              >
                <i className="ri-save-line"></i>
                {creatingBackup ? 'Creando...' : 'Crear Respaldo Manual'}
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="auto_backup"
                  checked={!!settings.auto_backup}
                  onChange={(e) => handleInputChange('auto_backup', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="auto_backup" className="ml-2 block text-sm text-gray-900">
                  Habilitar respaldos automáticos
                </label>
              </div>
              
              {settings.auto_backup && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-start gap-3 mb-4">
                    <i className="ri-information-line text-blue-600 text-xl mt-0.5"></i>
                    <div>
                      <p className="text-sm font-medium text-blue-900">Respaldos Automáticos Habilitados</p>
                      <p className="text-sm text-blue-700 mt-1">
                        El sistema creará respaldos automáticamente según la frecuencia configurada.
                        Los respaldos antiguos se eliminarán después del período de retención.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Frecuencia de Respaldo
                    </label>
                    <select
                      value={settings.backup_frequency || 'daily'}
                      onChange={(e) => handleInputChange('backup_frequency', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="daily">Diario</option>
                      <option value="weekly">Semanal</option>
                      <option value="monthly">Mensual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Período de Retención (días)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={settings.retention_period ?? 30}
                      onChange={(e) => handleInputChange('retention_period', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            )}
            
            {!settings.auto_backup && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-start gap-3">
                  <i className="ri-alert-line text-gray-600 text-xl mt-0.5"></i>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Respaldos Automáticos Deshabilitados</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Los respaldos automáticos están desactivados. Puedes crear respaldos manuales usando el botón "Crear Respaldo Manual".
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => window.REACT_APP_NAVIGATE('/settings')}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}