import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { settingsService, accountingSettingsService, taxService } from '../../../services/database';
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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [skuSettings, setSkuSettings] = useState({
    prefix: 'INV',
    nextNumber: 1,
    padding: 4,
  });

  const [showTaxModal, setShowTaxModal] = useState(false);
  const [taxRate, setTaxRate] = useState(18);
  const [savingTax, setSavingTax] = useState(false);

  useEffect(() => {
    loadSettings();
    loadWarehouses();
    loadSkuSettings();
    loadTaxConfig();
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

  const loadSkuSettings = async () => {
    if (!user?.id) return;
    try {
      const data = await accountingSettingsService.getSkuSettings(user.id);
      setSkuSettings(data);
    } catch (error) {
      console.error('Error loading SKU settings:', error);
    }
  };

  const loadTaxConfig = async () => {
    try {
      const data = await taxService.getTaxConfiguration();
      if (data && typeof data.itbis_rate === 'number') {
        setTaxRate(data.itbis_rate);
      }
    } catch (error) {
      console.error('Error loading tax configuration:', error);
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

  const handleInputChange = (field: keyof InventorySettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
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

  const handleSaveTaxRate = async () => {
    setSavingTax(true);
    setMessage(null);
    try {
      await taxService.saveTaxConfiguration({ itbis_rate: taxRate });
      setMessage({ type: 'success', text: 'Tax rate saved successfully' });
      setShowTaxModal(false);
    } catch (error) {
      setMessage({ type: 'error', text: 'Error saving tax rate' });
    } finally {
      setSavingTax(false);
    }
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
                Configure valuation methods, tracking preferences, and default locations.
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
                  Default Location
                </label>
                <select
                  value={settings.default_warehouse || ''}
                  onChange={(e) => handleInputChange('default_warehouse', e.target.value)}
                  className="w-full px-3 py-2 border border-[#d9ceb5] rounded-lg focus:ring-2 focus:ring-[#6b8a45] focus:border-[#6b8a45]"
                >
                  <option value="">Select a location</option>
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

        {/* Tax Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-[#e4d8c4] p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#2f3e1e] mb-1">Tax Settings</h2>
              <p className="text-sm text-[#6b5c3b]">
                Configure the default tax rate applied to sales across the system.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTaxModal(true)}
              className="px-4 py-2 bg-[#2f3e1e] text-white rounded-lg hover:bg-[#1f2a15] flex items-center space-x-2"
            >
              <i className="ri-percent-line"></i>
              <span>Change Tax Rate</span>
            </button>
          </div>
          <div className="mt-4 p-4 bg-[#f7f3e8] rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-[#2f3e1e] rounded-full flex items-center justify-center">
                <i className="ri-percent-line text-white text-lg"></i>
              </div>
              <div>
                <p className="text-sm text-[#6b5c3b]">Current Tax Rate</p>
                <p className="text-2xl font-bold text-[#2f3e1e]">{taxRate}%</p>
              </div>
            </div>
            <p className="text-xs text-[#8c7c5b] max-w-xs text-right">
              This rate is applied to POS sales, invoices, and customer displays.
            </p>
          </div>
        </div>

        {/* Tax Rate Modal */}
        {showTaxModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm border border-[#e4d8c4]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[#2f3e1e]">Change Tax Rate</h3>
                <button
                  onClick={() => setShowTaxModal(false)}
                  className="text-[#6b5c3b] hover:text-[#2f3e1e]"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#4a3c23] mb-2">
                    Tax Rate %
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-[#d9ceb5] rounded-lg focus:ring-2 focus:ring-[#6b8a45] focus:border-[#6b8a45] text-2xl font-bold text-center"
                  />
                  <p className="text-xs text-[#8c7c5b] mt-2">
                    This percentage will be applied to all POS sales and invoices.
                  </p>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowTaxModal(false)}
                    className="px-4 py-2 border border-[#d9ceb5] text-[#2f3e1e] rounded-lg hover:bg-[#f3e7cf]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTaxRate}
                    disabled={savingTax}
                    className="px-4 py-2 bg-[#2f3e1e] text-white rounded-lg hover:bg-[#1f2a15] disabled:opacity-50"
                  >
                    {savingTax ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}