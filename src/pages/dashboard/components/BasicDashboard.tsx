import { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { chartAccountsService, invoicesService } from '../../../services/database';
import { formatMoney } from '../../../utils/numberFormat';

export default function BasicDashboard() {
  const { user } = useAuth();
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [pendingInvoices, setPendingInvoices] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const uid = user?.id || '';
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const fromDate = start.toISOString().slice(0, 10);
        const toDate = end.toISOString().slice(0, 10);

        const [incomeStmt, invoices] = await Promise.all([
          chartAccountsService.generateIncomeStatement(uid, fromDate, toDate),
          invoicesService.getAll(uid)
        ]);

        const revenue = incomeStmt.totalIncome || 0;
        const expenses = incomeStmt.totalExpenses || 0;
        const profit = incomeStmt.netIncome || 0;

        setTotalRevenue(revenue);
        setTotalExpenses(expenses);
        setNetProfit(profit);

        const pendings = (invoices || []).filter((inv: any) => {
          const status = (inv.status || '').toLowerCase();
          return status === 'pending' || status === 'unpaid' || status === 'vencida';
        });
        setPendingInvoices(pendings.length);
        const amount = pendings.reduce((sum: number, inv: any) => sum + (inv.total_amount || inv.total || 0), 0);
        setPendingAmount(amount);
      } catch {
        setTotalRevenue(0);
        setTotalExpenses(0);
        setNetProfit(0);
        setPendingInvoices(0);
        setPendingAmount(0);
      }
    };
    fetchData();
  }, [user]);

  const formatCurrency = (amount: number) => formatMoney(amount);

  return (
    <div className="space-y-6">
      {/* Main Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Monthly Revenue</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <i className="ri-money-dollar-circle-line text-green-600 text-xl"></i>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Monthly Expenses</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(totalExpenses)}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <i className="ri-shopping-cart-line text-red-600 text-xl"></i>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Net Profit</p>
              <p className="text-2xl font-bold text-blue-600">{formatCurrency(netProfit)}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <i className="ri-line-chart-line text-blue-600 text-xl"></i>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Invoices</p>
              <p className="text-2xl font-bold text-orange-600">{pendingInvoices}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <i className="ri-file-list-3-line text-orange-600 text-xl"></i>
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-orange-600 font-medium">{formatCurrency(pendingAmount)}</span>
            <span className="text-gray-500 ml-2">to collect</span>
          </div>
        </div>
      </div>

    </div>
  );
}
