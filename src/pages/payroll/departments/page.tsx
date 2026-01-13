import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { exportToExcelStyled } from '../../../utils/exportImportUtils';
import { useAuth } from '../../../hooks/useAuth';
import { departmentsService, employeesService } from '../../../services/database';

interface Department {
  id: string;
  name: string;
  description: string;
  manager: string;
  employeeCount: number;
  budget: number;
  location: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export default function DepartmentsPage() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    manager: '',
    budget: 0,
    location: '',
    status: 'active' as 'active' | 'inactive'
  });

  const loadDepartments = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [data, employees] = await Promise.all([
        departmentsService.getAll(user.id),
        employeesService.getAll(user.id)
      ]);

      // Contar empleados activos por departamento
      const employeeCountByDept = new Map<string, number>();
      (employees || []).forEach((emp: any) => {
        const status = String(emp.status || '').toLowerCase();
        if ((status === 'active' || status === 'activo') && emp.department_id) {
          const count = employeeCountByDept.get(emp.department_id) || 0;
          employeeCountByDept.set(emp.department_id, count + 1);
        }
      });

      const mapped: Department[] = (data || []).map((d: any) => ({
        id: d.id as string,
        name: d.name || '',
        description: d.description || '',
        manager: d.manager || '',
        employeeCount: employeeCountByDept.get(d.id) || 0,
        budget: Number(d.budget) || 0,
        location: d.location || '',
        status: (d.status as 'active' | 'inactive') || 'active',
        createdAt: d.created_at || new Date().toISOString().split('T')[0],
      }));
      setDepartments(mapped);
    } catch (error) {
      console.error('Error loading departments:', error);
      alert('Error loading departments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadDepartments();
    }
  }, [user]);

  const filteredDepartments = departments.filter(dept => {
    const matchesSearch = dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         dept.manager.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         dept.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || dept.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (editingDepartment) {
        await departmentsService.update(editingDepartment.id, {
          name: formData.name,
          description: formData.description,
          manager: formData.manager,
          budget: formData.budget,
          location: formData.location,
          status: formData.status,
        });
      } else {
        await departmentsService.create(user.id, {
          name: formData.name,
          description: formData.description,
          manager: formData.manager,
          budget: formData.budget,
          location: formData.location,
          status: formData.status,
        });
      }

      await loadDepartments();
      resetForm();
    } catch (error) {
      console.error('Error saving department:', error);
      alert('Error saving the department');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      manager: '',
      budget: 0,
      location: '',
      status: 'active'
    });
    setEditingDepartment(null);
    setShowForm(false);
  };

  const handleEdit = (department: Department) => {
    setEditingDepartment(department);
    setFormData({
      name: department.name,
      description: department.description,
      manager: department.manager,
      budget: department.budget,
      location: department.location,
      status: department.status
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this department?')) return;
    try {
      await departmentsService.delete(id);
      await loadDepartments();
    } catch (error) {
      console.error('Error deleting department:', error);
      alert('Error deleting the department');
    }
  };

  const toggleStatus = async (id: string) => {
    const dept = departments.find(d => d.id === id);
    if (!dept) return;
    const newStatus = dept.status === 'active' ? 'inactive' : 'active';
    try {
      await departmentsService.update(id, { status: newStatus });
      await loadDepartments();
    } catch (error) {
      console.error('Error actualizando estado del departamento:', error);
      alert('Error updating status');
    }
  };

  const downloadExcel = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const rows = filteredDepartments.map(dept => ({
        name: dept.name,
        description: dept.description,
        manager: dept.manager,
        employees: dept.employeeCount,
        budget: dept.budget || 0,
        location: dept.location,
        status: dept.status === 'active' ? 'Active' : 'Inactive',
        createdAt: dept.createdAt,
      }));
      await exportToExcelStyled(
        rows,
        [
          { key: 'name', title: 'Department', width: 22 },
          { key: 'description', title: 'Description', width: 40 },
          { key: 'manager', title: 'Manager', width: 22 },
          { key: 'employees', title: 'Employees', width: 12 },
          { key: 'budget', title: 'Budget', width: 16, numFmt: '#,##0.00' },
          { key: 'location', title: 'Location', width: 24 },
          { key: 'status', title: 'Status', width: 12 },
          { key: 'createdAt', title: 'Created', width: 14 },
        ],
        `departments_${today}`,
        'Departments'
      );
    } catch (error) {
      console.error('Error exporting departments:', error);
      alert('Error exporting to Excel.');
    }
  };

  const totalEmployees = departments.reduce((sum, dept) => sum + dept.employeeCount, 0);
  const totalBudget = departments.reduce((sum, dept) => sum + dept.budget, 0);
  const avgEmployees = departments.length > 0 ? Math.round(totalEmployees / departments.length) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 bg-[#f6f3ea] min-h-screen -mx-4 sm:mx-0 p-4 sm:p-0">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
            <p className="text-gray-700">Manage company departments</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={downloadExcel}
              className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] transition-colors flex items-center gap-2 shadow-sm"
            >
              <i className="ri-download-line"></i>
              Export Excel
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] transition-colors flex items-center gap-2 shadow-sm"
            >
              <i className="ri-add-line"></i>
              New Department
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-[#dfe5cf]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Departments</p>
                <p className="text-2xl font-bold text-gray-900">{departments.length}</p>
              </div>
              <div className="w-12 h-12 bg-[#e5ead7] rounded-lg flex items-center justify-center">
                <i className="ri-building-4-line text-[#4b5320] text-xl"></i>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-[#dfe5cf]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Employees</p>
                <p className="text-2xl font-bold text-[#2f3a1f]">{totalEmployees}</p>
              </div>
              <div className="w-12 h-12 bg-[#dbe8c0] rounded-lg flex items-center justify-center">
                <i className="ri-team-line text-[#3d451b] text-xl"></i>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-[#dfe5cf]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Budget</p>
                <p className="text-2xl font-bold text-[#2f3a1f]"> {totalBudget.toLocaleString('en-US')}</p>
              </div>
              <div className="w-12 h-12 bg-[#f1e4c2] rounded-lg flex items-center justify-center">
                <i className="ri-money-dollar-circle-line text-[#4b5320] text-xl"></i>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-[#dfe5cf]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Average Employees</p>
                <p className="text-2xl font-bold text-[#2f3a1f]">{avgEmployees}</p>
              </div>
              <div className="w-12 h-12 bg-[#e0e5d0] rounded-lg flex items-center justify-center">
                <i className="ri-user-3-line text-[#4b5320] text-xl"></i>
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
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name, manager, or location..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                }}
                className="px-4 py-2 text-[#4b5320] hover:text-[#2f3a1f] transition-colors"
              >
                Clear filters
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-[#dfe5cf] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Manager
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employees
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Budget
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
                {filteredDepartments.map((department) => (
                  <tr key={department.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{department.name}</div>
                        <div className="text-sm text-gray-500">{department.description}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          <i className="ri-map-pin-line mr-1"></i>
                          {department.location}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                          <i className="ri-user-line text-blue-600"></i>
                        </div>
                        <span className="text-sm text-gray-900">{department.manager}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{department.employeeCount}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">${department.budget.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        department.status === 'active' 
                          ? 'bg-[#dbe8c0] text-[#2f3a1f]' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {department.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(department)}
                          className="text-[#4b5320] hover:text-[#2f3a1f] transition-colors"
                          title="Edit"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => toggleStatus(department.id)}
                          className={`transition-colors ${
                            department.status === 'active' 
                              ? 'text-red-600 hover:text-red-900' 
                              : 'text-[#4b5320] hover:text-[#2f3a1f]'
                          }`}
                          title={department.status === 'active' ? 'Deactivate' : 'Activate'}
                        >
                          <i className={department.status === 'active' ? 'ri-pause-line' : 'ri-play-line'}></i>
                        </button>
                        <button
                          onClick={() => handleDelete(department.id)}
                          className="text-red-600 hover:text-red-900 transition-colors"
                          title="Delete"
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingDepartment ? 'Edit Department' : 'New Department'}
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
                      Department Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description *
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Location *
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Manager *
                    </label>
                    <input
                      type="text"
                      value={formData.manager}
                      onChange={(e) => setFormData({...formData, manager: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Annual Budget
                    </label>
                    <input
                      type="number"
                      value={formData.budget}
                      onChange={(e) => setFormData({...formData, budget: parseFloat(e.target.value) || 0})}
                      step="1000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] transition-colors shadow-sm"
                  >
                    {editingDepartment ? 'Update' : 'Create'} Department
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
