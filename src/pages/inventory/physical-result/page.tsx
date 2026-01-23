import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { inventoryService, settingsService, inventoryPhysicalCountsService } from '../../../services/database';
import { exportToExcelWithHeaders, exportToPdf } from '../../../utils/exportImportUtils';

interface PhysicalResultRow {
  warehouseId: string;
  warehouseName: string;
  itemId: string;
  sku: string;
  name: string;
  category: string | null;
  theoreticalQty: number;
  unitCost: number;
}

interface EnrichedRow extends PhysicalResultRow {
  countedQty: number;
  differenceQty: number;
  theoreticalCost: number;
  countedCost: number;
  costDifference: number;
}

export default function InventoryPhysicalResultPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [sessionDetailsLoading, setSessionDetailsLoading] = useState(false);

  const [dateCutoff, setDateCutoff] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [includeZeroStock, setIncludeZeroStock] = useState<boolean>(false);
  const [description, setDescription] = useState<string>('');

  // Mapa clave -> cantidad contada (como string para inputs)
  const [countsByKey, setCountsByKey] = useState<Record<string, string>>({});

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
        console.error('[InventoryPhysicalResult] Error loading data', error);
        setItems([]);
        setMovements([]);
        setWarehouses([]);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user?.id]);

  const fetchSessions = async (currentUserId: string) => {
    try {
      setSessionsLoading(true);
      const data = await inventoryPhysicalCountsService.getAll(currentUserId);
      setSessions(data || []);
    } catch (error) {
      console.error('[InventoryPhysicalResult] Error loading sessions', error);
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) {
      setSessions([]);
      return;
    }
    fetchSessions(user.id);
  }, [user?.id]);

  const baseRows: PhysicalResultRow[] = useMemo(() => {
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

    const result: PhysicalResultRow[] = [];

    Object.entries(balances).forEach(([wid, itemBalances]) => {
      const warehouse = warehouses.find((w) => String(w.id) === wid);
      const warehouseName = warehouse?.name || 'Warehouse';

      Object.entries(itemBalances).forEach(([iid, qty]) => {
        const theoreticalQty = Number(qty) || 0;
        if (!includeZeroStock && theoreticalQty <= 0) return;
        const item = itemMap[iid] || items.find((it: any) => String(it.id) === iid);
        if (!item) return;

        const cost =
          item.average_cost != null && item.average_cost !== ''
            ? Number(item.average_cost) || 0
            : Number(item.cost_price) || 0;

        result.push({
          warehouseId: wid,
          warehouseName,
          itemId: iid,
          sku: item.sku || '',
          name: item.name || '',
          category: item.category || null,
          theoreticalQty,
          unitCost: cost,
        });
      });
    });

    return result;
  }, [items, movements, warehouses, dateCutoff, includeZeroStock]);

  const filteredBaseRows = useMemo(() => {
    return baseRows.filter((row) => {
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
  }, [baseRows, selectedWarehouseId, searchTerm]);

  const enrichedRows: EnrichedRow[] = useMemo(() => {
    return filteredBaseRows.map((row) => {
      const key = `${row.warehouseId}-${row.itemId}`;
      const countedStr = countsByKey[key] ?? '';
      const countedQty = countedStr === '' ? 0 : Number(countedStr) || 0;
      const differenceQty = countedQty - row.theoreticalQty;
      const theoreticalCost = row.theoreticalQty * row.unitCost;
      const countedCost = countedQty * row.unitCost;
      const costDifference = differenceQty * row.unitCost;

      return {
        ...row,
        countedQty,
        differenceQty,
        theoreticalCost,
        countedCost,
        costDifference,
      };
    });
  }, [filteredBaseRows, countsByKey]);

  const totals = useMemo(() => {
    return enrichedRows.reduce(
      (acc, row) => {
        acc.theoreticalQty += row.theoreticalQty;
        acc.countedQty += row.countedQty;
        acc.differenceQty += row.differenceQty;
        acc.theoreticalCost += row.theoreticalCost;
        acc.countedCost += row.countedCost;
        acc.costDifference += row.costDifference;
        return acc;
      },
      {
        theoreticalQty: 0,
        countedQty: 0,
        differenceQty: 0,
        theoreticalCost: 0,
        countedCost: 0,
        costDifference: 0,
      },
    );
  }, [enrichedRows]);

  const handleCountChange = (row: PhysicalResultRow, value: string) => {
    const key = `${row.warehouseId}-${row.itemId}`;
    setCountsByKey((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSaveSession = async () => {
    if (!user?.id) {
      alert('You must be logged in to save the physical count');
      return;
    }
    if (enrichedRows.length === 0) {
      alert('No data to save');
      return;
    }

    try {
      setSaving(true);

      const header: any = {
        warehouse_id: selectedWarehouseId === 'all' ? null : selectedWarehouseId,
        count_date: dateCutoff || new Date().toISOString().slice(0, 10),
        description: description || null,
        status: 'draft',
      };

      const lines = enrichedRows
        .filter((row) => row.theoreticalQty !== 0 || row.countedQty !== 0)
        .map((row) => ({
          inventory_item_id: row.itemId,
          warehouse_id: row.warehouseId,
          theoretical_qty: row.theoreticalQty,
          counted_qty: row.countedQty,
          difference_qty: row.differenceQty,
          unit_cost: row.unitCost,
          total_theoretical_cost: row.theoreticalCost,
          total_counted_cost: row.countedCost,
          cost_difference: row.costDifference,
          notes: null,
        }));

      if (lines.length === 0) {
        alert('No lines with quantities to save');
        return;
      }

      await inventoryPhysicalCountsService.create(user.id, header, lines);
      alert('Physical inventory count saved successfully');
      fetchSessions(user.id);
      // No limpiamos los datos para que el usuario pueda seguir exportando
    } catch (error: any) {
      console.error('[InventoryPhysicalResult] Error saving session', error);
      alert(`Error saving physical count: ${error?.message || 'check the console for details'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleViewSession = async (sessionId: string) => {
    if (!user?.id) return;
    try {
      setSessionDetailsLoading(true);
      const data = await inventoryPhysicalCountsService.getWithLines(user.id, sessionId);
      setSelectedSession(data);
    } catch (error) {
      console.error('[InventoryPhysicalResult] Error loading session details', error);
      alert('Error loading physical count details. Check the console for details.');
    } finally {
      setSessionDetailsLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (enrichedRows.length === 0) {
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
      { key: 'differenceQty', title: 'Difference' },
      { key: 'unitCost', title: 'Unit Cost' },
      { key: 'theoreticalCost', title: 'Theoretical Cost' },
      { key: 'countedCost', title: 'Counted Cost' },
      { key: 'costDifference', title: 'Cost Difference' },
    ];

    const rowsData = enrichedRows.map((r) => ({
      warehouseName: r.warehouseName,
      sku: r.sku,
      name: r.name,
      category: r.category || '',
      theoreticalQty: r.theoreticalQty,
      countedQty: r.countedQty,
      differenceQty: r.differenceQty,
      unitCost: r.unitCost,
      theoreticalCost: r.theoreticalCost,
      countedCost: r.countedCost,
      costDifference: r.costDifference,
    }));

    const companyName =
      (companyInfo?.name as string) ||
      (companyInfo?.company_name as string) ||
      (companyInfo?.legal_name as string) ||
      undefined;

    const title = 'Physical Inventory Report';
    const periodText = `Period: ${new Date().toISOString().slice(0, 7)}`;

    exportToExcelWithHeaders(rowsData, headers, 'physical_inventory_report', 'Physical Inventory', undefined, {
      title,
      companyName,
      headerStyle: 'dgii_606',
      periodText,
    });
  };

  const handleExportPdf = async () => {
    if (enrichedRows.length === 0) {
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
      { key: 'differenceQty', label: 'Difference' },
      { key: 'unitCost', label: 'Unit Cost' },
      { key: 'theoreticalCost', label: 'Theoretical Cost' },
      { key: 'countedCost', label: 'Counted Cost' },
      { key: 'costDifference', label: 'Cost Difference' },
    ];

    const data = enrichedRows.map((r) => ({
      warehouseName: r.warehouseName,
      sku: r.sku,
      name: r.name,
      category: r.category || '',
      theoreticalQty: r.theoreticalQty,
      countedQty: r.countedQty,
      differenceQty: r.differenceQty,
      unitCost: r.unitCost,
      theoreticalCost: r.theoreticalCost,
      countedCost: r.countedCost,
      costDifference: r.costDifference,
    }));

    try {
      const companyName =
        (companyInfo?.name as string) ||
        (companyInfo?.company_name as string) ||
        '';
      const title = `${companyName} - Physical Inventory Report`;
      await exportToPdf(data, columns, 'physical_inventory_report', title, 'l');
    } catch (error) {
      console.error('[InventoryPhysicalResult] Error exporting PDF', error);
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
            <h1 className="text-2xl font-bold text-gray-900">Physical Inventory Report</h1>
            <p className="text-sm text-gray-600 mt-1">
              Physical inventory count results with differences and costs by product.
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
          <div className="mt-4 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                id="includeZeroStockResult"
                type="checkbox"
                checked={includeZeroStock}
                onChange={(e) => setIncludeZeroStock(e.target.checked)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="includeZeroStockResult" className="text-sm text-gray-700">
                Include products with zero theoretical stock
              </label>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description / count notes</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="E.g.: End of month general count, includes only main warehouse"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleSaveSession}
                disabled={saving || loading}
                className="w-full md:w-auto bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save count'}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {loading && (
            <div className="px-6 py-3 text-sm text-gray-500">Loading data...</div>
          )}

          {!loading && enrichedRows.length === 0 && (
            <div className="px-6 py-4 text-sm text-gray-500">No data for the selected filters.</div>
          )}

          {!loading && enrichedRows.length > 0 && (
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
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Cost</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Theoretical Cost</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Counted Cost</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cost Difference</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {enrichedRows.map((row) => {
                    const key = `${row.warehouseId}-${row.itemId}`;
                    return (
                      <tr key={key}>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{row.warehouseName}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{row.sku}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{row.name}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{row.category || '-'}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">{row.theoreticalQty}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right">
                          <input
                            type="number" min="0"
                            step="0.01"
                            value={countsByKey[key] ?? ''}
                            onChange={(e) => handleCountChange(row, e.target.value)}
                            className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {row.differenceQty}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {row.unitCost.toLocaleString('es-DO')}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {row.theoreticalCost.toLocaleString('es-DO')}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {row.countedCost.toLocaleString('es-DO')}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {row.costDifference.toLocaleString('es-DO')}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-50 font-semibold">
                    <td colSpan={4} className="px-4 py-2 text-sm text-right text-gray-700">
                      Totals
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                      {totals.theoreticalQty}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                      {totals.countedQty}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                      {totals.differenceQty}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">&nbsp;</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                      {totals.theoreticalCost.toLocaleString('es-DO')}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                      {totals.countedCost.toLocaleString('es-DO')}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                      {totals.costDifference.toLocaleString('es-DO')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Physical Count History</h2>
              <p className="text-sm text-gray-500">
                Previously saved physical inventory sessions.
              </p>
            </div>
          </div>
          {sessionsLoading && (
            <div className="px-6 py-3 text-sm text-gray-500">Loading history...</div>
          )}
          {!sessionsLoading && sessions.length === 0 && (
            <div className="px-6 py-4 text-sm text-gray-500">
              No physical counts saved yet.
            </div>
          )}
          {!sessionsLoading && sessions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Warehouse</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sessions.map((session: any) => (
                    <tr key={session.id}>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                        {session.count_date ? new Date(session.count_date).toLocaleDateString('es-DO') : ''}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                        {session.warehouses?.name || 'All / N/A'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                        {session.description || '-'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                        {session.status || 'draft'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                        {session.created_at ? new Date(session.created_at).toLocaleString('es-DO') : ''}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-right">
                        <button
                          type="button"
                          onClick={() => handleViewSession(session.id)}
                          className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                        >
                          View details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sessionDetailsLoading && (
            <div className="px-6 py-3 text-sm text-gray-500 border-t border-gray-100">
              Loading selected count details...
            </div>
          )}
          {selectedSession && !sessionDetailsLoading && (
            <div className="border-t border-gray-100 px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Count details from{' '}
                    {selectedSession.count_date
                      ? new Date(selectedSession.count_date).toLocaleDateString('es-DO')
                      : ''}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {selectedSession.warehouses?.name || 'All / N/A'}
                    {selectedSession.description ? ` · ${selectedSession.description}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSession(null)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Close
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Theoretical</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Counted</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Difference</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Cost</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Theoretical Cost</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Counted Cost</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cost Diff.</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(selectedSession.inventory_physical_count_lines || []).map((line: any) => (
                      <tr key={line.id}>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                          {line.inventory_items?.sku || ''}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                          {line.inventory_items?.name || ''}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                          {line.inventory_items?.category || '-'}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {Number(line.theoretical_qty || 0)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {Number(line.counted_qty || 0)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {Number(line.difference_qty || 0)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {line.unit_cost != null ? Number(line.unit_cost).toLocaleString('es-DO') : ''}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {line.total_theoretical_cost != null
                            ? Number(line.total_theoretical_cost).toLocaleString('es-DO')
                            : ''}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {line.total_counted_cost != null
                            ? Number(line.total_counted_cost).toLocaleString('es-DO')
                            : ''}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {line.cost_difference != null
                            ? Number(line.cost_difference).toLocaleString('es-DO')
                            : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
