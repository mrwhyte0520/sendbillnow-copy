import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { exportToExcelStyled } from '../../../utils/exportImportUtils';
import { settingsService, chartAccountsService, payrollSettingsService } from '../../../services/database';

import { useAuth } from '../../../hooks/useAuth';

interface PayrollConfig {
  id?: string;
  company_name: string;
  tax_id: string;
  social_security_rate: number;
  income_tax_rate: number;
  christmas_bonus_rate: number;
  vacation_days: number;
  sick_days: number;
  overtime_rate: number;
  night_shift_rate: number;
  sunday_rate: number;
  holiday_rate: number;
  min_wage: number;
  currency: string;
  pay_frequency: 'weekly' | 'biweekly' | 'monthly';
  fiscal_year_start: string;
  backup_frequency: 'daily' | 'weekly' | 'monthly';
  auto_calculate_taxes: boolean;
  auto_generate_reports: boolean;
  payroll_payable_account_id?: string;
  tss_payable_account_id?: string;
  isr_payable_account_id?: string;
  other_deductions_payable_account_id?: string;
  overtime_payable_account_id?: string;
  incentives_payable_account_id?: string;
  vacation_payable_account_id?: string;
  infotep_payable_account_id?: string;
  salary_expense_account_id?: string;
  overtime_expense_account_id?: string;
  incentives_expense_account_id?: string;
  vacation_expense_account_id?: string;
  infotep_expense_account_id?: string;
}

interface TaxBracket {
  id: string;
  min_amount: number;
  max_amount: number;
  rate: number;
  fixed_amount: number;
}

