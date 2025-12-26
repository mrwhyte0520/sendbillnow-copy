import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { exportToPdf } from '../../../utils/exportImportUtils';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';
import { formatAmount } from '../../../utils/numberFormat';
import * as QRCode from 'qrcode';
import {
  quotesService,
  customersService,
  invoicesService,
  paymentTermsService,
  bankCurrenciesService,
  taxService,
  salesRepsService,
  storesService,
  inventoryService,
  settingsService,
} from '../../../services/database';

// Tipos de datos
type StatusType = 'pending' | 'approved' | 'under_review' | 'rejected' | 'expired' | 'invoiced';

interface QuoteItem {
  item_id?: string | null;
  description: string;
  quantity: number;
  price: number;
  total: number;
}

interface ProductOption {
  id: string;
  name: string;
  price: number;
}

interface NewQuoteFormProps {
  customers: Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
    document?: string | null;
    address?: string | null;
    documentType?: string | null;
    ncfType?: string | null;
  }>;
  paymentTerms: Array<{ id: string; name: string; days?: number }>;
  currencies: Array<{ code: string; name: string; symbol: string; is_base?: boolean; is_active?: boolean }>;
  salesReps: Array<{ id: string; name: string; is_active: boolean }>;
  stores: Array<{ id: string; name: string; is_active?: boolean }>;
  products: ProductOption[];
  onCancel: () => void;
  onSaved: () => void;
  userId?: string;
}

