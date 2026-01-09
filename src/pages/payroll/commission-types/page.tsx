
import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { exportToExcelStyled } from '../../../utils/exportImportUtils';
import { commissionTypesService } from '../../../services/database';

interface CommissionType {
  id: string;
  name: string;
  description: string;
  calculationType: 'percentage' | 'fixed' | 'tiered';
  rate: number;
  minAmount?: number;
  maxAmount?: number;
  basedOn: 'sales' | 'profit' | 'units' | 'revenue';
  paymentFrequency: 'monthly' | 'quarterly' | 'annually';
  isActive: boolean;
  applicablePositions: string[];
  createdAt: string;
}

export default function CommissionTypesPage() {
  const { user } = useAuth();
  const [commissionTypes, setCommissionTypes] = useState<CommissionType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterFrequency, setFilterFrequency] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingType, setEditingType] = useState<CommissionType | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    calculationType: 'percentage' as CommissionType['calculationType'],
    rate: 0,
    minAmount: '',
    maxAmount: '',
    basedOn: 'sales' as CommissionType['basedOn'],
    paymentFrequency: 'monthly' as CommissionType['paymentFrequency'],
    applicablePositions: [] as string[]
  });

  useEffect(() => {
    const loadTypes = async () => {
      if (!user) return;
      try {
        const data = await commissionTypesService.getAll(user.id);
        const mapped: CommissionType[] = (data || []).map((t: any) => ({
          id: t.id,
          name: t.name || '',
          description: t.description || '',
          calculationType: (t.calculation_type as CommissionType['calculationType']) || 'percentage',
          rate: Number(t.rate) || 0,
          minAmount: t.min_amount !== null && t.min_amount !== undefined ? Number(t.min_amount) : undefined,
          maxAmount: t.max_amount !== null && t.max_amount !== undefined ? Number(t.max_amount) : undefined,
          basedOn: (t.based_on as CommissionType['basedOn']) || 'sales',
          paymentFrequency: (t.payment_frequency as CommissionType['paymentFrequency']) || 'monthly',
          isActive: t.is_active ?? true,
          applicablePositions: Array.isArray(t.applicable_positions)
            ? t.applicable_positions
            : [],
          createdAt: (t.created_at || '').split('T')[0] || new Date().toISOString().split('T')[0],
        }));
        setCommissionTypes(mapped);
      } catch (error) {
        console.error('Error loading commission types:', error);
      }
    };

    loadTypes();
  }, [user]);

  const filteredTypes = commissionTypes.filter(type => {
    const matchesSearch = type.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         type.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || 
                         (filterStatus === 'active' && type.isActive) ||
                         (filterStatus === 'inactive' && !type.isActive);
    const matchesFrequency = filterFrequency === 'all' || type.paymentFrequency === filterFrequency;
    
    return matchesSearch && matchesStatus && matchesFrequency;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      alert('You must be logged in to manage commission types.');
      return;
    }

    const payload: any = {
      name: formData.name,
      description: formData.description,
      calculation_type: formData.calculationType,
      rate: formData.rate,
      min_amount: formData.minAmount ? parseFloat(formData.minAmount) : null,
      max_amount: formData.maxAmount ? parseFloat(formData.maxAmount) : null,
      based_on: formData.basedOn,
      payment_frequency: formData.paymentFrequency,
      is_active: editingType ? editingType.isActive : true,
      applicable_positions: formData.applicablePositions,
    };

    try {
      if (editingType) {
        const updated = await commissionTypesService.update(editingType.id, payload);
        setCommissionTypes(prev => prev.map(type =>
          type.id === editingType.id
            ? {
                id: updated.id,
                name: updated.name || '',
                description: updated.description || '',
                calculationType: (updated.calculation_type as CommissionType['calculationType']) || 'percentage',
                rate: Number(updated.rate) || 0,
                minAmount: updated.min_amount !== null && updated.min_amount !== undefined ? Number(updated.min_amount) : undefined,
                maxAmount: updated.max_amount !== null && updated.max_amount !== undefined ? Number(updated.max_amount) : undefined,
                basedOn: (updated.based_on as CommissionType['basedOn']) || 'sales',
                paymentFrequency: (updated.payment_frequency as CommissionType['paymentFrequency']) || 'monthly',
                isActive: updated.is_active ?? true,
                applicablePositions: Array.isArray(updated.applicable_positions)
                  ? updated.applicable_positions
                  : [],
                createdAt: (updated.created_at || '').split('T')[0] || editingType.createdAt,
              }
            : type
        ));
      } else {
        const created = await commissionTypesService.create(user.id, payload);
        const newType: CommissionType = {
          id: created.id,
          name: created.name || '',
          description: created.description || '',
          calculationType: (created.calculation_type as CommissionType['calculationType']) || 'percentage',
          rate: Number(created.rate) || 0,
          minAmount: created.min_amount !== null && created.min_amount !== undefined ? Number(created.min_amount) : undefined,
          maxAmount: created.max_amount !== null && created.max_amount !== undefined ? Number(created.max_amount) : undefined,
          basedOn: (created.based_on as CommissionType['basedOn']) || 'sales',
          paymentFrequency: (created.payment_frequency as CommissionType['paymentFrequency']) || 'monthly',
          isActive: created.is_active ?? true,
          applicablePositions: Array.isArray(created.applicable_positions)
            ? created.applicable_positions
            : [],
          createdAt: (created.created_at || '').split('T')[0] || new Date().toISOString().split('T')[0],
        };
        setCommissionTypes(prev => [...prev, newType]);
      }

      resetForm();
    } catch (error) {
      console.error('Error saving commission type:', error);
      alert('Error saving the commission type.');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      calculationType: 'percentage',
      rate: 0,
      minAmount: '',
      maxAmount: '',
      basedOn: 'sales',
      paymentFrequency: 'monthly',
      applicablePositions: []
    });
    setShowForm(false);
    setEditingType(null);
  };

  const handleEdit = (type: CommissionType) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      description: type.description,
      calculationType: type.calculationType,
      rate: type.rate,
      minAmount: type.minAmount?.toString() || '',
      maxAmount: type.maxAmount?.toString() || '',
      basedOn: type.basedOn,
      paymentFrequency: type.paymentFrequency,
      applicablePositions: type.applicablePositions
    });
    setShowForm(true);
  };

  const toggleStatus = async (id: string) => {
    const current = commissionTypes.find(t => t.id === id);
    if (!current) return;
    const newStatus = !current.isActive;

    try {
      await commissionTypesService.update(id, { is_active: newStatus });
      setCommissionTypes(prev => prev.map(type =>
        type.id === id ? { ...type, isActive: newStatus } : type
      ));
    } catch (error) {
      console.error('Error toggling commission type status:', error);
      alert('Error changing commission type status.');
    }
  };

  const exportToCSV = async () => {
    const today = new Date().toISOString().split('T')[0];

    const rows = filteredTypes.map(type => ({
      name: type.name,
      description: type.description,
      calcType:
        type.calculationType === 'percentage' ? 'Percentage' :
        type.calculationType === 'fixed' ? 'Fixed Amount' : 'Tiered',
      rate:
        type.calculationType === 'percentage'
          ? `${type.rate}%`
          : `$${type.rate.toLocaleString()}`,
      basedOn:
        type.basedOn === 'sales' ? 'Sales' :
        type.basedOn === 'profit' ? 'Profit' :
        type.basedOn === 'units' ? 'Units' : 'Revenue',
      frequency:
        type.paymentFrequency === 'monthly' ? 'Monthly' :
        type.paymentFrequency === 'quarterly' ? 'Quarterly' : 'Annual',
      status: type.isActive ? 'Active' : 'Inactive',
    }));

    if (!rows.length) {
      alert('No commission types to export.');
      return;
    }

    await exportToExcelStyled(
      rows,
      [
        { key: 'name', title: 'Name', width: 24 },
        { key: 'description', title: 'Description', width: 40 },
        { key: 'calcType', title: 'Calculation Type', width: 20 },
        { key: 'rate', title: 'Rate/Amount', width: 18 },
        { key: 'basedOn', title: 'Based On', width: 18 },
        { key: 'frequency', title: 'Frequency', width: 16 },
        { key: 'status', title: 'Status', width: 12 },
      ],
      `commission_types_${today}`,
      'Commission Types'
    );
  };

  const activeTypes = commissionTypes.filter(type => type.isActive).length;
  const totalCommissionRate = commissionTypes
    .filter(type => type.isActive && type.calculationType === 'percentage')
    .reduce((sum, type) => sum + type.rate, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Commission Types</h1>
            <p className="text-gray-600">Manage commission types for employees</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-[#4b5320] text-white px-4 py-2 rounded-lg hover:bg-[#3d431a] transition-colors whitespace-nowrap shadow-sm"
          >
            <i className="ri-add-line mr-2"></i>
            New Type
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-percent-line text-[#4b5320] text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Types</p>
                <p className="text-2xl font-bold text-gray-900">{commissionTypes.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-check-line text-[#4b5320] text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active</p>
                <p className="text-2xl font-bold text-gray-900">{activeTypes}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-calculator-line text-[#4b5320] text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Average Rate</p>
                <p className="text-2xl font-bold text-gray-900">{(totalCommissionRate / Math.max(activeTypes, 1)).toFixed(1)}%</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-calendar-line text-[#4b5320] text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Frequencies</p>
                <p className="text-2xl font-bold text-gray-900">{new Set(commissionTypes.map(t => t.paymentFrequency)).size}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search <span className="text-red-500">*</span></label>
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  placeholder="Search commission types..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm pr-8"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Frequency</label>
              <select
                value={filterFrequency}
                onChange={(e) => setFilterFrequency(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm pr-8"
              >
                <option value="all">All</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annual</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={exportToCSV}
                className="w-full bg-[#4b5320] text-white px-4 py-2 rounded-lg hover:bg-[#3d431a] transition-colors text-sm whitespace-nowrap shadow-sm"
              >
                <i className="ri-download-line mr-2"></i>
                Export
              </button>
            </div>
          </div>
        </div>

        {/* Commission Types Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Commission Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Calculation
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Based On
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Frequency
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
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
                      <div className="text-sm text-gray-900">
                        {type.calculationType === 'percentage' ? `${type.rate}%` : 
                         type.calculationType === 'fixed' ? `$${type.rate.toLocaleString()}` : 
                         'Tiered'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {type.calculationType === 'percentage' ? 'Percentage' : 
                         type.calculationType === 'fixed' ? 'Fixed Amount' : 
                         'Tiered'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#e6e9d5] text-[#4b5320]">
                        {type.basedOn === 'sales' ? 'Sales' : 
                         type.basedOn === 'profit' ? 'Profit' : 
                         type.basedOn === 'units' ? 'Units' : 'Revenue'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {type.paymentFrequency === 'monthly' ? 'Monthly' : 
                       type.paymentFrequency === 'quarterly' ? 'Quarterly' : 'Annual'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        type.isActive 
                          ? 'bg-[#e6e9d5] text-[#4b5320]' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {type.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(type)}
                          className="text-[#4b5320] hover:text-[#3d431a]"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => toggleStatus(type.id)}
                          className={`${type.isActive ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}`}
                        >
                          <i className={`${type.isActive ? 'ri-pause-line' : 'ri-play-line'}`}></i>
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900">
                    {editingType ? 'Edit Commission Type' : 'New Commission Type'}
                  </h2>
                  <button
                    onClick={resetForm}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                        placeholder="E.g., Sales Commission"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Calculation Type *
                      </label>
                      <select
                        required
                        value={formData.calculationType}
                        onChange={(e) => setFormData(prev => ({ ...prev, calculationType: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent pr-8"
                      >
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed Amount</option>
                        <option value="tiered">Tiered</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                      placeholder="Description of the commission type..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {formData.calculationType === 'percentage' ? 'Percentage (%)' : 'Amount ($)'} *
                      </label>
                      <input
                        type="number"
                        required
                        step="0.01"
                        min="0"
                        value={formData.rate}
                        onChange={(e) => setFormData(prev => ({ ...prev, rate: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Based On *
                      </label>
                      <select
                        required
                        value={formData.basedOn}
                        onChange={(e) => setFormData(prev => ({ ...prev, basedOn: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent pr-8"
                      >
                        <option value="sales">Sales</option>
                        <option value="profit">Profit</option>
                        <option value="units">Units</option>
                        <option value="revenue">Revenue</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Payment Frequency *
                      </label>
                      <select
                        required
                        value={formData.paymentFrequency}
                        onChange={(e) => setFormData(prev => ({ ...prev, paymentFrequency: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent pr-8"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="annually">Annual</option>
                      </select>
                    </div>
                  </div>

                  {formData.calculationType === 'tiered' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Minimum Amount
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.minAmount}
                          onChange={(e) => setFormData(prev => ({ ...prev, minAmount: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                          placeholder="0.00"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Maximum Amount
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.maxAmount}
                          onChange={(e) => setFormData(prev => ({ ...prev, maxAmount: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end space-x-3 pt-6">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d431a] transition-colors whitespace-nowrap"
                    >
                      {editingType ? 'Update' : 'Create'} Type
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
