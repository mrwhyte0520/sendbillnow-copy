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
      alert('There are no assets to export.');
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
      console.error('Error fetching company info for fixed asset report Excel export:', error);
    }

    const rows = filteredAssets.map((asset) => ({
      code: asset.code,
      name: asset.name,
      category: asset.category,
      location: asset.location,
      acquisitionDate: asset.acquisitionDate
        ? new Date(asset.acquisitionDate).toLocaleDateString('en-US')
        : '',
      acquisitionCost: asset.acquisitionCost,
      currentValue: asset.currentValue,
      accumulatedDepreciation: asset.accumulatedDepreciation,
      status: asset.status,
      supplier: asset.supplier,
      description: asset.description,
    }));

    const headers = [
      { key: 'code', title: 'Code' },
      { key: 'name', title: 'Asset Name' },
      { key: 'category', title: 'Category' },
      { key: 'location', title: 'Location' },
      { key: 'acquisitionDate', title: 'Acquisition Date' },
      { key: 'acquisitionCost', title: 'Acquisition Cost' },
      { key: 'currentValue', title: 'Current Value' },
      { key: 'accumulatedDepreciation', title: 'Accumulated Depreciation' },
      { key: 'status', title: 'Status' },
      { key: 'supplier', title: 'Supplier' },
      { key: 'description', title: 'Description' },
    ];

    const today = new Date().toISOString().split('T')[0];
    const fileBase = `fixed_assets_report_${today}`;
    const title = 'Fixed Asset Report';
    const periodText = `Period: ${new Date().toISOString().slice(0, 7)}`;

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
      <div className="space-y-6 p-6 bg-[#f7f3e8] min-h-screen">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#2f3e1e]">Fixed Asset Report</h1>
            <p className="text-[#6b5c3b] text-sm mt-1">
              Listings of fixed assets with cost basis, accumulated depreciation, and book value.
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleExportExcel}
              className="bg-[#3f5d2a] text-white px-4 py-2 rounded-lg hover:bg-[#2d451f] transition-colors whitespace-nowrap shadow-sm border border-[#2d451f] flex items-center"
            >
              <i className="ri-file-excel-line mr-2" />
              Export Excel
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#e4d8c4] p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#4a3c24] mb-2">Search</label>
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-[#b29a71]" />
                <input
                  type="text"
                  placeholder="Search by asset, code, or category..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-[#d8cbb5] rounded-lg focus:ring-2 focus:ring-[#3f5d2a] focus:border-[#3f5d2a]"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#4a3c24] mb-2">Asset Type</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg focus:ring-2 focus:ring-[#3f5d2a] focus:border-[#3f5d2a]"
              >
                <option value="">All types</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#4a3c24] mb-2">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg focus:ring-2 focus:ring-[#3f5d2a] focus:border-[#3f5d2a]"
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="maintenance">Under Maintenance</option>
                <option value="retired">Disposed</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterCategory('');
                  setFilterStatus('');
                }}
                className="w-full bg-[#4a3c24] text-white px-4 py-2 rounded-lg hover:bg-[#2f3e1e] transition-colors whitespace-nowrap shadow-sm border border-[#2f3e1e]"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#e4d8c4]">
          <div className="p-6 border-b border-[#e4d8c4]">
            <h3 className="text-lg font-semibold text-[#2f3e1e]">Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
              <div>
                <p className="text-sm text-[#6b5c3b]">Total Assets</p>
                <p className="text-2xl font-bold text-[#2f3e1e]">{totals.totalAssets}</p>
              </div>
              <div>
                <p className="text-sm text-[#6b5c3b]">Total Cost</p>
                <p className="text-2xl font-bold text-[#7a2e1b]">{formatCurrency(totals.totalCost)}</p>
              </div>
              <div>
                <p className="text-sm text-[#6b5c3b]">Total Current Value</p>
                <p className="text-2xl font-bold text-[#245c39]">{formatCurrency(totals.totalCurrentValue)}</p>
              </div>
              <div>
                <p className="text-sm text-[#6b5c3b]">Accumulated Depreciation</p>
                <p className="text-2xl font-bold text-[#7a2e1b]">{formatCurrency(totals.totalDepreciation)}</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-6 text-sm text-[#6b5c3b]">Loading assets...</div>
            ) : filteredAssets.length === 0 ? (
              <div className="p-6 text-sm text-[#6b5c3b]">No assets match the selected filters.</div>
            ) : (
              <table className="w-full">
                <thead className="bg-[#ede7d7]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Code</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Asset</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Location</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Cost</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Current Value</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Accum. Depreciation</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-[#f3ecda]">
                  {filteredAssets.map((asset) => (
                    <tr key={asset.id} className="hover:bg-[#fffdf6]">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-[#2f3e1e]">{asset.code}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-semibold text-[#2f3e1e]">{asset.name}</div>
                          <div className="text-xs text-[#6b5c3b] truncate max-w-xs">{asset.description}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2f3e1e]">{asset.category}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2f3e1e]">{asset.location}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2f3e1e]">{formatCurrency(asset.acquisitionCost)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[#245c39] font-semibold">{formatCurrency(asset.currentValue)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[#7a2e1b]">{formatCurrency(asset.accumulatedDepreciation)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-[#d7e4c0] text-[#1f2913]">
                          {asset.status || 'N/A'}
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
