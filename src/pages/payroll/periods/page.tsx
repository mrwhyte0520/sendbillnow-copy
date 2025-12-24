import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { exportToExcelStyled, exportToPdf } from '../../../utils/exportImportUtils';
import { useAuth } from '../../../hooks/useAuth';
import { payrollService, resolveTenantId } from '../../../services/database';
import { supabase } from '../../../lib/supabase';

interface PayrollPeriod {
  id: string;
  name: string;
  period_type: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
  start_date: string;
  end_date: string;
  pay_date: string;
  status: 'draft' | 'processing' | 'calculated' | 'paid' | 'closed';
  total_employees: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  created_at: string;
  closed_at?: string;
}

export default function PayrollPeriodsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<PayrollPeriod | null>(null);
  const [viewPeriod, setViewPeriod] = useState<PayrollPeriod | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    period_type: 'monthly' as PayrollPeriod['period_type'],
    start_date: '',
    end_date: '',
    pay_date: ''
  });

  useEffect(() => {
    const loadPeriods = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const rows = await payrollService.getPeriods(user.id);
        const mapped: PayrollPeriod[] = (rows || []).map((p: any) => {
          const rawStatus = (p.status ?? 'draft') as string;
          const value = rawStatus.toString().toLowerCase();
          const normalized: PayrollPeriod['status'] =
            value === 'processing' || value === 'procesando'
              ? 'processing'
              : value === 'calculated'
              ? 'calculated'
              : value === 'paid' || value === 'pagado'
              ? 'paid'
              : value === 'closed' || value === 'cerrado'
              ? 'closed'
              : 'draft';

          return {
            id: p.id,
            name: p.period_name || p.name || '',
            period_type: (p.period_type as PayrollPeriod['period_type']) || 'monthly',
            start_date: p.start_date || '',
            end_date: p.end_date || '',
            pay_date: p.pay_date || '',
            status: normalized,
            total_employees: Number(p.employee_count) || 0,
            total_gross: Number(p.total_gross) || 0,
            total_deductions: Number(p.total_deductions) || 0,
            total_net: Number(p.total_net) || 0,
            created_at: (p.created_at || new Date().toISOString()).split('T')[0],
            closed_at: p.closed_at ? String(p.closed_at).split('T')[0] : undefined,
          };
        });
        setPeriods(mapped);
      } catch (error) {
        console.error('Error loading payroll periods:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPeriods();
  }, [user]);

  const filteredPeriods = periods.filter(period => {
    const matchesSearch = period.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || period.status === filterStatus;
    const matchesType = filterType === 'all' || period.period_type === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  const maxEmployees =
    periods.length > 0
      ? Math.max(...periods.map(p => p.total_employees || 0))
      : 0;

  const mapUiStatusToDb = (status: PayrollPeriod['status']): 'open' | 'processing' | 'closed' | 'paid' => {
    switch (status) {
      case 'draft':
        return 'open';
      case 'processing':
      case 'calculated':
        return 'processing';
      case 'paid':
        return 'paid';
      case 'closed':
        return 'closed';
      default:
        return 'open';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      alert('Debe iniciar sesión para crear períodos de nómina.');
      return;
    }

    // Validaciones de fechas
    const { start_date, end_date, pay_date } = formData;

    if (!start_date || !end_date || !pay_date) {
      alert('Debe completar las fechas de inicio, fin y pago.');
      return;
    }

    const start = new Date(start_date);
    const end = new Date(end_date);
    const pay = new Date(pay_date);

    if (end < start) {
      alert('La fecha de fin no puede ser menor que la fecha de inicio.');
      return;
    }

    if (pay < start || pay > end) {
      alert('La fecha de pago debe estar entre la fecha de inicio y la fecha de fin.');
      return;
    }

    try {
      setLoading(true);

      if (editingPeriod) {
        const tenantId = await resolveTenantId(user.id);
        if (!tenantId) {
          throw new Error('No se pudo determinar la empresa del usuario.');
        }

        const patch = {
          period_name: formData.name,
          name: formData.name,
          start_date: formData.start_date,
          end_date: formData.end_date,
          pay_date: formData.pay_date,
        };

        const { error } = await supabase
          .from('payroll_periods')
          .update(patch)
          .eq('id', editingPeriod.id)
          .eq('user_id', tenantId);

        if (error) throw error;

        setPeriods(prev => prev.map(period =>
          period.id === editingPeriod.id
            ? {
                ...period,
                name: formData.name,
                period_type: formData.period_type,
                start_date: formData.start_date,
                end_date: formData.end_date,
                pay_date: formData.pay_date,
              }
            : period
        ));
      } else {

        const today = new Date().toISOString().slice(0, 10);

        const payload = {
          // Mantener compatibilidad con la creación de períodos desde la pantalla principal de Nómina
          period_name: formData.name || '',
          name: formData.name || '',
          start_date: formData.start_date || today,
          end_date: formData.end_date || today,
          pay_date: formData.pay_date || today,
          // Guardamos en la base en inglés para cumplir con el constraint de status
          status: 'open',
          total_gross: 0,
          total_deductions: 0,
          total_net: 0,
          employee_count: 0,
        };

        await payrollService.createPeriod(user.id, payload);

        // Recargar lista desde la base de datos para mantener consistencia
        const rows = await payrollService.getPeriods(user.id);
        const mapped: PayrollPeriod[] = (rows || []).map((p: any) => {
          const rawStatus = (p.status ?? 'draft') as string;
          const value = rawStatus.toString().toLowerCase();
          const normalized: PayrollPeriod['status'] =
            value === 'processing' || value === 'procesando'
              ? 'processing'
              : value === 'calculated'
              ? 'calculated'
              : value === 'paid' || value === 'pagado'
              ? 'paid'
              : value === 'closed' || value === 'cerrado'
              ? 'closed'
              : 'draft';

          return {
            id: p.id,
            name: p.period_name || p.name || '',
            period_type: (p.period_type as PayrollPeriod['period_type']) || 'monthly',
            start_date: p.start_date || '',
            end_date: p.end_date || '',
            pay_date: p.pay_date || '',
            status: normalized,
            total_employees: Number(p.employee_count) || 0,
            total_gross: Number(p.total_gross) || 0,
            total_deductions: Number(p.total_deductions) || 0,
            total_net: Number(p.total_net) || 0,
            created_at: (p.created_at || new Date().toISOString()).split('T')[0],
            closed_at: p.closed_at ? String(p.closed_at).split('T')[0] : undefined,
          };
        });
        setPeriods(mapped);
      }

      resetForm();
    } catch (error: any) {
      console.error('Error creating payroll period:', error);
      const errorMessage = error?.message || 'Error desconocido al crear el período de nómina.';
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      period_type: 'monthly',
      start_date: '',
      end_date: '',
      pay_date: ''
    });
    setEditingPeriod(null);
    setShowForm(false);
  };

  const handleEdit = (period: PayrollPeriod) => {
    setFormData({
      name: period.name,
      period_type: period.period_type,
      start_date: period.start_date,
      end_date: period.end_date,
      pay_date: period.pay_date
    });
    setEditingPeriod(period);
    setShowForm(true);
  };

  const updateStatus = async (id: string, newStatus: PayrollPeriod['status']) => {
    if (!user) {
      alert('Debe iniciar sesión para actualizar el estado del período.');
      return;
    }

    try {
      setLoading(true);
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        throw new Error('No se pudo determinar la empresa del usuario.');
      }

      const dbStatus = mapUiStatusToDb(newStatus);
      const patch: any = { status: dbStatus };

      if (newStatus === 'closed') {
        patch.closed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('payroll_periods')
        .update(patch)
        .eq('id', id)
        .eq('user_id', tenantId);

      if (error) throw error;

      setPeriods(prev => prev.map(period =>
        period.id === id
          ? {
              ...period,
              status: newStatus,
              ...(newStatus === 'closed'
                ? { closed_at: new Date().toISOString().split('T')[0] }
                : {}),
            }
          : period
      ));
    } catch (error) {
      console.error('Error updating payroll period status:', error);
      alert('Error al actualizar el estado del período de nómina.');
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = async () => {
    const today = new Date().toISOString().split('T')[0];

    const rows = filteredPeriods.map(period => ({
      name: period.name,
      type:
        period.period_type === 'monthly' ? 'Mensual' :
        period.period_type === 'biweekly' ? 'Quincenal' :
        period.period_type === 'weekly' ? 'Semanal' :
        period.period_type === 'quarterly' ? 'Trimestral' : 'Anual',
      startDate: period.start_date,
      endDate: period.end_date,
      payDate: period.pay_date,
      status:
        period.status === 'draft' ? 'Borrador' :
        period.status === 'processing' ? 'Procesando' :
        period.status === 'calculated' ? 'Calculado' :
        period.status === 'paid' ? 'Pagado' : 'Cerrado',
      totalEmployees: period.total_employees,
      totalGross: period.total_gross,
      totalDeductions: period.total_deductions,
      totalNet: period.total_net,
    }));

    if (!rows.length) {
      alert('No hay períodos para exportar.');
      return;
    }

    await exportToExcelStyled(
      rows,
      [
        { key: 'name', title: 'Período', width: 22 },
        { key: 'type', title: 'Tipo', width: 14 },
        { key: 'startDate', title: 'Fecha Inicio', width: 16 },
        { key: 'endDate', title: 'Fecha Fin', width: 16 },
        { key: 'payDate', title: 'Fecha Pago', width: 16 },
        { key: 'status', title: 'Estado', width: 14 },
        { key: 'totalEmployees', title: 'Empleados', width: 12 },
        { key: 'totalGross', title: 'Total Bruto', width: 16, numFmt: '#,##0.00' },
        { key: 'totalDeductions', title: 'Deducciones', width: 16, numFmt: '#,##0.00' },
        { key: 'totalNet', title: 'Total Neto', width: 16, numFmt: '#,##0.00' },
      ],
      `periodos_nomina_${today}`,
      'Períodos'
    );
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Borrador';
      case 'processing': return 'Procesando';
      case 'calculated': return 'Calculado';
      case 'paid': return 'Pagado';
      case 'closed': return 'Cerrado';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'processing': return 'bg-yellow-100 text-yellow-800';
      case 'calculated': return 'bg-blue-100 text-blue-800';
      case 'paid': return 'bg-green-100 text-green-800';
      case 'closed': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPeriodTypeLabel = (type: string) => {
    switch (type) {
      case 'weekly': return 'Semanal';
      case 'biweekly': return 'Quincenal';
      case 'monthly': return 'Mensual';
      case 'quarterly': return 'Trimestral';
      case 'annual': return 'Anual';
      default: return type;
    }
  };

  const canEdit = (status: string) => {
    return status === 'draft' || status === 'processing';
  };

  const canProcess = (status: string) => {
    return status === 'draft';
  };

  const canCalculate = (status: string) => {
    return status === 'processing';
  };

  const canPay = (status: string) => {
    return status === 'calculated';
  };

  const canClose = (status: string) => {
    return status === 'paid';
  };

  const handleExportPeriodToExcel = async (period: PayrollPeriod) => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const entries = await payrollService.getEntries(period.id);
      if (!entries || (entries as any[]).length === 0) {
        alert('No hay entradas de nómina para este período.');
        return;
      }

      const detailRows = (entries as any[]).map((e: any) => {
        const emp = (e as any).employees || {};
        const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
        return {
          period: period.name,
          employeeCode: emp.employee_code || '',
          employeeName: fullName || 'Sin nombre',
          gross: Number(e.gross_salary) || 0,
          deductions: Number(e.deductions) || 0,
          net: Number(e.net_salary) || 0,
        };
      });

      const totalGross = detailRows.reduce((sum, r) => sum + (r.gross || 0), 0);
      const totalDeductions = detailRows.reduce((sum, r) => sum + (r.deductions || 0), 0);
      const totalNet = detailRows.reduce((sum, r) => sum + (r.net || 0), 0);

      const rows = [
        ...detailRows,
        {
          period: period.name,
          employeeCode: 'TOTAL',
          employeeName: '',
          gross: totalGross,
          deductions: totalDeductions,
          net: totalNet,
        },
      ];

      await exportToExcelStyled(
        rows,
        [
          { key: 'period', title: 'Período', width: 22 },
          { key: 'employeeCode', title: 'Código', width: 14 },
          { key: 'employeeName', title: 'Empleado', width: 30 },
          { key: 'gross', title: 'Salario Bruto', width: 18, numFmt: '#,##0.00' },
          { key: 'deductions', title: 'Deducciones', width: 18, numFmt: '#,##0.00' },
          { key: 'net', title: 'Salario Neto', width: 18, numFmt: '#,##0.00' },
        ],
        `nomina_periodo_${(period.name || '').replace(/\s+/g, '_') || period.id}_${today}`,
        `Nómina - ${period.name}`,
      );
    } catch (error) {
      console.error('Error exporting payroll period to Excel:', error);
      alert('Error al exportar el período a Excel.');
    }
  };

  const handleExportPeriodToPdf = async (period: PayrollPeriod) => {
    try {
      const entries = await payrollService.getEntries(period.id);

      if (!entries || (entries as any[]).length === 0) {
        alert('No hay entradas de nómina para este período.');
        return;
      }

      const detailRows = (entries as any[]).map((e: any) => {
        const emp = (e as any).employees || {};
        const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
        return {
          employeeCode: emp.employee_code || '',
          employeeName: fullName || 'Sin nombre',
          gross: Number(e.gross_salary) || 0,
          deductions: Number(e.deductions) || 0,
          net: Number(e.net_salary) || 0,
        };
      });

      const totalGross = detailRows.reduce((sum, r) => sum + (r.gross || 0), 0);
      const totalDeductions = detailRows.reduce((sum, r) => sum + (r.deductions || 0), 0);
      const totalNet = detailRows.reduce((sum, r) => sum + (r.net || 0), 0);

      const rows = [
        ...detailRows,
        {
          employeeCode: 'TOTAL',
          employeeName: '',
          gross: totalGross,
          deductions: totalDeductions,
          net: totalNet,
        },
      ];

      const columns = [
        { key: 'employeeCode', label: 'Código' },
        { key: 'employeeName', label: 'Empleado' },
        { key: 'gross', label: 'Salario Bruto' },
        { key: 'deductions', label: 'Deducciones' },
        { key: 'net', label: 'Salario Neto' },
      ];

      await exportToPdf(
        rows,
        columns,
        `nomina_periodo_${(period.name || '').replace(/\s+/g, '_') || period.id}`,
        `Nómina - ${period.name}`,
      );
    } catch (error) {
      console.error('Error exporting payroll period to PDF:', error);
      alert('Error al exportar el período a PDF.');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Períodos de Nómina</h1>
            <p className="text-gray-600">Gestiona los períodos de pago y procesamiento de nóminas</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/payroll/payroll-process')}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
            >
              <i className="ri-arrow-left-line"></i>
              Ir Atrás
            </button>
            <button
              onClick={exportToExcel}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <i className="ri-download-line"></i>
              Exportar
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <i className="ri-add-line"></i>
              Nuevo Período
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Períodos</p>
                <p className="text-2xl font-bold text-gray-900">{periods.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <i className="ri-calendar-line text-xl text-blue-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">En Proceso</p>
                <p className="text-2xl font-bold text-gray-900">
                  {periods.filter(p => p.status === 'processing' || p.status === 'calculated').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <i className="ri-time-line text-xl text-yellow-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pagados</p>
                <p className="text-2xl font-bold text-gray-900">
                  {periods.filter(p => p.status === 'paid').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <i className="ri-check-line text-xl text-green-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Último Pago</p>
                <p className="text-lg font-bold text-gray-900">
                  RD${periods.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.total_net, 0).toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <i className="ri-money-dollar-circle-line text-xl text-purple-600"></i>
              </div>
            </div>
          </div>

        </div>

        {/* Filters */}
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
                  placeholder="Buscar períodos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Estado
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos los estados</option>
                <option value="draft">Borrador</option>
                <option value="processing">Procesando</option>
                <option value="calculated">Calculado</option>
                <option value="paid">Pagado</option>
                <option value="closed">Cerrado</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de Período
              </label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos los tipos</option>
                <option value="weekly">Semanal</option>
                <option value="biweekly">Quincenal</option>
                <option value="monthly">Mensual</option>
                <option value="quarterly">Trimestral</option>
                <option value="annual">Anual</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterStatus('all');
                  setFilterType('all');
                }}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Periods Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Período
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fechas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Empleados
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Bruto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Neto
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPeriods.map((period) => (
                  <tr key={period.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{period.name}</div>
                        <div className="text-sm text-gray-500">{getPeriodTypeLabel(period.period_type)}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        <div>{period.start_date} - {period.end_date}</div>
                        <div className="text-gray-500">Pago: {period.pay_date}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(period.status)}`}>
                        {getStatusLabel(period.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {period.total_employees}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      RD${period.total_gross.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      RD${period.total_net.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setViewPeriod(period);
                            setShowViewModal(true);
                          }}
                          className="text-gray-600 hover:text-gray-900"
                          title="Ver Detalles"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        <button
                          onClick={() => handleExportPeriodToExcel(period)}
                          className="text-green-600 hover:text-green-900"
                          title="Exportar a Excel"
                        >
                          <i className="ri-file-excel-2-line"></i>
                        </button>
                        <button
                          onClick={() => handleExportPeriodToPdf(period)}
                          className="text-red-600 hover:text-red-900"
                          title="Imprimir / PDF"
                        >
                          <i className="ri-file-pdf-2-line"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingPeriod ? 'Editar Período' : 'Nuevo Período'}
                </h2>
                <button
                  onClick={resetForm}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre del Período *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: Enero 2024"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo de Período *
                    </label>
                    <select
                      required
                      value={formData.period_type}
                      onChange={(e) => setFormData(prev => ({ ...prev, period_type: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="weekly">Semanal</option>
                      <option value="biweekly">Quincenal</option>
                      <option value="monthly">Mensual</option>
                      <option value="quarterly">Trimestral</option>
                      <option value="annual">Anual</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha de Inicio *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.start_date}
                      onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha de Fin *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.end_date}
                      min={formData.start_date || undefined}
                      onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha de Pago *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.pay_date}
                    min={formData.start_date || undefined}
                    max={formData.end_date || undefined}
                    onChange={(e) => setFormData(prev => ({ ...prev, pay_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-6">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    {editingPeriod ? 'Actualizar' : 'Crear'} Período
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* View Details Modal */}
        {showViewModal && viewPeriod && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">Detalle del Período</h2>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setViewPeriod(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className="space-y-4 text-sm text-gray-700">
                <div>
                  <p className="font-semibold">Nombre del Período</p>
                  <p>{viewPeriod.name}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="font-semibold">Tipo</p>
                    <p>{getPeriodTypeLabel(viewPeriod.period_type)}</p>
                  </div>
                  <div>
                    <p className="font-semibold">Estado</p>
                    <p>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(viewPeriod.status)}`}>
                        {getStatusLabel(viewPeriod.status)}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="font-semibold">Fecha Inicio</p>
                    <p>{viewPeriod.start_date}</p>
                  </div>
                  <div>
                    <p className="font-semibold">Fecha Fin</p>
                    <p>{viewPeriod.end_date}</p>
                  </div>
                  <div>
                    <p className="font-semibold">Fecha de Pago</p>
                    <p>{viewPeriod.pay_date}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <p className="font-semibold">Empleados</p>
                    <p>{viewPeriod.total_employees}</p>
                  </div>
                  <div>
                    <p className="font-semibold">Total Bruto</p>
                    <p>RD${viewPeriod.total_gross.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="font-semibold">Deducciones</p>
                    <p>RD${viewPeriod.total_deductions.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="font-semibold">Total Neto</p>
                    <p>RD${viewPeriod.total_net.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setViewPeriod(null);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
