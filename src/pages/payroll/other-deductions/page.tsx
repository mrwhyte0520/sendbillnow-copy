import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { resolveTenantId } from '../../../services/database';

interface OtherDeduction {
  id: string;
  employee_id: string;
  period_id?: string;
  name: string;
  description: string;
  amount: number;
  deduction_date: string;
  category: 'multa' | 'descuento' | 'adelanto' | 'dano_equipo' | 'faltante' | 'otro';
  is_one_time: boolean;
  status: 'pendiente' | 'aplicada' | 'cancelada';
  created_at: string;
}

export default function OtherDeductionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [deductions, setDeductions] = useState<OtherDeduction[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [showForm, setShowForm] = useState(false);
  const [editingDeduction, setEditingDeduction] = useState<OtherDeduction | null>(null);

  const [formData, setFormData] = useState({
    employee_id: '',
    name: '',
    description: '',
    amount: 0,
    deduction_date: new Date().toISOString().split('T')[0],
    category: 'otro' as OtherDeduction['category']
  });

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    try {
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        setDeductions([]);
        setEmployees([]);
        return;
      }

      const [deductionsData, employeesData] = await Promise.all([
        supabase
          .from('other_deductions')
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
        is_one_time: true,
        status: 'pendiente'
      };

      if (editingDeduction) {
        await supabase
          .from('other_deductions')
          .update(deductionData)
          .eq('id', editingDeduction.id);
      } else {
        await supabase
          .from('other_deductions')
          .insert([deductionData]);
      }

      await loadData();
      resetForm();
      alert('Deduction saved successfully');
    } catch (error) {
      console.error('Error saving deduction:', error);
      alert('Error saving deduction');
    }
  };

  const handleEdit = (deduction: OtherDeduction) => {
    setEditingDeduction(deduction);
    setFormData({
      employee_id: deduction.employee_id,
      name: deduction.name,
      description: deduction.description || '',
      amount: deduction.amount,
      deduction_date: deduction.deduction_date,
      category: deduction.category
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this deduction?')) return;

    try {
      await supabase
        .from('other_deductions')
        .delete()
        .eq('id', id);
      await loadData();
    } catch (error) {
      console.error('Error deleting deduction:', error);
      alert('Error deleting deduction');
    }
  };

  const changeStatus = async (id: string, newStatus: OtherDeduction['status']) => {
    try {
      await supabase
        .from('other_deductions')
        .update({ status: newStatus })
        .eq('id', id);
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
      amount: 0,
      deduction_date: new Date().toISOString().split('T')[0],
      category: 'otro'
    });
    setEditingDeduction(null);
    setShowForm(false);
  };

  const filteredDeductions = deductions.filter(deduction => {
    const matchesSearch = deduction.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      deduction.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'todos' || deduction.category === categoryFilter;
    const matchesStatus = statusFilter === 'todos' || deduction.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const getEmployeeName = (employeeId: string) => {
    const employee = employees.find(e => e.id === employeeId);
    return employee ? `${employee.first_name} ${employee.last_name}` : 'N/A';
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      multa: 'Fine',
      descuento: 'Discount',
      adelanto: 'Salary Advance',
      dano_equipo: 'Equipment Damage',
      faltante: 'Cash Shortage',
      otro: 'Other'
    };
    return labels[category] || category;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pendiente: 'bg-[#f1e4c2] text-[#3d451b]',
      aplicada: 'bg-[#dbe8c0] text-[#2f3a1f]',
      cancelada: 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const totalPendiente = filteredDeductions
    .filter(d => d.status === 'pendiente')
    .reduce((sum, d) => sum + d.amount, 0);

  const totalAplicada = filteredDeductions
    .filter(d => d.status === 'aplicada')
    .reduce((sum, d) => sum + d.amount, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6 bg-[#f6f3ea] min-h-screen -mx-4 sm:mx-0 p-4 sm:p-0">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Other Deductions</h1>
            <p className="text-gray-700">Manage one-time and occasional deductions</p>
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

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-[#dfe5cf] p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[#f1e4c2] mr-4">
                <i className="ri-time-line text-xl text-[#4b5320]"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Pending deductions</p>
                <p className="text-2xl font-bold text-gray-900">
                   {totalPendiente.toLocaleString('en-US')}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-[#dfe5cf] p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[#dbe8c0] mr-4">
                <i className="ri-checkbox-circle-line text-xl text-[#3d451b]"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Applied deductions</p>
                <p className="text-2xl font-bold text-gray-900">
                   {totalAplicada.toLocaleString('en-US')}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-[#dfe5cf] p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[#e0e5d0] mr-4">
                <i className="ri-file-list-line text-xl text-[#4b5320]"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Total deductions</p>
                <p className="text-2xl font-bold text-gray-900">{filteredDeductions.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-[#dfe5cf] p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <input
                type="text"
                placeholder="Search by name..."
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
                <option value="multa">Fine</option>
                <option value="descuento">Discount</option>
                <option value="adelanto">Salary Advance</option>
                <option value="dano_equipo">Equipment Damage</option>
                <option value="faltante">Cash Shortage</option>
                <option value="otro">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
              >
                <option value="todos">All statuses</option>
                <option value="pendiente">Pending</option>
                <option value="aplicada">Applied</option>
                <option value="cancelada">Cancelled</option>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
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
                      {new Date(deduction.deduction_date).toLocaleDateString('en-US')}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                       {deduction.amount.toLocaleString('en-US')}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(deduction.status)}`}>
                        {deduction.status === 'pendiente' ? 'Pending' : deduction.status === 'aplicada' ? 'Applied' : 'Cancelled'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        {deduction.status === 'pendiente' && (
                          <>
                            <button
                              onClick={() => changeStatus(deduction.id, 'aplicada')}
                              className="text-[#4b5320] hover:text-[#2f3a1f]"
                              title="Mark as applied"
                            >
                              <i className="ri-checkbox-circle-line"></i>
                            </button>
                            <button
                              onClick={() => handleEdit(deduction)}
                              className="text-[#4b5320] hover:text-[#2f3a1f]"
                              title="Edit"
                            >
                              <i className="ri-edit-line"></i>
                            </button>
                            <button
                              onClick={() => changeStatus(deduction.id, 'cancelada')}
                              className="text-red-600 hover:text-red-800"
                              title="Cancel"
                            >
                              <i className="ri-close-circle-line"></i>
                            </button>
                          </>
                        )}
                        {deduction.status !== 'pendiente' && (
                          <button
                            onClick={() => handleDelete(deduction.id)}
                            className="text-red-600 hover:text-red-800"
                            title="Delete"
                          >
                            <i className="ri-delete-bin-line"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredDeductions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      No deductions found
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
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {editingDeduction ? 'Edit Deduction' : 'New Deduction'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                      placeholder="e.g. Late arrival fine"
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
                      placeholder="Additional details..."
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
                      <option value="multa">Fine</option>
                      <option value="descuento">Discount</option>
                      <option value="adelanto">Salary Advance</option>
                      <option value="dano_equipo">Equipment Damage</option>
                      <option value="faltante">Cash Shortage</option>
                      <option value="otro">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Amount () *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                      required
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Application date *
                    </label>
                    <input
                      type="date"
                      value={formData.deduction_date}
                      onChange={(e) => setFormData({ ...formData, deduction_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                      required
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
