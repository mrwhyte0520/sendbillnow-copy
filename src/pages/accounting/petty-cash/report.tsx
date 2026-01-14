import React, { useEffect, useState } from 'react';

import { Link } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { pettyCashService, settingsService } from '../../../services/database';
import { exportToExcelWithHeaders, exportToPdf } from '../../../utils/exportImportUtils';

interface PettyCashFund {
  id: string;
  name: string;
  initialAmount: number;
  currentBalance: number;
  status: 'active' | 'inactive';
  createdAt: string;
}

interface PettyCashExpense {
  id: string;
  fundId: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  receipt: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface PettyCashReimbursement {
  id: string;
  fundId: string;
  date: string;
  amount: number;
  description: string;
  startReceiptNumber?: string | null;
}

const PettyCashReportPage: React.FC = () => {
  const { user } = useAuth();

  const [funds, setFunds] = useState<PettyCashFund[]>([]);
  const [expenses, setExpenses] = useState<PettyCashExpense[]>([]);
  const [reimbursements, setReimbursements] = useState<PettyCashReimbursement[]>([]);

  const [companyInfo, setCompanyInfo] = useState<any | null>(null);

  const [loading, setLoading] = useState(false);
  const [selectedFundId, setSelectedFundId] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const [fundsData, expensesData, reimbursementsData] = await Promise.all([
          pettyCashService.getFunds(user.id),
          pettyCashService.getExpenses(user.id),
          pettyCashService.getReimbursements(user.id),
        ]);

        const mappedFunds: PettyCashFund[] = (fundsData || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          initialAmount: Number(f.initial_amount) || 0,
          currentBalance: Number(f.current_balance) || 0,
          status: (f.status as 'active' | 'inactive') || 'active',
          createdAt: f.created_at ? String(f.created_at).split('T')[0] : '',
        }));

        const mappedExpenses: PettyCashExpense[] = (expensesData || []).map((e: any) => ({
          id: e.id,
          fundId: e.fund_id,
          date: e.expense_date,
          description: e.description,
          category: e.category || '',
          amount: Number(e.amount) || 0,
          receipt: e.receipt_number || '',
          status: (e.status as 'pending' | 'approved' | 'rejected') || 'pending',
        }));

        const mappedReimbursements: PettyCashReimbursement[] = (reimbursementsData || []).map((r: any) => ({
          id: r.id,
          fundId: r.fund_id,
          date: r.reimbursement_date,
          amount: Number(r.amount) || 0,
          description: r.description || '',
          startReceiptNumber: r.start_receipt_number || null,
        }));

        setFunds(mappedFunds);
        setExpenses(mappedExpenses);
        setReimbursements(mappedReimbursements);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading petty cash report data:', error);
        alert('Error al cargar datos del reporte de caja chica');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  useEffect(() => {
    const loadCompany = async () => {
      try {
        const info = await settingsService.getCompanyInfo();
        setCompanyInfo(info);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading company info for petty cash report:', error);
      }
    };

    loadCompany();
  }, []);

  const filteredFunds = funds.filter((fund) => {
    if (selectedFundId === 'all') return true;
    return fund.id === selectedFundId;
  });

  const getReimbursementsForFund = (fundId: string) => {
    return reimbursements
      .filter((r) => {
        if (r.fundId !== fundId) return false;
        if (dateFrom && (!r.date || r.date < dateFrom)) return false;
        if (dateTo && (!r.date || r.date > dateTo)) return false;
        return true;
      })
      .sort((a, b) => {
        const aKey = a.date || '';
        const bKey = b.date || '';
        return aKey.localeCompare(bKey);
      });
  };

  const getExpensesForReimbursement = (
    fundId: string,
    reimbursement: PettyCashReimbursement,
    nextStartReceiptNumber?: string | null,
  ) => {
    const fundExpenses = expenses
      .filter((e) => e.fundId === fundId && e.status !== 'rejected' && e.receipt)
      .slice()
      .sort((a, b) => (a.receipt || '').localeCompare(b.receipt || ''));

    return fundExpenses.filter((e) => {
      const rec = e.receipt;
      if (!rec) return false;
      if (reimbursement.startReceiptNumber && rec < reimbursement.startReceiptNumber) return false;
      if (nextStartReceiptNumber && rec >= nextStartReceiptNumber) return false;
      return true;
    });
  };

  const handleExportExcel = () => {
    try {
      const rows: any[] = [];

      filteredFunds.forEach((fund) => {
        const fundReimbursements = getReimbursementsForFund(fund.id);
        const totalReplenishments = fundReimbursements.reduce((sum, r) => sum + (r.amount || 0), 0);
        const theoreticalFundValue = (fund.initialAmount || 0) + totalReplenishments;

        fundReimbursements.forEach((reimbursement, index) => {
          const next = fundReimbursements[index + 1];
          const expensesForReimbursement = getExpensesForReimbursement(
            fund.id,
            reimbursement,
            next?.startReceiptNumber || null,
          );
          const totalExpenses = expensesForReimbursement.reduce(
            (sum, e) => sum + (e.amount || 0),
            0,
          );
          const difference = (reimbursement.amount || 0) - totalExpenses;

          if (expensesForReimbursement.length === 0) {
            rows.push({
              fund: fund.name,
              fund_initial_amount: fund.initialAmount || 0,
              fund_total_replenishments: totalReplenishments,
              fund_theoretical_value: theoreticalFundValue,
              reimbursement_date: reimbursement.date || '',
              reimbursement_amount: reimbursement.amount || 0,
              reimbursement_start_receipt: reimbursement.startReceiptNumber || '',
              expense_receipt: '',
              expense_date: '',
              expense_description: '',
              expense_category: '',
              expense_amount: 0,
              expense_status: '',
              reimbursement_total_expenses: totalExpenses,
              reimbursement_difference: difference,
            });
          } else {
            expensesForReimbursement.forEach((expense, idx) => {
              rows.push({
                fund: fund.name,
                fund_initial_amount: idx === 0 ? fund.initialAmount || 0 : '',
                fund_total_replenishments: idx === 0 ? totalReplenishments : '',
                fund_theoretical_value: idx === 0 ? theoreticalFundValue : '',
                reimbursement_date: idx === 0 ? reimbursement.date || '' : '',
                reimbursement_amount: idx === 0 ? reimbursement.amount || 0 : '',
                reimbursement_start_receipt: idx === 0 ? (reimbursement.startReceiptNumber || '') : '',
                expense_receipt: expense.receipt || '',
                expense_date: expense.date || '',
                expense_description: expense.description || '',
                expense_category: expense.category || '',
                expense_amount: expense.amount || 0,
                expense_status: expense.status,
                reimbursement_total_expenses: idx === 0 ? totalExpenses : '',
                reimbursement_difference: idx === 0 ? difference : '',
              });
            });
          }
        });
      });

      if (rows.length === 0) {
        alert('No hay datos para exportar en el reporte de caja chica.');
        return;
      }

      const headers = [
        { key: 'fund', title: 'Fondo' },
        { key: 'fund_initial_amount', title: 'Monto inicial fondo' },
        { key: 'fund_total_replenishments', title: 'Total reposiciones fondo' },
        { key: 'fund_theoretical_value', title: 'Valor teorico del fondo' },
        { key: 'reimbursement_date', title: 'Fecha reposicion' },
        { key: 'reimbursement_amount', title: 'Monto reposicion' },
        { key: 'reimbursement_start_receipt', title: 'Numero inicial recibos' },
        { key: 'expense_receipt', title: 'Recibo gasto' },
        { key: 'expense_date', title: 'Fecha gasto' },
        { key: 'expense_description', title: 'Descripcion gasto' },
        { key: 'expense_category', title: 'Categoria gasto' },
        { key: 'expense_amount', title: 'Monto gasto' },
        { key: 'expense_status', title: 'Estado gasto' },
        { key: 'reimbursement_total_expenses', title: 'Total gastos reposicion' },
        { key: 'reimbursement_difference', title: 'Diferencia vs reposicion' },
      ];

      const today = new Date().toISOString().split('T')[0];

      const companyName =
        (companyInfo as any)?.name ||
        (companyInfo as any)?.company_name ||
        (companyInfo as any)?.legal_name ||
        '';

      exportToExcelWithHeaders(
        rows,
        headers,
        `reporte_caja_chica_${today}`,
        'ReporteCajaChica',
        [24, 18, 18, 20, 16, 16, 22, 18, 14, 40, 18, 16, 14, 20, 20],
        { title: 'Reporte de Caja Chica', companyName: companyName || undefined },
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error exporting petty cash report to Excel:', error);
      alert('Error al exportar el reporte de caja chica a Excel');
    }
  };

  const handleExportPdf = async () => {
    try {
      const rows: any[] = [];

      filteredFunds.forEach((fund) => {
        const fundReimbursements = getReimbursementsForFund(fund.id);
        const totalReplenishments = fundReimbursements.reduce((sum, r) => sum + (r.amount || 0), 0);
        const theoreticalFundValue = (fund.initialAmount || 0) + totalReplenishments;

        fundReimbursements.forEach((reimbursement, index) => {
          const next = fundReimbursements[index + 1];
          const expensesForReimbursement = getExpensesForReimbursement(
            fund.id,
            reimbursement,
            next?.startReceiptNumber || null,
          );
          const totalExpenses = expensesForReimbursement.reduce(
            (sum, e) => sum + (e.amount || 0),
            0,
          );
          const difference = (reimbursement.amount || 0) - totalExpenses;

          if (expensesForReimbursement.length === 0) {
            rows.push({
              fund: fund.name,
              fund_initial_amount: fund.initialAmount || 0,
              fund_total_replenishments: totalReplenishments,
              fund_theoretical_value: theoreticalFundValue,
              reimbursement_date: reimbursement.date || '',
              reimbursement_amount: reimbursement.amount || 0,
              reimbursement_start_receipt: reimbursement.startReceiptNumber || '',
              expense_receipt: '',
              expense_date: '',
              expense_description: '',
              expense_category: '',
              expense_amount: 0,
              expense_status: '',
              reimbursement_total_expenses: totalExpenses,
              reimbursement_difference: difference,
            });
          } else {
            expensesForReimbursement.forEach((expense, idx) => {
              rows.push({
                fund: fund.name,
                fund_initial_amount: idx === 0 ? fund.initialAmount || 0 : '',
                fund_total_replenishments: idx === 0 ? totalReplenishments : '',
                fund_theoretical_value: idx === 0 ? theoreticalFundValue : '',
                reimbursement_date: idx === 0 ? reimbursement.date || '' : '',
                reimbursement_amount: idx === 0 ? reimbursement.amount || 0 : '',
                reimbursement_start_receipt: idx === 0 ? (reimbursement.startReceiptNumber || '') : '',
                expense_receipt: expense.receipt || '',
                expense_date: expense.date || '',
                expense_description: expense.description || '',
                expense_category: expense.category || '',
                expense_amount: expense.amount || 0,
                expense_status: expense.status,
                reimbursement_total_expenses: idx === 0 ? totalExpenses : '',
                reimbursement_difference: idx === 0 ? difference : '',
              });
            });
          }
        });
      });

      if (rows.length === 0) {
        alert('No hay datos para exportar en el reporte de caja chica.');
        return;
      }

      const columns = [
        { key: 'fund', label: 'Fondo' },
        { key: 'fund_initial_amount', label: 'Monto inicial' },
        { key: 'fund_total_replenishments', label: 'Total reposiciones' },
        { key: 'fund_theoretical_value', label: 'Valor fondo' },
        { key: 'reimbursement_date', label: 'Fecha rep.' },
        { key: 'reimbursement_amount', label: 'Monto rep.' },
        { key: 'reimbursement_start_receipt', label: 'Recibo inicial' },
        { key: 'expense_receipt', label: 'Recibo gasto' },
        { key: 'expense_date', label: 'Fecha gasto' },
        { key: 'expense_description', label: 'Descripción' },
        { key: 'expense_category', label: 'Categoría' },
        { key: 'expense_amount', label: 'Monto gasto' },
        { key: 'expense_status', label: 'Estado' },
        { key: 'reimbursement_total_expenses', label: 'Total gastos rep.' },
        { key: 'reimbursement_difference', label: 'Dif. vs rep.' },
      ];

      await exportToPdf(rows, columns, 'reporte_caja_chica', 'ContaBi - Caja Chica', 'l');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error exporting petty cash report to PDF:', error);
      alert('Error al exportar el reporte de caja chica a PDF');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6 bg-gradient-to-br from-[#f6f1e3] to-[#ebe5d5] min-h-screen">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-[#2f3e1e] drop-shadow-sm">Reporte de Caja Chica</h1>
            <p className="text-gray-600">
              Relacion de movimientos (recibos de gastos) por reposicion y fondo de caja chica.
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleExportExcel}
              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap flex items-center"
            >
              <i className="ri-file-excel-line mr-2" />
              Exportar Excel
            </button>
            <button
              onClick={handleExportPdf}
              className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap flex items-center"
            >
              <i className="ri-file-pdf-line mr-2" />
              Exportar PDF
            </button>
            <Link
              to="/accounting/petty-cash"
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap flex items-center"
            >
              <i className="ri-arrow-left-line mr-2" />
              Volver a Caja Chica
            </Link>
          </div>
        </div>

        <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] p-4 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Filtros</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fondo de Caja Chica</label>
              <select
                value={selectedFundId}
                onChange={(e) => setSelectedFundId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
              >
                <option value="all">Todos los fondos</option>
                {funds.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha desde (reposicion)</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha hasta (reposicion)</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {loading && (
          <div className="text-center text-gray-500">Cargando datos del reporte de caja chica...</div>
        )}

        {!loading && filteredFunds.length === 0 && (
          <div className="text-center text-gray-500">No hay fondos de caja chica para mostrar.</div>
        )}

        {!loading && filteredFunds.map((fund) => {
          const fundReimbursements = getReimbursementsForFund(fund.id);
          const totalReplenishments = fundReimbursements.reduce((sum, r) => sum + (r.amount || 0), 0);
          const theoreticalFundValue = (fund.initialAmount || 0) + totalReplenishments;

          return (
            <div key={fund.id} className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{fund.name}</h2>
                  <p className="text-sm text-gray-600">Creado el {fund.createdAt || 'N/D'}</p>
                  <p className="mt-1 text-sm">
                    <span className="font-medium">Estado: </span>
                    <span className={fund.status === 'active' ? 'text-green-700' : 'text-gray-700'}>
                      {fund.status === 'active' ? 'Activo' : 'Inactivo'}
                    </span>
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-right">
                  <div>
                    <p className="text-xs uppercase text-gray-500">Monto inicial</p>
                    <p className="text-lg font-semibold text-gray-900">{fund.initialAmount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-500">Total reposiciones</p>
                    <p className="text-lg font-semibold text-gray-900">{totalReplenishments.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-500">Valor teorico del fondo</p>
                    <p className="text-lg font-semibold text-gray-900">{theoreticalFundValue.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {fundReimbursements.length === 0 && (
                <p className="mt-2 text-sm text-gray-500">
                  No hay reposiciones registradas para este fondo en el rango seleccionado.
                </p>
              )}

              {fundReimbursements.length > 0 && (
                <div className="space-y-6 mt-4">
                  {fundReimbursements.map((reimbursement, index) => {
                    const next = fundReimbursements[index + 1];
                    const expensesForReimbursement = getExpensesForReimbursement(
                      fund.id,
                      reimbursement,
                      next?.startReceiptNumber || null,
                    );
                    const totalExpenses = expensesForReimbursement.reduce(
                      (sum, e) => sum + (e.amount || 0),
                      0,
                    );
                    const difference = (reimbursement.amount || 0) - totalExpenses;

                    return (
                      <div key={reimbursement.id} className="border-t border-gray-200 pt-4">
                        <div className="flex justify-between items-center mb-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              Reposicion del {reimbursement.date || 'N/D'}
                            </p>
                            <p className="text-xs text-gray-600">
                              Monto reposicion: {reimbursement.amount.toLocaleString()}  b7 Numero inicial de recibos:{' '}
                              {reimbursement.startReceiptNumber || 'No especificado'}
                            </p>
                            {reimbursement.description && (
                              <p className="text-xs text-gray-600 mt-1">
                                Descripcion: {reimbursement.description}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-xs uppercase text-gray-500">Total recibos</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {totalExpenses.toLocaleString()}
                            </p>
                            <p className="text-xs mt-1">
                              Diferencia vs. reposicion:{' '}
                              <span className={difference === 0 ? 'text-green-700' : 'text-red-700 font-semibold'}>
                                {difference.toLocaleString()}
                              </span>
                            </p>
                          </div>
                        </div>

                        {expensesForReimbursement.length === 0 && (
                          <p className="text-sm text-gray-500">
                            No se encontraron recibos de gastos asociados a esta reposicion con el criterio actual
                            (filtro por numero inicial de recibos).
                          </p>
                        )}

                        {expensesForReimbursement.length > 0 && (
                          <div className="overflow-x-auto mt-2">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Recibo
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Fecha
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Descripcion
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Categoria
                                  </th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Monto
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Estado
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {expensesForReimbursement.map((expense) => (
                                  <tr key={expense.id}>
                                    <td className="px-4 py-2 whitespace-nowrap text-gray-900">
                                      {expense.receipt || '-'}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-gray-900">
                                      {expense.date}
                                    </td>
                                    <td className="px-4 py-2 text-gray-900">
                                      {expense.description}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-gray-500">
                                      {expense.category || '-'}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-right font-medium text-gray-900">
                                      {expense.amount.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-gray-700">
                                      {expense.status === 'approved'
                                        ? 'Aprobado'
                                        : expense.status === 'pending'
                                        ? 'Pendiente'
                                        : 'Rechazado'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </DashboardLayout>
  );
};

export default PettyCashReportPage;
