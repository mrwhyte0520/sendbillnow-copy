import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { inventoryService, settingsService } from '../../../services/database';
import { exportToExcelWithHeaders, exportToPdf } from '../../../utils/exportImportUtils';

interface PhysicalCountRow {
  warehouseId: string;
  warehouseName: string;
  itemId: string;
  sku: string;
  name: string;
  category: string | null;
  theoreticalQty: number;
}

export default function InventoryPhysicalCountPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);

  const [dateCutoff, setDateCutoff] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [includeZeroStock, setIncludeZeroStock] = useState<boolean>(false);

  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const [itemsData, movementsData, warehousesData, companyData] = await Promise.all([
          inventoryService.getItems(user.id),
          inventoryService.getMovements(user.id),
          settingsService.getWarehouses(),
          settingsService.getCompanyInfo(),
        ]);
        setItems(itemsData || []);
        setMovements(movementsData || []);
        setWarehouses(warehousesData || []);
        setCompanyInfo(companyData || null);
      } catch (error) {
        console.error('[InventoryPhysicalCount] Error loading data', error);
        setItems([]);
        setMovements([]);
        setWarehouses([]);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user?.id]);

  const rows: PhysicalCountRow[] = useMemo(() => {
    if (!items || items.length === 0) return [];

    const cutoff = dateCutoff ? new Date(dateCutoff) : null;

    const balances: Record<string, Record<string, number>> = {};
    const itemMap: Record<string, any> = {};

    items.forEach((it: any) => {
      if (!it || !it.id || !it.warehouse_id) return;
      const iid = String(it.id);
      const wid = String(it.warehouse_id);
      itemMap[iid] = it;
      if (!balances[wid]) balances[wid] = {};
      const baseQty = Number(it.current_stock ?? 0) || 0;
      balances[wid][iid] = (balances[wid][iid] || 0) + baseQty;
    });

    movements.forEach((movement: any) => {
      const movementDate = movement.movement_date ? new Date(movement.movement_date) : null;
      if (cutoff && movementDate && movementDate > cutoff) return;

      const qty = Number(movement.quantity) || 0;
      if (!qty) return;

      const itemId =
        movement.item_id ||
        movement.inventory_item_id ||
        movement.inventory_items?.id;
      if (!itemId) return;

      const type = (movement.movement_type || '').toString();

      if (type === 'transfer') {
        const fromWarehouse = movement.from_warehouse_id;
        const toWarehouse = movement.to_warehouse_id;
        if (fromWarehouse) {
          const widFrom = String(fromWarehouse);
          const iid = String(itemId);
          if (!balances[widFrom]) balances[widFrom] = {};
          balances[widFrom][iid] = (balances[widFrom][iid] || 0) - qty;
        }
        if (toWarehouse) {
          const widTo = String(toWarehouse);
          const iid = String(itemId);
          if (!balances[widTo]) balances[widTo] = {};
          balances[widTo][iid] = (balances[widTo][iid] || 0) + qty;
        }
      }
    });

    const result: PhysicalCountRow[] = [];

    Object.entries(balances).forEach(([wid, itemBalances]) => {
      const warehouse = warehouses.find((w) => String(w.id) === wid);
      const warehouseName = warehouse?.name || 'Warehouse';

      Object.entries(itemBalances).forEach(([iid, qty]) => {
        const theoreticalQty = Number(qty) || 0;
        if (!includeZeroStock && theoreticalQty <= 0) return;
        const item = itemMap[iid] || items.find((it: any) => String(it.id) === iid);
        if (!item) return;

        result.push({
          warehouseId: wid,
          warehouseName,
          itemId: iid,
          sku: item.sku || '',
          name: item.name || '',
          category: item.category || null,
          theoreticalQty,
        });
      });
    });

    return result;
  }, [items, movements, warehouses, dateCutoff, includeZeroStock]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesWarehouse =
        selectedWarehouseId === 'all' || row.warehouseId === selectedWarehouseId;
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        !term ||
        row.sku.toLowerCase().includes(term) ||
        row.name.toLowerCase().includes(term) ||
        (row.category || '').toLowerCase().includes(term);
      return matchesWarehouse && matchesSearch;
    });
  }, [rows, selectedWarehouseId, searchTerm]);

  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = [
      { key: 'warehouseName', title: 'Warehouse' },
      { key: 'sku', title: 'SKU' },
      { key: 'name', title: 'Product' },
      { key: 'category', title: 'Category' },
      { key: 'theoreticalQty', title: 'Theoretical Stock' },
      { key: 'countedQty', title: 'Counted Qty' },
      { key: 'difference', title: 'Difference' },
      { key: 'notes', title: 'Observations' },
    ];

    const rowsData = filteredRows.map((r) => ({
      warehouseName: r.warehouseName,
      sku: r.sku,
      name: r.name,
      category: r.category || '',
      theoreticalQty: r.theoreticalQty,
      countedQty: '',
      difference: '',
      notes: '',
    }));

    const companyName =
      (companyInfo?.name as string) ||
      (companyInfo?.company_name as string) ||
      (companyInfo?.legal_name as string) ||
      undefined;

    const title = 'Physical Inventory Count';
    const periodText = `Period: ${new Date().toISOString().slice(0, 7)}`;

    exportToExcelWithHeaders(rowsData, headers, 'physical_inventory_count', 'Physical Count', undefined, {
      title,
      companyName,
      headerStyle: 'dgii_606',
      periodText,
    });
  };

  const handleExportPdf = async () => {
    if (filteredRows.length === 0) {
      alert('No data to export');
      return;
    }

    const columns = [
      { key: 'warehouseName', label: 'Warehouse' },
      { key: 'sku', label: 'SKU' },
      { key: 'name', label: 'Product' },
      { key: 'category', label: 'Category' },
      { key: 'theoreticalQty', label: 'Theoretical Stock' },
      { key: 'countedQty', label: 'Counted Qty' },
      { key: 'difference', label: 'Difference' },
      { key: 'notes', label: 'Observations' },
    ];

    const data = filteredRows.map((r) => ({
      warehouseName: r.warehouseName,
      sku: r.sku,
      name: r.name,
      category: r.category || '',
      theoreticalQty: r.theoreticalQty,
      countedQty: '',
      difference: '',
      notes: '',
    }));

    try {
      const companyName =
        (companyInfo?.name as string) ||
        (companyInfo?.company_name as string) ||
        '';
      const title = `${companyName} - Physical Inventory Count`;
      await exportToPdf(data, columns, 'physical_inventory_count', title);
    } catch (error) {
      console.error('[InventoryPhysicalCount] Error exporting PDF', error);
      alert('Error exporting to PDF. Check the console for details.');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            {companyInfo && (
              <div className="text-sm text-gray-700 mb-1">
                <p className="font-semibold text-gray-900">
                  {companyInfo.name || companyInfo.company_name || 'Company'}
                </p>
                <p className="text-xs text-gray-600">
                  {companyInfo.tax_id && <span>RNC: {companyInfo.tax_id}</span>}
                  {companyInfo.tax_id && companyInfo.address && <span> · </span>}
                  {companyInfo.address && <span>{companyInfo.address}</span>}
                </p>
              </div>
            )}
            <h1 className="text-2xl font-bold text-gray-900">Physical Inventory Count</h1>
            <p className="text-sm text-gray-600 mt-1">
              List for physical inventory count by product and warehouse.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExportExcel}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-file-excel-line mr-2" />
              Export to Excel
            </button>
            <button
              onClick={handleExportPdf}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-file-pdf-line mr-2" />
              Export to PDF
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Count Date</label>
              <input
                type="date"
                value={dateCutoff}
                onChange={(e) => setDateCutoff(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse</label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
              >
                <option value="all">All warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by SKU, name or category"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <input
              id="includeZeroStock"
              type="checkbox"
              checked={includeZeroStock}
              onChange={(e) => setIncludeZeroStock(e.target.checked)}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="includeZeroStock" className="text-sm text-gray-700">
              Include products with zero theoretical stock
            </label>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {loading && (
            <div className="px-6 py-3 text-sm text-gray-500">Loading data...</div>
          )}

          {!loading && filteredRows.length === 0 && (
            <div className="px-6 py-4 text-sm text-gray-500">No data for the selected filters.</div>
          )}

          {!loading && filteredRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Warehouse</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Theoretical Stock</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Counted Qty</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Difference</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Observations</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRows.map((row) => (
                    <tr key={`${row.warehouseId}-${row.itemId}`}>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{row.warehouseName}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{row.sku}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{row.name}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{row.category || '-'}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">{row.theoreticalQty}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-400">____</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-400">____</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-400">____________________</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
