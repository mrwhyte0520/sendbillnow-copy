import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';

interface Absence {
  id: string;
  employee_id: string;
  absence_type: 'enfermedad' | 'permiso_personal' | 'licencia_maternidad' | 'licencia_paternidad' | 'vacaciones' | 'suspension' | 'otro';
  start_date: string;
  end_date: string;
  days_count: number;
  is_paid: boolean;
  reason: string;
  status: 'pendiente' | 'aprobada' | 'rechazada';
  approved_by?: string;
  notes?: string;
  created_at: string;
}

export default function AbsencesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingAbsence, setEditingAbsence] = useState<Absence | null>(null);

  const [formData, setFormData] = useState({
    employee_id: '',
    absence_type: 'permiso_personal' as Absence['absence_type'],
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    is_paid: true,
    reason: '',
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    try {
      const [absencesData, employeesData] = await Promise.all([
        supabase.from('employee_absences').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('employees').select('id, first_name, last_name, employee_code').eq('user_id', user.id).eq('status', 'active')
      ]);
      if (absencesData.data) setAbsences(absencesData.data);
      if (employeesData.data) setEmployees(employeesData.data);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const calculateDays = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const days = calculateDays(formData.start_date, formData.end_date);
    const absenceData = { ...formData, user_id: user.id, days_count: days, status: 'pendiente' };

    try {
      if (editingAbsence) {
        await supabase.from('employee_absences').update(absenceData).eq('id', editingAbsence.id);
      } else {
        await supabase.from('employee_absences').insert([absenceData]);
      }
      await loadData();
      resetForm();
      alert('Absence saved successfully');
    } catch (error) {
      console.error('Error saving absence:', error);
      alert('Error saving absence');
    }
  };

  const handleEdit = (absence: Absence) => {
    setEditingAbsence(absence);
    setFormData({
      employee_id: absence.employee_id,
      absence_type: absence.absence_type,
      start_date: absence.start_date,
      end_date: absence.end_date,
      is_paid: absence.is_paid,
      reason: absence.reason || '',
      notes: absence.notes || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this absence?')) return;
    try {
      await supabase.from('employee_absences').delete().eq('id', id);
      await loadData();
    } catch (error) {
      console.error('Error deleting absence:', error);
    }
  };

  const changeStatus = async (id: string, newStatus: Absence['status']) => {
    try {
      await supabase.from('employee_absences').update({ status: newStatus, approved_by: user?.id }).eq('id', id);
      await loadData();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      employee_id: '',
      absence_type: 'permiso_personal',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date().toISOString().split('T')[0],
      is_paid: true,
      reason: '',
      notes: ''
    });
    setEditingAbsence(null);
    setShowForm(false);
  };

  const getEmployeeName = (employeeId: string) => {
    const employee = employees.find(e => e.id === employeeId);
    return employee ? `${employee.first_name} ${employee.last_name}` : 'N/A';
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      enfermedad: 'Sickness',
      permiso_personal: 'Personal Leave',
      licencia_maternidad: 'Maternity Leave',
      licencia_paternidad: 'Paternity Leave',
      vacaciones: 'Vacation',
      suspension: 'Suspension',
      otro: 'Other'
    };
    return labels[type] || type;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pendiente: 'bg-[#f1e4c2] text-[#3d451b]',
      aprobada: 'bg-[#dbe8c0] text-[#2f3a1f]',
      rechazada: 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredAbsences = absences.filter(absence =>
    getEmployeeName(absence.employee_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
    absence.reason?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 bg-[#f6f3ea] min-h-screen -mx-4 sm:mx-0 p-4 sm:p-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Absence Log</h1>
            <p className="text-gray-700">Manage employee absences and leaves</p>
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
              New Absence
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-[#dfe5cf] p-4">
          <input
            type="text"
            placeholder="Search by employee or reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-[#dfe5cf]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">End Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredAbsences.map((absence) => (
                  <tr key={absence.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{getEmployeeName(absence.employee_id)}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{getTypeLabel(absence.absence_type)}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{new Date(absence.start_date).toLocaleDateString('en-US')}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{new Date(absence.end_date).toLocaleDateString('en-US')}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{absence.days_count}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{absence.is_paid ? 'Yes' : 'No'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(absence.status)}`}>
                        {absence.status === 'pendiente' ? 'Pending' : absence.status === 'aprobada' ? 'Approved' : 'Rejected'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        {absence.status === 'pendiente' && (
                          <>
                            <button onClick={() => changeStatus(absence.id, 'aprobada')} className="text-[#4b5320] hover:text-[#2f3a1f]" title="Approve">
                              <i className="ri-check-line"></i>
                            </button>
                            <button onClick={() => changeStatus(absence.id, 'rechazada')} className="text-red-600 hover:text-red-800" title="Reject">
                              <i className="ri-close-line"></i>
                            </button>
                          </>
                        )}
                        <button onClick={() => handleEdit(absence)} className="text-[#4b5320] hover:text-[#2f3a1f]" title="Edit">
                          <i className="ri-edit-line"></i>
                        </button>
                        <button onClick={() => handleDelete(absence.id)} className="text-red-600 hover:text-red-800" title="Delete">
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredAbsences.length === 0 && (
                  <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-500">No absences found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-gray-900 mb-4">{editingAbsence ? 'Edit Absence' : 'New Absence'}</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
                    <select value={formData.employee_id} onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent" required>
                      <option value="">Select employee</option>
                      {employees.map(emp => (<option key={emp.id} value={emp.id}>{emp.employee_code} - {emp.first_name} {emp.last_name}</option>))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Absence type *</label>
                    <select value={formData.absence_type} onChange={(e) => setFormData({ ...formData, absence_type: e.target.value as any })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent" required>
                      <option value="enfermedad">Sickness</option>
                      <option value="permiso_personal">Personal Leave</option>
                      <option value="licencia_maternidad">Maternity Leave</option>
                      <option value="licencia_paternidad">Paternity Leave</option>
                      <option value="vacaciones">Vacation</option>
                      <option value="suspension">Suspension</option>
                      <option value="otro">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start date *</label>
                    <input type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End date *</label>
                    <input type="date" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent" required />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center">
                      <input type="checkbox" checked={formData.is_paid} onChange={(e) => setFormData({ ...formData, is_paid: e.target.checked })} className="mr-2 rounded border-gray-300 text-[#4b5320] focus:ring-[#4b5320]" />
                      <span className="text-sm font-medium text-gray-700">Paid absence</span>
                    </label>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                    <textarea value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent" rows={2} required />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Additional notes</label>
                    <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent" rows={2} />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button type="button" onClick={resetForm} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] transition-colors shadow-sm">{editingAbsence ? 'Update' : 'Create'} Absence</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
