
 import { useState, useEffect } from 'react';
 import { useAuth } from '../../hooks/useAuth';
 import { supabase } from '../../lib/supabase';
 import { departmentsService, positionsService, employeesService, payrollService, taxService, settingsService, resolveTenantId } from '../../services/database';
 import { exportToExcelWithHeaders } from '../../utils/exportImportUtils';
 import { formatMoney } from '../../utils/numberFormat';

interface Employee {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  department_id: string;
  position_id: string;
  salary: number;
  hire_date: string;
  status: 'active' | 'inactive';
  bank_account?: string;
  identification?: string;
  address?: string;
  emergency_contact?: string;
  emergency_phone?: string;
}

interface Department {
  id: string;
  name: string;
  description: string;
  budget?: number;
  manager_id?: string;
}

interface Position {
  id: string;
  title: string;
  description: string;
  department_id: string;
  min_salary?: number;
  max_salary?: number;
  is_active: boolean;
}

interface PayrollPeriod {
  id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  pay_date: string;
  status: 'open' | 'processing' | 'closed' | 'paid';
  total_gross: number;
  total_deductions: number;
  total_net: number;
  employee_count: number;
}

interface PayrollEntry {
  id: string;
  employee_id: string;
  period_id: string;
  gross_salary: number;
  overtime_hours: number;
  overtime_amount: number;
  bonuses: number;
  deductions: number;
  net_salary: number;
  status: 'draft' | 'approved' | 'paid';
}

