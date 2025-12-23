import { useState, useEffect, type FC } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { resolveTenantId } from '../../../services/database';
import { formatDate } from '../../../utils/dateFormat';
import { formatAmount } from '../../../utils/numberFormat';
import { exportToExcelWithHeaders } from '../../../utils/exportImportUtils';

interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  total_debit: number;
  total_credit: number;
  status: string;
}

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
  const [periodEntries, setPeriodEntries] = useState<JournalEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

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
      
      // Cargar períodos desde Supabase
      const { data: periodsData, error } = await supabase
        .from('accounting_periods')
        .select('*')
        .eq('user_id', tenantId)
        .order('start_date', { ascending: false });

      if (error) {
        throw new Error('Error loading from Supabase');
      }

      // DEBUG: Mostrar TODOS los asientos existentes para verificar fechas
      const { data: allEntries } = await supabase
        .from('journal_entries')
        .select('id, entry_date, entry_number, status')
        .eq('user_id', tenantId)
        .eq('status', 'posted')
        .order('entry_date', { ascending: true });
      
      console.log('📊 TODOS LOS ASIENTOS EN LA BASE DE DATOS:');
      console.log('Total asientos:', allEntries?.length || 0);
      if (allEntries && allEntries.length > 0) {
        allEntries.forEach(entry => {
          console.log(`  - Asiento ${entry.entry_number}: ${entry.entry_date}`);
        });
      }

      // Calcular estadísticas para cada período consultando el Diario General
      const periodsWithStats = await Promise.all((periodsData || []).map(async (period) => {
        try {
          console.log(`🔍 Consultando asientos para: ${period.name} (${period.start_date} - ${period.end_date})`);
          
          // Obtener asientos contables dentro del rango de fechas del período
          const { data: entries, error: entriesError } = await supabase
            .from('journal_entries')
            .select(`
              id,
              entry_date,
              total_debit,
              total_credit,
              status
            `)
            .eq('user_id', tenantId)
            .eq('status', 'posted')
            .gte('entry_date', period.start_date)
            .lte('entry_date', period.end_date);

          if (entriesError) {
            console.error('Error loading entries for period:', entriesError);
            return {
              ...period,
              entries_count: 0,
              total_debits: 0,
              total_credits: 0
            };
          }

          // Calcular totales
          const entriesCount = entries?.length || 0;
          const totalDebits = entries?.reduce((sum, entry) => sum + (Number(entry.total_debit) || 0), 0) || 0;
          const totalCredits = entries?.reduce((sum, entry) => sum + (Number(entry.total_credit) || 0), 0) || 0;

          // Log de depuración
          if (entriesCount > 0) {
            console.log(`Período: ${period.name} (${period.start_date} - ${period.end_date})`);
            console.log(`  Asientos encontrados: ${entriesCount}`);
            console.log(`  Total Débitos: ${totalDebits}`);
            console.log(`  Total Créditos: ${totalCredits}`);
            console.log('  Fechas de asientos:', entries.map(e => e.entry_date));
          }

          return {
            ...period,
            entries_count: entriesCount,
            total_debits: totalDebits,
            total_credits: totalCredits
          };
        } catch (err) {
          console.error('Error calculating period stats:', err);
          return {
            ...period,
            entries_count: 0,
            total_debits: 0,
            total_credits: 0
          };
        }
      }));

      setPeriods(periodsWithStats);
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
      if (filteredPeriods.length === 0) {
        alert('No hay periodos para exportar.');
        return;
      }

      const rows = filteredPeriods.map(period => ({
        nombre: period.name,
        fechaInicio: formatDate(period.start_date),
        fechaFin: formatDate(period.end_date),
        anoFiscal: period.fiscal_year,
        estado: period.status === 'open' ? 'Abierto' : period.status === 'closed' ? 'Cerrado' : 'Bloqueado',
        asientos: period.entries_count || 0,
        totalDebitos: period.total_debits || 0,
        totalCreditos: period.total_credits || 0,
        fechaCierre: period.closed_at ? formatDate(period.closed_at) : '',
        cerradoPor: period.closed_by || ''
      }));

      const headers = [
        { key: 'nombre', title: 'Periodo' },
        { key: 'fechaInicio', title: 'Fecha Inicio' },
        { key: 'fechaFin', title: 'Fecha Fin' },
        { key: 'anoFiscal', title: 'Ano Fiscal' },
        { key: 'estado', title: 'Estado' },
        { key: 'asientos', title: 'Asientos' },
        { key: 'totalDebitos', title: 'Total Debitos' },
        { key: 'totalCreditos', title: 'Total Creditos' },
        { key: 'fechaCierre', title: 'Fecha Cierre' },
        { key: 'cerradoPor', title: 'Cerrado Por' }
      ];

      const fileBase = `periodos_contables_${new Date().toISOString().split('T')[0]}`;

      exportToExcelWithHeaders(
        rows,
        headers,
        fileBase,
        'Periodos',
        [30, 14, 14, 12, 12, 10, 18, 18, 14, 20],
        {
          title: 'Periodos Contables',
          companyName: 'ContaBi'
        }
      );
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

    // Verificar solapamiento con períodos existentes ABIERTOS solamente
    // Permitir crear períodos si el existente está cerrado o bloqueado
    const hasOverlap = periods.some(period => {
      // Solo validar solapamiento con períodos abiertos
      if (period.status !== 'open') {
        return false;
      }

      const periodStart = new Date(period.start_date);
      const periodEnd = new Date(period.end_date);
      const newStart = new Date(startDate);
      const newEnd = new Date(endDate);

      return (newStart <= periodEnd && newEnd >= periodStart);
    });

    if (hasOverlap) {
      return 'El período se solapa con un período existente que está abierto';
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

  const handleDeletePeriod = async (periodId: string) => {
    const period = periods.find(p => p.id === periodId);
    if (!period) return;

    if (period.entries_count && period.entries_count > 0) {
      alert('No se puede eliminar un período que tiene asientos contables registrados.');
      return;
    }

    if (!confirm(`¿Está seguro de que desea eliminar el período "${period.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('accounting_periods')
        .delete()
        .eq('id', periodId);

      if (error) throw error;

      setPeriods(prev => prev.filter(p => p.id !== periodId));
      alert('Período eliminado exitosamente');
    } catch (error) {
      console.error('Error deleting period:', error);
      alert('Error al eliminar el período');
    }
  };

  const loadPeriodEntries = async (period: AccountingPeriod) => {
    if (!user) return;
    
    try {
      setLoadingEntries(true);
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return;

      const { data: entries, error } = await supabase
        .from('journal_entries')
        .select('id, entry_number, entry_date, description, total_debit, total_credit, status')
        .eq('user_id', tenantId)
        .eq('status', 'posted')
        .gte('entry_date', period.start_date)
        .lte('entry_date', period.end_date)
        .order('entry_date', { ascending: true })
        .order('entry_number', { ascending: true });

      if (error) throw error;
      setPeriodEntries(entries || []);
    } catch (error) {
      console.error('Error loading period entries:', error);
      setPeriodEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  };

  const handleViewPeriod = async (period: AccountingPeriod) => {
    setSelectedPeriod(period);
    await loadPeriodEntries(period);
  };

  const navigateToJournal = (period: AccountingPeriod) => {
    // Navegar al diario general con filtro de fechas
    navigate(`/accounting/general-journal?from=${period.start_date}&to=${period.end_date}`);
  };

  const handleCreateFiscalYear = async () => {
    if (!user) return;

    try {
      const year = fiscalYearForm.year;
      
      // Verificar si ya existe el período fiscal ABIERTO para este año
      const existingOpenFiscalYear = periods.find(p => 
        p.status === 'open' &&
        (p.name === `Año Fiscal ${year}` || 
        (p.fiscal_year === year && p.start_date === `${year}-01-01` && p.end_date === `${year}-12-31`))
      );
      
      if (existingOpenFiscalYear) {
        alert(`Ya existe el Año Fiscal ${year} en estado abierto. No se puede crear duplicado. Cierre el período existente primero.`);
        return;
      }

      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) {
        alert('Error: No se pudo resolver el tenant');
        return;
      }

      // Si existe un período fiscal cerrado o bloqueado, eliminarlo primero
      const existingClosedFiscalYear = periods.find(p => 
        p.status !== 'open' &&
        (p.name === `Año Fiscal ${year}` || 
        (p.fiscal_year === year && p.start_date === `${year}-01-01` && p.end_date === `${year}-12-31`))
      );

      if (existingClosedFiscalYear) {
        console.log('Eliminando período fiscal cerrado existente:', existingClosedFiscalYear.name);
        const { error: deleteError } = await supabase
          .from('accounting_periods')
          .delete()
          .eq('id', existingClosedFiscalYear.id);

        if (deleteError) {
          console.error('Error eliminando período cerrado:', deleteError);
          alert('Error al eliminar el período cerrado existente');
          return;
        }
      }

      // Verificar si ya existen períodos mensuales cerrados para este año y eliminarlos
      const existingClosedMonthlyPeriods = periods.filter(p => 
        p.fiscal_year === year && 
        !p.name.includes('Año Fiscal') && 
        p.status !== 'open'
      );

      if (existingClosedMonthlyPeriods.length > 0) {
        console.log(`Eliminando ${existingClosedMonthlyPeriods.length} períodos mensuales cerrados`);
        for (const period of existingClosedMonthlyPeriods) {
          await supabase
            .from('accounting_periods')
            .delete()
            .eq('id', period.id);
        }
      }

      // Verificar si ya existen períodos mensuales abiertos para este año
      const existingOpenMonthlyPeriods = periods.filter(p => 
        p.fiscal_year === year && 
        !p.name.includes('Año Fiscal') && 
        p.status === 'open'
      );

      if (existingOpenMonthlyPeriods.length > 0) {
        if (!confirm(`Ya existen ${existingOpenMonthlyPeriods.length} períodos mensuales abiertos para el año ${year}. ¿Desea crear el año fiscal de todas formas?`)) {
          return;
        }
      }

      if (fiscalYearForm.autoGenerateMonths) {
        // Verificar si ya existe el período fiscal anual
        const fiscalPeriodName = `Año Fiscal ${year}`;
        const { data: existingFiscalPeriod } = await supabase
          .from('accounting_periods')
          .select('id, name')
          .eq('user_id', tenantId)
          .eq('name', fiscalPeriodName)
          .maybeSingle();

        const fiscalPeriod: AccountingPeriod = {
          id: existingFiscalPeriod?.id || `${Date.now()}-fiscal`,
          name: fiscalPeriodName,
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

        console.log(existingFiscalPeriod ? 'Actualizando período fiscal anual:' : 'Creando período fiscal anual:', fiscalPeriod.name);
        
        let fiscalData;
        let fiscalError;

        if (existingFiscalPeriod) {
          // Actualizar el período fiscal existente
          const result = await supabase
            .from('accounting_periods')
            .update({
              start_date: fiscalPeriod.start_date,
              end_date: fiscalPeriod.end_date,
              status: fiscalPeriod.status,
              fiscal_year: fiscalPeriod.fiscal_year
            })
            .eq('id', existingFiscalPeriod.id)
            .select()
            .single();
          fiscalData = result.data;
          fiscalError = result.error;
        } else {
          // Crear nuevo período fiscal
          const result = await supabase
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
          fiscalData = result.data;
          fiscalError = result.error;
        }

        if (fiscalError) {
          console.error('ERROR creando/actualizando período fiscal:', fiscalError);
          alert(`Error al crear período fiscal anual: ${fiscalError.message}`);
          return;
        }
        
        if (fiscalData) {
          fiscalPeriod.id = fiscalData.id;
          console.log('✓ Período fiscal anual procesado con ID:', fiscalData.id);
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

          // Verificar si ya existe un período con este nombre exacto
          const { data: existingPeriod } = await supabase
            .from('accounting_periods')
            .select('id, name')
            .eq('user_id', tenantId)
            .eq('name', periodName)
            .maybeSingle();

          const newPeriod: AccountingPeriod = {
            id: existingPeriod?.id || `${Date.now()}-${month}`,
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
            let data;
            let error;

            if (existingPeriod) {
              // Actualizar el período existente
              const result = await supabase
                .from('accounting_periods')
                .update({
                  start_date: newPeriod.start_date,
                  end_date: newPeriod.end_date,
                  status: newPeriod.status,
                  fiscal_year: newPeriod.fiscal_year
                })
                .eq('id', existingPeriod.id)
                .select()
                .single();
              data = result.data;
              error = result.error;
              console.log(`✓ Período actualizado: ${periodName}`);
            } else {
              // Crear nuevo período
              const result = await supabase
                .from('accounting_periods')
                .insert([{
                  user_id: tenantId,
                  name: newPeriod.name,
                  start_date: newPeriod.start_date,
                  end_date: newPeriod.end_date,
                  status: newPeriod.status,
                  fiscal_year: newPeriod.fiscal_year
                }])
                .select()
                .single();
              data = result.data;
              error = result.error;
              console.log(`✓ Período creado: ${periodName}`);
            }

            if (error) throw error;
            if (data) newPeriods.push({ ...newPeriod, id: data.id });
          } catch (supabaseError) {
            console.error('Supabase error creating/updating period:', supabaseError);
          }
        }

        // Recargar períodos desde la BD para asegurar sincronización
        await loadPeriods();
        alert(`Año fiscal ${year} creado exitosamente con ${newPeriods.length} períodos`);
      } else {
        // Crear solo el período fiscal anual
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;
        const fiscalOnlyName = `Año Fiscal ${year}`;

        // Verificar si ya existe
        const { data: existingFiscalOnly } = await supabase
          .from('accounting_periods')
          .select('id, name')
          .eq('user_id', tenantId)
          .eq('name', fiscalOnlyName)
          .maybeSingle();
        
        const newPeriod: AccountingPeriod = {
          id: existingFiscalOnly?.id || Date.now().toString(),
          name: fiscalOnlyName,
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
          let error;

          if (existingFiscalOnly) {
            // Actualizar existente
            const result = await supabase
              .from('accounting_periods')
              .update({
                start_date: newPeriod.start_date,
                end_date: newPeriod.end_date,
                status: newPeriod.status,
                fiscal_year: newPeriod.fiscal_year
              })
              .eq('id', existingFiscalOnly.id);
            error = result.error;
          } else {
            // Crear nuevo
            const result = await supabase
              .from('accounting_periods')
              .insert([{
                user_id: tenantId,
                name: newPeriod.name,
                start_date: newPeriod.start_date,
                end_date: newPeriod.end_date,
                status: newPeriod.status,
                fiscal_year: newPeriod.fiscal_year
              }]);
            error = result.error;
          }

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

        alert(`Año fiscal ${year} ${existingFiscalOnly ? 'actualizado' : 'creado'} exitosamente`);
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
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
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
            <button
              onClick={downloadExcel}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <i className="ri-file-excel-line"></i>
              Exportar
            </button>
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
                  Volumen contable
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
                    RD${formatAmount(period.total_debits || 0)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleViewPeriod(period)}
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
                          <i className="ri-lock-line"></i>
                        </button>
                      )}
                      
                      {period.status === 'closed' && (
                        <>
                          <button
                            onClick={() => handleReopenPeriod(period.id)}
                            className="text-green-600 hover:text-green-900"
                            title="Reabrir período"
                          >
                            <i className="ri-calendar-check-line"></i>
                          </button>
                        </>
                      )}

                      {/* Botón eliminar - solo si no tiene asientos */}
                      {(period.entries_count || 0) === 0 && (
                        <button
                          onClick={() => handleDeletePeriod(period.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Eliminar período"
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto py-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  Detalles del Período: {selectedPeriod.name}
                </h2>
                <button
                  onClick={() => { setSelectedPeriod(null); setPeriodEntries([]); }}
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
                        RD${formatAmount(selectedPeriod.total_debits || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Total Créditos:</span>
                      <span className="ml-2 text-sm font-bold text-red-600">
                        RD${formatAmount(selectedPeriod.total_credits || 0)}
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

              {/* Asientos del Período */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Asientos Contables del Período
                  </h3>
                  <button
                    onClick={() => navigateToJournal(selectedPeriod)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <i className="ri-external-link-line"></i>
                    Ver en Diario General
                  </button>
                </div>

                {loadingEntries ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-2 text-gray-600">Cargando asientos...</span>
                  </div>
                ) : periodEntries.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <i className="ri-file-list-3-line text-4xl text-gray-400 mb-2"></i>
                    <p className="text-gray-500">No hay asientos contables en este período</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No.</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Débito</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Crédito</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {periodEntries.slice(0, 20).map((entry) => (
                          <tr key={entry.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-blue-600">
                              {entry.entry_number}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                              {formatDate(entry.entry_date)}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900 max-w-xs truncate" title={entry.description}>
                              {entry.description || 'Sin descripción'}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-green-600">
                              RD${formatAmount(entry.total_debit || 0)}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-red-600">
                              RD${formatAmount(entry.total_credit || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {periodEntries.length > 0 && (
                        <tfoot className="bg-gray-100">
                          <tr>
                            <td colSpan={3} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                              Totales:
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-right text-green-700">
                              RD${formatAmount(periodEntries.reduce((sum, e) => sum + (Number(e.total_debit) || 0), 0))}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-right text-red-700">
                              RD${formatAmount(periodEntries.reduce((sum, e) => sum + (Number(e.total_credit) || 0), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                    {periodEntries.length > 20 && (
                      <div className="p-3 bg-blue-50 text-center">
                        <p className="text-sm text-blue-700">
                          Mostrando 20 de {periodEntries.length} asientos. 
                          <button
                            onClick={() => navigateToJournal(selectedPeriod)}
                            className="ml-2 underline hover:no-underline"
                          >
                            Ver todos en el Diario General
                          </button>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="flex justify-between flex-wrap gap-2">
                  <div className="flex flex-wrap gap-2">
                    {selectedPeriod.status === 'open' && (
                      <button
                        onClick={() => {
                          handleClosePeriod(selectedPeriod.id);
                          setSelectedPeriod(null);
                          setPeriodEntries([]);
                        }}
                        className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                      >
                        <i className="ri-lock-line mr-2"></i>
                        Cerrar Período
                      </button>
                    )}
                    
                    {selectedPeriod.status === 'closed' && (
                      <>
                        <button
                          onClick={() => {
                            handleReopenPeriod(selectedPeriod.id);
                            setSelectedPeriod(null);
                            setPeriodEntries([]);
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <i className="ri-calendar-check-line mr-2"></i>
                          Reabrir Período
                        </button>
                        <button
                          onClick={() => {
                            handleLockPeriod(selectedPeriod.id);
                            setSelectedPeriod(null);
                            setPeriodEntries([]);
                          }}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                          <i className="ri-lock-line mr-2"></i>
                          Bloquear Período
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => navigateToJournal(selectedPeriod)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <i className="ri-book-2-line mr-2"></i>
                      Ir al Diario General
                    </button>
                  </div>
                  
                  <button
                    onClick={() => { setSelectedPeriod(null); setPeriodEntries([]); }}
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
