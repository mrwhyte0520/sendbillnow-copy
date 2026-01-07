import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { customerTypesService, chartAccountsService } from '../../../services/database';

interface CustomerType {
  id: string;
  name: string;
  description: string;
  fixedDiscount: number;
  creditLimit: number;
  allowedDelayDays: number;
  noTax: boolean;
  arAccountId?: string | null;
}

export default function CustomerTypesPage() {
  const { user } = useAuth();
  const [types, setTypes] = useState<CustomerType[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedType, setSelectedType] = useState<CustomerType | null>(null);

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [list, accs] = await Promise.all([
        customerTypesService.getAll(user.id),
        chartAccountsService.getAll(user.id),
      ]);
      setTypes(list || []);
      setAccounts(accs || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const arAccounts = accounts.filter((acc) => {
    if (!acc.allowPosting) return false;
    if (acc.type !== 'asset') return false;
    const name = String(acc.name || '').toLowerCase();
    return name.includes('cuentas por cobrar');
  });

  const handleNew = () => {
    setSelectedType(null);
    setShowModal(true);
  };

  const handleEdit = (t: CustomerType) => {
    setSelectedType(t);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id) return;
    const form = new FormData(e.currentTarget);
    const payload: any = {
      name: String(form.get('name') || ''),
      description: String(form.get('description') || ''),
      fixedDiscount: Number(form.get('fixedDiscount') || 0) || 0,
      creditLimit: Number(form.get('creditLimit') || 0) || 0,
      allowedDelayDays: Number(form.get('allowedDelayDays') || 0) || 0,
      noTax: String(form.get('noTax') || 'false') === 'true',
      arAccountId: String(form.get('arAccountId') || ''),
    };

    try {
      if (selectedType) {
        await customerTypesService.update(selectedType.id, payload);
      } else {
        await customerTypesService.create(user.id, payload);
      }
      await loadData();
      setShowModal(false);
      setSelectedType(null);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('[CustomerTypes] Error saving type', error);
      alert(`Error al guardar el tipo de cliente: ${error?.message || 'revisa la consola'}`);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 bg-[#f6f2e8] min-h-screen space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1e2814]">Customer Types</h1>
            <nav className="flex flex-wrap items-center gap-2 text-sm text-[#4c5535] mt-2">
              <Link to="/accounts-receivable" className="hover:text-[#2f3e1e]">Accounts Receivable</Link>
              <span>/</span>
              <span>Customer Types</span>
            </nav>
          </div>
          <button
            onClick={handleNew}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-[#2f3e1e] text-white border border-[#1c250f] shadow-sm hover:bg-[#243015] transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line mr-2"></i>
            New Type
          </button>
        </div>

        {loading && (
          <div className="mb-2 text-sm text-gray-500">Loading customer types...</div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-[#e0d7c4]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-[#ede7d7]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Fixed discount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Suggested credit limit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Grace days</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Tax exempt</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">A/R account</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {types.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <div>{t.name}</div>
                      {t.description && (
                        <div className="text-xs text-gray-500">{t.description}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {t.fixedDiscount.toLocaleString()}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      RD${t.creditLimit.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {t.allowedDelayDays} days
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {t.noTax ? 'Yes' : 'No'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(t as any).arAccountCode || ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleEdit(t)}
                        className="text-[#2f3e1e] hover:text-[#1b250f]"
                        title="Edit customer type"
                      >
                        <i className="ri-edit-line"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-[#e6dec8]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-[#1e2814]">
                  {selectedType ? 'Edit Customer Type' : 'New Customer Type'}
                </h3>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setSelectedType(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      required
                      defaultValue={selectedType?.name || ''}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fixed discount (%)</label>
                    <input
                      type="number"
                      min="0"
                      name="fixedDiscount"
                      step="0.01"
                      defaultValue={selectedType?.fixedDiscount ?? 0}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    name="description"
                    rows={2}
                    defaultValue={selectedType?.description || ''}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    placeholder="Internal note about the benefits of this type"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Suggested credit limit</label>
                    <input
                      type="number"
                      min="0"
                      name="creditLimit"
                      step="0.01"
                      defaultValue={selectedType?.creditLimit ?? 0}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Allowed delay days</label>
                    <input
                      type="number"
                      min="0"
                      name="allowedDelayDays"
                      defaultValue={selectedType?.allowedDelayDays ?? 0}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Invoice without VAT/ITBIS</label>
                    <select
                      name="noTax"
                      defaultValue={selectedType?.noTax ? 'true' : 'false'}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] pr-8"
                    >
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Accounts receivable account</label>
                    <select
                      name="arAccountId"
                      defaultValue={selectedType?.arAccountId || ''}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e] pr-8"
                    >
                      <option value="">Use default account</option>
                      {arAccounts.map((acc: any) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      If empty, the general accounts receivable account will be used.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:space-x-3 space-y-3 md:space-y-0 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setSelectedType(null);
                    }}
                    className="flex-1 border border-[#d6cfbf] text-[#2f3e1e] py-2 rounded-lg hover:bg-[#f7f0df] transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#2f3e1e] text-white py-2 rounded-lg hover:bg-[#243015] transition-colors whitespace-nowrap"
                  >
                    Save Type
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
