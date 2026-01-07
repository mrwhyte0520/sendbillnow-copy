import { useEffect, useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { paymentTermsService } from '../../../services/database';

export default function PaymentTermsPage() {
  const { user } = useAuth();
  const [terms, setTerms] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingTerm, setEditingTerm] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    days: 0,
    description: '',
  });

  const loadTerms = async () => {
    if (!user?.id) {
      setTerms([]);
      return;
    }
    try {
      // Obtener términos existentes
      let rows = await paymentTermsService.getAll(user.id);

      // Términos predeterminados que queremos garantizar
      const defaultTerms = [
        { name: 'Cash', days: 0, description: 'Immediate payment' },
        { name: '15 days', days: 15, description: 'Payment due in 15 days' },
        { name: '30 days', days: 30, description: 'Payment due in 30 days' },
        { name: '45 days', days: 45, description: 'Payment due in 45 days' },
        { name: '60 days', days: 60, description: 'Payment due in 60 days' },
      ];

      const existingNames = (rows || []).map((t: any) => String(t.name || '').toLowerCase());
      const toCreate = defaultTerms.filter(
        (d) => !existingNames.includes(d.name.toLowerCase()),
      );

      // Crear sólo los predeterminados que falten
      if (toCreate.length > 0) {
        for (const term of toCreate) {
          await paymentTermsService.create(user.id, {
            name: term.name,
            days: term.days,
            description: term.description,
          });
        }
        // Volver a cargar incluyendo los nuevos
        rows = await paymentTermsService.getAll(user.id);
      }

      setTerms(rows || []);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading payment terms', error);
      setTerms([]);
    }
  };

  useEffect(() => {
    loadTerms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const resetForm = () => {
    setFormData({
      name: '',
      days: 0,
      description: '',
    });
    setEditingTerm(null);
    setShowModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      alert('You must sign in to manage payment terms');
      return;
    }

    try {
      const payload = {
        name: formData.name,
        days: Number(formData.days) || 0,
        description: formData.description || undefined,
      };

      if (editingTerm?.id) {
        await paymentTermsService.update(editingTerm.id, payload);
      } else {
        await paymentTermsService.create(user.id, payload);
      }
      await loadTerms();
      resetForm();
      alert(editingTerm ? 'Payment term updated' : 'Payment term created');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error saving payment term', error);
      alert('Error saving the payment term');
    }
  };

  const handleEdit = (row: any) => {
    setEditingTerm(row);
    setFormData({
      name: row.name || '',
      days: row.days || 0,
      description: row.description || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!user?.id) {
      alert('You must sign in to delete payment terms');
      return;
    }
    if (!confirm('Delete this payment term?')) return;

    try {
      await paymentTermsService.delete(id);
      await loadTerms();
      alert('Payment term deleted');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error deleting payment term', error);
      alert('Unable to delete the payment term');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 bg-[#f6f2e8] min-h-screen space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1e2814]">Payment Terms</h1>
            <p className="text-sm text-[#4c5535]">Catalog of payment conditions for customers and vendors.</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-[#2f3e1e] text-white border border-[#1c250f] shadow-sm hover:bg-[#243015] transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line mr-2" />
            New Term
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-[#e0d7c4]">
          <div className="p-6 border-b border-[#e0d7c4]">
            <h3 className="text-lg font-semibold text-[#1e2814]">Payment Term List</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-[#ede7d7]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Days</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {terms.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{t.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{t.days}</td>
                    <td className="px-6 py-4 text-sm text-gray-700 max-w-md truncate">{t.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(t)}
                          className="text-[#2f3e1e] hover:text-[#1b250f] whitespace-nowrap"
                          title="Edit payment term"
                        >
                          <i className="ri-edit-line" />
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="text-[#6b4a2b] hover:text-[#4c2f17] whitespace-nowrap"
                          title="Delete payment term"
                        >
                          <i className="ri-delete-bin-line" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {terms.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                      No payment terms found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto border border-[#e6dec8] shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-[#1e2814]">
                  {editingTerm ? 'Edit Payment Term' : 'New Payment Term'}
                </h3>
                <button
                  onClick={resetForm}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    placeholder="e.g. 30 days"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Days *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.days}
                    onChange={(e) => setFormData({ ...formData, days: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2f3e1e] focus:border-[#2f3e1e]"
                    placeholder="Internal description for this payment term"
                  />
                </div>
                <div className="flex flex-col md:flex-row md:space-x-3 space-y-3 md:space-y-0 pt-4">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex-1 border border-[#d6cfbf] text-[#2f3e1e] py-2 rounded-lg hover:bg-[#f7f0df] transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#2f3e1e] text-white py-2 rounded-lg hover:bg-[#243015] transition-colors whitespace-nowrap"
                  >
                    {editingTerm ? 'Update Term' : 'Create Term'}
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
