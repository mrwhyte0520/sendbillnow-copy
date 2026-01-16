import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { employeesService, rolesService } from '../../../services/contador/staff.service';
import type { Role } from '../../../services/contador/staff.service';

interface EmployeeDisplay {
  id: string;
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
  const [activeTab, setActiveTab] = useState<'employees' | 'attendance' | 'performance'>('employees');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [employees, setEmployees] = useState<EmployeeDisplay[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    employee_no: '',
    email: '',
    phone: '',
    hire_date: new Date().toISOString().split('T')[0],
    default_role_id: '',
  });

  const [roleForm, setRoleForm] = useState({
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
      const [emps, rls] = await Promise.all([
        employeesService.list(user.id),
        rolesService.list(user.id),
      ]);

      // Mapear empleados al formato de display
      const mapped: EmployeeDisplay[] = emps.map(emp => ({
        id: emp.id,
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
    } catch (error) {
      console.error('Error loading staff data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRole = async () => {
    if (!user?.id || !roleForm.name.trim()) return;
    setRoleSaving(true);
    try {
      await rolesService.create({
        user_id: user.id,
        name: roleForm.name.trim(),
        description: roleForm.description.trim() ? roleForm.description.trim() : null,
      });

      const rls = await rolesService.list(user.id);
      setRoles(rls);
      setShowAddRoleModal(false);
      setRoleForm({ name: '', description: '' });
    } catch (error) {
      console.error('Error adding role:', error);
      alert('Error adding role');
    } finally {
      setRoleSaving(false);
    }
  };

  const handleAddEmployee = async () => {
    if (!user?.id || !formData.first_name || !formData.last_name || !formData.employee_no) return;
    setSaving(true);
    try {
      await employeesService.create({
        user_id: user.id,
        first_name: formData.first_name,
        last_name: formData.last_name,
        employee_no: formData.employee_no,
        email: formData.email || null,
        phone: formData.phone || null,
        hire_date: formData.hire_date,
        default_role_id: formData.default_role_id || null,
      });
      setShowAddModal(false);
      setFormData({
        first_name: '',
        last_name: '',
        employee_no: '',
        email: '',
        phone: '',
        hire_date: new Date().toISOString().split('T')[0],
        default_role_id: '',
      });
      await loadData();
    } catch (error) {
      console.error('Error adding employee:', error);
      alert('Error adding employee');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (empId: string, currentStatus: string) => {
    try {
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

  const filteredEmployees = employees.filter(emp => 
    filterStatus === 'all' ? true : emp.status === filterStatus
  );

  const stats = {
    total: employees.length,
    active: employees.filter(e => e.status === 'active').length,
    inactive: employees.filter(e => e.status === 'inactive').length,
    avgAttendance: Math.round(employees.filter(e => e.status === 'active').reduce((acc, e) => acc + e.attendance, 0) / employees.filter(e => e.status === 'active').length),
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <i className="ri-team-line text-xl text-blue-600"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Employees</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <i className="ri-user-follow-line text-xl text-green-600"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Active</p>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <i className="ri-user-unfollow-line text-xl text-red-600"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Inactive</p>
                <p className="text-2xl font-bold text-red-600">{stats.inactive}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <i className="ri-calendar-check-line text-xl text-purple-600"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Avg. Attendance</p>
                <p className="text-2xl font-bold text-purple-600">{stats.avgAttendance}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200">
            <div className="flex">
              {[
                { id: 'employees', label: 'Employee List', icon: 'ri-user-line' },
                { id: 'attendance', label: 'Time & Attendance', icon: 'ri-time-line' },
                { id: 'performance', label: 'Performance', icon: 'ri-bar-chart-line' },
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
              <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
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
                        <td className="px-4 py-3 text-gray-600">{emp.department}</td>
                        <td className="px-4 py-3 text-gray-600">{emp.hireDate}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            emp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {emp.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button className="p-1 hover:bg-gray-100 rounded" title="Edit">
                              <i className="ri-edit-line text-gray-500"></i>
                            </button>
                            <button className="p-1 hover:bg-gray-100 rounded" title="View History">
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

            {/* Attendance Tab */}
            {activeTab === 'attendance' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Employee</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Hours Worked</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Attendance %</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredEmployees.filter(e => e.status === 'active').map((emp) => (
                      <tr key={emp.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                        <td className="px-4 py-3 text-gray-600">{emp.hoursWorked} hrs</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full ${emp.attendance >= 95 ? 'bg-green-500' : emp.attendance >= 85 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{ width: `${emp.attendance}%` }}
                              ></div>
                            </div>
                            <span className="text-sm text-gray-600">{emp.attendance}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            emp.attendance >= 95 ? 'bg-green-100 text-green-700' : emp.attendance >= 85 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {emp.attendance >= 95 ? 'Excellent' : emp.attendance >= 85 ? 'Good' : 'Needs Improvement'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Performance Tab */}
            {activeTab === 'performance' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredEmployees.filter(e => e.status === 'active').map((emp) => (
                  <div key={emp.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#008000]/10 rounded-full flex items-center justify-center">
                          <span className="text-lg font-medium text-[#008000]">{emp.name.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{emp.name}</p>
                          <p className="text-sm text-gray-500">{emp.position}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        emp.attendance >= 95 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {emp.attendance >= 95 ? 'Top Performer' : 'On Track'}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Attendance</span>
                        <span className="font-medium">{emp.attendance}%</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Hours This Month</span>
                        <span className="font-medium">{emp.hoursWorked} hrs</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Add Employee Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Add New Employee</h2>
                <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-gray-100 rounded">
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
                <button onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button 
                  onClick={handleAddEmployee}
                  disabled={saving || !formData.first_name || !formData.last_name || !formData.employee_no}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium hover:from-[#097509] hover:to-[#005300] disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Add Employee'}
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
                  disabled={roleSaving || !roleForm.name.trim()}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium hover:from-[#097509] hover:to-[#005300] disabled:opacity-50"
                >
                  {roleSaving ? 'Saving...' : 'Add Role'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
