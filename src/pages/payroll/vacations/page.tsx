
import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { exportToExcelStyled } from '../../../utils/exportImportUtils';
import { employeesService, vacationsService } from '../../../services/database';

interface VacationRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  position: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  vacationType: 'annual' | 'sick' | 'maternity' | 'paternity' | 'personal' | 'compensatory';
  status: 'pending' | 'approved' | 'rejected' | 'taken';
  reason: string;
  approvedBy?: string;
  approvedDate?: string;
  requestDate: string;
  remainingDays: number;
  paidDays: number;
}

interface EmployeeOption {
  id: string;
  code: string;
  name: string;
  department: string;
  position: string;
}

export default function VacationsPage() {
  const { user } = useAuth();
  const [vacationRequests, setVacationRequests] = useState<VacationRequest[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingRequest, setEditingRequest] = useState<VacationRequest | null>(null);

  const [formData, setFormData] = useState({
    employeeId: '',
    employeeName: '',
    department: '',
    position: '',
    startDate: '',
    endDate: '',
    vacationType: 'annual' as VacationRequest['vacationType'],
    reason: ''
  });

  useEffect(() => {
    const loadEmployees = async () => {
      if (!user) return;
      try {
        const data = await employeesService.getAll(user.id);
        const mapped: EmployeeOption[] = (data || []).map((e: any) => ({
          id: e.id,
          code: e.employee_code || e.identification || '',
          name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
          department: e.departments?.name || '',
          position: e.positions?.title || '',
        }));
        setEmployees(mapped);
      } catch (error) {
        console.error('Error loading employees for vacations:', error);
      }
    };

    const loadRequests = async () => {
      if (!user) return;
      try {
        const data = await vacationsService.getAll(user.id);
        const mapped: VacationRequest[] = (data || []).map((r: any) => ({
          id: r.id,
          employeeId: r.employee_id,
          employeeName: r.employee_name,
          department: r.department,
          position: r.position,
          startDate: r.start_date,
          endDate: r.end_date,
          totalDays: r.total_days,
          vacationType: r.vacation_type,
          status: r.status,
          reason: r.reason,
          approvedBy: r.approved_by || undefined,
          approvedDate: r.approved_date || undefined,
          requestDate: r.request_date,
          remainingDays: r.remaining_days ?? 0,
          paidDays: r.paid_days ?? 0,
        }));
        setVacationRequests(mapped);
      } catch (error) {
        console.error('Error loading vacation requests:', error);
      }
    };

    loadEmployees();
    loadRequests();
  }, [user]);

  // Reactivar automáticamente empleados cuando termina el período de vacaciones
  useEffect(() => {
    if (!user) return;
    if (!vacationRequests.length) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const finished = vacationRequests.filter(r => r.status === 'approved' && r.endDate < todayStr);
    if (!finished.length) return;

    const processFinished = async () => {
      for (const req of finished) {
        try {
          await vacationsService.update(req.id, { status: 'taken' });
          const employee = employees.find(e => e.code === req.employeeId);
          if (employee) {
            await employeesService.setStatus(employee.id, 'active');
          }
        } catch (error) {
          console.error('Error auto-updating finished vacation:', error);
        }
      }

      setVacationRequests(prev => prev.map(r =>
        finished.some(f => f.id === r.id)
          ? { ...r, status: 'taken' }
          : r
      ));
    };

    processFinished();
  }, [user, vacationRequests, employees]);

  const filteredRequests = vacationRequests.filter(request => {
    const matchesSearch = request.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         request.employeeId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || request.status === filterStatus;
    const matchesType = filterType === 'all' || request.vacationType === filterType;
    const matchesDepartment = filterDepartment === 'all' || request.department === filterDepartment;
    
    return matchesSearch && matchesStatus && matchesType && matchesDepartment;
  });

  const calculateDays = (startDate: string, endDate: string): number => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      alert('You must be logged in to manage vacations.');
      return;
    }

    const totalDays = calculateDays(formData.startDate, formData.endDate);

    const payload: any = {
      employee_id: formData.employeeId,
      employee_name: formData.employeeName,
      department: formData.department,
      position: formData.position,
      start_date: formData.startDate,
      end_date: formData.endDate,
      total_days: totalDays,
      vacation_type: formData.vacationType,
      status: editingRequest?.status ?? 'pending',
      reason: formData.reason,
      request_date: editingRequest?.requestDate ?? new Date().toISOString().split('T')[0],
      remaining_days: editingRequest?.remainingDays ?? 20,
      paid_days: editingRequest?.paidDays ?? 0,
      approved_by: editingRequest?.approvedBy ?? null,
      approved_date: editingRequest?.approvedDate ?? null,
    };

    try {
      if (editingRequest) {
        const updated = await vacationsService.update(editingRequest.id, payload);
        setVacationRequests(prev => prev.map(request =>
          request.id === editingRequest.id
            ? {
                id: updated.id,
                employeeId: updated.employee_id,
                employeeName: updated.employee_name,
                department: updated.department,
                position: updated.position,
                startDate: updated.start_date,
                endDate: updated.end_date,
                totalDays: updated.total_days,
                vacationType: updated.vacation_type,
                status: updated.status,
                reason: updated.reason,
                approvedBy: updated.approved_by || undefined,
                approvedDate: updated.approved_date || undefined,
                requestDate: updated.request_date,
                remainingDays: updated.remaining_days ?? 0,
                paidDays: updated.paid_days ?? 0,
              }
            : request
        ));
      } else {
        const created = await vacationsService.create(user.id, payload);
        const newRequest: VacationRequest = {
          id: created.id,
          employeeId: created.employee_id,
          employeeName: created.employee_name,
          department: created.department,
          position: created.position,
          startDate: created.start_date,
          endDate: created.end_date,
          totalDays: created.total_days,
          vacationType: created.vacation_type,
          status: created.status,
          reason: created.reason,
          approvedBy: created.approved_by || undefined,
          approvedDate: created.approved_date || undefined,
          requestDate: created.request_date,
          remainingDays: created.remaining_days ?? 0,
          paidDays: created.paid_days ?? 0,
        };
        setVacationRequests(prev => [...prev, newRequest]);
      }

      resetForm();
    } catch (error) {
      console.error('Error saving vacation request:', error);
      alert('Error saving the vacation request.');
    }
  };

  const resetForm = () => {
    setFormData({
      employeeId: '',
      employeeName: '',
      department: '',
      position: '',
      startDate: '',
      endDate: '',
      vacationType: 'annual',
      reason: ''
    });
    setSelectedEmployeeId('');
    setShowForm(false);
    setEditingRequest(null);
  };

  const handleEdit = (request: VacationRequest) => {
    setEditingRequest(request);
    const emp = employees.find(e => e.code === request.employeeId && e.name === request.employeeName);
    setSelectedEmployeeId(emp?.id || '');
    setFormData({
      employeeId: request.employeeId,
      employeeName: request.employeeName,
      department: request.department,
      position: request.position,
      startDate: request.startDate,
      endDate: request.endDate,
      vacationType: request.vacationType,
      reason: request.reason
    });
    setShowForm(true);
  };

  const updateStatus = async (id: string, status: 'approved' | 'rejected') => {
    const current = vacationRequests.find(r => r.id === id);
    if (!current) return;

    const approvedBy = status === 'approved' ? 'Sistema' : null;
    const approvedDate = status === 'approved' ? new Date().toISOString().split('T')[0] : null;
    const paidDays = status === 'approved' ? current.totalDays : 0;

    try {
      await vacationsService.update(id, {
        status,
        approved_by: approvedBy,
        approved_date: approvedDate,
        paid_days: paidDays,
      });

      // Si se aprueba la solicitud, marcar al empleado como inactivo
      if (status === 'approved') {
        const employee = employees.find(e => e.code === current.employeeId);
        if (employee) {
          await employeesService.setStatus(employee.id, 'inactive');
        }
      }

      setVacationRequests(prev => prev.map(request =>
        request.id === id
          ? {
              ...request,
              status,
              approvedBy: approvedBy || undefined,
              approvedDate: approvedDate || undefined,
              paidDays,
            }
          : request
      ));
    } catch (error) {
      console.error('Error updating vacation status:', error);
      alert('Error updating the request status.');
    }
  };

  const exportToCSV = async () => {
    const today = new Date().toISOString().split('T')[0];

    const rows = filteredRequests.map(request => ({
      employee: request.employeeName,
      department: request.department,
      type:
        request.vacationType === 'annual' ? 'Annual' :
        request.vacationType === 'sick' ? 'Sick Leave' :
        request.vacationType === 'maternity' ? 'Maternity Leave' :
        request.vacationType === 'paternity' ? 'Paternity Leave' :
        request.vacationType === 'personal' ? 'Personal Leave' : 'Compensatory Days',
      startDate: request.startDate,
      endDate: request.endDate,
      totalDays: request.totalDays,
      status:
        request.status === 'pending' ? 'Pending' :
        request.status === 'approved' ? 'Approved' :
        request.status === 'rejected' ? 'Rejected' : 'Taken',
      reason: request.reason,
    }));

    if (!rows.length) {
      alert('No requests to export.');
      return;
    }

    await exportToExcelStyled(
      rows,
      [
        { key: 'employee', title: 'Employee', width: 26 },
        { key: 'department', title: 'Department', width: 22 },
        { key: 'type', title: 'Type', width: 18 },
        { key: 'startDate', title: 'Start Date', width: 16 },
        { key: 'endDate', title: 'End Date', width: 16 },
        { key: 'totalDays', title: 'Days', width: 10 },
        { key: 'status', title: 'Status', width: 14 },
        { key: 'reason', title: 'Reason', width: 40 },
      ],
      `vacation_requests_${today}`,
      'Vacation Requests'
    );
  };

  const pendingRequests = vacationRequests.filter(r => r.status === 'pending').length;
  const approvedRequests = vacationRequests.filter(r => r.status === 'approved').length;
  const totalDaysRequested = vacationRequests.reduce((sum, r) => sum + r.totalDays, 0);
  const departments = [...new Set(vacationRequests.map(r => r.department))];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Vacation Management</h1>
            <p className="text-gray-600">Manage vacation and leave requests</p>
          </div>
          <button
            onClick={() => {
              setEditingRequest(null);
              setFormData({
                employeeId: '',
                employeeName: '',
                department: '',
                position: '',
                vacationType: 'annual',
                startDate: '',
                endDate: '',
                reason: ''
              });
              setShowForm(true);
            }}
            className="bg-[#4b5320] text-white px-4 py-2 rounded-lg hover:bg-[#3d431a] transition-colors whitespace-nowrap shadow-sm"
          >
            <i className="ri-add-line mr-2"></i>
            New Request
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-calendar-line text-[#4b5320] text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Requests</p>
                <p className="text-2xl font-bold text-gray-900">{vacationRequests.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-time-line text-[#4b5320] text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-gray-900">{pendingRequests}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-check-line text-[#4b5320] text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Approved</p>
                <p className="text-2xl font-bold text-gray-900">{approvedRequests}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-calendar-event-line text-[#4b5320] text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Days</p>
                <p className="text-2xl font-bold text-gray-900">{totalDaysRequested}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search <span className="text-red-500">*</span></label>
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  placeholder="Search employee..."
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
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="taken">Taken</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm pr-8"
              >
                <option value="all">All</option>
                <option value="annual">Annual</option>
                <option value="sick">Sick Leave</option>
                <option value="maternity">Maternity Leave</option>
                <option value="paternity">Paternity Leave</option>
                <option value="personal">Personal Leave</option>
                <option value="compensatory">Compensatory Days</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm pr-8"
              >
                <option value="all">All</option>
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
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

        {/* Vacation Requests Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dates
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Days
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
                {filteredRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{request.employeeName}</div>
                        <div className="text-sm text-gray-500">{request.employeeId} - {request.department}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        request.vacationType === 'annual' ? 'bg-blue-100 text-blue-800' :
                        request.vacationType === 'sick' ? 'bg-red-100 text-red-800' :
                        request.vacationType === 'maternity' ? 'bg-pink-100 text-pink-800' :
                        request.vacationType === 'paternity' ? 'bg-indigo-100 text-indigo-800' :
                        request.vacationType === 'personal' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {request.vacationType === 'annual' ? 'Annual' :
                         request.vacationType === 'sick' ? 'Sick Leave' :
                         request.vacationType === 'maternity' ? 'Maternity Leave' :
                         request.vacationType === 'paternity' ? 'Paternity Leave' :
                         request.vacationType === 'personal' ? 'Personal Leave' : 'Compensatory Days'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>{request.startDate}</div>
                      <div className="text-gray-500">to {request.endDate}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="font-medium">{request.totalDays} days</div>
                      <div className="text-gray-500">Paid: {request.paidDays}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        request.status === 'approved' ? 'bg-green-100 text-green-800' :
                        request.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {request.status === 'pending' ? 'Pending' :
                         request.status === 'approved' ? 'Approved' :
                         request.status === 'rejected' ? 'Rejected' : 'Taken'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(request)}
                          className="text-[#4b5320] hover:text-[#3d431a]"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        {request.status === 'pending' && (
                          <>
                            <button
                              onClick={() => updateStatus(request.id, 'approved')}
                              className="text-green-600 hover:text-green-900"
                            >
                              <i className="ri-check-line"></i>
                            </button>
                            <button
                              onClick={() => updateStatus(request.id, 'rejected')}
                              className="text-red-600 hover:text-red-900"
                            >
                              <i className="ri-close-line"></i>
                            </button>
                          </>
                        )}
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
                    {editingRequest ? 'Edit Request' : 'New Vacation Request'}
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Employee ID
                      </label>
                      <input
                        type="text"
                        value={formData.employeeId}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                        placeholder="EMP001"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Department
                      </label>
                      <input
                        type="text"
                        value={formData.department}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                        placeholder="Department"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Position
                      </label>
                      <input
                        type="text"
                        value={formData.position}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                        placeholder="Position"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Vacation Type *
                    </label>
                    <select
                      required
                      value={formData.vacationType}
                      onChange={(e) => setFormData(prev => ({ ...prev, vacationType: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
                    >
                      <option value="annual">Annual Vacation</option>
                      <option value="sick">Sick Leave</option>
                      <option value="maternity">Maternity Leave</option>
                      <option value="paternity">Paternity Leave</option>
                      <option value="personal">Personal Leave</option>
                      <option value="compensatory">Compensatory Days</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Start Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.startDate}
                        onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        End Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.endDate}
                        onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  {formData.startDate && formData.endDate && (
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <strong>Total requested days:</strong> {calculateDays(formData.startDate, formData.endDate)} days
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Reason *
                    </label>
                    <textarea
                      required
                      value={formData.reason}
                      onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Describe the request reason..."
                    />
                  </div>

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
                      {editingRequest ? 'Update' : 'Create'} Request
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
