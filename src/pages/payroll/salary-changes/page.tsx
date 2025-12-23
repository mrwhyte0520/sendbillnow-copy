import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { exportToExcelStyled } from '../../../utils/exportImportUtils';
import { employeesService, salaryChangesService } from '../../../services/database';
import { formatMoney } from '../../../utils/numberFormat';

interface SalaryChange {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  position: string;
  previousSalary: number;
  newSalary: number;
  changeType: 'increase' | 'decrease' | 'adjustment' | 'promotion';
  changePercentage: number;
  effectiveDate: string;
  reason: string;
  approvedBy: string;
  approvedDate: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  notes: string;
  createdAt: string;
}

interface Employee {
  id: string;
  code: string;
  name: string;
  department: string;
  position: string;
  currentSalary: number;
}

export default function SalaryChangesPage() {
  const { user } = useAuth();
  const [salaryChanges, setSalaryChanges] = useState<SalaryChange[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingChange, setEditingChange] = useState<SalaryChange | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  const [formData, setFormData] = useState({
    employeeId: '',
    newSalary: 0,
    changeType: 'increase' as SalaryChange['changeType'],
    effectiveDate: new Date().toISOString().split('T')[0],
    reason: '',
    notes: ''
  });

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    try {
      const [empData, changesData] = await Promise.all([
        employeesService.getAll(user.id),
        salaryChangesService?.getAll?.(user.id) || Promise.resolve([])
      ]);

      const mappedEmployees: Employee[] = (empData || []).map((e: any) => ({
        id: e.id,
        code: e.employee_code || e.identification || '',
        name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
        department: e.departments?.name || '',
        position: e.positions?.title || '',
        currentSalary: Number(e.base_salary) || Number(e.salary) || 0
      }));
      setEmployees(mappedEmployees);

      const mappedChanges: SalaryChange[] = (changesData || []).map((c: any) => ({
        id: c.id,
        employeeId: c.employee_id,
        employeeName: c.employee_name || '',
        employeeCode: c.employee_code || '',
        department: c.department || '',
        position: c.position || '',
        previousSalary: Number(c.previous_salary) || 0,
        newSalary: Number(c.new_salary) || 0,
        changeType: c.change_type || 'adjustment',
        changePercentage: Number(c.change_percentage) || 0,
        effectiveDate: c.effective_date || '',
        reason: c.reason || '',
        approvedBy: c.approved_by || '',
        approvedDate: c.approved_date || '',
        status: c.status || 'pending',
        notes: c.notes || '',
        createdAt: c.created_at || new Date().toISOString()
      }));
      setSalaryChanges(mappedChanges);
    } catch (error) {
      console.error('Error loading salary changes:', error);
    }
  };

  const filteredChanges = salaryChanges.filter(change => {
    const matchesSearch = change.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         change.employeeCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || change.status === filterStatus;
    const matchesType = filterType === 'all' || change.changeType === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  const handleEmployeeSelect = (employeeId: string) => {
    const emp = employees.find(e => e.id === employeeId);
    setSelectedEmployee(emp || null);
    setFormData(prev => ({
      ...prev,
      employeeId,
      newSalary: emp?.currentSalary || 0
    }));
  };

  const calculateChangePercentage = () => {
    if (!selectedEmployee || selectedEmployee.currentSalary === 0) return 0;
    return ((formData.newSalary - selectedEmployee.currentSalary) / selectedEmployee.currentSalary) * 100;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedEmployee) return;

    const changePercentage = calculateChangePercentage();
    const changeType = changePercentage > 0 ? 'increase' : changePercentage < 0 ? 'decrease' : 'adjustment';

    const payload = {
      employee_id: selectedEmployee.id,
      employee_name: selectedEmployee.name,
      employee_code: selectedEmployee.code,
      department: selectedEmployee.department,
      position: selectedEmployee.position,
      previous_salary: selectedEmployee.currentSalary,
      new_salary: formData.newSalary,
      change_type: formData.changeType || changeType,
      change_percentage: changePercentage,
      effective_date: formData.effectiveDate,
      reason: formData.reason,
      notes: formData.notes,
      status: 'pending',
      approved_by: null,
      approved_date: null
    };

    try {
      if (salaryChangesService?.create) {
        const created = await salaryChangesService.create(user.id, payload);
        const newChange: SalaryChange = {
          id: created.id,
          employeeId: created.employee_id,
          employeeName: created.employee_name,
          employeeCode: created.employee_code,
          department: created.department,
          position: created.position,
          previousSalary: Number(created.previous_salary),
          newSalary: Number(created.new_salary),
          changeType: created.change_type,
          changePercentage: Number(created.change_percentage),
          effectiveDate: created.effective_date,
          reason: created.reason,
          approvedBy: created.approved_by || '',
          approvedDate: created.approved_date || '',
          status: created.status,
          notes: created.notes || '',
          createdAt: created.created_at
        };
        setSalaryChanges(prev => [...prev, newChange]);
      } else {
        // Fallback: agregar localmente
        const newChange: SalaryChange = {
          id: Date.now().toString(),
          employeeId: selectedEmployee.id,
          employeeName: selectedEmployee.name,
          employeeCode: selectedEmployee.code,
          department: selectedEmployee.department,
          position: selectedEmployee.position,
          previousSalary: selectedEmployee.currentSalary,
          newSalary: formData.newSalary,
          changeType: formData.changeType || changeType as any,
          changePercentage,
          effectiveDate: formData.effectiveDate,
          reason: formData.reason,
          approvedBy: '',
          approvedDate: '',
          status: 'pending',
          notes: formData.notes,
          createdAt: new Date().toISOString()
        };
        setSalaryChanges(prev => [...prev, newChange]);
      }
      resetForm();
    } catch (error) {
      console.error('Error saving salary change:', error);
      alert('Error al guardar el cambio de salario');
    }
  };

  const resetForm = () => {
    setFormData({
      employeeId: '',
      newSalary: 0,
      changeType: 'increase',
      effectiveDate: new Date().toISOString().split('T')[0],
      reason: '',
      notes: ''
    });
    setSelectedEmployee(null);
    setShowForm(false);
    setEditingChange(null);
  };

  const handleApprove = async (id: string) => {
    const change = salaryChanges.find(c => c.id === id);
    if (!change || !user) return;

    try {
      // Actualizar estado del cambio
      if (salaryChangesService?.update) {
        await salaryChangesService.update(id, {
          status: 'approved',
          approved_by: user.email || 'Sistema',
          approved_date: new Date().toISOString().split('T')[0]
        });
      }

      // Aplicar cambio al salario del empleado
      const emp = employees.find(e => e.id === change.employeeId);
      if (emp) {
        await employeesService.update(emp.id, { base_salary: change.newSalary });
        setEmployees(prev => prev.map(e => 
          e.id === emp.id ? { ...e, currentSalary: change.newSalary } : e
        ));
      }

      setSalaryChanges(prev => prev.map(c =>
        c.id === id
          ? { ...c, status: 'approved', approvedBy: user.email || 'Sistema', approvedDate: new Date().toISOString().split('T')[0] }
          : c
      ));

      alert('Cambio de salario aprobado y aplicado correctamente');
    } catch (error) {
      console.error('Error approving salary change:', error);
      alert('Error al aprobar el cambio de salario');
    }
  };

  const handleReject = async (id: string) => {
    try {
      if (salaryChangesService?.update) {
        await salaryChangesService.update(id, { status: 'rejected' });
      }
      setSalaryChanges(prev => prev.map(c =>
        c.id === id ? { ...c, status: 'rejected' } : c
      ));
    } catch (error) {
      console.error('Error rejecting salary change:', error);
    }
  };

  const exportToExcel = async () => {
    const today = new Date().toISOString().split('T')[0];
    const rows = filteredChanges.map(c => ({
      code: c.employeeCode,
      name: c.employeeName,
      department: c.department,
      previousSalary: c.previousSalary,
      newSalary: c.newSalary,
      change: `${c.changePercentage >= 0 ? '+' : ''}${c.changePercentage.toFixed(2)}%`,
      type: c.changeType === 'increase' ? 'Aumento' : c.changeType === 'decrease' ? 'Disminución' : c.changeType === 'promotion' ? 'Promoción' : 'Ajuste',
      effectiveDate: c.effectiveDate,
      status: c.status === 'pending' ? 'Pendiente' : c.status === 'approved' ? 'Aprobado' : c.status === 'rejected' ? 'Rechazado' : 'Aplicado',
      reason: c.reason
    }));

    await exportToExcelStyled(
      rows,
      [
        { key: 'code', title: 'Código', width: 14 },
        { key: 'name', title: 'Empleado', width: 28 },
        { key: 'department', title: 'Departamento', width: 20 },
        { key: 'previousSalary', title: 'Salario Anterior', width: 18, numFmt: '#,##0.00' },
        { key: 'newSalary', title: 'Nuevo Salario', width: 18, numFmt: '#,##0.00' },
        { key: 'change', title: 'Cambio %', width: 12 },
        { key: 'type', title: 'Tipo', width: 14 },
        { key: 'effectiveDate', title: 'Fecha Efectiva', width: 14 },
        { key: 'status', title: 'Estado', width: 12 },
        { key: 'reason', title: 'Razón', width: 30 }
      ],
      `cambios_salario_${today}`,
      'Cambios de Salario'
    );
  };

  const pendingCount = salaryChanges.filter(c => c.status === 'pending').length;
  const approvedCount = salaryChanges.filter(c => c.status === 'approved').length;
  const totalIncrease = salaryChanges
    .filter(c => c.status === 'approved' && c.changeType === 'increase')
    .reduce((sum, c) => sum + (c.newSalary - c.previousSalary), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cambios de Salario</h1>
            <p className="text-gray-600">Gestiona los ajustes y cambios salariales de empleados</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => window.REACT_APP_NAVIGATE?.('/payroll')}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <i className="ri-arrow-left-line mr-2"></i>
              Volver
            </button>
            <button
              onClick={exportToExcel}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <i className="ri-download-line mr-2"></i>
              Exportar
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <i className="ri-add-line mr-2"></i>
              Nuevo Cambio
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Cambios</p>
                <p className="text-2xl font-bold text-gray-900">{salaryChanges.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <i className="ri-exchange-line text-blue-600 text-xl"></i>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pendientes</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <i className="ri-time-line text-yellow-600 text-xl"></i>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Aprobados</p>
                <p className="text-2xl font-bold text-green-600">{approvedCount}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <i className="ri-check-line text-green-600 text-xl"></i>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Impacto Total</p>
                <p className="text-2xl font-bold text-purple-600">{formatMoney(totalIncrease)}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <i className="ri-money-dollar-circle-line text-purple-600 text-xl"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar empleado..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todos</option>
                <option value="pending">Pendiente</option>
                <option value="approved">Aprobado</option>
                <option value="rejected">Rechazado</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todos</option>
                <option value="increase">Aumento</option>
                <option value="decrease">Disminución</option>
                <option value="promotion">Promoción</option>
                <option value="adjustment">Ajuste</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => { setSearchTerm(''); setFilterStatus('all'); setFilterType('all'); }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empleado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Salario Anterior</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nuevo Salario</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cambio</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha Efectiva</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredChanges.map((change) => (
                  <tr key={change.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{change.employeeName}</div>
                        <div className="text-sm text-gray-500">{change.department}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(change.previousSalary)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(change.newSalary)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        change.changePercentage > 0 ? 'bg-green-100 text-green-800' :
                        change.changePercentage < 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {change.changePercentage >= 0 ? '+' : ''}{change.changePercentage.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {change.effectiveDate}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        change.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        change.status === 'approved' ? 'bg-green-100 text-green-800' :
                        change.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {change.status === 'pending' ? 'Pendiente' :
                         change.status === 'approved' ? 'Aprobado' :
                         change.status === 'rejected' ? 'Rechazado' : 'Aplicado'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {change.status === 'pending' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(change.id)}
                            className="text-green-600 hover:text-green-800"
                            title="Aprobar"
                          >
                            <i className="ri-check-line text-lg"></i>
                          </button>
                          <button
                            onClick={() => handleReject(change.id)}
                            className="text-red-600 hover:text-red-800"
                            title="Rechazar"
                          >
                            <i className="ri-close-line text-lg"></i>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredChanges.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      No se encontraron cambios de salario
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">Nuevo Cambio de Salario</h2>
                <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Empleado *</label>
                  <select
                    value={formData.employeeId}
                    onChange={(e) => handleEmployeeSelect(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Seleccionar empleado</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.code} - {emp.name} ({emp.department})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedEmployee && (
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-800 mb-2">Información del Empleado</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-blue-600">Posición:</span> {selectedEmployee.position}
                      </div>
                      <div>
                        <span className="text-blue-600">Salario Actual:</span> {formatMoney(selectedEmployee.currentSalary)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nuevo Salario *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.newSalary}
                      onChange={(e) => setFormData({...formData, newSalary: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                    {selectedEmployee && formData.newSalary > 0 && (
                      <p className={`text-sm mt-1 ${calculateChangePercentage() >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        Cambio: {calculateChangePercentage() >= 0 ? '+' : ''}{calculateChangePercentage().toFixed(2)}%
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Cambio</label>
                    <select
                      value={formData.changeType}
                      onChange={(e) => setFormData({...formData, changeType: e.target.value as any})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="increase">Aumento</option>
                      <option value="decrease">Disminución</option>
                      <option value="promotion">Promoción</option>
                      <option value="adjustment">Ajuste</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Fecha Efectiva *</label>
                  <input
                    type="date"
                    value={formData.effectiveDate}
                    onChange={(e) => setFormData({...formData, effectiveDate: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Razón del Cambio *</label>
                  <textarea
                    value={formData.reason}
                    onChange={(e) => setFormData({...formData, reason: e.target.value})}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Explique el motivo del cambio de salario..."
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notas Adicionales</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Notas opcionales..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Guardar Cambio
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
