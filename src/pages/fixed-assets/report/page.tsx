import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { fixedAssetsService, assetTypesService, settingsService } from '../../../services/database';
import { exportToExcelWithHeaders } from '../../../utils/exportImportUtils';
import { formatMoney } from '../../../utils/numberFormat';

interface AssetReportRow {
  id: string;
  code: string;
  name: string;
  category: string;
  location: string;
  acquisitionDate: string;
  acquisitionCost: number;
  currentValue: number;
  accumulatedDepreciation: number;
  status: string;
  supplier: string;
  description: string;
}

export default function FixedAssetsReportPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState<AssetReportRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const [assetsData, typesData] = await Promise.all([
          fixedAssetsService.getAll(user.id),
          assetTypesService.getAll(user.id),
        ]);

        const mappedAssets: AssetReportRow[] = (assetsData || []).map((a: any) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          category: a.category,
          location: a.location || '',
          acquisitionDate: a.purchase_date,
          acquisitionCost: Number(a.purchase_cost) || 0,
          usefulLife: a.useful_life,
          depreciationMethod: a.depreciation_method,
          currentValue: Number(a.current_value) || 0,
          accumulatedDepreciation: Number(a.accumulated_depreciation) || 0,
          status: a.status,
          supplier: a.supplier || '',
          description: a.description || '',
        }));
        setAssets(mappedAssets);

        const activeTypes = (typesData || []).filter((t: any) => t.is_active !== false);
        const mappedCategories = activeTypes.map((t: any) => String(t.name || '')).filter(Boolean);
        setCategories(mappedCategories);
      } catch (error) {
        console.error('[FixedAssetsReport] Error loading data', error);
        setAssets([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user?.id]);

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        !term ||
        asset.name.toLowerCase().includes(term) ||
        asset.code.toLowerCase().includes(term) ||
        asset.category.toLowerCase().includes(term);
      const matchesCategory = !filterCategory || asset.category === filterCategory;
      const matchesStatus = !filterStatus || asset.status === filterStatus;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [assets, searchTerm, filterCategory, filterStatus]);

  const totals = useMemo(() => {
    return filteredAssets.reduce(
      (acc, asset) => {
        acc.totalAssets += 1;
        acc.totalCost += asset.acquisitionCost;
        acc.totalCurrentValue += asset.currentValue;
        acc.totalDepreciation += asset.accumulatedDepreciation;
        return acc;
      },
      {
        totalAssets: 0,
        totalCost: 0,
        totalCurrentValue: 0,
        totalDepreciation: 0,
      },
    );
  }, [filteredAssets]);

  const formatCurrency = (amount: number) => {
    return formatMoney(amount, 'RD$');
  };

  const handleExportExcel = async () => {
    if (filteredAssets.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    let companyName = 'ContaBi';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName =
          (info as any).name ||
          (info as any).company_name ||
          (info as any).legal_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error obteniendo información de la empresa para Excel del reporte de activos fijos:', error);
    }

    const rows = filteredAssets.map((asset) => ({
      code: asset.code,
      name: asset.name,
      category: asset.category,
      location: asset.location,
      acquisitionDate: asset.acquisitionDate
        ? new Date(asset.acquisitionDate).toLocaleDateString('es-DO')
        : '',
      acquisitionCost: asset.acquisitionCost,
      currentValue: asset.currentValue,
      accumulatedDepreciation: asset.accumulatedDepreciation,
      status: asset.status,
      supplier: asset.supplier,
      description: asset.description,
    }));

    const headers = [
      { key: 'code', title: 'Código' },
      { key: 'name', title: 'Nombre del Activo' },
      { key: 'category', title: 'Categoría' },
      { key: 'location', title: 'Ubicación' },
      { key: 'acquisitionDate', title: 'Fecha Adquisición' },
      { key: 'acquisitionCost', title: 'Costo Adquisición' },
      { key: 'currentValue', title: 'Valor Actual' },
      { key: 'accumulatedDepreciation', title: 'Depreciación Acumulada' },
      { key: 'status', title: 'Estado' },
      { key: 'supplier', title: 'Proveedor' },
      { key: 'description', title: 'Descripción' },
    ];

    const today = new Date().toISOString().split('T')[0];
    const fileBase = `reporte_activos_fijos_${today}`;
    const title = 'Reporte de Activos Fijos';
    const periodText = `Periodo: ${new Date().toISOString().slice(0, 7)}`;

    exportToExcelWithHeaders(
      rows,
      headers,
      fileBase,
      'Activos Fijos',
      [12, 28, 20, 18, 18, 18, 18, 22, 14, 24, 40],
      {
        title,
        companyName,
        headerStyle: 'dgii_606',
        periodText,
      },
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reporte de Activos Fijos</h1>
            <p className="text-gray-600 text-sm mt-1">
              Listado de activos fijos con costos, depreciación acumulada y valor en libros.
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleExportExcel}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-file-excel-line mr-2" />
              Exportar Excel
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, código o categoría..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Activo</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos</option>
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
                <option value="En Mantenimiento">En Mantenimiento</option>
                <option value="Dado de Baja">Dado de Baja</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterCategory('');
                  setFilterStatus('');
                }}
                className="w-full bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors whitespace-nowrap"
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Resumen</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
              <div>
                <p className="text-sm text-gray-500">Total de Activos</p>
                <p className="text-xl font-semibold text-gray-900">{totals.totalAssets}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Costo Total</p>
                <p className="text-xl font-semibold text-gray-900">{formatCurrency(totals.totalCost)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Valor Actual Total</p>
                <p className="text-xl font-semibold text-gray-900">{formatCurrency(totals.totalCurrentValue)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Depreciación Acumulada</p>
                <p className="text-xl font-semibold text-gray-900">{formatCurrency(totals.totalDepreciation)}</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-6 text-sm text-gray-500">Cargando datos...</div>
            ) : filteredAssets.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">No hay activos que coincidan con los filtros seleccionados.</div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ubicación</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Costo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Actual</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Depreciación Acum.</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredAssets.map((asset) => (
                    <tr key={asset.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{asset.code}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{asset.name}</div>
                          <div className="text-xs text-gray-500 truncate max-w-xs">{asset.description}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{asset.category}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{asset.location}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(asset.acquisitionCost)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(asset.currentValue)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(asset.accumulatedDepreciation)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                          {asset.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
