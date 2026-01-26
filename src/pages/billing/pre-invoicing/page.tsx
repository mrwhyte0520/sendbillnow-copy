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

const palette = {
  cream: '#f7f0df',
  creamLight: '#fdf8ec',
  creamAccent: '#fff9ea',
  green: '#3f4a2f',
  greenDark: '#2d3520',
  greenMuted: '#6d7751',
  greenSoft: '#cbd3b0',
  brown: '#7a5c3e',
  warmCopper: '#b5561f',
};

const baseBorderColor = '#d8ccb0';
const cardStyle = { backgroundColor: palette.creamLight, borderColor: baseBorderColor };
const panelStyle = { backgroundColor: palette.creamAccent, borderColor: baseBorderColor };
const primaryButtonStyle = { backgroundColor: palette.green, color: '#fff' };
const secondaryButtonStyle = { backgroundColor: palette.brown, color: '#fff' };
const ghostButtonStyle = { backgroundColor: palette.creamLight, color: palette.greenDark, borderColor: baseBorderColor };

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

  const statusChipClasses: Record<UiQuote['status'], string> = {
    pending: 'bg-[#001B9E] text-white',
    under_review: 'bg-[#001B9E] text-white',
    approved: 'bg-[#001B9E] text-white',
    rejected: 'bg-[#001B9E] text-white',
    expired: 'bg-[#001B9E] text-white',
    invoiced: 'bg-[#001B9E] text-white',
  };

  const getStatusColor = (status: UiQuote['status']) =>
    statusChipClasses[status] ?? 'bg-[#001B9E] text-white';

  const getStatusText = (status: UiQuote['status']) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'under_review': return 'Under Review';
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      case 'expired': return 'Expired';
      case 'invoiced': return 'Invoiced';
      default: return 'Unknown';
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
      toast.error('Failed to load quotes');

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
      toast.error('Failed to load customers');
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
      toast.error('Failed to load payment terms');
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

  const filteredQuotes = quotes.filter((quote) => {
    const matchesSearch =
      quote.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || quote.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center px-6" style={{ background: palette.cream }}>
          <div className="text-center space-y-3">
            <div
              className="mx-auto h-14 w-14 rounded-full border-4 border-dashed animate-spin"
              style={{ borderColor: palette.greenSoft, borderTopColor: palette.green }}
            />
            <p className="text-lg font-semibold text-gray-700">Loading quotes...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

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
      toast.error('This quote has already been invoiced. Duplicate it to create a new one.');
      return;
    }
    populateFormFromQuote(quote);
    setShowNewQuoteModal(true);
  };

  const handleEditQuote = (quoteId: string) => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;
    if (quote.status === 'invoiced') {
      toast.error('This quote has already been invoiced. Duplicate it to create a new one.');
      return;
    }
    populateFormFromQuote(quote);
    setShowNewQuoteModal(true);
  };

  const handleDeleteQuote = async (quoteId: string) => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;
    if (quote.status === 'invoiced') {
      toast.error('This quote has already been invoiced and cannot be deleted.');
      return;
    }
    if (!confirm(`Delete quote ${quoteId}?`)) return;

    try {
      await quotesService.delete(quote.dbId);
      await loadQuotes();
      toast.success('Quote deleted successfully');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error deleting quote:', error);
      toast.error('Failed to delete quote');
    }
  };

  const handleExportToPdf = () => {
    const loadingToast = toast.loading('Generating PDF...');

    setTimeout(async () => {
      try {
        if (!quotes || quotes.length === 0) {
          toast.warning('There are no quotes to export', { id: loadingToast });
          return;
        }

        const columns = [
          { key: 'id', label: 'Number' },
          { key: 'customer', label: 'Customer' },
          { key: 'date', label: 'Date' },
          { key: 'validUntil', label: 'Valid Until' },
          { key: 'total', label: 'Total' },
          { key: 'status', label: 'Status' },
        ];

        const dataToExport = quotes.map((quote) => ({
          id: quote.id,
          customer: quote.customerId
            ? customers.find((c) => c.id === quote.customerId)?.name || quote.customer
            : quote.customer,
          date: new Date(quote.date).toLocaleDateString('es-DO'),
          validUntil: new Date(quote.validUntil).toLocaleDateString('es-DO'),
          total: ` ${quote.total.toLocaleString('es-DO')}`,
          status: getStatusText(quote.status),
        }));

        await exportToPdf(dataToExport, columns, 'quotes', 'Quotes Report');
        toast.success('PDF generated successfully', { id: loadingToast });
      } catch (error) {
        console.error('Error generating PDF:', error);
        toast.error('Failed to generate PDF', { id: loadingToast });
      }
    }, 100);
  };

  const handleConvertToInvoice = (quoteId: string) => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;
    if (!user?.id) {
      toast.error('You must be logged in to convert to invoice');
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

        const invoicePayload = {
          customer_id: quote.customerId,
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

        const created = await invoicesService.create(user.id, invoicePayload, linesPayload);

        await quotesService.update(quote.dbId, { status: 'invoiced' });
        setQuotes((prev) => prev.map((q) => (q.id === quote.id ? { ...q, status: 'invoiced' } : q)));

        const createdNumber = String((created as any)?.invoice?.invoice_number || '').trim();
        toast.success(`Cotización ${quote.id} convertida en factura ${createdNumber || 'OK'}`);
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
      <div className="min-h-screen" style={{ background: palette.cream }}>
        <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pre-billing</h1>
            <p className="text-gray-600">Manage quotes and budgets before invoicing</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleExportToPdf}
              className="px-4 py-2 rounded-lg flex items-center transition-colors font-semibold"
              style={{ backgroundColor: palette.warmCopper, color: '#fff' }}
              title="Export PDF"
            >
              <i className="ri-file-pdf-line mr-2"></i>
              Export PDF
            </button>
            <button
              onClick={handleCreateQuote}
              className="px-4 py-2 rounded-lg flex items-center font-semibold"
              style={primaryButtonStyle}
            >
              <i className="ri-add-line mr-2"></i>
              New Quote
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
          <div className="rounded-lg shadow-sm border p-6" style={cardStyle}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Quotes</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{quotes.length}</p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: palette.creamAccent, color: palette.greenDark }}>
                <i className="ri-file-list-line text-xl text-blue-600"></i>
              </div>
            </div>
          </div>

          <div className="rounded-lg shadow-sm border p-6" style={cardStyle}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {quotes.filter(q => q.status === 'pending').length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: palette.creamAccent, color: palette.greenMuted }}>
                <i className="ri-time-line text-xl"></i>
              </div>
            </div>
          </div>

          <div className="rounded-lg shadow-sm border p-6" style={cardStyle}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Approved</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {quotes.filter(q => q.status === 'approved').length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: palette.greenSoft, color: palette.greenDark }}>
                <i className="ri-check-line text-xl"></i>
              </div>
            </div>
          </div>

          <div className="rounded-lg shadow-sm border p-6" style={cardStyle}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Under Review</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {quotes.filter(q => q.status === 'under_review').length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: palette.creamAccent, color: palette.green }}>
                <i className="ri-search-line text-xl"></i>
              </div>
            </div>
          </div>

          <div className="rounded-lg shadow-sm border p-6" style={cardStyle}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Expired</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {quotes.filter(q => q.status === 'expired').length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: palette.creamAccent, color: palette.brown }}>
                <i className="ri-calendar-line text-xl"></i>
              </div>
            </div>
          </div>

          <div className="rounded-lg shadow-sm border p-6" style={cardStyle}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Invoiced</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {quotes.filter(q => q.status === 'invoiced').length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: palette.greenSoft, color: palette.greenDark }}>
                <i className="ri-file-transfer-line text-xl"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-lg shadow-sm border p-6" style={panelStyle}>
          <div className="grid grid-cols-1 md-grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by customer or quote number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="under_review">Under Review</option>
                <option value="approved">Approved</option>
                <option value="invoiced">Invoiced</option>
                <option value="rejected">Rejected</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                }}
                className="w-full px-4 py-2 rounded-lg transition-colors whitespace-nowrap font-semibold"
                style={ghostButtonStyle}
              >
                <i className="ri-refresh-line mr-2"></i>
                Reset Filters
              </button>
            </div>
          </div>
        </div>

        {/* Quotes Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Quotes ({filteredQuotes.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valid Until
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredQuotes.map((quote, index) => {
                  const customerName = quote.customerId
                    ? customers.find(c => c.id === quote.customerId)?.name || quote.customer
                    : quote.customer;
                  const customerEmail = quote.customerId
                    ? customers.find(c => c.id === quote.customerId)?.email || quote.customerEmail
                    : quote.customerEmail;

                  return (
                    <tr key={quote.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-500">{index + 1}</div>
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
                         {quote.total.toLocaleString()}
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
                              title="View quote"
                            >
                              <i className="ri-eye-line"></i>
                            </button>
                          )}
                          {quote.status !== 'invoiced' && (
                            <button
                              onClick={() => handleEditQuote(quote.id)}
                              className="text-green-600 hover:text-green-900 p-1"
                              title="Edit quote"
                            >
                              <i className="ri-edit-line"></i>
                            </button>
                          )}
                          {quote.status === 'approved' && (
                            <button
                              onClick={() => handleConvertToInvoice(quote.id)}
                              className="text-green-600 hover:text-green-900 p-1"
                              title="Convert to invoice"
                            >
                              <i className="ri-file-transfer-line"></i>
                            </button>
                          )}
                          {quote.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApproveQuote(quote.id)}
                                className="text-green-600 hover:text-green-900 p-1"
                                title="Approve quote"
                              >
                                <i className="ri-check-line"></i>
                              </button>
                              <button
                                onClick={() => handleRejectQuote(quote.id)}
                                className="text-red-600 hover:text-red-900 p-1"
                                title="Reject quote"
                              >
                                <i className="ri-close-line"></i>
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDuplicateQuote(quote.id)}
                            className="text-orange-600 hover:text-orange-900 p-1"
                            title="Duplicate quote"
                          >
                            <i className="ri-file-copy-line"></i>
                          </button>
                          {quote.status !== 'invoiced' && (
                            <button
                              onClick={() => handleDeleteQuote(quote.id)}
                              className="text-red-600 hover:text-red-900 p-1"
                              title="Delete quote"
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
                  <h3 className="text-lg font-semibold text-gray-900">New Quote</h3>
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
                        <div>{selectedCustomer.phone ? `Phone: ${selectedCustomer.phone}` : 'Phone: -'}</div>
                        <div>{selectedCustomer.document ? `Document/RNC: ${selectedCustomer.document}` : 'Document/RNC: -'}</div>
                        <div>{selectedCustomer.address ? `Address: ${selectedCustomer.address}` : 'Address: -'}</div>
                        <div>{selectedCustomer.documentType ? `Document type: ${selectedCustomer.documentType}` : 'Document type: -'}</div>

                        <div>{selectedCustomer.ncfType ? `NCF: ${selectedCustomer.ncfType}` : 'NCF: -'}</div>
                      </div>
                    </div>
                  );
                })()}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Customer</label>

                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                      value={newQuoteCustomerId}
                      onChange={(e) => setNewQuoteCustomerId(e.target.value)}
                    >
                      <option value="">Select customer...</option>

                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>{customer.name}</option>
                      ))}
                    </select>
                    {clientError && (
                      <p className="mt-1 text-xs text-red-600">{clientError}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Payment terms</label>

                    <select
                      value={newQuotePaymentTermId ?? ''}
                      onChange={(e) => setNewQuotePaymentTermId(e.target.value || null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="">No specific terms</option>

                      {paymentTerms.map(term => (
                        <option key={term.id} value={term.id}>
                          {term.name}{typeof term.days === 'number' ? ` (${term.days} days)` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Valid until</label>

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
                  <h4 className="text-md font-medium text-gray-900 mb-4">Products / Services</h4>

                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>

                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>

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
                                <option value="">Select product...</option>

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
                              <span className="text-sm font-medium"> {item.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
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
                    Add product
                  </button>
                  {itemsError && (
                    <p className="mt-2 text-xs text-red-600">{itemsError}</p>
                  )}
                </div>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Terms and conditions</label>

                    <textarea
                      rows={4}
                      value={newQuoteTerms}
                      onChange={(e) => setNewQuoteTerms(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Add payment instructions, delivery dates, or general reminders..."
                    ></textarea>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Subtotal:</span>
                        <span className="text-sm font-medium"> {quoteSubtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Tax (18%):</span>

                        <span className="text-sm font-medium"> {quoteTax.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="border-t border-gray-200 pt-2">
                        <div className="flex justify-between">
                          <span className="text-base font-semibold">Total:</span>

                          <span className="text-base font-semibold"> {quoteTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
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
                  Cancel
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
                  Save draft
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
                  Create quote
                </button>

              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  </DashboardLayout>
);
}