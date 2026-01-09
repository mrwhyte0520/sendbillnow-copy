import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { resolveTenantId } from '../../../services/database';

interface PeriodicDeduction {
  id: string;
  employee_id: string;
  name: string;
  description: string;
  type: 'fijo' | 'porcentaje';
  amount: number;
  percentage?: number;
  frequency: 'semanal' | 'quincenal' | 'mensual';
  start_date: string;
  end_date?: string;
  is_active: boolean;
  category: 'prestamo' | 'pension_alimenticia' | 'seguro' | 'sindicato' | 'cooperativa' | 'otro';
  created_at: string;
}

export default function PeriodicDeductionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [deductions, setDeductions] = useState<PeriodicDeduction[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('todos');
  const [showForm, setShowForm] = useState(false);
  const [editingDeduction, setEditingDeduction] = useState<PeriodicDeduction | null>(null);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    employee_id: '',
    name: '',
    description: '',
    type: 'fijo' as 'fijo' | 'porcentaje',
    amount: 0,
    percentage: 0,
    frequency: 'mensual' as 'semanal' | 'quincenal' | 'mensual',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    category: 'otro' as PeriodicDeduction['category']
  });

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        setDeductions([]);
        setEmployees([]);
        return;
      }

      const [deductionsData, employeesData] = await Promise.all([
        supabase
          .from('periodic_deductions')
          .select('*')
          .eq('user_id', tenantId)
          .order('created_at', { ascending: false }),
        supabase
          .from('employees')
          .select('id, first_name, last_name, employee_code')
          .eq('user_id', tenantId)
          .eq('status', 'active')
      ]);

      if (deductionsData.data) setDeductions(deductionsData.data);
      if (employeesData.data) setEmployees(employeesData.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        alert('Could not determine the user company.');
        return;
      }

      const deductionData = {
        ...formData,
        user_id: tenantId,
        is_active: true
      };

      if (editingDeduction) {
        await supabase
          .from('periodic_deductions')
          .update(deductionData)
          .eq('id', editingDeduction.id);
      } else {
        await supabase
          .from('periodic_deductions')
          .insert([deductionData]);
      }

      await loadData();
      resetForm();
    } catch (error) {
      console.error('Error saving deduction:', error);
      alert('Error saving deduction');
    }
  };

  const handleEdit = (deduction: PeriodicDeduction) => {
    setEditingDeduction(deduction);
    setFormData({
      employee_id: deduction.employee_id,
      name: deduction.name,
      description: deduction.description || '',
      type: deduction.type,
      amount: deduction.amount,
      percentage: deduction.percentage || 0,
      frequency: deduction.frequency,
      start_date: deduction.start_date,
      end_date: deduction.end_date || '',
      category: deduction.category
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this periodic deduction?')) return;

    try {
      await supabase
        .from('periodic_deductions')
        .delete()
        .eq('id', id);
      await loadData();
    } catch (error) {
      console.error('Error deleting deduction:', error);
      alert('Error deleting deduction');
    }
  };

  const toggleStatus = async (deduction: PeriodicDeduction) => {
    try {
      await supabase
        .from('periodic_deductions')
        .update({ is_active: !deduction.is_active })
        .eq('id', deduction.id);
      await loadData();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      employee_id: '',
      name: '',
      description: '',
      type: 'fijo',
      amount: 0,
      percentage: 0,
      frequency: 'mensual',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      category: 'otro'
    });
    setEditingDeduction(null);
    setShowForm(false);
  };

  const filteredDeductions = deductions.filter(deduction => {
    const matchesSearch = deduction.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      deduction.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'todos' || deduction.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const getEmployeeName = (employeeId: string) => {
    const employee = employees.find(e => e.id === employeeId);
    return employee ? `${employee.first_name} ${employee.last_name}` : 'N/A';
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      prestamo: 'Loan',
      pension_alimenticia: 'Alimony',
      seguro: 'Insurance',
      sindicato: 'Union',
      cooperativa: 'Cooperative',
      otro: 'Other'
    };
    return labels[category] || category;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 bg-[#f6f3ea] min-h-screen -mx-4 sm:mx-0 p-4 sm:p-0">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Periodic Deductions</h1>
            <p className="text-gray-700">Manage recurring deductions per employee</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/payroll')}
              className="px-4 py-2 bg-[#e5ead7] text-[#2f3a1f] rounded-lg hover:bg-[#d7dec3] transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <i className="ri-arrow-left-line"></i>
              Back
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm"
            >
              <i className="ri-add-line"></i>
              New Deduction
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-[#dfe5cf] p-4">
          <div className="grid grid-cols-1 md-grid-cols-2 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <input
                type="text"
                placeholder="Search by name or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
              >
                <option value="todos">All categories</option>
                <option value="prestamo">Loan</option>
                <option value="pension_alimenticia">Alimony</option>
                <option value="seguro">Insurance</option>
                <option value="sindicato">Union</option>
                <option value="cooperativa">Cooperative</option>
                <option value="otro">Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* Deductions List */}
        <div className="bg-white rounded-xl shadow-sm border border-[#dfe5cf]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deduction</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Frequency</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredDeductions.map((deduction) => (
                  <tr key={deduction.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {getEmployeeName(deduction.employee_id)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{deduction.name}</div>
                      {deduction.description && (
                        <div className="text-xs text-gray-500">{deduction.description}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {getCategoryLabel(deduction.category)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {deduction.type === 'fijo' ? 'Fixed Amount' : 'Percentage'}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {deduction.type === 'fijo'
                        ? `RD$ ${deduction.amount.toLocaleString('en-US')}`
                        : `${deduction.percentage}%`
                      }
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 capitalize">
                      {deduction.frequency === 'semanal' ? 'Weekly' : deduction.frequency === 'quincenal' ? 'Biweekly' : 'Monthly'}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleStatus(deduction)}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          deduction.is_active
                            ? 'bg-[#dbe8c0] text-[#2f3a1f]'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {deduction.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(deduction)}
                          className="text-[#4b5320] hover:text-[#2f3a1f]"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => handleDelete(deduction.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredDeductions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      No periodic deductions found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {editingDeduction ? 'Edit Periodic Deduction' : 'New Periodic Deduction'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Employee *
                    </label>
                    <select
                      value={formData.employee_id}
                      onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                      required
                    >
                      <option value="">Select employee</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.employee_code} - {emp.first_name} {emp.last_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Deduction name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                      required
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category *
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                      required
                    >
                      <option value="prestamo">Loan</option>
                      <option value="pension_alimenticia">Alimony</option>
                      <option value="seguro">Insurance</option>
                      <option value="sindicato">Union</option>
                      <option value="cooperativa">Cooperative</option>
                      <option value="otro">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Deduction type *
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                      required
                    >
                      <option value="fijo">Fixed Amount</option>
                      <option value="porcentaje">Percentage</option>
                    </select>
                  </div>

                  {formData.type === 'fijo' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Amount (RD$) *
                      </label>
                      <input
                        type="number" min="0"
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                        required
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Percentage (%) *
                      </label>
                      <input
                        type="number" min="0"
                        step="0.01"
                        value={formData.percentage}
                        onChange={(e) => setFormData({ ...formData, percentage: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                        required
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Frequency *
                    </label>
                    <select
                      value={formData.frequency}
                      onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                      required
                    >
                      <option value="semanal">Weekly</option>
                      <option value="quincenal">Biweekly</option>
                      <option value="mensual">Monthly</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Start date *
                    </label>
                    <input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      End date (optional)
                    </label>
                    <input
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] transition-colors shadow-sm"
                  >
                    {editingDeduction ? 'Update' : 'Create'} Deduction
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
