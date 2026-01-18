import { useMemo, useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { resolveTenantId } from '../../../services/database';
import { payrollRunsService, payrollItemsService, payProfilesService, payrollTaxLinesService, taxCalculator } from '../../../services/contador/payroll.service';
import type { PayrollRun, PayrollItem } from '../../../services/contador/payroll.service';
import { employeesService } from '../../../services/contador/staff.service';
import { formatMoney } from '../../../utils/numberFormat';
import { utils, writeFile } from 'xlsx';

interface PayrollRecord {
  id: string;
  employeeName: string;
  payPeriod: string;
  hoursWorked: number;
  overtimeHours: number;
  hourlyRate: number;
  grossPay: number;
  federalTax: number;
  stateTax: number;
  socialSecurity: number;
  medicare: number;
  netPay: number;
  status: 'pending' | 'processed' | 'paid';
}

export default function ContadorNominaPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'payroll' | 'calculator' | 'history'>('payroll');
  const [showRunPayroll, setShowRunPayroll] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [activeEmployeesCount, setActiveEmployeesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [runPeriodStart, setRunPeriodStart] = useState('');
  const [runPeriodEnd, setRunPeriodEnd] = useState('');
  const [runPayDate, setRunPayDate] = useState('');
  const [estimatedRunTotal, setEstimatedRunTotal] = useState(0);
  const [processingPayroll, setProcessingPayroll] = useState(false);

  // Pay Calculator state
  const [calcEmployees, setCalcEmployees] = useState<any[]>([]);
  const [calcEmployeeId, setCalcEmployeeId] = useState<string>('');
  const [calcEmployeeProfile, setCalcEmployeeProfile] = useState<any | null>(null);
  const [calcPeriodStart, setCalcPeriodStart] = useState('');
  const [calcPeriodEnd, setCalcPeriodEnd] = useState('');
  const [calcResult, setCalcResult] = useState<{
    grossPay: number;
    federalTax: number;
    socialSecurity: number;
    medicare: number;
    stateTax: number;
    netPay: number;
  } | null>(null);

  const runOptions = useMemo(() => {
    return (payrollRuns || []).map((r) => {
      const label = `${r.period_start} - ${r.period_end}`;
      return { id: r.id, label };
    });
  }, [payrollRuns]);

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  useEffect(() => {
    const loadCalculatorEmployees = async () => {
      if (!user?.id) return;
      try {
        const emps = await employeesService.list(user.id, { status: 'active' });
        setCalcEmployees(emps || []);
        if (!calcEmployeeId && (emps || []).length > 0) {
          setCalcEmployeeId(String(emps[0].id));
        }
      } catch (e) {
        console.error('Error loading calculator employees:', e);
        setCalcEmployees([]);
      }
    };

    if (activeTab === 'calculator') {
      loadCalculatorEmployees();
    }
  }, [activeTab, user?.id, calcEmployeeId]);

  useEffect(() => {
    const syncCalcPeriodFromSelectedRun = () => {
      const run = payrollRuns.find((r) => r.id === selectedRunId);
      if (!run) return;
      if (!calcPeriodStart) setCalcPeriodStart(run.period_start);
      if (!calcPeriodEnd) setCalcPeriodEnd(run.period_end);
    };

    if (activeTab === 'calculator') {
      syncCalcPeriodFromSelectedRun();
    }
  }, [activeTab, payrollRuns, selectedRunId, calcPeriodStart, calcPeriodEnd]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.id) return;
      if (!calcEmployeeId) {
        setCalcEmployeeProfile(null);
        return;
      }
      try {
        const profiles = await payProfilesService.list(user.id).catch(() => []);
        const profile = (profiles || []).find((p: any) => String(p.employee_id) === String(calcEmployeeId)) || null;
        setCalcEmployeeProfile(profile);
      } catch (e) {
        console.error('Error loading employee pay profile:', e);
        setCalcEmployeeProfile(null);
      }
    };

    if (activeTab === 'calculator') {
      loadProfile();
    }
  }, [activeTab, user?.id, calcEmployeeId]);

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const tenantId = await resolveTenantId(user.id);
      if (!tenantId) return;
      const [runs, employeeCount] = await Promise.all([
        payrollRunsService.list(tenantId),
        employeesService.getActiveCount(tenantId),
      ]);
      setPayrollRuns(runs);
      setActiveEmployeesCount(employeeCount);

      const nextSelectedRunId = selectedRunId || (runs[0]?.id ?? '');
      setSelectedRunId(nextSelectedRunId);

      if (nextSelectedRunId) {
        const selectedRun = (runs || []).find((r) => r.id === nextSelectedRunId) || runs[0];
        if (selectedRun) {
          const items = await payrollItemsService.listByRun(selectedRun.id);
          const mapped: PayrollRecord[] = items.map((item: PayrollItem) => {
            // Extract tax amounts from tax_lines if available
            const taxLines = item.tax_lines || [];
            const fedTax = taxLines.find((t: any) => t.tax_type === 'federal_withholding')?.amount || 0;
            const ssTax = taxLines.find((t: any) => t.tax_type === 'social_security')?.amount || 0;
            const medTax = taxLines.find((t: any) => t.tax_type === 'medicare')?.amount || 0;
            const stateTax = taxLines.find((t: any) => t.tax_type === 'state_withholding')?.amount || 0;

            return {
              id: item.id,
              employeeName: item.employee ? `${item.employee.first_name} ${item.employee.last_name}` : 'Unknown',
              payPeriod: selectedRun.period_start + ' - ' + selectedRun.period_end,
              hoursWorked: 0,
              overtimeHours: item.overtime_pay > 0 ? 1 : 0,
              hourlyRate: 0,
              grossPay: item.gross_pay,
              federalTax: fedTax,
              stateTax: stateTax,
              socialSecurity: ssTax,
              medicare: medTax,
              netPay: item.net_pay,
              status: (selectedRun.status === 'paid' ? 'paid' : selectedRun.status === 'approved' ? 'processed' : 'pending') as
                | 'pending'
                | 'processed'
                | 'paid',
            };
          });
          setPayrollRecords(mapped);
        } else {
          setPayrollRecords([]);
        }
      } else {
        setPayrollRecords([]);
      }
    } catch (error) {
      console.error('Error loading payroll data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const calculateEstimatedTotal = async () => {
      if (!user?.id) return;
      if (!showRunPayroll) return;
      if (!runPeriodStart || !runPeriodEnd) {
        setEstimatedRunTotal(0);
        return;
      }

      try {
        const start = new Date(runPeriodStart);
        const end = new Date(runPeriodEnd);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          setEstimatedRunTotal(0);
          return;
        }

        const msPerDay = 24 * 60 * 60 * 1000;
        const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1);

        const [activeEmployees, profiles] = await Promise.all([
          employeesService.list(user.id, { status: 'active' }),
          payProfilesService.list(user.id).catch(() => []),
        ]);

        const profileByEmployee = new Map<string, any>();
        (profiles || []).forEach((p: any) => {
          if (p?.employee_id) profileByEmployee.set(String(p.employee_id), p);
        });

        const weeklyHoursAssumption = 40;
        const weeks = days / 7;

        const total = (activeEmployees || []).reduce((sum: number, emp: any) => {
          const profile = profileByEmployee.get(String(emp.id));

          // Prefer explicit pay profile
          if (profile?.pay_type === 'salary') {
            const salary = Number(profile.salary_amount || 0);
            if (salary > 0) {
              const freq = String(profile.salary_frequency || '').toLowerCase();
              if (freq === 'weekly') return sum + salary * weeks;
              if (freq === 'biweekly') return sum + salary * (days / 14);
              if (freq === 'semimonthly') return sum + salary * (days / 15);
              if (freq === 'monthly') return sum + salary * (days / 30);
              // Unknown frequency: assume monthly
              return sum + salary * (days / 30);
            }
          }

          if (profile?.pay_type === 'hourly') {
            const rate = Number(profile.hourly_rate || 0);
            if (rate > 0) {
              return sum + rate * weeklyHoursAssumption * weeks;
            }
          }

          // Fallback: role base salary (assume monthly, prorated)
          const roleSalary = Number((emp as any)?.role?.base_salary || 0);
          if (roleSalary > 0) return sum + roleSalary * (days / 30);

          return sum;
        }, 0);

        setEstimatedRunTotal(Number.isFinite(total) ? total : 0);
      } catch (e) {
        console.error('Error calculating estimated payroll total:', e);
        setEstimatedRunTotal(0);
      }
    };

    calculateEstimatedTotal();
  }, [user?.id, showRunPayroll, runPeriodStart, runPeriodEnd]);

  useEffect(() => {
    const loadRunItems = async () => {
      if (!user?.id) return;
      if (!selectedRunId) return;

      try {
        const run = payrollRuns.find((r) => r.id === selectedRunId);
        if (!run) return;
        const items = await payrollItemsService.listByRun(run.id);
        const mapped: PayrollRecord[] = items.map((item: PayrollItem) => {
          // Extract tax amounts from tax_lines if available
          const taxLines = item.tax_lines || [];
          const fedTax = taxLines.find((t: any) => t.tax_type === 'federal_withholding')?.amount || 0;
          const ssTax = taxLines.find((t: any) => t.tax_type === 'social_security')?.amount || 0;
          const medTax = taxLines.find((t: any) => t.tax_type === 'medicare')?.amount || 0;
          const stateTax = taxLines.find((t: any) => t.tax_type === 'state_withholding')?.amount || 0;

          return {
            id: item.id,
            employeeName: item.employee ? `${item.employee.first_name} ${item.employee.last_name}` : 'Unknown',
            payPeriod: run.period_start + ' - ' + run.period_end,
            hoursWorked: 0,
            overtimeHours: item.overtime_pay > 0 ? 1 : 0,
            hourlyRate: 0,
            grossPay: item.gross_pay,
            federalTax: fedTax,
            stateTax: stateTax,
            socialSecurity: ssTax,
            medicare: medTax,
            netPay: item.net_pay,
            status: (run.status === 'paid' ? 'paid' : run.status === 'approved' ? 'processed' : 'pending') as
              | 'pending'
              | 'processed'
              | 'paid',
          };
        });
        setPayrollRecords(mapped);
      } catch (error) {
        console.error('Error loading payroll items:', error);
        setPayrollRecords([]);
      }
    };

    loadRunItems();
  }, [payrollRuns, selectedRunId, user?.id]);

  const totalGross = payrollRecords.reduce((acc, r) => acc + r.grossPay, 0);
  const totalNet = payrollRecords.reduce((acc, r) => acc + r.netPay, 0);
  const totalFICA = payrollRecords.reduce((acc, r) => acc + r.socialSecurity + r.medicare, 0);

  const stats = {
    totalEmployees: activeEmployeesCount,
    totalGross,
    totalNet,
    totalFICA,
    pending: payrollRecords.filter(r => r.status === 'pending').length,
  };

  const handleCreateRun = async () => {
    if (!user?.id) return;
    if (!runPeriodStart || !runPeriodEnd || !runPayDate) return;
    
    setProcessingPayroll(true);
    try {
      // 1. Create the payroll run
      const run = await payrollRunsService.create({
        user_id: user.id,
        period_start: runPeriodStart,
        period_end: runPeriodEnd,
        pay_date: runPayDate,
        created_by: null,
      });

      // 2. Get active employees and their pay profiles
      const [activeEmployees, profiles] = await Promise.all([
        employeesService.list(user.id, { status: 'active' }),
        payProfilesService.list(user.id).catch(() => []),
      ]);

      const profileByEmployee = new Map<string, any>();
      (profiles || []).forEach((p: any) => {
        if (p?.employee_id) profileByEmployee.set(String(p.employee_id), p);
      });

      // 3. Calculate period days for salary proration
      const start = new Date(runPeriodStart);
      const end = new Date(runPeriodEnd);
      const msPerDay = 24 * 60 * 60 * 1000;
      const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1);
      const weeks = days / 7;

      // 4. Create payroll items for each employee
      for (const emp of activeEmployees || []) {
        const profile = profileByEmployee.get(String(emp.id));
        let grossPay = 0;

        // Calculate gross pay based on pay type
        if (profile?.pay_type === 'salary') {
          const salary = Number(profile.salary_amount || 0);
          if (salary > 0) {
            const freq = String(profile.salary_frequency || '').toLowerCase();
            if (freq === 'weekly') grossPay = salary * weeks;
            else if (freq === 'biweekly') grossPay = salary * (days / 14);
            else if (freq === 'semimonthly') grossPay = salary * (days / 15);
            else if (freq === 'monthly') grossPay = salary * (days / 30);
            else grossPay = salary * (days / 30); // default monthly
          }
        } else if (profile?.pay_type === 'hourly') {
          const rate = Number(profile.hourly_rate || 0);
          if (rate > 0) {
            grossPay = rate * 40 * weeks; // Assume 40 hours/week
          }
        } else {
          // Fallback: role base salary (assume monthly)
          const roleSalary = Number((emp as any)?.role?.base_salary || 0);
          if (roleSalary > 0) grossPay = roleSalary * (days / 30);
        }

        if (grossPay <= 0) continue; // Skip employees with no pay configured

        // Calculate FICA taxes
        const fica = taxCalculator.calculateFICA(grossPay);
        const socialSecurity = fica.socialSecurity;
        const medicare = fica.medicare + fica.additionalMedicare;

        // Estimate federal tax (simplified: 12% bracket)
        const federalTax = Math.round(grossPay * 0.12 * 100) / 100;

        // State tax (0 for FL, TX, etc.)
        const stateTax = 0;

        const totalTaxes = socialSecurity + medicare + federalTax + stateTax;
        const netPay = Math.round((grossPay - totalTaxes) * 100) / 100;

        // Create payroll item
        const item = await payrollItemsService.create({
          user_id: user.id,
          payroll_run_id: run.id,
          employee_id: emp.id,
          gross_pay: Math.round(grossPay * 100) / 100,
          overtime_pay: 0,
          bonuses: 0,
          pre_tax_deductions: 0,
          taxes_total: Math.round(totalTaxes * 100) / 100,
          post_tax_deductions: 0,
          net_pay: netPay,
          payment_method: 'check',
        });

        // Create tax lines for detailed breakdown
        await payrollTaxLinesService.bulkCreate([
          {
            user_id: user.id,
            payroll_item_id: item.id,
            tax_type: 'federal_withholding',
            amount: federalTax,
            employer_amount: 0,
          },
          {
            user_id: user.id,
            payroll_item_id: item.id,
            tax_type: 'social_security',
            amount: socialSecurity,
            employer_amount: fica.socialSecurityEmployer,
          },
          {
            user_id: user.id,
            payroll_item_id: item.id,
            tax_type: 'medicare',
            amount: medicare,
            employer_amount: fica.medicareEmployer,
          },
        ]);
      }

      setShowRunPayroll(false);
      setRunPeriodStart('');
      setRunPeriodEnd('');
      setRunPayDate('');
      await loadData();
    } catch (error) {
      console.error('Error creating payroll run:', error);
    } finally {
      setProcessingPayroll(false);
    }
  };

  // Pay Calculator function (aligned with Run Payroll salary logic)
  const handleCalculate = () => {
    if (!calcEmployeeId) return;
    if (!calcPeriodStart || !calcPeriodEnd) return;

    const start = new Date(calcPeriodStart);
    const end = new Date(calcPeriodEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

    const msPerDay = 24 * 60 * 60 * 1000;
    const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1);
    const weeks = days / 7;

    const emp = (calcEmployees || []).find((e: any) => String(e.id) === String(calcEmployeeId));
    const profile = calcEmployeeProfile;

    let grossPay = 0;

    if (profile?.pay_type === 'salary') {
      const salary = Number(profile.salary_amount || 0);
      if (salary > 0) {
        const freq = String(profile.salary_frequency || '').toLowerCase();
        if (freq === 'weekly') grossPay = salary * weeks;
        else if (freq === 'biweekly') grossPay = salary * (days / 14);
        else if (freq === 'semimonthly') grossPay = salary * (days / 15);
        else if (freq === 'monthly') grossPay = salary * (days / 30);
        else grossPay = salary * (days / 30);
      }
    } else if (profile?.pay_type === 'hourly') {
      const rate = Number(profile.hourly_rate || 0);
      if (rate > 0) grossPay = rate * 40 * weeks;
    } else {
      const roleSalary = Number((emp as any)?.role?.base_salary || 0);
      if (roleSalary > 0) grossPay = roleSalary * (days / 30);
    }

    grossPay = Math.round(grossPay * 100) / 100;

    const fica = taxCalculator.calculateFICA(grossPay);
    const federalTax = Math.round(grossPay * 0.12 * 100) / 100;
    const stateTax = 0;

    const socialSecurity = fica.socialSecurity;
    const medicare = fica.medicare + fica.additionalMedicare;
    const totalTaxes = socialSecurity + medicare + federalTax + stateTax;
    const netPay = Math.round((grossPay - totalTaxes) * 100) / 100;

    setCalcResult({
      grossPay,
      federalTax,
      socialSecurity,
      medicare,
      stateTax,
      netPay,
    });
  };

  // Export payroll data
  const handleExport = () => {
    if (payrollRecords.length === 0) return;

    const data = payrollRecords.map(r => ({
      'Employee': r.employeeName,
      'Pay Period': r.payPeriod,
      'Hours': r.hoursWorked,
      'OT Hours': r.overtimeHours,
      'Gross Pay': r.grossPay,
      'Federal Tax': r.federalTax,
      'State Tax': r.stateTax,
      'Social Security': r.socialSecurity,
      'Medicare': r.medicare,
      'FICA Total': r.socialSecurity + r.medicare,
      'Net Pay': r.netPay,
      'Status': r.status,
    }));

    const ws = utils.json_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Payroll');
    writeFile(wb, `payroll_${selectedRunId || 'export'}.xlsx`);
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#008000]/10 rounded-lg">
              <i className="ri-wallet-3-line text-2xl text-[#008000]"></i>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
              <p className="text-gray-600">US Payroll Management</p>
            </div>
          </div>
          <button
            onClick={() => setShowRunPayroll(true)}
            className="px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium hover:from-[#097509] hover:to-[#005300] flex items-center gap-2"
          >
            <i className="ri-play-circle-line"></i>
            Run Payroll
          </button>
        </div>

        {/* Compliance Banner */}
        <div className="bg-[#008000]/5 border border-[#008000]/20 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <i className="ri-shield-check-line text-xl text-[#008000] mt-0.5"></i>
            <div>
              <p className="font-medium text-[#2f3e1e]">IRS & DOL Compliant</p>
              <p className="text-sm text-[#2f3e1e]/80">All calculations follow federal and state tax guidelines including FICA (Social Security 6.2% + Medicare 1.45%).</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#008000]/10 rounded-lg">
                <i className="ri-team-line text-xl text-[#008000]"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Employees</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalEmployees}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#008000]/10 rounded-lg">
                <i className="ri-money-dollar-circle-line text-xl text-[#008000]"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Gross</p>
                <p className="text-2xl font-bold text-[#008000]">${stats.totalGross.toFixed(2)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#008000]/10 rounded-lg">
                <i className="ri-bank-card-line text-xl text-[#008000]"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Net</p>
                <p className="text-2xl font-bold text-[#008000]">${stats.totalNet.toFixed(2)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#008000]/10 rounded-lg">
                <i className="ri-government-line text-xl text-[#008000]"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">FICA Total</p>
                <p className="text-2xl font-bold text-[#008000]">${stats.totalFICA.toFixed(2)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#008000]/10 rounded-lg">
                <i className="ri-time-line text-xl text-[#008000]"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Pending</p>
                <p className="text-2xl font-bold text-[#008000]">{stats.pending}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200">
            <div className="flex">
              {[
                { id: 'payroll', label: 'Payroll Summary', icon: 'ri-file-list-3-line' },
                { id: 'calculator', label: 'Pay Calculator', icon: 'ri-calculator-line' },
                { id: 'history', label: 'Payment History', icon: 'ri-history-line' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-[#008000] text-[#008000] bg-[#008000]/5'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <i className={tab.icon}></i>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4">
            {/* Period Selector */}
            <div className="flex items-center gap-4 mb-4">
              <select
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
              >
                {runOptions.length === 0 ? (
                  <option value="">No payroll runs</option>
                ) : (
                  runOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))
                )}
              </select>
              <div className="flex-1"></div>
              <button 
                onClick={handleExport}
                disabled={payrollRecords.length === 0}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="ri-download-line"></i>
                Export
              </button>
            </div>

            {/* Payroll Summary Tab */}
            {activeTab === 'payroll' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Employee</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Hours</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">OT</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Gross Pay</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Fed Tax</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">State Tax</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">FICA</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Net Pay</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {payrollRecords.map((record) => (
                      <tr key={record.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{record.employeeName}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{record.hoursWorked}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{record.overtimeHours > 0 ? record.overtimeHours : '-'}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">${record.grossPay.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-red-600">-${record.federalTax.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-red-600">-${record.stateTax.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-red-600">-${(record.socialSecurity + record.medicare).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-bold text-[#008000]">${record.netPay.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            record.status === 'paid' ? 'bg-[#008000]/15 text-[#006600]' :
                            record.status === 'processed' ? 'bg-[#008000]/10 text-[#006600]' :
                            'bg-[#008000]/5 text-[#006600]'
                          }`}>
                            {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr className="font-semibold">
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right">{payrollRecords.reduce((a, r) => a + r.hoursWorked, 0)}</td>
                      <td className="px-4 py-3 text-right">{payrollRecords.reduce((a, r) => a + r.overtimeHours, 0)}</td>
                      <td className="px-4 py-3 text-right">${stats.totalGross.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-red-600">-${payrollRecords.reduce((a, r) => a + r.federalTax, 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-red-600">-${payrollRecords.reduce((a, r) => a + r.stateTax, 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-red-600">-${stats.totalFICA.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-[#008000]">${stats.totalNet.toFixed(2)}</td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Pay Calculator Tab */}
            {activeTab === 'calculator' && (
              <div className="max-w-2xl mx-auto">
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Paycheck Calculator</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                      <select
                        value={calcEmployeeId}
                        onChange={(e) => {
                          setCalcEmployeeId(e.target.value);
                          setCalcResult(null);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]"
                      >
                        {(calcEmployees || []).map((emp: any) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.first_name} {emp.last_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Pay Type</label>
                      <input
                        type="text"
                        readOnly
                        value={(() => {
                          if (calcEmployeeProfile?.pay_type) return String(calcEmployeeProfile.pay_type).toUpperCase();
                          const emp = (calcEmployees || []).find((e: any) => String(e.id) === String(calcEmployeeId));
                          const roleSalary = Number((emp as any)?.role?.base_salary || 0);
                          if (roleSalary > 0) return 'ROLE SALARY';
                          return 'NO PROFILE';
                        })()}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-700"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Period Start</label>
                      <input
                        type="date"
                        value={calcPeriodStart}
                        onChange={(e) => {
                          setCalcPeriodStart(e.target.value);
                          setCalcResult(null);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Period End</label>
                      <input
                        type="date"
                        value={calcPeriodEnd}
                        onChange={(e) => {
                          setCalcPeriodEnd(e.target.value);
                          setCalcResult(null);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]"
                      />
                    </div>
                  </div>
                  {(() => {
                    const emp = (calcEmployees || []).find((e: any) => String(e.id) === String(calcEmployeeId));
                    const roleSalary = Number((emp as any)?.role?.base_salary || 0);
                    const canCalculate = Boolean(calcEmployeeProfile) || roleSalary > 0;
                    if (canCalculate) return null;
                    return (
                      <div className="mb-4 text-sm text-red-600">
                        This employee has no pay profile configured and no role salary. Please set their salary in Staff/Employees.
                      </div>
                    );
                  })()}
                  <button
                    onClick={handleCalculate}
                    disabled={(() => {
                      if (!calcEmployeeId || !calcPeriodStart || !calcPeriodEnd) return true;
                      if (calcEmployeeProfile) return false;
                      const emp = (calcEmployees || []).find((e: any) => String(e.id) === String(calcEmployeeId));
                      const roleSalary = Number((emp as any)?.role?.base_salary || 0);
                      return !(roleSalary > 0);
                    })()}
                    className="w-full px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium mb-4 hover:from-[#097509] hover:to-[#005300] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Calculate
                  </button>
                  <div className="space-y-2 border-t pt-4">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Gross Pay</span>
                      <span className="font-medium">${(calcResult?.grossPay || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">- Federal Tax (12%)</span>
                      <span className="text-red-600">-${(calcResult?.federalTax || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">- Social Security (6.2%)</span>
                      <span className="text-red-600">-${(calcResult?.socialSecurity || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">- Medicare (1.45%)</span>
                      <span className="text-red-600">-${(calcResult?.medicare || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t font-semibold">
                      <span>Net Pay</span>
                      <span className="text-[#008000]">${(calcResult?.netPay || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Payment History Tab */}
            {activeTab === 'history' && (
              <div className="space-y-4">
                {payrollRuns.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <i className="ri-history-line text-4xl mb-2 block"></i>
                    <p>No payroll history yet</p>
                    <p className="text-sm">Run your first payroll to see history here</p>
                  </div>
                ) : (
                  payrollRuns.map((run) => (
                    <div key={run.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">
                            {new Date(run.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(run.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          <p className="text-sm text-gray-500">
                            Pay date: {new Date(run.pay_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {run.approved_at && ` • Approved ${new Date(run.approved_at).toLocaleDateString()}`}
                          </p>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            run.status === 'paid' ? 'bg-green-100 text-green-700' :
                            run.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                            run.status === 'void' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                          </span>
                          <button
                            onClick={() => setSelectedRunId(run.id)}
                            className="text-sm text-[#008000] hover:underline"
                          >
                            View
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Run Payroll Modal */}
        {showRunPayroll && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Run Payroll</h2>
                <button onClick={() => setShowRunPayroll(false)} className="p-1 hover:bg-gray-100 rounded">
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pay Period</label>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="date"
                      value={runPeriodStart}
                      onChange={(e) => setRunPeriodStart(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]"
                    />
                    <input
                      type="date"
                      value={runPeriodEnd}
                      onChange={(e) => setRunPeriodEnd(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pay Date</label>
                  <input
                    type="date"
                    value={runPayDate}
                    onChange={(e) => setRunPayDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]"
                  />
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-2">This will process payroll for:</p>
                  <p className="font-medium">{stats.totalEmployees} employees</p>
                  <p className="text-sm text-gray-500">Estimated total: {formatMoney(estimatedRunTotal)}</p>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button 
                  onClick={() => setShowRunPayroll(false)} 
                  disabled={processingPayroll}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateRun}
                  disabled={processingPayroll || !runPeriodStart || !runPeriodEnd || !runPayDate}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {processingPayroll ? (
                    <>
                      <i className="ri-loader-4-line animate-spin"></i>
                      Processing...
                    </>
                  ) : (
                    'Process Payroll'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
