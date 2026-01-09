import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { payrollService, employeesService, taxService, resolveTenantId, departmentsService } from '../../../services/database';

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

export default function PayrollProcessPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null);
  const [loading, setLoading] = useState(false);

  const normalizeStatus = (status: string): PayrollPeriod['status'] => {
    const value = (status || '').toString().toLowerCase();
    if (value === 'open' || value === 'abierto' || value === 'draft') return 'open';
    if (value === 'processing' || value === 'procesando' || value === 'calculated') return 'processing';
    if (value === 'closed' || value === 'cerrado') return 'closed';
    if (value === 'paid' || value === 'pagado') return 'paid';
    return 'open';
  };

  useEffect(() => {
    loadPeriods();
  }, [user]);

  const loadPeriods = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        setPeriods([]);
        return;
      }

      const { data, error } = await supabase
        .from('payroll_periods')
        .select('*')
        .eq('user_id', tenantId)
        .order('start_date', { ascending: false });
      
      if (error) throw error;
      if (data) {
        const mapped = (data as any[]).map((p) => ({
          ...p,
          status: normalizeStatus(p.status as string),
        }));
        setPeriods(mapped as PayrollPeriod[]);
      }
    } catch (error) {
      console.error('Error loading periods:', error);
    } finally {
      setLoading(false);
    }
  };

  const processPeriod = async (periodId: string) => {
    if (!confirm('Process this payroll? This will calculate salaries for all active employees including deductions and absences.')) return;
    
    setLoading(true);
    let tenantId: string | null = null;
    try {
      if (!user) return;

      tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        alert('Could not determine the user company.');
        return;
      }

      // Obtener el período
      const period = periods.find(p => p.id === periodId);
      if (!period) {
        alert('Payroll period not found');
        return;
      }

      // Actualizar estado a processing en la base de datos
      const { error: statusError } = await supabase
        .from('payroll_periods')
        .update({ status: 'processing' })
        .eq('id', periodId)
        .eq('user_id', tenantId);

      if (statusError) throw statusError;

      // Obtener empleados activos
      const employees = await employeesService.getAll(user.id);
      const activeEmployees = employees.filter((e: any) => {
        const status = String(e.status || '').toLowerCase();
        return status === 'active' || status === 'activo';
      });

      if (activeEmployees.length === 0) {
        alert('There are no active employees to process.');
        return;
      }

      const departments = await departmentsService.getAll(user.id);
      const budgetViolations: { departmentName: string; payroll: number; budget: number }[] = [];

      (departments || []).forEach((dept: any) => {
        const deptEmployees = activeEmployees.filter((e: any) => e.department_id === dept.id);
        if (deptEmployees.length === 0) return;

        const deptPayroll = deptEmployees.reduce(
          (sum: number, e: any) => sum + (Number(e.base_salary) || Number(e.salary) || 0),
          0
        );
        const budget = Number(dept.budget) || 0;

        if (budget > 0 && deptPayroll > budget) {
          budgetViolations.push({
            departmentName: dept.name || 'Sin nombre',
            payroll: deptPayroll,
            budget,
          });
        }
      });

      if (budgetViolations.length > 0) {
        const details = budgetViolations
          .map(v => `${v.departmentName}: payroll RD$ ${v.payroll.toLocaleString('en-US')} vs budget RD$ ${v.budget.toLocaleString('en-US')}`)
          .join('\n');
        throw new Error(
          `Calculated payroll exceeds the budget for one or more departments:\n\n${details}\n\nAdjust salaries or budgets before processing.`
        );
      }

      // Obtener configuración TSS
      const tssConfig = await taxService.getTaxConfiguration();

      // Calcular nómina con integración de deducciones y ausencias
      const payrollEntries = await payrollService.calculatePayroll(
        user.id,
        periodId,
        activeEmployees,
        period.start_date,
        period.end_date,
        tssConfig
      );

      // Insertar entradas de nómina
      const { error: entriesError } = await supabase
        .from('payroll_entries')
        .insert(payrollEntries);

      if (entriesError) throw entriesError;

      // Marcar otras deducciones como aplicadas
      const employeeIds = activeEmployees.map((e: any) => e.id);
      await payrollService.markOtherDeductionsAsApplied(
        user.id,
        employeeIds,
        period.start_date,
        period.end_date
      );

      // Calcular totales
      const totalGross = payrollEntries.reduce((sum, e) => sum + e.gross_salary, 0);
      const totalDeductions = payrollEntries.reduce((sum, e) => sum + e.deductions, 0);
      const totalNet = payrollEntries.reduce((sum, e) => sum + e.net_salary, 0);

      // Actualizar período con totales y estado processing
      const { error: totalsError } = await supabase
        .from('payroll_periods')
        .update({
          status: 'processing',
          total_gross: totalGross,
          total_deductions: totalDeductions,
          total_net: totalNet,
          employee_count: activeEmployees.length
        })
        .eq('id', periodId)
        .eq('user_id', tenantId);

      if (totalsError) throw totalsError;
      
      alert(`Payroll processed successfully:\n\n${activeEmployees.length} employees\nTotal gross: RD$ ${totalGross.toLocaleString('en-US')}\nTotal deductions: RD$ ${totalDeductions.toLocaleString('en-US')}\nTotal net: RD$ ${totalNet.toLocaleString('en-US')}`);
      await loadPeriods();
    } catch (error) {
      console.error('Error processing payroll:', error);
      alert('Error processing payroll: ' + (error as Error).message);
      
      // Revertir estado a open si hubo error (mejor esfuerzo)
      try {
        if (tenantId) {
          await supabase
            .from('payroll_periods')
            .update({ status: 'open' })
            .eq('id', periodId)
            .eq('user_id', tenantId);
        }
      } catch (rollbackError) {
        console.error('Error reverting payroll period status:', rollbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  const closePeriod = async (periodId: string) => {
    if (!confirm('Close this payroll period? You will not be able to make changes after closing.')) return;
    
    try {
      if (!user) return;
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        alert('No se pudo determinar la empresa del usuario.');
        return;
      }

      await supabase
        .from('payroll_periods')
        .update({ status: 'closed' })
        .eq('id', periodId)
        .eq('user_id', tenantId);
      
      alert('Payroll period closed successfully');
      await loadPeriods();
    } catch (error) {
      console.error('Error closing period:', error);
      alert('Error closing the payroll period');
    }
  };

  const markAsPaid = async (periodId: string) => {
    if (!confirm('Confirm that this payroll has been paid?')) return;
    
    try {
      if (!user) return;
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        alert('No se pudo determinar la empresa del usuario.');
        return;
      }

      await supabase
        .from('payroll_periods')
        .update({ status: 'paid' })
        .eq('id', periodId)
        .eq('user_id', tenantId);
      
      alert('Payroll marked as paid');
      await loadPeriods();
    } catch (error) {
      console.error('Error marking as paid:', error);
      alert('Error marking payroll as paid');
    }
  };

  const getStatusColor = (status: string) => {
    const normalized = normalizeStatus(status);
    const colors: Record<PayrollPeriod['status'], string> = {
      open: 'bg-[#dbe8c0] text-[#2f3a1f]',
      processing: 'bg-[#f1e4c2] text-[#3d451b]',
      closed: 'bg-[#e0e5d0] text-[#2f3a1f]',
      paid: 'bg-green-100 text-green-800'
    };
    return colors[normalized] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const normalized = normalizeStatus(status);
    switch (normalized) {
      case 'open':
        return 'Open';
      case 'processing':
        return 'Processing';
      case 'closed':
        return 'Closed';
      case 'paid':
        return 'Paid';
      default:
        return status;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 bg-[#f6f3ea] min-h-screen -mx-4 sm:mx-0 p-4 sm:p-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payroll Processing</h1>
            <p className="text-gray-700">Manage and process payroll periods</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/payroll/periods')}
              className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm"
            >
              <i className="ri-calendar-line"></i>
              New Period
            </button>
            <button
              onClick={() => navigate('/payroll')}
              className="px-4 py-2 bg-[#e5ead7] text-[#2f3a1f] rounded-lg hover:bg-[#d7dec3] transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <i className="ri-arrow-left-line"></i>
              Back
            </button>
          </div>
        </div>

        {loading && (
          <div className="text-center py-8">
            <i className="ri-loader-4-line animate-spin text-3xl text-[#4b5320]"></i>
            <p className="text-gray-700 mt-2">Loading...</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6">
          {periods.map((period) => (
            <div key={period.id} className="bg-white rounded-xl shadow-sm border border-[#dfe5cf] p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{period.period_name}</h3>
                  <p className="text-sm text-gray-600">
                    From {new Date(period.start_date).toLocaleDateString('en-US')} to {new Date(period.end_date).toLocaleDateString('en-US')}
                  </p>
                  <p className="text-sm text-gray-600">
                    Pay date: {new Date(period.pay_date).toLocaleDateString('en-US')}
                  </p>
                </div>
                <span className={`px-4 py-2 rounded-full text-sm font-medium ${getStatusColor(period.status)}`}>
                  {getStatusLabel(period.status)}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-[#f8f5ec] p-4 rounded-lg border border-[#e7decd]">
                  <p className="text-xs text-gray-600 mb-1">Employees</p>
                  <p className="text-xl font-bold text-gray-900">{period.employee_count || 0}</p>
                </div>
                <div className="bg-[#e5ead7] p-4 rounded-lg border border-[#dfe5cf]">
                  <p className="text-xs text-gray-600 mb-1">Total Gross</p>
                  <p className="text-xl font-bold text-[#2f3a1f]">
                    RD$ {(period.total_gross || 0).toLocaleString('en-US')}
                  </p>
                </div>
                <div className="bg-[#f1e4c2] p-4 rounded-lg border border-[#e7decd]">
                  <p className="text-xs text-gray-600 mb-1">Deductions</p>
                  <p className="text-xl font-bold text-[#3d451b]">
                    RD$ {(period.total_deductions || 0).toLocaleString('en-US')}
                  </p>
                </div>
                <div className="bg-[#dbe8c0] p-4 rounded-lg border border-[#dfe5cf]">
                  <p className="text-xs text-gray-600 mb-1">Net Pay</p>
                  <p className="text-xl font-bold text-[#2f3a1f]">
                    RD$ {(period.total_net || 0).toLocaleString('en-US')}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                {period.status === 'open' && (
                  <button
                    onClick={() => processPeriod(period.id)}
                    className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] transition-colors shadow-sm"
                  >
                    <i className="ri-play-line mr-2"></i>
                    Process Payroll
                  </button>
                )}
                {period.status === 'processing' && (
                  <button
                    onClick={() => closePeriod(period.id)}
                    className="px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] transition-colors shadow-sm"
                  >
                    <i className="ri-lock-line mr-2"></i>
                    Close Period
                  </button>
                )}
                {period.status === 'closed' && (
                  <button
                    type="button"
                    disabled
                    className="bg-[#e0e5d0] text-[#2f3a1f] px-4 py-2 rounded-lg cursor-default"
                  >
                    <i className="ri-lock-line mr-2"></i>
                    Closed
                  </button>
                )}
              </div>
            </div>
          ))}

          {periods.length === 0 && !loading && (
            <div className="text-center py-12 bg-white rounded-xl border border-[#dfe5cf]">
              <i className="ri-calendar-line text-5xl text-gray-400 mb-4"></i>
              <p className="text-gray-700">No payroll periods found</p>
              <button
                onClick={() => navigate('/payroll/periods')}
                className="mt-4 px-4 py-2 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] transition-colors shadow-sm"
              >
                Create Payroll Period
              </button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
