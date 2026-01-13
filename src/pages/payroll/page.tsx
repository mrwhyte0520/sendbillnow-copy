
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

const palette = {
  background: 'bg-[#f8f4ec]',
  card: 'bg-white/90 border border-[#e0d7c9] shadow-sm',
  heading: 'text-[#233022]',
  subheading: 'text-[#5b5a50]',
  accentIcon: 'bg-[#e4dac8] text-[#455139]',
  primaryButton: 'bg-[#4b5b3f] text-white hover:bg-[#3c4a30]',
  secondaryButton: 'bg-[#d8ccb6] text-[#2f2a1f] hover:bg-[#c9bca3]',
  outlineButton: 'border border-[#c6b9a2] text-[#2f2a1f] hover:bg-[#efe6d8]',
};

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
          .map(v => `${v.departmentName}: nómina ${formatMoney(v.payroll, '')} vs presupuesto ${formatMoney(v.budget, '')}`)
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
            <h2 className={`text-2xl font-bold ${palette.heading}`}>Payroll Dashboard</h2>
            <p className={`${palette.subheading}`}>High-level overview of your payroll activity</p>
          </div>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/dashboard')}
            className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors ${palette.outlineButton}`}
          >
            <i className="ri-arrow-left-line"></i>
            <span>Back to Home</span>
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              label: 'Total Employees',
              value: stats.totalEmployees,
              icon: 'ri-user-line',
            },
            {
              label: 'Active Employees',
              value: stats.activeEmployees,
              icon: 'ri-user-check-line',
            },
            {
              label: 'Total Payroll',
              value: formatMoney(stats.totalSalaries, ''),
              icon: 'ri-money-dollar-circle-line',
            },
            {
              label: 'Average Salary',
              value: formatMoney(Math.round(stats.avgSalary), ''),
              icon: 'ri-calculator-line',
            },
          ].map((card) => (
            <div key={card.label} className={`${palette.card} rounded-xl p-6`}>
              <div className="flex items-center">
                <div className={`p-3 rounded-full ${palette.accentIcon}`}>
                  <i className={`${card.icon} text-2xl`}></i>
                </div>
                <div className="ml-4">
                  <p className={`text-sm font-medium ${palette.subheading}`}>{card.label}</p>
                  <p className={`text-2xl font-semibold ${palette.heading}`}>{card.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Departments */}
          <div className={`${palette.card} rounded-xl`}>
            <div className="p-6 border-b border-[#e7decd]">
              <h3 className={`text-lg font-semibold ${palette.heading}`}>Employees by Department</h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {departments.map(dept => {
                  const deptEmployees = employees.filter(emp => emp.department_id === dept.id);
                  const deptSalaries = deptEmployees.reduce((sum, emp) => sum + emp.salary, 0);
                  return (
                    <div key={dept.id} className="flex justify-between items-center">
                      <div>
                        <p className={`font-medium ${palette.heading}`}>{dept.name}</p>
                        <p className={`text-sm ${palette.subheading}`}>{deptEmployees.length} employees</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-medium ${palette.heading}`}>{formatMoney(deptSalaries, '')}</p>
                        <p className={`text-sm ${palette.subheading}`}>Monthly payroll</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Recent Periods */}
          <div className={`${palette.card} rounded-xl`}>
            <div className="p-6 border-b border-[#e7decd]">
              <h3 className={`text-lg font-semibold ${palette.heading}`}>Recent Payroll Periods</h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {payrollPeriods.slice(0, 5).map(period => (
                  <div key={period.id} className="flex justify-between items-center">
                    <div>
                      <p className={`font-medium ${palette.heading}`}>{period.period_name}</p>
                      <p className={`text-sm ${palette.subheading}`}>{period.employee_count} employees</p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        period.status === 'paid'
                          ? 'bg-green-100 text-green-900'
                          : period.status === 'closed'
                          ? 'bg-[#d7ccb6] text-[#2f2a1f]'
                          : period.status === 'processing'
                          ? 'bg-yellow-100 text-yellow-900'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {period.status === 'paid'
                          ? 'Paid'
                          : period.status === 'closed'
                          ? 'Closed'
                          : period.status === 'processing'
                          ? 'Processing'
                          : 'Open'}
                      </span>
                      <p className={`text-sm mt-1 ${palette.subheading}`}>{formatMoney(period.total_net, '')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className={`${palette.card} rounded-xl p-6`}>
          <h3 className={`text-lg font-semibold mb-4 ${palette.heading}`}>Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => handleOpenModal('employee')}
              className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-colors ${palette.primaryButton}`}
            >
              <i className="ri-user-add-line"></i>
              <span>Add Employee</span>
            </button>
            <button
              onClick={() => handleOpenModal('payroll-period')}
              className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-colors ${palette.secondaryButton}`}
            >
              <i className="ri-calendar-line"></i>
              <span>New Period</span>
            </button>
            <button
              onClick={() => exportToExcel(
                employees.map(emp => ({
                  Código: emp.employee_code,
                  Nombre: `${emp.first_name} ${emp.last_name}`,
                  Departamento: getDepartmentName(emp.department_id),
                  Posición: getPositionTitle(emp.position_id),
                  Salario: emp.salary,
                  Estado: emp.status
                })),
                'empleados',
                'Reporte de Empleados'
              )}
              className="flex items-center justify-center space-x-2 px-4 py-3 rounded-lg text-white transition-colors bg-[#704f98] hover:bg-[#5b3f7a]"
            >
              <i className="ri-download-line"></i>
              <span>Export Employees</span>
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
        <h3 className={`text-lg font-semibold ${palette.heading}`}>Employee Management</h3>
        <button
          onClick={() => handleOpenModal('employee')}
          className={`${palette.primaryButton} px-4 py-2 rounded-lg transition-colors whitespace-nowrap`}
        >
          <i className="ri-add-line mr-2"></i>
          Add Employee
        </button>
      </div>

      {/* Filters */}
      <div className={`${palette.card} rounded-xl p-4`}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <input
              type="text"
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-[#d9cfbf] rounded-lg focus:ring-2 focus:ring-[#4b5b3f] focus:border-transparent bg-white/70"
            />
          </div>
          <div>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="w-full px-3 py-2 border border-[#d9cfbf] rounded-lg focus:ring-2 focus:ring-[#4b5b3f] focus:border-transparent bg-white/70"
            >
              <option value="">All departments</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-[#d9cfbf] rounded-lg focus:ring-2 focus:ring-[#4b5b3f] focus:border-transparent bg-white/70"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => exportToExcel(filteredEmployees.map(emp => ({
                Code: emp.employee_code,
                Name: `${emp.first_name} ${emp.last_name}`,
                Email: emp.email,
                Phone: emp.phone,
                Department: getDepartmentName(emp.department_id),
                Position: getPositionTitle(emp.position_id),
                Salary: emp.salary,
                'Hire Date': emp.hire_date,
                Status: emp.status
              })), 'employees_filtered', 'Employees (Filtered)')}
              className={`${palette.secondaryButton} px-3 py-2 rounded-lg transition-colors whitespace-nowrap`}
            >
              <i className="ri-download-line"></i>
            </button>
          </div>
        </div>
        <div className={`mt-4 text-sm ${palette.subheading}`}>
          Showing {filteredEmployees.length} of {employees.length} employees
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedEmployees.length > 0 && (
        <div className="bg-[#eef2e7] border border-[#c0c9b6] rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-[#2f2a1f] font-medium">
              {selectedEmployees.length} employee(s) selected
            </span>
            <div className="flex space-x-2">
              <button
                onClick={() => handleBulkAction('activate')}
                className="bg-[#4b5b3f] text-white px-3 py-1 rounded text-sm hover:bg-[#3c4a30] transition-colors"
              >
                Activate
              </button>
              <button
                onClick={() => handleBulkAction('deactivate')}
                className="bg-[#c48f31] text-white px-3 py-1 rounded text-sm hover:bg-[#a57422] transition-colors"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employees Table */}
      <div className={`${palette.card} rounded-xl overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#e8ded0]">
            <thead className="bg-[#f4ede0]">
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
                <th className="px-6 py-3 text-left text-xs font-medium text-[#6c6658] uppercase tracking-wider">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#6c6658] uppercase tracking-wider">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#6c6658] uppercase tracking-wider">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#6c6658] uppercase tracking-wider">Department</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#6c6658] uppercase tracking-wider">Position</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#6c6658] uppercase tracking-wider">Salary</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#6c6658] uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#6c6658] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white/80 divide-y divide-[#eee5d7]">
              {filteredEmployees.map((employee) => (
                <tr key={employee.id} className="hover:bg-[#f8f3ea] transition-colors">
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[#2f2a1f]">
                    {employee.employee_code}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className={`text-sm font-medium ${palette.heading}`}>
                        {employee.first_name} {employee.last_name}
                      </div>
                      <div className={`text-sm ${palette.subheading}`}>
                        Hired: {new Date(employee.hire_date).toLocaleDateString('en-US')}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm ${palette.heading}`}>{employee.email}</div>
                    <div className={`text-sm ${palette.subheading}`}>{employee.phone}</div>
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm ${palette.subheading}`}>
                    {getDepartmentName(employee.department_id)}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm ${palette.subheading}`}>
                    {getPositionTitle(employee.position_id)}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm ${palette.heading}`}>
                    {formatMoney(employee.salary, '')}
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
        <h3 className={`text-lg font-semibold ${palette.heading}`}>Departments</h3>
        <button
          onClick={() => handleOpenModal('department')}
          className={`${palette.primaryButton} px-4 py-2 rounded-lg transition-colors whitespace-nowrap`}
        >
          <i className="ri-add-line mr-2"></i>
          Add Department
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {departments.map((department) => {
          const deptEmployees = employees.filter(emp => emp.department_id === department.id);
          const deptSalaries = deptEmployees.reduce((sum, emp) => sum + emp.salary, 0);
          
          return (
            <div key={department.id} className={`${palette.card} rounded-xl p-6`}>
              <div className="flex justify-between items-start mb-4">
                <h4 className={`text-lg font-semibold ${palette.heading}`}>{department.name}</h4>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleOpenModal('department', department)}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    <i className="ri-edit-line"></i>
                  </button>
                </div>
              </div>
              <p className={`${palette.subheading} mb-4`}>{department.description}</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className={`text-sm ${palette.subheading}`}>Employees:</span>
                  <span className="text-sm font-medium">{deptEmployees.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className={`text-sm ${palette.subheading}`}>Monthly payroll:</span>
                  <span className="text-sm font-medium">{formatMoney(deptSalaries, '')}</span>
                </div>
                {department.budget && (
                  <div className="flex justify-between">
                    <span className={`text-sm ${palette.subheading}`}>Budget:</span>
                    <span className="text-sm font-medium">{formatMoney(department.budget, '')}</span>
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
        <h3 className={`text-lg font-semibold ${palette.heading}`}>Positions</h3>
        <button
          onClick={() => handleOpenModal('position')}
          className={`${palette.primaryButton} px-4 py-2 rounded-lg transition-colors whitespace-nowrap`}
        >
          <i className="ri-add-line mr-2"></i>
          Add Position
        </button>
      </div>

      <div className={`${palette.card} rounded-xl overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#e8ded0]">
            <thead className="bg-[#f4ede0]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#6c6658] uppercase tracking-wider">Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#6c6658] uppercase tracking-wider">Department</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#6c6658] uppercase tracking-wider">Employees</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#6c6658] uppercase tracking-wider">Salary Range</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#6c6658] uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#6c6658] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white/80 divide-y divide-[#eee5d7]">
              {positions.map((position) => {
                const posEmployees = employees.filter(emp => emp.position_id === position.id);
                
                return (
                  <tr key={position.id} className="hover:bg-[#f8f3ea] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className={`text-sm font-medium ${palette.heading}`}>{position.title}</div>
                        <div className={`text-sm ${palette.subheading}`}>{position.description}</div>
                      </div>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${palette.subheading}`}>
                      {getDepartmentName(position.department_id)}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${palette.heading}`}>
                      {posEmployees.length}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${palette.heading}`}>
                      {position.min_salary && position.max_salary ? (
                        `${formatMoney(position.min_salary, '')} - ${formatMoney(position.max_salary, '')}`
                      ) : 'Not defined'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        position.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {position.is_active ? 'Active' : 'Inactive'}
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
                    Bruto: {formatMoney(period.total_gross, '')}
                  </p>
                  <p className="text-red-600">
                    Deducciones: {formatMoney(period.total_deductions, '')}
                  </p>
                  <p className="font-semibold text-green-600">
                    Neto: {formatMoney(period.total_net, '')}
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
        <h3 className={`text-lg font-semibold ${palette.heading}`}>Payroll Reports</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Employees Report */}
        <div className={`${palette.card} rounded-xl p-6`}>
          <div className="flex items-center mb-4">
            <div className="p-3 rounded-full bg-[#e6e9d5] text-[#4b5320]">
              <i className="ri-user-line text-2xl"></i>
            </div>
            <div className="ml-4">
              <h4 className={`text-lg font-semibold ${palette.heading}`}>Employees Report</h4>
              <p className={`${palette.subheading} text-sm`}>Complete employee directory</p>
            </div>
          </div>
          <button
            onClick={() => exportToExcel(employees.map(emp => ({
              Code: emp.employee_code,
              Name: `${emp.first_name} ${emp.last_name}`,
              Email: emp.email,
              Phone: emp.phone,
              Department: getDepartmentName(emp.department_id),
              Position: getPositionTitle(emp.position_id),
              Salary: emp.salary,
              'Hire Date': emp.hire_date,
              Status: emp.status,
              'Bank Account': emp.bank_account || '',
              ID: emp.identification || '',
              Address: emp.address || ''
            })), 'employees_report', 'Employees Report')}
            className="w-full bg-[#4b5320] text-white px-4 py-2 rounded-lg hover:bg-[#3d431a] transition-colors shadow-sm"
          >
            <i className="ri-download-line mr-2"></i>
            Download Report
          </button>
        </div>

        {/* Payroll by Department */}
        <div className={`${palette.card} rounded-xl p-6`}>
          <div className="flex items-center mb-4">
            <div className="p-3 rounded-full bg-[#e6e9d5] text-[#4b5320]">
              <i className="ri-building-line text-2xl"></i>
            </div>
            <div className="ml-4">
              <h4 className={`text-lg font-semibold ${palette.heading}`}>Payroll by Department</h4>
              <p className={`${palette.subheading} text-sm`}>Department level breakdown</p>
            </div>
          </div>
          <button
            onClick={() => exportToExcel(departments.map(dept => {
              const deptEmployees = employees.filter(emp => emp.department_id === dept.id);
              const totalSalaries = deptEmployees.reduce((sum, emp) => sum + emp.salary, 0);
              return {
                Department: dept.name,
                Description: dept.description,
                'Employee Count': deptEmployees.length,
                'Total Payroll': formatMoney(totalSalaries, ''),
                'Average Salary': deptEmployees.length > 0 ? Math.round(totalSalaries / deptEmployees.length) : 0,
                Budget: dept.budget || 0
              };
            }), 'payroll_by_department')}
            className="w-full bg-[#4b5320] text-white px-4 py-2 rounded-lg hover:bg-[#3d431a] transition-colors shadow-sm"
          >
            <i className="ri-download-line mr-2"></i>
            Download Report
          </button>
        </div>

        {/* Payroll Periods */}
        <div className={`${palette.card} rounded-xl p-6`}>
          <div className="flex items-center mb-4">
            <div className="p-3 rounded-full bg-[#e6e9d5] text-[#4b5320]">
              <i className="ri-calendar-line text-2xl"></i>
            </div>
            <div className="ml-4">
              <h4 className={`text-lg font-semibold ${palette.heading}`}>Payroll Periods</h4>
              <p className={`${palette.subheading} text-sm`}>Historical period overview</p>
            </div>
          </div>
          <button
            onClick={() => exportToExcel(payrollPeriods.map(period => ({
              Period: period.period_name,
              'Start Date': period.start_date,
              'End Date': period.end_date,
              'Pay Date': period.pay_date,
              Status: period.status,
              Employees: period.employee_count,
              'Total Gross': period.total_gross,
              'Total Deductions': period.total_deductions,
              'Total Net': period.total_net
            })), 'payroll_periods')}
            className="w-full bg-[#4b5320] text-white px-4 py-2 rounded-lg hover:bg-[#3d431a] transition-colors shadow-sm"
          >
            <i className="ri-download-line mr-2"></i>
            Download Report
          </button>
        </div>

        {/* Salary Analysis */}
        <div className={`${palette.card} rounded-xl p-6`}>
          <div className="flex items-center mb-4">
            <div className="p-3 rounded-full bg-[#e6e9d5] text-[#4b5320]">
              <i className="ri-bar-chart-line text-2xl"></i>
            </div>
            <div className="ml-4">
              <h4 className={`text-lg font-semibold ${palette.heading}`}>Salary Analysis</h4>
              <p className={`${palette.subheading} text-sm`}>Compensation statistics</p>
            </div>
          </div>
          <button
            onClick={() => {
              const stats = calculateDashboardStats();
              const salaryRanges = {
                'Under 30,000': employees.filter(emp => emp.salary < 30000).length,
                '30,000 - 50,000': employees.filter(emp => emp.salary >= 30000 && emp.salary < 50000).length,
                '50,000 - 70,000': employees.filter(emp => emp.salary >= 50000 && emp.salary < 70000).length,
                '70,000 - 90,000': employees.filter(emp => emp.salary >= 70000 && emp.salary < 90000).length,
                'Over 90,000': employees.filter(emp => emp.salary >= 90000).length
              };
              
              exportToExcel([
                { Metric: 'Total Employees', Value: stats.totalEmployees },
                { Metric: 'Active Employees', Value: stats.activeEmployees },
                { Metric: 'Total Monthly Payroll', Value: formatMoney(stats.totalSalaries, '') },
                { Metric: 'Average Salary', Value: formatMoney(Math.round(stats.avgSalary), '') },
                ...Object.entries(salaryRanges).map(([range, count]) => ({
                  Metric: `Employees earning ${range}`,
                  Value: count
                }))
              ], 'salary_analysis');
            }}
            className="w-full bg-[#4b5320] text-white px-4 py-2 rounded-lg hover:bg-[#3d431a] transition-colors shadow-sm"
          >
            <i className="ri-download-line mr-2"></i>
            Download Analysis
          </button>
        </div>
      </div>
    </div>
  );

  const renderModal = () => {
    if (!showModal) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-[#f6f1e3] rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              {modalType === 'employee' || modalType === 'department' || modalType === 'position' || modalType === 'payroll-period'
                ? `${selectedItem ? 'Edit' : 'Add'} ${
                    modalType === 'employee'
                      ? 'Employee'
                      : modalType === 'department'
                      ? 'Department'
                      : modalType === 'position'
                      ? 'Position'
                      : 'Payroll Period'
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
                  <p className="text-sm text-gray-900">{formatMoney(selectedItem.salary, '')}</p>
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
                  <p className="text-sm text-gray-900">{formatMoney(Number(selectedItem.total_gross || 0), '')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Total Neto</label>
                  <p className="text-sm text-gray-900">{formatMoney(Number(selectedItem.total_net || 0), '')}</p>
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
                              <td className="px-4 py-2 whitespace-nowrap text-right">{formatMoney(Number(entry.gross_salary || 0), '')}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-right text-red-600">{formatMoney(Number(entry.deductions || 0), '')}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-right text-green-600">{formatMoney(Number(entry.net_salary || 0), '')}</td>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                    <input
                      type="text"
                      value={formData.first_name || ''}
                      onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                    <input
                      type="text"
                      value={formData.last_name || ''}
                      onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input
                      type="email"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-red-500">*</span></label>
                    <input
                      type="tel"
                      value={formData.phone || ''}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Identification</label>
                    <input
                      type="text"
                      value={formData.identification || ''}
                      onChange={(e) => setFormData({...formData, identification: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
                      placeholder="001-1234567-8"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
                    <select
                      value={formData.department_id || ''}
                      onChange={(e) => setFormData({...formData, department_id: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
                      required
                    >
                      <option value="">Select department</option>
                      {departments.map(dept => (
                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Position *</label>
                    <select
                      value={formData.position_id || ''}
                      onChange={(e) => setFormData({...formData, position_id: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
                      required
                    >
                      <option value="">Select position</option>
                      {positions.filter(pos => !formData.department_id || pos.department_id === formData.department_id).map(pos => (
                        <option key={pos.id} value={pos.id}>{pos.title}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Salary *</label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      value={formData.salary || ''}
                      onChange={(e) => setFormData({...formData, salary: parseFloat(e.target.value)})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hire Date *</label>
                    <input
                      type="date"
                      value={formData.hire_date || ''}
                      onChange={(e) => setFormData({...formData, hire_date: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bank Account <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={formData.bank_account || ''}
                      onChange={(e) => setFormData({...formData, bank_account: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact</label>
                    <input
                      type="text"
                      value={formData.emergency_contact || ''}
                      onChange={(e) => setFormData({...formData, emergency_contact: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Phone</label>
                    <input
                      type="tel"
                      value={formData.emergency_phone || ''}
                      onChange={(e) => setFormData({...formData, emergency_phone: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <textarea
                      value={formData.address || ''}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {modalType === 'department' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Department Name *</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Budget</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Position Title *</label>
                    <input
                      type="text"
                      value={formData.title || ''}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
                    <select
                      value={formData.department_id || ''}
                      onChange={(e) => setFormData({...formData, department_id: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
                      required
                    >
                      <option value="">Select department</option>
                      {departments.map(dept => (
                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Salary</label>
                      <input
                        type="number" min="0"
                        step="0.01"
                        value={formData.min_salary || ''}
                        onChange={(e) => setFormData({...formData, min_salary: parseFloat(e.target.value)})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Salary</label>
                      <input
                        type="number" min="0"
                        step="0.01"
                        value={formData.max_salary || ''}
                        onChange={(e) => setFormData({...formData, max_salary: parseFloat(e.target.value)})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4b5320]"
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
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-[#4b5320] text-white py-2 px-4 rounded-lg hover:bg-[#3d431a] transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : (selectedItem ? 'Update' : 'Create')}
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
    <div className={`${palette.background} min-h-screen space-y-6 px-4 sm:px-6 lg:px-8 pt-6 pb-10`}>
      <div className="flex justify-between items-center">
        <h1 className={`text-3xl font-bold ${palette.heading}`}>Payroll Management</h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#d6c9b5]">
        <nav className="-mb-px flex flex-wrap gap-4">
          {[
            { id: 'dashboard', name: 'Dashboard', icon: 'ri-dashboard-line' },
            { id: 'employees', name: 'Employees', icon: 'ri-user-line' },
            { id: 'departments', name: 'Departments', icon: 'ri-building-line' },
            { id: 'positions', name: 'Positions', icon: 'ri-briefcase-line' },
            { id: 'reports', name: 'Reports', icon: 'ri-bar-chart-line' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-[#4b5b3f] text-[#4b5b3f]'
                  : 'border-transparent text-[#7f7968] hover:text-[#4b5b3f] hover:border-[#c4b59d]'
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
      <div className={`${palette.card} rounded-xl p-6`}>
        <h3 className={`text-lg font-semibold mb-4 ${palette.heading}`}>More Payroll Modules</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/configuration')}
            className="flex items-center space-x-2 bg-[#f0e7d8] hover:bg-[#e3d8c4] text-[#2f2a1f] px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-settings-line"></i>
            <span>Configuration</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/employee-types')}
            className="flex items-center space-x-2 bg-[#f0e7d8] hover:bg-[#e3d8c4] text-[#2f2a1f] px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-user-settings-line"></i>
            <span>Employee Types</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/salary-types')}
            className="flex items-center space-x-2 bg-[#f0e7d8] hover:bg-[#e3d8c4] text-[#2f2a1f] px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-money-dollar-box-line"></i>
            <span>Salary Types</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/concepts')}
            className="flex items-center space-x-2 bg-[#f0e7d8] hover:bg-[#e3d8c4] text-[#2f2a1f] px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-list-check"></i>
            <span>Concepts</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/periods')}
            className="flex items-center space-x-2 bg-[#f0e7d8] hover:bg-[#e3d8c4] text-[#2f2a1f] px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-calendar-line"></i>
            <span>Periods</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/commission-types')}
            className="flex items-center space-x-2 bg-[#f0e7d8] hover:bg-[#e3d8c4] text-[#2f2a1f] px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-percent-line"></i>
            <span>Commission Types</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/vacations')}
            className="flex items-center space-x-2 bg-[#f0e7d8] hover:bg-[#e3d8c4] text-[#2f2a1f] px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-plane-line"></i>
            <span>Vacations</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/overtime')}
            className="flex items-center space-x-2 bg-[#f0e7d8] hoverbg-[#e3d8c4] text-[#2f2a1f] px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-time-line"></i>
            <span>Overtime</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/holidays')}
            className="flex items-center space-x-2 bg-[#f0e7d8] hover:bg-[#e3d8c4] text-[#2f2a1f] px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-calendar-event-line"></i>
            <span>Holidays</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/bonuses')}
            className="flex items-center space-x-2 bg-[#f0e7d8] hover:bg-[#e3d8c4] text-[#2f2a1f] px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-gift-line"></i>
            <span>Bonuses</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/royalties')}
            className="flex items-center space-x-2 bg-[#f0e7d8] hover:bg-[#e3d8c4] text-[#2f2a1f] px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-award-line"></i>
            <span>Royalties</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/deductions')}
            className="flex items-center space-x-2 bg-[#f0e7d8] hover:bg-[#e3d8c4] text-[#2f2a1f] px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-subtract-line"></i>
            <span>Deductions</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/absences')}
            className="flex items-center space-x-2 bg-[#f0e7d8] hover:bg-[#e3d8c4] text-[#2f2a1f] px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-user-unfollow-line"></i>
            <span>Absences</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/salary-changes')}
            className="flex items-center space-x-2 bg-[#f0e7d8] hover:bg-[#e3d8c4] text-[#2f2a1f] px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-exchange-dollar-line"></i>
            <span>Salary Changes</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/employee-exits')}
            className="flex items-center space-x-2 bg-[#f0e7d8] hover:bg-[#e3d8c4] text-[#2f2a1f] px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-logout-box-line"></i>
            <span>Employee Exits</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/payroll-process')}
            className="flex items-center space-x-2 bg-[#4b5b3f] hover:bg-[#3c4a30] text-white px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-play-circle-line"></i>
            <span>Payroll Processing</span>
          </button>
          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll/journal-entry')}
            className="flex items-center space-x-2 bg-[#e0d7c9] hover:bg-[#d3c8b7] text-[#233022] px-4 py-3 rounded-lg transition-colors"
          >
            <i className="ri-book-2-line"></i>
            <span>Journal Entry</span>
          </button>
        </div>
      </div>

      {/* Modal */}
      {renderModal()}
    </div>
  );
}
