import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { exportToExcelWithHeaders } from '../../../utils/exportImportUtils';
import { assetDepreciationTypesService, assetTypesService, chartAccountsService, settingsService } from '../../../services/database';

interface AssetType {
  id: string;
  name: string;
  description: string;
  depreciationTypeId?: string;
  depreciationRate: number;
  usefulLife: number;
  depreciationMethod: string;
  account: string;
  depreciationAccount: string;
  accumulatedDepreciationAccount: string;
  revaluationGainAccount: string;
  revaluationLossAccount: string;
  isActive: boolean;
  createdAt: string;
}

interface DepreciationTypeOption {
  id: string;
  code: string;
  name: string;
  method: string;
  usefulLifeMonths: number | null;
  annualRate: number | null;
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

export default function AssetTypesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState<AssetType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [depreciationTypes, setDepreciationTypes] = useState<DepreciationTypeOption[]>([]);

  const [formDepreciationTypeId, setFormDepreciationTypeId] = useState('');
  const [formDepreciationRate, setFormDepreciationRate] = useState('');
  const [formUsefulLifeYears, setFormUsefulLifeYears] = useState('');
  const [formDepreciationMethod, setFormDepreciationMethod] = useState('');

  const parseCodeNumber = (code: string): number | null => {
    const digits = String(code || '').replace(/[^0-9]/g, '');
    if (!digits) return null;
    const num = Number(digits);
    if (Number.isNaN(num)) return null;
    return num;
  };

  const isFixedAssetAccount = (acc: AccountOption): boolean => {
    const num = parseCodeNumber(acc.code);
    if (num == null) return false;
    // Rango solicitado: de la 15 a la 150702
    return num >= 15 && num <= 150702;
  };

  const assetAccounts = accounts.filter((acc) => acc.type === 'asset' && isFixedAssetAccount(acc));
  const expenseAccounts = accounts.filter((acc) => acc.type === 'expense' || acc.type === 'other_expense');
  const gainAccounts = accounts.filter((acc) => acc.type === 'equity' || acc.type === 'income' || acc.type === 'other_income');
  const lossAccounts = expenseAccounts;

  const getOptions = (filtered: AccountOption[]): AccountOption[] => {
    return filtered.length > 0 ? filtered : accounts;
  };

  useEffect(() => {
    const loadTypes = async () => {
      if (!user) return;
      try {
        const data = await assetTypesService.getAll(user.id);
        const mapped: AssetType[] = (data || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          description: t.description || '',
          depreciationTypeId: t.depreciation_type_id || undefined,
          depreciationRate: Number(t.depreciation_rate) || 0,
          usefulLife: t.useful_life || 0,
          depreciationMethod: t.depreciation_method || '',
          account: t.account || '',
          depreciationAccount: t.depreciation_account || '',
          accumulatedDepreciationAccount: t.accumulated_depreciation_account || '',
          revaluationGainAccount: t.revaluation_gain_account || '',
          revaluationLossAccount: t.revaluation_loss_account || '',
          isActive: !!t.is_active,
          createdAt: t.created_at || new Date().toISOString(),
        }));
        setAssetTypes(mapped);
      } catch (error) {
        console.error('Error loading asset types:', error);
      }
    };

