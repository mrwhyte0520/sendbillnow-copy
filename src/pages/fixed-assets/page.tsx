import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { fixedAssetsService, assetDepreciationService } from '../../services/database';
import { formatMoney } from '../../utils/numberFormat';

export default function FixedAssetsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  // Load data from database
  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        const [assets, depreciations] = await Promise.all([
          fixedAssetsService.getAll(user.id),
          assetDepreciationService.getAll(user.id),
        ]);

        const assetsArr = Array.isArray(assets) ? assets : [];
        const depreciationsArr = Array.isArray(depreciations) ? depreciations : [];

        // Si no hay datos, solo establecer valores en 0 y continuar
        if (assetsArr.length === 0 && depreciationsArr.length === 0) {
          console.info('No fixed assets or depreciations found for user');
          setLoading(false);
          return;
        }

        // Calculate total value (usando purchase_cost que es el campo real en la tabla)
        const totalValue = assetsArr.reduce((sum, asset: any) => sum + (Number(asset.purchase_cost) || 0), 0);

        // Calculate total accumulated depreciation (monthly_depreciation o accumulated_depreciation)
        const totalDepreciation = assetsArr.reduce((sum, asset: any) => sum + (Number(asset.accumulated_depreciation) || 0), 0);

        // Calculate net value
        const netValue = totalValue - totalDepreciation;

        // Count total assets
        const totalAssets = assetsArr.length;

        setAssetsStats([
          {
            title: 'Valor Total de Activos',
            value: formatMoney(totalValue, 'RD$'),
            change: '',
            icon: 'ri-building-line',
            color: 'blue',
          },
          {
            title: 'Depreciación Acumulada',
            value: formatMoney(totalDepreciation, 'RD$'),
            change: '',
            icon: 'ri-line-chart-line',
            color: 'red',
          },
          {
            title: 'Valor Neto',
            value: formatMoney(netValue, 'RD$'),
            change: '',
            icon: 'ri-money-dollar-circle-line',
            color: 'green',
          },
          {
            title: 'Total de Activos',
            value: String(totalAssets),
            change: '',
            icon: 'ri-archive-line',
            color: 'purple',
          },
        ]);

        // Group assets by category (usando 'category' que es el campo real)
        const categoryMap: Record<string, { count: number; value: number; depreciation: number }> = {};
        assetsArr.forEach((asset: any) => {
          const category = asset.category || 'Sin Categoría';
          if (!categoryMap[category]) {
            categoryMap[category] = { count: 0, value: 0, depreciation: 0 };
          }
          categoryMap[category].count += 1;
          categoryMap[category].value += Number(asset.purchase_cost) || 0;
          categoryMap[category].depreciation += Number(asset.accumulated_depreciation) || 0;
        });

        const categoriesData = Object.entries(categoryMap).map(([category, data]) => ({
          category,
          count: data.count,
          value: formatMoney(data.value, 'RD$'),
          depreciation: formatMoney(data.depreciation, 'RD$'),
        }));

        if (categoriesData.length > 0) {
          setAssetsByCategory(categoriesData);
        }

        // Recent depreciations (max 3)
        const recentDeps = depreciationsArr
          .sort((a: any, b: any) => new Date(b.depreciation_date || b.created_at || 0).getTime() - new Date(a.depreciation_date || a.created_at || 0).getTime())
          .slice(0, 3)
          .map((dep: any) => {
            // Find the related asset (usando 'name' que es el campo real)
            const asset = assetsArr.find((a: any) => a.id === dep.asset_id);
            const assetName = dep.asset_name || asset?.name || 'Activo';
            const assetCode = dep.asset_code || asset?.code || '';
            const depAmount = Number(dep.monthly_depreciation) || Number(dep.depreciation_amount) || 0;
            const accDepAmount = Number(dep.accumulated_depreciation) || 0;
            const dateStr = (dep.depreciation_date || '').slice(0, 10) || (dep.created_at || '').slice(0, 10);

            return {
              asset: assetName,
              code: assetCode,
              monthlyDepreciation: formatMoney(depAmount, 'RD$'),
              accumulatedDepreciation: formatMoney(accDepAmount, 'RD$'),
              date: dateStr ? new Date(dateStr).toLocaleDateString('es-DO') : '',
            };
          });

        if (recentDeps.length > 0) {
          setRecentDepreciations(recentDeps);
        }
      } catch (error) {
        console.error('Error loading fixed assets data:', error);
        if (error instanceof Error) {
          console.error('Error message:', error.message);
          console.error('Error stack:', error.stack);
        }
        // Continue with default hardcoded values on error
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user?.id]);

  const modules = [
    {
      title: 'Registro de Activos',
      description: 'Registro y mantenimiento de activos fijos',
      icon: 'ri-building-line',
      href: '/fixed-assets/register',
      color: 'blue',
    },
    {
      title: 'Tipos de Activos',
      description: 'Configuración de categorías de activos',
      icon: 'ri-list-check-line',
      href: '/fixed-assets/types',
      color: 'green',
    },
    {
      title: 'Depreciación',
      description: 'Cálculo y registro de depreciaciones',
      icon: 'ri-line-chart-line',
      href: '/fixed-assets/depreciation',
      color: 'purple',
    },
    {
      title: 'Tipos de Depreciación',
      description: 'Catálogo de métodos y parámetros de depreciación',
      icon: 'ri-settings-3-line',
      href: '/fixed-assets/depreciation-types',
      color: 'indigo',
    },
    {
      title: 'Reporte de Activos Fijos',
      description: 'Listado consolidado de activos con valores y depreciación acumulada',
      icon: 'ri-file-list-3-line',
      href: '/fixed-assets/report',
      color: 'cyan',
    },
    {
      title: 'Revalorización',
      description: 'Revalorización de activos fijos',
      icon: 'ri-trending-up-line',
      href: '/fixed-assets/revaluation',
      color: 'orange',
    },
    {
      title: 'Retiro de Activos',
      description: 'Proceso de baja de activos fijos',
      icon: 'ri-delete-bin-line',
      href: '/fixed-assets/disposal',
      color: 'red',
    },
  ];

  const colorMap: Record<string, { bg: string; text: string }> = {
    blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
    red: { bg: 'bg-red-100', text: 'text-red-600' },
    green: { bg: 'bg-green-100', text: 'text-green-600' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-600' },
    indigo: { bg: 'bg-indigo-100', text: 'text-indigo-600' },
    cyan: { bg: 'bg-cyan-100', text: 'text-cyan-600' },
    orange: { bg: 'bg-orange-100', text: 'text-orange-600' },
    slate: { bg: 'bg-slate-100', text: 'text-slate-600' },
  };

  const getColorClasses = (c: string) => colorMap[c] || colorMap.slate;

  const [assetsStats, setAssetsStats] = useState([
    {
      title: 'Valor Total de Activos',
      value: 'RD$ 0',
      change: '',
      icon: 'ri-building-line',
      color: 'blue',
    },
    {
      title: 'Depreciación Acumulada',
      value: 'RD$ 0',
      change: '',
      icon: 'ri-line-chart-line',
      color: 'red',
    },
    {
      title: 'Valor Neto',
      value: 'RD$ 0',
      change: '',
      icon: 'ri-money-dollar-circle-line',
      color: 'green',
    },
    {
      title: 'Total de Activos',
      value: '0',
      change: '',
      icon: 'ri-archive-line',
      color: 'purple',
    },
  ]);

  const [assetsByCategory, setAssetsByCategory] = useState<Array<{
    category: string;
    count: number;
    value: string;
    depreciation: string;
  }>>([]);

  const [recentDepreciations, setRecentDepreciations] = useState<Array<{
    asset: string;
    code: string;
    monthlyDepreciation: string;
    accumulatedDepreciation: string;
    date: string;
  }>>([]);

  // Module Access Functions
  const handleAccessModule = (moduleHref: string) => {
    navigate(moduleHref);
  };

  // Navigation Functions
  const handleViewAllDepreciations = () => {
    navigate('/fixed-assets/depreciation');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Módulo de Activos Fijos</h1>
          <p className="text-gray-600">Gestión integral de activos fijos y depreciaciones</p>
        </div>

        {/* Assets Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {assetsStats.map((stat, index) => (
            <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getColorClasses(stat.color).bg}`}>
                  <i className={`${stat.icon || 'ri-apps-line'} text-xl ${getColorClasses(stat.color).text}`}></i>
                </div>
              </div>
              {stat.change && (
                <div className="mt-4">
                  <span className={`text-sm font-medium ${stat.change.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                    {stat.change}
                  </span>
                  <span className="text-sm text-gray-500 ml-1">vs mes anterior</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {modules.map((module, index) => (
            <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center mb-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getColorClasses(module.color).bg} mr-4`}>
                  <i className={`${module.icon || 'ri-apps-line'} text-xl ${getColorClasses(module.color).text}`}></i>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{module.title}</h3>
              <p className="text-gray-600 mb-4 text-sm">{module.description}</p>
              <button
                onClick={() => handleAccessModule(module.href)}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                Acceder
              </button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Assets by Category */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Activos por Categoría</h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {assetsByCategory.map((category, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100 mr-3">
                        <i className="ri-folder-2-line text-lg text-blue-600"></i>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{category.category}</p>
                        <p className="text-sm text-gray-600">{category.count} activos</p>
                        <p className="text-xs text-gray-500">Depreciación: {category.depreciation} anual</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{category.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Depreciations */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Depreciaciones del Mes</h3>
                <button
                  onClick={handleViewAllDepreciations}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium whitespace-nowrap"
                >
                  Ver todas
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {recentDepreciations.map((depreciation, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-green-100 mr-3">
                        <i className="ri-calendar-line text-lg text-green-600"></i>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{depreciation.asset}</p>
                        <p className="text-sm text-gray-600">Código: {depreciation.code}</p>
                        <p className="text-xs text-gray-500">Acumulada: {depreciation.accumulatedDepreciation}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-red-600">{depreciation.monthlyDepreciation}</p>
                      <p className="text-xs text-gray-500">{depreciation.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}