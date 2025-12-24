import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { exportToExcelStyled } from '../../../utils/exportImportUtils';
import { employeesService, employeeExitsService, journalEntriesService, chartAccountsService, settingsService } from '../../../services/database';
import { formatMoney } from '../../../utils/numberFormat';

interface EmployeeExit {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  position: string;
  hireDate: string;
  exitDate: string;
  exitType: 'resignation' | 'termination' | 'retirement' | 'contract_end' | 'mutual_agreement' | 'death';
  reason: string;
  lastSalary: number;
  yearsOfService: number;
  pendingVacationDays: number;
  vacationPayout: number;
  christmasBonusPayout: number;
  severancePay: number;
  otherPayments: number;
  totalSettlement: number;
  deductions: number;
  netSettlement: number;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  approvedBy: string;
  approvedDate: string;
  notes: string;
  createdAt: string;
}

interface Employee {
  id: string;
  code: string;
  name: string;
  department: string;
  position: string;
  hireDate: string;
  salary: number;
  status: string;
}

export default function EmployeeExitsPage() {
  const { user } = useAuth();
  const [exits, setExits] = useState<EmployeeExit[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  const [formData, setFormData] = useState({
    employeeId: '',
    exitDate: new Date().toISOString().split('T')[0],
    exitType: 'resignation' as EmployeeExit['exitType'],
    reason: '',
    pendingVacationDays: 0,
    otherPayments: 0,
    deductions: 0,
    notes: ''
  });

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [calculations, setCalculations] = useState({
    yearsOfService: 0,
    vacationPayout: 0,
    christmasBonusPayout: 0,
    severancePay: 0,
    totalSettlement: 0,
    netSettlement: 0
  });

  const exitTypes = [
    { value: 'resignation', label: 'Renuncia Voluntaria' },
    { value: 'termination', label: 'Despido' },
    { value: 'retirement', label: 'Jubilación' },
    { value: 'contract_end', label: 'Fin de Contrato' },
    { value: 'mutual_agreement', label: 'Mutuo Acuerdo' },
    { value: 'death', label: 'Fallecimiento' }
  ];

  useEffect(() => {
    loadData();
  }, [user]);

  useEffect(() => {
    if (selectedEmployee && formData.exitDate) {
      calculateSettlement();
    }
  }, [selectedEmployee, formData.exitDate, formData.exitType, formData.pendingVacationDays, formData.otherPayments, formData.deductions]);

  const loadData = async () => {
    if (!user) return;
    try {
      const [empData, exitsData] = await Promise.all([
        employeesService.getAll(user.id),
        employeeExitsService?.getAll?.(user.id) || Promise.resolve([])
      ]);

      const mappedEmployees: Employee[] = (empData || [])
        .filter((e: any) => e.status === 'active')
        .map((e: any) => ({
          id: e.id,
          code: e.employee_code || e.identification || '',
          name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
          department: e.departments?.name || '',
          position: e.positions?.title || '',
          hireDate: e.hire_date || '',
          salary: Number(e.base_salary) || Number(e.salary) || 0,
          status: e.status || 'active'
        }));
      setEmployees(mappedEmployees);

      const mappedExits: EmployeeExit[] = (exitsData || []).map((ex: any) => ({
        id: ex.id,
        employeeId: ex.employee_id,
        employeeName: ex.employee_name || '',
        employeeCode: ex.employee_code || '',
        department: ex.department || '',
        position: ex.position || '',
        hireDate: ex.hire_date || '',
        exitDate: ex.exit_date || '',
        exitType: ex.exit_type || 'resignation',
        reason: ex.reason || '',
        lastSalary: Number(ex.last_salary) || 0,
        yearsOfService: Number(ex.years_of_service) || 0,
        pendingVacationDays: Number(ex.pending_vacation_days) || 0,
        vacationPayout: Number(ex.vacation_payout) || 0,
        christmasBonusPayout: Number(ex.christmas_bonus_payout) || 0,
        severancePay: Number(ex.severance_pay) || 0,
        otherPayments: Number(ex.other_payments) || 0,
        totalSettlement: Number(ex.total_settlement) || 0,
        deductions: Number(ex.deductions) || 0,
        netSettlement: Number(ex.net_settlement) || 0,
        status: ex.status || 'pending',
        approvedBy: ex.approved_by || '',
        approvedDate: ex.approved_date || '',
        notes: ex.notes || '',
        createdAt: ex.created_at || new Date().toISOString()
      }));
      setExits(mappedExits);
    } catch (error) {
      console.error('Error loading employee exits:', error);
    }
  };

  const calculateSettlement = () => {
    if (!selectedEmployee) return;

    const hireDate = new Date(selectedEmployee.hireDate);
    const exitDate = new Date(formData.exitDate);
    const diffTime = exitDate.getTime() - hireDate.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    const yearsOfService = Math.max(0, diffDays / 365);

    const dailySalary = selectedEmployee.salary / 23.83;
    const vacationPayout = formData.pendingVacationDays * dailySalary;

    // Regalía pascual proporcional (12va parte del salario por meses trabajados en el año)
    const currentYear = exitDate.getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const monthsWorked = Math.max(0, (exitDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24 * 30));
    const christmasBonusPayout = (selectedEmployee.salary / 12) * Math.min(12, monthsWorked);

    // Preaviso y cesantía según tipo de salida y años de servicio
    let severancePay = 0;
    if (formData.exitType === 'termination') {
      // Preaviso: según años de servicio
      let preavisoWeeks = 0;
      if (yearsOfService >= 0.25 && yearsOfService < 1) preavisoWeeks = 1;
      else if (yearsOfService >= 1 && yearsOfService < 5) preavisoWeeks = 2;
      else if (yearsOfService >= 5) preavisoWeeks = 4;
      
      const weeklyPay = selectedEmployee.salary / 4;
      const preaviso = preavisoWeeks * weeklyPay;

      // Cesantía: según años de servicio
      let cesantiaDays = 0;
      if (yearsOfService >= 0.25 && yearsOfService < 1) cesantiaDays = 6;
      else if (yearsOfService >= 1 && yearsOfService < 5) cesantiaDays = 13 * Math.min(yearsOfService, 5);
      else if (yearsOfService >= 5) cesantiaDays = 21 * yearsOfService;
      
      const cesantia = cesantiaDays * dailySalary;
      severancePay = preaviso + cesantia;
    }

    const totalSettlement = vacationPayout + christmasBonusPayout + severancePay + formData.otherPayments;
    const netSettlement = totalSettlement - formData.deductions;

    setCalculations({
      yearsOfService,
      vacationPayout,
      christmasBonusPayout,
      severancePay,
      totalSettlement,
      netSettlement
    });
  };

  const handleEmployeeSelect = (employeeId: string) => {
    const emp = employees.find(e => e.id === employeeId);
    setSelectedEmployee(emp || null);
    setFormData(prev => ({ ...prev, employeeId }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedEmployee) return;

    const payload = {
      employee_id: selectedEmployee.id,
      employee_name: selectedEmployee.name,
      employee_code: selectedEmployee.code,
      department: selectedEmployee.department,
      position: selectedEmployee.position,
      hire_date: selectedEmployee.hireDate,
      exit_date: formData.exitDate,
      exit_type: formData.exitType,
      reason: formData.reason,
      last_salary: selectedEmployee.salary,
      years_of_service: calculations.yearsOfService,
      pending_vacation_days: formData.pendingVacationDays,
      vacation_payout: calculations.vacationPayout,
      christmas_bonus_payout: calculations.christmasBonusPayout,
      severance_pay: calculations.severancePay,
      other_payments: formData.otherPayments,
      total_settlement: calculations.totalSettlement,
      deductions: formData.deductions,
      net_settlement: calculations.netSettlement,
      status: 'pending',
      notes: formData.notes
    };

    try {
      if (employeeExitsService?.create) {
        const created = await employeeExitsService.create(user.id, payload);
        const newExit: EmployeeExit = {
          id: created.id,
          employeeId: created.employee_id,
          employeeName: created.employee_name,
          employeeCode: created.employee_code,
          department: created.department,
          position: created.position,
          hireDate: created.hire_date,
          exitDate: created.exit_date,
          exitType: created.exit_type,
          reason: created.reason,
          lastSalary: Number(created.last_salary),
          yearsOfService: Number(created.years_of_service),
          pendingVacationDays: Number(created.pending_vacation_days),
          vacationPayout: Number(created.vacation_payout),
          christmasBonusPayout: Number(created.christmas_bonus_payout),
          severancePay: Number(created.severance_pay),
          otherPayments: Number(created.other_payments),
          totalSettlement: Number(created.total_settlement),
          deductions: Number(created.deductions),
          netSettlement: Number(created.net_settlement),
          status: created.status,
          approvedBy: '',
          approvedDate: '',
          notes: created.notes || '',
          createdAt: created.created_at
        };
        setExits(prev => [...prev, newExit]);
      }
      resetForm();
    } catch (error) {
      console.error('Error saving employee exit:', error);
      alert('Error al guardar la salida del empleado');
    }
  };

  const resetForm = () => {
    setFormData({
      employeeId: '',
      exitDate: new Date().toISOString().split('T')[0],
      exitType: 'resignation',
      reason: '',
      pendingVacationDays: 0,
      otherPayments: 0,
      deductions: 0,
      notes: ''
    });
    setSelectedEmployee(null);
    setCalculations({
      yearsOfService: 0,
      vacationPayout: 0,
      christmasBonusPayout: 0,
      severancePay: 0,
      totalSettlement: 0,
      netSettlement: 0
    });
    setShowForm(false);
  };

  const handleApprove = async (id: string) => {
    const exit = exits.find(e => e.id === id);
    if (!exit || !user) return;

    try {
      if (employeeExitsService?.update) {
        await employeeExitsService.update(id, {
          status: 'approved',
          approved_by: user.email || 'Sistema',
          approved_date: new Date().toISOString().split('T')[0]
        });
      }

      // Marcar empleado como inactivo pero mantener ficha
      await employeesService.update(exit.employeeId, { status: 'inactive' });

      // Generar asiento contable para la liquidación
      try {
        const accounts = await chartAccountsService.getAll(user.id);
        const settings = await settingsService.getPayrollSettings();

        const accountsByCode = new Map<string, string>();
        (accounts || []).forEach((acc: any) => {
          if (acc.code && acc.id) {
            accountsByCode.set(String(acc.code), String(acc.id));
          }
        });

        // Cuentas por defecto (pueden configurarse en settings)
        const settlementExpenseCode = (settings as any)?.settlement_expense_account || '6105';
        const settlementPayableCode = (settings as any)?.settlement_payable_account || '2105';

        const expenseAccountId = accountsByCode.get(settlementExpenseCode);
        const payableAccountId = accountsByCode.get(settlementPayableCode);

        if (expenseAccountId && payableAccountId && exit.netSettlement > 0) {
          const today = new Date().toISOString().split('T')[0];
          const entryNumber = `LIQ-${today}-${exit.employeeCode || id.slice(0, 6)}`;

          const lines = [
            {
              account_id: expenseAccountId,
              description: `Liquidación empleado: ${exit.employeeName}`,
              debit_amount: exit.netSettlement,
              credit_amount: 0,
              line_number: 1,
            },
            {
              account_id: payableAccountId,
              description: `Liquidación por pagar: ${exit.employeeName}`,
              debit_amount: 0,
              credit_amount: exit.netSettlement,
              line_number: 2,
            },
          ];

          await journalEntriesService.createWithLines(user.id, {
            entry_number: entryNumber,
            entry_date: exit.exitDate || today,
            description: `Liquidación de ${exit.employeeName} - ${exit.exitType === 'resignation' ? 'Renuncia' : exit.exitType === 'termination' ? 'Despido' : 'Salida'}`,
            reference: `Liquidación ${exit.employeeCode}`,
            status: 'posted',
          }, lines);
        }
      } catch (journalError) {
        console.error('Error creating settlement journal entry:', journalError);
        // No bloquear la aprobación si falla el asiento
      }

      setExits(prev => prev.map(e =>
        e.id === id
          ? { ...e, status: 'approved', approvedBy: user.email || 'Sistema', approvedDate: new Date().toISOString().split('T')[0] }
          : e
      ));

      setEmployees(prev => prev.filter(e => e.id !== exit.employeeId));

      alert('Salida de empleado aprobada y asiento contable generado. El empleado ha sido marcado como inactivo.');
    } catch (error) {
      console.error('Error approving employee exit:', error);
      alert('Error al aprobar la salida del empleado');
    }
  };

  const filteredExits = exits.filter(exit => {
    const matchesSearch = exit.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         exit.employeeCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || exit.status === filterStatus;
    const matchesType = filterType === 'all' || exit.exitType === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  const exportToExcel = async () => {
    const today = new Date().toISOString().split('T')[0];
    const rows = filteredExits.map(ex => ({
      code: ex.employeeCode,
      name: ex.employeeName,
      department: ex.department,
      exitDate: ex.exitDate,
      type: exitTypes.find(t => t.value === ex.exitType)?.label || ex.exitType,
      years: ex.yearsOfService.toFixed(2),
      lastSalary: ex.lastSalary,
      settlement: ex.totalSettlement,
      net: ex.netSettlement,
      status: ex.status === 'pending' ? 'Pendiente' : ex.status === 'approved' ? 'Aprobado' : ex.status === 'paid' ? 'Pagado' : 'Cancelado'
    }));

    await exportToExcelStyled(
      rows,
      [
        { key: 'code', title: 'Código', width: 14 },
        { key: 'name', title: 'Empleado', width: 28 },
        { key: 'department', title: 'Departamento', width: 20 },
        { key: 'exitDate', title: 'Fecha Salida', width: 14 },
        { key: 'type', title: 'Tipo', width: 18 },
        { key: 'years', title: 'Años Servicio', width: 14 },
        { key: 'lastSalary', title: 'Último Salario', width: 16, numFmt: '#,##0.00' },
        { key: 'settlement', title: 'Liquidación', width: 16, numFmt: '#,##0.00' },
        { key: 'net', title: 'Neto a Pagar', width: 16, numFmt: '#,##0.00' },
        { key: 'status', title: 'Estado', width: 12 }
      ],
      `salidas_empleados_${today}`,
      'Salidas de Empleados'
    );
  };

  const pendingCount = exits.filter(e => e.status === 'pending').length;
  const totalSettlements = exits.filter(e => e.status === 'approved').reduce((sum, e) => sum + e.netSettlement, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Salida de Empleados</h1>
            <p className="text-gray-600">Gestiona las salidas y liquidaciones de empleados</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => window.REACT_APP_NAVIGATE?.('/payroll')}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              <i className="ri-arrow-left-line mr-2"></i>
              Volver
            </button>
            <button
              onClick={exportToExcel}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <i className="ri-download-line mr-2"></i>
              Exportar
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <i className="ri-add-line mr-2"></i>
              Nueva Salida
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Salidas</p>
                <p className="text-2xl font-bold text-gray-900">{exits.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <i className="ri-user-unfollow-line text-blue-600 text-xl"></i>
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
                <p className="text-sm font-medium text-gray-600">Empleados Activos</p>
                <p className="text-2xl font-bold text-green-600">{employees.length}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <i className="ri-team-line text-green-600 text-xl"></i>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Liquidaciones</p>
                <p className="text-2xl font-bold text-purple-600">{formatMoney(totalSettlements)}</p>
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
                <option value="paid">Pagado</option>
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
                {exitTypes.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha Salida</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Años</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Liquidación</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredExits.map((exit) => (
                  <tr key={exit.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{exit.employeeName}</div>
                        <div className="text-sm text-gray-500">{exit.department}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {exit.exitDate}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {exitTypes.find(t => t.value === exit.exitType)?.label || exit.exitType}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {exit.yearsOfService.toFixed(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMoney(exit.netSettlement)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        exit.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        exit.status === 'approved' ? 'bg-green-100 text-green-800' :
                        exit.status === 'paid' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {exit.status === 'pending' ? 'Pendiente' :
                         exit.status === 'approved' ? 'Aprobado' :
                         exit.status === 'paid' ? 'Pagado' : 'Cancelado'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {exit.status === 'pending' && (
                        <button
                          onClick={() => handleApprove(exit.id)}
                          className="text-green-600 hover:text-green-800"
                          title="Aprobar"
                        >
                          <i className="ri-check-line text-lg"></i>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredExits.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      No se encontraron salidas de empleados
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
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">Registrar Salida de Empleado</h2>
                <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
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
                          {emp.code} - {emp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Salida *</label>
                    <select
                      value={formData.exitType}
                      onChange={(e) => setFormData({...formData, exitType: e.target.value as any})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      {exitTypes.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedEmployee && (
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-800 mb-3">Información del Empleado</h4>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-blue-600">Departamento:</span>
                        <p className="font-medium">{selectedEmployee.department}</p>
                      </div>
                      <div>
                        <span className="text-blue-600">Posición:</span>
                        <p className="font-medium">{selectedEmployee.position}</p>
                      </div>
                      <div>
                        <span className="text-blue-600">Fecha Ingreso:</span>
                        <p className="font-medium">{selectedEmployee.hireDate}</p>
                      </div>
                      <div>
                        <span className="text-blue-600">Salario Actual:</span>
                        <p className="font-medium">{formatMoney(selectedEmployee.salary)}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fecha de Salida *</label>
                    <input
                      type="date"
                      value={formData.exitDate}
                      onChange={(e) => setFormData({...formData, exitDate: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Días Vacaciones Pendientes</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.pendingVacationDays}
                      onChange={(e) => setFormData({...formData, pendingVacationDays: parseInt(e.target.value) || 0})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Años de Servicio</label>
                    <input
                      type="text"
                      value={calculations.yearsOfService.toFixed(2)}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Motivo de Salida *</label>
                  <textarea
                    value={formData.reason}
                    onChange={(e) => setFormData({...formData, reason: e.target.value})}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                {/* Cálculos de Liquidación */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-800 mb-4">Cálculo de Liquidación</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600">Vacaciones Pendientes</label>
                      <p className="text-lg font-semibold text-gray-900">{formatMoney(calculations.vacationPayout)}</p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600">Regalía Pascual Proporcional</label>
                      <p className="text-lg font-semibold text-gray-900">{formatMoney(calculations.christmasBonusPayout)}</p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600">Preaviso + Cesantía</label>
                      <p className="text-lg font-semibold text-gray-900">{formatMoney(calculations.severancePay)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Otros Pagos</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.otherPayments}
                        onChange={(e) => setFormData({...formData, otherPayments: parseFloat(e.target.value) || 0})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Deducciones</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.deductions}
                        onChange={(e) => setFormData({...formData, deductions: parseFloat(e.target.value) || 0})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="bg-green-100 p-3 rounded-lg">
                      <label className="block text-sm text-green-800">Neto a Pagar</label>
                      <p className="text-xl font-bold text-green-900">{formatMoney(calculations.netSettlement)}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notas Adicionales</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                    Registrar Salida
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
