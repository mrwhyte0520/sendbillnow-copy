import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { customersService, deliveryNotesService, inventoryService } from '../../../services/database';

interface DeliveryNote {
  id: string;
  documentNumber: string;
  customerId: string;
  customerName: string;
  deliveryDate: string;
  status: 'draft' | 'posted' | 'invoiced' | 'cancelled';
  subtotal: number;
  taxTotal: number;
  totalAmount: number;
}

interface DeliveryNoteLineForm {
  inventory_item_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount_rate: string;
  tax_rate: string;
}

export default function DeliveryNotesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState<DeliveryNote | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'posted' | 'invoiced' | 'cancelled'>('all');

  const [headerForm, setHeaderForm] = useState({
    customer_id: '',
    delivery_date: '',
    notes: '',
  });

  const [linesForm, setLinesForm] = useState<DeliveryNoteLineForm[]>([
    { inventory_item_id: '', description: '', quantity: '', unit_price: '', discount_rate: '', tax_rate: '' },
  ]);

  const loadCustomers = async () => {
    if (!user?.id) return;
    try {
      const list = await customersService.getAll(user.id);
      setCustomers((list || []).map((c: any) => ({ id: String(c.id), name: String(c.name) })));
    } catch (error) {
      console.error('[DeliveryNotes] Error loading customers', error);
    }
  };

  const loadItems = async () => {
    if (!user?.id) return;
    try {
      const data = await inventoryService.getItems(user.id);
      setItems(data || []);
    } catch (error) {
      console.error('[DeliveryNotes] Error loading inventory items', error);
      setItems([]);
    }
  };

  const loadDeliveryNotes = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await deliveryNotesService.getAll(user.id);
      const mapped: DeliveryNote[] = (data || []).map((n: any) => ({
        id: String(n.id),
        documentNumber: n.document_number || `DN-${n.id}`,
        customerId: String(n.customer_id),
        customerName: (n.customers as any)?.name || 'Cliente',
        deliveryDate: String(n.delivery_date),
        status: (n.status as DeliveryNote['status']) || 'draft',
        subtotal: Number(n.subtotal) || 0,
        taxTotal: Number(n.tax_total) || 0,
        totalAmount: Number(n.total_amount) || 0,
      }));
      setDeliveryNotes(mapped);
    } catch (error) {
      console.error('[DeliveryNotes] Error loading delivery notes', error);
      setDeliveryNotes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
    loadItems();
  }, [user?.id]);

  useEffect(() => {
    loadDeliveryNotes();
  }, [user?.id]);

  const filteredNotes = deliveryNotes.filter((note) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      note.documentNumber.toLowerCase().includes(term) ||
      note.customerName.toLowerCase().includes(term);
    const matchesStatus = statusFilter === 'all' || note.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleNoteSelection = (id: string) => {
    setSelectedNoteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleGenerateInvoice = async () => {
    if (!user?.id) {
      alert('Debes iniciar sesión para generar facturas desde conduces');
      return;
    }
    if (selectedNoteIds.length === 0) {
      alert('Selecciona al menos un conduce en estado Contabilizado');
      return;
    }

    const notesToInvoice = deliveryNotes.filter((n) =>
      selectedNoteIds.includes(n.id),
    );
    if (notesToInvoice.length === 0) {
      alert('No se encontraron conduces válidos para facturar');
      return;
    }

    // Solo conduces contabilizados
    if (notesToInvoice.some((n) => n.status !== 'posted')) {
      alert('Solo se pueden facturar conduces en estado Contabilizado');
      return;
    }

    // Todos del mismo cliente
    const customerId = notesToInvoice[0].customerId;
    if (notesToInvoice.some((n) => n.customerId !== customerId)) {
      alert('Todos los conduces seleccionados deben ser del mismo cliente');
      return;
    }

    try {
      await deliveryNotesService.createInvoiceFromNotes(user.id, selectedNoteIds);
      await loadDeliveryNotes();
      setSelectedNoteIds([]);
      alert('Factura generada correctamente a partir de los conduces seleccionados');
    } catch (error: any) {
      console.error('[DeliveryNotes] Error generating invoice from delivery notes', error);
      alert(`Error al generar la factura desde conduces: ${error?.message || 'revisa la consola para más detalles'}`);
    }
  };

  const handleOpenModal = () => {
    setSelectedNote(null);
    setHeaderForm({
      customer_id: '',
      delivery_date: new Date().toISOString().slice(0, 10),
      notes: '',
    });
    setLinesForm([
      { inventory_item_id: '', description: '', quantity: '', unit_price: '', discount_rate: '', tax_rate: '' },
    ]);
    setShowModal(true);
  };

  const handleAddLine = () => {
    setLinesForm((prev) => [
      ...prev,
      { inventory_item_id: '', description: '', quantity: '', unit_price: '', discount_rate: '', tax_rate: '' },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    setLinesForm((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleLineChange = (index: number, field: keyof DeliveryNoteLineForm, value: string) => {
    setLinesForm((prev) =>
      prev.map((line, idx) => (idx === index ? { ...line, [field]: value } : line)),
    );
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id) {
      alert('Debes iniciar sesión para crear conduces');
      return;
    }

    if (!headerForm.customer_id) {
      alert('El cliente es obligatorio');
      return;
    }

    const validLines = linesForm.filter((l) => Number(l.quantity) > 0 && Number(l.unit_price) >= 0);
    if (validLines.length === 0) {
      alert('Debes agregar al menos una línea con cantidad y precio válidos');
      return;
    }

    const subtotal = validLines.reduce((sum, l) => {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unit_price) || 0;
      const discRate = Number(l.discount_rate) || 0;
      const gross = qty * price;
      const discAmt = discRate > 0 ? (gross * discRate) / 100 : 0;
      return sum + (gross - discAmt);
    }, 0);

    const taxTotal = validLines.reduce((sum, l) => {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unit_price) || 0;
      const discRate = Number(l.discount_rate) || 0;
      const taxRate = Number(l.tax_rate) || 0;
      const gross = qty * price;
      const discAmt = discRate > 0 ? (gross * discRate) / 100 : 0;
      const base = gross - discAmt;
      const taxAmt = taxRate > 0 ? (base * taxRate) / 100 : 0;
      return sum + taxAmt;
    }, 0);

    const totalAmount = subtotal + taxTotal;

    const notePayload = {
      customer_id: headerForm.customer_id,
      delivery_date: headerForm.delivery_date || new Date().toISOString().slice(0, 10),
      notes: headerForm.notes || null,
      status: 'draft',
      subtotal,
      discount_total: null,
      tax_total: taxTotal,
      total_amount: totalAmount,
    };

    const linesPayload = validLines.map((l) => {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unit_price) || 0;
      const discRate = Number(l.discount_rate) || 0;
      const taxRate = Number(l.tax_rate) || 0;
      const gross = qty * price;
      const discAmt = discRate > 0 ? (gross * discRate) / 100 : 0;
      const base = gross - discAmt;
      const taxAmt = taxRate > 0 ? (base * taxRate) / 100 : 0;
      const lineTotal = base + taxAmt;

      return {
        inventory_item_id: l.inventory_item_id || null,
        description: l.description || null,
        quantity: qty,
        unit_price: price,
        discount_rate: discRate || null,
        discount_amount: discAmt || null,
        tax_rate: taxRate || null,
        tax_amount: taxAmt || null,
        line_total: lineTotal,
      };
    });

    try {
      await deliveryNotesService.create(user.id, notePayload, linesPayload);
      await loadDeliveryNotes();
      setShowModal(false);
      alert('Conduce creado en borrador. Puedes contabilizarlo desde la columna Acciones.');
    } catch (error: any) {
      console.error('[DeliveryNotes] Error creating/posting delivery note', error);
      alert(`Error al crear el conduce: ${error?.message || 'revisa la consola para más detalles'}`);
    }
  };

  const handlePost = async (note: DeliveryNote) => {
    if (!user?.id) return;
    if (!confirm('¿Postear este conduce y afectar inventario?')) return;
    try {
      await deliveryNotesService.post(user.id, note.id);
      await loadDeliveryNotes();
      alert('Conduce contabilizado correctamente');
    } catch (error: any) {
      console.error('[DeliveryNotes] Error posting delivery note', error);
      alert(`Error al postear el conduce: ${error?.message || 'revisa la consola para más detalles'}`);
    }
  };

  const handleCancel = async (note: DeliveryNote) => {
    if (!user?.id) return;
    if (note.status === 'invoiced') {
      alert('No puedes anular un conduce que ya fue facturado');
      return;
    }
    if (!confirm('¿Anular este conduce?')) return;
    try {
      await deliveryNotesService.updateStatus(user.id, note.id, 'cancelled');
      await loadDeliveryNotes();
      alert('Conduce anulado correctamente');
    } catch (error: any) {
      console.error('[DeliveryNotes] Error cancelling delivery note', error);
      alert(`Error al anular el conduce: ${error?.message || 'revisa la consola para más detalles'}`);
    }
  };

  const getStatusBadge = (status: DeliveryNote['status']) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'posted':
        return 'bg-green-100 text-green-800';
      case 'invoiced':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 bg-gradient-to-br from-[#f6f1e3] to-[#ebe5d5] min-h-screen">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/inventory')}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <i className="ri-arrow-left-line text-lg" />
              <span>Volver al Inventario</span>
            </button>
            <div className="h-6 w-px bg-gray-300" />
            <div>
              <h1 className="text-2xl font-bold text-[#2f3e1e] drop-shadow-sm">Conduces / Notas de Entrega</h1>
              <nav className="flex space-x-2 text-sm text-gray-600 mt-2">
                <Link to="/inventory" className="hover:text-blue-600">Inventario</Link>
                <span>/</span>
                <span>Conduces</span>
              </nav>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleGenerateInvoice}
              disabled={selectedNoteIds.length === 0}
              className={`px-4 py-2 rounded-lg border text-sm whitespace-nowrap flex items-center gap-2 ${
                selectedNoteIds.length === 0
                  ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                  : 'border-green-200 text-green-700 hover:bg-green-50'
              }`}
            >
              <i className="ri-file-list-3-line" />
              Generar factura
            </button>
            <button
              onClick={handleOpenModal}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-add-line mr-2" />
              Nuevo Conduce
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="ri-search-line text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                placeholder="Buscar por cliente o número de conduce..."
              />
            </div>
          </div>
          <div className="w-full md:w-56">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm pr-8"
            >
              <option value="all">Todos los estados</option>
              <option value="draft">Borrador</option>
              <option value="posted">Contabilizado</option>
              <option value="invoiced">Facturado</option>
              <option value="cancelled">Anulado</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {loading && (
            <div className="px-6 py-3 text-sm text-gray-500">Cargando conduces...</div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {/* selección */}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Conduce</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subtotal</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Impuestos</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredNotes.map((note) => (
                  <tr key={note.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      {note.status === 'posted' && (
                        <input
                          type="checkbox"
                          checked={selectedNoteIds.includes(note.id)}
                          onChange={() => toggleNoteSelection(note.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {note.documentNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {note.customerName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {note.deliveryDate}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {note.subtotal.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {note.taxTotal.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {note.totalAmount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(note.status)}`}>
                        {note.status === 'draft' && 'Borrador'}
                        {note.status === 'posted' && 'Contabilizado'}
                        {note.status === 'invoiced' && 'Facturado'}
                        {note.status === 'cancelled' && 'Anulado'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      {note.status === 'draft' && (
                        <button
                          onClick={() => handlePost(note)}
                          className="text-green-600 hover:text-green-900"
                          title="Postear conduce"
                        >
                          <i className="ri-check-double-line" />
                        </button>
                      )}
                      {note.status !== 'cancelled' && (
                        <button
                          onClick={() => handleCancel(note)}
                          className="text-red-600 hover:text-red-900"
                          title="Anular conduce"
                        >
                          <i className="ri-close-circle-line" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}

                {filteredNotes.length === 0 && !loading && (
                  <tr>
                    <td className="px-6 py-4 text-center text-sm text-gray-500" colSpan={9}>
                      No hay conduces registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedNote ? 'Editar Conduce' : 'Nuevo Conduce'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl" />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cliente
                    </label>
                    <select
                      required
                      value={headerForm.customer_id}
                      onChange={(e) => setHeaderForm({ ...headerForm, customer_id: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                    >
                      <option value="">Seleccionar cliente</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha de entrega
                    </label>
                    <input
                      type="date"
                      value={headerForm.delivery_date}
                      onChange={(e) => setHeaderForm({ ...headerForm, delivery_date: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notas
                  </label>
                  <textarea
                    rows={3}
                    value={headerForm.notes}
                    onChange={(e) => setHeaderForm({ ...headerForm, notes: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Notas adicionales o referencias del conduce"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-md font-semibold text-gray-900">Líneas del Conduce</h4>
                    <button
                      type="button"
                      onClick={handleAddLine}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      <i className="ri-add-line mr-1" />
                      Agregar línea
                    </button>
                  </div>

                  <div className="space-y-4">
                    {linesForm.map((line, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end border border-gray-100 rounded-lg p-3"
                      >
                        <div className="md:col-span-2 space-y-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Producto
                            </label>
                            <select
                              value={line.inventory_item_id}
                              onChange={(e) => {
                                const selectedId = e.target.value;
                                const selected = items.find((it) => String(it.id) === String(selectedId));
                                const next: any = {
                                  ...line,
                                  inventory_item_id: selectedId,
                                };
                                if (selected) {
                                  if (!line.description) {
                                    next.description = selected.name || '';
                                  }
                                  if (!line.unit_price) {
                                    const price = Number(selected.selling_price) || 0;
                                    next.unit_price = String(price);
                                  }
                                }
                                setLinesForm((prev) =>
                                  prev.map((l, idx) => (idx === index ? next : l)),
                                );
                              }}
                              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                            >
                              <option value="">Seleccionar producto</option>
                              {items.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.name} ({it.sku})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Descripción
                            </label>
                            <input
                              type="text"
                              value={line.description}
                              onChange={(e) => handleLineChange(index, 'description', e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Producto / detalle"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Cantidad
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.quantity}
                            onChange={(e) => handleLineChange(index, 'quantity', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Precio Unit.
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unit_price}
                            onChange={(e) => handleLineChange(index, 'unit_price', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            % Desc.
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.discount_rate}
                            onChange={(e) => handleLineChange(index, 'discount_rate', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            % ITBIS
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.tax_rate}
                            onChange={(e) => handleLineChange(index, 'tax_rate', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(index)}
                            className="text-xs text-red-600 hover:text-red-800 flex items-center"
                            disabled={linesForm.length === 1}
                          >
                            <i className="ri-delete-bin-line mr-1" />
                            Quitar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"
                  >
                    Guardar Borrador
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
