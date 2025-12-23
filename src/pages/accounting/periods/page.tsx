import { useState, useEffect, type FC } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { resolveTenantId } from '../../../services/database';
import { formatDate } from '../../../utils/dateFormat';

interface AccountingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed' | 'locked';
  fiscal_year: string;
  period_type?: 'fiscal' | 'accounting';
  created_at: string;
  closed_at?: string;
  closed_by?: string;
  entries_count?: number;
  total_debits?: number;
  total_credits?: number;
}

const AccountingPeriodsPage: FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateFiscalYearModal, setShowCreateFiscalYearModal] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<AccountingPeriod | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'fiscal' | 'accounting'>('accounting');

  // Formulario para nuevo período
  const [formData, setFormData] = useState({
    month: (new Date().getMonth() + 1).toString(),
    year: new Date().getFullYear().toString(),
    name: '',
    start_date: '',
    end_date: '',
    fiscal_year: new Date().getFullYear().toString()
  });

  // Formulario para nuevo período fiscal
  const [fiscalYearForm, setFiscalYearForm] = useState({
    year: new Date().getFullYear().toString(),
    autoGenerateMonths: true
  });

  useEffect(() => {
    loadPeriods();
  }, [user]);

  const loadPeriods = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return;
      
      // Intentar cargar desde Supabase
      const { data: periodsData, error } = await supabase
        .from('accounting_periods')
        .select('*')
        .eq('user_id', tenantId)
        .order('start_date', { ascending: false });

      if (!error && periodsData) {
        setPeriods(periodsData);
      } else {
        throw new Error('Error loading from Supabase');
      }
    } catch (error) {
      console.error('Error loading periods:', error);
      // Cargar datos de ejemplo
      loadMockPeriods();
    } finally {
      setLoading(false);
    }
  };

  const loadMockPeriods = () => {
    setPeriods([]);
  };

  const downloadExcel = () => {
    try {
      // Crear contenido CSV
      let csvContent = 'Períodos Contables\n';
      csvContent += `Generado: ${formatDate(new Date())}\n\n`;
      csvContent += 'Período,Fecha Inicio,Fecha Fin,Año Fiscal,Estado,Asientos,Total Débitos,Total Créditos,Fecha Cierre,Cerrado Por\n';
      
      filteredPeriods.forEach(period => {
        const row = [
          `"${period.name}"`,
          formatDate(period.start_date),
          formatDate(period.end_date),
          period.fiscal_year,
          period.status === 'open' ? 'Abierto' : period.status === 'closed' ? 'Cerrado' : 'Bloqueado',
          period.entries_count || 0,
          `RD$${(period.total_debits || 0).toLocaleString()}`,
          `RD$${(period.total_credits || 0).toLocaleString()}`,
          period.closed_at ? formatDate(period.closed_at) : '',
          period.closed_by || ''
        ].join(',');
        csvContent += row + '\n';
      });

      // Agregar resumen
      csvContent += '\nResumen:\n';
      csvContent += `Total Períodos:,${filteredPeriods.length}\n`;
      csvContent += `Períodos Abiertos:,${filteredPeriods.filter(p => p.status === 'open').length}\n`;
      csvContent += `Períodos Cerrados:,${filteredPeriods.filter(p => p.status === 'closed').length}\n`;
      csvContent += `Períodos Bloqueados:,${filteredPeriods.filter(p => p.status === 'locked').length}\n`;
      csvContent += `Total Asientos:,${filteredPeriods.reduce((sum, p) => sum + (p.entries_count || 0), 0)}\n`;
      csvContent += `Total Débitos:,RD$${filteredPeriods.reduce((sum, p) => sum + (p.total_debits || 0), 0).toLocaleString()}\n`;
      csvContent += `Total Créditos:,RD$${filteredPeriods.reduce((sum, p) => sum + (p.total_credits || 0), 0).toLocaleString()}\n`;

      // Crear y descargar archivo
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `periodos_contables_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading Excel:', error);
      alert('Error al descargar el archivo');
    }
  };

  const validatePeriodDates = (startDate: string, endDate: string): string | null => {
    if (!startDate || !endDate) {
      return 'Debe especificar fecha de inicio y fin';
    }

    if (new Date(startDate) >= new Date(endDate)) {
      return 'La fecha de inicio debe ser anterior a la fecha de fin';
    }

    // Verificar solapamiento con períodos existentes
    const hasOverlap = periods.some(period => {
      const periodStart = new Date(period.start_date);
      const periodEnd = new Date(period.end_date);
      const newStart = new Date(startDate);
      const newEnd = new Date(endDate);

      return (newStart <= periodEnd && newEnd >= periodStart);
    });

    if (hasOverlap) {
      return 'El período se solapa con un período existente';
    }

    return null;
  };

  const handleCreatePeriod = async () => {
    if (!user) return;

    try {
      // Calcular fechas automáticamente según mes y año seleccionados
      const monthNum = parseInt(formData.month);
      const yearNum = parseInt(formData.year);
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0); // Último día del mes
      
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Validar que existe un período fiscal para este año
      const fiscalYearExists = periods.some(p => 
        p.fiscal_year === formData.year && 
        (p.name.includes('Año Fiscal') || p.start_date.startsWith(`${formData.year}-01-01`))
      );

      if (!fiscalYearExists && periods.filter(p => p.fiscal_year === formData.year).length === 0) {
        if (!confirm(`No existe un período fiscal para el año ${formData.year}. ¿Desea crear el período de todas formas?`)) {
          return;
        }
      }

      // Validar fechas
      const validationError = validatePeriodDates(startDateStr, endDateStr);
      if (validationError) {
        alert(validationError);
        return;
      }

      // Generar nombre automático si no se especificó
      const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
      ];
      const autoName = `${monthNames[monthNum - 1]} ${formData.year}`;
      const periodName = formData.name.trim() || autoName;

      const newPeriod: AccountingPeriod = {
        id: Date.now().toString(),
        name: periodName,
        start_date: startDateStr,
        end_date: endDateStr,
        status: 'open',
        fiscal_year: formData.year,
        period_type: 'accounting',
        created_at: new Date().toISOString(),
        entries_count: 0,
        total_debits: 0,
        total_credits: 0
      };

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        alert('Error: No se pudo resolver el tenant');
        return;
      }

      try {
        const { data, error } = await supabase
          .from('accounting_periods')
          .insert([{
            user_id: tenantId,
            name: newPeriod.name,
            start_date: newPeriod.start_date,
            end_date: newPeriod.end_date,
            status: newPeriod.status,
            fiscal_year: newPeriod.fiscal_year
            // period_type se detecta automáticamente por getPeriodType()
          }])
          .select()
          .single();

        if (error) {
          console.error('Supabase error:', error);
          alert('Error al guardar el período en la base de datos');
          return;
        }
        
        setPeriods(prev => [{ ...newPeriod, id: data.id }, ...prev]);
      } catch (supabaseError) {
        console.error('Supabase error:', supabaseError);
        alert('Error al guardar el período');
        return;
      }
      
      // Resetear formulario
      const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
      const nextYear = monthNum === 12 ? yearNum + 1 : yearNum;
      setFormData({
        month: nextMonth.toString(),
        year: nextYear.toString(),
        name: '',
        start_date: '',
        end_date: '',
        fiscal_year: nextYear.toString()
      });
      
      setShowCreateModal(false);
      alert('Período contable creado exitosamente');
    } catch (error) {
      console.error('Error creating period:', error);
      alert('Error al crear el período contable');
    }
  };

  const handleClosePeriod = async (periodId: string) => {
    if (!confirm('¿Está seguro de que desea cerrar este período? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      const updatedPeriod = {
        status: 'closed' as const,
        closed_at: new Date().toISOString(),
        closed_by: 'Admin'
      };

      try {
        const { error } = await supabase
          .from('accounting_periods')
          .update(updatedPeriod)
          .eq('id', periodId);

        if (error) throw error;
      } catch (supabaseError) {
        console.error('Supabase error:', supabaseError);
      }

      setPeriods(prev => prev.map(period => 
        period.id === periodId 
          ? { ...period, ...updatedPeriod }
          : period
      ));
      alert('Período cerrado exitosamente');
    } catch (error) {
      console.error('Error closing period:', error);
      alert('Error al cerrar el período');
    }
  };

  const handleLockPeriod = async (periodId: string) => {
    if (!confirm('¿Está seguro de que desea bloquear este período? No se podrán realizar más cambios.')) {
      return;
    }

    try {
      const updatedPeriod = { status: 'locked' as const };

      try {
        const { error } = await supabase
          .from('accounting_periods')
          .update(updatedPeriod)
          .eq('id', periodId);

        if (error) throw error;
      } catch (supabaseError) {
        console.error('Supabase error:', supabaseError);
      }

      setPeriods(prev => prev.map(period => 
        period.id === periodId 
          ? { ...period, ...updatedPeriod }
          : period
      ));
      alert('Período bloqueado exitosamente');
    } catch (error) {
      console.error('Error locking period:', error);
      alert('Error al bloquear el período');
    }
  };

  const handleReopenPeriod = async (periodId: string) => {
    if (!confirm('¿Está seguro de que desea reabrir este período?')) {
      return;
    }

    try {
      const updatedPeriod = { 
        status: 'open' as const,
        closed_at: undefined as unknown as string | undefined,
        closed_by: undefined as unknown as string | undefined
      };

      try {
        const { error } = await supabase
          .from('accounting_periods')
          .update(updatedPeriod)
          .eq('id', periodId);

        if (error) throw error;
      } catch (supabaseError) {
        console.error('Supabase error:', supabaseError);
      }

      setPeriods(prev => prev.map(period => 
        period.id === periodId 
          ? { ...period, ...updatedPeriod }
          : period
      ));
      alert('Período reabierto exitosamente');
    } catch (error) {
      console.error('Error reopening period:', error);
      alert('Error al reabrir el período');
    }
  };

  const handleCreateFiscalYear = async () => {
    if (!user) return;

    try {
      const year = fiscalYearForm.year;
      
      // Verificar si ya existe el período fiscal para este año
      const existingFiscalYear = periods.find(p => 
        p.name === `Año Fiscal ${year}` || 
        (p.fiscal_year === year && p.start_date === `${year}-01-01` && p.end_date === `${year}-12-31`)
      );
      
      if (existingFiscalYear) {
        alert(`Ya existe el Año Fiscal ${year}. No se puede crear duplicado.`);
        return;
      }

      // Verificar si ya existen períodos mensuales para este año
      const existingMonthlyPeriods = periods.filter(p => p.fiscal_year === year && !p.name.includes('Año Fiscal'));
      if (existingMonthlyPeriods.length > 0) {
        if (!confirm(`Ya existen ${existingMonthlyPeriods.length} períodos mensuales para el año ${year}. ¿Desea crear el año fiscal de todas formas?`)) {
          return;
        }
      }

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        alert('Error: No se pudo resolver el tenant');
        return;
      }

      if (fiscalYearForm.autoGenerateMonths) {
        // Primero crear el período fiscal anual
        const fiscalPeriod: AccountingPeriod = {
          id: `${Date.now()}-fiscal`,
          name: `Año Fiscal ${year}`,
          start_date: `${year}-01-01`,
          end_date: `${year}-12-31`,
          status: 'open',
          fiscal_year: year,
          period_type: 'fiscal',
          created_at: new Date().toISOString(),
          entries_count: 0,
          total_debits: 0,
          total_credits: 0
        };

        console.log('Creando período fiscal anual:', fiscalPeriod.name);
        
        const { data: fiscalData, error: fiscalError } = await supabase
          .from('accounting_periods')
          .insert([{
            user_id: tenantId,
            name: fiscalPeriod.name,
            start_date: fiscalPeriod.start_date,
            end_date: fiscalPeriod.end_date,
            status: fiscalPeriod.status,
            fiscal_year: fiscalPeriod.fiscal_year
          }])
          .select()
          .single();

        if (fiscalError) {
          console.error('ERROR creando período fiscal:', fiscalError);
          alert(`Error al crear período fiscal anual: ${fiscalError.message}`);
          return;
        }
        
        if (fiscalData) {
          fiscalPeriod.id = fiscalData.id;
          console.log('✓ Período fiscal anual creado con ID:', fiscalData.id);
        }

        // Luego generar los 12 períodos mensuales (contables)
        const monthNames = [
          'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];

        const newPeriods: AccountingPeriod[] = [fiscalPeriod];
        
        for (let month = 0; month < 12; month++) {
          const startDate = new Date(parseInt(year), month, 1);
          const endDate = new Date(parseInt(year), month + 1, 0); // Último día del mes
          
          const periodName = `${monthNames[month]} ${year}`;
          const startDateStr = startDate.toISOString().split('T')[0];
          const endDateStr = endDate.toISOString().split('T')[0];

          const newPeriod: AccountingPeriod = {
            id: `${Date.now()}-${month}`,
            name: periodName,
            start_date: startDateStr,
            end_date: endDateStr,
            status: 'open',
            fiscal_year: year,
            period_type: 'accounting',
            created_at: new Date().toISOString(),
            entries_count: 0,
            total_debits: 0,
            total_credits: 0
          };

          try {
            const { data, error } = await supabase
              .from('accounting_periods')
              .insert([{
                user_id: tenantId,
                name: newPeriod.name,
                start_date: newPeriod.start_date,
                end_date: newPeriod.end_date,
                status: newPeriod.status,
                fiscal_year: newPeriod.fiscal_year
                // period_type se detecta automáticamente por getPeriodType()
              }])
              .select()
              .single();

            if (error) throw error;
            newPeriods.push({ ...newPeriod, id: data.id });
          } catch (supabaseError) {
            console.error('Supabase error creating period:', supabaseError);
            // No agregamos período local si falló en BD
          }
        }

        // Recargar períodos desde la BD para asegurar sincronización
        await loadPeriods();
        alert(`Año fiscal ${year} creado exitosamente con ${newPeriods.length} períodos`);
      } else {
        // Crear solo el período fiscal anual
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;
        
        const newPeriod: AccountingPeriod = {
          id: Date.now().toString(),
          name: `Año Fiscal ${year}`,
          start_date: startDate,
          end_date: endDate,
          status: 'open',
          fiscal_year: year,
          period_type: 'fiscal',
          created_at: new Date().toISOString(),
          entries_count: 0,
          total_debits: 0,
          total_credits: 0
        };

        try {
          const { error } = await supabase
            .from('accounting_periods')
            .insert([{
              user_id: tenantId,
              name: newPeriod.name,
              start_date: newPeriod.start_date,
              end_date: newPeriod.end_date,
              status: newPeriod.status,
              fiscal_year: newPeriod.fiscal_year
            }]);

          if (error) {
            console.error('Supabase error:', error);
            alert(`Error al guardar el año fiscal: ${error.message}`);
            return;
          }
          // Recargar períodos desde la BD
          await loadPeriods();
        } catch (supabaseError: any) {
          console.error('Supabase error:', supabaseError);
          alert(`Error al guardar el año fiscal: ${supabaseError?.message || 'Error desconocido'}`);
          return;
        }

        alert(`Año fiscal ${year} creado exitosamente`);
      }

      setFiscalYearForm({
        year: (parseInt(year) + 1).toString(),
        autoGenerateMonths: true
      });
      setShowCreateFiscalYearModal(false);
    } catch (error) {
      console.error('Error creating fiscal year:', error);
      alert('Error al crear el año fiscal');
    }
  };

  // Función para detectar tipo de período (compatibilidad con períodos sin period_type)
  const getPeriodType = (period: AccountingPeriod): 'fiscal' | 'accounting' => {
    // Extraer solo la parte de fecha (YYYY-MM-DD) - las fechas de Supabase pueden incluir timestamp
    const startStr = (period.start_date || '').substring(0, 10);
    const endStr = (period.end_date || '').substring(0, 10);

    // Heurística fiscal: si el nombre contiene 'fiscal' o el rango es anual
    const nameLower = (period.name || '').toLowerCase();
    const looksFiscalByName = nameLower.includes('fiscal');
    const looksFiscalByDates = startStr.endsWith('-01-01') && endStr.endsWith('-12-31');

    // Si es claramente fiscal por nombre/fechas, priorizarlo incluso si BD trae period_type='accounting'
    if (looksFiscalByName || looksFiscalByDates) {
      return 'fiscal';
    }

    // Si ya tiene period_type definido (y no cae en fiscal por heurística), usarlo
    if (period.period_type === 'fiscal' || period.period_type === 'accounting') {
      return period.period_type;
    }

    // Fallback por duración (12 meses aprox = fiscal)
    const start = new Date(period.start_date);
    const end = new Date(period.end_date);
    const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (diffMonths >= 11 && start.getDate() === 1 && end.getDate() >= 28) {
      return 'fiscal';
    }

    return 'accounting';
  };

  const filteredPeriods = periods.filter(period => {
    const matchesSearch = period.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || period.status === statusFilter;
    const periodFiscalYear = String((period as any).fiscal_year ?? '');
    const matchesYear = !yearFilter || periodFiscalYear === String(yearFilter);
    const matchesType = getPeriodType(period) === activeTab;
    
    return matchesSearch && matchesStatus && matchesYear && matchesType;
  });

  const fiscalPeriods = periods.filter(p => getPeriodType(p) === 'fiscal');
  const accountingPeriods = periods.filter(p => getPeriodType(p) === 'accounting');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-yellow-100 text-yellow-800';
      case 'locked':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'open':
        return 'Abierto';
      case 'closed':
        return 'Cerrado';
      case 'locked':
        return 'Bloqueado';
      default:
        return 'Desconocido';
    }
  };

  const uniqueYears = [...new Set(periods.map(p => String((p as any).fiscal_year ?? '')))]
    .filter(Boolean)
    .sort()
    .reverse();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header con botón de regreso */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/accounting')}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <i className="ri-arrow-left-line"></i>
            Volver a Contabilidad
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Períodos Contables / Fiscales</h1>
            <p className="text-gray-600">Gestión de períodos contables y fiscales</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateFiscalYearModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <i className="ri-calendar-line"></i>
            Nuevo Año Fiscal
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <i className="ri-add-line"></i>
            Nuevo Período
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <i className="ri-calendar-check-line text-2xl text-green-600"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Períodos Abiertos</p>
              <p className="text-2xl font-bold text-gray-900">
                {periods.filter(p => p.status === 'open').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <i className="ri-calendar-close-line text-2xl text-yellow-600"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Períodos Cerrados</p>
              <p className="text-2xl font-bold text-gray-900">
                {periods.filter(p => p.status === 'closed').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-red-100 rounded-lg">
              <i className="ri-lock-line text-2xl text-red-600"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Períodos Bloqueados</p>
              <p className="text-2xl font-bold text-gray-900">
                {periods.filter(p => p.status === 'locked').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <i className="ri-file-list-3-line text-2xl text-blue-600"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Asientos</p>
              <p className="text-2xl font-bold text-gray-900">
                {periods.reduce((sum, p) => sum + (p.entries_count || 0), 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <i className="ri-calendar-line text-2xl text-purple-600"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Año Fiscal Actual</p>
              <p className="text-2xl font-bold text-gray-900">
                {new Date().getFullYear()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs: Períodos Contables / Fiscales */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('accounting')}
              className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'accounting'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <i className="ri-calendar-line mr-2"></i>
              Períodos Contables ({accountingPeriods.length})
            </button>
            <button
              onClick={() => setActiveTab('fiscal')}
              className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'fiscal'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <i className="ri-calendar-check-line mr-2"></i>
              Períodos Fiscales ({fiscalPeriods.length})
            </button>
          </nav>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  placeholder={`Buscar ${activeTab === 'accounting' ? 'períodos contables' : 'períodos fiscales'}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
              >
                <option value="all">Todos los estados</option>
                <option value="open">Abiertos</option>
                <option value="closed">Cerrados</option>
                <option value="locked">Bloqueados</option>
              </select>
              
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
              >
                <option value="">Todos los años</option>
                {uniqueYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Periods Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Período
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha Inicio
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha Fin
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Año Fiscal
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Asientos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Movimientos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPeriods.map((period) => (
                <tr key={period.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {period.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(period.start_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(period.end_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {period.fiscal_year}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(period.status)}`}>
                      {getStatusText(period.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {period.entries_count || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    RD${((period.total_debits || 0) + (period.total_credits || 0)).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setSelectedPeriod(period)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Ver detalles"
                      >
                        <i className="ri-eye-line"></i>
                      </button>
                      
                      {period.status === 'open' && (
                        <button
                          onClick={() => handleClosePeriod(period.id)}
                          className="text-yellow-600 hover:text-yellow-900"
                          title="Cerrar período"
                        >
                          <i className="ri-calendar-close-line"></i>
                        </button>
                      )}
                      
                      {period.status === 'closed' && (
                        <>
                          <button
                            onClick={() => handleLockPeriod(period.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Bloquear período"
                          >
                            <i className="ri-lock-line"></i>
                          </button>
                          <button
                            onClick={() => handleReopenPeriod(period.id)}
                            className="text-green-600 hover:text-green-900"
                            title="Reabrir período"
                          >
                            <i className="ri-calendar-check-line"></i>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Period Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Nuevo Período Contable</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-blue-800">
                    <i className="ri-information-line mr-1"></i>
                    Seleccione el mes y año del período contable. Las fechas se calcularán automáticamente.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Mes *
                    </label>
                    <select
                      value={formData.month}
                      onChange={(e) => setFormData(prev => ({ ...prev, month: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="1">Enero</option>
                      <option value="2">Febrero</option>
                      <option value="3">Marzo</option>
                      <option value="4">Abril</option>
                      <option value="5">Mayo</option>
                      <option value="6">Junio</option>
                      <option value="7">Julio</option>
                      <option value="8">Agosto</option>
                      <option value="9">Septiembre</option>
                      <option value="10">Octubre</option>
                      <option value="11">Noviembre</option>
                      <option value="12">Diciembre</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Año *
                    </label>
                    <select
                      value={formData.year}
                      onChange={(e) => setFormData(prev => ({ ...prev, year: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre del Período (opcional)
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Se generará automáticamente si se deja vacío"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Por defecto: {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][parseInt(formData.month) - 1]} {formData.year}
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-4 mt-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreatePeriod}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Crear Período Contable
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Fiscal Year Modal */}
      {showCreateFiscalYearModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Nuevo Año Fiscal</h2>
                <button
                  onClick={() => setShowCreateFiscalYearModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Año Fiscal
                  </label>
                  <input
                    type="number"
                    value={fiscalYearForm.year}
                    onChange={(e) => setFiscalYearForm(prev => ({ ...prev, year: e.target.value }))}
                    min="2020"
                    max="2030"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    El período fiscal abarca del 1 de enero al 31 de diciembre
                  </p>
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fiscalYearForm.autoGenerateMonths}
                      onChange={(e) => setFiscalYearForm(prev => ({ ...prev, autoGenerateMonths: e.target.checked }))}
                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-blue-900">
                        Crear automáticamente los 12 períodos contables mensuales
                      </span>
                      <p className="text-xs text-blue-700 mt-1">
                        Se crearán períodos para Enero, Febrero, Marzo... hasta Diciembre del año seleccionado
                      </p>
                    </div>
                  </label>
                </div>

                {!fiscalYearForm.autoGenerateMonths && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-xs text-yellow-800">
                      <i className="ri-information-line mr-1"></i>
                      Solo se creará un período anual. Podrás crear períodos mensuales manualmente después.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-4 mt-6">
                <button
                  onClick={() => setShowCreateFiscalYearModal(false)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateFiscalYear}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <i className="ri-calendar-line mr-2"></i>
                  Crear Año Fiscal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Period Detail Modal */}
      {selectedPeriod && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  Detalles del Período: {selectedPeriod.name}
                </h2>
                <button
                  onClick={() => setSelectedPeriod(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Información General</h3>
                  <div className="space-y-3">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Período:</span>
                      <span className="ml-2 text-sm text-gray-900">{selectedPeriod.name}</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Fecha Inicio:</span>
                      <span className="ml-2 text-sm text-gray-900">
                        {formatDate(selectedPeriod.start_date)}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Fecha Fin:</span>
                      <span className="ml-2 text-sm text-gray-900">
                        {formatDate(selectedPeriod.end_date)}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Año Fiscal:</span>
                      <span className="ml-2 text-sm text-gray-900">{selectedPeriod.fiscal_year}</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Estado:</span>
                      <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedPeriod.status)}`}>
                        {getStatusText(selectedPeriod.status)}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Estadísticas del Período</h3>
                  <div className="space-y-3">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Total Asientos:</span>
                      <span className="ml-2 text-sm font-bold text-gray-900">
                        {selectedPeriod.entries_count || 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Total Débitos:</span>
                      <span className="ml-2 text-sm font-bold text-green-600">
                        RD${(selectedPeriod.total_debits || 0).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Total Créditos:</span>
                      <span className="ml-2 text-sm font-bold text-red-600">
                        RD${(selectedPeriod.total_credits || 0).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Creado:</span>
                      <span className="ml-2 text-sm text-gray-900">
                        {formatDate(selectedPeriod.created_at)}
                      </span>
                    </div>
                    {selectedPeriod.closed_at && (
                      <>
                        <div>
                          <span className="text-sm font-medium text-gray-500">Cerrado:</span>
                          <span className="ml-2 text-sm text-gray-900">
                            {formatDate(selectedPeriod.closed_at)}
                          </span>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-500">Cerrado por:</span>
                          <span className="ml-2 text-sm text-gray-900">{selectedPeriod.closed_by}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="flex justify-between">
                  <div className="space-x-2">
                    {selectedPeriod.status === 'open' && (
                      <button
                        onClick={() => {
                          handleClosePeriod(selectedPeriod.id);
                          setSelectedPeriod(null);
                        }}
                        className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                      >
                        <i className="ri-calendar-close-line mr-2"></i>
                        Cerrar Período
                      </button>
                    )}
                    
                    {selectedPeriod.status === 'closed' && (
                      <>
                        <button
                          onClick={() => {
                            handleLockPeriod(selectedPeriod.id);
                            setSelectedPeriod(null);
                          }}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                          <i className="ri-lock-line mr-2"></i>
                          Bloquear Período
                        </button>
                        <button
                          onClick={() => {
                            handleReopenPeriod(selectedPeriod.id);
                            setSelectedPeriod(null);
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <i className="ri-calendar-check-line mr-2"></i>
                          Reabrir Período
                        </button>
                      </>
                    )}
                  </div>
                  
                  <button
                    onClick={() => setSelectedPeriod(null)}
                    className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountingPeriodsPage;
