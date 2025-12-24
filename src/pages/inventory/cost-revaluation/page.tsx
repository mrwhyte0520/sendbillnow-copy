import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { inventoryService, settingsService, inventoryCostRevaluationsService } from '../../../services/database';
import { exportToExcelWithHeaders, exportToPdf } from '../../../utils/exportImportUtils';

interface CostRevaluationRow {
  warehouseId: string;
  warehouseName: string;
  itemId: string;
  sku: string;
  name: string;
  category: string | null;
  quantity: number;
  previousCost: number;
  previousTotal: number;
}

interface EnrichedRow extends CostRevaluationRow {
  newCost: number;
  unitDifference: number;
  newTotal: number;
  totalDifference: number;
}

export default function InventoryCostRevaluationPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);

  const [revaluations, setRevaluations] = useState<any[]>([]);
  const [revaluationsLoading, setRevaluationsLoading] = useState(false);
  const [selectedRevaluation, setSelectedRevaluation] = useState<any | null>(null);
  const [revaluationDetailsLoading, setRevaluationDetailsLoading] = useState(false);

  const [revaluationDate, setRevaluationDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [description, setDescription] = useState<string>('');

  // Mapa clave -> nuevo costo unitario (como string para inputs)
  const [newCostByKey, setNewCostByKey] = useState<Record<string, string>>({});

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
        console.error('[InventoryCostRevaluation] Error loading data', error);
        setItems([]);
        setMovements([]);
        setWarehouses([]);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user?.id]);

  const fetchRevaluations = async (currentUserId: string) => {
    try {
      setRevaluationsLoading(true);
      const data = await inventoryCostRevaluationsService.getAll(currentUserId);
      setRevaluations(data || []);
    } catch (error) {
      console.error('[InventoryCostRevaluation] Error loading revaluations', error);
      setRevaluations([]);
    } finally {
      setRevaluationsLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) {
      setRevaluations([]);
      return;
    }
    fetchRevaluations(user.id);
  }, [user?.id]);

  const baseRows: CostRevaluationRow[] = useMemo(() => {
    if (!items || items.length === 0) return [];

    const cutoff = revaluationDate ? new Date(revaluationDate) : null;

    const balances: Record<string, Record<string, number>> = {};
    const itemMap: Record<string, any> = {};

    items.forEach((it: any) => {
      if (!it || !it.id || !it.warehouse_id) return;
      const iid = String(it.id);
      const wid = String(it.warehouse_id);
      itemMap[iid] = it;
      if (!balances[wid]) balances[wid] = {};
      const baseQty = Number(it.current_stock ?? 0) || 0;
      if (!baseQty) return;
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

    const result: CostRevaluationRow[] = [];

    Object.entries(balances).forEach(([wid, itemBalances]) => {
      const warehouse = warehouses.find((w) => String(w.id) === wid);
      const warehouseName = warehouse?.name || 'Almacén';

      Object.entries(itemBalances).forEach(([iid, qty]) => {
        const quantity = Number(qty) || 0;
        if (quantity <= 0) return;
        const item = itemMap[iid] || items.find((it: any) => String(it.id) === iid);
        if (!item) return;

        const previousCost =
          item.average_cost != null && item.average_cost !== ''
            ? Number(item.average_cost) || 0
            : Number(item.cost_price) || 0;

        const previousTotal = quantity * previousCost;

        result.push({
          warehouseId: wid,
          warehouseName,
          itemId: iid,
          sku: item.sku || '',
          name: item.name || '',
          category: item.category || null,
          quantity,
          previousCost,
          previousTotal,
        });
      });
    });

    return result;
  }, [items, movements, warehouses, revaluationDate]);

  const filteredRows = useMemo(() => {
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
    return filteredRows.map((row) => {
      const key = `${row.warehouseId}-${row.itemId}`;
      const newCostStr = newCostByKey[key];
      const effectiveNewCost =
        newCostStr === undefined || newCostStr === ''
          ? row.previousCost
          : Number(newCostStr) || 0;

      const unitDifference = effectiveNewCost - row.previousCost;
      const newTotal = row.quantity * effectiveNewCost;
      const totalDifference = newTotal - row.previousTotal;

      return {
        ...row,
        newCost: effectiveNewCost,
        unitDifference,
        newTotal,
        totalDifference,
      };
    });
  }, [filteredRows, newCostByKey]);

  const totals = useMemo(() => {
    return enrichedRows.reduce(
      (acc, row) => {
        acc.quantity += row.quantity;
        acc.previousTotal += row.previousTotal;
        acc.newTotal += row.newTotal;
        acc.totalDifference += row.totalDifference;
        return acc;
      },
      {
        quantity: 0,
        previousTotal: 0,
        newTotal: 0,
        totalDifference: 0,
      },
    );
  }, [enrichedRows]);

  const handleNewCostChange = (row: CostRevaluationRow, value: string) => {
    const key = `${row.warehouseId}-${row.itemId}`;
    setNewCostByKey((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSaveRevaluation = async () => {
    if (!user?.id) {
      alert('Debes iniciar sesión para registrar una revalorización de costos');
      return;
    }

    const lines = enrichedRows
      .filter((row) => row.quantity > 0 && row.unitDifference !== 0)
      .map((row) => ({
        inventory_item_id: row.itemId,
        warehouse_id: row.warehouseId,
        quantity_on_hand: row.quantity,
        previous_cost: row.previousCost,
        new_cost: row.newCost,
        unit_difference: row.unitDifference,
        total_previous_value: row.previousTotal,
        total_new_value: row.newTotal,
        total_difference: row.totalDifference,
        notes: null,
      }));

    if (lines.length === 0) {
      alert('No hay líneas con cambios de costo para guardar');
      return;
    }

    try {
      setSaving(true);
      const header: any = {
        revaluation_date: revaluationDate || new Date().toISOString().slice(0, 10),
        description: description || null,
        status: 'draft',
      };

      await inventoryCostRevaluationsService.create(user.id, header, lines);
      alert('Revalorización de costos registrada correctamente');
      fetchRevaluations(user.id);
    } catch (error: any) {
      console.error('[InventoryCostRevaluation] Error saving revaluation', error);
      alert(`Error al guardar la revalorización: ${error?.message || 'revisa la consola para más detalles'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleViewRevaluation = async (id: string) => {
    if (!user?.id) return;
    try {
      setRevaluationDetailsLoading(true);
      const data = await inventoryCostRevaluationsService.getWithLines(user.id, id);
      setSelectedRevaluation(data);
    } catch (error) {
      console.error('[InventoryCostRevaluation] Error loading revaluation details', error);
      alert('Error al cargar el detalle de la revalorización. Revisa la consola para más detalles.');
    } finally {
      setRevaluationDetailsLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (enrichedRows.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    const headers = [
      { key: 'warehouseName', title: 'Almacén' },
      { key: 'sku', title: 'SKU' },
      { key: 'name', title: 'Producto' },
      { key: 'category', title: 'Categoría' },
      { key: 'quantity', title: 'Cantidad' },
      { key: 'previousCost', title: 'Costo Anterior' },
      { key: 'newCost', title: 'Nuevo Costo' },
      { key: 'unitDifference', title: 'Dif. Unidad' },
      { key: 'previousTotal', title: 'Valor Anterior' },
      { key: 'newTotal', title: 'Nuevo Valor' },
      { key: 'totalDifference', title: 'Dif. Total' },
    ];

    const rowsData = enrichedRows.map((r) => ({
      warehouseName: r.warehouseName,
      sku: r.sku,
      name: r.name,
      category: r.category || '',
      quantity: r.quantity,
      previousCost: r.previousCost,
      newCost: r.newCost,
      unitDifference: r.unitDifference,
      previousTotal: r.previousTotal,
      newTotal: r.newTotal,
      totalDifference: r.totalDifference,
    }));

    const companyName =
      (companyInfo?.name as string) ||
      (companyInfo?.company_name as string) ||
      (companyInfo?.legal_name as string) ||
      undefined;

    const title = 'Revalorización de Costos';
    const periodText = `Periodo: ${new Date().toISOString().slice(0, 7)}`;

    exportToExcelWithHeaders(rowsData, headers, 'revalorizacion_costos_inventario', 'Revalorización', undefined, {
      title,
      companyName,
      headerStyle: 'dgii_606',
      periodText,
    });
  };

  const handleExportPdf = async () => {
    if (enrichedRows.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    const columns = [
      { key: 'warehouseName', label: 'Almacén' },
      { key: 'sku', label: 'SKU' },
      { key: 'name', label: 'Producto' },
      { key: 'category', label: 'Categoría' },
      { key: 'quantity', label: 'Cantidad' },
      { key: 'previousCost', label: 'Costo Anterior' },
      { key: 'newCost', label: 'Nuevo Costo' },
      { key: 'unitDifference', label: 'Dif. Unidad' },
      { key: 'previousTotal', label: 'Valor Anterior' },
      { key: 'newTotal', label: 'Nuevo Valor' },
      { key: 'totalDifference', label: 'Dif. Total' },
    ];

    const data = enrichedRows.map((r) => ({
      warehouseName: r.warehouseName,
      sku: r.sku,
      name: r.name,
      category: r.category || '',
      quantity: r.quantity,
      previousCost: r.previousCost,
      newCost: r.newCost,
      unitDifference: r.unitDifference,
      previousTotal: r.previousTotal,
      newTotal: r.newTotal,
      totalDifference: r.totalDifference,
    }));

    try {
      const companyName =
        (companyInfo?.name as string) ||
        (companyInfo?.company_name as string) ||
        'ContaBi';
      const title = `${companyName} - Revalorización de Costos de Inventario`;
      await exportToPdf(data, columns, 'revalorizacion_costos_inventario', title, 'l');
    } catch (error) {
      console.error('[InventoryCostRevaluation] Error exporting PDF', error);
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
            <h1 className="text-2xl font-bold text-gray-900">Revalorización de Costos de Inventario</h1>
            <p className="text-sm text-gray-600 mt-1">
              Ajuste de costos promedio ponderados por producto y almacén.
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de revalorización</label>
              <input
                type="date"
                value={revaluationDate}
                onChange={(e) => setRevaluationDate(e.target.value)}
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
          <div className="mt-4 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción / notas</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej: Ajuste de costos por actualización de lista de precios"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleSaveRevaluation}
                disabled={saving || loading}
                className="w-full md:w-auto bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? 'Guardando...' : 'Guardar revalorización'}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {loading && (
            <div className="px-6 py-3 text-sm text-gray-500">Cargando datos...</div>
          )}

          {!loading && enrichedRows.length === 0 && (
            <div className="px-6 py-4 text-sm text-gray-500">No hay datos para los filtros seleccionados.</div>
          )}

          {!loading && enrichedRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Almacén</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cantidad</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Costo Anterior</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Nuevo Costo</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Dif. Unidad</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Anterior</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Nuevo Valor</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Dif. Total</th>
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
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">{row.quantity}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {row.previousCost.toLocaleString('es-DO')}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right">
                          <input
                            type="number" min="0"
                            step="0.0001"
                            value={newCostByKey[key] ?? ''}
                            onChange={(e) => handleNewCostChange(row, e.target.value)}
                            className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {row.unitDifference.toLocaleString('es-DO')}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {row.previousTotal.toLocaleString('es-DO')}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {row.newTotal.toLocaleString('es-DO')}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {row.totalDifference.toLocaleString('es-DO')}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-50 font-semibold">
                    <td colSpan={4} className="px-4 py-2 text-sm text-right text-gray-700">
                      Totales
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                      {totals.quantity}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">&nbsp;</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">&nbsp;</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">&nbsp;</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                      {totals.previousTotal.toLocaleString('es-DO')}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                      {totals.newTotal.toLocaleString('es-DO')}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                      {totals.totalDifference.toLocaleString('es-DO')}
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
              <h2 className="text-lg font-semibold text-gray-900">Historial de revalorizaciones de costos</h2>
              <p className="text-sm text-gray-500">
                Documentos de revalorización de costos registrados anteriormente.
              </p>
            </div>
          </div>
          {revaluationsLoading && (
            <div className="px-6 py-3 text-sm text-gray-500">Cargando historial...</div>
          )}
          {!revaluationsLoading && revaluations.length === 0 && (
            <div className="px-6 py-4 text-sm text-gray-500">
              No hay revalorizaciones de costos registradas todavía.
            </div>
          )}
          {!revaluationsLoading && revaluations.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Creado el</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {revaluations.map((rev: any) => (
                    <tr key={rev.id}>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                        {rev.revaluation_date ? new Date(rev.revaluation_date).toLocaleDateString('es-DO') : ''}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                        {rev.description || '-'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                        {rev.status || 'draft'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                        {rev.created_at ? new Date(rev.created_at).toLocaleString('es-DO') : ''}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-right">
                        <button
                          type="button"
                          onClick={() => handleViewRevaluation(rev.id)}
                          className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {revaluationDetailsLoading && (
            <div className="px-6 py-3 text-sm text-gray-500 border-t border-gray-100">
              Cargando detalle de la revalorización seleccionada...
            </div>
          )}
          {selectedRevaluation && !revaluationDetailsLoading && (
            <div className="border-t border-gray-100 px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Detalle de revalorización del{' '}
                    {selectedRevaluation.revaluation_date
                      ? new Date(selectedRevaluation.revaluation_date).toLocaleDateString('es-DO')
                      : ''}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {selectedRevaluation.description || '-'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRevaluation(null)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Cerrar
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cantidad</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Costo Anterior</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Nuevo Costo</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Dif. Unidad</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Anterior</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Nuevo Valor</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Dif. Total</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(selectedRevaluation.inventory_cost_revaluation_lines || []).map((line: any) => (
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
                          {Number(line.quantity_on_hand || 0)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {line.previous_cost != null ? Number(line.previous_cost).toLocaleString('es-DO') : ''}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {line.new_cost != null ? Number(line.new_cost).toLocaleString('es-DO') : ''}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {line.unit_difference != null ? Number(line.unit_difference).toLocaleString('es-DO') : ''}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {line.total_previous_value != null
                            ? Number(line.total_previous_value).toLocaleString('es-DO')
                            : ''}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {line.total_new_value != null
                            ? Number(line.total_new_value).toLocaleString('es-DO')
                            : ''}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                          {line.total_difference != null
                            ? Number(line.total_difference).toLocaleString('es-DO')
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
