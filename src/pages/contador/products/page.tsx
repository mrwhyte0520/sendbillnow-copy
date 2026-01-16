import DashboardLayout from '../../../components/layout/DashboardLayout';

export default function ContadorProductsPage() {
  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-600 mt-1">Contador Module - Products</p>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <i className="ri-price-tag-3-line text-3xl text-green-600"></i>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Products</h2>
            <p className="text-gray-500">This module is under development.</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
