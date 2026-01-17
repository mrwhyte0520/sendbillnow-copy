import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { exportToExcelWithHeaders } from '../../../utils/exportImportUtils';
import { employeesService, rolesService, departmentsService, employeeRoleHistoryService } from '../../../services/contador/staff.service';
import type { Role, Department } from '../../../services/contador/staff.service';

interface EmployeeDisplay {
  id: string;
  employee_no?: string;
  name: string;
  position: string;
  department: string;
  status: 'active' | 'inactive' | 'terminated';
  hireDate: string;
  hoursWorked: number;
  attendance: number;
  email?: string;
  phone?: string;
}

export default function ContadorStaffReportPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'employees' | 'roles' | 'departments'>('employees');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [showAddDepartmentModal, setShowAddDepartmentModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [employees, setEmployees] = useState<EmployeeDisplay[]>([]);
  const [employeesDb, setEmployeesDb] = useState<any[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [historyEmployeeName, setHistoryEmployeeName] = useState('');
  const [roleHistory, setRoleHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);
  const [departmentSaving, setDepartmentSaving] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    employee_no: '',
    email: '',
    phone: '',
    hire_date: new Date().toISOString().split('T')[0],
    default_role_id: '',
    department_id: '',
  });

  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    base_salary: '',
  });

  const [departmentForm, setDepartmentForm] = useState({
    name: '',
    description: '',
  });

  // Cargar datos desde Supabase
  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [emps, rls, deps] = await Promise.all([
        employeesService.list(user.id),
        rolesService.list(user.id),
        departmentsService.list(user.id),
      ]);

      setEmployeesDb(emps as any[]);

      // Mapear empleados al formato de display
      const mapped: EmployeeDisplay[] = emps.map(emp => ({
        id: emp.id,
        employee_no: emp.employee_no,
        name: `${emp.first_name} ${emp.last_name}`,
        position: emp.role?.name || 'N/A',
        department: emp.role?.name || 'General',
        status: emp.status === 'terminated' ? 'inactive' : emp.status,
        hireDate: emp.hire_date,
        hoursWorked: 0, // TODO: calcular desde time_clock_entries
        attendance: 95, // TODO: calcular desde time_clock_entries
        email: emp.email || undefined,
        phone: emp.phone || undefined,
      }));

      setEmployees(mapped);
      setRoles(rls);
      setDepartments(deps);
    } catch (error) {
      console.error('Error loading staff data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const todayIso = new Date().toISOString().slice(0, 10);

      if (activeTab === 'employees') {
        const rows = (employeesDb || []).map((e: any) => ({
          employee_no: e.employee_no || '',
          first_name: e.first_name || '',
          last_name: e.last_name || '',
          role: (e.role as any)?.name || '',
          hire_date: e.hire_date || '',
          status: e.status || '',
          email: e.email || '',
          phone: e.phone || '',
        }));

        const headers = [
          { key: 'employee_no', title: 'Employee #' },
          { key: 'first_name', title: 'First Name' },
          { key: 'last_name', title: 'Last Name' },
          { key: 'role', title: 'Role' },
          { key: 'hire_date', title: 'Hire Date' },
          { key: 'status', title: 'Status' },
          { key: 'email', title: 'Email' },
          { key: 'phone', title: 'Phone' },
        ];

        await exportToExcelWithHeaders(rows, headers, `staff_employees_${todayIso}`, 'Employees');
        return;
      }

      if (activeTab === 'roles') {
        const rows = (roles || []).map((r: any) => ({
          name: r.name || '',
          base_salary: typeof r.base_salary === 'number' ? r.base_salary : '',
          description: r.description || '',
        }));

        const headers = [
          { key: 'name', title: 'Role' },
          { key: 'base_salary', title: 'Salary' },
          { key: 'description', title: 'Description' },
        ];

        await exportToExcelWithHeaders(rows, headers, `staff_roles_${todayIso}`, 'Roles');
        return;
      }

      const rows = (departments || []).map((d: any) => ({
        name: d.name || '',
        description: d.description || '',
      }));

      const headers = [
        { key: 'name', title: 'Department' },
        { key: 'description', title: 'Description' },
      ];

      await exportToExcelWithHeaders(rows, headers, `staff_departments_${todayIso}`, 'Departments');
    } catch (error) {
      console.error('Error exporting staff report:', error);
      alert('Error exporting');
    }
  };

  const handleAddDepartment = async () => {
    if (!user?.id || !departmentForm.name.trim()) return;
    setDepartmentSaving(true);
    try {
      await departmentsService.create({
        user_id: user.id,
        name: departmentForm.name.trim(),
        description: departmentForm.description.trim() ? departmentForm.description.trim() : null,
      });

      const deps = await departmentsService.list(user.id);
      setDepartments(deps);
      setShowAddDepartmentModal(false);
      setDepartmentForm({ name: '', description: '' });
    } catch (error) {
      console.error('Error adding department:', error);
      alert('Error adding department');
    } finally {
      setDepartmentSaving(false);
    }
  };

  const handleAddRole = async () => {
    if (!user?.id || !roleForm.name.trim()) return;
    const salary = Number(roleForm.base_salary);
    if (!Number.isFinite(salary) || salary <= 0) {
      alert('Enter a valid salary amount');
      return;
    }
    setRoleSaving(true);
    try {
      await rolesService.create({
        user_id: user.id,
        name: roleForm.name.trim(),
        description: roleForm.description.trim() ? roleForm.description.trim() : null,
        base_salary: salary,
      });

      const rls = await rolesService.list(user.id);
      setRoles(rls);
      setShowAddRoleModal(false);
      setRoleForm({ name: '', description: '', base_salary: '' });
    } catch (error) {
      console.error('Error adding role:', error);
      const msg = String((error as any)?.message || '');
      if (msg.toLowerCase().includes('base_salary') || msg.toLowerCase().includes('could not find')) {
        alert('Database missing required column: contador_roles.base_salary. Add this column in Supabase to create roles with salary.');
      } else {
        alert('Error adding role');
      }
    } finally {
      setRoleSaving(false);
    }
  };

  const handleAddEmployee = async () => {
    if (!user?.id || !formData.first_name || !formData.last_name || !formData.employee_no) return;
    setSaving(true);
    try {
      if (editingEmployeeId) {
        await employeesService.update(editingEmployeeId, {
          first_name: formData.first_name,
          last_name: formData.last_name,
          employee_no: formData.employee_no,
          email: formData.email || null,
          phone: formData.phone || null,
          hire_date: formData.hire_date,
          default_role_id: formData.default_role_id || null,
          department_id: formData.department_id || null,
        });
      } else {
        await employeesService.create({
          user_id: user.id,
          first_name: formData.first_name,
          last_name: formData.last_name,
          employee_no: formData.employee_no,
          email: formData.email || null,
          phone: formData.phone || null,
          hire_date: formData.hire_date,
          default_role_id: formData.default_role_id || null,
          department_id: formData.department_id || null,
        });
      }
      setShowAddModal(false);
      setEditingEmployeeId(null);
      setFormData({
        first_name: '',
        last_name: '',
        employee_no: '',
        email: '',
        phone: '',
        hire_date: new Date().toISOString().split('T')[0],
        default_role_id: '',
        department_id: '',
      });
      await loadData();
    } catch (error) {
      console.error('Error adding employee:', error);
      const msg = String((error as any)?.message || '').toLowerCase();
      if (msg.includes('department_id') || msg.includes('contador_departments') || msg.includes('relationship')) {
        alert('Database missing Department setup. Ensure contador_departments table exists and contador_employees.department_id column + FK are created in Supabase.');
      } else {
        alert('Error adding employee');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (empId: string, currentStatus: string) => {
    try {
      const next = currentStatus === 'active' ? 'inactive' : 'active';
      if (!confirm(`Change status to ${next}?`)) return;
      if (currentStatus === 'active') {
        await employeesService.update(empId, { status: 'inactive' });
      } else {
        await employeesService.update(empId, { status: 'active' });
      }
      await loadData();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const openEditEmployee = (empId: string) => {
    const emp = (employeesDb || []).find((e: any) => String(e.id) === String(empId));
    if (!emp) return;

    setEditingEmployeeId(String(empId));
    setFormData({
      first_name: emp.first_name || '',
      last_name: emp.last_name || '',
      employee_no: emp.employee_no || '',
      email: emp.email || '',
      phone: emp.phone || '',
      hire_date: emp.hire_date || new Date().toISOString().split('T')[0],
      default_role_id: emp.default_role_id || '',
      department_id: emp.department_id || '',
    });
    setShowAddModal(true);
  };

  const openHistory = async (empId: string) => {
    try {
      const emp = (employeesDb || []).find((e: any) => String(e.id) === String(empId));
      setHistoryEmployeeName(emp ? `${emp.first_name || ''} ${emp.last_name || ''}`.trim() : 'Employee');
      setShowHistoryModal(true);
      setHistoryLoading(true);
      const rows = await employeeRoleHistoryService.listByEmployee(empId);
      setRoleHistory(rows || []);
    } catch (error) {
      console.error('Error loading role history:', error);
      setRoleHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const filteredEmployees = employees.filter(emp => 
    filterStatus === 'all' ? true : emp.status === filterStatus
  );

  const getEmployeeDepartmentName = (employeeId: string) => {
    const emp = (employeesDb || []).find((e: any) => String(e.id) === String(employeeId));
    const embedded = (emp as any)?.department?.name;
    if (embedded) return String(embedded);

    const deptId = (emp as any)?.department_id ? String((emp as any).department_id) : '';
    if (!deptId) return '';
    const dep = (departments || []).find((d) => String(d.id) === deptId);
    return dep?.name ? String(dep.name) : '';
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#008000]/10 rounded-lg">
              <i className="ri-team-line text-2xl text-[#008000]"></i>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Staff Report</h1>
              <p className="text-gray-600">Employee Management & Reporting</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddDepartmentModal(true)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all flex items-center gap-2"
            >
              <i className="ri-building-2-line"></i>
              Add Department
            </button>
            <button
              onClick={() => setShowAddRoleModal(true)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all flex items-center gap-2"
            >
              <i className="ri-shield-user-line"></i>
              Add Role
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium hover:from-[#097509] hover:to-[#005300] transition-all flex items-center gap-2"
            >
              <i className="ri-user-add-line"></i>
              Add Employee
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#008000]"></div>
            <span className="ml-3 text-gray-600">Loading employees...</span>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200">
            <div className="flex">
              {[
                { id: 'employees', label: 'Employee List', icon: 'ri-user-line' },
                { id: 'roles', label: 'Roles List', icon: 'ri-shield-user-line' },
                { id: 'departments', label: 'Departments', icon: 'ri-building-2-line' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-[#008000] text-[#008000] bg-[#008000]/5'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <i className={tab.icon}></i>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4">
            {/* Filter */}
            <div className="flex items-center gap-4 mb-4">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
              <div className="flex-1"></div>
              <button
                onClick={handleExport}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
                <i className="ri-download-line"></i>
                Export
              </button>
            </div>

            {/* Employee Table */}
            {activeTab === 'employees' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Employee</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Position</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Department</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Hire Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredEmployees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-[#008000]/10 rounded-full flex items-center justify-center">
                              <span className="text-sm font-medium text-[#008000]">{emp.name.charAt(0)}</span>
                            </div>
                            <span className="font-medium text-gray-900">{emp.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{emp.position}</td>
                        <td className="px-4 py-3 text-gray-600">{getEmployeeDepartmentName(emp.id) || emp.department}</td>
                        <td className="px-4 py-3 text-gray-600">{emp.hireDate}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            emp.status === 'active' ? 'bg-gray-100 text-gray-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {emp.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEditEmployee(emp.id)}
                              className="p-1 hover:bg-gray-100 rounded"
                              title="Edit"
                            >
                              <i className="ri-edit-line text-gray-500"></i>
                            </button>
                            <button
                              onClick={() => openHistory(emp.id)}
                              className="p-1 hover:bg-gray-100 rounded"
                              title="View History"
                            >
                              <i className="ri-history-line text-gray-500"></i>
                            </button>
                            <button 
                              onClick={() => handleToggleStatus(emp.id, emp.status)}
                              className="p-1 hover:bg-gray-100 rounded" 
                              title={emp.status === 'active' ? 'Deactivate' : 'Activate'}
                            >
                              <i className={`${emp.status === 'active' ? 'ri-user-unfollow-line text-red-500' : 'ri-user-follow-line text-green-500'}`}></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Roles List Tab */}
            {activeTab === 'roles' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Role</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Salary</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {roles.map((role) => (
                      <tr key={role.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{role.name}</td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {typeof (role as any).base_salary === 'number'
                            ? `$${Number((role as any).base_salary).toFixed(2)}`
                            : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{role.description || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Departments Tab */}
            {activeTab === 'departments' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Department</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {departments.map((dept) => (
                      <tr key={dept.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{dept.name}</td>
                        <td className="px-4 py-3 text-gray-600">{dept.description || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Add Employee Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">{editingEmployeeId ? 'Edit Employee' : 'Add New Employee'}</h2>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingEmployeeId(null);
                  }}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                    <input 
                      type="text" 
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                    <input 
                      type="text" 
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent" 
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employee # *</label>
                  <input 
                    type="text" 
                    value={formData.employee_no}
                    onChange={(e) => setFormData({ ...formData, employee_no: e.target.value })}
                    placeholder="EMP-001"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent" 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input 
                      type="email" 
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input 
                      type="tel" 
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent" 
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select
                    value={formData.department_id}
                    onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                  >
                    <option value="">Select Department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select 
                    value={formData.default_role_id}
                    onChange={(e) => setFormData({ ...formData, default_role_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                  >
                    <option value="">Select Role</option>
                    {roles.map(role => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hire Date *</label>
                  <input 
                    type="date" 
                    value={formData.hire_date}
                    onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent" 
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingEmployeeId(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAddEmployee}
                  disabled={saving || !formData.first_name || !formData.last_name || !formData.employee_no}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium hover:from-[#097509] hover:to-[#005300] disabled:opacity-50"
                >
                  {saving ? 'Saving...' : (editingEmployeeId ? 'Save Changes' : 'Add Employee')}
                </button>
              </div>
            </div>
          </div>
        )}

        {showHistoryModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Role History - {historyEmployeeName}</h2>
                <button onClick={() => setShowHistoryModal(false)} className="p-1 hover:bg-gray-100 rounded">
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              {historyLoading ? (
                <div className="py-8 text-gray-600">Loading...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Role</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Effective From</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Effective To</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {(roleHistory || []).map((h: any) => (
                        <tr key={h.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-900">{(h.role as any)?.name || ''}</td>
                          <td className="px-4 py-3 text-gray-600">{h.effective_from || ''}</td>
                          <td className="px-4 py-3 text-gray-600">{h.effective_to || ''}</td>
                          <td className="px-4 py-3 text-gray-600">{h.note || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end mt-6">
                <button onClick={() => setShowHistoryModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {showAddRoleModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Add New Role</h2>
                <button onClick={() => setShowAddRoleModal(false)} className="p-1 hover:bg-gray-100 rounded">
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role Name *</label>
                  <input
                    type="text"
                    value={roleForm.name}
                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Salary *</label>
                  <input
                    type="number"
                    value={roleForm.base_salary}
                    onChange={(e) => setRoleForm({ ...roleForm, base_salary: e.target.value })}
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={roleForm.description}
                    onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowAddRoleModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  onClick={handleAddRole}
                  disabled={roleSaving || !roleForm.name.trim() || !String(roleForm.base_salary).trim()}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium hover:from-[#097509] hover:to-[#005300] disabled:opacity-50"
                >
                  {roleSaving ? 'Saving...' : 'Add Role'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showAddDepartmentModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Add New Department</h2>
                <button onClick={() => setShowAddDepartmentModal(false)} className="p-1 hover:bg-gray-100 rounded">
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department Name *</label>
                  <input
                    type="text"
                    value={departmentForm.name}
                    onChange={(e) => setDepartmentForm({ ...departmentForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={departmentForm.description}
                    onChange={(e) => setDepartmentForm({ ...departmentForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowAddDepartmentModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  onClick={handleAddDepartment}
                  disabled={departmentSaving || !departmentForm.name.trim()}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium hover:from-[#097509] hover:to-[#005300] disabled:opacity-50"
                >
                  {departmentSaving ? 'Saving...' : 'Add Department'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