function NewQuoteForm({ customers, paymentTerms, currencies, salesReps, stores, products, onCancel, onSaved, userId }: NewQuoteFormProps) {
  const [customerId, setCustomerId] = useState('');
  const [project, setProject] = useState('');
  const [validUntil, setValidUntil] = useState<string>(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [probability, setProbability] = useState<number>(50);
  const [paymentTermId, setPaymentTermId] = useState<string | null>(null);

  const [items, setItems] = useState<QuoteItem[]>([
    { item_id: null, description: '', quantity: 1, price: 0, total: 0 }
  ]);
  const baseCurrency = currencies.find(c => c.is_base) || currencies[0];
  const [currencyCode, setCurrencyCode] = useState<string>(baseCurrency?.code || 'DOP');
  const ITBIS_RATE = 0.18;

  const [storeName, setStoreName] = useState('Tienda principal');
  const [salesRepId, setSalesRepId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<number>(0);

  const recomputeTotals = (its: QuoteItem[]) => {
    return its.map(it => ({ ...it, total: (it.quantity || 0) * (it.price || 0) }));
  };

  const grossSubtotal = items.reduce((s, it) => s + (it.total || 0), 0);
  let totalDiscount = 0;
  if (discountType === 'percentage') {
    totalDiscount = grossSubtotal * (discountValue / 100);
  } else if (discountType === 'fixed') {
    totalDiscount = discountValue;
  }
  if (totalDiscount > grossSubtotal) {
    totalDiscount = grossSubtotal;
  }
  const subtotal = grossSubtotal - totalDiscount;
  const tax = Math.round(subtotal * ITBIS_RATE * 100) / 100;
  const total = subtotal + tax;

  const currentCurrency = currencies.find(c => c.code === currencyCode) || baseCurrency;
  const currencyLabel = currentCurrency?.symbol || currentCurrency?.code || 'RD$';

  const selectedCustomer = customers.find((c) => String(c.id) === String(customerId));

  const addRow = () => setItems(prev => [...prev, { item_id: null, description: '', quantity: 1, price: 0, total: 0 }]);
  const removeRow = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateRow = (idx: number, field: keyof QuoteItem, value: any) => {
    setItems(prev => {
      const copy = [...prev];
      const row = { ...copy[idx], [field]: field === 'quantity' || field === 'price' ? Number(value) : value } as QuoteItem;
      row.total = (row.quantity || 0) * (row.price || 0);
      copy[idx] = row;
      return recomputeTotals(copy);
    });
  };

  const handleProductSelect = (idx: number, itemId: string) => {
    const normalizedId = itemId ? String(itemId) : '';
    if (!normalizedId) {
      updateRow(idx, 'item_id', null);
      return;
    }

    const match = products.find((p) => String(p.id) === normalizedId);
    updateRow(idx, 'item_id', normalizedId);
    if (match) {
      updateRow(idx, 'description', match.name);
      updateRow(idx, 'price', match.price);
    }
  };

  const handleDescriptionChange = (idx: number, value: string) => {
    updateRow(idx, 'description', value);
    const match = products.find((p) => String(p.name || '').toLowerCase() === String(value || '').toLowerCase());
    if (match) {
      updateRow(idx, 'item_id', match.id);
      updateRow(idx, 'price', match.price);
    }
  };

  const save = async () => {
    try {
      if (!userId) {
        toast.error('Debes iniciar sesión para crear una cotización');
        return;
      }
      if (!customerId) {
        toast.error('Seleccione un cliente');
        return;
      }
      if (items.length === 0 || items.every(it => !it.description || !it.quantity || !it.price)) {
        toast.error('Agregue al menos una línea válida');
        return;
      }

      const customer = customers.find(c => c.id === customerId);
      const quotePayload = {
        customer_id: customerId,
        customer_name: customer?.name || '',
        customer_email: customer?.email || '',
        payment_term_id: paymentTermId || null,
        project,
        date: new Date().toISOString().slice(0, 10),
        valid_until: validUntil,
        probability,
        amount: grossSubtotal,
        tax: 0,
        total: 0,
        status: 'pending' as StatusType,
        currency: currencyCode,
        store_name: storeName || null,
        sales_rep_id: salesRepId || null,
        notes: notes || null,
        discount_type: discountType,
        discount_value: discountValue,
        total_discount: totalDiscount,
      };
      const linePayloads = items
        .filter(it => it.description && it.quantity > 0 && it.price >= 0)
        .map(it => ({ description: it.description, quantity: it.quantity, price: it.price, total: it.total }));

      await quotesService.create(userId, quotePayload, linePayloads);
      toast.success('Cotización creada exitosamente');
      onSaved();
    } catch (e) {
      console.error(e);
      toast.error('No se pudo crear la cotización');
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Cliente</label>
          <select
            value={customerId}
            onChange={e => setCustomerId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
          >
            <option value="">Seleccionar cliente...</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {selectedCustomer && (
            <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
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
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Moneda</label>
          <select
            value={currencyCode}
            onChange={e => setCurrencyCode(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
          >
            {currencies.length === 0 && (
              <option value="DOP">DOP - Peso Dominicano</option>
            )}
            {currencies.map(c => (
              <option key={c.code} value={c.code}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Nombre de Cotización</label>
          <input
            type="text"
            value={project}
            onChange={e => setProject(e.target.value)}
            placeholder="Nombre descriptivo de la cotización"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Condición de pago</label>
          <select
            value={paymentTermId ?? ''}
            onChange={e => setPaymentTermId(e.target.value || null)}
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
            value={validUntil}
            onChange={e => setValidUntil(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Probabilidad de Cierre (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={probability}
            onChange={e => setProbability(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tienda / Sucursal</label>
          {stores.length > 0 ? (
            <select
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
            >
              <option value="">Seleccionar tienda...</option>
              {stores.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
              placeholder="Ej: Tienda principal"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Vendedor (opcional)</label>
          <select
            value={salesRepId ?? ''}
            onChange={e => setSalesRepId(e.target.value || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
          >
            <option value="">Sin vendedor asignado</option>
            {salesReps.map((rep) => (
              <option key={rep.id} value={rep.id}>{rep.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de descuento global</label>
          <select
            value={discountType}
            onChange={e => setDiscountType(e.target.value as 'percentage' | 'fixed')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
          >
            <option value="percentage">Porcentaje (%)</option>
            <option value="fixed">Monto fijo</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Valor del descuento</label>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              min={0}
              step="0.01"
              value={discountValue}
              onChange={e => setDiscountValue(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <span className="text-sm text-gray-500">
              {discountType === 'percentage' ? '%' : currencyCode}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h4 className="text-md font-medium text-gray-900 mb-4">Productos/Servicios</h4>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-3">
                    <select
                      value={row.item_id ?? ''}
                      onChange={(e) => handleProductSelect(idx, e.target.value)}
                      className="w-full mb-2 px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                    >
                      <option value="">-- Seleccionar ítem de inventario (opcional) --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={row.description}
                      onChange={e => handleDescriptionChange(idx, e.target.value)}
                      placeholder="Descripción del producto/servicio"
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={e => updateRow(idx, 'quantity', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      value={row.price}
                      onChange={e => updateRow(idx, 'price', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium">{currencyCode} {formatAmount(row.total)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => removeRow(idx)} className="text-red-600 hover:text-red-800">
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addRow} className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap">
          <i className="ri-add-line mr-2"></i>
          Agregar Línea
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Términos y Condiciones</label>
          <textarea
            rows={4}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Términos y condiciones de la propuesta..."
          ></textarea>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Subtotal:</span>
              <span className="text-sm font-medium">{currencyCode} {formatAmount(grossSubtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Descuento:</span>
              <span className="text-sm font-medium">- {currencyCode} {formatAmount(totalDiscount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">ITBIS (18%):</span>
              <span className="text-sm font-medium">{currencyCode} {formatAmount(tax)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2">
              <div className="flex justify-between">
                <span className="text-base font-semibold">Total:</span>
                <span className="text-base font-semibold">{currencyCode} {formatAmount(total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 border-t border-gray-200 flex justify-end space-x-3 mt-6">
        <button onClick={onCancel} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap">Cancelar</button>
        <button onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap">Crear Cotización</button>
      </div>
    </div>
  );
}

interface Quote {
  id: string;
  customerId?: string;
  customer: string;
  customerEmail: string;
  project: string;
  amount: number;
  tax: number;
  total: number;
  status: StatusType;
  date: string;
  validUntil: string;
  probability: number;
  items: QuoteItem[];
  created_at?: string;
  currency: string;
  paymentTermId?: string | null;
  storeName?: string | null;
  salesRepId?: string | null;
  notes?: string | null;
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
}

interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
}

// Configuración de tablas
const TABLES = {
  QUOTES: 'quotes',
  CUSTOMERS: 'customers',
  SERVICES: 'services',
  QUOTE_ITEMS: 'quote_items'
};

// Verificar conexión con Supabase
const checkSupabaseConnection = async () => {
  try {
    return { connected: true, error: null };
  } catch (error) {
    console.error('Error de conexión con Supabase:', error);
    return { connected: false, error };
  }
};

export default function QuotesPage() {
  const { user } = useAuth();
  const [showNewQuoteModal, setShowNewQuoteModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const [customers, setCustomers] = useState<Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    documentType?: string | null;
    ncfType?: string | null;
    document?: string | null;
  }>>([]);
  const [services, setServices] = useState<Array<{id: string, name: string, description: string, price: number}>>([]);
  const [paymentTerms, setPaymentTerms] = useState<Array<{ id: string; name: string; days?: number }>>([]);
  const [currencies, setCurrencies] = useState<Array<{ code: string; name: string; symbol: string; is_base?: boolean; is_active?: boolean }>>([]);
  const [salesReps, setSalesReps] = useState<Array<{ id: string; name: string; is_active: boolean }>>([]);
  const [stores, setStores] = useState<Array<{ id: string; name: string; is_active?: boolean }>>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  // Estado para las cotizaciones
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [viewQuote, setViewQuote] = useState<Quote | null>(null);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);

  // Cargar datos iniciales
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        if (!user?.id) {
          toast.error('Debes iniciar sesión para ver tus cotizaciones');
          setQuotes([]);
          setCustomers([]);
          setServices([]);
          setPaymentTerms([]);
          return;
        }

        const [cust, qts, terms, currs, reps, storesData, invItems] = await Promise.all([
          customersService.getAll(user.id),
          quotesService.getAll(user.id),
          paymentTermsService.getAll(user.id),
          bankCurrenciesService.getAll(user.id),
          salesRepsService.getAll(user.id),
          storesService.getAll(user.id),
          inventoryService.getItems(user.id),
        ]);

        setCustomers((cust || []).map((c: any) => ({
          id: c.id,
          name: c.name || c.customer_name || c.full_name || c.fullname || c.company || c.company_name || 'Cliente',
          email: c.email || c.contact_email || '',
          phone: c.phone || c.contact_phone || '',
          address: c.address || c.company_address || c.billing_address || c.address_line || '',
          documentType: c.document_type || c.documentType || null,
          ncfType: c.ncf_type || c.ncfType || 'B02',
          document: c.document || null,
        })));

        const mapped = (qts || []).map((q: any) => {
          // Procesar items primero para calcular totales
          const items = (q.quote_lines || q.items || []).map((it: any) => {
            const qty = Number(it.quantity) || 0;
            const unitPrice = Number(it.unit_price) || 0;
            const lineTotal = Number(it.line_total) || qty * unitPrice;
            return {
              description: it.description || '',
              quantity: qty || 1,
              price: unitPrice,
              total: lineTotal,
            };
          });

          // Calcular totales: usar BD si tiene valor, sino calcular desde items
          const itemsSum = items.reduce((acc: number, item: { total: number }) => acc + item.total, 0);
          const subtotal = Number(q.subtotal) || Number(q.amount) || itemsSum;
          const tax = Number(q.tax_amount) || 0;
          const total = Number(q.total_amount) || (subtotal + tax) || itemsSum;

          return {
            id: q.id,
            customerId: q.customer_id || q.customers?.id || undefined,
            customer: q.customer_name || q.customers?.name || 'Cliente',
            customerEmail: q.customer_email || q.customers?.email || '',
            project: q.project || '',
            amount: subtotal,
            tax,
            total,
            currency: q.currency || 'DOP',
            status: (q.status || 'pending') as StatusType,
            date: q.date || q.created_at || new Date().toISOString(),
            validUntil: q.valid_until || q.validUntil || new Date().toISOString(),
            probability: q.probability || 0,
            items,
            paymentTermId: (q.payment_term_id as string) || null,
            storeName: (q.store_name as string) || null,
            salesRepId: (q.sales_rep_id as string) || null,
            notes: (q.notes as string) || null,
          } as Quote;
        });
        setQuotes(mapped);

        const mappedCurrencies = (currs || []).map((c: any) => ({
          code: c.code as string,
          name: c.name as string,
          symbol: c.symbol as string,
          is_base: !!c.is_base,
          is_active: c.is_active !== false,
        })).filter((c: any) => c.is_active);
        setCurrencies(mappedCurrencies);

        const mappedTerms = (terms || []).map((t: any) => ({
          id: t.id as string,
          name: t.name as string,
          days: typeof t.days === 'number' ? t.days : undefined,
        }));
        setPaymentTerms(mappedTerms);

        setSalesReps((reps || []).filter((r: any) => r.is_active));
        setStores((storesData || []).filter((s: any) => s.is_active !== false));

        const mappedProducts = (invItems || []).map((p: any) => {
          const rawPrice =
            p.selling_price ??
            p.sale_price ??
            p.unit_price ??
            p.price ??
            0;
          return {
            id: String(p.id),
            name: String(p.name || p.description || '').trim(),
            price: Number(rawPrice) || 0,
          };
        }).filter((p: any) => p.name);
        setProducts(mappedProducts);
      } catch (error) {
        console.error('Error al cargar datos:', error);
        toast.error('Error al cargar los datos');
      } finally {
        setLoading(false);
      }
    };
    loadInitialData();
  }, [user]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'under_review': return 'bg-blue-100 text-blue-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'invoiced': return 'bg-emerald-100 text-emerald-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'expired': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: {[key: string]: string} = {
      'pending': 'Pendiente',
      'under_review': 'En Revisión',
      'approved': 'Aprobada',
      'invoiced': 'Facturada',
      'rejected': 'Rechazada',
      'expired': 'Expirada'
    };
    return statusMap[status] || 'Desconocido';
  };

  const getProbabilityColor = (probability: number) => {
    if (probability >= 80) return 'text-green-600';
    if (probability >= 60) return 'text-yellow-600';
    if (probability >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  // Depuración: Mostrar los datos de cotizaciones
  console.log('Cotizaciones cargadas:', quotes);

  const filteredQuotes = quotes.filter(quote => {
    const matchesSearch = quote.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         quote.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (quote.project && quote.project.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || quote.status === statusFilter;
    const shouldShow = matchesSearch && matchesStatus;
    if (shouldShow) {
      console.log('Cotización mostrada:', quote.id, quote.customer, quote.status);
    }
    return shouldShow;
  });

  console.log('Total de cotizaciones filtradas:', filteredQuotes.length);

  const totalQuoteValue = quotes.reduce((sum, quote) => sum + quote.total, 0);
  const approvedQuoteValue = quotes.filter(q => q.status === 'approved').reduce((sum, quote) => sum + quote.total, 0);
  const pendingQuoteValue = quotes.filter(q => q.status === 'pending' || q.status === 'under_review').reduce((sum, quote) => sum + quote.total, 0);

  const handleCreateQuote = () => {
    setShowNewQuoteModal(true);
  };

  const handleExportToPdf = () => {
    try {
      // Preparar los datos para la exportación
      const columns = [
        { key: 'id', label: 'Número' },
        { key: 'customer', label: 'Cliente' },
        { key: 'project', label: 'Proyecto' },
        { key: 'date', label: 'Fecha' },
        { key: 'validUntil', label: 'Válida Hasta' },
        { key: 'total', label: 'Total' },
        { key: 'status', label: 'Estado' },
        { key: 'probability', label: 'Probabilidad (%)' }
      ];

      // Formatear los datos para la exportación
      const dataToExport = quotes.map(quote => ({
        id: quote.id,
        customer: quote.customer,
        project: quote.project || 'Sin proyecto',
        date: new Date(quote.date).toLocaleDateString('es-DO'),
        validUntil: new Date(quote.validUntil).toLocaleDateString('es-DO'),
        total: `${quote.currency} ${formatAmount(quote.total)}`,
        status: getStatusText(quote.status),
        probability: `${quote.probability}%`
      }));

      // Llamar a la función de exportación
      exportToPdf(
        dataToExport, 
        columns, 
        'cotizaciones_ventas', 
        'Reporte de Cotizaciones de Ventas'
      );
      
    } catch (error) {
      console.error('Error al exportar a PDF:', error);
      toast.error('Error al generar el PDF');
    }
  };

  const handleViewQuote = (quoteId: string) => {
    const quote = quotes.find((q) => q.id === quoteId);
    if (!quote) return;
    setViewQuote(quote);
  };

  const handleEditQuote = (quoteId: string) => {
    const quote = quotes.find((q) => q.id === quoteId);
    if (!quote) return;
    setEditingQuote({ ...quote });
  };

  const handleApproveQuote = async (quoteId: string) => {
    const quote = quotes.find((q) => q.id === quoteId);
    if (!quote || quote.status === 'approved') return;

    try {
      await quotesService.update(quoteId, { status: 'approved' });
      setQuotes((prev) => prev.map((q) => q.id === quoteId ? { ...q, status: 'approved' } : q));
      toast.success('✅ Cotización aprobada exitosamente');
    } catch (error) {
      console.error('Error al aprobar cotización', error);
      toast.error('Error al aprobar la cotización');
    }
  };

  const handlePrintQuote = async (quoteId: string) => {
    const quote = quotes.find((q) => q.id === quoteId);
    if (!quote) return;

    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      toast.error('No se pudo abrir la ventana de impresión');
      return;
    }

    let qrDataUrl = '';
    try {
      const publicToken = (quote as any).public_token || (quote as any).publicToken;
      const qrUrl = publicToken
        ? `${window.location.origin}/public/document/quote/${encodeURIComponent(String(publicToken))}`
        : `${window.location.origin}/document/quote/${encodeURIComponent(String(quote.id))}`;
      qrDataUrl = await QRCode.toDataURL(qrUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 160,
      });
    } catch {
      qrDataUrl = '';
    }

    const fullCustomer = quote.customerId
      ? customers.find((c) => String(c.id) === String(quote.customerId))
      : undefined;

    const customerDocument = (fullCustomer as any)?.document || '';
    const customerPhone = (fullCustomer as any)?.phone || '';
    const customerEmail = (fullCustomer as any)?.email || quote.customerEmail || '';
    const customerAddress = (fullCustomer as any)?.address || '';

    let companyInfo: any = null;
    try {
      companyInfo = await settingsService.getCompanyInfo();
    } catch {
      companyInfo = null;
    }

    const companyName =
      companyInfo?.name ||
      companyInfo?.company_name ||
      'ContaBi';

    const companyRnc =
      companyInfo?.rnc ||
      companyInfo?.tax_id ||
      companyInfo?.ruc ||
      '';

    const companyPhone =
      companyInfo?.phone ||
      companyInfo?.company_phone ||
      companyInfo?.contact_phone ||
      '';

    const companyEmail =
      companyInfo?.email ||
      companyInfo?.company_email ||
      companyInfo?.contact_email ||
      '';

    const companyAddress =
      companyInfo?.address ||
      companyInfo?.company_address ||
      '';

    const itemsHtml = (quote.items || [])
      .map(
        (item, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${item.description}</td>
            <td class="num">${quote.currency} ${formatAmount(item.price)}</td>
            <td class="num">${item.quantity}</td>
            <td class="num">${quote.currency} ${formatAmount(item.total)}</td>
          </tr>`
      )
      .join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Cotización ${quote.id}</title>
          <style>
            :root {
              --primary: #0b2a6f;
              --accent: #19a34a;
              --text: #111827;
              --muted: #6b7280;
              --border: #e5e7eb;
              --bg: #ffffff;
              --soft: #f3f4f6;
            }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 28px; color: var(--text); background: var(--bg); }
            .page { width: 100%; }
            .top { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; align-items: start; }
            .company { display: grid; grid-template-columns: 1fr; gap: 6px; }
            .company-name { font-weight: 800; font-size: 18px; letter-spacing: 0.2px; color: var(--primary); }
            .company-meta { font-size: 12px; color: var(--muted); line-height: 1.35; }
            .doc { text-align: right; }
            .doc-title { font-size: 34px; font-weight: 800; color: #9ca3af; letter-spacing: 1px; line-height: 1; }
            .doc-number { margin-top: 6px; font-size: 22px; font-weight: 800; color: var(--accent); }
            .doc-kv { margin-top: 10px; font-size: 12px; color: var(--muted); line-height: 1.45; }
            .qr { margin-top: 10px; width: 110px; height: 110px; }
            .section-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; margin-top: 16px; }
            .card { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: #fff; }
            .card-head { background: var(--primary); padding: 10px 12px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
            .card-head-title { font-weight: 800; font-size: 14px; color: #fff; }
            .badge { background: #fff; color: var(--primary); padding: 6px 10px; border-radius: 10px; font-weight: 800; font-size: 12px; }
            .card-body { padding: 12px; }
            .kv { display: grid; grid-template-columns: 140px 1fr; gap: 6px 10px; font-size: 12px; }
            .kv .k { color: var(--muted); }
            .kv .v { color: var(--text); font-weight: 600; }
            .table-wrap { margin-top: 18px; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
            table { width: 100%; border-collapse: collapse; }
            thead th { background: var(--primary); color: #fff; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; padding: 10px; text-align: left; }
            tbody td { border-bottom: 1px solid var(--border); padding: 10px; font-size: 12px; vertical-align: top; }
            tbody tr:last-child td { border-bottom: none; }
            .num { text-align: right; font-variant-numeric: tabular-nums; }
            .totals { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
            .totals-head { background: var(--primary); color: #fff; padding: 10px 12px; font-weight: 800; font-size: 13px; }
            .totals-body { padding: 12px; }
            .totals-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
            .totals-row:last-child { border-bottom: none; }
            .totals-row .label { color: var(--muted); font-weight: 700; }
            .totals-row .value { font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; }
            .totals-row.total .label, .totals-row.total .value { font-size: 14px; }
            .totals-row.total .value { color: var(--primary); }
            .footer-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; margin-top: 16px; }
            .notes { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
            .notes-head { background: var(--primary); color: #fff; padding: 10px 12px; font-weight: 800; font-size: 13px; }
            .notes-body { padding: 12px; color: var(--muted); font-size: 12px; line-height: 1.45; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="top">
              <div class="company">
                <div class="company-name">${companyName}</div>
                ${companyRnc ? `<div class="company-meta">RNC: ${companyRnc}</div>` : ''}
                ${companyPhone ? `<div class="company-meta">Tel: ${companyPhone}</div>` : ''}
                ${companyEmail ? `<div class="company-meta">Email: ${companyEmail}</div>` : ''}
                ${companyAddress ? `<div class="company-meta">Dirección: ${companyAddress}</div>` : ''}
              </div>
              <div class="doc">
                <div class="doc-title">COTIZACIÓN</div>
                <div class="doc-number">#${quote.id}</div>
                <div class="doc-kv">
                  <div><strong>Fecha:</strong> ${new Date(quote.date).toLocaleDateString('es-DO')}</div>
                  ${quote.validUntil ? `<div><strong>Válida hasta:</strong> ${new Date(quote.validUntil).toLocaleDateString('es-DO')}</div>` : ''}
                </div>
                ${qrDataUrl ? `<img class="qr" alt="QR" src="${qrDataUrl}" />` : ''}
              </div>
            </div>

            <div class="section-grid">
              <div class="card">
                <div class="card-head">
                  <div class="card-head-title">Cliente</div>
                  <div class="badge">${quote.customer}</div>
                </div>
                <div class="card-body">
                  <div class="kv">
                    ${customerDocument ? `<div class="k">Documento/RNC</div><div class="v">${customerDocument}</div>` : ''}
                    ${customerPhone ? `<div class="k">Teléfono</div><div class="v">${customerPhone}</div>` : ''}
                    ${customerEmail ? `<div class="k">Email</div><div class="v">${customerEmail}</div>` : ''}
                    ${customerAddress ? `<div class="k">Dirección</div><div class="v">${customerAddress}</div>` : ''}
                    ${quote.project ? `<div class="k">Nombre</div><div class="v">${quote.project}</div>` : ''}
                    <div class="k">Probabilidad</div>
                    <div class="v">${quote.probability}%</div>
                  </div>
                </div>
              </div>

              <div class="totals">
                <div class="totals-head">Resumen</div>
                <div class="totals-body">
                  <div class="totals-row"><div class="label">Subtotal</div><div class="value">${quote.currency} ${formatAmount(quote.amount)}</div></div>
                  <div class="totals-row"><div class="label">Descuento</div><div class="value">- ${quote.currency} ${formatAmount(quote.total - quote.amount)}</div></div>
                  <div class="totals-row"><div class="label">ITBIS (18%):</div><div class="value">${quote.currency} ${formatAmount(quote.tax)}</div></div>
                  <div class="totals-row"><div class="label">Impuestos</div><div class="value">${quote.currency} ${formatAmount(quote.tax)}</div></div>
                  <div class="totals-row total"><div class="label">Total</div><div class="value">${quote.currency} ${formatAmount(quote.total)}</div></div>
                </div>
              </div>
            </div>

            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style="width: 54px;">No.</th>
                    <th>Descripción</th>
                    <th class="num" style="width: 110px;">Precio</th>
                    <th class="num" style="width: 80px;">Cant.</th>
                    <th class="num" style="width: 120px;">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>
            </div>

            <div class="footer-grid">
              <div class="notes">
                <div class="notes-head">Notas</div>
                <div class="notes-body">${quote.notes ? quote.notes : 'Gracias por su interés.'}</div>
              </div>
              <div></div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(() => window.close(), 1000);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleRejectQuote = async (quoteId: string) => {
    const quote = quotes.find((q) => q.id === quoteId);
    if (!quote || quote.status === 'rejected') return;

    if (quote.status === 'invoiced') {
      toast.error('Esta cotización ya fue facturada y no se puede cancelar. Debes duplicarla para crear otra.');
      return;
    }

    if (!confirm(`¿Rechazar la cotización ${quoteId}?`)) return;

    try {
      await quotesService.update(quoteId, { status: 'rejected' });
      setQuotes((prev) => prev.map((q) => q.id === quoteId ? { ...q, status: 'rejected' } : q));
      toast.success(`Cotización ${quoteId} rechazada`);
    } catch (error) {
      console.error('Error al rechazar cotización', error);
      toast.error('Error al rechazar la cotización');
    }
  };

  const handleDeleteQuote = async (quoteId: string) => {
    const quote = quotes.find((q) => q.id === quoteId);
    if (quote?.status === 'invoiced') {
      toast.error('Esta cotización ya fue facturada y no se puede eliminar. Debes duplicarla para crear otra.');
      return;
    }
    if (!confirm(`¿Está seguro de eliminar la cotización ${quoteId}?`)) return;

    try {
      await quotesService.delete(quoteId);
      setQuotes((prev) => prev.filter((q) => q.id !== quoteId));
      toast.success(`Cotización ${quoteId} eliminada`);
    } catch (error) {
      console.error('Error al eliminar cotización', error);
      toast.error('Error al eliminar la cotización');
    }
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

        // Determinar tipo de comprobante según configuración del cliente
        const customer = customers.find((c) => c.id === quote.customerId);
        const documentType = customer?.documentType || customer?.ncfType || 'B02';

        // Obtener NCF desde la serie configurada - obligatorio
        let invoiceNumber = '';
        try {
          const nextNcf = await taxService.getNextNcf(user.id as string, documentType);
          if (nextNcf?.ncf) {
            invoiceNumber = nextNcf.ncf;
          }
        } catch {
          // No hay series NCF disponibles
        }

        if (!invoiceNumber) {
          toast.error(`No hay series NCF activas para tipo ${documentType}. Configure las series en Impuestos → NCF/E-CF antes de convertir a factura.`);
          return;
        }

        // Calcular fecha de vencimiento en base a la condición de pago, si existe
        let dueDate = quote.validUntil || todayStr;
        if (quote.paymentTermId) {
          const term = paymentTerms.find((t) => t.id === quote.paymentTermId);
          if (term && typeof term.days === 'number') {
            const base = new Date(todayStr);
            const d = new Date(base);
            d.setDate(base.getDate() + term.days);
            dueDate = d.toISOString().slice(0, 10);
          }
        }

        const invoicePayload = {
          customer_id: quote.customerId,
          invoice_number: invoiceNumber,
          invoice_date: todayStr,
          due_date: dueDate,
          currency: quote.currency,
          subtotal: quote.amount,
          tax_amount: quote.tax,
          total_amount: quote.total,
          paid_amount: 0,
          status: 'pending',
          payment_term_id: quote.paymentTermId || null,
          sales_rep_id: quote.salesRepId || null,
          store_name: quote.storeName || null,
          notes: quote.notes && quote.notes.trim().length > 0
            ? quote.notes
            : `Generada desde cotización ${quote.id}`,
        };

        const linesPayload = quote.items.map((item, index) => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.price,
          line_total: item.total,
          line_number: index + 1,
        }));

        await invoicesService.create(user.id, invoicePayload, linesPayload);

        await quotesService.update(quote.id, { status: 'invoiced' });
        setQuotes(prev => prev.map(q => q.id === quote.id ? { ...q, status: 'invoiced' } : q));

        toast.success('✅ Factura creada exitosamente');
      } catch (error) {
        console.error('Error converting quote to invoice:', error);
        toast.error('Error al convertir la cotización en factura');
      }
    })();
  };

  const handleDuplicateQuote = async (quoteId: string) => {
    const source = quotes.find((q) => q.id === quoteId);
    if (!source) return;

    if (!user?.id) {
      toast.error('Debes iniciar sesión para duplicar una cotización');
      return;
    }

    try {
      const quotePayload = {
        customer_id: source.customerId,
        customer_name: source.customer,
        customer_email: source.customerEmail,
        payment_term_id: source.paymentTermId || null,
        project: source.project,
        date: new Date().toISOString().slice(0, 10),
        valid_until: source.validUntil,
        probability: source.probability,
        amount: source.amount,
        tax: source.tax,
        total: source.total,
        status: 'pending' as StatusType,
        currency: source.currency,
        store_name: source.storeName || null,
        sales_rep_id: source.salesRepId || null,
        notes: source.notes && source.notes.trim().length > 0
          ? `${source.notes} (duplicada de ${source.id})`
          : `Duplicada desde cotización ${source.id}`,
      };

      const linePayloads = (source.items || []).map((item) => ({
        description: item.description,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
      }));

      const created: any = await quotesService.create(user.id, quotePayload, linePayloads);

      const subtotal = Number(created.subtotal) || source.amount;
      const tax = Number(created.tax_amount) || source.tax;
      const total = Number(created.total_amount) || source.total;
      const items = (created.quote_lines || source.items || []).map((it: any) => ({
        description: it.description || '',
        quantity: Number(it.quantity) || 1,
        price: Number(it.unit_price ?? it.price ?? 0) || 0,
        total: Number(it.line_total ?? it.total ?? 0) || 0,
      }));

      const duplicated: Quote = {
        id: created.id,
        customerId: created.customer_id || source.customerId,
        customer: created.customer_name || source.customer,
        customerEmail: created.customer_email || source.customerEmail,
        project: created.project || source.project,
        amount: subtotal,
        tax,
        total,
        status: (created.status || 'pending') as StatusType,
        date: created.date || created.created_at || new Date().toISOString(),
        validUntil: created.valid_until || source.validUntil,
        probability: created.probability ?? source.probability,
        items,
        created_at: created.created_at,
        currency: created.currency || source.currency,
        paymentTermId: created.payment_term_id ?? source.paymentTermId ?? null,
        storeName: created.store_name ?? source.storeName ?? null,
        salesRepId: created.sales_rep_id ?? source.salesRepId ?? null,
        notes: created.notes ?? quotePayload.notes,
      };

      setQuotes((prev) => [duplicated, ...prev]);
      toast.success(`Cotización duplicada (${duplicated.id})`);
    } catch (error) {
      console.error('Error al duplicar cotización', error);
      toast.error('Error al duplicar la cotización');
    }
  };

  const handleFollowUp = (quoteId: string) => {
    const quote = quotes.find((q) => q.id === quoteId);
    if (!quote) return;

    toast.info(`Seguimiento programado para la cotización ${quote.id} del cliente ${quote.customer}`);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-6">Cotizaciones de Ventas</h1>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cotizaciones de Ventas</h1>
            <p className="text-gray-600">Gestión de propuestas comerciales y seguimiento de oportunidades</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleExportToPdf}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap flex items-center"
            >
              <i className="ri-file-pdf-line mr-2"></i>
              Exportar PDF
            </button>
            <button
              onClick={handleCreateQuote}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-add-line mr-2"></i>
              Nueva Cotización
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
            <div className="mt-4">
              <p className="text-sm text-gray-500">Valor Total (suma nominal): {formatAmount(quotes.reduce((sum, quote) => sum + quote.total, 0))}</p>
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
            <div className="mt-4">
              <p className="text-sm text-gray-500">Valor (nominal): {formatAmount(quotes.filter(q => q.status === 'approved').reduce((sum, quote) => sum + quote.total, 0))}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">En Proceso</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {quotes.filter(q => q.status === 'pending' || q.status === 'under_review').length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-yellow-100">
                <i className="ri-time-line text-xl text-yellow-600"></i>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500">Valor (nominal): {formatAmount(quotes.filter(q => q.status === 'pending' || q.status === 'under_review').reduce((sum, quote) => sum + quote.total, 0))}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Tasa de Conversión</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {((quotes.filter(q => q.status === 'approved').length / quotes.length) * 100).toFixed(1)}%
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-purple-100">
                <i className="ri-line-chart-line text-xl text-purple-600"></i>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500">Promedio del mes</p>
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
                  placeholder="Buscar por cliente, nombre o ID..."
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
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Cotizaciones ({filteredQuotes.length})
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
                    Nombre
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
                    Probabilidad
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
                {filteredQuotes.map((quote, index) => (
                  <tr key={quote.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{index + 1}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{quote.project || 'Sin nombre'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{quote.customer}</div>
                      <div className="text-sm text-gray-500">{quote.customerEmail}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(quote.date).toLocaleDateString('es-DO')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(quote.validUntil).toLocaleDateString('es-DO')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {quote.currency} {formatAmount(quote.total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${getProbabilityColor(quote.probability)}`}>
                        {quote.probability}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(quote.status)}`}>
                        {getStatusText(quote.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleViewQuote(quote.id)}
                          className="text-blue-600 hover:text-blue-900 p-1"
                          title="Ver cotización"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        <button
                          onClick={() => handleEditQuote(quote.id)}
                          className="text-green-600 hover:text-green-900 p-1"
                          title="Editar cotización"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => { void handlePrintQuote(quote.id); }}
                          className="text-gray-600 hover:text-gray-900 p-1"
                          title="Imprimir cotización"
                        >
                          <i className="ri-printer-line"></i>
                        </button>
                        <button
                          onClick={() => handleApproveQuote(quote.id)}
                          disabled={quote.status === 'approved' || quote.status === 'invoiced'}
                          className={`p-1 ${(quote.status === 'approved' || quote.status === 'invoiced') ? 'text-green-300 cursor-not-allowed' : 'text-green-600 hover:text-green-900'}`}
                          title="Aprobar cotización"
                        >
                          <i className="ri-check-line"></i>
                        </button>
                        <button
                          onClick={() => handleRejectQuote(quote.id)}
                          disabled={quote.status === 'rejected' || quote.status === 'invoiced'}
                          className={`p-1 ${(quote.status === 'rejected' || quote.status === 'invoiced') ? 'text-red-300 cursor-not-allowed' : 'text-red-600 hover:text-red-900'}`}
                          title="Rechazar cotización"
                        >
                          <i className="ri-close-circle-line"></i>
                        </button>
                        {quote.status === 'approved' && (
                          <button
                            onClick={() => handleConvertToInvoice(quote.id)}
                            className="text-green-600 hover:text-green-900 p-1"
                            title="Convertir a factura"
                          >
                            <i className="ri-file-transfer-line"></i>
                          </button>
                        )}
                        <button
                          onClick={() => handleDuplicateQuote(quote.id)}
                          className="text-blue-600 hover:text-blue-900 p-1"
                          title="Duplicar cotización"
                        >
                          <i className="ri-file-copy-line"></i>
                        </button>
                        <button
                          onClick={() => handleDeleteQuote(quote.id)}
                          disabled={quote.status === 'invoiced'}
                          className={`p-1 ${quote.status === 'invoiced' ? 'text-red-300 cursor-not-allowed' : 'text-red-600 hover:text-red-900'}`}
                          title="Eliminar cotización"
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* View Quote Modal */}
        {viewQuote && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Detalle de Cotización</h3>
                <button
                  onClick={() => setViewQuote(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
                  <div>
                    <p><span className="font-medium">Nombre:</span> {viewQuote.project || 'Sin nombre'}</p>
                    <p><span className="font-medium">Cliente:</span> {viewQuote.customer}</p>
                    {viewQuote.customerEmail && (
                      <p><span className="font-medium">Email:</span> {viewQuote.customerEmail}</p>
                    )}
                  </div>
                  <div>
                    <p><span className="font-medium">Fecha:</span> {new Date(viewQuote.date).toLocaleDateString('es-DO')}</p>
                    <p><span className="font-medium">Válida hasta:</span> {new Date(viewQuote.validUntil).toLocaleDateString('es-DO')}</p>
                    <p><span className="font-medium">Probabilidad:</span> {viewQuote.probability}%</p>
                    <p><span className="font-medium">Estado:</span> {getStatusText(viewQuote.status)}</p>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden mt-4">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Precio</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewQuote.items || []).map((item, idx) => (
                        <tr key={idx} className="border-t border-gray-100">
                          <td className="px-4 py-2">{item.description}</td>
                          <td className="px-4 py-2">{item.quantity}</td>
                          <td className="px-4 py-2">{viewQuote.currency} {formatAmount(item.price)}</td>
                          <td className="px-4 py-2">{viewQuote.currency} {formatAmount(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={3} className="px-4 py-2 text-right font-medium">Subtotal:</td>
                        <td className="px-4 py-2 font-semibold">{viewQuote.currency} {formatAmount(viewQuote.amount)}</td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="px-4 py-2 text-right font-medium">Impuestos:</td>
                        <td className="px-4 py-2 font-semibold">{viewQuote.currency} {formatAmount(viewQuote.tax)}</td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="px-4 py-2 text-right font-semibold">Total:</td>
                        <td className="px-4 py-2 font-bold">{viewQuote.currency} {formatAmount(viewQuote.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {viewQuote.notes && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-1">Notas</h4>
                    <p className="text-sm text-gray-700 whitespace-pre-line">{viewQuote.notes}</p>
                  </div>
                )}

                <div className="flex justify-end pt-4">
                  <button
                    type="button"
                    onClick={() => setViewQuote(null)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Quote Modal */}
        {editingQuote && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Editar Cotización</h3>
                <button
                  onClick={() => setEditingQuote(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl" />
                </button>
              </div>
              <div className="p-6 space-y-4 text-sm text-gray-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                    <input
                      type="text"
                      value={editingQuote.project}
                      onChange={(e) => setEditingQuote(prev => prev ? { ...prev, project: e.target.value } : prev)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Válida hasta</label>
                    <input
                      type="date"
                      value={editingQuote.validUntil?.slice(0, 10)}
                      onChange={(e) => setEditingQuote(prev => prev ? { ...prev, validUntil: e.target.value } : prev)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Probabilidad (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={editingQuote.probability}
                      onChange={(e) => setEditingQuote(prev => prev ? { ...prev, probability: Number(e.target.value) || 0 } : prev)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                    <select
                      value={editingQuote.status}
                      onChange={(e) => setEditingQuote(prev => prev ? { ...prev, status: e.target.value as StatusType } : prev)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="pending">Pendiente</option>
                      <option value="under_review">En Revisión</option>
                      <option value="approved">Aprobada</option>
                      <option value="invoiced">Facturada</option>
                      <option value="rejected">Rechazada</option>
                      <option value="expired">Expirada</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                  <textarea
                    rows={3}
                    value={editingQuote.notes || ''}
                    onChange={(e) => setEditingQuote(prev => prev ? { ...prev, notes: e.target.value } : prev)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Notas internas o comentarios de la cotización"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingQuote(null)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!editingQuote) return;
                      try {
                        await quotesService.update(editingQuote.id, {
                          project: editingQuote.project,
                          valid_until: editingQuote.validUntil,
                          probability: editingQuote.probability,
                          status: editingQuote.status,
                          notes: editingQuote.notes ?? null,
                        });
                        setQuotes(prev => prev.map(q => q.id === editingQuote.id ? editingQuote : q));
                        toast.success(`Cotización ${editingQuote.id} actualizada`);
                        setEditingQuote(null);
                      } catch (error) {
                        console.error('Error al actualizar cotización', error);
                        toast.error('Error al actualizar la cotización');
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    Guardar cambios
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* New Quote Modal */}
        {showNewQuoteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Nueva Cotización de Ventas</h3>
                  <button
                    onClick={() => setShowNewQuoteModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>
              </div>
              <div className="p-6">
                {/* Form state for new quote */}
                <NewQuoteForm
                  customers={customers}
                  paymentTerms={paymentTerms}
                  currencies={currencies}
                  salesReps={salesReps}
                  stores={stores}
                  products={products}
                  onCancel={() => setShowNewQuoteModal(false)}
                  onSaved={async () => {
                    setShowNewQuoteModal(false);
                    // reload
                    if (user?.id) {
                      setLoading(true);
                      const qts = await quotesService.getAll(user.id);
                      const mapped = (qts || []).map((q: any) => ({
                        id: q.id,
                        customerId: q.customer_id || q.customers?.id || undefined,
                        customer: q.customer_name || q.customers?.name || 'Cliente',
                        customerEmail: q.customer_email || q.customers?.email || '',
                        project: q.project || '',
                        amount: q.amount || 0,
                        tax: q.tax || 0,
                        total: q.total || 0,
                        currency: q.currency || 'DOP',
                        status: (q.status || 'pending') as StatusType,
                        date: q.date || q.created_at || new Date().toISOString(),
                        validUntil: q.valid_until || q.validUntil || new Date().toISOString(),
                        probability: q.probability || 0,
                        items: (q.quote_lines || []).map((it: any) => ({
                          description: it.description || '',
                          quantity: it.quantity || 1,
                          price: it.price || 0,
                          total: it.total || 0,
                        }))
                      }));
                      setQuotes(mapped);
                      setLoading(false);
                    }
                  }}
                  userId={user?.id}
                />
              </div>
              {/* Actions are handled inside NewQuoteForm */}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}