
import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { exportToExcelStyled } from '../../../utils/exportImportUtils';
import { useAuth } from '../../../hooks/useAuth';
import { positionsService, departmentsService, employeesService } from '../../../services/database';

interface Position {
  id: string;
  title: string;
  department_id: string;
  department_name: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  salaryRange: {
    min: number;
    max: number;
  };
  level: 'junior' | 'mid' | 'senior' | 'executive';
  employeeCount: number;
  status: 'active' | 'inactive';
  createdAt: string;
}

export default function PositionsPage() {
  const { user } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');

  const [formData, setFormData] = useState({
    title: '',
    department: '',
    description: '',
    requirements: [] as string[],
    responsibilities: [] as string[],
    salaryMin: 0,
    salaryMax: 0,
    level: 'junior' as 'junior' | 'mid' | 'senior' | 'executive',
    status: 'active' as 'active' | 'inactive'
  });
  const [newRequirement, setNewRequirement] = useState('');
  const [newResponsibility, setNewResponsibility] = useState('');

  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      try {
        const [posData, deptData, empData] = await Promise.all([
          positionsService.getAll(user.id),
          departmentsService.getAll(user.id),
          employeesService.getAll(user.id),
        ]);

        const mappedDepartments = (deptData || []).map((d: any) => ({
          id: d.id,
          name: d.name || '',
        }));

        const employees = (empData || []) as any[];

        const mappedPositions: Position[] = (posData || []).map((p: any) => {
          const dept = mappedDepartments.find((d: { id: string; name: string }) => d.id === p.department_id);
          const employeeCount = employees.filter(e => e.position_id === p.id).length;
          return {
            id: p.id,
            title: p.title || '',
            department_id: p.department_id || '',
            department_name: dept?.name || '',
            description: p.description || '',
            requirements: Array.isArray(p.requirements)
              ? p.requirements
              : (p.requirements || '').toString().split(',').map((r: string) => r.trim()).filter(Boolean),
            responsibilities: Array.isArray(p.responsibilities)
              ? p.responsibilities
              : (p.responsibilities || '').toString().split(',').map((r: string) => r.trim()).filter(Boolean),
            salaryRange: {
              min: Number(p.min_salary) || 0,
              max: Number(p.max_salary) || 0,
            },
            level: (p.level as Position['level']) || 'junior',
            employeeCount,
            status: (p.status as Position['status']) || 'active',
            createdAt: (p.created_at || '').split('T')[0] || new Date().toISOString().split('T')[0],
          };
        });

        setDepartments(mappedDepartments);
        setPositions(mappedPositions);
      } catch (error) {
        console.error('Error loading positions:', error);
      }
    };

    loadData();
  }, [user]);

  const filteredPositions = positions.filter(position => {
    const matchesSearch = position.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         position.department_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = departmentFilter === 'all' || position.department_id === departmentFilter;
    const matchesLevel = levelFilter === 'all' || position.level === levelFilter;
    return matchesSearch && matchesDepartment && matchesLevel;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      alert('Debe iniciar sesión para gestionar posiciones.');
      return;
    }

    const payload: any = {
      title: formData.title,
      description: formData.description,
      department_id: formData.department || null,
      requirements: formData.requirements,
      responsibilities: formData.responsibilities,
      min_salary: formData.salaryMin || 0,
      max_salary: formData.salaryMax || 0,
      level: formData.level,
      employee_count: editingPosition?.employeeCount ?? 0,
      status: formData.status,
    };

    try {
      if (editingPosition) {
        const updated = await positionsService.update(editingPosition.id, payload);
        const dept = departments.find(d => d.id === (updated.department_id || formData.department));
        setPositions(prev => prev.map(position =>
          position.id === editingPosition.id
            ? {
                id: updated.id,
                title: updated.title || '',
                department_id: updated.department_id || '',
                department_name: dept?.name || position.department_name,
                description: updated.description || '',
                requirements: Array.isArray(updated.requirements)
                  ? updated.requirements
                  : (updated.requirements || '').toString().split(',').map((r: string) => r.trim()).filter(Boolean),
                responsibilities: Array.isArray(updated.responsibilities)
                  ? updated.responsibilities
                  : (updated.responsibilities || '').toString().split(',').map((r: string) => r.trim()).filter(Boolean),
                salaryRange: {
                  min: Number(updated.min_salary) || 0,
                  max: Number(updated.max_salary) || 0,
                },
                level: (updated.level as Position['level']) || position.level,
                employeeCount: Number(updated.employee_count) || position.employeeCount,
                status: (updated.status as Position['status']) || position.status,
                createdAt: (updated.created_at || '').split('T')[0] || position.createdAt,
              }
            : position
        ));
      } else {
        const created = await positionsService.create(user.id, payload);
        const dept = departments.find(d => d.id === created.department_id);
        const newPosition: Position = {
          id: created.id,
          title: created.title || '',
          department_id: created.department_id || '',
          department_name: dept?.name || '',
          description: created.description || '',
          requirements: Array.isArray(created.requirements)
            ? created.requirements
            : (created.requirements || '').toString().split(',').map((r: string) => r.trim()).filter(Boolean),
          responsibilities: Array.isArray(created.responsibilities)
            ? created.responsibilities
            : (created.responsibilities || '').toString().split(',').map((r: string) => r.trim()).filter(Boolean),
          salaryRange: {
            min: Number(created.min_salary) || 0,
            max: Number(created.max_salary) || 0,
          },
          level: (created.level as Position['level']) || 'junior',
          employeeCount: Number(created.employee_count) || 0,
          status: (created.status as Position['status']) || 'active',
          createdAt: (created.created_at || '').split('T')[0] || new Date().toISOString().split('T')[0],
        };
        setPositions(prev => [...prev, newPosition]);
      }

      resetForm();
    } catch (error) {
      console.error('Error saving position:', error);
      alert('Error al guardar la posición');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      department: '',
      description: '',
      requirements: [],
      responsibilities: [],
      salaryMin: 0,
      salaryMax: 0,
      level: 'junior',
      status: 'active'
    });
    setNewRequirement('');
    setNewResponsibility('');
    setEditingPosition(null);
    setShowForm(false);
  };

  const handleEdit = (position: Position) => {
    setEditingPosition(position);
    setFormData({
      title: position.title,
      department: position.department_id,
      description: position.description,
      requirements: [...position.requirements],
      responsibilities: [...position.responsibilities],
      salaryMin: position.salaryRange.min,
      salaryMax: position.salaryRange.max,
      level: position.level,
      status: position.status
    });
    setNewRequirement('');
    setNewResponsibility('');
    setShowForm(true);
  };

  const addRequirement = () => {
    if (newRequirement.trim()) {
      setFormData(prev => ({ ...prev, requirements: [...prev.requirements, newRequirement.trim()] }));
      setNewRequirement('');
    }
  };

  const removeRequirement = (index: number) => {
    setFormData(prev => ({ ...prev, requirements: prev.requirements.filter((_, i) => i !== index) }));
  };

  const addResponsibility = () => {
    if (newResponsibility.trim()) {
      setFormData(prev => ({ ...prev, responsibilities: [...prev.responsibilities, newResponsibility.trim()] }));
      setNewResponsibility('');
    }
  };

  const removeResponsibility = (index: number) => {
    setFormData(prev => ({ ...prev, responsibilities: prev.responsibilities.filter((_, i) => i !== index) }));
  };

  const handleDelete = (id: string) => {
    if (!confirm('¿Está seguro de eliminar esta posición?')) return;

    (async () => {
      try {
        await positionsService.delete(id);
        setPositions(prev => prev.filter(position => position.id !== id));
      } catch (error) {
        console.error('Error deleting position:', error);
        alert('Error al eliminar la posición');
      }
    })();
  };

  const toggleStatus = async (id: string) => {
    const current = positions.find(p => p.id === id);
    if (!current) return;
    const newStatus: Position['status'] = current.status === 'active' ? 'inactive' : 'active';

    try {
      await positionsService.update(id, { status: newStatus });
      setPositions(prev => prev.map(position =>
        position.id === id ? { ...position, status: newStatus } : position
      ));
    } catch (error) {
      console.error('Error toggling position status:', error);
      alert('Error al cambiar el estado de la posición');
    }
  };

  const downloadExcel = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const rows = filteredPositions.map(position => ({
        title: position.title,
        department: position.department_name,
        level: position.level === 'junior' ? 'Junior' : position.level === 'mid' ? 'Intermedio' : position.level === 'senior' ? 'Senior' : 'Ejecutivo',
        salaryMin: position.salaryRange.min || 0,
        salaryMax: position.salaryRange.max || 0,
        employees: position.employeeCount,
        status: position.status === 'active' ? 'Activo' : 'Inactivo',
        createdAt: position.createdAt,
      }));
      await exportToExcelStyled(
        rows,
        [
          { key: 'title', title: 'Título', width: 28 },
          { key: 'department', title: 'Departamento', width: 22 },
          { key: 'level', title: 'Nivel', width: 14 },
          { key: 'salaryMin', title: 'Salario Mín', width: 16, numFmt: '#,##0.00' },
          { key: 'salaryMax', title: 'Salario Máx', width: 16, numFmt: '#,##0.00' },
          { key: 'employees', title: 'Empleados', width: 12 },
          { key: 'status', title: 'Estado', width: 12 },
          { key: 'createdAt', title: 'Creado', width: 14 },
        ],
        `posiciones_${today}`,
        'Posiciones'
      );
    } catch (error) {
      console.error('Error exporting positions:', error);
      alert('Error al exportar a Excel');
    }
  };

  const getLevelBadge = (level: string) => {
    const badges = {
      junior: 'bg-green-100 text-green-800',
      mid: 'bg-blue-100 text-blue-800',
      senior: 'bg-purple-100 text-purple-800',
      executive: 'bg-red-100 text-red-800'
    };
    return badges[level as keyof typeof badges] || badges.junior;
  };

  const getLevelText = (level: string) => {
    const texts = {
      junior: 'Junior',
      mid: 'Intermedio',
      senior: 'Senior',
      executive: 'Ejecutivo'
    };
    return texts[level as keyof typeof texts] || 'Junior';
  };

  const totalEmployees = positions.reduce((sum, pos) => sum + pos.employeeCount, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cargos / Posiciones</h1>
            <p className="text-gray-600">Gestiona los cargos y posiciones de la empresa</p>
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
              Nueva Posición
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                  placeholder="Buscar por título o departamento..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Departamento
              </label>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos los departamentos</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nivel
              </label>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos los niveles</option>
                <option value="junior">Junior</option>
                <option value="mid">Intermedio</option>
                <option value="senior">Senior</option>
                <option value="executive">Ejecutivo</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setDepartmentFilter('all');
                  setLevelFilter('all');
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
                <p className="text-sm font-medium text-gray-600">Total Posiciones</p>
                <p className="text-2xl font-bold text-gray-900">{positions.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <i className="ri-briefcase-line text-blue-600 text-xl"></i>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Empleados Asignados</p>
                <p className="text-2xl font-bold text-green-600">{totalEmployees}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <i className="ri-team-line text-green-600 text-xl"></i>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Posiciones Activas</p>
                <p className="text-2xl font-bold text-purple-600">
                  {positions.filter(p => p.status === 'active').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <i className="ri-check-line text-purple-600 text-xl"></i>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Departamentos</p>
                <p className="text-2xl font-bold text-orange-600">{departments.length}</p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <i className="ri-building-line text-orange-600 text-xl"></i>
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
                    Posición
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Departamento
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nivel
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rango Salarial
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Empleados
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
                {filteredPositions.map((position) => (
                  <tr key={position.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{position.title}</div>
                        <div className="text-sm text-gray-500">{position.description}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{position.department_name}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getLevelBadge(position.level)}`}>
                        {getLevelText(position.level)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        ${position.salaryRange.min.toLocaleString()} - ${position.salaryRange.max.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{position.employeeCount}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        position.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {position.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(position)}
                          className="text-blue-600 hover:text-blue-900 transition-colors"
                          title="Editar"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => toggleStatus(position.id)}
                          className={`transition-colors ${
                            position.status === 'active' 
                              ? 'text-red-600 hover:text-red-900' 
                              : 'text-green-600 hover:text-green-900'
                          }`}
                          title={position.status === 'active' ? 'Desactivar' : 'Activar'}
                        >
                          <i className={position.status === 'active' ? 'ri-pause-line' : 'ri-play-line'}></i>
                        </button>
                        <button
                          onClick={() => handleDelete(position.id)}
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
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingPosition ? 'Editar Posición' : 'Nueva Posición'}
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
                      Título de la Posición *
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Departamento *
                    </label>
                    <select
                      value={formData.department}
                      onChange={(e) => setFormData({...formData, department: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="">Seleccionar departamento</option>
                      {departments.map(dept => (
                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                      ))}
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Requisitos</label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newRequirement}
                          onChange={(e) => setNewRequirement(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addRequirement())}
                          placeholder="Escriba un requisito"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button type="button" onClick={addRequirement} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                          <i className="ri-add-line"></i>
                        </button>
                      </div>
                      {formData.requirements.length > 0 && (
                        <div className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded-lg">
                          {formData.requirements.map((req, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                              {req}
                              <button type="button" onClick={() => removeRequirement(i)} className="text-blue-600 hover:text-red-600"><i className="ri-close-line"></i></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Responsabilidades</label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newResponsibility}
                          onChange={(e) => setNewResponsibility(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addResponsibility())}
                          placeholder="Escriba una responsabilidad"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button type="button" onClick={addResponsibility} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                          <i className="ri-add-line"></i>
                        </button>
                      </div>
                      {formData.responsibilities.length > 0 && (
                        <div className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded-lg">
                          {formData.responsibilities.map((resp, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                              {resp}
                              <button type="button" onClick={() => removeResponsibility(i)} className="text-purple-600 hover:text-red-600"><i className="ri-close-line"></i></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Salario Mínimo
                    </label>
                    <input
                      type="number"
                      value={formData.salaryMin}
                      onChange={(e) => setFormData({...formData, salaryMin: parseFloat(e.target.value) || 0})}
                      min="0"
                      step="1000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Salario Máximo
                    </label>
                    <input
                      type="number"
                      value={formData.salaryMax}
                      onChange={(e) => setFormData({...formData, salaryMax: parseFloat(e.target.value) || 0})}
                      min="0"
                      step="1000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nivel
                    </label>
                    <select
                      value={formData.level}
                      onChange={(e) => setFormData({...formData, level: e.target.value as any})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="junior">Junior</option>
                      <option value="mid">Intermedio</option>
                      <option value="senior">Senior</option>
                      <option value="executive">Ejecutivo</option>
                    </select>
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
                    {editingPosition ? 'Actualizar' : 'Crear'} Posición
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
