import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import PlanGate from '../../components/PlanGate';
import { useAuth } from '../../hooks/useAuth';
import UploadCatalog from './UploadCatalog';
import SupplierTable from './SupplierTable';
import { supplierService } from './SupplierService';
import type { SupplierImportSource, SupplierProductInput, SupplierProductRow } from './types';
import { analyzeSupplierProducts } from './utils/supplierAnalysis';

export default function SupplierIntelligencePage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<SupplierProductRow[]>([]);
  const [businessId, setBusinessId] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [lastImportSummary, setLastImportSummary] = useState('');

  const load = async () => {
    if (!user?.id) {
      setRows([]);
      setBusinessId('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const context = await supplierService.getContext(user.id);
      setBusinessId(context.businessId);
      const products = await supplierService.listProducts(user.id);
      setRows(products.filter((item) => item.business_id === context.businessId));
    } catch (err: any) {
      setRows([]);
      setError(err?.message || 'Unable to load supplier products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const handleImport = async (products: SupplierProductInput[], source: SupplierImportSource) => {
    if (!user?.id) return;
    setWorking(true);
    setError('');

    try {
      const result = await supplierService.importProducts(products, source, user.id);
      setRows(result.products);
      setLastImportSummary(`Import completed successfully. Processed: ${result.processed}. Imported: ${result.imported}. Skipped: ${result.skipped}.`);
      return result;
    } catch (err: any) {
      setError(err?.message || 'Unable to import supplier products.');
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async (row: SupplierProductRow) => {
    if (!user?.id) return;
    setWorking(true);
    setError('');

    try {
      await supplierService.deleteProduct(row.db_id, user.id);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Unable to delete supplier product.');
    } finally {
      setWorking(false);
    }
  };

  const handleEdit = async (row: SupplierProductRow, updates: SupplierProductRow) => {
    if (!user?.id) return;
    setWorking(true);
    setError('');

    try {
      await supplierService.updateProduct(row.db_id, updates, user.id);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Unable to update supplier product.');
    } finally {
      setWorking(false);
    }
  };

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sameBusiness = rows.filter((row) => row.business_id === businessId);
    if (!query) return sameBusiness;

    return sameBusiness.filter((row) => Object.values(row)
      .some((value) => String(value || '').toLowerCase().includes(query)));
  }, [rows, search, businessId]);

  const supplierCount = useMemo(() => new Set(visibleRows.map((row) => row.prov)).size, [visibleRows]);
  const supplierInsights = useMemo(() => analyzeSupplierProducts(rows, businessId), [rows, businessId]);

  return (
    <PlanGate module="supplier-intelligence">
      <DashboardLayout>
        <div className="space-y-6 p-6">
        <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-emerald-600 p-6 text-white">
          <p className="text-xs uppercase tracking-[0.2em] text-blue-100">Supplier Intelligence</p>
          <h1 className="mt-2 text-3xl font-bold">Secure Multi-tenant Supplier Intelligence</h1>
          <p className="mt-2 text-sm text-blue-50">This module is isolated by business context and only loads supplier data for the active business.</p>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        {lastImportSummary ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{lastImportSummary}</div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Products</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{visibleRows.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Suppliers</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{supplierCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Business Context</p>
            <p className="mt-2 truncate text-sm font-semibold text-slate-900">{businessId || 'Not resolved'}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Supplier Insights</h2>
            <span className="text-xs text-slate-500">Read-only analysis by active business</span>
          </div>

          {supplierInsights.length === 0 ? (
            <div className="text-sm text-slate-500">Not enough supplier price variation yet to generate insights.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {supplierInsights.slice(0, 6).map((insight) => (
                <div key={`${insight.product}-${insight.best_supplier}`} className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">{insight.product}</p>
                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                    <p><span className="font-medium text-slate-800">Best Supplier:</span> {insight.best_supplier}</p>
                    <p><span className="font-medium text-slate-800">Lowest Price:</span> ${insight.best_price.toFixed(2)}</p>
                    <p><span className="font-medium text-slate-800">Average Supplier Price:</span> ${insight.average_price.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <UploadCatalog disabled={working} onImport={handleImport} />

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Supplier products</h2>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search any column: product, id, category, supplier..."
              className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-slate-500">Loading supplier products...</div>
          ) : (
            <SupplierTable products={visibleRows} currentBusinessId={businessId} onDelete={handleDelete} onEdit={handleEdit} />
          )}
        </div>
        </div>
      </DashboardLayout>
    </PlanGate>
  );
}