    loadTypes();
  }, [user]);

  useEffect(() => {
    const loadDepreciationTypes = async () => {
      if (!user) return;
      try {
        const data = await assetDepreciationTypesService.getAll(user.id);
        const mapped: DepreciationTypeOption[] = (data || []).map((t: any) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          method: t.method || '',
          usefulLifeMonths: t.useful_life_months ?? null,
          annualRate: t.annual_rate != null ? Number(t.annual_rate) || 0 : null,
        }));
        setDepreciationTypes(mapped);
      } catch (error) {
        console.error('Error loading depreciation types for asset types:', error);
      }
    };

    loadDepreciationTypes();
  }, [user]);

  useEffect(() => {
    const loadAccounts = async () => {
      if (!user) return;
      try {
        const data = await chartAccountsService.getAll(user.id);
        const options: AccountOption[] = (data || [])
          .filter((acc: any) => acc.allow_posting !== false)
          .map((acc: any) => ({
            id: acc.id,
            code: acc.code,
            name: acc.name,
            type: acc.type || acc.account_type || 'asset',
          }));
        setAccounts(options);
      } catch (error) {
        console.error('Error loading chart of accounts for asset types:', error);
      }
    };

    loadAccounts();
  }, [user]);

  const handleAddType = () => {
    setEditingType(null);
    setFormDepreciationTypeId('');
    setFormDepreciationRate('');
    setFormUsefulLifeYears('');
    setFormDepreciationMethod('');
    setShowModal(true);
  };

  const handleEditType = (type: AssetType) => {
    setEditingType(type);
    setFormDepreciationTypeId(type.depreciationTypeId || '');
    setFormDepreciationRate(type.depreciationRate != null ? String(type.depreciationRate) : '');
    setFormUsefulLifeYears(type.usefulLife != null ? String(type.usefulLife) : '');
    setFormDepreciationMethod(type.depreciationMethod || '');
    setShowModal(true);
  };

  const applyDepreciationTypeToForm = (depreciationTypeId: string) => {
    setFormDepreciationTypeId(depreciationTypeId);
    if (!depreciationTypeId) return;
    const selected = depreciationTypes.find((t) => t.id === depreciationTypeId);
    if (!selected) return;

    if (selected.annualRate != null) {
      setFormDepreciationRate(String(selected.annualRate));
    }
    if (selected.method) {
      setFormDepreciationMethod(String(selected.method));
    }
    if (selected.usefulLifeMonths != null) {
      const years = Math.max(1, Math.ceil(selected.usefulLifeMonths / 12));
      setFormUsefulLifeYears(String(years));
    }
  };

  const handleDeleteType = async (typeId: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to delete this asset type?')) return;
    try {
      await assetTypesService.delete(typeId);
      setAssetTypes(prev => prev.filter(type => type.id !== typeId));
    } catch (error) {
      console.error('Error deleting asset type:', error);
      alert('Error deleting the asset type');
    }
  };

  const handleToggleStatus = async (typeId: string) => {
    if (!user) return;
    const type = assetTypes.find(t => t.id === typeId);
    if (!type) return;
    try {
      const payload: any = {
        name: type.name,
        description: type.description,
        depreciation_type_id: type.depreciationTypeId || null,
        depreciation_rate: type.depreciationRate,
        useful_life: type.usefulLife,
        depreciation_method: type.depreciationMethod,
        account: type.account,
        depreciation_account: type.depreciationAccount,
        accumulated_depreciation_account: type.accumulatedDepreciationAccount,
        revaluation_gain_account: type.revaluationGainAccount,
        revaluation_loss_account: type.revaluationLossAccount,
        is_active: !type.isActive,
      };

      const updated = await assetTypesService.update(typeId, payload);
      setAssetTypes(prev => prev.map(t => t.id === typeId ? {
        ...t,
        is_active: !!updated.is_active,
      } : t));
    } catch (error) {
      console.error('Error toggling asset type status:', error);
      alert('Error toggling the asset type status');
    }
  };

  const handleSaveType = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const form = e.currentTarget;
    const formData = new FormData(form);

    const depreciationTypeId = String(formData.get('depreciationTypeId') || formDepreciationTypeId || '').trim();
    const selectedDepType = depreciationTypeId
      ? depreciationTypes.find((t) => t.id === depreciationTypeId)
      : undefined;

    const payload: any = {
      name: String(formData.get('name') || '').trim(),
      description: String(formData.get('description') || '').trim() || null,
      depreciation_type_id: depreciationTypeId || null,
      depreciation_rate: Number(formDepreciationRate || formData.get('depreciationRate') || 0) || 0,
      useful_life: Number(formUsefulLifeYears || formData.get('usefulLife') || 0) || 0,
      depreciation_method: String(formDepreciationMethod || formData.get('depreciationMethod') || '').trim(),
      account: String(formData.get('account') || '').trim(),
      depreciation_account: String(formData.get('depreciationAccount') || '').trim(),
      accumulated_depreciation_account: String(formData.get('accumulatedDepreciationAccount') || '').trim(),
      revaluation_gain_account: String(formData.get('revaluationGainAccount') || '').trim() || null,
      revaluation_loss_account: String(formData.get('revaluationLossAccount') || '').trim() || null,
      is_active: editingType ? editingType.isActive : true,
    };

    if (selectedDepType) {
      if (selectedDepType.method) {
        payload.depreciation_method = selectedDepType.method;
      }
      if (selectedDepType.annualRate != null) {
        payload.depreciation_rate = selectedDepType.annualRate;
      }
      if (selectedDepType.usefulLifeMonths != null) {
        const years = Math.max(1, Math.round(selectedDepType.usefulLifeMonths / 12));
        payload.useful_life = years;
      }
    }

    try {
      if (editingType) {
        const updated = await assetTypesService.update(editingType.id, payload);
        const mapped: AssetType = {
          id: updated.id,
          name: updated.name,
          description: updated.description || '',
          depreciationTypeId: updated.depreciation_type_id || undefined,
          depreciationRate: Number(updated.depreciation_rate) || 0,
          usefulLife: updated.useful_life || 0,
          depreciationMethod: updated.depreciation_method || '',
          account: updated.account || '',
          depreciationAccount: updated.depreciation_account || '',
          accumulatedDepreciationAccount: updated.accumulated_depreciation_account || '',
          revaluationGainAccount: updated.revaluation_gain_account || '',
          revaluationLossAccount: updated.revaluation_loss_account || '',
          isActive: !!updated.is_active,
          createdAt: updated.created_at || new Date().toISOString(),
        };
        setAssetTypes(prev => prev.map(type => type.id === editingType.id ? mapped : type));
      } else {
        const created = await assetTypesService.create(user.id, payload);
        const mapped: AssetType = {
          id: created.id,
          name: created.name,
          description: created.description || '',
          depreciationTypeId: created.depreciation_type_id || undefined,
          depreciationRate: Number(created.depreciation_rate) || 0,
          usefulLife: created.useful_life || 0,
          depreciationMethod: created.depreciation_method || '',
          account: created.account || '',
          depreciationAccount: created.depreciation_account || '',
          accumulatedDepreciationAccount: created.accumulated_depreciation_account || '',
          revaluationGainAccount: created.revaluation_gain_account || '',
          revaluationLossAccount: created.revaluation_loss_account || '',
          isActive: !!created.is_active,
          createdAt: created.created_at || new Date().toISOString(),
        };
        setAssetTypes(prev => [mapped, ...prev]);
      }

      setShowModal(false);
      setEditingType(null);
      form.reset();
    } catch (error) {
      console.error('Error saving asset type:', error);
      alert('Error saving the asset type');
    }
  };

  const depreciationMethods = [
    'Straight Line',
    'Declining Balance',
    'Sum of the Years',
    'Units of Production'
  ];

  const filteredTypes = assetTypes.filter(type =>
    type.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    type.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportToExcel = async () => {
    const filteredData = filteredTypes;
    if (!filteredData || filteredData.length === 0) {
      alert('No hay datos para exportar.');
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
      console.error('Error obteniendo información de la empresa para Excel de tipos de activos:', error);
    }

    const rows = filteredData.map((type) => ({
      name: type.name,
      description: type.description,
      depreciation_rate: type.depreciationRate,
      useful_life: type.usefulLife,
      depreciation_method: type.depreciationMethod,
      asset_account: type.account,
      depreciation_account: type.depreciationAccount,
      accumulated_depreciation_account: type.accumulatedDepreciationAccount,
      revaluation_gain_account: type.revaluationGainAccount,
      revaluation_loss_account: type.revaluationLossAccount,
      status: type.isActive ? 'Activo' : 'Inactivo',
      created_at: new Date(type.createdAt).toLocaleDateString('es-DO'),
    }));

    const headers = [
      { key: 'name', title: 'Tipo de Activo' },
      { key: 'description', title: 'Descripción' },
      { key: 'depreciation_rate', title: 'Tasa Depreciación (%)' },
      { key: 'useful_life', title: 'Vida Útil (años)' },
      { key: 'depreciation_method', title: 'Método Depreciación' },
      { key: 'asset_account', title: 'Cuenta de Activo' },
      { key: 'depreciation_account', title: 'Cuenta de Depreciación' },
      { key: 'accumulated_depreciation_account', title: 'Cuenta Depreciación Acumulada' },
      { key: 'revaluation_gain_account', title: 'Cuenta Ganancia Reval.' },
      { key: 'revaluation_loss_account', title: 'Cuenta Pérdida Reval.' },
      { key: 'status', title: 'Estado' },
      { key: 'created_at', title: 'Fecha Creación' },
    ];

    const today = new Date().toISOString().split('T')[0];
    const fileBase = `tipos_activos_${today}`;
    const title = 'Tipos de Activos Fijos';
    const periodText = `Periodo: ${new Date().toISOString().slice(0, 7)}`;

    exportToExcelWithHeaders(
      rows,
      headers,
      fileBase,
      'TiposActivos',
      [26, 32, 18, 16, 24, 26, 26, 30, 30, 30, 14, 16],
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
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <button
              onClick={() => navigate('/fixed-assets')}
              className="flex items-center text-[#2f3e1e] hover:text-[#1f2913] transition-colors mb-2"
            >
              <i className="ri-arrow-left-line mr-1"></i>
              Back to Fixed Assets
            </button>
            <h1 className="text-3xl font-bold text-[#2f3e1e]">Fixed Asset Types</h1>
            <p className="text-[#6b5c3b]">Configure categories, depreciation methods, and accounting links.</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={exportToExcel}
              className="bg-[#3f5d2a] text-white px-4 py-2 rounded-lg hover:bg-[#2d451f] transition-colors whitespace-nowrap shadow-sm border border-[#2d451f]"
            >
              <i className="ri-file-excel-line mr-2"></i>
              Export Excel
            </button>
            <button
              onClick={handleAddType}
              className="bg-[#2f3e1e] text-white px-4 py-2 rounded-lg hover:bg-[#1f2913] transition-colors whitespace-nowrap shadow-sm border border-[#1f2913]"
            >
              <i className="ri-add-line mr-2"></i>
              New Type
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#e4d8c4] p-6">
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                Search Asset Types
              </label>
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-[#9b8a64]"></i>
                <input
                  type="text"
                  placeholder="Search by name or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-[#d8cbb5] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] text-gray-800 placeholder:text-[#9b8a64]"
                />
              </div>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setSearchTerm('')}
                className="bg-[#6b5c3b] text-white px-4 py-2 rounded-lg hover:bg-[#4a3c24] transition-colors whitespace-nowrap shadow-sm"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Asset Types Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#e4d8c4]">
          <div className="p-6 border-b border-[#e4d8c4] flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-lg font-semibold text-[#2f3e1e]">
              Configured Asset Types ({filteredTypes.length})
            </h3>
            <p className="text-sm text-[#6b5c3b]">
              Track rates, useful lives, and linked accounts per category.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#ede7d7]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">
                    Asset Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">
                    Depreciation Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">
                    Useful Life
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">
                    Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">
                    Account
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#f3ecda]">
                {filteredTypes.map((type) => (
                  <tr key={type.id} className="hover:bg-[#fffdf6]">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-semibold text-[#2f3e1e]">{type.name}</div>
                        <div className="text-sm text-[#6b5c3b]">{type.description || 'No description'}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2f3e1e]">
                      {type.depreciationRate}% annual
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2f3e1e]">
                      {type.usefulLife} years
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2f3e1e]">
                      {type.depreciationMethod || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2f3e1e]">
                      {type.account || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleStatus(type.id)}
                        className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full cursor-pointer transition-colors ${
                          type.isActive
                            ? 'bg-[#d7e4c0] text-[#1f2913] hover:bg-[#c5d5ab]'
                            : 'bg-[#f4d9d4] text-[#7a2e1b] hover:bg-[#edc6be]'
                        }`}
                      >
                        {type.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditType(type)}
                          className="text-[#2f3e1e] hover:text-[#1f2913] transition-colors"
                          aria-label="Edit asset type"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => handleDeleteType(type.id)}
                          className="text-[#7a2e1b] hover:text-[#5c1f12] transition-colors"
                          aria-label="Delete asset type"
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

        {/* Type Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#fffaf1] rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-[#e4d8c4] shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-[#2f3e1e]">
                  {editingType ? 'Edit Asset Type' : 'New Asset Type'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-[#6b5c3b] hover:text-[#2f3e1e]"
                  aria-label="Close"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <form onSubmit={handleSaveType} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Type Name *
                    </label>
                    <input
                      type="text"
                      required
                      name="name"
                      defaultValue={editingType?.name || ''}
                      className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                      placeholder="e.g., Machinery and Equipment"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Depreciation Method
                    </label>
                    <select
                      name="depreciationMethod"
                      value={formDepreciationMethod}
                      onChange={(e) => setFormDepreciationMethod(e.target.value)}
                      className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    >
                      <option value="">Select method</option>
                      {depreciationMethods.map(method => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Asset Account *
                    </label>
                    <select
                      required
                      name="account"
                      defaultValue={editingType?.account || ''}
                      className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] pr-8"
                    >
                      <option value="">Select account...</option>
                      {getOptions(assetAccounts).map((acc) => (
                        <option
                          key={acc.id}
                          value={`${acc.code} - ${acc.name}`}
                        >
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Depreciation Account
                    </label>
                    <select
                      name="depreciationAccount"
                      defaultValue={editingType?.depreciationAccount || ''}
                      className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] pr-8"
                    >
                      <option value="">Select account...</option>
                      {getOptions(expenseAccounts).map((acc) => (
                        <option
                          key={acc.id}
                          value={`${acc.code} - ${acc.name}`}
                        >
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Accumulated Depreciation Account
                    </label>
                    <select
                      name="accumulatedDepreciationAccount"
                      defaultValue={editingType?.accumulatedDepreciationAccount || ''}
                      className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] pr-8"
                    >
                      <option value="">Select account...</option>
                      {getOptions(assetAccounts).map((acc) => (
                        <option
                          key={acc.id}
                          value={`${acc.code} - ${acc.name}`}
                        >
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Revaluation Gain Account
                    </label>
                    <select
                      name="revaluationGainAccount"
                      defaultValue={editingType?.revaluationGainAccount || ''}
                      className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] pr-8"
                    >
                      <option value="">Select account...</option>
                      {getOptions(gainAccounts).map((acc) => (
                        <option
                          key={acc.id}
                          value={`${acc.code} - ${acc.name}`}
                        >
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Revaluation Loss Account
                    </label>
                    <select
                      name="revaluationLossAccount"
                      defaultValue={editingType?.revaluationLossAccount || ''}
                      className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg bg-white focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] pr-8"
                    >
                      <option value="">Select account...</option>
                      {getOptions(lossAccounts).map((acc) => (
                        <option
                          key={acc.id}
                          value={`${acc.code} - ${acc.name}`}
                        >
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    name="description"
                    defaultValue={editingType?.description || ''}
                    className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    placeholder="Detailed description of the asset type"
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
                    className="px-4 py-2 bg-[#2f3e1e] text-white rounded-lg hover:bg-[#1f2913] transition-colors whitespace-nowrap shadow-sm border border-[#1f2913]"
                  >
                    {editingType ? 'Update' : 'Create'} Type
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