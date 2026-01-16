import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { balancesService, movementsService } from '../../../services/contador/inventory.service';
import type { InventoryBalance, InventoryMovement } from '../../../services/contador/inventory.service';

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  minStock: number;
  unitCost: number;
  totalValue: number;
  status: 'in-stock' | 'low-stock' | 'out-of-stock';
}

interface Movement {
  id: string;
  date: string;
  type: 'in' | 'out' | 'adjustment';
  product: string;
  quantity: number;
  reason: string;
}

export default function ContadorInventarioPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'levels' | 'movements' | 'valuation' | 'alerts'>('levels');
  const [valuationMethod, setValuationMethod] = useState<'fifo' | 'lifo' | 'average'>('fifo');
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [balances, mvts] = await Promise.all([
        balancesService.list(user.id),
        movementsService.list(user.id),
      ]);

      const mappedInventory: InventoryItem[] = balances.map((b: InventoryBalance) => {
        const cost = (b.product as any)?.cost || 0;
        const qty = b.qty_on_hand;
        let status: 'in-stock' | 'low-stock' | 'out-of-stock' = 'in-stock';
        if (qty <= 0) status = 'out-of-stock';
        else if (qty <= b.reorder_level) status = 'low-stock';

        return {
          id: b.id,
          name: b.product?.name || 'Unknown',
          sku: b.product?.sku || '',
          quantity: qty,
          minStock: b.reorder_level,
          unitCost: cost,
          totalValue: qty * cost,
          status,
        };
      });

      const mappedMovements: Movement[] = mvts.slice(0, 20).map((m: InventoryMovement) => ({
        id: m.id,
        date: new Date(m.created_at).toLocaleDateString(),
        type: m.qty > 0 ? 'in' : m.movement_type === 'adjustment' ? 'adjustment' : 'out',
        product: m.product?.name || 'Unknown',
        quantity: Math.abs(m.qty),
        reason: m.note || m.movement_type,
      }));

      setInventory(mappedInventory);
      setMovements(mappedMovements);
    } catch (error) {
      console.error('Error loading inventory data:', error);
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    totalItems: inventory.length,
    totalValue: inventory.reduce((acc, i) => acc + i.totalValue, 0),
    lowStock: inventory.filter(i => i.status === 'low-stock').length,
    outOfStock: inventory.filter(i => i.status === 'out-of-stock').length,
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#008000]/10 rounded-lg">
              <i className="ri-archive-line text-2xl text-[#008000]"></i>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
              <p className="text-gray-600">Inventory Management – US Standard</p>
            </div>
          </div>
          <button
            onClick={() => setShowAdjustment(true)}
            className="px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium hover:from-[#097509] hover:to-[#005300] flex items-center gap-2"
          >
            <i className="ri-add-line"></i>
            Adjust Inventory
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#008000]/10 rounded-lg">
                <i className="ri-stack-line text-xl text-[#008000]"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Items</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalItems}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#008000]/10 rounded-lg">
                <i className="ri-money-dollar-circle-line text-xl text-[#008000]"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Value</p>
                <p className="text-2xl font-bold text-[#008000]">${stats.totalValue.toFixed(2)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#008000]/10 rounded-lg">
                <i className="ri-error-warning-line text-xl text-[#008000]"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Low Stock</p>
                <p className="text-2xl font-bold text-[#008000]">{stats.lowStock}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#008000]/10 rounded-lg">
                <i className="ri-close-circle-line text-xl text-[#008000]"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Out of Stock</p>
                <p className="text-2xl font-bold text-[#008000]">{stats.outOfStock}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#008000]"></div>
            <span className="ml-3 text-gray-600">Loading inventory...</span>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200">
            <div className="flex">
              {[
                { id: 'levels', label: 'Stock Levels', icon: 'ri-stack-line' },
                { id: 'movements', label: 'Movements', icon: 'ri-arrow-left-right-line' },
                { id: 'valuation', label: 'Valuation', icon: 'ri-calculator-line' },
                { id: 'alerts', label: 'Alerts', icon: 'ri-alarm-warning-line' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-[#008000] text-[#008000] bg-[#008000]/5'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <i className={tab.icon}></i>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4">
            {/* Stock Levels Tab */}
            {activeTab === 'levels' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">SKU</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Quantity</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Min Stock</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Unit Cost</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total Value</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {inventory.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                        <td className="px-4 py-3 text-gray-600">{item.sku}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">{item.quantity}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{item.minStock}</td>
                        <td className="px-4 py-3 text-right text-gray-600">${item.unitCost.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-medium text-[#008000]">${item.totalValue.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            item.status === 'in-stock' ? 'bg-[#008000]/15 text-[#006600]' :
                            item.status === 'low-stock' ? 'bg-[#008000]/10 text-[#006600]' :
                            'bg-[#008000]/5 text-[#006600]'
                          }`}>
                            {item.status === 'in-stock' ? 'In Stock' : item.status === 'low-stock' ? 'Low Stock' : 'Out of Stock'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Movements Tab */}
            {activeTab === 'movements' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Quantity</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {movements.map((mov) => (
                      <tr key={mov.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600">{mov.date}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            mov.type === 'in' ? 'bg-[#008000]/15 text-[#006600]' :
                            mov.type === 'out' ? 'bg-[#008000]/10 text-[#006600]' :
                            'bg-[#008000]/5 text-[#006600]'
                          }`}>
                            {mov.type === 'in' ? 'Stock In' : mov.type === 'out' ? 'Stock Out' : 'Adjustment'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{mov.product}</td>
                        <td className={`px-4 py-3 text-right font-medium ${mov.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {mov.quantity > 0 ? '+' : ''}{mov.quantity}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{mov.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Valuation Tab */}
            {activeTab === 'valuation' && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 mb-4">
                  <label className="text-sm font-medium text-gray-700">Valuation Method:</label>
                  <div className="flex gap-2">
                    {[
                      { id: 'fifo', label: 'FIFO' },
                      { id: 'lifo', label: 'LIFO' },
                      { id: 'average', label: 'Average Cost' },
                    ].map((method) => (
                      <button
                        key={method.id}
                        onClick={() => setValuationMethod(method.id as any)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          valuationMethod === method.id
                            ? 'bg-[#008000] text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {method.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">
                    Stock Valuation ({valuationMethod.toUpperCase()})
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b border-gray-200">
                      <span className="text-gray-600">Total Units in Stock</span>
                      <span className="font-medium">{inventory.reduce((a, i) => a + i.quantity, 0)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-200">
                      <span className="text-gray-600">Average Unit Cost</span>
                      <span className="font-medium">${(stats.totalValue / (inventory.reduce((a, i) => a + i.quantity, 0) || 1)).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-2 text-lg">
                      <span className="font-semibold text-gray-900">Total Inventory Value</span>
                      <span className="font-bold text-[#008000]">${stats.totalValue.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2">
                    <i className="ri-file-pdf-line"></i>
                    Export PDF
                  </button>
                  <button className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2">
                    <i className="ri-file-excel-line"></i>
                    Export Excel
                  </button>
                </div>
              </div>
            )}

            {/* Alerts Tab */}
            {activeTab === 'alerts' && (
              <div className="space-y-4">
                {inventory.filter(i => i.status === 'out-of-stock').length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                      <i className="ri-close-circle-line"></i>
                      Out of Stock ({inventory.filter(i => i.status === 'out-of-stock').length})
                    </h3>
                    <div className="space-y-2">
                      {inventory.filter(i => i.status === 'out-of-stock').map((item) => (
                        <div key={item.id} className="flex items-center justify-between bg-white rounded p-3">
                          <span className="font-medium text-gray-900">{item.name}</span>
                          <button className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700">
                            Reorder Now
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {inventory.filter(i => i.status === 'low-stock').length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h3 className="font-semibold text-yellow-800 mb-2 flex items-center gap-2">
                      <i className="ri-error-warning-line"></i>
                      Low Stock ({inventory.filter(i => i.status === 'low-stock').length})
                    </h3>
                    <div className="space-y-2">
                      {inventory.filter(i => i.status === 'low-stock').map((item) => (
                        <div key={item.id} className="flex items-center justify-between bg-white rounded p-3">
                          <div>
                            <span className="font-medium text-gray-900">{item.name}</span>
                            <span className="text-sm text-gray-500 ml-2">({item.quantity} left, min: {item.minStock})</span>
                          </div>
                          <button className="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700">
                            Reorder
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Adjustment Modal */}
        {showAdjustment && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Inventory Adjustment</h2>
                <button onClick={() => setShowAdjustment(false)} className="p-1 hover:bg-gray-100 rounded">
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]">
                    <option>Select product...</option>
                    {inventory.map(item => (
                      <option key={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Adjustment Type</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]">
                    <option>Add Stock</option>
                    <option>Remove Stock</option>
                    <option>Set Quantity</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" rows={2}></textarea>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowAdjustment(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium">Save Adjustment</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
