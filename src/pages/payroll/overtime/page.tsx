
import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { exportToExcelStyled } from '../../../utils/exportImportUtils';
import { employeesService, overtimeService } from '../../../services/database';

interface OvertimeRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  position: string;
  date: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  overtimeType: 'regular' | 'night' | 'holiday' | 'sunday';
  hourlyRate: number;
  overtimeRate: number;
  totalAmount: number;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  approvedBy?: string;
  approvedDate?: string;
  reason: string;
  createdAt: string;
}

export default function OvertimePage() {
  const { user } = useAuth();
  const [overtimeRecords, setOvertimeRecords] = useState<OvertimeRecord[]>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; code: string; name: string; department: string; position: string }>>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<OvertimeRecord | null>(null);

  const [formData, setFormData] = useState({
    employeeId: '',
    employeeName: '',
    department: '',
    position: '',
    date: '',
    startTime: '',
    endTime: '',
    overtimeType: 'regular' as OvertimeRecord['overtimeType'],
    hourlyRate: 0,
    reason: ''
  });

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
        console.error('Error loading employees for overtime:', error);
      }
    };

    const loadOvertime = async () => {
      if (!user) return;
      try {
        const data = await overtimeService.getAll(user.id);
        const mapped: OvertimeRecord[] = (data || []).map((r: any) => ({
          id: r.id,
          employeeId: r.employee_id,
          employeeName: r.employee_name,
          department: r.department,
          position: r.position,
          date: r.date,
          startTime: r.start_time,
          endTime: r.end_time,
          totalHours: Number(r.total_hours) || 0,
          overtimeType: r.overtime_type,
          hourlyRate: Number(r.hourly_rate) || 0,
          overtimeRate: Number(r.overtime_rate) || 0,
          totalAmount: Number(r.total_amount) || 0,
          status: r.status,
          approvedBy: r.approved_by || undefined,
          approvedDate: r.approved_date || undefined,
          reason: r.reason,
          createdAt: r.created_at || new Date().toISOString(),
        }));
        setOvertimeRecords(mapped);
      } catch (error) {
        console.error('Error loading overtime records:', error);
      }
    };

    loadEmployees();
    loadOvertime();
  }, [user]);

  const filteredRecords = overtimeRecords.filter(record => {
    const matchesSearch = record.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         record.employeeId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || record.status === filterStatus;
    const matchesType = filterType === 'all' || record.overtimeType === filterType;
    const matchesDepartment = filterDepartment === 'all' || record.department === filterDepartment;
    
    return matchesSearch && matchesStatus && matchesType && matchesDepartment;
  });

  const calculateHours = (startTime: string, endTime: string): number => {
    if (!startTime || !endTime) return 0;
    
    const start = new Date(`2024-01-01T${startTime}:00`);
    let end = new Date(`2024-01-01T${endTime}:00`);
    
    // Si la hora de fin es menor que la de inicio, asumimos que es del día siguiente
    if (end < start) {
      end = new Date(`2024-01-02T${endTime}:00`);
    }
    
    const diffMs = end.getTime() - start.getTime();
    return diffMs / (1000 * 60 * 60);
  };

  const getOvertimeRate = (type: string): number => {
    switch (type) {
      case 'regular': return 1.5;
      case 'night': return 2.0;
      case 'holiday': return 2.5;
      case 'sunday': return 2.0;
      default: return 1.5;
    }
  };

  const calculateAmount = (hours: number, hourlyRate: number, overtimeRate: number): number => {
    return hours * hourlyRate * overtimeRate;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;
    
    const totalHours = calculateHours(formData.startTime, formData.endTime);
    const overtimeRate = getOvertimeRate(formData.overtimeType);
    const totalAmount = calculateAmount(totalHours, formData.hourlyRate, overtimeRate);
    
    const payload: any = {
      employee_id: formData.employeeId,
      employee_name: formData.employeeName,
      department: formData.department,
      position: formData.position,
      date: formData.date,
      start_time: formData.startTime,
      end_time: formData.endTime,
      total_hours: totalHours,
      overtime_type: formData.overtimeType,
      hourly_rate: formData.hourlyRate,
      overtime_rate: overtimeRate,
      total_amount: totalAmount,
      status: editingRecord?.status ?? 'pending',
      approved_by: editingRecord?.approvedBy ?? null,
      approved_date: editingRecord?.approvedDate ?? null,
      reason: formData.reason,
    };

    try {
      if (editingRecord) {
        const updated = await overtimeService.update(editingRecord.id, payload);
        const mapped: OvertimeRecord = {
          id: updated.id,
          employeeId: updated.employee_id,
          employeeName: updated.employee_name,
          department: updated.department,
          position: updated.position,
          date: updated.date,
          startTime: updated.start_time,
          endTime: updated.end_time,
          totalHours: Number(updated.total_hours) || 0,
          overtimeType: updated.overtime_type,
          hourlyRate: Number(updated.hourly_rate) || 0,
          overtimeRate: Number(updated.overtime_rate) || 0,
          totalAmount: Number(updated.total_amount) || 0,
          status: updated.status,
          approvedBy: updated.approved_by || undefined,
          approvedDate: updated.approved_date || undefined,
          reason: updated.reason,
          createdAt: updated.created_at || new Date().toISOString(),
        };
        setOvertimeRecords(prev => prev.map(record => 
          record.id === editingRecord.id ? mapped : record
        ));
      } else {
        const created = await overtimeService.create(user.id, payload);
        const mapped: OvertimeRecord = {
          id: created.id,
          employeeId: created.employee_id,
          employeeName: created.employee_name,
          department: created.department,
          position: created.position,
          date: created.date,
          startTime: created.start_time,
          endTime: created.end_time,
          totalHours: Number(created.total_hours) || 0,
          overtimeType: created.overtime_type,
          hourlyRate: Number(created.hourly_rate) || 0,
          overtimeRate: Number(created.overtime_rate) || 0,
          totalAmount: Number(created.total_amount) || 0,
          status: created.status,
          approvedBy: created.approved_by || undefined,
          approvedDate: created.approved_date || undefined,
          reason: created.reason,
          createdAt: created.created_at || new Date().toISOString(),
        };
        setOvertimeRecords(prev => [...prev, mapped]);
      }

      resetForm();
    } catch (error) {
      console.error('Error saving overtime record:', error);
      alert('Error saving the overtime record.');
    }
  };

  const resetForm = () => {
    setFormData({
      employeeId: '',
      employeeName: '',
      department: '',
      position: '',
      date: '',
      startTime: '',
      endTime: '',
      overtimeType: 'regular',
      hourlyRate: 0,
      reason: ''
    });
    setShowForm(false);
    setEditingRecord(null);
    setSelectedEmployeeId('');
  };

  const handleEdit = (record: OvertimeRecord) => {
    setEditingRecord(record);
    const emp = employees.find(e => e.code === record.employeeId && e.name === record.employeeName);
    setSelectedEmployeeId(emp?.id || '');
    setFormData({
      employeeId: record.employeeId,
      employeeName: record.employeeName,
      department: record.department,
      position: record.position,
      date: record.date,
      startTime: record.startTime,
      endTime: record.endTime,
      overtimeType: record.overtimeType,
      hourlyRate: record.hourlyRate,
      reason: record.reason
    });
    setShowForm(true);
  };

  const updateStatus = async (id: string, status: 'approved' | 'rejected') => {
    const current = overtimeRecords.find(r => r.id === id);
    if (!current) return;

    const approvedBy = status === 'approved' ? 'Sistema' : null;
    const approvedDate = status === 'approved' ? new Date().toISOString().split('T')[0] : null;

    try {
      await overtimeService.update(id, {
        status,
        approved_by: approvedBy,
        approved_date: approvedDate,
      });

      setOvertimeRecords(prev => prev.map(record =>
        record.id === id ? {
          ...record,
          status,
          approvedBy: approvedBy || undefined,
          approvedDate: approvedDate || undefined,
        } : record
      ));
    } catch (error) {
      console.error('Error updating overtime status:', error);
      alert('Error updating the record status.');
    }
  };

  const exportToCSV = async () => {
    const today = new Date().toISOString().split('T')[0];

    const rows = filteredRecords.map(record => ({
      employee: record.employeeName,
      department: record.department,
      date: record.date,
      hours: record.totalHours,
      type:
        record.overtimeType === 'regular' ? 'Regular' :
        record.overtimeType === 'night' ? 'Night' :
        record.overtimeType === 'holiday' ? 'Holiday' : 'Sunday',
      rate: `${record.overtimeRate}x`,
      total: record.totalAmount,
      status:
        record.status === 'pending' ? 'Pending' :
        record.status === 'approved' ? 'Approved' :
        record.status === 'rejected' ? 'Rejected' : 'Paid',
    }));

    if (!rows.length) {
      alert('No overtime records to export.');
      return;
    }

    await exportToExcelStyled(
      rows,
      [
        { key: 'employee', title: 'Employee', width: 26 },
        { key: 'department', title: 'Department', width: 22 },
        { key: 'date', title: 'Date', width: 14 },
        { key: 'hours', title: 'Hours', width: 10, numFmt: '0.0' },
        { key: 'type', title: 'Type', width: 16 },
        { key: 'rate', title: 'Rate', width: 10 },
        { key: 'total', title: 'Total', width: 16, numFmt: '#,##0.00' },
        { key: 'status', title: 'Status', width: 14 },
      ],
      `overtime_${today}`,
      'Overtime'
    );
  };

  const pendingRecords = overtimeRecords.filter(r => r.status === 'pending').length;
  const totalHours = overtimeRecords.reduce((sum, r) => sum + r.totalHours, 0);
  const totalAmount = overtimeRecords.filter(r => r.status === 'approved').reduce((sum, r) => sum + r.totalAmount, 0);
  const departments = [...new Set(overtimeRecords.map(r => r.department))];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Overtime Management</h1>
            <p className="text-gray-600">Manage overtime logging and approvals</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-[#4b5320] text-white px-4 py-2 rounded-lg hover:bg-[#3d431a] transition-colors whitespace-nowrap shadow-sm"
          >
            <i className="ri-add-line mr-2"></i>
            Log Overtime
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-time-line text-[#4b5320] text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Records</p>
                <p className="text-2xl font-bold text-gray-900">{overtimeRecords.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-hourglass-line text-[#4b5320] text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-gray-900">{pendingRecords}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-check-line text-[#4b5320] text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Hours</p>
                <p className="text-2xl font-bold text-gray-900">{totalHours.toFixed(1)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-money-dollar-circle-line text-[#4b5320] text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Approved Total</p>
                <p className="text-2xl font-bold text-gray-900">${totalAmount.toLocaleString()}</p>
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
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent text-sm pr-8"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="paid">Paid</option>
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
                <option value="regular">Regular</option>
                <option value="night">Night</option>
                <option value="holiday">Holiday</option>
                <option value="sunday">Sunday</option>
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

        {/* Overtime Records Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date/Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type/Hours
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Calculation
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
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{record.employeeName}</div>
                        <div className="text-sm text-gray-500">{record.employeeId} - {record.department}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{record.date}</div>
                      <div className="text-sm text-gray-500">{record.startTime} - {record.endTime}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#e6e9d5] text-[#4b5320]">
                          {record.overtimeType === 'regular' ? 'Regular' :
                           record.overtimeType === 'night' ? 'Night' :
                           record.overtimeType === 'holiday' ? 'Holiday' : 'Sunday'}
                        </span>
                        <div className="text-sm text-gray-500 mt-1">{record.totalHours.toFixed(1)} hours</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">${record.totalAmount.toLocaleString()}</div>
                      <div className="text-sm text-gray-500">${record.hourlyRate} × {record.overtimeRate}x</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        record.status === 'approved'
                          ? 'bg-[#e6e9d5] text-[#4b5320]'
                          : record.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : record.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                      }`}>
                        {record.status === 'pending' ? 'Pending' :
                         record.status === 'approved' ? 'Approved' :
                         record.status === 'rejected' ? 'Rejected' : 'Paid'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(record)}
                          className="text-[#4b5320] hover:text-[#3d431a]"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        {record.status === 'pending' && (
                          <>
                            <button
                              onClick={() => updateStatus(record.id, 'approved')}
                              className="text-green-600 hover:text-green-900"
                            >
                              <i className="ri-check-line"></i>
                            </button>
                            <button
                              onClick={() => updateStatus(record.id, 'rejected')}
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
                    {editingRecord ? 'Edit Record' : 'Log Overtime'}
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

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.date}
                        onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Start Time *
                      </label>
                      <input
                        type="time"
                        required
                        value={formData.startTime}
                        onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        End Time *
                      </label>
                      <input
                        type="time"
                        required
                        value={formData.endTime}
                        onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Overtime Type *
                      </label>
                      <select
                        required
                        value={formData.overtimeType}
                        onChange={(e) => setFormData(prev => ({ ...prev, overtimeType: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
                      >
                        <option value="regular">Regular (1.5x)</option>
                        <option value="night">Night (2.0x)</option>
                        <option value="holiday">Holiday (2.5x)</option>
                        <option value="sunday">Sunday (2.0x)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Hourly Rate ($) *
                      </label>
                      <input
                        type="number"
                        required
                        step="0.01"
                        min="0"
                        value={formData.hourlyRate}
                        onChange={(e) => setFormData(prev => ({ ...prev, hourlyRate: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="250.00"
                      />
                    </div>
                  </div>

                  {formData.startTime && formData.endTime && formData.hourlyRate > 0 && (
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-blue-800">Hours:</span>
                          <p className="text-blue-600">{calculateHours(formData.startTime, formData.endTime).toFixed(1)}</p>
                        </div>
                        <div>
                          <span className="font-medium text-blue-800">Multiplier:</span>
                          <p className="text-blue-600">{getOvertimeRate(formData.overtimeType)}x</p>
                        </div>
                        <div>
                          <span className="font-medium text-blue-800">Estimated Amount:</span>
                          <p className="text-blue-600">${calculateAmount(calculateHours(formData.startTime, formData.endTime), formData.hourlyRate, getOvertimeRate(formData.overtimeType)).toFixed(2)}</p>
                        </div>
                      </div>
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
                      placeholder="Describe the overtime reason..."
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
                      {editingRecord ? 'Update' : 'Create'} Record
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
