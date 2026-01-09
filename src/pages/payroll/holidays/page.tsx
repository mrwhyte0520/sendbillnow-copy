import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { exportToExcelStyled } from '../../../utils/exportImportUtils';
import { holidaysService } from '../../../services/database';

interface Holiday {
  id: string;
  name: string;
  date: string;
  type: 'nacional' | 'religioso' | 'local' | 'empresa';
  isPaid: boolean;
  multiplier: number;
  description: string;
  isRecurring: boolean;
  status: 'activo' | 'inactivo';
  createdAt: string;
}

export default function HolidaysPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [showForm, setShowForm] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    date: '',
    type: 'nacional' as Holiday['type'],
    isPaid: true,
    multiplier: 2.0,
    description: '',
    isRecurring: true
  });

  useEffect(() => {
    const loadHolidays = async () => {
      if (!user) return;
      try {
        const data = await holidaysService.getAll(user.id);
        const mapped: Holiday[] = (data || []).map((h: any) => ({
          id: h.id,
          name: h.name,
          date: h.date,
          type: h.type,
          isPaid: !!h.is_paid,
          multiplier: Number(h.multiplier) || 1,
          description: h.description || '',
          isRecurring: !!h.is_recurring,
          status: h.status as 'activo' | 'inactivo',
          createdAt: h.created_at || new Date().toISOString(),
        }));
        setHolidays(mapped);
      } catch (error) {
        console.error('Error loading holidays:', error);
      }
    };

    loadHolidays();
  }, [user]);

  const filteredHolidays = holidays.filter(holiday => {
    const matchesSearch = holiday.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         holiday.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'todos' || holiday.type === typeFilter;
    const matchesStatus = statusFilter === 'todos' || holiday.status === statusFilter;
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;
    
    const payload: any = {
      name: formData.name,
      date: formData.date,
      type: formData.type,
      is_paid: formData.isPaid,
      multiplier: formData.multiplier,
      description: formData.description,
      is_recurring: formData.isRecurring,
      status: editingHoliday?.status ?? 'activo',
    };

    try {
      if (editingHoliday) {
        const updated = await holidaysService.update(editingHoliday.id, payload);
        const mapped: Holiday = {
          id: updated.id,
          name: updated.name,
          date: updated.date,
          type: updated.type,
          isPaid: !!updated.is_paid,
          multiplier: Number(updated.multiplier) || 1,
          description: updated.description || '',
          isRecurring: !!updated.is_recurring,
          status: updated.status as 'activo' | 'inactivo',
          createdAt: updated.created_at || new Date().toISOString(),
        };
        setHolidays(prev => prev.map(h => h.id === editingHoliday.id ? mapped : h));
      } else {
        const created = await holidaysService.create(user.id, payload);
        const mapped: Holiday = {
          id: created.id,
          name: created.name,
          date: created.date,
          type: created.type,
          isPaid: !!created.is_paid,
          multiplier: Number(created.multiplier) || 1,
          description: created.description || '',
          isRecurring: !!created.is_recurring,
          status: created.status as 'activo' | 'inactivo',
          createdAt: created.created_at || new Date().toISOString(),
        };
        setHolidays(prev => [...prev, mapped]);
      }

      resetForm();
    } catch (error) {
      console.error('Error saving holiday:', error);
      alert('Error saving the holiday.');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      date: '',
      type: 'nacional',
      isPaid: true,
      multiplier: 2.0,
      description: '',
      isRecurring: true
    });
    setEditingHoliday(null);
    setShowForm(false);
  };

  const handleEdit = (holiday: Holiday) => {
    setFormData({
      name: holiday.name,
      date: holiday.date,
      type: holiday.type,
      isPaid: holiday.isPaid,
      multiplier: holiday.multiplier,
      description: holiday.description,
      isRecurring: holiday.isRecurring
    });
    setEditingHoliday(holiday);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this holiday?')) return;

    try {
      await holidaysService.delete(id);
      setHolidays(prev => prev.filter(holiday => holiday.id !== id));
    } catch (error) {
      console.error('Error deleting holiday:', error);
      alert('Error deleting the holiday.');
    }
  };

  const toggleStatus = async (id: string) => {
    const current = holidays.find(h => h.id === id);
    if (!current) return;

    const newStatus: 'activo' | 'inactivo' = current.status === 'activo' ? 'inactivo' : 'activo';

    try {
      await holidaysService.update(id, { status: newStatus });
      setHolidays(prev => prev.map(holiday => 
        holiday.id === id 
          ? { ...holiday, status: newStatus }
          : holiday
      ));
    } catch (error) {
      console.error('Error updating holiday status:', error);
      alert('Error updating the holiday status.');
    }
  };

  const exportToCSV = async () => {
    const today = new Date().toISOString().split('T')[0];

    const rows = filteredHolidays.map(holiday => ({
      name: holiday.name,
      date: holiday.date,
      type: getTypeLabel(holiday.type),
      isPaid: holiday.isPaid ? 'Yes' : 'No',
      multiplier: holiday.multiplier,
      description: holiday.description,
      isRecurring: holiday.isRecurring ? 'Yes' : 'No',
      status: holiday.status === 'activo' ? 'Active' : 'Inactive',
    }));

    if (!rows.length) {
      alert('No holidays to export.');
      return;
    }

    await exportToExcelStyled(
      rows,
      [
        { key: 'name', title: 'Holiday', width: 24 },
        { key: 'date', title: 'Date', width: 18 },
        { key: 'type', title: 'Type', width: 16 },
        { key: 'isPaid', title: 'Paid', width: 10 },
        { key: 'multiplier', title: 'Multiplier', width: 14, numFmt: '0.0' },
        { key: 'description', title: 'Description', width: 40 },
        { key: 'isRecurring', title: 'Recurring', width: 12 },
        { key: 'status', title: 'Status', width: 12 },
      ],
      `holidays_${today}`,
      'Holidays'
    );
  };

  const getTypeLabel = (type: Holiday['type']) => {
    switch (type) {
      case 'nacional': return 'National';
      case 'religioso': return 'Religious';
      case 'local': return 'Local';
      case 'empresa': return 'Company';
      default: return type;
    }
  };

  const stats = {
    total: holidays.length,
    nacional: holidays.filter(h => h.type === 'nacional').length,
    religioso: holidays.filter(h => h.type === 'religioso').length,
    empresa: holidays.filter(h => h.type === 'empresa').length,
    pagados: holidays.filter(h => h.isPaid).length
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Holidays</h1>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/payroll')}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
            >
              <i className="ri-home-line"></i>
              Back to Home
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d431a] transition-colors flex items-center gap-2 shadow-sm"
            >
              <i className="ri-add-line"></i>
              New Holiday
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-calendar-line text-xl text-[#4b5320]"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Holidays</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-flag-line text-xl text-[#4b5320]"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">National</p>
                <p className="text-2xl font-bold text-gray-900">{stats.nacional}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-church-line text-xl text-[#4b5320]"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Religious</p>
                <p className="text-2xl font-bold text-gray-900">{stats.religioso}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-building-line text-xl text-[#4b5320]"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Company</p>
                <p className="text-2xl font-bold text-gray-900">{stats.empresa}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-[#e6e9d5] rounded-lg">
                <i className="ri-money-dollar-circle-line text-xl text-[#4b5320]"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Paid</p>
                <p className="text-2xl font-bold text-gray-900">{stats.pagados}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  placeholder="Search holidays..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <select
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="todos">All types</option>
                <option value="nacional">National</option>
                <option value="religioso">Religious</option>
                <option value="local">Local</option>
                <option value="empresa">Company</option>
              </select>

              <select
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="todos">All statuses</option>
                <option value="activo">Active</option>
                <option value="inactivo">Inactive</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={exportToCSV}
                className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d431a] transition-colors whitespace-nowrap shadow-sm"
              >
                <i className="ri-download-line mr-2"></i>
                Export
              </button>
            </div>
          </div>
        </div>

        {/* Form */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingHoliday ? 'Edit Holiday' : 'New Holiday'}
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Holiday Name *
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date *
                    </label>
                    <input
                      type="date"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Type *
                    </label>
                    <select
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as Holiday['type'] })}
                    >
                      <option value="nacional">National</option>
                      <option value="religioso">Religious</option>
                      <option value="local">Local</option>
                      <option value="empresa">Company</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Pay Multiplier
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="3"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={formData.multiplier}
                      onChange={(e) => setFormData({ ...formData, multiplier: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="flex gap-6">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={formData.isPaid}
                      onChange={(e) => setFormData({ ...formData, isPaid: e.target.checked })}
                    />
                    <span className="ml-2 text-sm text-gray-700">Paid day</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={formData.isRecurring}
                      onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
                    />
                    <span className="ml-2 text-sm text-gray-700">Repeats annually</span>
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d431a] transition-colors shadow-sm"
                  >
                    {editingHoliday ? 'Update' : 'Create'} Holiday
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Holidays List */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Holiday
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Multiplier
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
                {filteredHolidays.map((holiday) => (
                  <tr key={holiday.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{holiday.name}</div>
                        <div className="text-sm text-gray-500">{holiday.description}</div>
                        <div className="flex items-center mt-1 gap-2">
                          {holiday.isPaid && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <i className="ri-money-dollar-circle-line mr-1"></i>
                              Paid
                            </span>
                          )}
                          {holiday.isRecurring && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              <i className="ri-repeat-line mr-1"></i>
                              Recurring
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {holiday.date && new Date(holiday.date).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#e6e9d5] text-[#4b5320]">
                        {getTypeLabel(holiday.type)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{holiday.multiplier}x</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        holiday.status === 'activo' 
                          ? 'bg-[#e6e9d5] text-[#4b5320]' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {holiday.status === 'activo' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(holiday)}
                          className="text-[#4b5320] hover:text-[#3d431a]"
                          title="Edit"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => toggleStatus(holiday.id)}
                          className={`${holiday.status === 'activo' ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}`}
                          title={holiday.status === 'activo' ? 'Deactivate' : 'Activate'}
                        >
                          <i className={`${holiday.status === 'activo' ? 'ri-pause-circle-line' : 'ri-play-circle-line'}`}></i>
                        </button>
                        <button
                          onClick={() => handleDelete(holiday.id)}
                          className="text-red-600 hover:text-red-900"
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

          {filteredHolidays.length === 0 && (
            <div className="text-center py-12">
              <i className="ri-calendar-line text-4xl text-gray-400 mb-4"></i>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No holidays</h3>
              <p className="text-gray-500 mb-4">No holidays found with the current filters.</p>
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d431a] transition-colors"
              >
                Create First Holiday
              </button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
