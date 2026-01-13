import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { exportToExcelWithHeaders } from '../../../utils/exportImportUtils';
import { fixedAssetsService, assetTypesService, suppliersService, settingsService, journalEntriesService, chartAccountsService, bankAccountsService } from '../../../services/database';
import { formatMoney } from '../../../utils/numberFormat';

interface Asset {
  id: string;
  code: string;
  name: string;
  category: string;
  location: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  depreciationMethod: string;
  currentValue: number;
  accumulatedDepreciation: number;
  status: string;
  supplier: string;
  description: string;
}

export default function AssetRegisterPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const normalizeAssetStatus = (value: unknown) => {
    const raw = String(value || '').trim();
    const s = raw.toLowerCase();

    if (s === 'active' || s === 'activo') return 'Activo';
    if (s === 'inactive' || s === 'inactivo') return 'Inactivo';
    if (s === 'maintenance' || s === 'en mantenimiento') return 'En Mantenimiento';
    if (s === 'disposed' || s === 'dado de baja' || s === 'retirado') return 'Retirado';
    if (s === 'sold' || s === 'vendido') return 'Vendido';

    return raw || 'Activo';
  };

  const denormalizeAssetStatus = (value: unknown) => {
    const raw = String(value || '').trim();
    const s = raw.toLowerCase();

    if (s === 'activo' || s === 'active') return 'active';
    if (s === 'inactivo' || s === 'inactive') return 'inactive';
    if (s === 'en mantenimiento' || s === 'maintenance') return 'maintenance';
    if (s === 'retirado' || s === 'dado de baja' || s === 'disposed') return 'disposed';
    if (s === 'vendido' || s === 'sold') return 'sold';

    return raw || 'active';
  };

  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [assetTypes, setAssetTypes] = useState<any[]>([]);
  const [codeValue, setCodeValue] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [usefulLifeValue, setUsefulLifeValue] = useState('');
  const [depreciationMethodValue, setDepreciationMethodValue] = useState('');
  const [acquisitionMethod, setAcquisitionMethod] = useState<'cash' | 'bank' | 'credit'>('cash');
  const [selectedBankId, setSelectedBankId] = useState('');
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [chartAccounts, setChartAccounts] = useState<any[]>([]);
  const [generateJournalEntry, setGenerateJournalEntry] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      try {
        const [assetsData, typesData, suppliersData, banksData, accountsData] = await Promise.all([
          fixedAssetsService.getAll(user.id),
          assetTypesService.getAll(user.id),
          suppliersService.getAll(user.id),
          bankAccountsService.getAll(user.id),
          chartAccountsService.getAll(user.id),
        ]);

        const mappedAssets: Asset[] = (assetsData || []).map((a: any) => ({
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
          status: normalizeAssetStatus(a.status),
          supplier: a.supplier || '',
          description: a.description || '',
        }));
        setAssets(mappedAssets);

        const activeTypes = (typesData || []).filter((t: any) => t.is_active !== false);
        const mappedCategories = activeTypes.map((t: any) => String(t.name || '')).filter(Boolean);
        setAssetTypes(activeTypes || []);
        setCategories(mappedCategories);

        setSuppliers(Array.isArray(suppliersData) ? suppliersData : []);
        setBankAccounts(Array.isArray(banksData) ? banksData : []);
        setChartAccounts(Array.isArray(accountsData) ? accountsData : []);
      } catch (error) {
        console.error('Error loading fixed assets data:', error);
      }
    };

    loadData();
  }, [user]);

  const depreciationMethods = [
    'Línea Recta',
    'Saldo Decreciente',
    'Suma de Dígitos',
    'Unidades de Producción'
  ];

  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         asset.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !filterCategory || asset.category === filterCategory;
    const matchesStatus = !filterStatus || asset.status === filterStatus;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const statusDisplayMap: Record<string, string> = {
    Activo: 'Active',
    Inactivo: 'Inactive',
    'En Mantenimiento': 'Under Maintenance',
    Retirado: 'Retired',
    Vendido: 'Sold',
  };

  const statusOptions = [
    { value: 'Activo', label: 'Active' },
    { value: 'Inactivo', label: 'Inactive' },
    { value: 'En Mantenimiento', label: 'Under Maintenance' },
    { value: 'Retirado', label: 'Retired' },
    { value: 'Vendido', label: 'Sold' },
  ];

  const handleAddAsset = () => {
    setEditingAsset(null);
    setCodeValue('');
    setFormCategory('');
    setUsefulLifeValue('');
    setDepreciationMethodValue('');
    setShowModal(true);
  };

  const handleEditAsset = (asset: Asset) => {
    setEditingAsset(asset);
    setCodeValue(asset.code);
    setFormCategory(asset.category || '');
    setUsefulLifeValue(asset.usefulLife != null ? String(asset.usefulLife) : '');
    setDepreciationMethodValue(asset.depreciationMethod || '');
    setShowModal(true);
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!confirm('¿Está seguro de que desea eliminar este activo?')) return;
    try {
      await fixedAssetsService.delete(assetId);
      setAssets(prev => prev.filter(asset => asset.id !== assetId));
    } catch (error) {
      console.error('Error deleting asset:', error);
      alert('Error al eliminar el activo');
    }
  };

  const handleGenerateCode = () => {
    // Generar un código simple basado en la cantidad existente, ej: ACT-001, ACT-002, etc.
    const base = 'ACT';
    const nextNumber = assets.length + 1;
    const padded = String(nextNumber).padStart(3, '0');
    setCodeValue(`${base}-${padded}`);
  };

  const handleCategoryChange = (value: string) => {
    setFormCategory(value);
    if (!value) return;

    const categoryLower = String(value).toLowerCase();
    const landKeywords = [
      'terreno',
      'terrenos',
      'land',
      'solar',
      'solares',
      'lote',
      'lotes',
      'parcela',
      'parcelas',
      'finca',
      'fincas',
      'sitio',
      'sitios',
    ];
    if (landKeywords.some((k) => categoryLower.includes(k))) {
      setUsefulLifeValue('0');
      setDepreciationMethodValue('');
      return;
    }

    const type = assetTypes.find((t: any) => String(t.name || '') === value);
    if (type) {
      if (type.useful_life != null) {
        setUsefulLifeValue(String(type.useful_life));
      }
      if (type.depreciation_method) {
        setDepreciationMethodValue(String(type.depreciation_method));
      }
    }
  };

  const handleSaveAsset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const formData = new FormData(e.currentTarget);
    const payload: any = {
      code: String(formData.get('code') || '').trim() || codeValue.trim(),
      name: String(formData.get('name') || '').trim(),
      category: String(formData.get('category') || formCategory || '').trim(),
      location: String(formData.get('location') || '').trim() || null,
      purchase_date: String(formData.get('acquisitionDate') || ''),
      purchase_cost: Number(formData.get('acquisitionCost') || 0) || 0,
      useful_life: Number(usefulLifeValue || formData.get('usefulLife') || 0) || 0,
      depreciation_method: String(depreciationMethodValue || formData.get('depreciationMethod') || '').trim(),
      current_value: Number(formData.get('currentValue') || 0) || 0,
      accumulated_depreciation: Number(formData.get('accumulatedDepreciation') || 0) || 0,
      status: denormalizeAssetStatus(formData.get('status') || 'Activo'),
      supplier: String(formData.get('supplier') || '').trim() || null,
      description: String(formData.get('description') || '').trim() || null,
    };

    // Terrenos no se deprecian
    const categoryLower = String(payload.category || '').toLowerCase();
    const landKeywords = [
      'terreno',
      'terrenos',
      'land',
      'solar',
      'solares',
      'lote',
      'lotes',
      'parcela',
      'parcelas',
      'finca',
      'fincas',
      'sitio',
      'sitios',
    ];
    if (landKeywords.some((k) => categoryLower.includes(k))) {
      payload.useful_life = 0;
      payload.depreciation_method = '';
    }

    try {
      if (editingAsset) {
        const updated = await fixedAssetsService.update(editingAsset.id, payload);
        const mapped: Asset = {
          id: updated.id,
          code: updated.code,
          name: updated.name,
          category: updated.category,
          location: updated.location || '',
          acquisitionDate: updated.purchase_date,
          acquisitionCost: Number(updated.purchase_cost) || 0,
          usefulLife: updated.useful_life,
          depreciationMethod: updated.depreciation_method,
          currentValue: Number(updated.current_value) || 0,
          accumulatedDepreciation: Number(updated.accumulated_depreciation) || 0,
          status: normalizeAssetStatus(updated.status),
          supplier: updated.supplier || '',
          description: updated.description || '',
        };
        setAssets(prev => prev.map(asset => asset.id === editingAsset.id ? mapped : asset));
      } else {
        const created = await fixedAssetsService.create(user.id, payload);
        const mapped: Asset = {
          id: created.id,
          code: created.code,
          name: created.name,
          category: created.category,
          location: created.location || '',
          acquisitionDate: created.purchase_date,
          acquisitionCost: Number(created.purchase_cost) || 0,
          usefulLife: created.useful_life,
          depreciationMethod: created.depreciation_method,
          currentValue: Number(created.current_value) || 0,
          accumulatedDepreciation: Number(created.accumulated_depreciation) || 0,
          status: normalizeAssetStatus(created.status),
          supplier: created.supplier || '',
          description: created.description || '',
        };
        setAssets(prev => [...prev, mapped]);

        // Generar asiento contable si está habilitado
        if (generateJournalEntry && payload.purchase_cost > 0) {
          try {
            // Obtener el tipo de activo para encontrar la cuenta contable
            const assetType = assetTypes.find((t: any) => String(t.name || '') === payload.category);
            if (assetType && assetType.account) {
              // Extraer código de cuenta del formato "150101 - Edificaciones"
              const accountCodeMatch = assetType.account.match(/^(\d+)/);
              const assetAccountCode = accountCodeMatch ? accountCodeMatch[1] : null;
              
              // Buscar la cuenta del activo fijo
              const assetAccount = chartAccounts.find((acc: any) => 
                acc.code === assetAccountCode || acc.code?.startsWith(assetAccountCode)
              );

              // Determinar la cuenta de contrapartida según el método de adquisición
              let creditAccountId: string | null = null;
              let creditAccountName = '';

              if (acquisitionMethod === 'bank' && selectedBankId) {
                const bank = bankAccounts.find((b: any) => b.id === selectedBankId);
                if (bank && bank.account_id) {
                  creditAccountId = bank.account_id;
                  creditAccountName = bank.name || 'Banco';
                }
              } else if (acquisitionMethod === 'credit') {
                // Buscar cuenta de Cuentas por Pagar (200101 o similar)
                const apAccount = chartAccounts.find((acc: any) => 
                  acc.code === '200101' || acc.code === '2001' || 
                  (acc.name && acc.name.toLowerCase().includes('cuentas por pagar'))
                );
                if (apAccount) {
                  creditAccountId = apAccount.id;
                  creditAccountName = 'Cuentas por Pagar';
                }
              } else {
                // Efectivo - buscar cuenta de Caja (100101 o similar)
                const cashAccount = chartAccounts.find((acc: any) => 
                  acc.code === '100101' || acc.code === '1001' || 
                  (acc.name && acc.name.toLowerCase().includes('caja'))
                );
                if (cashAccount) {
                  creditAccountId = cashAccount.id;
                  creditAccountName = 'Caja';
                }
              }

              if (assetAccount && creditAccountId) {
                const entryLines = [
                  {
                    account_id: assetAccount.id,
                    description: `Adquisición activo fijo: ${payload.name}`,
                    debit_amount: payload.purchase_cost,
                    credit_amount: 0,
                  },
                  {
                    account_id: creditAccountId,
                    description: `Adquisición activo fijo: ${payload.name}`,
                    debit_amount: 0,
                    credit_amount: payload.purchase_cost,
                  },
                ];

                await journalEntriesService.createWithLines(user.id, {
                  entry_number: `AF-${payload.code}`,
                  entry_date: payload.purchase_date,
                  description: `Adquisición activo fijo: ${payload.name} (${payload.code})`,
                  reference: payload.code,
                  status: 'posted',
                }, entryLines);

                console.log('✓ Asiento contable creado para activo fijo:', payload.code);
              } else {
                console.warn('No se pudo crear asiento contable: cuenta de activo o contrapartida no encontrada');
              }
            }
          } catch (journalError) {
            console.error('Error creando asiento contable para activo fijo:', journalError);
            // No fallar el guardado del activo si el asiento falla
            alert('Activo guardado, pero hubo un error al crear el asiento contable. Verifique la configuración de cuentas.');
          }
        }
      }

      setShowModal(false);
      setEditingAsset(null);
    } catch (error) {
      console.error('Error saving asset:', error);
      alert('Error al guardar el activo');
    }
  };

  const exportToExcel = async () => {
    const filteredData = filteredAssets;
    if (!filteredData || filteredData.length === 0) {
      alert('No data available to export.');

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
      console.error('Error obtaining company information for Excel export:', error);
    }

    const rows = filteredData.map((asset) => ({
      code: asset.code,
      name: asset.name,
      category: asset.category,
      location: asset.location,
      acquisition_date: asset.acquisitionDate,
      acquisition_cost: asset.acquisitionCost,
      useful_life: asset.usefulLife,
      depreciation_method: asset.depreciationMethod,
      current_value: asset.currentValue,
      accumulated_depreciation: asset.accumulatedDepreciation,
      status: asset.status,
      supplier: asset.supplier,
      description: asset.description,
    }));

    const headers = [
      { key: 'code', title: 'Code' },
      { key: 'name', title: 'Asset Name' },
      { key: 'category', title: 'Category' },
      { key: 'location', title: 'Location' },
      { key: 'acquisition_date', title: 'Acquisition Date' },
      { key: 'acquisition_cost', title: 'Acquisition Cost' },
      { key: 'useful_life', title: 'Useful Life (years)' },
      { key: 'depreciation_method', title: 'Depreciation Method' },
      { key: 'current_value', title: 'Current Value' },
      { key: 'accumulated_depreciation', title: 'Accumulated Depreciation' },
      { key: 'status', title: 'Status' },
      { key: 'supplier', title: 'Supplier' },
      { key: 'description', title: 'Description' },
    ];

    const today = new Date().toISOString().split('T')[0];
    const fileBase = `asset_register_${today}`;
    const title = 'Fixed Asset Register';

    const periodText = `Period: ${new Date().toISOString().slice(0, 7)}`;

    exportToExcelWithHeaders(
      rows,
      headers,
      fileBase,
      'Assets',
      [12, 28, 20, 18, 16, 16, 14, 20, 16, 20, 14, 20, 32],
      {
        title,
        companyName,
        headerStyle: 'dgii_606',
        periodText,
      },
    );
  };

  const formatCurrency = (amount: number) => {
    return formatMoney(amount, '');
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#f7f1e3] p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate('/fixed-assets')}
              className="flex items-center text-[#4f5f33] hover:text-[#2e3c21] mb-2"
            >
              <i className="ri-arrow-left-line mr-1"></i>
              Back to Fixed Assets
            </button>
            <h1 className="text-2xl font-bold text-[#2e3c21]">Asset Registry</h1>
            <p className="text-[#6b7a40]">Manage the entire lifecycle of your fixed assets</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={exportToExcel}
              className="bg-[#4f5f33] text-white px-4 py-2 rounded-lg hover:bg-[#3b4d2d] transition-colors whitespace-nowrap"
            >
              <i className="ri-file-excel-line mr-2"></i>
              Export Excel
            </button>
            <button
              onClick={handleAddAsset}
              className="bg-[#2f5baa] text-white px-4 py-2 rounded-lg hover:bg-[#244682] transition-colors whitespace-nowrap"
            >
              <i className="ri-add-line mr-2"></i>
              New Asset
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white/95 rounded-2xl shadow-sm border border-[#eadfc6] p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#3b4d2d] mb-2">
                Search
              </label>
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-[#b1a78f]"></i>
                <input
                  type="text"
                  placeholder="Search by name or code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-[#d4c9b1] rounded-lg focus:ring-2 focus:ring-[#6b7a40] focus:border-[#6b7a40]"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#3b4d2d] mb-2">
                Category
              </label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 border border-[#d4c9b1] rounded-lg focus:ring-2 focus:ring-[#6b7a40] focus:border-[#6b7a40]"
              >
                <option value="">All categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#3b4d2d] mb-2">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-[#d4c9b1] rounded-lg focus:ring-2 focus:ring-[#6b7a40] focus:border-[#6b7a40]"
              >
                <option value="">All statuses</option>
                {statusOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterCategory('');
                  setFilterStatus('');
                }}
                className="w-full bg-[#b1a78f] text-[#2e3c21] px-4 py-2 rounded-lg hover:bg-[#a09682] transition-colors whitespace-nowrap"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Assets Table */}
        <div className="bg-white/95 rounded-2xl shadow-sm border border-[#eadfc6]">
          <div className="p-6 border-b border-[#eadfc6]">
            <h3 className="text-lg font-semibold text-[#2e3c21]">
              Registered Assets ({filteredAssets.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#f1ead6]">
                <tr>
                  {['Code', 'Asset', 'Category', 'Acquisition Cost', 'Current Value', 'Status', 'Actions'].map((header) => (
                    <th
                      key={header}
                      className="px-6 py-3 text-left text-xs font-semibold text-[#5f543a] uppercase tracking-wider"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#f1ead6]">
                {filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-[#faf5e6]">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[#2e3c21]">
                      {asset.code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-[#2e3c21]">{asset.name}</div>
                        <div className="text-sm text-[#7b6e4f]">{asset.location}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2e3c21]">
                      {asset.category}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2e3c21]">
                      {formatCurrency(asset.acquisitionCost)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2e3c21]">
                      {formatCurrency(asset.currentValue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          asset.status === 'Activo'
                            ? 'bg-green-100 text-green-800'

                            : asset.status === 'Inactivo'
                            ? 'bg-gray-100 text-gray-800'
                            : asset.status === 'En Mantenimiento'
                            ? 'bg-blue-100 text-blue-800'
                            : asset.status === 'Retirado'
                            ? 'bg-yellow-100 text-yellow-800'
                            : asset.status === 'Vendido'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {statusDisplayMap[asset.status] ?? asset.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditAsset(asset)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => handleDeleteAsset(asset.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Asset Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[#fdf6e7] rounded-2xl border border-[#eadfc6] p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-[#2e3c21]">
                  {editingAsset ? 'Edit Asset' : 'New Asset'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-[#7b6e4f] hover:text-[#2e3c21]"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <form onSubmit={handleSaveAsset} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-[#3b4d2d] mb-2">
                      Asset Code *
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        name="code"
                        value={codeValue}
                        onChange={(e) => setCodeValue(e.target.value)}
                        className="flex-1 px-3 py-2 border border-[#d4c9b1] rounded-lg focus:ring-2 focus:ring-[#6b7a40] focus:border-[#6b7a40]"
                        placeholder="ACT-001"
                      />
                      <button
                        type="button"
                        onClick={handleGenerateCode}
                        className="px-3 py-2 bg-[#fdf6e7] text-[#3b4d2d] rounded-lg border border-[#eadfc6] hover:bg-[#f4ead4] transition-colors whitespace-nowrap text-sm"
                      >
                        Generate
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#3b4d2d] mb-2">
                      Asset Name *
                    </label>
                    <input
                      type="text"
                      required
                      name="name"
                      defaultValue={editingAsset?.name || ''}
                      className="w-full px-3 py-2 border border-[#d4c9b1] rounded-lg focus:ring-2 focus:ring-[#6b7a40] focus:border-[#6b7a40]"
                      placeholder="Enter asset name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#3b4d2d] mb-2">
                      Asset Type *
                    </label>
                    <select
                      required
                      name="category"
                      value={formCategory}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      className="w-full px-3 py-2 border border-[#d4c9b1] rounded-lg focus:ring-2 focus:ring-[#6b7a40] focus:border-[#6b7a40]"
                    >
                      <option value="">Select category</option>
                      {categories.map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#3b4d2d] mb-2">
                      Location
                    </label>
                    <input
                      type="text"
                      name="location"
                      defaultValue={editingAsset?.location || ''}
                      className="w-full px-3 py-2 border border-[#d4c9b1] rounded-lg focus:ring-2 focus:ring-[#6b7a40] focus:border-[#6b7a40]"
                      placeholder="Asset location"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#3b4d2d] mb-2">
                      Acquisition Date *
                    </label>
                    <input
                      type="date"
                      required
                      name="acquisitionDate"
                      defaultValue={editingAsset?.acquisitionDate || ''}
                      className="w-full px-3 py-2 border border-[#d4c9b1] rounded-lg focus:ring-2 focus:ring-[#6b7a40] focus:border-[#6b7a40]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#3b4d2d] mb-2">
                      Acquisition Cost *
                    </label>
                    <input
                      type="number" min="0"
                      required
                      step="0.01"
                      name="acquisitionCost"
                      defaultValue={editingAsset?.acquisitionCost || ''}
                      className="w-full px-3 py-2 border border-[#d4c9b1] rounded-lg focus:ring-2 focus:ring-[#6b7a40] focus:border-[#6b7a40]"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#3b4d2d] mb-2">
                      Useful Life (years) *
                    </label>
                    <input
                      type="number" min="0"
                      required
                      name="usefulLife"
                      value={usefulLifeValue}
                      onChange={(e) => setUsefulLifeValue(e.target.value)}
                      className="w-full px-3 py-2 border border-[#d4c9b1] rounded-lg focus:ring-2 focus:ring-[#6b7a40] focus:border-[#6b7a40]"
                      placeholder="10"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#3b4d2d] mb-2">
                      Depreciation Method *
                    </label>
                    <select
                      required
                      name="depreciationMethod"
                      value={depreciationMethodValue}
                      onChange={(e) => setDepreciationMethodValue(e.target.value)}
                      className="w-full px-3 py-2 border border-[#d4c9b1] rounded-lg focus:ring-2 focus:ring-[#6b7a40] focus:border-[#6b7a40]"
                    >
                      <option value="">Select method</option>
                      {depreciationMethods.map(method => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#3b4d2d] mb-2">
                      Supplier
                    </label>
                    <select
                      name="supplier"
                      defaultValue={editingAsset?.supplier || ''}
                      className="w-full px-3 py-2 border border-[#d4c9b1] rounded-lg focus:ring-2 focus:ring-[#6b7a40] focus:border-[#6b7a40]"
                    >
                      <option value="">Select supplier</option>
                      {suppliers.map((s: any) => (
                        <option key={s.id} value={s.name || s.company_name || ''}>
                          {s.name || s.company_name || 'Supplier'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#3b4d2d] mb-2">
                      Status
                    </label>
                    <select
                      name="status"
                      defaultValue={editingAsset?.status || 'Activo'}
                      className="w-full px-3 py-2 border border-[#d4c9b1] rounded-lg focus:ring-2 focus:ring-[#6b7a40] focus:border-[#6b7a40]"
                    >
                      {statusOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#3b4d2d] mb-2">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    name="description"
                    defaultValue={editingAsset?.description || ''}
                    className="w-full px-3 py-2 border border-[#d4c9b1] rounded-lg focus:ring-2 focus:ring-[#6b7a40] focus:border-[#6b7a40]"
                    placeholder="Enter asset description"
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    {editingAsset ? 'Update' : 'Register'} Asset
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}