
import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { exportToExcelStyled } from '../../../utils/exportImportUtils';
import { employeesService, royaltiesService } from '../../../services/database';

interface Royalty {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  position: string;
  royaltyType: 'percentage' | 'fixed' | 'formula';
  baseAmount: number;
  percentage?: number;
  fixedAmount?: number;
  formula?: string;
  period: 'monthly' | 'quarterly' | 'annual';
  startDate: string;
  endDate?: string;
  isActive: boolean;
  description: string;
  calculatedAmount: number;
  lastCalculation: string;
  createdAt: string;
}

export default function PayrollRoyaltiesPage() {
  const { user } = useAuth();
  const [royalties, setRoyalties] = useState<Royalty[]>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; code: string; name: string; department: string; position: string }>>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingRoyalty, setEditingRoyalty] = useState<Royalty | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');

  const [formData, setFormData] = useState({
    employeeId: '',
    employeeName: '',
    department: '',
    position: '',
    royaltyType: 'percentage' as Royalty['royaltyType'],
    baseAmount: 0,
    percentage: 0,
    fixedAmount: 0,
    formula: '',
    period: 'monthly' as Royalty['period'],
    startDate: '',
    endDate: '',
    isActive: true,
    description: ''
  });

  const departments = Array.from(new Set(employees.map(e => e.department).filter(Boolean)));
  const royaltyTypes = [
    { value: 'percentage', label: 'Percentage' },
    { value: 'fixed', label: 'Fixed Amount' },
    { value: 'formula', label: 'Formula' }
  ];
  const periods = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'annual', label: 'Annual' }
  ];

  useEffect(() => {
    const loadEmployees = async () => {
      if (!user) return;
      try {
        const data = await employeesService.getAll(user.id);
        const mapped = (data || []).map((e: any) => ({
          id: e.id,
          code: e.employee_code || e.identification || '',
          name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
          department: e.departments?.name || '',
          position: e.positions?.title || '',
        }));
        setEmployees(mapped);
      } catch (error) {
        console.error('Error loading employees for royalties:', error);
      }
    };

    const loadRoyalties = async () => {
      if (!user) return;
      try {
        const data = await royaltiesService.getAll(user.id);
        const mapped: Royalty[] = (data || []).map((r: any) => ({
          id: r.id,
          employeeId: r.employee_id,
          employeeName: r.employee_name,
          department: r.department,
          position: r.position,
          royaltyType: r.royalty_type,
          baseAmount: Number(r.base_amount) || 0,
          percentage: r.percentage ?? undefined,
          fixedAmount: r.fixed_amount ?? undefined,
          formula: r.formula || '',
          period: r.period,
          startDate: r.start_date,
          endDate: r.end_date || '',
          isActive: !!r.is_active,
          description: r.description || '',
          calculatedAmount: Number(r.calculated_amount) || 0,
          lastCalculation: r.last_calculation || new Date().toISOString().split('T')[0],
          createdAt: r.created_at || new Date().toISOString(),
        }));
        setRoyalties(mapped);
      } catch (error) {
        console.error('Error loading royalties:', error);
      }
    };

    loadEmployees();
    loadRoyalties();
  }, [user]);

  const filteredRoyalties = royalties.filter(royalty => {
    const matchesSearch = royalty.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         royalty.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = !filterDepartment || royalty.department === filterDepartment;
    const matchesType = !filterType || royalty.royaltyType === filterType;
    const matchesPeriod = !filterPeriod || royalty.period === filterPeriod;
    
    return matchesSearch && matchesDepartment && matchesType && matchesPeriod;
  });

  const calculateRoyalty = (data: any) => {
    switch (data.royaltyType) {
      case 'percentage':
        return (data.baseAmount * data.percentage) / 100;
      case 'fixed':
        return data.fixedAmount;
      case 'formula':
        try {
          const raw = String(data.formula || '');
          // Validar sólo caracteres permitidos y el identificador baseAmount
          const allowed = /^[0-9+\-*/().\s]*([bB]ase[Aa]mount[0-9+\-*/().\s]*)*$/;
          if (!allowed.test(raw)) return 0;
          // Construir función pura que reciba baseAmount como argumento
          // y no tenga acceso al scope externo.
          const fn = new Function('baseAmount', `"use strict"; return (${raw});`);
          const result = fn(Number(data.baseAmount) || 0);
          return Number.isFinite(result) ? Number(result) : 0;
        } catch {
          return 0;
        }
      default:
        return 0;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const calculatedAmount = calculateRoyalty(formData);

    const payload: any = {
      employee_id: formData.employeeId,
      employee_name: formData.employeeName,
      department: formData.department,
      position: formData.position,
      royalty_type: formData.royaltyType,
      base_amount: formData.royaltyType === 'fixed' ? 0 : formData.baseAmount,
      percentage: formData.royaltyType === 'percentage' ? formData.percentage : null,
      fixed_amount: formData.royaltyType === 'fixed' ? formData.fixedAmount : null,
      formula: formData.royaltyType === 'formula' ? formData.formula : null,
      period: formData.period,
      start_date: formData.startDate,
      end_date: formData.endDate || null,
      is_active: formData.isActive,
      description: formData.description,
      calculated_amount: calculatedAmount,
      last_calculation: new Date().toISOString().split('T')[0],
    };

    try {
      if (editingRoyalty) {
        const updated = await royaltiesService.update(editingRoyalty.id, payload);
        const mapped: Royalty = {
          id: updated.id,
          employeeId: updated.employee_id,
          employeeName: updated.employee_name,
          department: updated.department,
          position: updated.position,
          royaltyType: updated.royalty_type,
          baseAmount: Number(updated.base_amount) || 0,
          percentage: updated.percentage ?? undefined,
          fixedAmount: updated.fixed_amount ?? undefined,
          formula: updated.formula || '',
          period: updated.period,
          startDate: updated.start_date,
          endDate: updated.end_date || '',
          isActive: !!updated.is_active,
          description: updated.description || '',
          calculatedAmount: Number(updated.calculated_amount) || 0,
          lastCalculation: updated.last_calculation || new Date().toISOString().split('T')[0],
          createdAt: updated.created_at || new Date().toISOString(),
        };
        setRoyalties(prev => prev.map(royalty => 
          royalty.id === editingRoyalty.id ? mapped : royalty
        ));
      } else {
        const created = await royaltiesService.create(user.id, payload);
        const mapped: Royalty = {
          id: created.id,
          employeeId: created.employee_id,
          employeeName: created.employee_name,
          department: created.department,
          position: created.position,
          royaltyType: created.royalty_type,
          baseAmount: Number(created.base_amount) || 0,
          percentage: created.percentage ?? undefined,
          fixedAmount: created.fixed_amount ?? undefined,
          formula: created.formula || '',
          period: created.period,
          startDate: created.start_date,
          endDate: created.end_date || '',
          isActive: !!created.is_active,
          description: created.description || '',
          calculatedAmount: Number(created.calculated_amount) || 0,
          lastCalculation: created.last_calculation || new Date().toISOString().split('T')[0],
          createdAt: created.created_at || new Date().toISOString(),
        };
        setRoyalties(prev => [...prev, mapped]);
      }

      setShowForm(false);
      setEditingRoyalty(null);
      setSelectedEmployeeId('');
      setFormData({
        employeeId: '',
        employeeName: '',
        department: '',
        position: '',
        royaltyType: 'percentage',
        baseAmount: 0,
        percentage: 0,
        fixedAmount: 0,
        formula: '',
        period: 'monthly',
        startDate: '',
        endDate: '',
        isActive: true,
        description: ''
      });
    } catch (error) {
      console.error('Error saving royalty:', error);
      alert('Error saving the royalty.');
    }
  };

  const handleEdit = (royalty: Royalty) => {
    setEditingRoyalty(royalty);
    setFormData({
      employeeId: royalty.employeeId,
      employeeName: royalty.employeeName,
      department: royalty.department,
      position: royalty.position,
      royaltyType: royalty.royaltyType,
      baseAmount: royalty.baseAmount,
      percentage: royalty.percentage || 0,
      fixedAmount: royalty.fixedAmount || 0,
      formula: royalty.formula || '',
      period: royalty.period,
      startDate: royalty.startDate,
      endDate: royalty.endDate || '',
      isActive: royalty.isActive,
      description: royalty.description
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this royalty?')) return;
    try {
      await royaltiesService.delete(id);
      setRoyalties(prev => prev.filter(royalty => royalty.id !== id));
    } catch (error) {
      console.error('Error deleting royalty:', error);
      alert('Error deleting the royalty.');
    }
  };

  const exportToExcel = async () => {
    const today = new Date().toISOString().split('T')[0];

    const rows = filteredRoyalties.map(royalty => ({
      employee: royalty.employeeName,
      department: royalty.department,
      type:
        royalty.royaltyType === 'percentage' ? 'Percentage' :
        royalty.royaltyType === 'fixed' ? 'Fixed Amount' : 'Formula',
      baseAmount: royalty.baseAmount,
      calculatedAmount: royalty.calculatedAmount,
      period:
        royalty.period === 'monthly' ? 'Monthly' :
        royalty.period === 'quarterly' ? 'Quarterly' : 'Annual',
      status: royalty.isActive ? 'Active' : 'Inactive',
    }));

    if (!rows.length) {
      alert('No royalties to export.');
      return;
    }

    await exportToExcelStyled(
      rows,
      [
        { key: 'employee', title: 'Employee', width: 26 },
        { key: 'department', title: 'Department', width: 22 },
        { key: 'type', title: 'Type', width: 16 },
        { key: 'baseAmount', title: 'Base Amount', width: 16, numFmt: '#,##0.00' },
        { key: 'calculatedAmount', title: 'Calculated Amount', width: 18, numFmt: '#,##0.00' },
        { key: 'period', title: 'Period', width: 14 },
        { key: 'status', title: 'Status', width: 12 },
      ],
      `royalties_${today}`,
      'Royalties'
    );
  };

  const totalRoyalties = filteredRoyalties.reduce((sum, royalty) => sum + royalty.calculatedAmount, 0);
  const activeRoyalties = filteredRoyalties.filter(r => r.isActive).length;

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Royalties</h1>
            <p className="text-gray-600">Manage royalties and profit shares</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
            >
              <i className="ri-arrow-left-line mr-2"></i>
              Back
            </button>
            <button
              onClick={exportToExcel}
              className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d431a] transition-colors whitespace-nowrap shadow-sm"
            >
              <i className="ri-file-excel-line mr-2"></i>
              Export Excel
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d431a] transition-colors whitespace-nowrap shadow-sm"
            >
              <i className="ri-add-line mr-2"></i>
              New Royalty
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-money-dollar-circle-line text-[#4b5320] text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Royalties</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${totalRoyalties.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-user-star-line text-[#4b5320] text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Royalties</p>
                <p className="text-2xl font-bold text-gray-900">{activeRoyalties}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-percentage-line text-[#4b5320] text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Monthly Average</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${Math.round(totalRoyalties / Math.max(activeRoyalties, 1)).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-team-line text-[#4b5320] text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Employees</p>
                <p className="text-2xl font-bold text-gray-900">{royalties.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow-sm border mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <input
                type="text"
                placeholder="Search employee..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm"
              />
            </div>
            <div>
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm"
              >
                <option value="">All departments</option>
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            <div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm"
              >
                <option value="">All types</option>
                {royaltyTypes.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div>
              <select
                value={filterPeriod}
                onChange={(e) => setFilterPeriod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm"
              >
                <option value="">All periods</option>
                {periods.map(period => (
                  <option key={period.value} value={period.value}>{period.label}</option>
                ))}
              </select>
            </div>
            <div>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterDepartment('');
                  setFilterType('');
                  setFilterPeriod('');
                }}
                className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm whitespace-nowrap"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Base Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Calculated Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Period
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
                {filteredRoyalties.map((royalty) => (
                  <tr key={royalty.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{royalty.employeeName}</div>
                        <div className="text-sm text-gray-500">{royalty.position}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {royalty.department}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-[#e6e9d5] text-[#4b5320]">
                        {royalty.royaltyType === 'percentage' ? 'Percentage' :
                         royalty.royaltyType === 'fixed' ? 'Fixed Amount' : 'Formula'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${royalty.baseAmount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      ${royalty.calculatedAmount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {royalty.period === 'monthly' ? 'Monthly' :
                       royalty.period === 'quarterly' ? 'Quarterly' : 'Annual'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        royalty.isActive ? 'bg-[#e6e9d5] text-[#4b5320]' : 'bg-red-100 text-red-800'
                      }`}>
                        {royalty.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(royalty)}
                          className="text-[#4b5320] hover:text-[#3d431a]"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => handleDelete(royalty.id)}
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

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-gray-900">
                    {editingRoyalty ? 'Edit Royalty' : 'New Royalty'}
                  </h2>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setEditingRoyalty(null);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Employee *
                      </label>
                      <select
                        required
                        value={selectedEmployeeId}
                        onChange={(e) => {
                          const value = e.target.value;
                          setSelectedEmployeeId(value);
                          const emp = employees.find(emp => emp.id === value);
                          if (emp) {
                            setFormData(prev => ({
                              ...prev,
                              employeeId: emp.code,
                              employeeName: emp.name,
                              department: emp.department,
                              position: emp.position,
                            }));
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm"
                      >
                        <option value="">Select employee...</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>
                            {emp.code ? `${emp.code} - ${emp.name}` : emp.name}
                            {emp.department ? ` - ${emp.department}` : ''}
                            {emp.position ? ` / ${emp.position}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Employee ID
                      </label>
                      <input
                        type="text"
                        value={formData.employeeId}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Department
                      </label>
                      <input
                        type="text"
                        value={formData.department}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Position
                      </label>
                      <input
                        type="text"
                        value={formData.position}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Royalty Type *
                      </label>
                      <select
                        required
                        value={formData.royaltyType}
                        onChange={(e) => setFormData(prev => ({ ...prev, royaltyType: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm"
                      >
                        {royaltyTypes.map(type => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Period *
                      </label>
                      <select
                        required
                        value={formData.period}
                        onChange={(e) => setFormData(prev => ({ ...prev, period: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm"
                      >
                        {periods.map(period => (
                          <option key={period.value} value={period.value}>{period.label}</option>
                        ))}
                      </select>
                    </div>

                    {formData.royaltyType !== 'fixed' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Base Amount
                        </label>
                        <input
                          required
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.baseAmount}
                          onChange={(e) => setFormData(prev => ({ ...prev, baseAmount: parseFloat(e.target.value) || 0 }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm"
                        />
                      </div>
                    )}

                    {formData.royaltyType === 'percentage' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Percentage (%)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.percentage}
                          onChange={(e) => setFormData(prev => ({ ...prev, percentage: parseFloat(e.target.value) || 0 }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm"
                        />
                      </div>
                    )}

                    {formData.royaltyType === 'fixed' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Fixed Amount
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.fixedAmount}
                          onChange={(e) => setFormData(prev => ({ ...prev, fixedAmount: parseFloat(e.target.value) || 0 }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Start Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.startDate}
                        onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={formData.endDate}
                        onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm"
                      />
                    </div>
                  </div>

                  {formData.royaltyType === 'formula' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Formula
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., baseAmount * 1.2"
                        value={formData.formula}
                        onChange={(e) => setFormData(prev => ({ ...prev, formula: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Use 'baseAmount' as the variable in the formula
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm"
                      placeholder="Notes about this royalty or formula"
                    />
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={formData.isActive}
                      onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                      className="h-4 w-4 text-[#4b5320] focus:ring-[#4b5320] border-gray-300 rounded"
                    />
                    <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                      Active royalty
                    </label>
                  </div>

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        setEditingRoyalty(null);
                      }}
                      className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors whitespace-nowrap"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d431a] transition-colors whitespace-nowrap shadow-sm"
                    >
                      {editingRoyalty ? 'Update' : 'Create'} Royalty
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
