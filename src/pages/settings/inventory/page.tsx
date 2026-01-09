import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { settingsService, chartAccountsService, accountingSettingsService } from '../../../services/database';
import { useAuth } from '../../../hooks/useAuth';
import { usePlanPermissions } from '../../../hooks/usePlanPermissions';

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
  const { limits } = usePlanPermissions();
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
      setMessage({ type: 'success', text: 'SKU settings saved successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Error saving SKU settings' });
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
      setMessage({ type: 'success', text: 'Inventory settings saved successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Error saving inventory settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (limits.warehouses !== -1 && warehouses.length >= limits.warehouses) {
        alert(`You've reached the limit of ${limits.warehouses} warehouse(s) for your plan.`);
        setLoading(false);
        return;
      }
      await settingsService.createWarehouse({
        name: newWarehouse.name,
        location: newWarehouse.location,
        description: newWarehouse.description || null,
        address: newWarehouse.address || null,
        phone: newWarehouse.phone || null,
        inventory_account_id: newWarehouse.inventoryAccountId || null,
        active: true,
      });
      setMessage({ type: 'success', text: 'Warehouse created successfully' });

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
      setMessage({ type: 'error', text: 'Error creating the warehouse' });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof InventorySettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6 bg-[#f7f3e8] min-h-screen">

        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-[#e4d8c4] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-[#6b5c3b]">Operations</p>
              <h1 className="text-3xl font-bold text-[#2f3e1e]">Inventory Configuration</h1>
              <p className="text-[#6b5c3b] mt-1">
                Configure valuation methods, tracking preferences, and default warehouses.
              </p>
            </div>
            <button
              onClick={() => window.REACT_APP_NAVIGATE('/settings')}
              className="flex items-center space-x-2 text-[#6b5c3b] hover:text-[#2f3e1e]"
            >
              <i className="ri-arrow-left-line"></i>
              <span>Back to Settings</span>
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
          <div className="bg-white rounded-xl shadow-sm border border-[#e4d8c4] p-6">
            <h2 className="text-lg font-semibold text-[#2f3e1e] mb-4">Valuation Methods</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-[#4a3c23] mb-2">
                  Valuation Method *
                </label>
                <select
                  value={settings.valuation_method || 'fifo'}
                  onChange={(e) => handleInputChange('valuation_method', e.target.value)}
                  className="w-full px-3 py-2 border border-[#d9ceb5] rounded-lg focus:ring-2 focus:ring-[#6b8a45] focus:border-[#6b8a45]"
                >
                  <option value="fifo">FIFO (First In, First Out)</option>
                  <option value="lifo">LIFO (Last In, First Out)</option>
                  <option value="average">Weighted Average</option>
                  <option value="specific">Specific Identification</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#4a3c23] mb-2">
                  Default Warehouse
                </label>
                <select
                  value={settings.default_warehouse || ''}
                  onChange={(e) => handleInputChange('default_warehouse', e.target.value)}
                  className="w-full px-3 py-2 border border-[#d9ceb5] rounded-lg focus:ring-2 focus:ring-[#6b8a45] focus:border-[#6b8a45]"
                >
                  <option value="">Select a warehouse</option>
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
          <div className="bg-white rounded-xl shadow-sm border border-[#e4d8c4] p-6">
            <h2 className="text-lg font-semibold text-[#2f3e1e] mb-4">Reorder Settings</h2>
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="auto_reorder"
                  checked={settings.auto_reorder}
                  onChange={(e) => handleInputChange('auto_reorder', e.target.checked)}
                  className="h-4 w-4 text-[#2f3e1e] focus:ring-[#6b8a45] border-[#d9ceb5] rounded"
                />
                <label htmlFor="auto_reorder" className="ml-2 block text-sm text-[#2f3e1e]">
                  Enable automatic reorder
                </label>
              </div>
              
              {settings.auto_reorder && (
                <div className="grid grid-cols-1 md-grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c23] mb-2">
                      Default Reorder Point
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={settings.reorder_point}
                      onChange={(e) => handleInputChange('reorder_point', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-[#d9ceb5] rounded-lg focus:ring-2 focus:ring-[#6b8a45] focus:border-[#6b8a45]"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tracking Settings */}
          <div className="bg-white rounded-xl shadow-sm border border-[#e4d8c4] p-6">
            <h2 className="text-lg font-semibold text-[#2f3e1e] mb-4">Tracking Preferences</h2>
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="track_serial_numbers"
                  checked={settings.track_serial_numbers}
                  onChange={(e) => handleInputChange('track_serial_numbers', e.target.checked)}
                  className="h-4 w-4 text-[#2f3e1e] focus:ring-[#6b8a45] border-[#d9ceb5] rounded"
                />
                <label htmlFor="track_serial_numbers" className="ml-2 block text-sm text-[#2f3e1e]">
                  Track serial numbers
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="track_expiration"
                  checked={settings.track_expiration}
                  onChange={(e) => handleInputChange('track_expiration', e.target.checked)}
                  className="h-4 w-4 text-[#2f3e1e] focus:ring-[#6b8a45] border-[#d9ceb5] rounded"
                />
                <label htmlFor="track_expiration" className="ml-2 block text-sm text-[#2f3e1e]">
                  Track expiration dates
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="negative_stock_allowed"
                  checked={settings.negative_stock_allowed}
                  onChange={(e) => handleInputChange('negative_stock_allowed', e.target.checked)}
                  className="h-4 w-4 text-[#2f3e1e] focus:ring-[#6b8a45] border-[#d9ceb5] rounded"
                />
                <label htmlFor="negative_stock_allowed" className="ml-2 block text-sm text-[#2f3e1e]">
                  Allow negative stock
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => window.REACT_APP_NAVIGATE('/settings')}
              className="px-6 py-2 border border-[#d9ceb5] text-[#2f3e1e] rounded-lg hover:bg-[#f3e7cf]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-[#2f3e1e] text-white rounded-lg hover:bg-[#1f2a15] disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>

        {/* SKU Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-[#e4d8c4] p-6">
          <h2 className="text-lg font-semibold text-[#2f3e1e] mb-4">Automatic SKU Settings</h2>
          <p className="text-sm text-[#6b5c3b] mb-4">
            Define the pattern for SKUs generated automatically for new products.
            The resulting SKU will look like: <strong>{skuSettings.prefix}-{String(skuSettings.nextNumber).padStart(skuSettings.padding, '0')}</strong>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-[#4a3c23] mb-2">
                Prefix
              </label>
              <input
                type="text"
                value={skuSettings.prefix}
                onChange={(e) => setSkuSettings(prev => ({ ...prev, prefix: e.target.value.toUpperCase() }))}
                className="w-full px-3 py-2 border border-[#d9ceb5] rounded-lg focus:ring-2 focus:ring-[#6b8a45] focus:border-[#6b8a45]"
                placeholder="INV"
                maxLength={10}
              />
              <p className="text-xs text-[#8c7c5b] mt-1">Ex: INV, PROD, SKU</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#4a3c23] mb-2">
                Next Number
              </label>
              <input
                type="number"
                min="1"
                value={skuSettings.nextNumber}
                onChange={(e) => setSkuSettings(prev => ({ ...prev, nextNumber: Math.max(1, parseInt(e.target.value) || 1) }))}
                className="w-full px-3 py-2 border border-[#d9ceb5] rounded-lg focus:ring-2 focus:ring-[#6b8a45] focus:border-[#6b8a45]"
              />
              <p className="text-xs text-[#8c7c5b] mt-1">The next SKU will use this number</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#4a3c23] mb-2">
                Digits (padding)
              </label>
              <select
                value={skuSettings.padding}
                onChange={(e) => setSkuSettings(prev => ({ ...prev, padding: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 border border-[#d9ceb5] rounded-lg focus:ring-2 focus:ring-[#6b8a45] focus:border-[#6b8a45]"
              >
                <option value={3}>3 digits (001)</option>
                <option value={4}>4 digits (0001)</option>
                <option value={5}>5 digits (00001)</option>
                <option value={6}>6 digits (000001)</option>
              </select>
              <p className="text-xs text-[#8c7c5b] mt-1">How many digits the number should include</p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleSaveSkuSettings}
              disabled={loading}
              className="px-6 py-2 bg-[#4b5f36] text-white rounded-lg hover:bg-[#3a4b2a] disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save SKU Settings'}
            </button>
          </div>
        </div>

        {/* Warehouses Table */}
        <div className="bg-white rounded-lg shadow-sm border border-[#e4d8c4]">
          <div className="p-6 border-b border-[#e4d8c4] flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#2f3e1e]">Warehouses</h2>
            <button
              onClick={() => setShowModal(true)}
              className="bg-[#2f3e1e] text-white px-4 py-2 rounded-lg hover:bg-[#1f2a15] flex items-center space-x-2"
            >
              <i className="ri-add-line"></i>
              <span>New Warehouse</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#f7f3e8]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#6b5c3b] uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#6b5c3b] uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#6b5c3b] uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#6b5c3b] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#f1e4cd]">
                {warehouses.map((warehouse) => (
                  <tr key={warehouse.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[#2f3e1e]">
                      {warehouse.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#6b5c3b]">
                      {warehouse.location}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        warehouse.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {warehouse.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button className="text-[#2f3e1e] hover:text-[#1f2a15]">
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
          <div className="bg-white rounded-xl p-6 w-full max-w-md border border-[#e4d8c4]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#2f3e1e]">New Warehouse</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-[#6b5c3b] hover:text-[#2f3e1e]"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>
            <form onSubmit={handleCreateWarehouse} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#4a3c23] mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  required
                  value={newWarehouse.name}
                  onChange={(e) => setNewWarehouse(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#d9ceb5] rounded-lg focus:ring-2 focus:ring-[#6b8a45] focus:border-[#6b8a45]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#4a3c23] mb-1">
                  Location *
                </label>
                <input
                  type="text"
                  required
                  value={newWarehouse.location}
                  onChange={(e) => setNewWarehouse(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#d9ceb5] rounded-lg focus:ring-2 focus:ring-[#6b8a45] focus:border-[#6b8a45]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#4a3c23] mb-1">
                  Description
                </label>
                <textarea
                  value={newWarehouse.description}
                  onChange={(e) => setNewWarehouse(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#d9ceb5] rounded-lg focus:ring-2 focus:ring-[#6b8a45] focus:border-[#6b8a45]"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#4a3c23] mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={newWarehouse.address}
                  onChange={(e) => setNewWarehouse(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#d9ceb5] rounded-lg focus:ring-2 focus:ring-[#6b8a45] focus:border-[#6b8a45]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#4a3c23] mb-1">
                  Phone
                </label>
                <input
                  type="text"
                  value={newWarehouse.phone}
                  onChange={(e) => setNewWarehouse(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#d9ceb5] rounded-lg focus:ring-2 focus:ring-[#6b8a45] focus:border-[#6b8a45]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#4a3c23] mb-1">
                  Inventory account
                </label>
                <select
                  value={newWarehouse.inventoryAccountId}
                  onChange={(e) => setNewWarehouse(prev => ({ ...prev, inventoryAccountId: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#d9ceb5] rounded-lg focus:ring-2 focus:ring-[#6b8a45] focus:border-[#6b8a45]"
                >
                  <option value="">Select an account</option>
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
                  className="px-4 py-2 border border-[#d9ceb5] text-[#2f3e1e] rounded-lg hover:bg-[#f3e7cf]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-[#2f3e1e] text-white rounded-lg hover:bg-[#1f2a15] disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Warehouse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}