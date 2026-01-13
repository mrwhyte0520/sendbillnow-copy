import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { chartAccountsService, bankReconciliationService } from '../../../services/database';
import { formatDate } from '../../../utils/dateFormat';

interface BankStatement {
  id: string;
  bank_id: string;
  statement_date: string;
  beginning_balance: number;
  ending_balance: number;
  total_deposits: number;
  total_withdrawals: number;
  statement_items: BankStatementItem[];
}

interface BankStatementItem {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: number;
  type: 'deposit' | 'withdrawal';
  is_reconciled: boolean;
  journal_entry_id?: string;
}

interface ReconciliationItem {
  id: string;
  type: 'book' | 'bank';
  date: string;
  description: string;
  amount: number;
  is_matched: boolean;
  match_id?: string;
}

export default function BankReconciliationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [selectedBank, setSelectedBank] = useState('');
  const [reconciliationDate, setReconciliationDate] = useState(new Date().toISOString().split('T')[0]);
  const [reconciliationId, setReconciliationId] = useState<string | null>(null);
  const [bankStatement, setBankStatement] = useState<BankStatement | null>(null);
  const [bookItems, setBookItems] = useState<ReconciliationItem[]>([]);
  const [bankItems, setBankItems] = useState<ReconciliationItem[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [showBankItemModal, setShowBankItemModal] = useState(false);
  const [banks, setBanks] = useState<Array<{ id: string; name: string; account_number: string }>>([]);

  const [adjustmentForm, setAdjustmentForm] = useState({
    type: 'bank_charge',
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    const loadBanks = async () => {
      if (!user) return;
      try {
        const accounts = await chartAccountsService.getAll(user.id);
        const bankAccounts = (accounts || []).filter((acc: any) => acc.allowPosting && acc.type === 'asset');
        const mapped = bankAccounts.map((acc: any) => ({
          id: acc.id as string,
          name: acc.name as string,
          account_number: acc.code as string,
        }));
        setBanks(mapped);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading bank accounts for reconciliation:', error);
      }
    };

    loadBanks();
  }, [user]);

  useEffect(() => {
    loadData();
  }, [selectedBank, reconciliationDate]);

  const loadData = async () => {
    if (!user || !selectedBank) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const bookBalanceValue = await bankReconciliationService.getBookBalanceForBankAccount(
        user.id,
        selectedBank,
        reconciliationDate,
      );

      const bankStatementBalanceValue = bankStatement?.ending_balance ?? bookBalanceValue;

      // Obtener o crear conciliación
      const reconciliation = await bankReconciliationService.getOrCreateReconciliation(
        user.id,
        selectedBank,
        reconciliationDate,
        bankStatementBalanceValue,
        bookBalanceValue,
      );
      setReconciliationId(reconciliation.id);

      // Sincronizar items del libro desde el diario hacia bank_reconciliation_items
      await bankReconciliationService.upsertBookItemsFromJournal(
        reconciliation.id,
        user.id,
        selectedBank,
        reconciliationDate,
      );

      // Cargar todos los items guardados
      const items = await bankReconciliationService.getItems(reconciliation.id);

      const mappedBook: ReconciliationItem[] = (items || [])
        .filter((i: any) => i.transaction_type === 'book')
        .map((i: any) => ({
          id: i.id,
          type: 'book',
          date: i.transaction_date,
          description: i.description,
          amount: Number(i.amount) || 0,
          is_matched: Boolean(i.is_reconciled),
          match_id: undefined,
        }));

      const mappedBank: ReconciliationItem[] = (items || [])
        .filter((i: any) => i.transaction_type === 'bank')
        .map((i: any) => ({
          id: i.id,
          type: 'bank',
          date: i.transaction_date,
          description: i.description,
          amount: Number(i.amount) || 0,
          is_matched: Boolean(i.is_reconciled),
          match_id: undefined,
        }));

      setBookItems(mappedBook);
      setBankItems(mappedBank);
    } catch (error) {
      console.error('Error loading reconciliation data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMatchItems = (bookId: string, bankId: string) => {
    // Actualizar estado local
    setBookItems(prev => prev.map(item => 
      item.id === bookId 
        ? { ...item, is_matched: true, match_id: bankId }
        : item
    ));
    setBankItems(prev => prev.map(item => 
      item.id === bankId 
        ? { ...item, is_matched: true, match_id: bookId }
        : item
    ));

    // Persistir estado conciliado
    bankReconciliationService
      .setItemsReconciled([bookId, bankId], true)
      .catch((error: any) => {
        // eslint-disable-next-line no-console
        console.error('Error updating reconciled state:', error);
      });
  };

  const handleUnmatchItem = (itemId: string, type: 'book' | 'bank') => {
    const affectedIds: string[] = [];
    if (type === 'book') {
      const item = bookItems.find(i => i.id === itemId);
      if (item?.match_id) {
        affectedIds.push(item.match_id);
        setBankItems(prev => prev.map(i => 
          i.id === item.match_id 
            ? { ...i, is_matched: false, match_id: undefined }
            : i
        ));
      }
      affectedIds.push(itemId);
      setBookItems(prev => prev.map(i => 
        i.id === itemId 
          ? { ...i, is_matched: false, match_id: undefined }
          : i
      ));
    } else {
      const item = bankItems.find(i => i.id === itemId);
      if (item?.match_id) {
        affectedIds.push(item.match_id);
        setBookItems(prev => prev.map(i => 
          i.id === item.match_id 
            ? { ...i, is_matched: false, match_id: undefined }
            : i
        ));
      }
      affectedIds.push(itemId);
      setBankItems(prev => prev.map(i => 
        i.id === itemId 
          ? { ...i, is_matched: false, match_id: undefined }
          : i
      ));
    }

    if (affectedIds.length > 0) {
      bankReconciliationService
        .setItemsReconciled(affectedIds, false)
        .catch((error: any) => {
          // eslint-disable-next-line no-console
          console.error('Error updating reconciled state:', error);
        });
    }
  };

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newAdjustment = {
        id: Date.now().toString(),
        type: adjustmentForm.type,
        description: adjustmentForm.description,
        amount: parseFloat(adjustmentForm.amount),
        date: adjustmentForm.date,
        created_at: new Date().toISOString()
      };

      setAdjustments(prev => [...prev, newAdjustment]);
      
      // Agregar como item del libro
      const newBookItem: ReconciliationItem = {
        id: `adj_${Date.now()}`,
        type: 'book',
        date: adjustmentForm.date,
        description: `Ajuste: ${adjustmentForm.description}`,
        amount: adjustmentForm.type === 'bank_charge' ? -Math.abs(parseFloat(adjustmentForm.amount)) : Math.abs(parseFloat(adjustmentForm.amount)),
        is_matched: false
      };

      setBookItems(prev => [...prev, newBookItem]);

      setAdjustmentForm({
        type: 'bank_charge',
        description: '',
        amount: '',
        date: new Date().toISOString().split('T')[0]
      });
      setShowAdjustmentModal(false);
      alert('Ajuste agregado exitosamente.');
    } catch (error) {
      console.error('Error creating adjustment:', error);
      alert('Error al crear el ajuste. Intente nuevamente.');
    }
  };

  const calculateBalances = () => {
    const bookBalance = bookItems.reduce((sum, item) => sum + item.amount, 0);
    const bankBalance = bankItems.reduce((sum, item) => sum + item.amount, 0);
    const unmatchedBook = bookItems.filter(item => !item.is_matched).reduce((sum, item) => sum + item.amount, 0);
    const unmatchedBank = bankItems.filter(item => !item.is_matched).reduce((sum, item) => sum + item.amount, 0);
    
    return {
      bookBalance,
      bankBalance,
      unmatchedBook,
      unmatchedBank,
      difference: bookBalance - bankBalance,
      isReconciled: Math.abs(unmatchedBook - unmatchedBank) < 0.01
    };
  };

  const balances = calculateBalances();

  const downloadExcel = () => {
    try {
      // Crear contenido CSV
      let csvContent = 'Conciliación Bancaria\n';
      csvContent += `Total Transacciones:,${bankItems.length}\n`;
      csvContent += `Transacciones Conciliadas:,${bankItems.filter((i: ReconciliationItem) => i.is_matched).length}\n`;
      csvContent += `Transacciones Pendientes:,${bankItems.filter((i: ReconciliationItem) => !i.is_matched).length}\n`;

      // Crear y descargar archivo
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `conciliacion_bancaria_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading Excel:', error);
      alert('Error al descargar el archivo');
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando datos de conciliación...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Conciliación Bancaria</h1>
            <p className="text-gray-600 mt-1">Reconcilie las transacciones del libro con el estado bancario</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowAdjustmentModal(true)}
              className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-settings-line mr-2"></i>
              Nuevo Ajuste
            </button>
            <button
              onClick={() => navigate('/accounting')}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-arrow-left-line mr-2"></i>
              Volver
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Banco
              </label>
              <select
                value={selectedBank}
                onChange={(e) => setSelectedBank(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
              >
                <option value="">Seleccionar banco</option>
                {banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name} - {bank.account_number}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha de Conciliación
              </label>
              <input
                type="date"
                value={reconciliationDate}
                onChange={(e) => setReconciliationDate(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={loadData}
                disabled={!selectedBank}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <i className="ri-refresh-line mr-2"></i>
                Cargar Datos
              </button>
            </div>
          </div>
        </div>

        {selectedBank && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <i className="ri-book-line text-2xl text-blue-600"></i>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Balance Libro</p>
                    <p className="text-xl font-bold text-gray-900">
                      {balances.bookBalance.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <i className="ri-bank-line text-2xl text-green-600"></i>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Balance Banco</p>
                    <p className="text-xl font-bold text-gray-900">
                      {balances.bankBalance.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <i className="ri-question-line text-2xl text-yellow-600"></i>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Sin Conciliar</p>
                    <p className="text-xl font-bold text-gray-900">
                      {bookItems.filter(i => !i.is_matched).length + bankItems.filter(i => !i.is_matched).length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className={`p-2 rounded-lg ${Math.abs(balances.difference) < 0.01 ? 'bg-green-100' : 'bg-red-100'}`}>
                    <i className={`ri-calculator-line text-2xl ${Math.abs(balances.difference) < 0.01 ? 'text-green-600' : 'text-red-600'}`}></i>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Diferencia</p>
                    <p className={`text-xl font-bold ${Math.abs(balances.difference) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                      {Math.abs(balances.difference).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className={`p-2 rounded-lg ${balances.isReconciled ? 'bg-green-100' : 'bg-red-100'}`}>
                    <i className={`ri-check-line text-2xl ${balances.isReconciled ? 'text-green-600' : 'text-red-600'}`}></i>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Estado</p>
                    <p className={`text-sm font-bold ${balances.isReconciled ? 'text-green-600' : 'text-red-600'}`}>
                      {balances.isReconciled ? 'Conciliado' : 'Pendiente'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Reconciliation Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Book Items */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">Transacciones del Libro</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Fecha
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Descripción
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Monto
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Estado
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Acción
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {bookItems.map((item) => (
                        <tr key={item.id} className={item.is_matched ? 'bg-green-50' : ''}>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(item.date)}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-900">
                            {item.description}
                          </td>
                          <td className={`px-4 py-4 whitespace-nowrap text-sm font-medium ${
                            item.amount >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {Math.abs(item.amount).toLocaleString()}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              item.is_matched 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {item.is_matched ? 'Conciliado' : 'Pendiente'}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                            {item.is_matched ? (
                              <button
                                onClick={() => handleUnmatchItem(item.id, 'book')}
                                className="text-red-600 hover:text-red-900"
                              >
                                Deshacer
                              </button>
                            ) : (
                              <select
                                onChange={(e) => e.target.value && handleMatchItems(item.id, e.target.value)}
                                className="text-sm border border-gray-300 rounded px-2 py-1 pr-8"
                                defaultValue=""
                              >
                                <option value="">Conciliar con...</option>
                                {bankItems.filter(b => !b.is_matched && Math.abs(b.amount - item.amount) < 0.01).map((bankItem) => (
                                  <option key={bankItem.id} value={bankItem.id}>
                                    {bankItem.description.substring(0, 20)}...
                                  </option>
                                ))}
                              </select>
                            )}

        {/* Bank Item Modal (manual bank movements) */}
        {showBankItemModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">Agregar Movimiento Bancario</h2>
                  <button
                    onClick={() => setShowBankItemModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!reconciliationId) {
                      alert('Primero debe cargar datos de conciliación para un banco y fecha.');
                      return;
                    }

                    const formData = new FormData(e.currentTarget as HTMLFormElement);
                    const date = String(formData.get('date') || '').trim() || new Date().toISOString().split('T')[0];
                    const description = String(formData.get('description') || '').trim();
                    const amountValue = parseFloat(String(formData.get('amount') || '0')) || 0;
                    const direction = String(formData.get('direction') || 'deposit');

                    if (!description || !amountValue) {
                      alert('Debe indicar descripción y monto.');
                      return;
                    }

                    const signedAmount = direction === 'withdrawal' ? -Math.abs(amountValue) : Math.abs(amountValue);

                    bankReconciliationService
                      .addBankItem(reconciliationId, {
                        date,
                        description,
                        amount: signedAmount,
                        direction: direction === 'withdrawal' ? 'withdrawal' : 'deposit',
                      })
                      .then((created: any) => {
                        const newItem: ReconciliationItem = {
                          id: created.id,
                          type: 'bank',
                          date: created.transaction_date,
                          description: created.description,
                          amount: Number(created.amount) || 0,
                          is_matched: Boolean(created.is_reconciled),
                          match_id: undefined,
                        };

                        setBankItems(prev => [...prev, newItem]);
                        setShowBankItemModal(false);
                      })
                      .catch((error) => {
                        // eslint-disable-next-line no-console
                        console.error('Error creating bank reconciliation item:', error);
                        alert('Error al registrar el movimiento bancario');
                      });
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha
                    </label>
                    <input
                      type="date"
                      name="date"
                      defaultValue={new Date().toISOString().split('T')[0]}
                      required
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Descripción
                    </label>
                    <input
                      type="text"
                      name="description"
                      required
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Descripción del movimiento bancario"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tipo de Movimiento
                      </label>
                      <select
                        name="direction"
                        defaultValue="deposit"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                      >
                        <option value="deposit">Depósito (+)</option>
                        <option value="withdrawal">Retiro / Cargo (-)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Monto ()
                      </label>
                      <input
                        type="number"
                        name="amount"
                        required
                        min="0"
                        step="0.01"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowBankItemModal(false)}
                      className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                    >
                      Agregar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bank Items */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-900">Estado Bancario</h3>
                  <button
                    type="button"
                    onClick={() => setShowBankItemModal(true)}
                    className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-add-line mr-1"></i>
                    Agregar Movimiento
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Fecha
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Descripción
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Monto
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Estado
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Acción
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {bankItems.map((item) => (
                        <tr key={item.id} className={item.is_matched ? 'bg-green-50' : ''}>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(item.date)}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-900">
                            {item.description}
                          </td>
                          <td className={`px-4 py-4 whitespace-nowrap text-sm font-medium ${
                            item.amount >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {Math.abs(item.amount).toLocaleString()}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              item.is_matched 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {item.is_matched ? 'Conciliado' : 'Pendiente'}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                            {item.is_matched ? (
                              <button
                                onClick={() => handleUnmatchItem(item.id, 'bank')}
                                className="text-red-600 hover:text-red-900"
                              >
                                Deshacer
                              </button>
                            ) : (
                              <select
                                onChange={(e) => e.target.value && handleMatchItems(e.target.value, item.id)}
                                className="text-sm border border-gray-300 rounded px-2 py-1 pr-8"
                                defaultValue=""
                              >
                                <option value="">Conciliar con...</option>
                                {bookItems.filter(b => !b.is_matched && Math.abs(b.amount - item.amount) < 0.01).map((bookItem) => (
                                  <option key={bookItem.id} value={bookItem.id}>
                                    {bookItem.description.substring(0, 20)}...
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Adjustment Modal */}
        {showAdjustmentModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">Nuevo Ajuste de Conciliación</h2>
                  <button
                    onClick={() => setShowAdjustmentModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>

                <form onSubmit={handleSubmitAdjustment} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tipo de Ajuste *
                      </label>
                      <select
                        required
                        value={adjustmentForm.type}
                        onChange={(e) => setAdjustmentForm(prev => ({ ...prev, type: e.target.value }))}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                      >
                        <option value="bank_charge">Comisión Bancaria</option>
                        <option value="interest_earned">Interés Ganado</option>
                        <option value="nsf_fee">Comisión por Fondos Insuficientes</option>
                        <option value="service_charge">Cargo por Servicio</option>
                        <option value="other">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Fecha *
                      </label>
                      <input
                        type="date"
                        required
                        value={adjustmentForm.date}
                        onChange={(e) => setAdjustmentForm(prev => ({ ...prev, date: e.target.value }))}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Descripción *
                    </label>
                    <input
                      type="text"
                      required
                      value={adjustmentForm.description}
                      onChange={(e) => setAdjustmentForm(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Monto *
                    </label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      required
                      value={adjustmentForm.amount}
                      onChange={(e) => setAdjustmentForm(prev => ({ ...prev, amount: e.target.value }))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowAdjustmentModal(false)}
                      className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-orange-600 text-white py-3 rounded-lg hover:bg-orange-700 transition-colors whitespace-nowrap"
                    >
                      Crear Ajuste
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
