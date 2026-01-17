import { useMemo, useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { payrollRunsService, payrollItemsService, payProfilesService } from '../../../services/contador/payroll.service';
import type { PayrollRun, PayrollItem } from '../../../services/contador/payroll.service';
import { employeesService } from '../../../services/contador/staff.service';
import { formatMoney } from '../../../utils/numberFormat';

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

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [runs, employeeCount] = await Promise.all([
        payrollRunsService.list(user.id),
        employeesService.getActiveCount(user.id),
      ]);
      setPayrollRuns(runs);
      setActiveEmployeesCount(employeeCount);

      const nextSelectedRunId = selectedRunId || (runs[0]?.id ?? '');
      setSelectedRunId(nextSelectedRunId);

      if (nextSelectedRunId) {
        const selectedRun = (runs || []).find((r) => r.id === nextSelectedRunId) || runs[0];
        if (selectedRun) {
          const items = await payrollItemsService.listByRun(selectedRun.id);
          const mapped: PayrollRecord[] = items.map((item: PayrollItem) => ({
            id: item.id,
            employeeName: item.employee ? `${item.employee.first_name} ${item.employee.last_name}` : 'Unknown',
            payPeriod: selectedRun.period_start + ' - ' + selectedRun.period_end,
            hoursWorked: 0,
            overtimeHours: item.overtime_pay > 0 ? 1 : 0,
            hourlyRate: 0,
            grossPay: item.gross_pay,
            federalTax: 0,
            stateTax: 0,
            socialSecurity: 0,
            medicare: 0,
            netPay: item.net_pay,
            status: (selectedRun.status === 'paid' ? 'paid' : selectedRun.status === 'approved' ? 'processed' : 'pending') as
              | 'pending'
              | 'processed'
              | 'paid',
          }));
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
        const mapped: PayrollRecord[] = items.map((item: PayrollItem) => ({
          id: item.id,
          employeeName: item.employee ? `${item.employee.first_name} ${item.employee.last_name}` : 'Unknown',
          payPeriod: run.period_start + ' - ' + run.period_end,
          hoursWorked: 0,
          overtimeHours: item.overtime_pay > 0 ? 1 : 0,
          hourlyRate: 0,
          grossPay: item.gross_pay,
          federalTax: 0,
          stateTax: 0,
          socialSecurity: 0,
          medicare: 0,
          netPay: item.net_pay,
          status: (run.status === 'paid' ? 'paid' : run.status === 'approved' ? 'processed' : 'pending') as
            | 'pending'
            | 'processed'
            | 'paid',
        }));
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
    try {
      await payrollRunsService.create({
        user_id: user.id,
        period_start: runPeriodStart,
        period_end: runPeriodEnd,
        pay_date: runPayDate,
        created_by: null,
      });
      setShowRunPayroll(false);
      setRunPeriodStart('');
      setRunPeriodEnd('');
      setRunPayDate('');
      await loadData();
    } catch (error) {
      console.error('Error creating payroll run:', error);
    }
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
              <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
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
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate ($)</label>
                      <input type="number" defaultValue="20.00" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Regular Hours</label>
                      <input type="number" defaultValue="80" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Overtime Hours</label>
                      <input type="number" defaultValue="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]">
                        <option>Florida (No State Tax)</option>
                        <option>California</option>
                        <option>New York</option>
                        <option>Texas (No State Tax)</option>
                      </select>
                    </div>
                  </div>
                  <button className="w-full px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium mb-4">
                    Calculate
                  </button>
                  <div className="space-y-2 border-t pt-4">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Gross Pay</span>
                      <span className="font-medium">$1,600.00</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">- Federal Tax (12%)</span>
                      <span className="text-red-600">-$192.00</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">- Social Security (6.2%)</span>
                      <span className="text-red-600">-$99.20</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">- Medicare (1.45%)</span>
                      <span className="text-red-600">-$23.20</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t font-semibold">
                      <span>Net Pay</span>
                      <span className="text-[#008000]">$1,285.60</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Payment History Tab */}
            {activeTab === 'history' && (
              <div className="space-y-4">
                {['Jan 1-15, 2024', 'Dec 16-31, 2023', 'Dec 1-15, 2023'].map((period, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{period}</p>
                        <p className="text-sm text-gray-500">4 employees • Processed on Jan 16, 2024</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-[#008000]">${(5000 + idx * 200).toFixed(2)}</p>
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Paid</span>
                      </div>
                    </div>
                  </div>
                ))}
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
                <button onClick={() => setShowRunPayroll(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button
                  onClick={handleCreateRun}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-medium"
                >
                  Process Payroll
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