export default function PayrollPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);
  const [payrollEntries, setPayrollEntries] = useState<PayrollEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [tssConfig, setTssConfig] = useState<any | null>(null);

  useEffect(() => {
    loadData();
    loadTssConfig();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [emps, depts, poss, periods] = await Promise.all([
        employeesService.getAll(user.id),
        departmentsService.getAll(user.id),
        positionsService.getAll(user.id),
        payrollService.getPeriods(user.id)
      ]);

      const mappedEmployees: Employee[] = (emps || []).map((e: any) => ({
        id: e.id,
        employee_code: e.employee_code || '',
        first_name: e.first_name || '',
        last_name: e.last_name || '',
        email: e.email || '',
        phone: e.phone || '',
        department_id: e.department_id || '',
        position_id: e.position_id || '',
        salary: Number(e.base_salary || e.salary) || 0,
        hire_date: e.hire_date || new Date().toISOString().slice(0, 10),
        status: (e.status as 'active' | 'inactive') || 'active',
        bank_account: e.bank_account || undefined,
        identification: e.identification || undefined,
        address: e.address || undefined,
        emergency_contact: e.emergency_contact || undefined,
        emergency_phone: e.emergency_phone || undefined,
      }));

      const mappedPeriods: PayrollPeriod[] = (periods || []).map((p: any) => {
        const rawStatus = (p.status ?? 'open') as string;
        const normalized: PayrollPeriod['status'] = (() => {
          const value = String(rawStatus).toLowerCase();
          if (value === 'open' || value === 'abierto' || value === 'draft') return 'open';
          if (value === 'processing' || value === 'procesando' || value === 'calculated') return 'processing';
          if (value === 'closed' || value === 'cerrado') return 'closed';
          if (value === 'paid' || value === 'pagado') return 'paid';
          return 'open';
        })();

        return {
          id: p.id,
          period_name: p.period_name || p.name || '',
          start_date: p.start_date || new Date().toISOString().slice(0, 10),
          end_date: p.end_date || new Date().toISOString().slice(0, 10),
          pay_date: p.pay_date || new Date().toISOString().slice(0, 10),
          status: normalized,
          total_gross: Number(p.total_gross) || 0,
          total_deductions: Number(p.total_deductions) || 0,
          total_net: Number(p.total_net) || 0,
          employee_count: Number(p.employee_count) || 0,
        };
      });

      setEmployees(mappedEmployees);
      setDepartments(depts || []);
      setPositions(poss || []);
      setPayrollPeriods(mappedPeriods);
    } catch (error) {
      console.error('Error loading payroll catalogs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTssConfig = async () => {
    try {
      const data = await taxService.getTaxConfiguration();
      if (data && data.tss_rates) {
        setTssConfig(data.tss_rates);
      } else {
        setTssConfig(null);
      }
    } catch (error) {
      console.error('Error loading TSS configuration for payroll:', error);
      setTssConfig(null);
    }
  };

  const handleOpenModal = (type: string, item: any = null) => {
    setModalType(type);
    setSelectedItem(item);
    setFormData(item || {});
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setModalType('');
    setSelectedItem(null);
    setFormData({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!user) return;

      if (modalType === 'employee') {
        const payload: any = {
          first_name: formData.first_name || '',
          last_name: formData.last_name || '',
          email: formData.email || '',
          phone: formData.phone || '',
          department_id: formData.department_id || null,
          position_id: formData.position_id || null,
          salary: Number(formData.salary) || 0,
          hire_date: formData.hire_date || new Date().toISOString().slice(0, 10),
          bank_account: formData.bank_account || null,
          identification: formData.identification || null,
          address: formData.address || null,
          emergency_contact: formData.emergency_contact || null,
          emergency_phone: formData.emergency_phone || null,
          status: formData.status || 'active',
        };

        if (selectedItem) {
          const updated = await employeesService.update(selectedItem.id, payload);
          setEmployees(prev => prev.map(emp => 
            emp.id === selectedItem.id
              ? {
                  id: updated.id,
                  employee_code: updated.employee_code || '',
                  first_name: updated.first_name || '',
                  last_name: updated.last_name || '',
                  email: updated.email || '',
                  phone: updated.phone || '',
                  department_id: updated.department_id || '',
                  position_id: updated.position_id || '',
                  salary: Number(updated.salary) || 0,
                  hire_date: updated.hire_date || new Date().toISOString().slice(0, 10),
                  status: (updated.status as 'active' | 'inactive') || 'active',
                  bank_account: updated.bank_account || undefined,
                  identification: updated.identification || undefined,
                  address: updated.address || undefined,
                  emergency_contact: updated.emergency_contact || undefined,
                  emergency_phone: updated.emergency_phone || undefined,
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
            department_id: created.department_id || '',
            position_id: created.position_id || '',
            salary: Number(created.salary) || 0,
            hire_date: created.hire_date || new Date().toISOString().slice(0, 10),
            status: (created.status as 'active' | 'inactive') || 'active',
            bank_account: created.bank_account || undefined,
            identification: created.identification || undefined,
            address: created.address || undefined,
            emergency_contact: created.emergency_contact || undefined,
            emergency_phone: created.emergency_phone || undefined,
          };
          setEmployees(prev => [...prev, newEmployee]);
        }
      } else if (modalType === 'department') {
        const payload: any = {
          name: formData.name || '',
          description: formData.description || '',
          budget: formData.budget != null ? Number(formData.budget) : null,
        };

        if (selectedItem) {
          const updated = await departmentsService.update(selectedItem.id, payload);
          setDepartments(prev => prev.map(dept => 
            dept.id === selectedItem.id
              ? {
                  id: updated.id,
                  name: updated.name || '',
                  description: updated.description || '',
                  budget: updated.budget != null ? Number(updated.budget) : undefined,
                  manager_id: updated.manager_id || undefined,
                }
              : dept
          ));
        } else {
          const created = await departmentsService.create(user.id, payload);
          const newDepartment: Department = {
            id: created.id,
            name: created.name || '',
            description: created.description || '',
            budget: created.budget != null ? Number(created.budget) : undefined,
            manager_id: created.manager_id || undefined,
          };
          setDepartments(prev => [...prev, newDepartment]);
        }
      } else if (modalType === 'position') {
        const payload: any = {
          title: formData.title || '',
          description: formData.description || '',
          department_id: formData.department_id || null,
          min_salary: formData.min_salary != null ? Number(formData.min_salary) : null,
          max_salary: formData.max_salary != null ? Number(formData.max_salary) : null,
          is_active: formData.is_active != null ? !!formData.is_active : true,
        };

        if (selectedItem) {
          const updated = await positionsService.update(selectedItem.id, payload);
          setPositions(prev => prev.map(pos => 
            pos.id === selectedItem.id
              ? {
                  id: updated.id,
                  title: updated.title || '',
                  description: updated.description || '',
                  department_id: updated.department_id || '',
                  min_salary: updated.min_salary != null ? Number(updated.min_salary) : undefined,
                  max_salary: updated.max_salary != null ? Number(updated.max_salary) : undefined,
                  is_active: updated.is_active !== false,
                }
              : pos
          ));
        } else {
          const created = await positionsService.create(user.id, payload);
          const newPosition: Position = {
            id: created.id,
            title: created.title || '',
            description: created.description || '',
            department_id: created.department_id || '',
            min_salary: created.min_salary != null ? Number(created.min_salary) : undefined,
            max_salary: created.max_salary != null ? Number(created.max_salary) : undefined,
            is_active: created.is_active !== false,
          };
          setPositions(prev => [...prev, newPosition]);
        }
      } else if (modalType === 'payroll-period') {
        const payload: any = {
          period_name: formData.period_name || '',
          name: formData.period_name || '',
          start_date: formData.start_date || new Date().toISOString().slice(0, 10),
          end_date: formData.end_date || new Date().toISOString().slice(0, 10),
          pay_date: formData.pay_date || new Date().toISOString().slice(0, 10),
          // Guardamos en la base en inglés para cumplir con el constraint de status
          status: 'open',
          total_gross: 0,
          total_deductions: 0,
          total_net: 0,
          employee_count: 0,
        };

        const created = await payrollService.createPeriod(user.id, payload);
        const newPeriod: PayrollPeriod = {
          id: created.id,
          period_name: created.period_name || payload.period_name,
          start_date: created.start_date || payload.start_date,
          end_date: created.end_date || payload.end_date,
          pay_date: created.pay_date || payload.pay_date,
          status: 'open',
          total_gross: Number(created.total_gross) || 0,
          total_deductions: Number(created.total_deductions) || 0,
          total_net: Number(created.total_net) || 0,
          employee_count: Number(created.employee_count) || 0,
        };
        setPayrollPeriods(prev => [...prev, newPeriod]);
      }

      handleCloseModal();
    } catch (error) {
      console.error('Error saving data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, type: string) => {
    if (!confirm('¿Está seguro de que desea eliminar este elemento?')) return;

    try {
      if (type === 'employee') {
        await employeesService.delete(id);
        setEmployees(prev => prev.filter(emp => emp.id !== id));
      } else if (type === 'department') {
        await departmentsService.delete(id);
        setDepartments(prev => prev.filter(dept => dept.id !== id));
      } else if (type === 'position') {
        await positionsService.delete(id);
        setPositions(prev => prev.filter(pos => pos.id !== id));
      }
    } catch (error) {
      console.error('Error deleting record:', error);
      alert('Ocurrió un error al eliminar el registro.');
    }
  };

  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = searchTerm === '' || 
      employee.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.employee_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email.toLowerCase().includes(searchTerm.toLowerCase());
    
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

  const calculateDashboardStats = () => {
    const totalEmployees = employees.length;
    const activeEmployees = employees.filter(emp => emp.status === 'active').length;
    const totalSalaries = employees.reduce((sum, emp) => sum + emp.salary, 0);
    const avgSalary = totalEmployees > 0 ? totalSalaries / totalEmployees : 0;
    const openPeriods = payrollPeriods.filter(period => period.status === 'open').length;
    const processingPeriods = payrollPeriods.filter(period => period.status === 'processing').length;

    return {
      totalEmployees,
      activeEmployees,
      totalSalaries,
      avgSalary,
      openPeriods,
      processingPeriods
    };
  };

  const handleViewPeriodDetails = async (period: PayrollPeriod) => {
    try {
      setLoading(true);
      const entries = await payrollService.getEntries(period.id);
      setSelectedItem(period);
      setPayrollEntries(entries || []);
      setModalType('payroll-period-details');
      setShowModal(true);
    } catch (error) {
      console.error('Error loading payroll entries:', error);
      alert('Ocurrió un error al cargar los detalles de la nómina.');
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = async (data: any[], filename: string, title?: string) => {
    if (!data || data.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    let companyName = 'ContaBi';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName =
          (info as any).name ||
          (info as any).company_name ||
          (info as any).legal_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error obteniendo información de la empresa para Excel de nómina:', error);
    }

    const headersKeys = Object.keys(data[0] || {});
    const headers = headersKeys.map((key) => ({ key, title: key }));

    const fileBase = `${filename}_${new Date().toISOString().split('T')[0]}`;
    const reportTitle = title || filename.replace(/_/g, ' ');

    exportToExcelWithHeaders(
      data,
      headers,
      fileBase,
      'Reporte',
      undefined,
      {
        title: reportTitle,
        companyName,
      },
    );
  };

  const handleBulkAction = (action: string) => {
    if (selectedEmployees.length === 0) {
      alert('Seleccione al menos un empleado');
      return;
    }

    if (!confirm(`¿Está seguro de que desea ${action} ${selectedEmployees.length} empleado(s)?`)) return;

    if (action === 'activate') {
      setEmployees(prev => prev.map(emp => 
        selectedEmployees.includes(emp.id) ? { ...emp, status: 'active' } : emp
      ));
    } else if (action === 'deactivate') {
      setEmployees(prev => prev.map(emp => 
        selectedEmployees.includes(emp.id) ? { ...emp, status: 'inactive' } : emp
      ));
    }

    setSelectedEmployees([]);
  };

  const processPayroll = async (periodId: string) => {
    if (!user) {
      alert('Debe iniciar sesión para procesar la nómina.');
      return;
    }

    if (!confirm('¿Está seguro de que desea procesar esta nómina?')) return;

    try {
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        alert('No se pudo determinar la empresa del usuario.');
        return;
      }

      const activeEmployees = employees.filter(emp => emp.status === 'active');

      if (activeEmployees.length === 0) {
        alert('No hay empleados activos para procesar.');
        return;
      }

      const budgetViolations: { departmentName: string; payroll: number; budget: number }[] = [];

      departments.forEach(dept => {
        const deptEmployees = activeEmployees.filter(emp => emp.department_id === dept.id);
        if (deptEmployees.length === 0) return;

        const deptPayroll = deptEmployees.reduce(
          (sum, emp) => sum + (Number(emp.salary) || 0),
          0
        );
        const budget = Number((dept as any).budget) || 0;

        if (budget > 0 && deptPayroll > budget) {
          budgetViolations.push({
            departmentName: dept.name,
            payroll: deptPayroll,
            budget,
          });
        }
      });

      if (budgetViolations.length > 0) {
        const details = budgetViolations
          .map(v => `${v.departmentName}: nómina ${formatMoney(v.payroll, 'RD$')} vs presupuesto ${formatMoney(v.budget, 'RD$')}`)
          .join('\n');
        alert(
          `La nómina calculada supera el presupuesto de uno o más departamentos:\n\n${details}\n\nAjuste salarios, asignaciones o presupuestos antes de procesar.`
        );
        return;
      }

      const entries = activeEmployees.map(emp => {
        const gross = Number(emp.salary) || 0;

        let baseSalary = gross;
        let employeeRate = 0;

        if (tssConfig) {
          const sfsEmp = Number(tssConfig.sfs_employee) || 0;
          const afpEmp = Number(tssConfig.afp_employee) || 0;
          const configuredRate = sfsEmp + afpEmp;
          const fallbackRate = 16.67;
          employeeRate = configuredRate > 0 ? configuredRate : fallbackRate;

          const maxSalary = Number(tssConfig.max_salary_tss) || 0;
          if (maxSalary > 0) {
            baseSalary = Math.min(gross, maxSalary);
          }
        } else {
          employeeRate = 16.67;
        }

        const deductions = baseSalary * (employeeRate / 100);
        const net = Math.max(0, gross - deductions);
        return {
          user_id: tenantId,
          payroll_period_id: periodId,
          employee_id: emp.id,
          gross_salary: gross,
          overtime_hours: 0,
          overtime_amount: 0,
          bonuses: 0,
          deductions,
          net_salary: net,
          status: 'approved',
        };
      });

      if (entries.length === 0) {
        alert('No hay empleados activos para procesar.');
        return;
      }

      await payrollService.processPayroll(periodId, entries);

      const total_gross = entries.reduce((sum, e) => sum + (e.gross_salary || 0), 0);
      const total_deductions = entries.reduce((sum, e) => sum + (e.deductions || 0), 0);
      const total_net = entries.reduce((sum, e) => sum + (e.net_salary || 0), 0);
      const employee_count = activeEmployees.length;

      // Actualizar el período en la base de datos para que al recargar mantenga el estado
      await supabase
        .from('payroll_periods')
        .update({
          status: 'processing',
          total_gross,
          total_deductions,
          total_net,
          employee_count,
        })
        .eq('id', periodId)
        .eq('user_id', tenantId);

      setPayrollPeriods(prev => prev.map(period => 
        period.id === periodId
          ? {
              ...period,
              status: 'processing',
              total_gross,
              total_deductions,
              total_net,
              employee_count,
            }
          : period
      ));

      alert('Nómina procesada correctamente.');
    } catch (error) {
      console.error('Error processing payroll:', error);
      alert('Ocurrió un error al procesar la nómina.');
    }
  };

  const renderDashboard = () => {
    const stats = calculateDashboardStats();

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Dashboard de Nómina</h2>
            <p className="text-gray-600">Resumen general del sistema de nómina</p>
          </div>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/dashboard')}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium shadow-sm hover:bg-gray-50 hover:border-gray-400 transition-colors"
          >
            <i className="ri-arrow-left-line"></i>
            <span>Volver al Inicio</span>
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-blue-100">
                <i className="ri-user-line text-2xl text-blue-600"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Empleados</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.totalEmployees}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-green-100">
                <i className="ri-user-check-line text-2xl text-green-600"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Empleados Activos</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.activeEmployees}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-yellow-100">
                <i className="ri-money-dollar-circle-line text-2xl text-yellow-600"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Nómina Total</p>
                <p className="text-2xl font-semibold text-gray-900">{formatMoney(stats.totalSalaries, 'RD$')}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-purple-100">
                <i className="ri-calculator-line text-2xl text-purple-600"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Salario Promedio</p>
                <p className="text-2xl font-semibold text-gray-900">{formatMoney(Math.round(stats.avgSalary), 'RD$')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Departamentos */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Empleados por Departamento</h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {departments.map(dept => {
                  const deptEmployees = employees.filter(emp => emp.department_id === dept.id);
                  const deptSalaries = deptEmployees.reduce((sum, emp) => sum + emp.salary, 0);
                  return (
                    <div key={dept.id} className="flex justify-between items-center">
                      <div>
                        <p className="font-medium text-gray-900">{dept.name}</p>
                        <p className="text-sm text-gray-500">{deptEmployees.length} empleados</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-gray-900">{formatMoney(deptSalaries, 'RD$')}</p>
                        <p className="text-sm text-gray-500">Nómina mensual</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Períodos Recientes */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Períodos de Nómina Recientes</h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {payrollPeriods.slice(0, 5).map(period => (
                  <div key={period.id} className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900">{period.period_name}</p>
                      <p className="text-sm text-gray-500">{period.employee_count} empleados</p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        period.status === 'paid' ? 'bg-green-100 text-green-800' :
                        period.status === 'closed' ? 'bg-blue-100 text-blue-800' :
                        period.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {period.status === 'paid' ? 'Pagado' :
                         period.status === 'closed' ? 'Cerrado' :
                         period.status === 'processing' ? 'Procesando' : 'Abierto'}
                      </span>
                      <p className="text-sm text-gray-500 mt-1">{formatMoney(period.total_net, 'RD$')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Acciones Rápidas</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => handleOpenModal('employee')}
              className="flex items-center justify-center space-x-2 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <i className="ri-user-add-line"></i>
              <span>Agregar Empleado</span>
            </button>
            <button
              onClick={() => handleOpenModal('payroll-period')}
              className="flex items-center justify-center space-x-2 bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors"
            >
              <i className="ri-calendar-line"></i>
              <span>Nuevo Período</span>
            </button>
            <button
              onClick={() => exportToExcel(employees.map(emp => ({
                Código: emp.employee_code,
                Nombre: `${emp.first_name} ${emp.last_name}`,
                Departamento: getDepartmentName(emp.department_id),
                Posición: getPositionTitle(emp.position_id),
                Salario: emp.salary,
                Estado: emp.status
              })), 'empleados', 'Reporte de Empleados')}
              className="flex items-center justify-center space-x-2 bg-purple-600 text-white px-4 py-3 rounded-lg hover:bg-purple-700 transition-colors"
            >
              <i className="ri-download-line"></i>
              <span>Exportar Empleados</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderEmployees = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Gestión de Empleados</h3>
        <button
          onClick={() => handleOpenModal('employee')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          Agregar Empleado
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            </select>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => exportToExcel(filteredEmployees.map(emp => ({
                Código: emp.employee_code,
                Nombre: `${emp.first_name} ${emp.last_name}`,
                Email: emp.email,
                Teléfono: emp.phone,
                Departamento: getDepartmentName(emp.department_id),
                Posición: getPositionTitle(emp.position_id),
                Salario: emp.salary,
                'Fecha Contratación': emp.hire_date,
                Estado: emp.status
              })), 'empleados_filtrados', 'Empleados (Filtros Aplicados)')}
              className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-download-line"></i>
            </button>
          </div>
        </div>
        <div className="mt-4 text-sm text-gray-600">
          Mostrando {filteredEmployees.length} de {employees.length} empleados
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
                onClick={() => handleBulkAction('activate')}
                className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
              >
                Activar
              </button>
              <button
                onClick={() => handleBulkAction('deactivate')}
                className="bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700 transition-colors"
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
                        Contratado: {new Date(employee.hire_date).toLocaleDateString('es-DO')}
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
                    {formatMoney(employee.salary, 'RD$')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      employee.status === 'active' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {employee.status === 'active' ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleOpenModal('employee', employee)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      <i className="ri-edit-line"></i>
                    </button>
                    <button
                      onClick={() => handleOpenModal('employee-details', employee)}
                      className="text-green-600 hover:text-green-900"
                    >
                      <i className="ri-eye-line"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderDepartments = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Departamentos</h3>
        <button
          onClick={() => handleOpenModal('department')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          Agregar Departamento
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {departments.map((department) => {
          const deptEmployees = employees.filter(emp => emp.department_id === department.id);
          const deptSalaries = deptEmployees.reduce((sum, emp) => sum + emp.salary, 0);
          
          return (
            <div key={department.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start mb-4">
                <h4 className="text-lg font-semibold text-gray-900">{department.name}</h4>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleOpenModal('department', department)}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    <i className="ri-edit-line"></i>
                  </button>
                </div>
              </div>
              <p className="text-gray-600 mb-4">{department.description}</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Empleados:</span>
                  <span className="text-sm font-medium">{deptEmployees.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Nómina mensual:</span>
                  <span className="text-sm font-medium">{formatMoney(deptSalaries, 'RD$')}</span>
                </div>
                {department.budget && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Presupuesto:</span>
                    <span className="text-sm font-medium">{formatMoney(department.budget, 'RD$')}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderPositions = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Posiciones</h3>
        <button
          onClick={() => handleOpenModal('position')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          Agregar Posición
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Título</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Departamento</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empleados</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rango Salarial</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {positions.map((position) => {
                const posEmployees = employees.filter(emp => emp.position_id === position.id);
                
                return (
                  <tr key={position.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{position.title}</div>
                        <div className="text-sm text-gray-500">{position.description}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {getDepartmentName(position.department_id)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {posEmployees.length}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {position.min_salary && position.max_salary ? (
                        `${formatMoney(position.min_salary, 'RD$')} - ${formatMoney(position.max_salary, 'RD$')}`
                      ) : 'No definido'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        position.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {position.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleOpenModal('position', position)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <i className="ri-edit-line"></i>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderPayroll = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Períodos de Nómina</h3>
        <button
          onClick={() => handleOpenModal('payroll-period')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          Nuevo Período
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {payrollPeriods.map((period) => (
          <div key={period.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start mb-4">
              <h4 className="text-lg font-semibold text-gray-900">{period.period_name}</h4>
              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                period.status === 'paid' ? 'bg-green-100 text-green-800' :
                period.status === 'closed' ? 'bg-blue-100 text-blue-800' :
                period.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {period.status === 'paid' ? 'Pagado' :
                 period.status === 'closed' ? 'Cerrado' :
                 period.status === 'processing' ? 'Procesando' : 'Abierto'}
              </span>
            </div>
            <div className="space-y-2 text-sm text-gray-600">
              <p>Inicio: {new Date(period.start_date).toLocaleDateString('es-DO')}</p>
              <p>Fin: {new Date(period.end_date).toLocaleDateString('es-DO')}</p>
              <p>Pago: {new Date(period.pay_date).toLocaleDateString('es-DO')}</p>
              <p>Empleados: {period.employee_count}</p>
              {period.total_net > 0 && (
                <>
                  <p className="font-semibold text-gray-900">
                    Bruto: {formatMoney(period.total_gross, 'RD$')}
                  </p>
                  <p className="text-red-600">
                    Deducciones: {formatMoney(period.total_deductions, 'RD$')}
                  </p>
                  <p className="font-semibold text-green-600">
                    Neto: {formatMoney(period.total_net, 'RD$')}
                  </p>
                </>
              )}
            </div>
            <div className="mt-4 flex space-x-2">
              <button
                onClick={() => processPayroll(period.id)}
                className="flex-1 bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                Procesar Nómina
              </button>
              <button
                onClick={() => handleViewPeriodDetails(period)}
                className="flex-1 bg-gray-600 text-white px-3 py-2 rounded text-sm hover:bg-gray-700 transition-colors whitespace-nowrap"
              >
                Ver Detalles
              </button>
              <button 
                onClick={() => exportToExcel([{
                  Período: period.period_name,
                  'Fecha Inicio': period.start_date,
                  'Fecha Fin': period.end_date,
                  'Fecha Pago': period.pay_date,
                  Estado: period.status,
                  'Total Bruto': period.total_gross,
                  'Total Deducciones': period.total_deductions,
                  'Total Neto': period.total_net,
                  'Empleados': period.employee_count
                }], `nomina_${period.period_name.replace(' ', '_')}`, `Nómina - ${period.period_name}`)}
                className="bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700 transition-colors"
              >
                <i className="ri-download-line"></i>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderReports = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Reportes de Nómina</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Reporte de Empleados */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="p-3 rounded-full bg-blue-100">
              <i className="ri-user-line text-2xl text-blue-600"></i>
            </div>
            <div className="ml-4">
              <h4 className="text-lg font-semibold text-gray-900">Reporte de Empleados</h4>
              <p className="text-sm text-gray-500">Lista completa de empleados</p>
            </div>
          </div>
          <button
            onClick={() => exportToExcel(employees.map(emp => ({
              Código: emp.employee_code,
              Nombre: `${emp.first_name} ${emp.last_name}`,
              Email: emp.email,
              Teléfono: emp.phone,
              Departamento: getDepartmentName(emp.department_id),
              Posición: getPositionTitle(emp.position_id),
              Salario: emp.salary,
              'Fecha Contratación': emp.hire_date,
              Estado: emp.status,
              'Cuenta Bancaria': emp.bank_account || '',
              Identificación: emp.identification || '',
              Dirección: emp.address || ''
            })), 'reporte_empleados', 'Reporte de Empleados')}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <i className="ri-download-line mr-2"></i>
            Descargar Reporte
          </button>
        </div>

        {/* Reporte de Nómina por Departamento */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="p-3 rounded-full bg-green-100">
              <i className="ri-building-line text-2xl text-green-600"></i>
            </div>
            <div className="ml-4">
              <h4 className="text-lg font-semibold text-gray-900">Nómina por Departamento</h4>
              <p className="text-sm text-gray-500">Resumen por departamentos</p>
            </div>
          </div>
          <button
            onClick={() => exportToExcel(departments.map(dept => {
              const deptEmployees = employees.filter(emp => emp.department_id === dept.id);
              const totalSalaries = deptEmployees.reduce((sum, emp) => sum + emp.salary, 0);
              return {
                Departamento: dept.name,
                Descripción: dept.description,
                'Número de Empleados': deptEmployees.length,
                'Nómina Total': formatMoney(totalSalaries, 'RD$'),
                'Salario Promedio': deptEmployees.length > 0 ? Math.round(totalSalaries / deptEmployees.length) : 0,
                Presupuesto: dept.budget || 0
              };
            }), 'nomina_por_departamento')}
            className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            <i className="ri-download-line mr-2"></i>
            Descargar Reporte
          </button>
        </div>

        {/* Reporte de Períodos de Nómina */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="p-3 rounded-full bg-purple-100">
              <i className="ri-calendar-line text-2xl text-purple-600"></i>
            </div>
            <div className="ml-4">
              <h4 className="text-lg font-semibold text-gray-900">Períodos de Nómina</h4>
              <p className="text-sm text-gray-500">Historial de períodos</p>
            </div>
          </div>
          <button
            onClick={() => exportToExcel(payrollPeriods.map(period => ({
              Período: period.period_name,
              'Fecha Inicio': period.start_date,
              'Fecha Fin': period.end_date,
              'Fecha Pago': period.pay_date,
              Estado: period.status,
              'Empleados': period.employee_count,
              'Total Bruto': period.total_gross,
              'Total Deducciones': period.total_deductions,
              'Total Neto': period.total_net
            })), 'periodos_nomina')}
            className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
          >
            <i className="ri-download-line mr-2"></i>
            Descargar Reporte
          </button>
        </div>

        {/* Reporte de Análisis Salarial */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="p-3 rounded-full bg-yellow-100">
              <i className="ri-bar-chart-line text-2xl text-yellow-600"></i>
            </div>
            <div className="ml-4">
              <h4 className="text-lg font-semibold text-gray-900">Análisis Salarial</h4>
              <p className="text-sm text-gray-500">Estadísticas salariales</p>
            </div>
          </div>
          <button
            onClick={() => {
              const stats = calculateDashboardStats();
              const salaryRanges = {
                'Menos de 30,000': employees.filter(emp => emp.salary < 30000).length,
                '30,000 - 50,000': employees.filter(emp => emp.salary >= 30000 && emp.salary < 50000).length,
                '50,000 - 70,000': employees.filter(emp => emp.salary >= 50000 && emp.salary < 70000).length,
                '70,000 - 90,000': employees.filter(emp => emp.salary >= 70000 && emp.salary < 90000).length,
                'Más de 90,000': employees.filter(emp => emp.salary >= 90000).length
              };
              
              exportToExcel([
                { Métrica: 'Total de Empleados', Valor: stats.totalEmployees },
                { Métrica: 'Empleados Activos', Valor: stats.activeEmployees },
                { Métrica: 'Nómina Total Mensual', Valor: formatMoney(stats.totalSalaries, 'RD$') },
                { Métrica: 'Salario Promedio', Valor: formatMoney(Math.round(stats.avgSalary), 'RD$') },
                ...Object.entries(salaryRanges).map(([rango, cantidad]) => ({
                  Métrica: `Empleados con salario ${rango}`,
                  Valor: cantidad
                }))
              ], 'analisis_salarial');
            }}
            className="w-full bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors"
          >
            <i className="ri-download-line mr-2"></i>
            Descargar Análisis
          </button>
        </div>
      </div>
    </div>
  );

  const renderModal = () => {
    if (!showModal) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              {modalType === 'employee' || modalType === 'department' || modalType === 'position' || modalType === 'payroll-period'
                ? `${selectedItem ? 'Editar' : 'Agregar'} ${
                    modalType === 'employee'
                      ? 'Empleado'
                      : modalType === 'department'
                      ? 'Departamento'
                      : modalType === 'position'
                      ? 'Posición'
                      : 'Período de Nómina'
                  }`
                : modalType === 'employee-details'
                ? 'Detalles del Empleado'
                : modalType === 'payroll-period-details'
                ? 'Detalles del Período de Nómina'
                : 'Detalle'
              }
            </h3>
            <button
              onClick={handleCloseModal}
              className="text-gray-400 hover:text-gray-600"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>

          {modalType === 'employee-details' && selectedItem ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Código de Empleado</label>
                  <p className="text-sm text-gray-900">{selectedItem.employee_code}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Estado</label>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    selectedItem.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {selectedItem.status === 'active' ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nombre Completo</label>
                  <p className="text-sm text-gray-900">{selectedItem.first_name} {selectedItem.last_name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <p className="text-sm text-gray-900">{selectedItem.email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Teléfono</label>
                  <p className="text-sm text-gray-900">{selectedItem.phone}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Identificación</label>
                  <p className="text-sm text-gray-900">{selectedItem.identification || 'No especificado'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Departamento</label>
                  <p className="text-sm text-gray-900">{getDepartmentName(selectedItem.department_id)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Posición</label>
                  <p className="text-sm text-gray-900">{getPositionTitle(selectedItem.position_id)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Salario</label>
                  <p className="text-sm text-gray-900">{formatMoney(selectedItem.salary, 'RD$')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fecha de Contratación</label>
                  <p className="text-sm text-gray-900">{new Date(selectedItem.hire_date).toLocaleDateString('es-DO')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Cuenta Bancaria</label>
                  <p className="text-sm text-gray-900">{selectedItem.bank_account || 'No especificado'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Contacto de Emergencia</label>
                  <p className="text-sm text-gray-900">{selectedItem.emergency_contact || 'No especificado'}</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Dirección</label>
                <p className="text-sm text-gray-900">{selectedItem.address || 'No especificado'}</p>
              </div>
            </div>
          ) : modalType === 'payroll-period-details' && selectedItem ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Período</label>
                  <p className="text-sm text-gray-900">{selectedItem.period_name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Estado</label>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    selectedItem.status === 'paid'
                      ? 'bg-green-100 text-green-800'
                      : selectedItem.status === 'closed'
                      ? 'bg-blue-100 text-blue-800'
                      : selectedItem.status === 'processing'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {selectedItem.status === 'paid'
                      ? 'Pagado'
                      : selectedItem.status === 'closed'
                      ? 'Cerrado'
                      : selectedItem.status === 'processing'
                      ? 'Procesando'
                      : 'Abierto'}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fecha Inicio</label>
                  <p className="text-sm text-gray-900">{new Date(selectedItem.start_date).toLocaleDateString('es-DO')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fecha Fin</label>
                  <p className="text-sm text-gray-900">{new Date(selectedItem.end_date).toLocaleDateString('es-DO')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fecha de Pago</label>
                  <p className="text-sm text-gray-900">{new Date(selectedItem.pay_date).toLocaleDateString('es-DO')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Empleados Procesados</label>
                  <p className="text-sm text-gray-900">{selectedItem.employee_count}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Total Bruto</label>
                  <p className="text-sm text-gray-900">{formatMoney(Number(selectedItem.total_gross || 0), 'RD$')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Total Neto</label>
                  <p className="text-sm text-gray-900">{formatMoney(Number(selectedItem.total_net || 0), 'RD$')}</p>
                </div>
              </div>

              <div className="mt-4">
                <h4 className="text-md font-semibold text-gray-900 mb-2">Detalle por Empleado</h4>
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Empleado</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Bruto</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Deducciones</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Neto</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {payrollEntries.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-4 py-3 text-center text-gray-500">
                              No hay entradas de nómina registradas para este período.
                            </td>
                          </tr>
                        )}
                        {payrollEntries.map((entry: any) => {
                          const employeeName = entry.employees
                            ? `${entry.employees.employee_code || ''} - ${entry.employees.first_name || ''} ${entry.employees.last_name || ''}`.trim()
                            : entry.employee_id;
                          return (
                            <tr key={entry.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 whitespace-nowrap text-gray-900">{employeeName}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-right">{formatMoney(Number(entry.gross_salary || 0), 'RD$')}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-right text-red-600">{formatMoney(Number(entry.deductions || 0), 'RD$')}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-right text-green-600">{formatMoney(Number(entry.net_salary || 0), 'RD$')}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-right">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  entry.status === 'paid'
                                    ? 'bg-green-100 text-green-800'
                                    : entry.status === 'approved'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {entry.status === 'paid' ? 'Pagado' : entry.status === 'approved' ? 'Aprobado' : 'Borrador'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {modalType === 'employee' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono <span className="text-red-500">*</span></label>
                    <input
                      type="tel"
                      value={formData.phone || ''}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Identificación</label>
                    <input
                      type="text"
                      value={formData.identification || ''}
                      onChange={(e) => setFormData({...formData, identification: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="001-1234567-8"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Departamento *</label>
                    <select
                      value={formData.department_id || ''}
                      onChange={(e) => setFormData({...formData, department_id: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Seleccionar departamento</option>
                      {departments.map(dept => (
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Salario *</label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      value={formData.salary || ''}
                      onChange={(e) => setFormData({...formData, salary: parseFloat(e.target.value)})}
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta Bancaria <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={formData.bank_account || ''}
                      onChange={(e) => setFormData({...formData, bank_account: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contacto de Emergencia</label>
                    <input
                      type="text"
                      value={formData.emergency_contact || ''}
                      onChange={(e) => setFormData({...formData, emergency_contact: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono de Emergencia</label>
                    <input
                      type="tel"
                      value={formData.emergency_phone || ''}
                      onChange={(e) => setFormData({...formData, emergency_phone: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                    <textarea
                      value={formData.address || ''}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {modalType === 'department' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Departamento *</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descripción <span className="text-red-500">*</span></label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Presupuesto</label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      value={formData.budget || ''}
                      onChange={(e) => setFormData({...formData, budget: parseFloat(e.target.value)})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              {modalType === 'position' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Título de la Posición *</label>
                    <input
                      type="text"
                      value={formData.title || ''}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Departamento *</label>
                    <select
                      value={formData.department_id || ''}
                      onChange={(e) => setFormData({...formData, department_id: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Seleccionar departamento</option>
                      {departments.map(dept => (
                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Salario Mínimo</label>
                      <input
                        type="number" min="0"
                        step="0.01"
                        value={formData.min_salary || ''}
                        onChange={(e) => setFormData({...formData, min_salary: parseFloat(e.target.value)})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Salario Máximo</label>
                      <input
                        type="number" min="0"
                        step="0.01"
                        value={formData.max_salary || ''}
                        onChange={(e) => setFormData({...formData, max_salary: parseFloat(e.target.value)})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </>
              )}

              {modalType !== 'employee-details' && (
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
                    {loading ? 'Guardando...' : (selectedItem ? 'Actualizar' : 'Crear')}
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-8 pt-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Nómina</h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'dashboard', name: 'Dashboard', icon: 'ri-dashboard-line' },
            { id: 'employees', name: 'Empleados', icon: 'ri-user-line' },
            { id: 'departments', name: 'Departamentos', icon: 'ri-building-line' },
            { id: 'positions', name: 'Posiciones', icon: 'ri-briefcase-line' },
            { id: 'reports', name: 'Reportes', icon: 'ri-bar-chart-line' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <i className={`${tab.icon} mr-2`}></i>
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'employees' && renderEmployees()}
        {activeTab === 'departments' && renderDepartments()}
        {activeTab === 'positions' && renderPositions()}
        {activeTab === 'reports' && renderReports()}
      </div>

      {/* Navigation Buttons for Other Modules */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Otros Módulos de Nómina</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/configuration')}
            className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-settings-line"></i>
            <span>Configuración</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/employee-types')}
            className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-user-settings-line"></i>
            <span>Tipos de Empleados</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/salary-types')}
            className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-money-dollar-box-line"></i>
            <span>Tipos de Salario</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/concepts')}
            className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-list-check"></i>
            <span>Conceptos</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/periods')}
            className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-calendar-line"></i>
            <span>Períodos</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/commission-types')}
            className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-percent-line"></i>
            <span>Tipos de Comisión</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/vacations')}
            className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-plane-line"></i>
            <span>Vacaciones</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/overtime')}
            className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-time-line"></i>
            <span>Horas Extras</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/holidays')}
            className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-calendar-event-line"></i>
            <span>Días Feriados</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/bonuses')}
            className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-gift-line"></i>
            <span>Bonificaciones</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/royalties')}
            className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-award-line"></i>
            <span>Regalías</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/deductions')}
            className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-subtract-line"></i>
            <span>Deducciones</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/absences')}
            className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-user-unfollow-line"></i>
            <span>Ausencias</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/salary-changes')}
            className="flex items-center space-x-2 bg-orange-100 hover:bg-orange-200 text-orange-700 px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-exchange-dollar-line"></i>
            <span>Cambios de Salario</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/employee-exits')}
            className="flex items-center space-x-2 bg-red-100 hover:bg-red-200 text-red-700 px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-logout-box-line"></i>
            <span>Salida de Empleados</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/payroll-process')}
            className="flex items-center space-x-2 bg-green-100 hover:bg-green-200 text-green-700 px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-play-circle-line"></i>
            <span>Procesar Nómina</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/journal-entry')}
            className="flex items-center space-x-2 bg-blue-100 hover:bg-blue-200 text-blue-700 px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-book-2-line"></i>
            <span>Entrada al Diario</span>
          </button>
        </div>
      </div>

      {/* Modal */}
      {renderModal()}
    </div>
  );
}
