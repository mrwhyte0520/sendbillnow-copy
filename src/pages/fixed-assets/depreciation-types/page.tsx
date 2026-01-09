import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { assetDepreciationTypesService } from '../../../services/database';

interface DepreciationType {
  id: string;
  code: string;
  name: string;
  method: string;
  usefulLifeMonths: number | null;
  annualRate: number | null;
  description: string;
  createdAt: string;
}

export default function DepreciationTypesPage() {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState<DepreciationType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [types, setTypes] = useState<DepreciationType[]>([]);
  const [codeValue, setCodeValue] = useState('');

  useEffect(() => {
    const loadTypes = async () => {
      if (!user) return;
      try {
        const data = await assetDepreciationTypesService.getAll(user.id);
        const mapped: DepreciationType[] = (data || []).map((t: any) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          method: t.method || '',
          usefulLifeMonths: t.useful_life_months ?? null,
          annualRate: t.annual_rate != null ? Number(t.annual_rate) || 0 : null,
          description: t.description || '',
          createdAt: t.created_at || new Date().toISOString(),
        }));
        setTypes(mapped);
      } catch (error) {
        console.error('Error loading depreciation types:', error);
      }
    };

    loadTypes();
  }, [user]);

  const handleAddType = () => {
    setEditingType(null);
    setCodeValue('');
    setShowModal(true);
  };

  const handleEditType = (type: DepreciationType) => {
    setEditingType(type);
    setCodeValue(type.code);
    setShowModal(true);
  };

  const handleDeleteType = async (typeId: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to delete this depreciation type?')) return;
    try {
      await assetDepreciationTypesService.delete(typeId);
      setTypes(prev => prev.filter(type => type.id !== typeId));
    } catch (error) {
      console.error('Error deleting depreciation type:', error);
      alert('Error deleting the depreciation type');
    }
  };

  const handleGenerateCode = () => {
    // Generate a simple code based on the existing count, e.g., DEP-001, DEP-002, etc.
    const base = 'DEP';
    const nextNumber = types.length + 1;
    const padded = String(nextNumber).padStart(3, '0');
    setCodeValue(`${base}-${padded}`);
  };

  const handleSaveType = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    const usefulLifeYearsRaw = formData.get('usefulLifeYears');
    const usefulLifeYears = usefulLifeYearsRaw != null && String(usefulLifeYearsRaw).trim() !== ''
      ? Number(usefulLifeYearsRaw)
      : null;
    const payload: any = {
      code: String(formData.get('code') || '').trim(),
      name: String(formData.get('name') || '').trim(),
      method: String(formData.get('method') || '').trim() || null,
      useful_life_months:
        usefulLifeYears != null
          ? Math.max(1, Math.round(usefulLifeYears * 12))
          : null,
      annual_rate: formData.get('annualRate')
        ? Number(formData.get('annualRate')) || 0
        : null,
      description: String(formData.get('description') || '').trim() || null,
    };

    if (!payload.code || !payload.name) {
      alert('Code and name are required');
      return;
    }

    try {
      if (editingType) {
        const updated = await assetDepreciationTypesService.update(editingType.id, payload);
        const mapped: DepreciationType = {
          id: updated.id,
          code: updated.code,
          name: updated.name,
          method: updated.method || '',
          usefulLifeMonths: updated.useful_life_months ?? null,
          annualRate: updated.annual_rate != null ? Number(updated.annual_rate) || 0 : null,
          description: updated.description || '',
          createdAt: updated.created_at || new Date().toISOString(),
        };
        setTypes(prev => prev.map(type => type.id === editingType.id ? mapped : type));
      } else {
        const created = await assetDepreciationTypesService.create(user.id, payload);
        const mapped: DepreciationType = {
          id: created.id,
          code: created.code,
          name: created.name,
          method: created.method || '',
          usefulLifeMonths: created.useful_life_months ?? null,
          annualRate: created.annual_rate != null ? Number(created.annual_rate) || 0 : null,
          description: created.description || '',
          createdAt: created.created_at || new Date().toISOString(),
        };
        setTypes(prev => [mapped, ...prev]);
      }

      setShowModal(false);
      setEditingType(null);
      form.reset();
    } catch (error) {
      console.error('Error saving depreciation type:', error);
      alert('Error saving the depreciation type');
    }
  };

  const methods = [
    'Straight Line',
    'Sum-of-the-Years\' Digits',
    'Declining Balance',
    'Units of Production',
  ];

  const filteredTypes = types.filter(type => {
    const term = searchTerm.toLowerCase();
    return (
      type.code.toLowerCase().includes(term) ||
      type.name.toLowerCase().includes(term) ||
      type.description.toLowerCase().includes(term)
    );
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 bg-[#f7f3e8] min-h-screen">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#2f3e1e]">Depreciation Types</h1>
            <p className="text-sm text-[#6b5c3b] mt-1">
              Catalog of depreciation methods and parameters for fixed assets.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by code, name, or description"
              className="border border-[#d8cbb5] rounded-lg px-3 py-2 text-sm bg-white text-[#2f3e1e] focus:outline-none focus:ring-2 focus:ring-[#3f5d2a] focus:border-[#3f5d2a]"
            />
            <button
              onClick={handleAddType}
              className="bg-[#2f3e1e] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#1f2913] transition-colors whitespace-nowrap shadow-sm border border-[#1f2913] flex items-center"
            >
              <i className="ri-add-line mr-1" />
              New Type
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#e4d8c4] overflow-hidden">
          <div className="min-w-full overflow-x-auto">
            <table className="min-w-full divide-y divide-[#f0ead7]">
              <thead className="bg-[#ede7d7]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Method</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Useful Life (years)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Annual Rate (%)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#4a3c24] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#f3ecda]">
                {filteredTypes.map((type) => (
                  <tr key={type.id} className="hover:bg-[#fffdf6]">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-[#2f3e1e] font-semibold">{type.code}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-[#2f3e1e]">{type.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-[#6b5c3b]">{type.method || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-[#2f3e1e]">
                      {type.usefulLifeMonths != null ? (type.usefulLifeMonths / 12).toFixed(2) : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-[#7a2e1b] font-semibold">
                      {type.annualRate != null ? `${type.annualRate.toFixed(2)}%` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#4a3c24]">
                      <div className="max-w-md whitespace-normal break-words">
                        {type.description || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right space-x-3">
                      <button
                        onClick={() => handleEditType(type)}
                        className="text-[#2f3e1e] hover:text-[#1f2913]"
                      >
                        <i className="ri-edit-line" />
                      </button>
                      <button
                        onClick={() => handleDeleteType(type.id)}
                        className="text-[#7a2e1b] hover:text-[#5c1f12]"
                      >
                        <i className="ri-delete-bin-line" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredTypes.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-sm text-[#6b5c3b] text-center" colSpan={7}>
                      There are no depreciation types registered.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#fffaf1] rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-[#e4d8c4] shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-[#2f3e1e]">
                  {editingType ? 'Edit Depreciation Type' : 'New Depreciation Type'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-[#6b5c3b] hover:text-[#2f3e1e]"
                >
                  <i className="ri-close-line text-xl" />
                </button>
              </div>

              <form onSubmit={handleSaveType} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Code *
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        name="code"
                        required
                        value={codeValue}
                        onChange={(e) => setCodeValue(e.target.value)}
                        className="flex-1 px-3 py-2 border border-[#d8cbb5] rounded-lg focus:ring-2 focus:ring-[#3f5d2a] focus:border-[#3f5d2a] bg-white text-[#2f3e1e]"
                        placeholder="Ex: LINEAR-10"
                      />
                      <button
                        type="button"
                        onClick={handleGenerateCode}
                        className="px-3 py-2 bg-[#f0ead7] text-[#2f3e1e] rounded-lg border border-[#d8cbb5] hover:bg-[#e1d5ba] transition-colors whitespace-nowrap text-sm"
                      >
                        Generate
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      required
                      defaultValue={editingType?.name || ''}
                      className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg focus:ring-2 focus:ring-[#3f5d2a] focus:border-[#3f5d2a] bg-white text-[#2f3e1e]"
                      placeholder="Straight Line 10%"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Method
                    </label>
                    <select
                      name="method"
                      defaultValue={editingType?.method || ''}
                      className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg focus:ring-2 focus:ring-[#3f5d2a] focus:border-[#3f5d2a] bg-white text-[#2f3e1e]"
                    >
                      <option value="">Select method</option>
                      {methods.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Useful Life (years)
                    </label>
                    <input
                      type="number"
                      name="usefulLifeYears"
                      min="1"
                      step="0.01"
                      defaultValue={
                        editingType?.usefulLifeMonths != null
                          ? String(editingType.usefulLifeMonths / 12)
                          : ''
                      }
                      className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg focus:ring-2 focus:ring-[#3f5d2a] focus:border-[#3f5d2a] bg-white text-[#2f3e1e]"
                      placeholder="Ex: 10"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                      Annual Rate (%)
                    </label>
                    <input
                      type="number"
                      name="annualRate"
                      step="0.01"
                      min="0"
                      max="100"
                      defaultValue={editingType?.annualRate ?? ''}
                      className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg focus:ring-2 focus:ring-[#3f5d2a] focus:border-[#3f5d2a] bg-white text-[#2f3e1e]"
                      placeholder="Ex: 10.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#4a3c24] mb-2">
                    Description
                  </label>
                  <textarea
                    name="description"
                    rows={3}
                    defaultValue={editingType?.description || ''}
                    className="w-full px-3 py-2 border border-[#d8cbb5] rounded-lg focus:ring-2 focus:ring-[#3f5d2a] focus:border-[#3f5d2a] bg-white text-[#2f3e1e]"
                    placeholder="Describe the method and depreciation policy"
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-[#2f3e1e] bg-[#f0ead7] rounded-lg hover:bg-[#e1d5ba] border border-[#d8cbb5] transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#3f5d2a] text-white rounded-lg hover:bg-[#2d451f] transition-colors whitespace-nowrap shadow-sm border border-[#2d451f]"
                  >
                    {editingType ? 'Update Type' : 'Create Type'}
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
