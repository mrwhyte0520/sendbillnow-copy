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
      const warehouseName = warehouse?.name || 'Almacén';

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
      alert('No hay datos para exportar');
      return;
    }

    const headers = [
      { key: 'warehouseName', title: 'Almacén' },
      { key: 'sku', title: 'SKU' },
      { key: 'name', title: 'Producto' },
      { key: 'category', title: 'Categoría' },
      { key: 'theoreticalQty', title: 'Existencia Teórica' },
      { key: 'countedQty', title: 'Cantidad Contada' },
      { key: 'difference', title: 'Diferencia' },
      { key: 'notes', title: 'Observaciones' },
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

    const title = 'Toma de Inventario Físico';
    const periodText = `Periodo: ${new Date().toISOString().slice(0, 7)}`;

    exportToExcelWithHeaders(rowsData, headers, 'toma_inventario_fisico', 'Toma Física', undefined, {
      title,
      companyName,
      headerStyle: 'dgii_606',
      periodText,
    });
  };

  const handleExportPdf = async () => {
    if (filteredRows.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    const columns = [
      { key: 'warehouseName', label: 'Almacén' },
      { key: 'sku', label: 'SKU' },
      { key: 'name', label: 'Producto' },
      { key: 'category', label: 'Categoría' },
      { key: 'theoreticalQty', label: 'Existencia Teórica' },
      { key: 'countedQty', label: 'Cantidad Contada' },
      { key: 'difference', label: 'Diferencia' },
      { key: 'notes', label: 'Observaciones' },
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
        'ContaBi';
      const title = `${companyName} - Toma de Inventario Físico`;
      await exportToPdf(data, columns, 'toma_inventario_fisico', title);
    } catch (error) {
      console.error('[InventoryPhysicalCount] Error exporting PDF', error);
      alert('Error al exportar a PDF. Revisa la consola para más detalles.');
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
                  {companyInfo.name || companyInfo.company_name || 'Empresa'}
                </p>
                <p className="text-xs text-gray-600">
                  {companyInfo.tax_id && <span>RNC: {companyInfo.tax_id}</span>}
                  {companyInfo.tax_id && companyInfo.address && <span> · </span>}
                  {companyInfo.address && <span>{companyInfo.address}</span>}
                </p>
              </div>
            )}
            <h1 className="text-2xl font-bold text-gray-900">Toma de Inventario Físico</h1>
            <p className="text-sm text-gray-600 mt-1">
              Listado para conteo físico de inventario por producto y almacén.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExportExcel}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-file-excel-line mr-2" />
              Exportar a Excel
            </button>
            <button
              onClick={handleExportPdf}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-file-pdf-line mr-2" />
              Exportar a PDF
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de conteo</label>
              <input
                type="date"
                value={dateCutoff}
                onChange={(e) => setDateCutoff(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Almacén</label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
              >
                <option value="all">Todos los almacenes</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por SKU, nombre o categoría"
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
              Incluir productos con existencia teórica igual a 0
            </label>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {loading && (
            <div className="px-6 py-3 text-sm text-gray-500">Cargando datos...</div>
          )}

          {!loading && filteredRows.length === 0 && (
            <div className="px-6 py-4 text-sm text-gray-500">No hay datos para los filtros seleccionados.</div>
          )}

          {!loading && filteredRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Almacén</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Existencia Teórica</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cantidad Contada</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Diferencia</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Observaciones</th>
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
