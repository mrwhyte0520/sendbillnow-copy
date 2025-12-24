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
    if (!confirm('¿Desea procesar esta nómina? Esta acción calculará los salarios de todos los empleados activos incluyendo deducciones y ausencias.')) return;
    
    setLoading(true);
    let tenantId: string | null = null;
    try {
      if (!user) return;

      tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        alert('No se pudo determinar la empresa del usuario.');
        return;
      }

      // Obtener el período
      const period = periods.find(p => p.id === periodId);
      if (!period) {
        alert('Período no encontrado');
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
      const activeEmployees = employees.filter((e: any) => e.status === 'active');

      if (activeEmployees.length === 0) {
        alert('No hay empleados activos para procesar');
        return;
      }

      const departments = await departmentsService.getAll(user.id);
      const budgetViolations: { departmentName: string; payroll: number; budget: number }[] = [];

      (departments || []).forEach((dept: any) => {
        const deptEmployees = activeEmployees.filter((e: any) => e.department_id === dept.id);
        if (deptEmployees.length === 0) return;

        const deptPayroll = deptEmployees.reduce(
          (sum: number, e: any) => sum + (Number(e.base_salary || e.salary) || 0),
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
          .map(v => `${v.departmentName}: nómina RD$ ${v.payroll.toLocaleString('es-DO')} vs presupuesto RD$ ${v.budget.toLocaleString('es-DO')}`)
          .join('\n');
        throw new Error(
          `La nómina calculada supera el presupuesto de uno o más departamentos:\n\n${details}\n\nAjuste salarios o presupuestos antes de procesar.`
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
      
      alert(`Nómina procesada exitosamente:\n\n${activeEmployees.length} empleados\nSalario bruto total: RD$ ${totalGross.toLocaleString('es-DO')}\nDeducciones totales: RD$ ${totalDeductions.toLocaleString('es-DO')}\nSalario neto total: RD$ ${totalNet.toLocaleString('es-DO')}`);
      await loadPeriods();
    } catch (error) {
      console.error('Error processing payroll:', error);
      alert('Error al procesar la nómina: ' + (error as Error).message);
      
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
    if (!confirm('¿Está seguro de cerrar este período de nómina? No podrá realizar cambios después.')) return;
    
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
      
      alert('Período cerrado correctamente');
      await loadPeriods();
    } catch (error) {
      console.error('Error closing period:', error);
      alert('Error al cerrar el período');
    }
  };

  const markAsPaid = async (periodId: string) => {
    if (!confirm('¿Confirmar que se ha realizado el pago de esta nómina?')) return;
    
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
      
      alert('Nómina marcada como pagada');
      await loadPeriods();
    } catch (error) {
      console.error('Error marking as paid:', error);
      alert('Error al marcar como pagada');
    }
  };

  const getStatusColor = (status: string) => {
    const normalized = normalizeStatus(status);
    const colors: Record<PayrollPeriod['status'], string> = {
      open: 'bg-blue-100 text-blue-800',
      processing: 'bg-yellow-100 text-yellow-800',
      closed: 'bg-purple-100 text-purple-800',
      paid: 'bg-green-100 text-green-800'
    };
    return colors[normalized] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const normalized = normalizeStatus(status);
    switch (normalized) {
      case 'open':
        return 'Abierto';
      case 'processing':
        return 'Procesando';
      case 'closed':
        return 'Cerrado';
      case 'paid':
        return 'Pagado';
      default:
        return status;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Proceso de Pago de Nómina</h1>
            <p className="text-gray-600">Procesamiento y gestión de períodos de nómina</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/payroll/periods')}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
            >
              <i className="ri-calendar-line mr-2"></i>
              Nuevo Período
            </button>
            <button
              onClick={() => navigate('/payroll')}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
            >
              <i className="ri-arrow-left-line mr-2"></i>
              Volver
            </button>
          </div>
        </div>

        {loading && (
          <div className="text-center py-8">
            <i className="ri-loader-4-line animate-spin text-3xl text-blue-600"></i>
            <p className="text-gray-600 mt-2">Cargando...</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6">
          {periods.map((period) => (
            <div key={period.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{period.period_name}</h3>
                  <p className="text-sm text-gray-600">
                    Del {new Date(period.start_date).toLocaleDateString('es-DO')} al {new Date(period.end_date).toLocaleDateString('es-DO')}
                  </p>
                  <p className="text-sm text-gray-600">
                    Fecha de pago: {new Date(period.pay_date).toLocaleDateString('es-DO')}
                  </p>
                </div>
                <span className={`px-4 py-2 rounded-full text-sm font-medium ${getStatusColor(period.status)}`}>
                  {getStatusLabel(period.status)}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Empleados</p>
                  <p className="text-xl font-bold text-gray-900">{period.employee_count || 0}</p>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Salario Bruto</p>
                  <p className="text-xl font-bold text-blue-600">
                    RD$ {(period.total_gross || 0).toLocaleString('es-DO')}
                  </p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Deducciones</p>
                  <p className="text-xl font-bold text-red-600">
                    RD$ {(period.total_deductions || 0).toLocaleString('es-DO')}
                  </p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Salario Neto</p>
                  <p className="text-xl font-bold text-green-600">
                    RD$ {(period.total_net || 0).toLocaleString('es-DO')}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                {period.status === 'open' && (
                  <button
                    onClick={() => processPeriod(period.id)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                  >
                    <i className="ri-play-line mr-2"></i>
                    Procesar Nómina
                  </button>
                )}
                {period.status === 'processing' && (
                  <button
                    onClick={() => closePeriod(period.id)}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
                  >
                    <i className="ri-lock-line mr-2"></i>
                    Cerrar Período
                  </button>
                )}
                {period.status === 'closed' && (
                  <button
                    type="button"
                    disabled
                    className="bg-purple-100 text-purple-700 px-4 py-2 rounded-lg cursor-default"
                  >
                    <i className="ri-lock-line mr-2"></i>
                    Cerrado
                  </button>
                )}
              </div>
            </div>
          ))}

          {periods.length === 0 && !loading && (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <i className="ri-calendar-line text-5xl text-gray-400 mb-4"></i>
              <p className="text-gray-600">No hay períodos de nómina registrados</p>
              <button
                onClick={() => navigate('/payroll/periods')}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Crear Período de Nómina
              </button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