export default function PayrollConfigurationPage() {
  const { user } = useAuth();
  const [config, setConfig] = useState<PayrollConfig | null>(null);
  const [taxBrackets, setTaxBrackets] = useState<TaxBracket[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState<any>({});

  const getAccountDisplay = (accountId: string | undefined) => {
    if (!accountId) return 'None';
    const account = accounts.find(a => a.id === accountId);
    return account ? `${account.code} - ${account.name}` : 'Not found';
  };

  useEffect(() => {
    loadConfiguration();
    loadAccounts();
  }, [user]);

  const loadAccounts = async () => {
    if (!user) return;
    try {
      const data = await chartAccountsService.getAll(user.id);
      setAccounts(data || []);
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  const loadConfiguration = async () => {
    setLoading(true);
    try {
      const [data, companyInfo] = await Promise.all([
        payrollSettingsService.getPayrollSettings(),
        settingsService.getCompanyInfo(),
      ]);

      const resolvedCompanyName = companyInfo
        ? (companyInfo as any).name || (companyInfo as any).company_name || ''
        : '';
      const resolvedTaxId = companyInfo
        ? (companyInfo as any).ruc || (companyInfo as any).tax_id || (companyInfo as any).rnc || ''
        : '';
      const resolvedCurrency = companyInfo
        ? (companyInfo as any).currency || ''
        : '';

      if (data) {
        const normalized: PayrollConfig = {
          id: data.id,
          company_name: data.company_name || resolvedCompanyName || '',
          tax_id: data.tax_id || resolvedTaxId || '',
          social_security_rate: Number(data.social_security_rate) || 0,
          income_tax_rate: Number(data.income_tax_rate) || 0,
          christmas_bonus_rate: Number(data.christmas_bonus_rate) || 0,
          vacation_days: Number(data.vacation_days) || 14,
          sick_days: Number(data.sick_days) || 10,
          overtime_rate: Number(data.overtime_rate) || 1.5,
          night_shift_rate: Number(data.night_shift_rate) || 1.2,
          sunday_rate: Number(data.sunday_rate) || 1.5,
          holiday_rate: Number(data.holiday_rate) || 2.0,
          min_wage: Number(data.min_wage) || 0,
          currency: data.currency || resolvedCurrency || 'DOP',
          pay_frequency: (data.pay_frequency as PayrollConfig['pay_frequency']) || 'monthly',
          fiscal_year_start: data.fiscal_year_start || '',
          backup_frequency: (data.backup_frequency as PayrollConfig['backup_frequency']) || 'weekly',
          auto_calculate_taxes: data.auto_calculate_taxes ?? true,
          auto_generate_reports: data.auto_generate_reports ?? true,
          payroll_payable_account_id: data.payroll_payable_account_id || undefined,
          tss_payable_account_id: data.tss_payable_account_id || undefined,
          isr_payable_account_id: data.isr_payable_account_id || undefined,
          other_deductions_payable_account_id: data.other_deductions_payable_account_id || undefined,
          overtime_payable_account_id: data.overtime_payable_account_id || undefined,
          incentives_payable_account_id: data.incentives_payable_account_id || undefined,
          vacation_payable_account_id: data.vacation_payable_account_id || undefined,
          infotep_payable_account_id: data.infotep_payable_account_id || undefined,
          salary_expense_account_id: data.salary_expense_account_id || undefined,
          overtime_expense_account_id: data.overtime_expense_account_id || undefined,
          incentives_expense_account_id: data.incentives_expense_account_id || undefined,
          vacation_expense_account_id: data.vacation_expense_account_id || undefined,
          infotep_expense_account_id: data.infotep_expense_account_id || undefined,
        };
        setConfig(normalized);
      } else {
        setConfig({
          company_name: resolvedCompanyName || '',
          tax_id: resolvedTaxId || '',
          social_security_rate: 0,
          income_tax_rate: 0,
          christmas_bonus_rate: 0,
          vacation_days: 14,
          sick_days: 10,
          overtime_rate: 1.5,
          night_shift_rate: 1.2,
          sunday_rate: 1.5,
          holiday_rate: 2.0,
          min_wage: 0,
          currency: resolvedCurrency || 'DOP',
          pay_frequency: 'monthly',
          fiscal_year_start: '',
          backup_frequency: 'weekly',
          auto_calculate_taxes: true,
          auto_generate_reports: true,
          payroll_payable_account_id: undefined,
          tss_payable_account_id: undefined,
          isr_payable_account_id: undefined,
          other_deductions_payable_account_id: undefined,
          overtime_payable_account_id: undefined,
          incentives_payable_account_id: undefined,
          vacation_payable_account_id: undefined,
          infotep_payable_account_id: undefined,
          salary_expense_account_id: undefined,
          overtime_expense_account_id: undefined,
          incentives_expense_account_id: undefined,
          vacation_expense_account_id: undefined,
          infotep_expense_account_id: undefined,
        });
      }

      const bracketsData = await payrollSettingsService.getPayrollTaxBrackets();
      const normalizedBrackets: TaxBracket[] = (bracketsData || []).map((b: any) => ({
        id: b.id,
        min_amount: Number(b.min_amount) || 0,
        max_amount: b.max_amount === null || typeof b.max_amount === 'undefined'
          ? Infinity
          : Number(b.max_amount),
        rate: Number(b.rate) || 0,
        fixed_amount: Number(b.fixed_amount) || 0,
      }));
      setTaxBrackets(normalizedBrackets);
    } catch (error) {
      console.error('Error loading payroll configuration:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setLoading(true);

    try {
      const payload = {
        id: config.id,
        company_name: config.company_name,
        tax_id: config.tax_id,
        social_security_rate: config.social_security_rate,
        income_tax_rate: config.income_tax_rate,
        christmas_bonus_rate: config.christmas_bonus_rate,
        vacation_days: config.vacation_days,
        sick_days: config.sick_days,
        overtime_rate: config.overtime_rate,
        night_shift_rate: config.night_shift_rate,
        sunday_rate: config.sunday_rate,
        holiday_rate: config.holiday_rate,
        min_wage: config.min_wage,
        currency: config.currency,
        pay_frequency: config.pay_frequency,
        fiscal_year_start: config.fiscal_year_start || null,
        backup_frequency: config.backup_frequency,
        auto_calculate_taxes: config.auto_calculate_taxes,
        auto_generate_reports: config.auto_generate_reports,
        payroll_payable_account_id: config.payroll_payable_account_id || null,
        tss_payable_account_id: config.tss_payable_account_id || null,
        isr_payable_account_id: config.isr_payable_account_id || null,
        other_deductions_payable_account_id: config.other_deductions_payable_account_id || null,
        overtime_payable_account_id: config.overtime_payable_account_id || null,
        incentives_payable_account_id: config.incentives_payable_account_id || null,
        vacation_payable_account_id: config.vacation_payable_account_id || null,
        infotep_payable_account_id: config.infotep_payable_account_id || null,
        salary_expense_account_id: config.salary_expense_account_id || null,
        overtime_expense_account_id: config.overtime_expense_account_id || null,
        incentives_expense_account_id: config.incentives_expense_account_id || null,
        vacation_expense_account_id: config.vacation_expense_account_id || null,
        infotep_expense_account_id: config.infotep_expense_account_id || null,
      };

      const saved = await payrollSettingsService.savePayrollSettings(payload);
      setConfig(prev => prev ? { ...prev, id: saved.id } : prev);

      alert('Configuration saved successfully');
    } catch (error) {
      console.error('Error saving configuration:', error);
      alert('Error saving configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTaxBracket = () => {
    setFormData({});
    setShowModal(true);
  };

  const handleEditTaxBracket = (bracket: TaxBracket) => {
    setFormData(bracket);
    setShowModal(true);
  };

  const handleSaveTaxBracket = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      min_amount: Number(formData.min_amount) || 0,
      max_amount:
        formData.max_amount === '' || formData.max_amount === undefined || formData.max_amount === null || formData.max_amount === Infinity
          ? null
          : Number(formData.max_amount),
      rate: Number(formData.rate) || 0,
      fixed_amount: Number(formData.fixed_amount) || 0,
    };

    try {
      setLoading(true);
      if (formData.id) {
        const updated = await payrollSettingsService.updatePayrollTaxBracket(formData.id, payload);

        setTaxBrackets(prev => prev.map(bracket =>
          bracket.id === formData.id
            ? {
                id: updated.id,
                min_amount: Number(updated.min_amount) || 0,
                max_amount: updated.max_amount === null || typeof updated.max_amount === 'undefined'
                  ? Infinity
                  : Number(updated.max_amount),
                rate: Number(updated.rate) || 0,
                fixed_amount: Number(updated.fixed_amount) || 0,
              }
            : bracket
        ));
      } else {
        const created = await payrollSettingsService.createPayrollTaxBracket(payload);

        const newBracket: TaxBracket = {
          id: created.id,
          min_amount: Number(created.min_amount) || 0,
          max_amount: created.max_amount === null || typeof created.max_amount === 'undefined'
            ? Infinity
            : Number(created.max_amount),
          rate: Number(created.rate) || 0,
          fixed_amount: Number(created.fixed_amount) || 0,
        };
        setTaxBrackets(prev => [...prev, newBracket]);
      }

      setShowModal(false);
      setFormData({});
    } catch (error) {
      console.error('Error saving tax bracket:', error);
      alert('Error saving the tax bracket');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTaxBracket = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tax bracket?')) return;

    try {
      setLoading(true);
      await payrollSettingsService.deletePayrollTaxBracket(id);

      setTaxBrackets(prev => prev.filter(bracket => bracket.id !== id));
    } catch (error) {
      console.error('Error deleting tax bracket:', error);
      alert('Error deleting the tax bracket');
    } finally {
      setLoading(false);
    }
  };

  const exportConfiguration = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const rows: any[] = [];
      // General configuration rows
      if (config) {
        const generalPairs: [string, any][] = [
          ['Company', config.company_name],
          ['Tax ID', config.tax_id],
          ['Social Security Rate (%)', config.social_security_rate],
          ['Income Tax Rate (%)', config.income_tax_rate],
          ['Christmas Bonus Rate (%)', config.christmas_bonus_rate],
          ['Vacation Days', config.vacation_days],
          ['Sick Days', config.sick_days],
          ['Overtime Rate (Factor)', config.overtime_rate],
          ['Night Shift Rate (Factor)', config.night_shift_rate],
          ['Sunday Rate (Factor)', config.sunday_rate],
          ['Holiday Rate (Factor)', config.holiday_rate],
          ['Minimum Wage', config.min_wage],
          ['Currency', config.currency],
          ['Pay Frequency', config.pay_frequency],
          ['Fiscal Year Start', config.fiscal_year_start],
          ['Automatic Tax Calculation', (config.auto_calculate_taxes ? 'Yes' : 'No')],
          ['Automatic Report Generation', (config.auto_generate_reports ? 'Yes' : 'No')],
          ['Backup Frequency', config.backup_frequency],
          ['Payroll Payable Account', getAccountDisplay(config.payroll_payable_account_id)],
          ['TSS Payable Account', getAccountDisplay(config.tss_payable_account_id)],
          ['ISR Payable Account', getAccountDisplay(config.isr_payable_account_id)],
          ['Other Deductions Payable Account', getAccountDisplay(config.other_deductions_payable_account_id)],
          ['Salary Expense Account', getAccountDisplay(config.salary_expense_account_id)],
        ];
        generalPairs.forEach(([k, v]) => rows.push({ section: 'General', key: k, value: v ?? '', from: '', to: '', rate: '', fixed: '' }));
      }

      // Separator row
      rows.push({ section: '', key: '', value: '', from: '', to: '', rate: '', fixed: '' });

      // Tax brackets rows
      taxBrackets.forEach(br => {
        rows.push({
          section: 'Tax Brackets',
          key: '',
          value: '',
          from: br.min_amount || 0,
          to: br.max_amount === Infinity ? 'Forward' : (br.max_amount || 0),
          rate: br.rate || 0,
          fixed: br.fixed_amount || 0,
        });
      });

      await exportToExcelStyled(
        rows,
        [
          { key: 'section', title: 'Section', width: 12 },
          { key: 'key', title: 'Key', width: 28 },
          { key: 'value', title: 'Value', width: 28 },
          { key: 'from', title: 'From', width: 16, numFmt: '#,##0.00' },
          { key: 'to', title: 'To', width: 16 },
          { key: 'rate', title: 'Rate (%)', width: 12, numFmt: '0.00' },
          { key: 'fixed', title: 'Fixed Amount', width: 16, numFmt: '#,##0.00' },
        ],
        `payroll_configuration_${today}`,
        'Payroll Configuration'
      );
    } catch (error) {
      console.error('Error exporting payroll configuration:', error);
      alert('Error exporting configuration to Excel');
    }
  };

  const renderGeneralConfig = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Company Information</h3>
        <form onSubmit={handleSaveConfig} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={config?.company_name || ''}
              onChange={(e) => setConfig(prev => prev ? { ...prev, company_name: e.target.value } : null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID / National ID</label>
            <input
              type="text"
              value={config?.tax_id || ''}
              onChange={(e) => setConfig(prev => prev ? { ...prev, tax_id: e.target.value } : null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
            <select
              value={config?.currency || 'DOP'}
              onChange={(e) => setConfig(prev => prev ? { ...prev, currency: e.target.value } : null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="DOP">Dominican Peso (DOP)</option>
              <option value="USD">US Dollar (USD)</option>
              <option value="EUR">Euro (EUR)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pay Frequency</label>
            <select
              value={config?.pay_frequency || 'monthly'}
              onChange={(e) => setConfig(prev => prev ? { ...prev, pay_frequency: e.target.value as any } : null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fiscal Year Start</label>
            <input
              type="date"
              value={config?.fiscal_year_start || ''}
              onChange={(e) => setConfig(prev => prev ? { ...prev, fiscal_year_start: e.target.value } : null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Salary</label>
            <input
              type="number" min="0"
              step="0.01"
              value={config?.min_wage || ''}
              onChange={(e) => setConfig(prev => prev ? { ...prev, min_wage: parseFloat(e.target.value) } : null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Rates and Percentages</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Social Security (%)</label>
            <input
              type="number" min="0"
              step="0.01"
              value={config?.social_security_rate || ''}
              onChange={(e) => setConfig(prev => prev ? { ...prev, social_security_rate: parseFloat(e.target.value) } : null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Income Tax Base (%)</label>
            <input
              type="number" min="0"
              step="0.01"
              value={config?.income_tax_rate || ''}
              onChange={(e) => setConfig(prev => prev ? { ...prev, income_tax_rate: parseFloat(e.target.value) } : null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Christmas Bonus (%)</label>
            <input
              type="number" min="0"
              step="0.01"
              value={config?.christmas_bonus_rate || ''}
              onChange={(e) => setConfig(prev => prev ? { ...prev, christmas_bonus_rate: parseFloat(e.target.value) } : null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Overtime (Factor)</label>
            <input
              type="number" min="0"
              step="0.01"
              value={config?.overtime_rate || ''}
              onChange={(e) => setConfig(prev => prev ? { ...prev, overtime_rate: parseFloat(e.target.value) } : null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Night Shift (Factor)</label>
            <input
              type="number" min="0"
              step="0.01"
              value={config?.night_shift_rate || ''}
              onChange={(e) => setConfig(prev => prev ? { ...prev, night_shift_rate: parseFloat(e.target.value) } : null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sunday (Factor)</label>
            <input
              type="number" min="0"
              step="0.01"
              value={config?.sunday_rate || ''}
              onChange={(e) => setConfig(prev => prev ? { ...prev, sunday_rate: parseFloat(e.target.value) } : null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Holidays (Factor)</label>
            <input
              type="number" min="0"
              step="0.01"
              value={config?.holiday_rate || ''}
              onChange={(e) => setConfig(prev => prev ? { ...prev, holiday_rate: parseFloat(e.target.value) } : null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vacation Days</label>
            <input
              type="number" min="0"
              value={config?.vacation_days || ''}
              onChange={(e) => setConfig(prev => prev ? { ...prev, vacation_days: parseInt(e.target.value) } : null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sick Days</label>
            <input
              type="number" min="0"
              value={config?.sick_days || ''}
              onChange={(e) => setConfig(prev => prev ? { ...prev, sick_days: parseInt(e.target.value) } : null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Automatic Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Automatic Tax Calculation</h4>
              <p className="text-sm text-gray-500">Automatically calculate income tax and social security</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config?.auto_calculate_taxes || false}
                onChange={(e) => setConfig(prev => prev ? { ...prev, auto_calculate_taxes: e.target.checked } : null)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#9cae77] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4b5320]"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Automatic Report Generation</h4>
              <p className="text-sm text-gray-500">Automatically generate reports when closing periods</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config?.auto_generate_reports || false}
                onChange={(e) => setConfig(prev => prev ? { ...prev, auto_generate_reports: e.target.checked } : null)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#9cae77] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4b5320]"></div>
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Backup Frequency</label>
            <select
              value={config?.backup_frequency || 'weekly'}
              onChange={(e) => setConfig(prev => prev ? { ...prev, backup_frequency: e.target.value as any } : null)}
              className="w-full md:w-1/3 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-4">
        <button
          onClick={exportConfiguration}
          className="bg-[#4b5320] text-white px-6 py-2 rounded-lg hover:bg-[#3d431a] transition-colors whitespace-nowrap"
        >
          <i className="ri-download-line mr-2"></i>
          Export Configuration
        </button>
        <button
          type="submit"
          onClick={handleSaveConfig}
          disabled={loading}
          className="bg-[#4b5320] text-white px-6 py-2 rounded-lg hover:bg-[#3d431a] transition-colors whitespace-nowrap disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );

  const renderTaxBrackets = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">ISR Tax Brackets</h3>
        <button
          onClick={handleAddTaxBracket}
          className="bg-[#4b5320] text-white px-4 py-2 rounded-lg hover:bg-[#3d431a] transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          Add Bracket
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">To</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rate (%)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fixed Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {taxBrackets.map((bracket) => (
                <tr key={bracket.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {bracket.min_amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {bracket.max_amount === Infinity ? 'And forward' : `${bracket.max_amount.toLocaleString()}`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {bracket.rate}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {bracket.fixed_amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleEditTaxBracket(bracket)}
                      className="text-[#4b5320] hover:text-[#3d431a]"
                    >
                      <i className="ri-edit-line"></i>
                    </button>
                    <button
                      onClick={() => handleDeleteTaxBracket(bracket.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <i className="ri-information-line text-blue-500 mt-1 mr-3"></i>
          <div>
            <h4 className="text-sm font-medium text-blue-800">About Tax Brackets</h4>
            <p className="text-sm text-blue-700 mt-1">
              Tax brackets are used to progressively calculate income tax (ISR). Each bracket has an income range, a tax rate, and a fixed amount added to the calculation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAccountingConfig = () => {
    const liabilityAccounts = accounts.filter(acc => acc.type === 'liability' && acc.allowPosting);
    const expenseAccounts = accounts.filter(acc => acc.type === 'expense' && acc.allowPosting);

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Payroll Liability Accounts</h3>
          <p className="text-sm text-gray-600 mb-6">
            Select the chart of accounts entries where payroll liabilities will be posted.
            These must be Liability type (code 2.x) and allow posting.
          </p>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="ri-money-dollar-circle-line mr-2"></i>
                Payroll Payable
              </label>
              <select
                value={config?.payroll_payable_account_id || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, payroll_payable_account_id: e.target.value || undefined } : null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Account --</option>
                {liabilityAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Account for net salaries pending payment (e.g., 2101 - Salaries Payable)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="ri-shield-check-line mr-2"></i>
                TSS Withholdings Payable
              </label>
              <select
                value={config?.tss_payable_account_id || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, tss_payable_account_id: e.target.value || undefined } : null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Account --</option>
                {liabilityAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Account for AFP, SFS, SRL withholdings (e.g., 2102 - TSS Withholdings Payable)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="ri-percent-line mr-2"></i>
                Payroll ISR Payable
              </label>
              <select
                value={config?.isr_payable_account_id || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, isr_payable_account_id: e.target.value || undefined } : null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Account --</option>
                {liabilityAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Account for ISR withholdings on salaries (e.g., 2104 - Payroll ISR Payable)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="ri-subtract-line mr-2"></i>
                Other Deductions Payable
              </label>
              <select
                value={config?.other_deductions_payable_account_id || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, other_deductions_payable_account_id: e.target.value || undefined } : null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Account --</option>
                {liabilityAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Account for other employee deductions (e.g., 2103 - Other Deductions Payable)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="ri-time-line mr-2"></i>
                Overtime Payable
              </label>
              <select
                value={config?.overtime_payable_account_id || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, overtime_payable_account_id: e.target.value || undefined } : null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Account --</option>
                {liabilityAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Account for overtime pending payment
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="ri-gift-line mr-2"></i>
                Incentives Payable
              </label>
              <select
                value={config?.incentives_payable_account_id || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, incentives_payable_account_id: e.target.value || undefined } : null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Account --</option>
                {liabilityAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Account for incentives and bonuses payable
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="ri-sun-line mr-2"></i>
                Vacation Payable
              </label>
              <select
                value={config?.vacation_payable_account_id || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, vacation_payable_account_id: e.target.value || undefined } : null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Account --</option>
                {liabilityAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Account for vacations pending payment
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="ri-building-2-line mr-2"></i>
                INFOTEP Payable
              </label>
              <select
                value={config?.infotep_payable_account_id || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, infotep_payable_account_id: e.target.value || undefined } : null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Account --</option>
                {liabilityAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Account for INFOTEP employer contributions payable (1%)
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Payroll Expense Accounts</h3>
          <p className="text-sm text-gray-600 mb-6">
            Select the chart of accounts entries where payroll expenses will be posted.
            These must be Expense type (code 6.x) and allow posting.
          </p>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="ri-user-line mr-2"></i>
                Salary & Wages Expense
              </label>
              <select
                value={config?.salary_expense_account_id || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, salary_expense_account_id: e.target.value || undefined } : null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Account --</option>
                {expenseAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Account for gross salaries and wages expense (e.g., 6101 - Salaries and Wages)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="ri-time-line mr-2"></i>
                Overtime Expense
              </label>
              <select
                value={config?.overtime_expense_account_id || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, overtime_expense_account_id: e.target.value || undefined } : null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Account --</option>
                {expenseAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Account for overtime expenses
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="ri-gift-line mr-2"></i>
                Incentives Expense
              </label>
              <select
                value={config?.incentives_expense_account_id || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, incentives_expense_account_id: e.target.value || undefined } : null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Account --</option>
                {expenseAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Account for incentives and bonuses expense
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="ri-sun-line mr-2"></i>
                Vacation Expense
              </label>
              <select
                value={config?.vacation_expense_account_id || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, vacation_expense_account_id: e.target.value || undefined } : null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Account --</option>
                {expenseAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Account for paid vacation expenses
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="ri-building-2-line mr-2"></i>
                INFOTEP Expense
              </label>
              <select
                value={config?.infotep_expense_account_id || ''}
                onChange={(e) => setConfig(prev => prev ? { ...prev, infotep_expense_account_id: e.target.value || undefined } : null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Account --</option>
                {expenseAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Account for INFOTEP employer contribution expenses
              </p>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <i className="ri-information-line text-blue-500 mt-1 mr-3"></i>
            <div>
              <h4 className="text-sm font-medium text-blue-800">Information about Accounting Entries</h4>
              <p className="text-sm text-blue-700 mt-1">
                When you configure these accounts, the system will automatically generate journal entries when processing payroll:
              </p>
              <ul className="text-sm text-blue-700 mt-2 space-y-1 list-disc list-inside">
                <li><strong>Debit:</strong> Salary &amp; Wages Expense (expense)</li>
                <li><strong>Credit:</strong> Payroll Payable + TSS Withholdings + Other Deductions (liabilities)</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            onClick={handleSaveConfig}
            disabled={loading}
            className="bg-[#4b5320] text-white px-6 py-2 rounded-lg hover:bg-[#3d431a] transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    );
  };

  const renderModal = () => {
    if (!showModal) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              {formData.id ? 'Edit' : 'Add'} Tax Bracket
            </h3>
            <button
              onClick={() => setShowModal(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>

          <form onSubmit={handleSaveTaxBracket} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount From</label>
              <input
                type="number" min="0"
                step="0.01"
                value={formData.min_amount || ''}
                onChange={(e) => setFormData({ ...formData, min_amount: parseFloat(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount To <span className="text-red-500">*</span></label>
              <input
                type="number" min="0"
                step="0.01"
                value={formData.max_amount === Infinity ? '' : formData.max_amount || ''}
                onChange={(e) => setFormData({ ...formData, max_amount: e.target.value ? parseFloat(e.target.value) : Infinity })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Leave empty for 'Forward'"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rate (%)</label>
              <input
                type="number" min="0"
                step="0.01"
                value={formData.rate || ''}
                onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fixed Amount <span className="text-red-500">*</span></label>
              <input
                type="number" min="0"
                step="0.01"
                value={formData.fixed_amount || ''}
                onChange={(e) => setFormData({ ...formData, fixed_amount: parseFloat(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-[#4b5320] text-white py-2 px-4 rounded-lg hover:bg-[#3d431a] transition-colors whitespace-nowrap"
              >
                {formData.id ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
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
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payroll Configuration</h1>
            <p className="text-gray-600">Configure general parameters of the payroll system</p>
          </div>

          <button
            onClick={() => window.REACT_APP_NAVIGATE('/payroll')}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <i className="ri-arrow-left-line"></i>
            <span>Back to Payroll</span>

          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'general', name: 'General Settings', icon: 'ri-settings-line' },
              { id: 'tax-brackets', name: 'Tax Brackets', icon: 'ri-percent-line' },
              { id: 'accounting', name: 'Chart of Accounts', icon: 'ri-book-line' }

            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-[#4b5320] text-[#4b5320]'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
          {activeTab === 'general' && renderGeneralConfig()}
          {activeTab === 'tax-brackets' && renderTaxBrackets()}
          {activeTab === 'accounting' && renderAccountingConfig()}
        </div>

        {/* Modal */}
        {renderModal()}
      </div>
    </DashboardLayout>
  );
}