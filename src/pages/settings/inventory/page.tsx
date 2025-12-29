import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { settingsService, chartAccountsService, accountingSettingsService } from '../../../services/database';
import { useAuth } from '../../../hooks/useAuth';

interface InventorySettings {
  id?: string;
  valuation_method: string;
  auto_reorder: boolean;
  reorder_point: number;
  default_warehouse: string;
  track_serial_numbers: boolean;
  track_expiration: boolean;
  negative_stock_allowed: boolean;
}

interface Warehouse {
  id: string;
  name: string;
  location: string;
  active: boolean;
}

export default function InventorySettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<InventorySettings>({
    valuation_method: 'fifo',
    auto_reorder: true,
    reorder_point: 10,
    default_warehouse: '',
    track_serial_numbers: false,
    track_expiration: false,
    negative_stock_allowed: false
  });
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newWarehouse, setNewWarehouse] = useState({
    name: '',
    location: '',
    description: '',
    address: '',
    phone: '',
    inventoryAccountId: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [skuSettings, setSkuSettings] = useState({
    prefix: 'INV',
    nextNumber: 1,
    padding: 4,
  });

  useEffect(() => {
    loadSettings();
    loadWarehouses();
    loadAccounts();
    loadSkuSettings();
  }, [user?.id]);

  const loadSettings = async () => {
    try {
      const data = await settingsService.getInventorySettings();
      if (data) {
        setSettings({
          id: data.id,
          valuation_method: data.valuation_method || 'fifo',
          auto_reorder: data.auto_reorder ?? true,
          reorder_point: typeof data.reorder_point === 'number' ? data.reorder_point : 10,
          default_warehouse: data.default_warehouse || '',
          track_serial_numbers: data.track_serial_numbers ?? false,
          track_expiration: data.track_expiration ?? false,
          negative_stock_allowed: data.negative_stock_allowed ?? false,
        });
      }
    } catch (error) {
      console.error('Error loading inventory settings:', error);
    }
  };

  const loadWarehouses = async () => {
    try {
      const data = await settingsService.getWarehouses();
      setWarehouses(data);
    } catch (error) {
      console.error('Error loading warehouses:', error);
    }
  };

  const loadAccounts = async () => {
    try {
      if (!user?.id) {
        setAccounts([]);
        return;
      }
      const data = await chartAccountsService.getAll(user.id);
      const options = (data || [])
        .filter((acc: any) => acc.allow_posting !== false && acc.type === 'asset')
        .map((acc: any) => ({ id: acc.id, code: acc.code, name: acc.name }));
      setAccounts(options);
    } catch (error) {
      console.error('Error loading accounts for warehouses:', error);
      setAccounts([]);
    }
  };

  const loadSkuSettings = async () => {
    if (!user?.id) return;
    try {
      const data = await accountingSettingsService.getSkuSettings(user.id);
      setSkuSettings(data);
    } catch (error) {
      console.error('Error loading SKU settings:', error);
    }
  };

  const handleSaveSkuSettings = async () => {
    if (!user?.id) return;
    setLoading(true);
    setMessage(null);
    try {
      await accountingSettingsService.updateSkuSettings(user.id, skuSettings);
      setMessage({ type: 'success', text: 'Configuración de SKU guardada exitosamente' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Error al guardar la configuración de SKU' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      await settingsService.saveInventorySettings(settings);
      setMessage({ type: 'success', text: 'Configuración de inventario guardada exitosamente' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Error al guardar la configuración' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await settingsService.createWarehouse({
        name: newWarehouse.name,
        location: newWarehouse.location,
        description: newWarehouse.description || null,
        address: newWarehouse.address || null,
        phone: newWarehouse.phone || null,
        inventory_account_id: newWarehouse.inventoryAccountId || null,
        active: true,
      });
      setMessage({ type: 'success', text: 'Almacén creado exitosamente' });
      setShowModal(false);
      setNewWarehouse({
        name: '',
        location: '',
        description: '',
        address: '',
        phone: '',
        inventoryAccountId: '',
      });
      loadWarehouses();
    } catch (error) {
      setMessage({ type: 'error', text: 'Error al crear el almacén' });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof InventorySettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Configuración de Inventario</h1>
              <p className="text-gray-600 mt-1">
                Configura métodos de valuación, categorías y almacenes
              </p>
            </div>
            <button
              onClick={() => window.REACT_APP_NAVIGATE('/settings')}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
            >
              <i className="ri-arrow-left-line"></i>
              <span>Volver a Configuración</span>
            </button>
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
          {/* Valuation Settings */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Métodos de Valuación</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Método de Valuación *
                </label>
                <select
                  value={settings.valuation_method || 'fifo'}
                  onChange={(e) => handleInputChange('valuation_method', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="fifo">FIFO (Primero en Entrar, Primero en Salir)</option>
                  <option value="lifo">LIFO (Último en Entrar, Primero en Salir)</option>
                  <option value="average">Promedio Ponderado</option>
                  <option value="specific">Identificación Específica</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Almacén Predeterminado
                </label>
                <select
                  value={settings.default_warehouse || ''}
                  onChange={(e) => handleInputChange('default_warehouse', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Seleccionar almacén</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Reorder Settings */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Configuración de Reorden</h2>
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="auto_reorder"
                  checked={settings.auto_reorder}
                  onChange={(e) => handleInputChange('auto_reorder', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="auto_reorder" className="ml-2 block text-sm text-gray-900">
                  Habilitar reorden automático
                </label>
              </div>
              
              {settings.auto_reorder && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Punto de Reorden Predeterminado
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={settings.reorder_point}
                      onChange={(e) => handleInputChange('reorder_point', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tracking Settings */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Configuración de Seguimiento</h2>
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="track_serial_numbers"
                  checked={settings.track_serial_numbers}
                  onChange={(e) => handleInputChange('track_serial_numbers', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="track_serial_numbers" className="ml-2 block text-sm text-gray-900">
                  Rastrear números de serie
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="track_expiration"
                  checked={settings.track_expiration}
                  onChange={(e) => handleInputChange('track_expiration', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="track_expiration" className="ml-2 block text-sm text-gray-900">
                  Rastrear fechas de vencimiento
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="negative_stock_allowed"
                  checked={settings.negative_stock_allowed}
                  onChange={(e) => handleInputChange('negative_stock_allowed', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="negative_stock_allowed" className="ml-2 block text-sm text-gray-900">
                  Permitir stock negativo
                </label>
              </div>
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

        {/* SKU Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Configuración de SKU Automático</h2>
          <p className="text-sm text-gray-500 mb-4">
            Define el formato de los códigos SKU que se generarán automáticamente para nuevos productos.
            El SKU resultante tendrá el formato: <strong>{skuSettings.prefix}-{String(skuSettings.nextNumber).padStart(skuSettings.padding, '0')}</strong>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prefijo
              </label>
              <input
                type="text"
                value={skuSettings.prefix}
                onChange={(e) => setSkuSettings(prev => ({ ...prev, prefix: e.target.value.toUpperCase() }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="INV"
                maxLength={10}
              />
              <p className="text-xs text-gray-400 mt-1">Ej: INV, PROD, SKU</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Siguiente Número
              </label>
              <input
                type="number"
                min="1"
                value={skuSettings.nextNumber}
                onChange={(e) => setSkuSettings(prev => ({ ...prev, nextNumber: Math.max(1, parseInt(e.target.value) || 1) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">El próximo SKU usará este número</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dígitos (padding)
              </label>
              <select
                value={skuSettings.padding}
                onChange={(e) => setSkuSettings(prev => ({ ...prev, padding: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={3}>3 dígitos (001)</option>
                <option value={4}>4 dígitos (0001)</option>
                <option value={5}>5 dígitos (00001)</option>
                <option value={6}>6 dígitos (000001)</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">Cantidad de dígitos del número</p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleSaveSkuSettings}
              disabled={loading}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Guardar Configuración de SKU'}
            </button>
          </div>
        </div>

        {/* Warehouses Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Almacenes</h2>
            <button
              onClick={() => setShowModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            >
              <i className="ri-add-line"></i>
              <span>Nuevo Almacén</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nombre
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ubicación
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {warehouses.map((warehouse) => (
                  <tr key={warehouse.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {warehouse.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {warehouse.location}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        warehouse.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {warehouse.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button className="text-blue-600 hover:text-blue-900">
                          <i className="ri-edit-line"></i>
                        </button>
                        <button className="text-red-600 hover:text-red-900">
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* New Warehouse Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Nuevo Almacén</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>
            <form onSubmit={handleCreateWarehouse} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  required
                  value={newWarehouse.name}
                  onChange={(e) => setNewWarehouse(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ubicación *
                </label>
                <input
                  type="text"
                  required
                  value={newWarehouse.location}
                  onChange={(e) => setNewWarehouse(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción
                </label>
                <textarea
                  value={newWarehouse.description}
                  onChange={(e) => setNewWarehouse(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dirección
                </label>
                <input
                  type="text"
                  value={newWarehouse.address}
                  onChange={(e) => setNewWarehouse(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono
                </label>
                <input
                  type="text"
                  value={newWarehouse.phone}
                  onChange={(e) => setNewWarehouse(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cuenta de inventario
                </label>
                <select
                  value={newWarehouse.inventoryAccountId}
                  onChange={(e) => setNewWarehouse(prev => ({ ...prev, inventoryAccountId: e.target.value }))}
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
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Creando...' : 'Crear Almacén'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}