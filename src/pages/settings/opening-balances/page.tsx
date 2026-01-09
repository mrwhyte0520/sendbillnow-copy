import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { openingBalancesService } from '../../../services/database';
import { formatAmount, formatMoney } from '../../../utils/numberFormat';

export default function OpeningBalancesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [balances, setBalances] = useState<any[]>([]);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [validationSummary, setValidationSummary] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, [user, fiscalYear]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [balancesData, summary] = await Promise.all([
        openingBalancesService.getAll(user.id, fiscalYear),
        openingBalancesService.getValidationSummary(user.id, fiscalYear)
      ]);

      setBalances(balancesData);
      setValidationSummary(summary);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImportFromAccounts = async () => {
    if (!confirm(`Import all chart accounts as opening balances for fiscal year ${fiscalYear}?`)) return;
    
    setLoading(true);
    try {
      await openingBalancesService.importFromAccounts(user!.id, fiscalYear, openingDate);
      alert('Accounts imported successfully.');
      await loadData();
    } catch (error: any) {
      alert('Error importing accounts: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateBalance = async (balance: any, field: 'debit' | 'credit', value: number) => {
    try {
      const updatedBalance = {
        ...balance,
        [field]: value,
        [field === 'debit' ? 'credit' : 'debit']: 0, // Si se ingresa débito, crédito se pone en 0 y viceversa
        balance: value,
        balance_type: field
      };

      await openingBalancesService.update(balance.id, updatedBalance);
      await loadData();
    } catch (error: any) {
      alert('Error al actualizar balance: ' + error.message);
    }
  };

  const handlePostToJournal = async () => {
    if (!validationSummary?.isBalanced) {
      alert('Balances are not balanced. Debits must equal credits.');
      return;
    }

    if (!confirm(`Post the opening balances for fiscal year ${fiscalYear} to the General Journal?\n\nThis action cannot be undone.`)) return;

    setLoading(true);
    try {
      const result = await openingBalancesService.postToJournal(user!.id, fiscalYear);
      alert(`Opening balances posted successfully.\n\n${result.linesCount} accounts recorded\nTotal Debit: RD$ ${formatAmount(result.totalDebit)}\nTotal Credit: RD$ ${formatAmount(result.totalCredit)}`);
      await loadData();
    } catch (error: any) {
      alert('Error posting balances: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const isPosted = validationSummary?.isPosted || false;

  return (
    <DashboardLayout>
      <div className="space-y-6 bg-[#F8F3E7] min-h-full p-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#3B4A2A] to-[#1F2616] rounded-2xl shadow-lg shadow-[#1F2616]/30 border border-[#2A351E] p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Opening Balances</h1>
            <p className="text-[#CFE6AB]">Record the opening balances for the fiscal year</p>
          </div>
          <button
            onClick={() => navigate('/settings')}
            className="flex items-center space-x-2 text-white hover:text-[#D7E5C1]"
          >
            <i className="ri-arrow-left-line"></i>
            <span>Back</span>
          </button>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8] p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fiscal Year
              </label>
              <input
                type="number"
                min="2000"
                max="2100"
                value={fiscalYear}
                onChange={(e) => setFiscalYear(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                disabled={isPosted}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Opening Date
              </label>
              <input
                type="date"
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                disabled={isPosted}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleImportFromAccounts}
                disabled={loading || isPosted || balances.length > 0}
                className="w-full bg-[#3E4D2C] text-white px-4 py-2 rounded-lg hover:bg-[#2D3A1C] disabled:bg-gray-400 shadow shadow-[#3E4D2C]/30"
              >
                <i className="ri-download-2-line mr-2"></i>
                Import Catalog
              </button>
            </div>
            <div className="flex items-end">
              <button
                onClick={handlePostToJournal}
                disabled={loading || isPosted || !validationSummary?.isBalanced || validationSummary?.accountsWithBalance === 0}
                className="w-full bg-[#566738] text-white px-4 py-2 rounded-lg hover:bg-[#45532B] disabled:bg-gray-400 shadow shadow-[#566738]/30"
              >
                <i className="ri-check-double-line mr-2"></i>
                Post to Journal
              </button>
            </div>
          </div>
        </div>

        {/* Validation Summary */}
        {validationSummary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[#F6F8ED] rounded-xl shadow-sm border border-[#E0E7C8] p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[#E1E9C8] mr-4">
                  <i className="ri-list-check text-xl text-[#3B4A2A]"></i>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#5B6844]">Total Accounts</p>
                  <p className="text-2xl font-bold text-[#1F2618]">{validationSummary.totalAccounts}</p>
                </div>
              </div>
            </div>

            <div className="bg-[#F6F8ED] rounded-xl shadow-sm border border-[#E0E7C8] p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[#D9E7B5] mr-4">
                  <i className="ri-add-circle-line text-xl text-[#2F5020]"></i>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#5B6844]">Total Debit</p>
                  <p className="text-2xl font-bold text-[#2F5020]">
                    {formatMoney(validationSummary.totalDebit)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-[#F6F8ED] rounded-xl shadow-sm border border-[#E0E7C8] p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[#F7D8D6] mr-4">
                  <i className="ri-subtract-line text-xl text-[#B54848]"></i>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#5B6844]">Total Credit</p>
                  <p className="text-2xl font-bold text-[#B54848]">
                    {formatMoney(validationSummary.totalCredit)}
                  </p>
                </div>
              </div>
            </div>

            <div className={`bg-[#F6F8ED] rounded-xl shadow-sm border-2 p-6 ${validationSummary.isBalanced ? 'border-[#8AC06A]' : 'border-[#E29B9B]'}`}>
              <div className="flex items-center">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mr-4 ${validationSummary.isBalanced ? 'bg-[#D9E7B5]' : 'bg-[#F7D8D6]'}`}>
                  <i className={`text-xl ${validationSummary.isBalanced ? 'ri-checkbox-circle-line text-[#2F5020]' : 'ri-error-warning-line text-[#B54848]'}`}></i>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#5B6844]">Status</p>
                  <p className={`text-lg font-bold ${validationSummary.isBalanced ? 'text-[#2F5020]' : 'text-[#B54848]'}`}>
                    {validationSummary.isBalanced ? 'Balanced' : 'Not Balanced'}
                  </p>
                  {!validationSummary.isBalanced && (
                    <p className="text-xs text-[#B54848]">
                      Diff: {formatMoney(Math.abs(validationSummary.difference))}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Balances Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#E0E7C8]">
          <div className="p-6 border-b border-[#E0E7C8]">
            <h3 className="text-lg font-semibold text-[#1F2618]">
              Opening Balances - Fiscal Year {fiscalYear}
              {isPosted && (
                <span className="ml-3 px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                  <i className="ri-check-line mr-1"></i>
                  Posted
                </span>
              )}
            </h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {balances.map((balance) => (
                  <tr key={balance.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {balance.account_number}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {balance.account_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={balance.debit || 0}
                        onChange={(e) => handleUpdateBalance(balance, 'debit', parseFloat(e.target.value) || 0)}
                        disabled={isPosted}
                        className="w-32 px-2 py-1 border border-gray-300 rounded text-right disabled:bg-gray-100"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={balance.credit || 0}
                        onChange={(e) => handleUpdateBalance(balance, 'credit', parseFloat(e.target.value) || 0)}
                        disabled={isPosted}
                        className="w-32 px-2 py-1 border border-gray-300 rounded text-right disabled:bg-gray-100"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-medium">
                      {formatMoney(balance.balance || 0)}
                      <span className={`ml-2 text-xs ${balance.balance_type === 'debit' ? 'text-green-600' : 'text-red-600'}`}>
                        {balance.balance_type === 'debit' ? 'DB' : 'CR'}
                      </span>
                    </td>
                  </tr>
                ))}
                {balances.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      <i className="ri-folder-open-line text-5xl text-gray-400 mb-4"></i>
                      <p className="text-lg font-medium">No hay balances registrados</p>
                      <p className="text-sm">Usa el botón "Importar Catálogo" para cargar todas las cuentas</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
