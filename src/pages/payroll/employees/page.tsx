import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { exportToExcelStyled } from '../../../utils/exportImportUtils';
import { departmentsService, positionsService, employeesService, employeeTypesService, salaryTypesService } from '../../../services/database';

interface Employee {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  identification: string;
  department_id: string;
  position_id: string;
  employee_type_id: string;
  salary_type_id: string;
  base_salary: number;
  hire_date: string;
  birth_date: string;
  gender: 'M' | 'F';
  marital_status: 'single' | 'married' | 'divorced' | 'widowed';
  address: string;
  bank_account: string;
  bank_name: string;
  emergency_contact: string;
  emergency_phone: string;
  status: 'active' | 'inactive' | 'suspended';
  photo_url?: string;
}

interface Department {
  id: string;
  name: string;
  status?: string;
}

interface Position {
  id: string;
  title: string;
  department_id: string;
}

interface EmployeeType {
  id: string;
  name: string;
  description: string;
}

interface SalaryType {
  id: string;
  name: string;
  description: string;
}

export default function EmployeesPage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [employeeTypes, setEmployeeTypes] = useState<EmployeeType[]>([]);
  const [salaryTypes, setSalaryTypes] = useState<SalaryType[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [emps, depts, poss, empTypes, salTypes] = await Promise.all([
        employeesService.getAll(user.id),
        departmentsService.getAll(user.id),
        positionsService.getAll(user.id),
        employeeTypesService.getAll(user.id),
        salaryTypesService.getAll(user.id)
      ]);
      const mappedEmployees: Employee[] = (emps || []).map((e: any) => ({
        id: e.id,
        employee_code: e.employee_code || '',
        first_name: e.first_name || '',
        last_name: e.last_name || '',
        email: e.email || '',
        phone: e.phone || '',
        identification: e.identification || '',
        department_id: e.department_id || '',
        position_id: e.position_id || '',
        employee_type_id: e.employee_type_id || '',
        salary_type_id: e.salary_type_id || '',
        base_salary: Number(e.base_salary) || 0,
        hire_date: e.hire_date || '',
        birth_date: e.birth_date || '',
        gender: (e.gender as 'M' | 'F') || 'M',
        marital_status: (e.marital_status as Employee['marital_status']) || 'single',
        address: e.address || '',
        bank_account: e.bank_account || '',
        bank_name: e.bank_name || '',
        emergency_contact: e.emergency_contact || '',
        emergency_phone: e.emergency_phone || '',
        status: (e.status as Employee['status']) || 'active',
        photo_url: e.photo_url || undefined,
      }));

      setEmployees(mappedEmployees);
      setDepartments(depts || []);
      setPositions(poss || []);
      setEmployeeTypes(empTypes || []);
      setSalaryTypes(salTypes || []);
    } catch (error) {
      console.error('Error loading payroll catalogs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (type: string, employee: Employee | null = null) => {
    setModalType(type);
    setSelectedEmployee(employee);
    setFormData(employee || {
      gender: 'M',
      marital_status: 'single',
      status: 'active',
      employee_type_id: '1',
      salary_type_id: '1'
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setModalType('');
    setSelectedEmployee(null);
    setFormData({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!user) return;

      const payload: any = {
        first_name: formData.first_name || '',
        last_name: formData.last_name || '',
        email: formData.email || '',
        phone: formData.phone || '',
        identification: formData.identification || '',
        department_id: formData.department_id || null,
        position_id: formData.position_id || null,
        employee_type_id: formData.employee_type_id || null,
        salary_type_id: formData.salary_type_id || null,
        base_salary: Number(formData.base_salary) || 0,
        hire_date: formData.hire_date || new Date().toISOString().slice(0, 10),
        birth_date: formData.birth_date || null,
        gender: formData.gender || 'M',
        marital_status: formData.marital_status || 'single',
        address: formData.address || '',
        bank_account: formData.bank_account || '',
        bank_name: formData.bank_name || '',
        emergency_contact: formData.emergency_contact || '',
        emergency_phone: formData.emergency_phone || '',
        status: formData.status || 'active',
        photo_url: formData.photo_url || null,
      };

      if (selectedEmployee) {
        const updated = await employeesService.update(selectedEmployee.id, payload);
        setEmployees(prev => prev.map(emp =>
          emp.id === selectedEmployee.id
            ? {
                id: updated.id,
                employee_code: updated.employee_code || '',
                first_name: updated.first_name || '',
                last_name: updated.last_name || '',
                email: updated.email || '',
                phone: updated.phone || '',
                identification: updated.identification || '',
                department_id: updated.department_id || '',
                position_id: updated.position_id || '',
                employee_type_id: updated.employee_type_id || '',
                salary_type_id: updated.salary_type_id || '',
                base_salary: Number(updated.base_salary) || 0,
                hire_date: updated.hire_date || '',
                birth_date: updated.birth_date || '',
                gender: (updated.gender as 'M' | 'F') || 'M',
                marital_status: (updated.marital_status as Employee['marital_status']) || 'single',
                address: updated.address || '',
                bank_account: updated.bank_account || '',
                bank_name: updated.bank_name || '',
                emergency_contact: updated.emergency_contact || '',
                emergency_phone: updated.emergency_phone || '',
                status: (updated.status as Employee['status']) || 'active',
                photo_url: updated.photo_url || undefined,
              }
            : emp
        ));
      } else {
        const created = await employeesService.create(user.id, payload);
        const newEmployee: Employee = {
          id: created.id,
          employee_code: created.employee_code || '',
          first_name: created.first_name || '',
          last_name: created.last_name || '',
          email: created.email || '',
          phone: created.phone || '',
          identification: created.identification || '',
          department_id: created.department_id || '',
          position_id: created.position_id || '',
          employee_type_id: created.employee_type_id || '',
          salary_type_id: created.salary_type_id || '',
          base_salary: Number(created.base_salary) || 0,
          hire_date: created.hire_date || '',
          birth_date: created.birth_date || '',
          gender: (created.gender as 'M' | 'F') || 'M',
          marital_status: (created.marital_status as Employee['marital_status']) || 'single',
          address: created.address || '',
          bank_account: created.bank_account || '',
          bank_name: created.bank_name || '',
          emergency_contact: created.emergency_contact || '',
          emergency_phone: created.emergency_phone || '',
          status: (created.status as Employee['status']) || 'active',
          photo_url: created.photo_url || undefined,
        };
        setEmployees(prev => [...prev, newEmployee]);
      }

      handleCloseModal();
    } catch (error) {
      console.error('Error saving employee:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de que desea eliminar este empleado?')) return;

    try {
      await employeesService.delete(id);
      setEmployees(prev => prev.filter(emp => emp.id !== id));
    } catch (error) {
      console.error('Error deleting employee:', error);
      alert('Ocurrió un error al eliminar el empleado.');
    }
  };

  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = searchTerm === '' || 
      employee.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.employee_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.identification.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDepartment = filterDepartment === '' || employee.department_id === filterDepartment;
    const matchesStatus = filterStatus === '' || employee.status === filterStatus;
    
    return matchesSearch && matchesDepartment && matchesStatus;
  });

  const getDepartmentName = (id: string) => {
    return departments.find(dept => dept.id === id)?.name || 'N/A';
  };

  const getPositionTitle = (id: string) => {
    return positions.find(pos => pos.id === id)?.title || 'N/A';
  };

  const getEmployeeTypeName = (id: string) => {
    return employeeTypes.find(type => type.id === id)?.name || 'N/A';
  };

  const getSalaryTypeName = (id: string) => {
    return salaryTypes.find(type => type.id === id)?.name || 'N/A';
  };

  const exportToExcel = async () => {
    const today = new Date().toISOString().split('T')[0];

    const rows = filteredEmployees.map(emp => ({
      code: emp.employee_code,
      name: `${emp.first_name} ${emp.last_name}`,
      email: emp.email,
      phone: emp.phone,
      identification: emp.identification,
      department: getDepartmentName(emp.department_id),
      position: getPositionTitle(emp.position_id),
      employeeType: getEmployeeTypeName(emp.employee_type_id),
      salaryType: getSalaryTypeName(emp.salary_type_id),
      baseSalary: emp.base_salary || 0,
      hireDate: emp.hire_date,
      status: emp.status,
    }));

    if (!rows.length) {
      alert('No hay empleados para exportar.');
      return;
    }

    await exportToExcelStyled(
      rows,
      [
        { key: 'code', title: 'Código', width: 14 },
        { key: 'name', title: 'Nombre', width: 28 },
        { key: 'email', title: 'Email', width: 26 },
        { key: 'phone', title: 'Teléfono', width: 16 },
        { key: 'identification', title: 'Identificación', width: 18 },
        { key: 'department', title: 'Departamento', width: 22 },
        { key: 'position', title: 'Posición', width: 22 },
        { key: 'employeeType', title: 'Tipo Empleado', width: 18 },
        { key: 'salaryType', title: 'Tipo Salario', width: 18 },
        { key: 'baseSalary', title: 'Salario Base', width: 16, numFmt: '#,##0.00' },
        { key: 'hireDate', title: 'Fecha Contratación', width: 16 },
        { key: 'status', title: 'Estado', width: 12 },
      ],
      `empleados_${today}`,
      'Empleados'
    );
  };

  const handleBulkAction = (action: string) => {
    if (selectedEmployees.length === 0) {
      alert('Seleccione al menos un empleado');
      return;
    }

    if (!confirm(`¿Está seguro de que desea ${action} ${selectedEmployees.length} empleado(s)?`)) return;

    if (action === 'activar') {
      setEmployees(prev => prev.map(emp => 
        selectedEmployees.includes(emp.id) ? { ...emp, status: 'active' } : emp
      ));
    } else if (action === 'desactivar') {
      setEmployees(prev => prev.map(emp => 
        selectedEmployees.includes(emp.id) ? { ...emp, status: 'inactive' } : emp
      ));
    } else if (action === 'suspender') {
      setEmployees(prev => prev.map(emp => 
        selectedEmployees.includes(emp.id) ? { ...emp, status: 'suspended' } : emp
      ));
    }

    setSelectedEmployees([]);
  };

  const renderModal = () => {
    if (!showModal) return null;

    if (modalType === 'details') {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">Detalles del Empleado</h3>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            {selectedEmployee && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-lg font-medium text-gray-900 border-b pb-2">Información Personal</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Código</label>
                      <p className="text-sm text-gray-900">{selectedEmployee.employee_code}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Estado</label>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        selectedEmployee.status === 'active' ? 'bg-green-100 text-green-800' :
                        selectedEmployee.status === 'inactive' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {selectedEmployee.status === 'active' ? 'Activo' :
                         selectedEmployee.status === 'inactive' ? 'Inactivo' : 'Suspendido'}
                      </span>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Nombre</label>
                      <p className="text-sm text-gray-900">{selectedEmployee.first_name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Apellido</label>
                      <p className="text-sm text-gray-900">{selectedEmployee.last_name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Identificación</label>
                      <p className="text-sm text-gray-900">{selectedEmployee.identification}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Fecha de Nacimiento</label>
                      <p className="text-sm text-gray-900">{new Date(selectedEmployee.birth_date).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Género</label>
                      <p className="text-sm text-gray-900">{selectedEmployee.gender === 'M' ? 'Masculino' : 'Femenino'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Estado Civil</label>
                      <p className="text-sm text-gray-900">
                        {selectedEmployee.marital_status === 'single' ? 'Soltero(a)' :
                         selectedEmployee.marital_status === 'married' ? 'Casado(a)' :
                         selectedEmployee.marital_status === 'divorced' ? 'Divorciado(a)' : 'Viudo(a)'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Dirección</label>
                    <p className="text-sm text-gray-900">{selectedEmployee.address}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-lg font-medium text-gray-900 border-b pb-2">Información Laboral</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Departamento</label>
                      <p className="text-sm text-gray-900">{getDepartmentName(selectedEmployee.department_id)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Posición</label>
                      <p className="text-sm text-gray-900">{getPositionTitle(selectedEmployee.position_id)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Tipo de Empleado</label>
                      <p className="text-sm text-gray-900">{getEmployeeTypeName(selectedEmployee.employee_type_id)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Tipo de Salario</label>
                      <p className="text-sm text-gray-900">{getSalaryTypeName(selectedEmployee.salary_type_id)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Salario Base</label>
                      <p className="text-sm text-gray-900">
                        {selectedEmployee.salary_type_id === '2' ? 
                          `RD$${selectedEmployee.base_salary}/hora` : 
                          `RD$${selectedEmployee.base_salary.toLocaleString()}`}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Fecha de Contratación</label>
                      <p className="text-sm text-gray-900">{new Date(selectedEmployee.hire_date).toLocaleDateString()}</p>
                    </div>
                  </div>

                  <h4 className="text-lg font-medium text-gray-900 border-b pb-2 mt-6">Información de Contacto</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Email</label>
                      <p className="text-sm text-gray-900">{selectedEmployee.email}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Teléfono</label>
                      <p className="text-sm text-gray-900">{selectedEmployee.phone}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Contacto de Emergencia</label>
                      <p className="text-sm text-gray-900">{selectedEmployee.emergency_contact}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Teléfono de Emergencia</label>
                      <p className="text-sm text-gray-900">{selectedEmployee.emergency_phone}</p>
                    </div>
                  </div>

                  <h4 className="text-lg font-medium text-gray-900 border-b pb-2 mt-6">Información Bancaria</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Banco</label>
                      <p className="text-sm text-gray-900">{selectedEmployee.bank_name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Número de Cuenta</label>
                      <p className="text-sm text-gray-900">{selectedEmployee.bank_account}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              {selectedEmployee ? 'Editar' : 'Agregar'} Empleado
            </h3>
            <button
              onClick={handleCloseModal}
              className="text-gray-400 hover:text-gray-600"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Información Personal */}
              <div className="space-y-4">
                <h4 className="text-lg font-medium text-gray-900 border-b pb-2">Información Personal</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                    <input
                      type="text"
                      value={formData.first_name || ''}
                      onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Apellido *</label>
                    <input
                      type="text"
                      value={formData.last_name || ''}
                      onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Identificación *</label>
                    <input
                      type="text"
                      value={formData.identification || ''}
                      onChange={(e) => setFormData({...formData, identification: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="001-1234567-8"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Nacimiento <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      value={formData.birth_date || ''}
                      onChange={(e) => setFormData({...formData, birth_date: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Género</label>
                    <select
                      value={formData.gender || 'M'}
                      onChange={(e) => setFormData({...formData, gender: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="M">Masculino</option>
                      <option value="F">Femenino</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estado Civil</label>
                    <select
                      value={formData.marital_status || 'single'}
                      onChange={(e) => setFormData({...formData, marital_status: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="single">Soltero(a)</option>
                      <option value="married">Casado(a)</option>
                      <option value="divorced">Divorciado(a)</option>
                      <option value="widowed">Viudo(a)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                  <textarea
                    value={formData.address || ''}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                  />
                </div>
              </div>

              {/* Información Laboral */}
              <div className="space-y-4">
                <h4 className="text-lg font-medium text-gray-900 border-b pb-2">Información Laboral</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Departamento *</label>
                    <select
                      value={formData.department_id || ''}
                      onChange={(e) => setFormData({...formData, department_id: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Seleccionar departamento</option>
                      {departments
                        .filter(dept => !dept.status || dept.status === 'active' || dept.status === 'activo')
                        .map(dept => (
                          <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Posición *</label>
                    <select
                      value={formData.position_id || ''}
                      onChange={(e) => setFormData({...formData, position_id: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Seleccionar posición</option>
                      {positions.filter(pos => !formData.department_id || pos.department_id === formData.department_id).map(pos => (
                        <option key={pos.id} value={pos.id}>{pos.title}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Empleado *</label>
                    <select
                      value={formData.employee_type_id || ''}
                      onChange={(e) => setFormData({...formData, employee_type_id: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Seleccionar tipo</option>
                      {employeeTypes.map(type => (
                        <option key={type.id} value={type.id}>{type.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Salario *</label>
                    <select
                      value={formData.salary_type_id || ''}
                      onChange={(e) => setFormData({...formData, salary_type_id: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Seleccionar tipo</option>
                      {salaryTypes.map(type => (
                        <option key={type.id} value={type.id}>{type.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Salario Base * {formData.salary_type_id === '2' ? '(por hora)' : '(mensual)'}
                    </label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      value={formData.base_salary || ''}
                      onChange={(e) => setFormData({...formData, base_salary: parseFloat(e.target.value)})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Contratación *</label>
                    <input
                      type="date"
                      value={formData.hire_date || ''}
                      onChange={(e) => setFormData({...formData, hire_date: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado <span className="text-red-500">*</span></label>
                  <select
                    value={formData.status || 'active'}
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                    <option value="suspended">Suspendido</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Información de Contacto */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="text-lg font-medium text-gray-900 border-b pb-2">Información de Contacto</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input
                      type="email"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
                    <input
                      type="tel"
                      value={formData.phone || ''}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="809-000-0000"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contacto de Emergencia *</label>
                    <input
                      type="text"
                      value={formData.emergency_contact || ''}
                      onChange={(e) => setFormData({...formData, emergency_contact: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Nombre del contacto"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono de Emergencia *</label>
                    <input
                      type="tel"
                      value={formData.emergency_phone || ''}
                      onChange={(e) => setFormData({...formData, emergency_phone: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="809-000-0000"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-lg font-medium text-gray-900 border-b pb-2">Información Bancaria</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Banco</label>
                    <input
                      type="text"
                      list="bancos-list"
                      value={formData.bank_name || ''}
                      onChange={(e) => setFormData({...formData, bank_name: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Escriba o seleccione el banco"
                    />
                    <datalist id="bancos-list">
                      <option value="Banco Popular Dominicano" />
                      <option value="Banco BHD Leon" />
                      <option value="Banco de Reservas" />
                      <option value="Banco Promerica" />
                      <option value="Banco Santa Cruz" />
                      <option value="Banco Caribe" />
                      <option value="Banco Vimenca" />
                      <option value="Banco Lopez de Haro" />
                      <option value="Banco BDI" />
                      <option value="Banco Ademi" />
                      <option value="Banco Adopem" />
                      <option value="Asociacion Popular" />
                      <option value="Asociacion Cibao" />
                      <option value="Asociacion La Nacional" />
                      <option value="Asociacion Duarte" />
                      <option value="Banreservas" />
                      <option value="Scotiabank" />
                      <option value="Citibank" />
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Número de Cuenta</label>
                    <input
                      type="text"
                      value={formData.bank_account || ''}
                      onChange={(e) => setFormData({...formData, bank_account: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={handleCloseModal}
                className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors whitespace-nowrap"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {loading ? 'Guardando...' : (selectedEmployee ? 'Actualizar' : 'Crear')}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 px-4 sm:px-6 lg:px-8 pt-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestión de Empleados</h1>
            <p className="text-gray-600">Administrar información completa de empleados</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => window.REACT_APP_NAVIGATE('/payroll')}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium shadow-sm hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              <i className="ri-arrow-left-line"></i>
              <span>Volver a Nóminas</span>
            </button>
            <button
              onClick={() => handleOpenModal('create')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-add-line mr-2"></i>
              Agregar Empleado
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <input
                type="text"
                placeholder="Buscar empleados..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todos los departamentos</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>
            <div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todos los estados</option>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
                <option value="suspended">Suspendido</option>
              </select>
            </div>
            <div>
              <button
                onClick={exportToExcel}
                className="w-full bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
              >
                <i className="ri-download-line mr-2"></i>
                Exportar
              </button>
            </div>
            <div className="text-sm text-gray-600 flex items-center">
              Mostrando {filteredEmployees.length} de {employees.length} empleados
            </div>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedEmployees.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-blue-800 font-medium">
                {selectedEmployees.length} empleado(s) seleccionado(s)
              </span>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleBulkAction('activar')}
                  className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
                >
                  Activar
                </button>
                <button
                  onClick={() => handleBulkAction('suspender')}
                  className="bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700 transition-colors"
                >
                  Suspender
                </button>
                <button
                  onClick={() => handleBulkAction('desactivar')}
                  className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 transition-colors"
                >
                  Desactivar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Employees Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedEmployees.length === filteredEmployees.length && filteredEmployees.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedEmployees(filteredEmployees.map(emp => emp.id));
                        } else {
                          setSelectedEmployees([]);
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empleado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contacto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Departamento</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Posición</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Salario</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredEmployees.map((employee) => (
                  <tr key={employee.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedEmployees.includes(employee.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedEmployees(prev => [...prev, employee.id]);
                          } else {
                            setSelectedEmployees(prev => prev.filter(id => id !== employee.id));
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {employee.employee_code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {employee.first_name} {employee.last_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {employee.identification}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{employee.email}</div>
                      <div className="text-sm text-gray-500">{employee.phone}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {getDepartmentName(employee.department_id)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {getPositionTitle(employee.position_id)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.salary_type_id === '2' ? 
                        `RD$${employee.base_salary}/h` : 
                        `RD$${employee.base_salary.toLocaleString()}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        employee.status === 'active' ? 'bg-green-100 text-green-800' :
                        employee.status === 'inactive' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {employee.status === 'active' ? 'Activo' :
                         employee.status === 'inactive' ? 'Inactivo' : 'Suspendido'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleOpenModal('edit', employee)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <i className="ri-edit-line"></i>
                      </button>
                      <button
                        onClick={() => handleOpenModal('details', employee)}
                        className="text-green-600 hover:text-green-900"
                      >
                        <i className="ri-eye-line"></i>
                      </button>
                      <button
                        onClick={() => handleDelete(employee.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <i className="ri-delete-bin-line"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal */}
        {renderModal()}
      </div>
    </DashboardLayout>
  );
}