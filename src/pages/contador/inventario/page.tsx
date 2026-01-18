import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { resolveTenantId } from '../../../services/database';
import { balancesService, movementsService } from '../../../services/contador/inventory.service';
import type { InventoryBalance, InventoryMovement } from '../../../services/contador/inventory.service';
import { settingsService } from '../../../services/database';
import { exportToExcelWithHeaders, exportToPdf } from '../../../utils/exportImportUtils';

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  minStock: number;
  warehouse: string;
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
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return;
      const [balances, mvts] = await Promise.all([
        balancesService.list(tenantId),
        movementsService.list(tenantId),
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
          warehouse: b.location?.name || 'N/A',
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

  const handleExportExcel = async () => {
    if (inventory.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    let companyName: string | undefined;
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName = (info as any).name || (info as any).company_name || (info as any).legal_name;
        if (resolvedName) companyName = String(resolvedName);
      }
    } catch (error) {
      console.error('Error getting company info for inventory valuation Excel:', error);
    }

    const rows = inventory.map((i) => ({
      product: i.name,
      sku: i.sku,
      warehouse: i.warehouse,
      stock: i.quantity,
      min_stock: i.minStock,
      unit_cost: i.unitCost,
      total_value: i.totalValue,
      status: i.status,
    }));

    const headers = [
      { key: 'product', title: 'Product' },
      { key: 'sku', title: 'SKU' },
      { key: 'warehouse', title: 'Warehouse' },
      { key: 'stock', title: 'Stock' },
      { key: 'min_stock', title: 'Min Stock' },
      { key: 'unit_cost', title: 'Unit Cost' },
      { key: 'total_value', title: 'Total Value' },
      { key: 'status', title: 'Status' },
    ];

    const fileBase = `contador_inventory_valuation_${new Date().toISOString().split('T')[0]}`;
    const title = `Inventory Valuation (${valuationMethod.toUpperCase()})`;
    const periodText = `Period: ${new Date().toISOString().slice(0, 7)}`;

    exportToExcelWithHeaders(rows, headers, fileBase, 'Valuation', undefined, {
      title,
      companyName,
      headerStyle: 'dgii_606',
      periodText,
    });
  };

  const handleExportPdf = async () => {
    if (inventory.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    const columns = [
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'warehouse', label: 'Warehouse' },
      { key: 'stock', label: 'Stock' },
      { key: 'min_stock', label: 'Min Stock' },
      { key: 'unit_cost', label: 'Unit Cost' },
      { key: 'total_value', label: 'Total Value' },
      { key: 'status', label: 'Status' },
    ];

    const data = inventory.map((i) => ({
      product: i.name,
      sku: i.sku,
      warehouse: i.warehouse,
      stock: i.quantity,
      min_stock: i.minStock,
      unit_cost: i.unitCost,
      total_value: i.totalValue,
      status: i.status,
    }));

    let companyName = '';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        companyName = String((info as any).name || (info as any).company_name || (info as any).legal_name || '');
      }
    } catch (error) {
      console.error('Error getting company info for inventory valuation PDF:', error);
    }

    const fileBase = `contador_inventory_valuation_${new Date().toISOString().split('T')[0]}`;
    const title = `${companyName ? `${companyName} - ` : ''}Inventory Valuation (${valuationMethod.toUpperCase()})`;
    await exportToPdf(data, columns, fileBase, title, 'l');
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
                  <button
                    onClick={handleExportPdf}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
                  >
                    <i className="ri-file-pdf-line"></i>
                    Export PDF
                  </button>
                  <button
                    onClick={handleExportExcel}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
                  >
                    <i className="ri-file-excel-line"></i>
                    Export Excel
                  </button>
                </div>
              </div>
            )}

            {/* Alerts Tab */}
            {activeTab === 'alerts' && (
              <div className="space-y-4">
                {inventory.filter(i => i.status === 'low-stock').length > 0 ? (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                      <div className="font-semibold text-gray-900 flex items-center gap-2">
                        <i className="ri-error-warning-line text-[#008000]"></i>
                        Low Stock Alerts
                      </div>
                      <div className="text-sm text-gray-600">
                        {inventory.filter(i => i.status === 'low-stock').length}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-white">
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">SKU</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Stock</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Min</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Warehouse</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Severity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {inventory.filter(i => i.status === 'low-stock').map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                              <td className="px-4 py-3 text-gray-600">{item.sku}</td>
                              <td className="px-4 py-3 text-right font-medium text-gray-900">{item.quantity}</td>
                              <td className="px-4 py-3 text-right text-gray-600">{item.minStock}</td>
                              <td className="px-4 py-3 text-gray-600">{item.warehouse}</td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                  Warning
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center text-gray-500">
                    No low stock alerts.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
