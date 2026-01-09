import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { chartAccountsService, journalEntriesService, resolveTenantId, payrollSettingsService } from '../../../services/database';
import { formatMoney } from '../../../utils/numberFormat';

interface PayrollPeriod {
  id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  status: string;
}

interface PayrollJournalEntry {
  account: string;
  debit: number;
  credit: number;
  description: string;
}

export default function PayrollJournalEntryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [journalEntries, setJournalEntries] = useState<PayrollJournalEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPeriods();
  }, [user]);

  useEffect(() => {
    if (selectedPeriod) {
      generateJournalEntries();
    }
  }, [selectedPeriod]);

  const loadPeriods = async () => {
    if (!user) return;
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
        .is('journal_entry_id', null)
        // Soportar tanto estados en inglés como en español por compatibilidad
        .in('status', ['closed', 'paid', 'cerrado', 'pagado'])
        .order('start_date', { ascending: false });
      
      if (error) throw error;
      if (data) setPeriods(data);
    } catch (error) {
      console.error('Error loading periods:', error);
    }
  };

  const generateJournalEntries = async () => {
    if (!selectedPeriod || !user?.id) return;

    setLoading(true);
    try {
      const period = periods.find(p => p.id === selectedPeriod);
      if (!period) return;

      // Cargar configuración de nómina y catálogo de cuentas
      const [settings, accounts] = await Promise.all([
        payrollSettingsService.getPayrollSettings(),
        chartAccountsService.getAll(user.id),
      ]);

      const accountsById = new Map<string, any>();
      const accountsByCode = new Map<string, any>();
      (accounts || []).forEach((acc: any) => {
        if (acc.id) {
          accountsById.set(String(acc.id), acc);
        }
        if (acc.code) {
          accountsByCode.set(String(acc.code), acc);
        }
      });

      const fallbackAccounts = {
        salary: { code: '6101', name: 'Sueldos y Salarios' },
        tss: { code: '2102', name: 'Retenciones TSS por Pagar' },
        isr: { code: '2104', name: 'ISR de Nómina por Pagar' },
        payroll: { code: '2101', name: 'Nómina por Pagar' },
        otherDeductions: { code: '2103', name: 'Otras deducciones por pagar' },
      } as const;

      const resolveAccount = (
        id: string | null | undefined,
        fallbackKey: keyof typeof fallbackAccounts,
      ) => {
        if (id) {
          const acc = accountsById.get(String(id));
          if (acc?.code && acc?.name) {
            return { code: String(acc.code), name: String(acc.name) };
          }
        }

        const fb = fallbackAccounts[fallbackKey];
        const accByCode = accountsByCode.get(fb.code);
        if (accByCode?.code && accByCode?.name) {
          return { code: String(accByCode.code), name: String(accByCode.name) };
        }

        return fb;
      };

      const salaryAcc = resolveAccount(
        (settings as any)?.salary_expense_account_id,
        'salary',
      );
      const tssAcc = resolveAccount(
        (settings as any)?.tss_payable_account_id,
        'tss',
      );
      const isrAcc = resolveAccount(
        (settings as any)?.isr_payable_account_id,
        'isr',
      );
      const payrollAcc = resolveAccount(
        (settings as any)?.payroll_payable_account_id,
        'payroll',
      );
      const otherDeductionsAcc = resolveAccount(
        (settings as any)?.other_deductions_payable_account_id,
        'otherDeductions',
      );

      let tssTotal = period.total_deductions;
      let isrTotal = 0;
      let otherDeductionsTotal = 0;

      try {
        const { data: payrollEntries, error: payrollEntriesError } = await supabase
          .from('payroll_entries')
          .select('tss_deductions, periodic_deductions, other_deductions, absence_deductions, isr_deductions')
          .eq('payroll_period_id', period.id);

        if (!payrollEntriesError && payrollEntries && payrollEntries.length > 0) {
          const totals = payrollEntries.reduce(
            (acc, entry: any) => {
              acc.tss += Number(entry.tss_deductions) || 0;
              acc.periodic += Number(entry.periodic_deductions) || 0;
              acc.other += Number(entry.other_deductions) || 0;
              acc.absence += Number(entry.absence_deductions) || 0;
              acc.isr += Number(entry.isr_deductions) || 0;
              return acc;
            },
            { tss: 0, periodic: 0, other: 0, absence: 0, isr: 0 },
          );

          const calculatedTss = totals.tss;
          const calculatedIsr = totals.isr;
          const calculatedOther = totals.periodic + totals.other + totals.absence;
          const sumDeductions = calculatedTss + calculatedIsr + calculatedOther;

          if (Math.abs(sumDeductions - period.total_deductions) < 0.01) {
            tssTotal = calculatedTss;
            isrTotal = calculatedIsr;
            otherDeductionsTotal = calculatedOther;
          }
        }
      } catch (error) {
        console.error('Error calculating payroll deductions breakdown:', error);
      }

      const entries: PayrollJournalEntry[] = [
        {
          account: `${salaryAcc.code} - ${salaryAcc.name}`,
          debit: period.total_gross,
          credit: 0,
          description: `Registro de sueldos - ${period.period_name}`,
        },
        {
          account: `${tssAcc.code} - ${tssAcc.name}`,
          debit: 0,
          credit: tssTotal,
          description: `Retenciones TSS - ${period.period_name}`,
        },
      ];

      if (isrTotal > 0.01) {
        entries.push({
          account: `${isrAcc.code} - ${isrAcc.name}`,
          debit: 0,
          credit: isrTotal,
          description: `ISR retenido de nómina - ${period.period_name}`,
        });
      }

      if (otherDeductionsTotal > 0.01) {
        entries.push({
          account: `${otherDeductionsAcc.code} - ${otherDeductionsAcc.name}`,
          debit: 0,
          credit: otherDeductionsTotal,
          description: `Otras deducciones de nómina - ${period.period_name}`,
        });
      }

      entries.push({
        account: `${payrollAcc.code} - ${payrollAcc.name}`,
        debit: 0,
        credit: period.total_net,
        description: `Nómina neta por pagar - ${period.period_name}`,
      });

      setJournalEntries(entries);
    } catch (error) {
      console.error('Error generating journal entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const postToGeneralLedger = async () => {
    if (!selectedPeriod || journalEntries.length === 0) {
      alert('No journal entries to post.');
      return;
    }

    if (!user?.id) {
      alert('You must be signed in to post payroll.');
      return;
    }

    if (!confirm('Post these journal entries to the general ledger?')) return;

    setLoading(true);
    try {
      const period = periods.find(p => p.id === selectedPeriod);
      if (!period) {
        alert('Selected payroll period not found.');
        return;
      }

      const totalDebit = journalEntries.reduce((sum, e) => sum + e.debit, 0);
      const totalCredit = journalEntries.reduce((sum, e) => sum + e.credit, 0);

      if (Math.abs(totalDebit - totalCredit) >= 0.01) {
        alert('The payroll journal entry is not balanced. Please review the amounts.');
        return;
      }

      // Mapear códigos de cuenta a IDs reales del catálogo de cuentas
      const accounts = await chartAccountsService.getAll(user.id);
      const accountsByCode = new Map<string, string>();
      (accounts || []).forEach((acc: any) => {
        if (acc.code && acc.id) {
          accountsByCode.set(String(acc.code), String(acc.id));
        }
      });

      const lines = journalEntries.map((entry, index) => {
        const [codePart] = String(entry.account).split(' - ');
        const code = codePart.trim();
        const accountId = accountsByCode.get(code);

        if (!accountId) {
          throw new Error(`Could not find chart of account with code ${code} for payroll.`);
        }

        return {
          account_id: accountId,
          description: entry.description,
          debit_amount: entry.debit,
          credit_amount: entry.credit,
          line_number: index + 1,
        };
      });

      const today = new Date().toISOString().split('T')[0];
      const entryNumber = `NOM-${today}-${String(period.id).slice(0, 6)}`;

      const createdEntry = await journalEntriesService.createWithLines(user.id, {
        entry_number: entryNumber,
        entry_date: today,
        description: `Payroll journal entry - ${period.period_name}`,
        reference: `Payroll - ${period.period_name}`,
        status: 'posted',
      }, lines);

      // Guardar referencia al asiento contable en el período de nómina para evitar doble contabilización
      const tenantId = await resolveTenantId(user.id);
      if (tenantId && createdEntry?.id) {
        const { error: linkError } = await supabase
          .from('payroll_periods')
          .update({ journal_entry_id: createdEntry.id })
          .eq('id', period.id)
          .eq('user_id', tenantId);

        if (linkError) {
          console.error('Error linking payroll period to journal entry:', linkError);
        }
      }

      alert('Payroll journal entries posted to the general ledger.');
      setJournalEntries([]);
      setSelectedPeriod('');
    } catch (error) {
      console.error('Error posting to general ledger:', error);
      alert('Error posting journal entries.');
    } finally {
      setLoading(false);
    }
  };

  const totalDebit = journalEntries.reduce((sum, entry) => sum + entry.debit, 0);
  const totalCredit = journalEntries.reduce((sum, entry) => sum + entry.credit, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <DashboardLayout>
      <div className="space-y-6 bg-[#f6f3ea] min-h-screen -mx-4 sm:mx-0 p-4 sm:p-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payroll Journal Entry</h1>
            <p className="text-gray-700">Post payroll to the general ledger</p>
          </div>
          <button
            onClick={() => navigate('/payroll')}
            className="px-4 py-2 bg-[#e5ead7] text-[#2f3a1f] rounded-lg hover:bg-[#d7dec3] transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <i className="ri-arrow-left-line"></i>
            Back
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-[#dfe5cf] p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Payroll Period
            </label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4b5320] focus:border-transparent"
            >
              <option value="">-- Select period --</option>
              {periods.map(period => (
                <option key={period.id} value={period.id}>
                  {period.period_name} - {period.status}
                </option>
              ))}
            </select>
          </div>

          {selectedPeriod && (
            <div className="bg-[#e5ead7] border border-[#dfe5cf] rounded-lg p-4 mb-4 text-[#2f3a1f] flex items-start gap-2">
              <i className="ri-information-line text-xl mt-0.5"></i>
              <p className="text-sm">
                The system will generate journal entries to post this payroll period to the general ledger.
              </p>
            </div>
          )}
        </div>

        {journalEntries.length > 0 && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-[#dfe5cf]">
              <div className="p-6 border-b border-[#dfe5cf]">
                <h3 className="text-lg font-semibold text-gray-900">Generated Journal Entries</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {journalEntries.map((entry, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{entry.account}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{entry.description}</td>
                        <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                          {entry.debit > 0 ? formatMoney(entry.debit) : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                          {entry.credit > 0 ? formatMoney(entry.credit) : '-'}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-bold">
                      <td colSpan={2} className="px-6 py-4 text-sm text-gray-900 text-right">TOTALS</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">
                        {formatMoney(totalDebit)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">
                        {formatMoney(totalCredit)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-[#dfe5cf] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {isBalanced ? (
                      <div className="flex items-center text-[#2f3a1f]">
                        <i className="ri-checkbox-circle-fill text-xl mr-2"></i>
                        <span className="font-semibold">Balanced entry</span>
                      </div>
                    ) : (
                      <div className="flex items-center text-red-600">
                        <i className="ri-error-warning-fill text-xl mr-2"></i>
                        <span className="font-semibold">Unbalanced entry</span>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    Difference: {formatMoney(Math.abs(totalDebit - totalCredit))}
                  </p>
                </div>
                <button
                  onClick={postToGeneralLedger}
                  disabled={!isBalanced || loading}
                  className="px-6 py-3 bg-[#4b5320] text-white rounded-lg hover:bg-[#3d451b] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  <i className="ri-send-plane-line mr-2"></i>
                  Post to General Ledger
                </button>
              </div>
            </div>
          </>
        )}

        {selectedPeriod && journalEntries.length === 0 && !loading && (
          <div className="bg-white rounded-xl shadow-sm border border-[#dfe5cf] p-12 text-center">
            <i className="ri-file-list-line text-5xl text-gray-400 mb-4"></i>
            <p className="text-gray-700">Generating journal entries...</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
