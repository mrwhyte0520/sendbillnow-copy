
import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { exportToExcelStyled } from '../../../utils/exportImportUtils';
import { useAuth } from '../../../hooks/useAuth';
import { employeeTypesService } from '../../../services/database';

interface EmployeeType {
  id: string;
  name: string;
  description: string;
  benefits: string[];
  workingHours: number;
  overtimeEligible: boolean;
  vacationDays: number;
  status: 'active' | 'inactive';
  createdAt: string;
}

export default function EmployeeTypesPage() {
  const { user } = useAuth();
  const [employeeTypes, setEmployeeTypes] = useState<EmployeeType[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingType, setEditingType] = useState<EmployeeType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    benefits: [] as string[],
    workingHours: 8,
    overtimeEligible: true,
    vacationDays: 14,
    status: 'active' as 'active' | 'inactive'
  });
  const [newBenefit, setNewBenefit] = useState('');

  useEffect(() => {
    const loadTypes = async () => {
      if (!user) return;
      try {
        const data = await employeeTypesService.getAll(user.id);
        const mapped: EmployeeType[] = (data || []).map((t: any) => ({
          id: t.id,
          name: t.name || '',
          description: t.description || '',
          benefits: Array.isArray(t.benefits)
            ? t.benefits
            : (t.benefits || '').toString().split(',').map((b: string) => b.trim()).filter(Boolean),
          workingHours: Number(t.working_hours) || 0,
          overtimeEligible: !!t.overtime_eligible,
          vacationDays: Number(t.vacation_days) || 0,
          status: (t.status as 'active' | 'inactive') || 'active',
          createdAt: (t.created_at || '').split('T')[0] || new Date().toISOString().split('T')[0],
        }));
        setEmployeeTypes(mapped);
      } catch (error) {
        console.error('Error loading employee types:', error);
      }
    };

    loadTypes();
  }, [user]);

  const filteredTypes = employeeTypes.filter(type => {
    const matchesSearch = type.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         type.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || type.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      alert('Debe iniciar sesión para gestionar tipos de empleados.');
      return;
    }

    const payload = {
      name: formData.name,
      description: formData.description,
      benefits: formData.benefits,
      working_hours: formData.workingHours,
      overtime_eligible: formData.overtimeEligible,
      vacation_days: formData.vacationDays,
      status: formData.status,
    };

    try {
      if (editingType) {
        const updated = await employeeTypesService.update(editingType.id, payload);
        setEmployeeTypes(prev => prev.map(type =>
          type.id === editingType.id
            ? {
                id: updated.id,
                name: updated.name || '',
                description: updated.description || '',
                benefits: Array.isArray(updated.benefits)
                  ? updated.benefits
                  : (updated.benefits || '').toString().split(',').map((b: string) => b.trim()).filter(Boolean),
                workingHours: Number(updated.working_hours) || 0,
                overtimeEligible: !!updated.overtime_eligible,
                vacationDays: Number(updated.vacation_days) || 0,
                status: (updated.status as 'active' | 'inactive') || 'active',
                createdAt: (updated.created_at || '').split('T')[0] || editingType.createdAt,
              }
            : type
        ));
      } else {
        const created = await employeeTypesService.create(user.id, payload);
        const newType: EmployeeType = {
          id: created.id,
          name: created.name || '',
          description: created.description || '',
          benefits: Array.isArray(created.benefits)
            ? created.benefits
            : (created.benefits || '').toString().split(',').map((b: string) => b.trim()).filter(Boolean),
          workingHours: Number(created.working_hours) || 0,
          overtimeEligible: !!created.overtime_eligible,
          vacationDays: Number(created.vacation_days) || 0,
          status: (created.status as 'active' | 'inactive') || 'active',
          createdAt: (created.created_at || '').split('T')[0] || new Date().toISOString().split('T')[0],
        };
        setEmployeeTypes(prev => [...prev, newType]);
      }

      resetForm();
    } catch (error) {
      console.error('Error saving employee type:', error);
      alert('Error al guardar el tipo de empleado');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      benefits: [],
      workingHours: 8,
      overtimeEligible: true,
      vacationDays: 14,
      status: 'active'
    });
    setNewBenefit('');
    setEditingType(null);
    setShowForm(false);
  };

  const handleEdit = (type: EmployeeType) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      description: type.description,
      benefits: [...type.benefits],
      workingHours: type.workingHours,
      overtimeEligible: type.overtimeEligible,
      vacationDays: type.vacationDays,
      status: type.status
    });
    setNewBenefit('');
    setShowForm(true);
  };

  const addBenefit = () => {
    if (newBenefit.trim()) {
      setFormData(prev => ({
        ...prev,
        benefits: [...prev.benefits, newBenefit.trim()]
      }));
      setNewBenefit('');
    }
  };

  const removeBenefit = (index: number) => {
    setFormData(prev => ({
      ...prev,
      benefits: prev.benefits.filter((_, i) => i !== index)
    }));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este tipo de empleado?')) return;

    try {
      await employeeTypesService.delete(id);
      setEmployeeTypes(prev => prev.filter(type => type.id !== id));
    } catch (error) {
      console.error('Error deleting employee type:', error);
      alert('Error al eliminar el tipo de empleado');
    }
  };

  const toggleStatus = async (id: string) => {
    const current = employeeTypes.find(t => t.id === id);
    if (!current) return;
    const newStatus = current.status === 'active' ? 'inactive' : 'active';

    try {
      await employeeTypesService.update(id, { status: newStatus });
      setEmployeeTypes(prev => prev.map(type => 
        type.id === id 
          ? { ...type, status: newStatus }
          : type
      ));
    } catch (error) {
      console.error('Error toggling employee type status:', error);
      alert('Error al cambiar el estado del tipo de empleado');
    }
  };

  const downloadExcel = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const rows = filteredTypes.map(type => ({
        name: type.name,
        description: type.description,
        workingHours: type.workingHours,
        overtime: type.overtimeEligible ? 'Sí' : 'No',
        vacationDays: type.vacationDays,
        benefits: type.benefits.join(', '),
        status: type.status === 'active' ? 'Activo' : 'Inactivo',
        createdAt: type.createdAt,
      }));
      await exportToExcelStyled(
        rows,
        [
          { key: 'name', title: 'Nombre', width: 22 },
          { key: 'description', title: 'Descripción', width: 40 },
          { key: 'workingHours', title: 'Horas Trabajo/Día', width: 18 },
          { key: 'overtime', title: 'Horas Extras', width: 14 },
          { key: 'vacationDays', title: 'Vacaciones/Año', width: 16 },
          { key: 'benefits', title: 'Beneficios', width: 36 },
          { key: 'status', title: 'Estado', width: 12 },
          { key: 'createdAt', title: 'Creado', width: 14 },
        ],
        `tipos_empleados_${today}`,
        'Tipos de Empleados'
      );
    } catch (error) {
      console.error('Error exporting employee types:', error);
      alert('Error al exportar a Excel');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tipos de Empleados</h1>
            <p className="text-gray-600">Gestiona los diferentes tipos de empleados y sus características</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={downloadExcel}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <i className="ri-download-line"></i>
              Exportar Excel
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <i className="ri-add-line"></i>
              Nuevo Tipo
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Buscar
              </label>
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por nombre o descripción..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Estado
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos los estados</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Tipos</p>
                <p className="text-2xl font-bold text-gray-900">{employeeTypes.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <i className="ri-team-line text-blue-600 text-xl"></i>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Activos</p>
                <p className="text-2xl font-bold text-green-600">
                  {employeeTypes.filter(t => t.status === 'active').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <i className="ri-check-line text-green-600 text-xl"></i>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Con Horas Extras</p>
                <p className="text-2xl font-bold text-orange-600">
                  {employeeTypes.filter(t => t.overtimeEligible).length}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <i className="ri-time-line text-orange-600 text-xl"></i>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Promedio Vacaciones</p>
                <p className="text-2xl font-bold text-purple-600">
                  {Math.round(employeeTypes.reduce((sum, t) => sum + t.vacationDays, 0) / employeeTypes.length)} días
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <i className="ri-calendar-line text-purple-600 text-xl"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo de Empleado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Horas de Trabajo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Horas Extras
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vacaciones
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTypes.map((type) => (
                  <tr key={type.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{type.name}</div>
                        <div className="text-sm text-gray-500">{type.description}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          Beneficios: {type.benefits.join(', ')}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{type.workingHours} horas/día</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        type.overtimeEligible 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {type.overtimeEligible ? 'Sí' : 'No'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{type.vacationDays} días/año</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        type.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {type.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(type)}
                          className="text-blue-600 hover:text-blue-900 transition-colors"
                          title="Editar"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => toggleStatus(type.id)}
                          className={`transition-colors ${
                            type.status === 'active' 
                              ? 'text-red-600 hover:text-red-900' 
                              : 'text-green-600 hover:text-green-900'
                          }`}
                          title={type.status === 'active' ? 'Desactivar' : 'Activar'}
                        >
                          <i className={type.status === 'active' ? 'ri-pause-line' : 'ri-play-line'}></i>
                        </button>
                        <button
                          onClick={() => handleDelete(type.id)}
                          className="text-red-600 hover:text-red-900 transition-colors"
                          title="Eliminar"
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

        {/* Modal de formulario */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingType ? 'Editar Tipo de Empleado' : 'Nuevo Tipo de Empleado'}
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
                      Nombre del Tipo *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Estado
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descripción *
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Beneficios
                  </label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newBenefit}
                        onChange={(e) => setNewBenefit(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addBenefit())}
                        placeholder="Escriba un beneficio y presione Agregar"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={addBenefit}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <i className="ri-add-line"></i>
                      </button>
                    </div>
                    {formData.benefits.length > 0 && (
                      <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg">
                        {formData.benefits.map((benefit, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                          >
                            {benefit}
                            <button
                              type="button"
                              onClick={() => removeBenefit(index)}
                              className="text-blue-600 hover:text-red-600 transition-colors"
                            >
                              <i className="ri-close-line"></i>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Horas de Trabajo/Día
                    </label>
                    <input
                      type="number"
                      value={formData.workingHours}
                      onChange={(e) => setFormData({...formData, workingHours: parseInt(e.target.value)})}
                      min="0"
                      max="24"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Días de Vacaciones/Año
                    </label>
                    <input
                      type="number"
                      value={formData.vacationDays}
                      onChange={(e) => setFormData({...formData, vacationDays: parseInt(e.target.value)})}
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex items-center pt-6">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.overtimeEligible}
                        onChange={(e) => setFormData({...formData, overtimeEligible: e.target.checked})}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Elegible para horas extras</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-6">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {editingType ? 'Actualizar' : 'Crear'} Tipo
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
