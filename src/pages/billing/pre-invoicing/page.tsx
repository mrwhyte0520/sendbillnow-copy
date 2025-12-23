import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { exportToPdf } from '../../../../src/utils/exportImportUtils';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';
import { quotesService, invoicesService, customersService, inventoryService, paymentTermsService } from '../../../services/database';

interface UiQuoteItem {
  productId?: string;
  description: string;
  quantity: number;
  price: number;
  total: number;
}

interface UiQuote {
  id: string; // visible number
  dbId: string; // internal id
  customerId?: string;
  customer: string;
  customerEmail: string;
  amount: number;
  tax: number;
  total: number;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'expired' | 'invoiced';
  date: string;
  validUntil: string;
  items: UiQuoteItem[];
}

export default function PreInvoicingPage() {
  const { user } = useAuth();
  const [showNewQuoteModal, setShowNewQuoteModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [quotes, setQuotes] = useState<UiQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Array<{
    id: string;
    name: string;
    email?: string;
    phone?: string;
    document?: string | null;
    address?: string | null;
    documentType?: string | null;
    ncfType?: string | null;
  }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [paymentTerms, setPaymentTerms] = useState<Array<{ id: string; name: string; days?: number }>>([]);

  const [newQuoteCustomerId, setNewQuoteCustomerId] = useState('');
  const [newQuoteValidUntil, setNewQuoteValidUntil] = useState('');
  const [newQuoteTerms, setNewQuoteTerms] = useState('');
  const [newQuotePaymentTermId, setNewQuotePaymentTermId] = useState<string | null>(null);
  const [quoteItems, setQuoteItems] = useState<UiQuoteItem[]>([{
    productId: undefined,
    description: '',
    quantity: 1,
    price: 0,
    total: 0,
  }]);
  const [quoteSubtotal, setQuoteSubtotal] = useState(0);
  const [quoteTax, setQuoteTax] = useState(0);
  const [quoteTotal, setQuoteTotal] = useState(0);

  const [clientError, setClientError] = useState('');
  const [validUntilError, setValidUntilError] = useState('');
  const [itemsError, setItemsError] = useState('');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'under_review': return 'bg-blue-100 text-blue-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'expired': return 'bg-gray-100 text-gray-800';
      case 'invoiced': return 'bg-emerald-100 text-emerald-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const populateFormFromQuote = (quote: UiQuote) => {
    setNewQuoteCustomerId(quote.customerId || '');
    setNewQuoteValidUntil(quote.validUntil || '');
    setNewQuoteTerms('');

    const items = (quote.items && quote.items.length > 0)
      ? quote.items
      : [{ productId: undefined, description: 'Línea', quantity: 1, price: quote.total, total: quote.total }];

    setQuoteItems(items.map(it => ({
      productId: undefined,
      description: it.description,
      quantity: it.quantity,
      price: it.price,
      total: it.total,
    })));

    const subtotal = items.reduce((sum, it) => sum + (it.total || 0), 0);
    const taxCalc = subtotal * 0.18;
    const totalCalc = subtotal + taxCalc;
    setQuoteSubtotal(subtotal);
    setQuoteTax(taxCalc);
    setQuoteTotal(totalCalc);

    setClientError('');
    setValidUntilError('');
    setItemsError('');
  };

  const recalcTotals = (items: UiQuoteItem[]) => {
    const subtotal = items.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
    const tax = subtotal * 0.18;
    const total = subtotal + tax;
    setQuoteSubtotal(subtotal);
    setQuoteTax(tax);
    setQuoteTotal(total);
  };

  const handleItemChange = (index: number, field: 'product' | 'quantity' | 'price', value: string) => {
    setQuoteItems(prev => {
      const next = [...prev];
      const current = { ...next[index] };

      if (field === 'product') {
        const product = products.find(p => p.id === value);
        current.productId = value || undefined;
        current.description = product?.name || '';
        current.price = product?.price || 0;
      } else if (field === 'quantity') {
        const qty = Number(value) || 0;
        current.quantity = qty;
      } else if (field === 'price') {
        const price = Number(value) || 0;
        current.price = price;
      }

      current.total = (current.quantity || 0) * (current.price || 0);
      next[index] = current;
      recalcTotals(next);
      return next;
    });
  };

  const handleAddItem = () => {
    setQuoteItems(prev => {
      const next = [...prev, { productId: undefined, description: '', quantity: 1, price: 0, total: 0 }];
      return next;
    });
  };

  const handleRemoveItem = (index: number) => {
    setQuoteItems(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        next.push({ productId: undefined, description: '', quantity: 1, price: 0, total: 0 });
      }
      recalcTotals(next);
      return next;
    });
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendiente';
      case 'under_review': return 'En Revisión';
      case 'approved': return 'Aprobada';
      case 'rejected': return 'Rechazada';
      case 'expired': return 'Expirada';
      case 'invoiced': return 'Facturada';
      default: return 'Desconocido';
    }
  };

  const loadQuotes = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await quotesService.getAll(user.id);
      const list = Array.isArray(data) ? (data as any[]) : [];
      const mapped: UiQuote[] = list.map((q) => {
        const subtotal = Number(q.subtotal) || 0;
        const tax = Number(q.tax_amount) || 0;
        const total = Number(q.total_amount) || subtotal + tax;

        const items: UiQuoteItem[] = (q.quote_lines || []).map((line: any) => {
          const qty = Number(line.quantity) || 0;
          const unitPrice = Number(line.unit_price) || 0;
          const lineTotal = Number(line.line_total) || qty * unitPrice;
          return {
            productId: undefined,
            description: line.description || 'Ítem',
            quantity: qty,
            price: unitPrice,
            total: lineTotal,
          };
        });

        if (items.length === 0) {
          items.push({
            productId: undefined,
            description: q.description || 'Cotización',
            quantity: 1,
            price: total,
            total,
          });
        }

        const statusDb = (q.status as string) || 'pending';
        let status: UiQuote['status'];
        if (statusDb === 'approved') status = 'approved';
        else if (statusDb === 'under_review') status = 'under_review';
        else if (statusDb === 'rejected') status = 'rejected';
        else if (statusDb === 'expired') status = 'expired';
        else if (statusDb === 'invoiced') status = 'invoiced';
        else status = 'pending';

        return {
          id: (q.quote_number as string) || String(q.id),
          dbId: String(q.id),
          customerId: q.customer_id ? String(q.customer_id) : undefined,
          customer: 'Cliente',
          customerEmail: '',
          amount: subtotal,
          tax,
          total,
          status,
          date: (q.quote_date as string) || new Date().toISOString().slice(0, 10),
          validUntil: (q.valid_until as string) || (q.quote_date as string) || new Date().toISOString().slice(0, 10),
          items,
        };
      });

      setQuotes(mapped);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading quotes:', error);
      toast.error('Error al cargar las cotizaciones');
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    if (!user?.id) return;
    try {
      const list = await customersService.getAll(user.id);
      setCustomers(list.map((c: any) => ({
        id: c.id,
        name: c.name || c.customer_name || c.full_name || c.fullname || c.company || c.company_name || 'Cliente',
        email: c.email || c.contact_email || '',
        phone: c.phone || c.contact_phone || '',
        address: c.address || c.company_address || c.billing_address || c.address_line || '',
        documentType: (c as any).documentType || null,
        ncfType: (c as any).ncfType || null,
        document: c.document || null,
      })));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading customers for quotes:', error);
    }
  };

  const loadPaymentTerms = async () => {
    if (!user?.id) return;
    try {
      const terms = await paymentTermsService.getAll(user.id);
      const mapped = (terms || []).map((t: any) => ({
        id: t.id as string,
        name: t.name as string,
        days: typeof t.days === 'number' ? t.days : undefined,
      }));
      setPaymentTerms(mapped);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading payment terms for quotes:', error);
    }
  };

  const loadProducts = async () => {
    if (!user?.id) return;
    try {
      const list = await inventoryService.getItems(user.id);
      const mapped = (list as any[]).map((p) => ({
        id: String(p.id),
        name: p.name as string,
        // Tomar un precio de venta razonable: selling_price, sale_price, unit_price o price
        price: Number((p as any).selling_price ?? (p as any).sale_price ?? (p as any).unit_price ?? (p as any).price ?? 0) || 0,
      }));
      setProducts(mapped);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading inventory items for quotes:', error);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadQuotes();
      loadCustomers();
      loadProducts();
      loadPaymentTerms();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filteredQuotes = quotes.filter(quote => {
    const matchesSearch = quote.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         quote.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || quote.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateQuote = () => {
    // Resetear formulario de nueva cotización
    setNewQuoteCustomerId('');
    setNewQuoteValidUntil('');
    setNewQuoteTerms('');
    setNewQuotePaymentTermId(null);
    setQuoteItems([{ productId: undefined, description: '', quantity: 1, price: 0, total: 0 }]);
    setQuoteSubtotal(0);
    setQuoteTax(0);
    setQuoteTotal(0);
    setClientError('');
    setValidUntilError('');
    setItemsError('');
    setShowNewQuoteModal(true);
  };

  const handleViewQuote = (quoteId: string) => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;
    if (quote.status === 'invoiced') {
      toast.error('Esta cotización ya fue facturada y no se puede modificar. Debes duplicarla para crear otra.');
      return;
    }
    populateFormFromQuote(quote);
    setShowNewQuoteModal(true);
  };

  const handleEditQuote = (quoteId: string) => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;
    if (quote.status === 'invoiced') {
      toast.error('Esta cotización ya fue facturada y no se puede modificar. Debes duplicarla para crear otra.');
      return;
    }
    populateFormFromQuote(quote);
    setShowNewQuoteModal(true);
  };

  const handleDeleteQuote = async (quoteId: string) => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;
    if (quote.status === 'invoiced') {
      toast.error('Esta cotización ya fue facturada y no se puede eliminar. Debes duplicarla para crear otra.');
      return;
    }
    if (!confirm(`¿Está seguro de eliminar la cotización ${quoteId}?`)) return;

    try {
      await quotesService.delete(quote.dbId);
      await loadQuotes();
      toast.success('Cotización eliminada correctamente');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error deleting quote:', error);
      toast.error('Error al eliminar la cotización');
    }
  };

  const handleExportToPdf = () => {
    const loadingToast = toast.loading('Generando PDF...');

    setTimeout(async () => {
      try {
        if (!quotes || quotes.length === 0) {
          toast.warning('No hay cotizaciones para exportar', { id: loadingToast });
          return;
        }

        const columns = [
          { key: 'id', label: 'Número' },
          { key: 'customer', label: 'Cliente' },
          { key: 'date', label: 'Fecha' },
          { key: 'validUntil', label: 'Válida Hasta' },
          { key: 'total', label: 'Total' },
          { key: 'status', label: 'Estado' },
        ];

        const dataToExport = quotes.map((quote) => ({
          id: quote.id,
          customer: quote.customerId
            ? customers.find((c) => c.id === quote.customerId)?.name || quote.customer
            : quote.customer,
          date: new Date(quote.date).toLocaleDateString('es-DO'),
          validUntil: new Date(quote.validUntil).toLocaleDateString('es-DO'),
          total: `RD$ ${quote.total.toLocaleString('es-DO')}`,
          status: getStatusText(quote.status),
        }));

        await exportToPdf(dataToExport, columns, 'cotizaciones', 'Reporte de Cotizaciones');
        toast.success('PDF generado correctamente', { id: loadingToast });
      } catch (error) {
        console.error('Error al generar el PDF:', error);
        toast.error('Error al generar el PDF', { id: loadingToast });
      }
    }, 100);
  };

  const handlePrintQuote = (quoteId: string) => {
    alert(`Imprimiendo cotización: ${quoteId}`);
  };

  const handleConvertToInvoice = (quoteId: string) => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;
    if (!user?.id) {
      toast.error('Debes iniciar sesión para convertir en factura');
      return;
    }

    if (quote.status === 'invoiced') {
      toast.error('Esta cotización ya fue convertida a factura. Si necesitas otra, duplica la cotización.');
      return;
    }

    if (!quote.customerId) {
      toast.error('La cotización no tiene un cliente válido');
      return;
    }

    if (!confirm(`¿Convertir cotización ${quoteId} en factura?`)) return;

    (async () => {
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const invoiceNumber = `FAC-${Date.now()}`;

        const invoicePayload = {
          customer_id: quote.customerId,
          invoice_number: invoiceNumber,
          invoice_date: todayStr,
          due_date: quote.validUntil || todayStr,
          currency: 'DOP',
          subtotal: quote.amount,
          tax_amount: quote.tax,
          total_amount: quote.total,
          paid_amount: 0,
          status: 'pending',
          notes: `Generada desde cotización ${quote.id}`,
        };

        const linesPayload = quote.items.map((item, index) => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.price,
          line_total: item.total,
          line_number: index + 1,
        }));

        await invoicesService.create(user.id, invoicePayload, linesPayload);

        await quotesService.update(quote.dbId, { status: 'invoiced' });
        setQuotes((prev) => prev.map((q) => (q.id === quote.id ? { ...q, status: 'invoiced' } : q)));

        toast.success(`Cotización ${quote.id} convertida en factura ${invoiceNumber}`);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error converting quote to invoice:', error);
        toast.error('Error al convertir la cotización en factura');
      }
    })();
  };

  const handleDuplicateQuote = (quoteId: string) => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;
    if (!user?.id) {
      toast.error('Debes iniciar sesión para duplicar cotizaciones');
      return;
    }

    if (!quote.customerId) {
      toast.error('La cotización no tiene un cliente válido para duplicar');
      return;
    }

    (async () => {
      try {
        const baseLines = quote.items && quote.items.length > 0
          ? quote.items
          : [{ description: 'Línea duplicada', quantity: 1, price: quote.total, total: quote.total }];

        const linesPayload = baseLines.map((item) => ({
          description: item.description,
        }));

        const quotePayload = {
          customer_id: quote.customerId,
          status: 'pending',
        };

        await quotesService.create(user.id, quotePayload, linesPayload);
        await loadQuotes();
        toast.success(`Cotización ${quote.id} duplicada correctamente`);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error duplicating quote:', error);
        toast.error('Error al duplicar la cotización');
      }
    })();
  };

  const handleApproveQuote = (quoteId: string) => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;
    if (!user?.id) {
      toast.error('Debes iniciar sesión para aprobar cotizaciones');
      return;
    }

    if (quote.status === 'invoiced') {
      toast.error('Esta cotización ya fue facturada y no se puede aprobar. Debes duplicarla para crear otra.');
      return;
    }

    if (!confirm(`¿Aprobar cotización ${quoteId}?`)) return;

    (async () => {
      try {
        await quotesService.update(quote.dbId, { status: 'approved' });
        await loadQuotes();
        toast.success(`Cotización ${quote.id} aprobada`);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error approving quote:', error);
        toast.error('Error al aprobar la cotización');
      }
    })();
  };

  const handleRejectQuote = (quoteId: string) => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;
    if (!user?.id) {
      toast.error('Debes iniciar sesión para rechazar cotizaciones');
      return;
    }

    if (quote.status === 'invoiced') {
      toast.error('Esta cotización ya fue facturada y no se puede cancelar. Debes duplicarla para crear otra.');
      return;
    }

    if (!confirm(`¿Rechazar cotización ${quoteId}?`)) return;

    (async () => {
      try {
        await quotesService.update(quote.dbId, { status: 'rejected' });
        await loadQuotes();
        toast.success(`Cotización ${quote.id} rechazada`);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error rejecting quote:', error);
        toast.error('Error al rechazar la cotización');
      }
    })();
  };

  const hasValidItems = quoteItems.some(i => i.description && i.quantity > 0 && i.price > 0);
  const isFormValid = !!newQuoteCustomerId && !!newQuoteValidUntil && hasValidItems;

  const handleSaveNewQuote = async (mode: 'draft' | 'final') => {
    setClientError('');
    setValidUntilError('');
    setItemsError('');

    if (!user?.id) {
      toast.error('Debes iniciar sesión para crear cotizaciones');
      return;
    }

    if (!newQuoteCustomerId) {
      const msg = 'Selecciona un cliente';
      setClientError(msg);
      toast.error(msg);
      return;
    }

    if (!newQuoteValidUntil) {
      const msg = 'Selecciona la fecha de vigencia (Válida Hasta)';
      setValidUntilError(msg);
      toast.error(msg);
      return;
    }

    const validItems = quoteItems.filter(i => i.description && i.quantity > 0 && i.price > 0);
    if (validItems.length === 0) {
      const msg = 'Agrega al menos un producto con cantidad y precio mayor que 0';
      setItemsError(msg);
      toast.error(msg);
      return;
    }

    const subtotal = validItems.reduce((sum, it) => sum + (it.total || 0), 0);
    const tax = subtotal * 0.18;
    const total = subtotal + tax;

    const status = mode === 'draft' ? 'pending' : 'pending';

    try {
      const quotePayload = {
        customer_id: newQuoteCustomerId,
        payment_term_id: newQuotePaymentTermId || null,
        subtotal,
        tax_amount: tax,
        total_amount: total,
        status,
      };

      const linesPayload = validItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.price,
        line_total: item.total,
      }));

      await quotesService.create(user.id, quotePayload, linesPayload);
      await loadQuotes();
      setShowNewQuoteModal(false);
      toast.success(mode === 'draft' ? 'Borrador de cotización guardado' : 'Cotización creada correctamente');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error creating quote:', error);
      toast.error('Error al crear la cotización');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pre-facturación</h1>
            <p className="text-gray-600">Gestión de cotizaciones y presupuestos</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleExportToPdf}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center transition-colors"
              title="Exportar a PDF"
            >
              <i className="ri-file-pdf-line mr-2"></i>
              Exportar PDF
            </button>
            <button
              onClick={handleCreateQuote}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
            >
              <i className="ri-add-line mr-2"></i>
              Nueva Cotización
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Cotizaciones</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{quotes.length}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-blue-100">
                <i className="ri-file-list-line text-xl text-blue-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pendientes</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {quotes.filter(q => q.status === 'pending').length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-yellow-100">
                <i className="ri-time-line text-xl text-yellow-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Aprobadas</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {quotes.filter(q => q.status === 'approved').length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-green-100">
                <i className="ri-check-line text-xl text-green-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">En Revisión</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {quotes.filter(q => q.status === 'under_review').length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-blue-100">
                <i className="ri-search-line text-xl text-blue-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Expiradas</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {quotes.filter(q => q.status === 'expired').length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-gray-100">
                <i className="ri-calendar-line text-xl text-gray-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Facturadas</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {quotes.filter(q => q.status === 'invoiced').length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-emerald-100">
                <i className="ri-file-transfer-line text-xl text-emerald-600"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar por cliente o número de cotización..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm pr-8"
              >
                <option value="all">Todos los estados</option>
                <option value="pending">Pendientes</option>
                <option value="under_review">En Revisión</option>
                <option value="approved">Aprobadas</option>
                <option value="invoiced">Facturadas</option>
                <option value="rejected">Rechazadas</option>
                <option value="expired">Expiradas</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                }}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
              >
                <i className="ri-refresh-line mr-2"></i>
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Quotes Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Cotizaciones ({filteredQuotes.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Número
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Válida Hasta
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredQuotes.map((quote) => {
                  const customerName = quote.customerId
                    ? customers.find(c => c.id === quote.customerId)?.name || quote.customer
                    : quote.customer;
                  const customerEmail = quote.customerId
                    ? customers.find(c => c.id === quote.customerId)?.email || quote.customerEmail
                    : quote.customerEmail;

                  return (
                    <tr key={quote.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{quote.id}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{customerName}</div>
                        <div className="text-sm text-gray-500">{customerEmail}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(quote.date).toLocaleDateString('es-DO')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(quote.validUntil).toLocaleDateString('es-DO')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        RD$ {quote.total.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(quote.status)}`}>
                          {getStatusText(quote.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          {quote.status !== 'invoiced' && (
                            <button
                              onClick={() => handleViewQuote(quote.id)}
                              className="text-blue-600 hover:text-blue-900 p-1"
                              title="Ver cotización"
                            >
                              <i className="ri-eye-line"></i>
                            </button>
                          )}
                          {quote.status !== 'invoiced' && (
                            <button
                              onClick={() => handleEditQuote(quote.id)}
                              className="text-green-600 hover:text-green-900 p-1"
                              title="Editar cotización"
                            >
                              <i className="ri-edit-line"></i>
                            </button>
                          )}
                          {quote.status === 'approved' && (
                            <button
                              onClick={() => handleConvertToInvoice(quote.id)}
                              className="text-green-600 hover:text-green-900 p-1"
                              title="Convertir a factura"
                            >
                              <i className="ri-file-transfer-line"></i>
                            </button>
                          )}
                          {quote.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApproveQuote(quote.id)}
                                className="text-green-600 hover:text-green-900 p-1"
                                title="Aprobar cotización"
                              >
                                <i className="ri-check-line"></i>
                              </button>
                              <button
                                onClick={() => handleRejectQuote(quote.id)}
                                className="text-red-600 hover:text-red-900 p-1"
                                title="Rechazar cotización"
                              >
                                <i className="ri-close-line"></i>
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDuplicateQuote(quote.id)}
                            className="text-orange-600 hover:text-orange-900 p-1"
                            title="Duplicar cotización"
                          >
                            <i className="ri-file-copy-line"></i>
                          </button>
                          {quote.status !== 'invoiced' && (
                            <button
                              onClick={() => handleDeleteQuote(quote.id)}
                              className="text-red-600 hover:text-red-900 p-1"
                              title="Eliminar cotización"
                            >
                              <i className="ri-delete-bin-line"></i>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* New Quote Modal */}
        {showNewQuoteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Nueva Cotización</h3>
                  <button
                    onClick={() => setShowNewQuoteModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>
              </div>
              <div className="p-6">
                {(() => {
                  const selectedCustomer = customers.find((c) => String(c.id) === String(newQuoteCustomerId));
                  if (!selectedCustomer) return null;
                  return (
                    <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                      <div className="font-medium text-gray-900">{selectedCustomer.name}</div>
                      <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-gray-600">
                        <div>{selectedCustomer.email ? `Email: ${selectedCustomer.email}` : 'Email: -'}</div>
                        <div>{selectedCustomer.phone ? `Tel: ${selectedCustomer.phone}` : 'Tel: -'}</div>
                        <div>{selectedCustomer.document ? `Documento/RNC: ${selectedCustomer.document}` : 'Documento/RNC: -'}</div>
                        <div>{selectedCustomer.address ? `Dirección: ${selectedCustomer.address}` : 'Dirección: -'}</div>
                        <div>{selectedCustomer.documentType ? `Tipo doc: ${selectedCustomer.documentType}` : 'Tipo doc: -'}</div>
                        <div>{selectedCustomer.ncfType ? `NCF: ${selectedCustomer.ncfType}` : 'NCF: -'}</div>
                      </div>
                    </div>
                  );
                })()}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Cliente</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                      value={newQuoteCustomerId}
                      onChange={(e) => setNewQuoteCustomerId(e.target.value)}
                    >
                      <option value="">Seleccionar cliente...</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>{customer.name}</option>
                      ))}
                    </select>
                    {clientError && (
                      <p className="mt-1 text-xs text-red-600">{clientError}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Condición de pago</label>
                    <select
                      value={newQuotePaymentTermId ?? ''}
                      onChange={(e) => setNewQuotePaymentTermId(e.target.value || null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="">Sin condición específica</option>
                      {paymentTerms.map(term => (
                        <option key={term.id} value={term.id}>
                          {term.name}{typeof term.days === 'number' ? ` (${term.days} días)` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Válida Hasta</label>
                    <input
                      type="date"
                      value={newQuoteValidUntil}
                      onChange={(e) => setNewQuoteValidUntil(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {validUntilError && (
                      <p className="mt-1 text-xs text-red-600">{validUntilError}</p>
                    )}
                  </div>
                </div>
                
                <div className="mt-6">
                  <h4 className="text-md font-medium text-gray-900 mb-4">Productos/Servicios</h4>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quoteItems.map((item, index) => (
                          <tr key={index}>
                            <td className="px-4 py-3">
                              <select
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm pr-8"
                                value={item.productId ?? ''}
                                onChange={(e) => handleItemChange(index, 'product', e.target.value)}
                              >
                                <option value="">Seleccionar producto...</option>
                                {products.map((product) => (
                                  <option key={product.id} value={product.id}>{product.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number" min="0"
                                value={item.price}
                                onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm font-medium">RD$ {item.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(index)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <i className="ri-delete-bin-line"></i>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-add-line mr-2"></i>
                    Agregar Producto
                  </button>
                  {itemsError && (
                    <p className="mt-2 text-xs text-red-600">{itemsError}</p>
                  )}
                </div>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Términos y Condiciones</label>
                    <textarea
                      rows={4}
                      value={newQuoteTerms}
                      onChange={(e) => setNewQuoteTerms(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Términos y condiciones de la cotización..."
                    ></textarea>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Subtotal:</span>
                        <span className="text-sm font-medium">RD$ {quoteSubtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">ITBIS (18%):</span>
                        <span className="text-sm font-medium">RD$ {quoteTax.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="border-t border-gray-200 pt-2">
                        <div className="flex justify-between">
                          <span className="text-base font-semibold">Total:</span>
                          <span className="text-base font-semibold">RD$ {quoteTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
                <button
                  onClick={() => setShowNewQuoteModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveNewQuote('draft')}
                  disabled={!isFormValid}
                  className={`px-4 py-2 rounded-lg text-white transition-colors whitespace-nowrap ${
                    isFormValid
                      ? 'bg-yellow-600 hover:bg-yellow-700'
                      : 'bg-yellow-300 cursor-not-allowed'
                  }`}
                >
                  Guardar Borrador
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveNewQuote('final')}
                  disabled={!isFormValid}
                  className={`px-4 py-2 rounded-lg text-white transition-colors whitespace-nowrap ${
                    isFormValid
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-blue-300 cursor-not-allowed'
                  }`}
                >
                  Crear Cotización
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}