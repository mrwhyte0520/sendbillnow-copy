import DashboardLayout from '../../components/layout/DashboardLayout';
import SupplierCatalogManager from '../../modules/supplier-catalog/SupplierCatalogManager';

export default function SupplierPortalPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-blue-700 p-6 text-white shadow-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-blue-100">Supplier Portal</p>
          <h1 className="mt-2 text-3xl font-bold">Manage your supplier catalog and price updates</h1>
          <p className="mt-2 max-w-3xl text-sm text-blue-50">Upload catalogs, import Excel / CSV / JSON / PDF, update prices and stock, sync supplier APIs, and maintain a clean supplier-owned product portfolio.</p>
        </div>
        <SupplierCatalogManager />
      </div>
    </DashboardLayout>
  );
}
