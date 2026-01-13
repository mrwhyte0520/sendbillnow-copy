import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { exportToExcelStyled } from '../../../utils/exportImportUtils';
import { salaryTypesService } from '../../../services/database';

interface SalaryType {
  id: string;
  name: string;
  description: string;
  calculation_method: 'fixed' | 'hourly' | 'commission' | 'mixed';
  base_amount: number;
  commission_rate?: number;
  overtime_rate: number;
  night_shift_rate: number;
  holiday_rate: number;
  is_active: boolean;
  created_at: string;
}

export default function SalaryTypesPage() {
  const { user } = useAuth();
  const [salaryTypes, setSalaryTypes] = useState<SalaryType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMethod, setFilterMethod] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingType, setEditingType] = useState<SalaryType | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    calculation_method: 'fixed' as SalaryType['calculation_method'],
    base_amount: 0,
    commission_rate: 0,
    overtime_rate: 1.5,
    night_shift_rate: 1.15,
    holiday_rate: 2.0
  });

  useEffect(() => {
    const loadTypes = async () => {
      if (!user) return;
      try {
        const data = await salaryTypesService.getAll(user.id);
        const mapped: SalaryType[] = (data || []).map((t: any) => ({
          id: t.id,
          name: t.name || '',
          description: t.description || '',
          calculation_method: (t.calculation_method as SalaryType['calculation_method']) || 'fixed',
          base_amount: Number(t.base_amount) || 0,
          commission_rate: t.commission_rate != null ? Number(t.commission_rate) : undefined,
          overtime_rate: Number(t.overtime_rate) || 1.5,
          night_shift_rate: Number(t.night_shift_rate) || 1.15,
          holiday_rate: Number(t.holiday_rate) || 2.0,
          is_active: t.is_active !== false,
          created_at: (t.created_at || '').split('T')[0] || new Date().toISOString().split('T')[0],
        }));
        setSalaryTypes(mapped);
      } catch (error) {
        console.error('Error loading salary types:', error);
      }
    };

    loadTypes();
  }, [user]);

  const filteredTypes = salaryTypes.filter(type => {
    const matchesSearch = type.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         type.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMethod = filterMethod === 'all' || type.calculation_method === filterMethod;
    return matchesSearch && matchesMethod;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      alert('You must be logged in to manage salary types.');
      return;
    }

    const payload = {
      name: formData.name,
      description: formData.description,
      calculation_method: formData.calculation_method,
      base_amount: formData.base_amount,
      commission_rate: formData.commission_rate || null,
      overtime_rate: formData.overtime_rate,
      night_shift_rate: formData.night_shift_rate,
      holiday_rate: formData.holiday_rate,
    };

    try {
      if (editingType) {
        const updated = await salaryTypesService.update(editingType.id, payload);
        setSalaryTypes(prev => prev.map(type =>
          type.id === editingType.id
            ? {
                id: updated.id,
                name: updated.name || '',
                description: updated.description || '',
                calculation_method: (updated.calculation_method as SalaryType['calculation_method']) || 'fixed',
                base_amount: Number(updated.base_amount) || 0,
                commission_rate: updated.commission_rate != null ? Number(updated.commission_rate) : undefined,
                overtime_rate: Number(updated.overtime_rate) || 1.5,
                night_shift_rate: Number(updated.night_shift_rate) || 1.15,
                holiday_rate: Number(updated.holiday_rate) || 2.0,
                is_active: updated.is_active !== false,
                created_at: (updated.created_at || '').split('T')[0] || editingType.created_at,
              }
            : type
        ));
      } else {
        const created = await salaryTypesService.create(user.id, payload);
        const newType: SalaryType = {
          id: created.id,
          name: created.name || '',
          description: created.description || '',
          calculation_method: (created.calculation_method as SalaryType['calculation_method']) || 'fixed',
          base_amount: Number(created.base_amount) || 0,
          commission_rate: created.commission_rate != null ? Number(created.commission_rate) : undefined,
          overtime_rate: Number(created.overtime_rate) || 1.5,
          night_shift_rate: Number(created.night_shift_rate) || 1.15,
          holiday_rate: Number(created.holiday_rate) || 2.0,
          is_active: created.is_active !== false,
          created_at: (created.created_at || '').split('T')[0] || new Date().toISOString().split('T')[0],
        };
        setSalaryTypes(prev => [...prev, newType]);
      }

      resetForm();
    } catch (error) {
      console.error('Error saving salary type:', error);
      alert('Error saving the salary type.');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      calculation_method: 'fixed',
      base_amount: 0,
      commission_rate: 0,
      overtime_rate: 1.5,
      night_shift_rate: 1.15,
      holiday_rate: 2.0
    });
    setEditingType(null);
    setShowForm(false);
  };

  const handleEdit = (type: SalaryType) => {
    setFormData({
      name: type.name,
      description: type.description,
      calculation_method: type.calculation_method,
      base_amount: type.base_amount,
      commission_rate: type.commission_rate || 0,
      overtime_rate: type.overtime_rate,
      night_shift_rate: type.night_shift_rate,
      holiday_rate: type.holiday_rate
    });
    setEditingType(type);
    setShowForm(true);
  };

  const toggleStatus = async (id: string) => {
    const current = salaryTypes.find(t => t.id === id);
    if (!current) return;
    const newStatus = !current.is_active;

    try {
      await salaryTypesService.update(id, { is_active: newStatus });
      setSalaryTypes(prev => prev.map(type =>
        type.id === id ? { ...type, is_active: newStatus } : type
      ));
    } catch (error) {
      console.error('Error toggling salary type status:', error);
      alert('Error changing salary type status.');
    }
  };

  const exportToExcel = async () => {
    const today = new Date().toISOString().split('T')[0];

    const rows = filteredTypes.map(type => ({
      name: type.name,
      description: type.description,
      method:
        type.calculation_method === 'fixed' ? 'Fixed' :
        type.calculation_method === 'hourly' ? 'Hourly' :
        type.calculation_method === 'commission' ? 'Commission' : 'Mixed',
      baseAmount: type.base_amount,
      commissionRate: type.commission_rate ? `${type.commission_rate}%` : 'N/A',
      overtimeRate: `${(type.overtime_rate * 100)}%`,
      nightShiftRate: `${(type.night_shift_rate * 100)}%`,
      holidayRate: `${(type.holiday_rate * 100)}%`,
      status: type.is_active ? 'Active' : 'Inactive',
      createdAt: type.created_at,
    }));

    if (!rows.length) {
      alert('No salary types to export.');
      return;
    }

    await exportToExcelStyled(
      rows,
      [
        { key: 'name', title: 'Name', width: 22 },
        { key: 'description', title: 'Description', width: 40 },
        { key: 'method', title: 'Calculation Method', width: 20 },
        { key: 'baseAmount', title: 'Base Amount', width: 16, numFmt: '#,##0.00' },
        { key: 'commissionRate', title: 'Commission Rate', width: 16 },
        { key: 'overtimeRate', title: 'Overtime Rate', width: 18 },
        { key: 'nightShiftRate', title: 'Night Shift Rate', width: 20 },
        { key: 'holidayRate', title: 'Holiday Rate', width: 20 },
        { key: 'status', title: 'Status', width: 12 },
        { key: 'createdAt', title: 'Created', width: 16 },
      ],
      `salary_types_${today}`,
      'Salary Types'
    );
  };

  const getMethodLabel = (method: string) => {
    switch (method) {
      case 'fixed': return 'Fixed';
      case 'hourly': return 'Hourly';
      case 'commission': return 'Commission';
      case 'mixed': return 'Mixed';
      default: return method;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 bg-[#f6f3ea] min-h-screen -mx-4 sm:mx-0 p-4 sm:p-0">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Salary Types</h1>
            <p className="text-gray-700">Manage salary types and calculation methods</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={exportToExcel}
              className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] transition-colors flex items-center gap-2 shadow-sm"
            >
              <i className="ri-download-line"></i>
              Export
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] transition-colors flex items-center gap-2 shadow-sm"
            >
              <i className="ri-add-line"></i>
              New Type
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-[#dfe5cf]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Types</p>
                <p className="text-2xl font-bold text-gray-900">{salaryTypes.length}</p>
              </div>
              <div className="w-12 h-12 bg-[#e5ead7] rounded-lg flex items-center justify-center">
                <i className="ri-money-dollar-circle-line text-xl text-[#4b5320]"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-[#dfe5cf]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Fixed Salaries</p>
                <p className="text-2xl font-bold text-gray-900">
                  {salaryTypes.filter(t => t.calculation_method === 'fixed').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-[#dbe8c0] rounded-lg flex items-center justify-center">
                <i className="ri-bank-line text-xl text-[#3d451b]"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-[#dfe5cf]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">By Commission</p>
                <p className="text-2xl font-bold text-gray-900">
                  {salaryTypes.filter(t => t.calculation_method === 'commission' || t.calculation_method === 'mixed').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-[#f1e4c2] rounded-lg flex items-center justify-center">
                <i className="ri-line-chart-line text-xl text-[#4b5320]"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-[#dfe5cf]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active</p>
                <p className="text-2xl font-bold text-gray-900">
                  {salaryTypes.filter(t => t.is_active).length}
                </p>
              </div>
              <div className="w-12 h-12 bg-[#e0e5d0] rounded-lg flex items-center justify-center">
                <i className="ri-check-line text-xl text-[#4b5320]"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-[#dfe5cf]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  placeholder="Search by name or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Calculation Method
              </label>
              <select
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
              >
                <option value="all">All methods</option>
                <option value="fixed">Fixed Salary</option>
                <option value="hourly">Hourly</option>
                <option value="commission">Commission Only</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterMethod('all');
                }}
                className="px-4 py-2 text-[#4b5320] border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Salary Types Table */}
        <div className="bg-white rounded-xl shadow-sm border border-[#dfe5cf] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Salary Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Base Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Commission
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Overtime
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTypes.map((type) => (
                  <tr key={type.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{type.name}</div>
                        <div className="text-sm text-gray-500">{type.description}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        type.calculation_method === 'fixed'
                          ? 'bg-[#e5ead7] text-[#2f3a1f]'
                          : type.calculation_method === 'hourly'
                          ? 'bg-[#dbe8c0] text-[#2f3a1f]'
                          : type.calculation_method === 'commission'
                          ? 'bg-[#f1e4c2] text-[#3d451b]'
                          : 'bg-[#e0e5d0] text-[#2f3a1f]'
                      }`}>
                        {getMethodLabel(type.calculation_method)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {type.calculation_method === 'hourly' 
                        ? ` ${type.base_amount.toLocaleString('en-US')}/hour`
                        : ` ${type.base_amount.toLocaleString('en-US')}`
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {type.commission_rate ? `${type.commission_rate}%` : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(type.overtime_rate * 100)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        type.is_active 
                          ? 'bg-[#dbe8c0] text-[#2f3a1f]' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {type.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(type)}
                          className="text-[#4b5320] hover:text-[#2f3a1f]"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => toggleStatus(type.id)}
                          className={`${type.is_active ? 'text-red-600 hover:text-red-900' : 'text-[#4b5320] hover:text-[#2f3a1f]'}`}
                        >
                          <i className={`${type.is_active ? 'ri-pause-circle-line' : 'ri-play-circle-line'}`}></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingType ? 'Edit Salary Type' : 'New Salary Type'}
                </h2>
                <button
                  onClick={resetForm}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                    placeholder="Description of the salary type..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Type Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                      placeholder="E.g., Monthly Fixed Salary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Calculation Method *
                    </label>
                    <select
                      required
                      value={formData.calculation_method}
                      onChange={(e) => setFormData(prev => ({ ...prev, calculation_method: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                    >
                      <option value="fixed">Fixed Salary</option>
                      <option value="hourly">Hourly</option>
                      <option value="commission">Commission Only</option>
                      <option value="mixed">Salary + Commission</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {formData.calculation_method === 'hourly' ? 'Hourly Rate ()' : 'Base Amount ()'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.base_amount}
                    onChange={(e) => setFormData(prev => ({ ...prev, base_amount: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                  />
                </div>

                {(formData.calculation_method === 'commission' || formData.calculation_method === 'mixed') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Commission Rate (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={formData.commission_rate}
                      onChange={(e) => setFormData(prev => ({ ...prev, commission_rate: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Overtime Rate
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="3"
                      step="0.1"
                      value={formData.overtime_rate}
                      onChange={(e) => setFormData(prev => ({ ...prev, overtime_rate: parseFloat(e.target.value) || 1.5 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Night Shift Rate
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="2"
                      step="0.01"
                      value={formData.night_shift_rate}
                      onChange={(e) => setFormData(prev => ({ ...prev, night_shift_rate: parseFloat(e.target.value) || 1.15 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Holiday Rate
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="3"
                      step="0.1"
                      value={formData.holiday_rate}
                      onChange={(e) => setFormData(prev => ({ ...prev, holiday_rate: parseFloat(e.target.value) || 2.0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-6">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] transition-colors shadow-sm"
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
