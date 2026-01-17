
import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { toast } from 'sonner';
import { customersService, invoicesService, receiptsService, inventoryService, customerTypesService, cashClosingService, taxService, settingsService } from '../../services/database';
import { exportToExcelStyled } from '../../utils/exportImportUtils';
import { formatAmount, formatMoney } from '../../utils/numberFormat';
import InvoiceTypeModal from '../../components/common/InvoiceTypeModal';
import { printInvoice, type InvoiceTemplateType } from '../../utils/invoicePrintTemplates';

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  category: string;
  barcode: string;
  imageUrl: string;
  sku: string;
  cost: number;
  minStock: number;
  maxStock: number;
  description: string;
  supplier: string;
  status: 'active' | 'inactive';
}

interface CartItemExtra {
  name: string;
  price: number;
  quantity: number;
}

interface CartItem extends Product {
  quantity: number;
  total: number;
  extras?: CartItemExtra[];
}

interface Customer {
  id: string;
  name: string;
  document: string;
  phone: string;
  email: string;
  address: string;
  type: 'regular' | 'vip';
  customerTypeId?: string | null;
  paymentTermId?: string | null;
}

interface Sale {
  id: string;
  date: string;
  time: string;
  customer: Customer | null;
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  amountReceived: number;
  change: number;
  status: 'completed' | 'cancelled' | 'refunded';
  cashier: string;
}

export default function POSPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [categories, setCategories] = useState<string[]>(['all']);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    document: '',
    phone: '',
    email: '',
    address: '',
    type: 'regular' as 'regular' | 'vip'
  });
  const [showEditCustomerModal, setShowEditCustomerModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
  const [customerTypes, setCustomerTypes] = useState<any[]>([]);
  const [cashDenominations, setCashDenominations] = useState(
    [2000, 1000, 500, 200, 100, 50, 25, 10, 5, 1].map((value) => ({
      value,
      quantity: '',
    }))
  );
  const [cashClosingNotes, setCashClosingNotes] = useState('');
  const [savingCashClosing, setSavingCashClosing] = useState(false);
  const [taxConfig, setTaxConfig] = useState<{ itbis_rate: number } | null>(null);

  // View mode: 'simple' | 'normal' | 'custom'
  const [viewMode, setViewMode] = useState<'simple' | 'normal' | 'custom'>('normal');
  
  // Modal for product details (Simple mode)
  const [showProductDetailModal, setShowProductDetailModal] = useState(false);
  const [selectedProductDetail, setSelectedProductDetail] = useState<Product | null>(null);
  const [simpleAddQuantity, setSimpleAddQuantity] = useState(1);
  
  // Modal for product customization (Custom mode)
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [customizeProduct, setCustomizeProduct] = useState<Product | null>(null);
  const [customizeQuantity, setCustomizeQuantity] = useState(1);
  const [productExtras, setProductExtras] = useState<{ name: string; price: number; quantity: number }[]>([]);

  // Modal for configuring which products can be extras (Modelo)
  const [showModeloModal, setShowModeloModal] = useState(false);
  const [availableExtras, setAvailableExtras] = useState<string[]>([]); // IDs of products that can be extras

  // Print type modal state
  const [showPrintTypeModal, setShowPrintTypeModal] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

  // Load available extras from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pos_available_extras');
      if (saved) {
        setAvailableExtras(JSON.parse(saved));
      }
    } catch {}
  }, []);

  // Save available extras to localStorage when changed
  const saveAvailableExtras = (extras: string[]) => {
    setAvailableExtras(extras);
    try {
      localStorage.setItem('pos_available_extras', JSON.stringify(extras));
    } catch {}
  };

  const currentItbisRate = taxConfig?.itbis_rate ?? 18;
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6; // 3 columnas x 2 filas

  // Helpers: input masks
  const formatDocument = (raw: string) => {
    const digits = (raw || '').replace(/\D/g, '').slice(0, 11);
    // Pattern: ###-#######-#
    const parts: string[] = [];
    if (digits.length <= 3) return digits;
    parts.push(digits.slice(0, 3));
    if (digits.length <= 10) {
      parts.push(digits.slice(3));
      return parts.join('-');
    }
    parts.push(digits.slice(3, 10));
    parts.push(digits.slice(10));
    return parts.join('-');
  };

  const formatPhone = (raw: string) => {
    const digits = (raw || '').replace(/\D/g, '').slice(0, 10);
    // Pattern: ###-###-####
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0,3)}-${digits.slice(3)}`;
    return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  };

  const money = (value: number | string | null | undefined) => formatMoney(value);

  const formatAmountInput = (raw: string): string => {
    const cleaned = String(raw ?? '').replace(/\s+/g, '');
    if (!cleaned) return '';

    const unsigned = cleaned.replace(/[^0-9.]/g, '');
    const firstDot = unsigned.indexOf('.');
    const intPart = firstDot === -1 ? unsigned : unsigned.slice(0, firstDot);
    const rest = firstDot === -1 ? '' : unsigned.slice(firstDot + 1);

    const intNormalized = intPart.replace(/^0+(?=\d)/, '');
    const intWithCommas = intNormalized.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decimals = rest.replace(/\./g, '').slice(0, 2);

    const hasDot = firstDot !== -1;
    return hasDot ? `${intWithCommas}.${decimals}` : intWithCommas;
  };

  const parseAmountInput = (formatted: string): number => {
    const normalized = String(formatted ?? '').replace(/,/g, '').trim();
    if (!normalized) return 0;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  };

  const handleAmountReceivedChange = (raw: string) => {
    setAmountReceived(formatAmountInput(raw));
  };

  const handleCashDenominationChange = (index: number, raw: string) => {
    const cleaned = raw.replace(/[^0-9]/g, '');
    setCashDenominations((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], quantity: cleaned };
      return next;
    });
  };

  useEffect(() => {
    if (showPaymentModal) {
      // Pequeño delay para asegurar que el input exista en el DOM antes de enfocar
      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 0);
    }
  }, [showPaymentModal, amountReceived]);

  const anyModalOpen =
    showCustomerModal ||
    showPaymentModal ||
    showNewCustomerModal ||
    showEditCustomerModal;

  useEffect(() => {
    document.body.style.overflow = anyModalOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [anyModalOpen]);

  // Close Customers modals when navigating away from Customers tab
  useEffect(() => {
    if (activeTab !== 'customers') {
      setShowEditCustomerModal(false);
      setShowNewCustomerModal(false);
    }
  }, [activeTab]);

  const Modal = ({ children }: { children: ReactNode }) =>
    createPortal(
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative w-full max-w-lg">{children}</div>
      </div>,
      document.body
    );

  // Load data (productos desde Supabase si hay usuario; si no, desde localStorage)
  useEffect(() => {
    loadProducts();
    loadSales();
    loadCustomers();

    const onProductsUpdated = () => {
      loadProducts();
    };
    window.addEventListener('productsUpdated', onProductsUpdated);
    return () => {
      window.removeEventListener('productsUpdated', onProductsUpdated);
    };
  }, []);

  // When auth user becomes available, recargar datos desde Supabase
  useEffect(() => {
    if (user?.id) {
      loadProducts();
      loadSales();
      loadCustomers();
    }
  }, [user?.id]);

  useEffect(() => {
    const loadCustomerTypes = async () => {
      if (!user?.id) {
        setCustomerTypes([]);
        return;
      }
      try {
        const types = await customerTypesService.getAll(user.id);
        setCustomerTypes(types || []);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[POS] Error loading customer types', error);
      }
    };
    loadCustomerTypes();
  }, [user?.id]);

  useEffect(() => {
    const loadTaxConfig = async () => {
      if (!user?.id) {
        setTaxConfig(null);
        return;
      }
      try {
        const data = await taxService.getTaxConfiguration();
        if (data && typeof data.itbis_rate === 'number') {
          setTaxConfig({ itbis_rate: data.itbis_rate });
        } else {
          setTaxConfig({ itbis_rate: 18 });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[POS] Error loading tax configuration', error);
        setTaxConfig({ itbis_rate: 18 });
      }
    };
    loadTaxConfig();
  }, [user?.id]);

  const loadProducts = async () => {
    try {
      if (user?.id) {
        // Cargar productos reales desde inventario (Supabase)
        const items: any[] = await inventoryService.getItems(user.id);
        const mapped: Product[] = (items || []).map((it: any) => ({
          id: it.id,
          name: it.name || '',
          price: Number(it.selling_price) || 0,
          stock: Number(it.current_stock) || 0,
          category: it.category || '',
          barcode: it.barcode || '',
          imageUrl: it.image_url || '',
          sku: it.sku || '',
          cost: Number(it.cost_price) || 0,
          minStock: Number(it.minimum_stock) || 0,
          maxStock: Number(it.maximum_stock) || 0,
          description: it.description || '',
          supplier: it.supplier || '',
          status: it.is_active === false ? 'inactive' : 'active',
        }));

        const activeProducts = mapped.filter(p => p.status === 'active');
        setProducts(activeProducts);

        // Derivar categorías desde los productos activos
        const names = Array.from(new Set(activeProducts.map(p => p.category).filter(Boolean)));
        setCategories(['all', ...names]);
      } else {
        // Sin usuario: mantener comportamiento anterior basado en localStorage
        const savedProducts = localStorage.getItem('contabi_products');
        if (savedProducts) {
          const parsedProducts = JSON.parse(savedProducts) as Product[];
          const activeProducts = parsedProducts.filter((product) => product.status === 'active');
          setProducts(activeProducts);
          const names = Array.from(new Set(activeProducts.map(p => p.category).filter(Boolean)));
          setCategories(['all', ...names]);
        } else {
          setProducts([]);
          setCategories(['all']);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[POS] Error loading products, falling back to localStorage', error);
      const savedProducts = localStorage.getItem('contabi_products');
      if (savedProducts) {
        const parsedProducts = JSON.parse(savedProducts) as Product[];
        const activeProducts = parsedProducts.filter((product) => product.status === 'active');
        setProducts(activeProducts);
        const names = Array.from(new Set(activeProducts.map(p => p.category).filter(Boolean)));
        setCategories(['all', ...names]);
      } else {
        setProducts([]);
        setCategories(['all']);
      }
    }
  };

  const loadSales = async () => {
    const savedSales = localStorage.getItem('contabi_pos_sales');
    const localSales: Sale[] = savedSales ? JSON.parse(savedSales) : [];

    try {
      if (user?.id) {
        const invoices: any[] = await invoicesService.getAll(user.id);
        const posInvoices = (invoices || []).filter((inv: any) =>
          (inv.invoice_number || '').startsWith('POS-')
        );

        const mappedSales: Sale[] = posInvoices.map((inv: any) => {
          const createdAt: string | undefined = inv.created_at || undefined;
          const date = inv.invoice_date || (createdAt ? createdAt.split('T')[0] : '');
          const time = createdAt ? createdAt.split('T')[1]?.slice(0, 8) || '00:00:00' : '00:00:00';

          const customer: Customer | null = inv.customers
            ? {
                id: inv.customers.id,
                name: inv.customers.name || 'Cliente',
                document: inv.customers.document || '',
                phone: inv.customers.phone || '',
                email: inv.customers.email || '',
                address: inv.customers.address || '',
                type: 'regular',
              }
            : null;

          const items: CartItem[] = (inv.invoice_lines || []).map((line: any) => ({
            id: line.inventory_items?.id || line.inventory_item_id || line.id,
            name: line.inventory_items?.name || line.description || 'Producto',
            price: line.unit_price || line.price || 0,
            stock: 0,
            category: '',
            barcode: '',
            imageUrl: '',
            sku: '',
            cost: 0,
            minStock: 0,
            maxStock: 0,
            description: '',
            supplier: '',
            status: 'active',
            quantity: line.quantity || 1,
            total: line.line_total || (line.quantity || 1) * (line.unit_price || 0),
          }));

          return {
            id: inv.invoice_number || inv.id,
            date,
            time,
            customer,
            items,
            subtotal: inv.subtotal ?? 0,
            tax: inv.tax_amount ?? 0,
            total: inv.total_amount ?? 0,
            paymentMethod: 'cash',
            amountReceived: inv.total_amount ?? 0,
            change: 0,
            status: inv.status === 'cancelled' ? 'cancelled' : 'completed',
            cashier: 'POS',
          } as Sale;
        });

        // Merge local + DB sales (prefer DB when same id)
        const byId = new Map<string, Sale>();
        (localSales || []).forEach((s) => byId.set(String(s.id), s));
        (mappedSales || []).forEach((s) => byId.set(String(s.id), s));
        setSales(Array.from(byId.values()));
        return;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[POS] Error loading sales from invoices, falling back to localStorage', error);
    }

    setSales(localSales || []);
  };

  const loadCustomers = async () => {
    try {
      if (user?.id) {
        const rows = await customersService.getAll(user.id);
        let mapped: Customer[] = (rows || []).map((c: any) => ({
          id: c.id,
          name: c.name || c.customer_name || 'Cliente',
          document: c.document || c.tax_id || '',
          phone: c.phone || c.contact_phone || '',
          email: c.email || c.contact_email || '',
          address: c.address || '',
          type: (c.type === 'vip' ? 'vip' : 'regular') as 'regular' | 'vip',
          customerTypeId: c.customerType || null,
          paymentTermId: c.paymentTermId || null,
        }));

        let general = mapped.find((c) => String(c.name || '').trim().toLowerCase() === 'general customer');
        if (!general) {
          try {
            const created: any = await customersService.create(user.id, {
              name: 'General Customer',
              document: '',
              phone: '',
              email: '',
              address: '',
              creditLimit: 0,
              status: 'active',
            });

            if (created?.id) {
              general = {
                id: created.id,
                name: created.name || 'General Customer',
                document: created.document || '',
                phone: created.phone || '',
                email: created.email || '',
                address: created.address || '',
                type: 'regular',
                customerTypeId: null,
                paymentTermId: null,
              } as Customer;
              mapped = [general, ...mapped];
            }
          } catch (e) {
            console.warn('Could not create General Customer in DB:', e);
          }
        }

        setCustomers(mapped);

        if (!selectedCustomer) {
          const fallbackGeneral = general || mapped.find((c) => String(c.name || '').trim().toLowerCase() === 'general customer');
          if (fallbackGeneral) setSelectedCustomer(fallbackGeneral);
        }
      } else {
        const savedCustomers = localStorage.getItem('contabi_pos_customers');
        const parsed: Customer[] = savedCustomers ? JSON.parse(savedCustomers) : [];

        let general = parsed.find((c) => String(c.name || '').trim().toLowerCase() === 'general customer');
        if (!general) {
          general = {
            id: 'general',
            name: 'General Customer',
            document: '',
            phone: '',
            email: '',
            address: '',
            type: 'regular',
          } as Customer;
          parsed.unshift(general);
          localStorage.setItem('contabi_pos_customers', JSON.stringify(parsed));
        }

        setCustomers(parsed);
        if (!selectedCustomer && general) setSelectedCustomer(general);
      }
    } catch (e) {
      console.warn('loadCustomers failed, using localStorage fallback');
      const savedCustomers = localStorage.getItem('contabi_pos_customers');
      const parsed: Customer[] = savedCustomers ? JSON.parse(savedCustomers) : [];
      let general = parsed.find((c) => String(c.name || '').trim().toLowerCase() === 'general customer');
      if (!general) {
        general = {
          id: 'general',
          name: 'General Customer',
          document: '',
          phone: '',
          email: '',
          address: '',
          type: 'regular',
        } as Customer;
        parsed.unshift(general);
        localStorage.setItem('contabi_pos_customers', JSON.stringify(parsed));
      }
      setCustomers(parsed);
      if (!selectedCustomer && general) setSelectedCustomer(general);
    }
  };

  // categories now managed via state from real data

  // For POS grid: exclude extras (they only appear as add-ons in Custom mode)
  const filteredProducts = products.filter(product => {
    const isExtra = availableExtras.includes(product.id);
    if (isExtra) return false;
    
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.barcode.includes(searchTerm) ||
                         product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // For Inventory view: show ALL products including extras
  const filteredProductsForInventory = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.barcode.includes(searchTerm) ||
                         product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Paginación de productos
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  // Resetear página cuando cambian filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory]);

  const addToCart = (product: Product, quantity: number = 1) => {
    // Validar que haya stock disponible
    if (product.stock <= 0) {
      toast.error(`No stock available for "${product.name}"`);
      return;
    }

    const requestedQty = Math.max(1, Math.floor(Number(quantity) || 1));

    setCart((prev) => {
      const existingItem = prev.find(item => item.id === product.id);
      const currentQty = existingItem?.quantity ?? 0;
      const allowedToAdd = Math.max(0, Math.min(requestedQty, product.stock - currentQty));

      if (allowedToAdd <= 0) {
        toast.warning(`Maximum stock reached for "${product.name}" (${product.stock} available)`);
        return prev;
      }

      if (existingItem) {
        return prev.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + allowedToAdd, total: (item.quantity + allowedToAdd) * item.price }
            : item
        );
      }

      return [...prev, { ...product, quantity: allowedToAdd, total: allowedToAdd * product.price }];
    });
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(id);
      return;
    }

    const product = products.find(p => p.id === id);
    if (!product) return;

    // Validar que no se exceda el stock disponible
    if (quantity > product.stock) {
      toast.error(`Insufficient stock. Only ${product.stock} units available of "${product.name}"`);
      return;
    }

    setCart(cart.map(item =>
      item.id === id
        ? { ...item, quantity, total: quantity * item.price }
        : item
    ));
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const deleteProduct = (productId: string) => {
    if (!confirm('Delete this product from Point of Sale? This action only affects products saved on this device.')) {
      return;
    }
    try {
      const savedProducts = JSON.parse(localStorage.getItem('contabi_products') || '[]') as Product[];
      const next = savedProducts.filter(p => p.id !== productId);
      localStorage.setItem('contabi_products', JSON.stringify(next));
      setProducts(prev => prev.filter(p => p.id !== productId));
      window.dispatchEvent(new CustomEvent('productsUpdated'));
      alert('Product deleted from Point of Sale.');
    } catch (error) {
      console.error('Error deleting POS product:', error);
      alert('Could not delete the product.');
    }
  };

  const getSelectedCustomerType = () => {
    if (!selectedCustomer || !selectedCustomer.customerTypeId) return null;
    return customerTypes.find((t: any) => t.id === selectedCustomer.customerTypeId) || null;
  };

  const getRawSubtotal = () => cart.reduce((sum, item) => sum + item.total, 0);
  const getDiscountAmount = () => {
    const type = getSelectedCustomerType();
    if (!type || !type.fixedDiscount) return 0;
    const rate = Number(type.fixedDiscount) || 0;
    if (rate <= 0) return 0;
    return getRawSubtotal() * (rate / 100);
  };
  const getSubtotal = () => getRawSubtotal() - getDiscountAmount();
  const getTax = () => {
    const type = getSelectedCustomerType();
    if (type && type.noTax) return 0;
    return getSubtotal() * (currentItbisRate / 100);
  };
  const getTotal = () => getSubtotal() + getTax();

  const processPayment = async () => {
    if (!selectedCustomer) {
      alert('You must select a customer before processing the sale');
      return;
    }

    if (!paymentMethod) {
      alert('You must select the payment method');
      return;
    }

    const total = getTotal();
    const received = parseAmountInput(amountReceived) || total;
    
    if (received >= total || paymentMethod !== 'cash') {
      const newSale: Sale = {
        id: `SALE-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0],
        customer: selectedCustomer,
        items: [...cart],
        subtotal: getSubtotal(),
        tax: getTax(),
        total: total,
        paymentMethod,
        amountReceived: received,
        change: paymentMethod === 'cash' ? received - total : 0,
        status: 'completed',
        cashier: 'Admin'
      };

      // Update sales locally (sólo como historial rápido en este dispositivo)
      // Guardamos máximo 500 ventas y protegemos contra QuotaExceededError
      const updatedSales = [newSale, ...sales].slice(0, 500);
      setSales(updatedSales);
      try {
        localStorage.setItem('contabi_pos_sales', JSON.stringify(updatedSales));
      } catch (error) {
        // Si el storage está lleno, no interrumpir el flujo del POS
        // eslint-disable-next-line no-console
        console.error('[POS] Error saving contabi_pos_sales to localStorage (ignorado):', error);
      }

      // If logged in and a concrete customer is selected, create AR invoice/receipt in Supabase
      if (user?.id && selectedCustomer) {
        try {
          let customerForAr: Customer | null = selectedCustomer;
          if (customerForAr && !isUuid(String(customerForAr.id || ''))) {
            // Ensure we never send a non-UUID customer_id to Supabase
            const rows = await customersService.getAll(user.id);
            let generalDb = (rows || []).find((c: any) => String(c?.name || '').trim().toLowerCase() === 'general customer');
            if (!generalDb) {
              try {
                generalDb = await customersService.create(user.id, {
                  name: 'General Customer',
                  document: '',
                  phone: '',
                  email: '',
                  address: '',
                  creditLimit: 0,
                  status: 'active',
                });
              } catch (e) {
                console.warn('[POS] Could not create General Customer in DB:', e);
              }
            }

            if (generalDb?.id && isUuid(String(generalDb.id))) {
              customerForAr = {
                id: String(generalDb.id),
                name: String(generalDb.name || 'General Customer'),
                document: String(generalDb.document || ''),
                phone: String(generalDb.phone || ''),
                email: String(generalDb.email || ''),
                address: String(generalDb.address || ''),
                type: 'regular',
                customerTypeId: (generalDb as any).customerType || null,
                paymentTermId: (generalDb as any).paymentTermId || null,
              } as Customer;
              setSelectedCustomer(customerForAr);
            } else {
              // Can't safely create AR records without a valid UUID
              throw new Error('No valid customer UUID available for Accounts Receivable');
            }
          }

          const todayStr = newSale.date;
          const invoiceNumber = `POS-${Date.now()}`;

          const isImmediatePayment = ['cash', 'card', 'transfer'].includes(newSale.paymentMethod);

          let dueDateStr = todayStr;
          const type = getSelectedCustomerType();
          if (type && typeof type.allowedDelayDays === 'number' && type.allowedDelayDays > 0) {
            const base = new Date(todayStr);
            const d = new Date(base);
            d.setDate(base.getDate() + type.allowedDelayDays);
            dueDateStr = d.toISOString().slice(0, 10);
          }

          const invoicePayload = {
            customer_id: customerForAr.id,
            invoice_number: invoiceNumber,
            invoice_date: todayStr,
            due_date: dueDateStr,
            currency: 'DOP',
            subtotal: newSale.subtotal,
            tax_amount: newSale.tax,
            total_amount: newSale.total,
            paid_amount: isImmediatePayment ? newSale.total : 0,
            status: isImmediatePayment ? 'paid' : 'pending',
            notes: `POS Sale ${newSale.id}`,
          };

          // Enlazar líneas de factura con ítems de inventario cuando el id sea un UUID válido.
          // Esto permite que invoicesService.create calcule el Costo de Ventas (COGS) y
          // genere el asiento contable Costo de Ventas vs Inventario.
          const linesPayload: { description: string; quantity: number; unit_price: number; line_total: number; item_id: string | null }[] = [];
          
          for (const item of newSale.items) {
            const itemId = isUuid(item.id) ? item.id : null;
            
            // Add main product line
            linesPayload.push({
              description: item.name,
              quantity: item.quantity,
              unit_price: item.price,
              line_total: item.price * item.quantity,
              item_id: itemId,
            });
            
            // Add extras as separate lines (indented with arrow to show they're add-ons)
            if (item.extras && item.extras.length > 0) {
              for (const extra of item.extras) {
                // Find the extra product to get its ID for inventory tracking
                const extraProduct = products.find(p => p.name === extra.name);
                const extraItemId = extraProduct && isUuid(extraProduct.id) ? extraProduct.id : null;
                
                linesPayload.push({
                  description: `  ↳ ${extra.name} (extra)`,
                  quantity: extra.quantity,
                  unit_price: extra.price,
                  line_total: extra.price * extra.quantity,
                  item_id: extraItemId,
                });
              }
            }
          }

          const created = await invoicesService.create(user.id, invoicePayload, linesPayload, { skipPeriodValidation: true });

          // Create receipt only when sale is fully paid (which is the only case permitido ahora)
          const receiptNumber = `REC-${Date.now()}`;
          await receiptsService.create(user.id, {
            customer_id: customerForAr.id,
            receipt_number: receiptNumber,
            receipt_date: todayStr,
            amount: newSale.total,
            payment_method: newSale.paymentMethod,
            reference: newSale.id,
            concept: `POS sale payment ${created.invoice.invoice_number}`,
            status: 'active',
          });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[POS] Error creando factura/recibo en CxC', error);
          // Sale is still saved locally, just log any AR/receipt errors
        }
      }

      // Update product stock in local POS cache
      const updatedProducts = products.map(product => {
        const cartItem = cart.find(item => item.id === product.id);
        if (cartItem) {
          return { ...product, stock: product.stock - cartItem.quantity };
        }
        return product;
      });
      
      const allProducts = JSON.parse(localStorage.getItem('contabi_products') || '[]');
      const finalProducts = allProducts.map((product: Product) => {
        const updatedProduct = updatedProducts.find(p => p.id === product.id);
        return updatedProduct || product;
      });
      
      localStorage.setItem('contabi_products', JSON.stringify(finalProducts));
      window.dispatchEvent(new CustomEvent('productsUpdated'));

      // If logged in, also sync stock and movements with Inventory module in Supabase
      if (user?.id) {
        try {
          for (const cartItem of cart) {
            const current = products.find(p => p.id === cartItem.id);
            // Solo sincronizar con Supabase cuando el id del producto sea un UUID válido
            if (!current || !isUuid(current.id)) {
              // eslint-disable-next-line no-console
              console.warn('[POS] Skipping inventory sync for non-UUID product id', current?.id ?? cartItem.id);
              continue;
            }

            // 1) Update inventory item stock
            const newStock = (current.stock ?? 0) - cartItem.quantity;
            await inventoryService.updateItem(user.id, current.id, {
              current_stock: newStock < 0 ? 0 : newStock,
            });

            // 2) Create inventory movement (exit)
            await inventoryService.createMovement(user.id, {
              item_id: current.id,
              movement_type: 'exit',
              quantity: cartItem.quantity,
              unit_cost: cartItem.cost ?? 0,
              movement_date: newSale.date,
              reference: newSale.id,
              total_cost: (cartItem.quantity || 0) * (cartItem.cost ?? 0),
              notes: `Exit from POS sale ${newSale.id}`,
              source_type: 'pos_sale',
              source_id: null,
              source_number: newSale.id,
            });
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[POS] Error syncing inventory from POS sale', error);
          alert('The sale was registered, but there was a problem updating inventory in the database. Check the Inventory module.');
        }
      }
      
      // Store the completed sale and open print modal
      setCompletedSale(newSale);
      setShowPrintTypeModal(true);
      
      setCart([]);
      setSelectedCustomer(null);
      setAmountReceived('');
      setPaymentMethod('');
      setShowPaymentModal(false);
      loadProducts();
    } else {
      alert('Insufficient amount');
    }
  };

  const handlePrintTypeSelect = async (type: InvoiceTemplateType) => {
    if (!completedSale) return;
    
    const saleData = {
      invoiceNumber: completedSale.id,
      date: completedSale.date,
      dueDate: completedSale.date,
      amount: completedSale.total,
      subtotal: completedSale.subtotal,
      tax: completedSale.tax,
      items: completedSale.items.map(item => ({
        description: item.name + (item.extras?.length ? ` + ${item.extras.map(e => e.name).join(', ')}` : ''),
        quantity: item.quantity,
        price: item.price,
        total: item.total,
      })),
    };
    const customerData = {
      name: completedSale.customer?.name || 'Customer',
      document: completedSale.customer?.document,
      phone: completedSale.customer?.phone,
      email: completedSale.customer?.email,
      address: completedSale.customer?.address,
    };
    let companyInfo: any = null;
    try { companyInfo = await settingsService.getCompanyInfo(); } catch { companyInfo = null; }
    const companyData = {
      name: companyInfo?.name || companyInfo?.company_name || 'Send Bill Now',
      rnc: companyInfo?.rnc || companyInfo?.tax_id || '',
      phone: companyInfo?.phone || '',
      email: companyInfo?.email || '',
      address: companyInfo?.address || '',
      logo: companyInfo?.logo,
    };

    printInvoice(saleData, customerData, companyData, type);
    setCompletedSale(null);
  };

  const addNewCustomer = async () => {
    if (!newCustomer.name || !newCustomer.document) {
      alert('Name and document are required');
      return;
    }

    // Basic validation (allow phone empty)
    const docOk = /^\d{3}-\d{7}-\d$/.test(newCustomer.document);
    const phoneOk = !newCustomer.phone || /^\d{3}-\d{3}-\d{4}$/.test(newCustomer.phone);
    if (!docOk) {
      alert('Invalid document. Expected format: 000-0000000-0');
      return;
    }
    if (!phoneOk) {
      alert('Invalid phone. Expected format: 000-000-0000');
      return;
    }

    if (user?.id) {
      try {
        await customersService.create(user.id, {
          name: newCustomer.name,
          document: newCustomer.document,
          phone: newCustomer.phone,
          email: newCustomer.email,
          address: newCustomer.address,
          creditLimit: 0,
          status: 'active',
        });
        await loadCustomers();
      } catch (error) {
        console.error('Error creating customer in DB, falling back to localStorage:', error);
        const customer: Customer = { id: Date.now().toString(), ...newCustomer };
        const updatedCustomers = [...customers, customer];
        setCustomers(updatedCustomers);
        localStorage.setItem('contabi_pos_customers', JSON.stringify(updatedCustomers));
      }
    } else {
      const customer: Customer = { id: Date.now().toString(), ...newCustomer };
      const updatedCustomers = [...customers, customer];
      setCustomers(updatedCustomers);
      localStorage.setItem('contabi_pos_customers', JSON.stringify(updatedCustomers));
    }
    
    setNewCustomer({
      name: '',
      document: '',
      phone: '',
      email: '',
      address: '',
      type: 'regular'
    });
    setShowNewCustomerModal(false);
    alert('Customer added successfully');
  };


  const saveEditedCustomer = async () => {
    if (!editCustomer) return;
    if (!editCustomer.name || !editCustomer.document) {
      alert('Name and document are required');
      return;
    }
    try {
      if (user?.id && isUuid(editCustomer.id)) {
        await customersService.update(editCustomer.id, {
          name: editCustomer.name,
          document: editCustomer.document,
          phone: editCustomer.phone,
          email: editCustomer.email,
          address: editCustomer.address,
          creditLimit: 0,
          status: 'active',
        });
        await loadCustomers();
      } else {
        const savedCustomers = JSON.parse(localStorage.getItem('contabi_pos_customers') || '[]') as Customer[];
        const next = savedCustomers.map(c => (c.id === editCustomer.id ? editCustomer : c));
        localStorage.setItem('contabi_pos_customers', JSON.stringify(next));
        setCustomers(next);
      }
      if (selectedCustomer?.id === editCustomer.id) setSelectedCustomer(editCustomer);
      setShowEditCustomerModal(false);
      alert('Customer updated');
    } catch (error) {
      console.error('Error updating POS customer:', error);
      // Fallback local even if logged in
      try {
        const savedCustomers = JSON.parse(localStorage.getItem('contabi_pos_customers') || '[]') as Customer[];
        const next = savedCustomers.map(c => (c.id === (editCustomer as Customer).id ? (editCustomer as Customer) : c));
        localStorage.setItem('contabi_pos_customers', JSON.stringify(next));
        setCustomers(next);
        if (selectedCustomer?.id === (editCustomer as Customer).id) setSelectedCustomer(editCustomer as Customer);
        setShowEditCustomerModal(false);
        alert('Customer updated (local mode)');
      } catch (e2) {
        alert('Could not update customer.');
      }
    }
  };

  const getTodayStats = () => {
    const today = new Date().toISOString().split('T')[0];
    const todaySales = sales.filter(sale => sale.date === today && sale.status === 'completed');
    
    return {
      totalSales: todaySales.length,
      totalAmount: todaySales.reduce((sum, sale) => sum + sale.total, 0),
      cashSales: todaySales.filter(sale => sale.paymentMethod === 'cash').length,
      cardSales: todaySales.filter(sale => sale.paymentMethod === 'card').length,
      transferSales: todaySales.filter(sale => sale.paymentMethod === 'transfer').length
    };
  };

  const getTopProducts = () => {
    const productSales: { [key: string]: { name: string; quantity: number; revenue: number } } = {};
    
    sales.forEach(sale => {
      if (sale.status === 'completed') {
        sale.items.forEach(item => {
          if (productSales[item.id]) {
            productSales[item.id].quantity += item.quantity;
            productSales[item.id].revenue += item.total;
          } else {
            productSales[item.id] = {
              name: item.name,
              quantity: item.quantity,
              revenue: item.total
            };
          }
        });
      }
    });

    return Object.values(productSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  };

  const exportSalesReport = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const rows = sales.map(sale => ({
        id: sale.id,
        date: sale.date,
        time: sale.time,
        customer: sale.customer?.name || 'Cliente General',
        subtotal: sale.subtotal || 0,
        tax: sale.tax || 0,
        total: sale.total || 0,
        paymentMethod: sale.paymentMethod,
        status: sale.status,
        cashier: sale.cashier || '—',
      }));
      await exportToExcelStyled(
        rows,
        [
          { key: 'id', title: 'Sale ID', width: 20 },
          { key: 'date', title: 'Date', width: 12 },
          { key: 'time', title: 'Time', width: 10 },
          { key: 'customer', title: 'Customer', width: 28 },
          { key: 'subtotal', title: 'Subtotal', width: 14, numFmt: '#,##0.00' },
          { key: 'tax', title: 'Tax', width: 14, numFmt: '#,##0.00' },
          { key: 'total', title: 'Total', width: 14, numFmt: '#,##0.00' },
          { key: 'paymentMethod', title: 'Payment Method', width: 16 },
          { key: 'status', title: 'Status', width: 12 },
          { key: 'cashier', title: 'Cashier', width: 14 },
        ],
        `sales_report_${today}`,
        'Sales'
      );
    } catch (error) {
      console.error('Error exporting POS sales report:', error);
      alert('Error exporting report to Excel');
    }
  };

  const renderDashboard = () => {
    const todayStats = getTodayStats();
    const topProducts = getTopProducts();

    return (
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-gradient-to-br from-white to-[#f8f6f0] p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-[#e8e0d0] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center">
              <div className="w-14 h-14 bg-gradient-to-br from-[#008000] to-[#006600] rounded-xl flex items-center justify-center shadow-lg shadow-[#008000]/30">
                <i className="ri-shopping-cart-line text-white text-2xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-[#6b5c3b]">Sales Today</p>
                <p className="text-3xl font-bold text-[#2f3e1e] drop-shadow-sm">{todayStats.totalSales}</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-[#f0f5e8] p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-[#d8e4c8] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center">
              <div className="w-14 h-14 bg-gradient-to-br from-[#4a7c23] to-[#3a6218] rounded-xl flex items-center justify-center shadow-lg shadow-[#4a7c23]/30">
                <i className="ri-money-dollar-circle-line text-white text-2xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-[#6b5c3b]">Revenue Today</p>
                <p className="text-3xl font-bold text-[#2f3e1e] drop-shadow-sm">{money(todayStats.totalAmount)}</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-[#f5f0e5] p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-[#e8dcc5] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center">
              <div className="w-14 h-14 bg-gradient-to-br from-[#7a8c45] to-[#5f6d35] rounded-xl flex items-center justify-center shadow-lg shadow-[#7a8c45]/30">
                <i className="ri-user-line text-white text-2xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-[#6b5c3b]">Customers</p>
                <p className="text-3xl font-bold text-[#2f3e1e] drop-shadow-sm">{customers.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-white to-[#f8f5ed] p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-[#e5dcc8] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center">
              <div className="w-14 h-14 bg-gradient-to-br from-[#6b8e23] to-[#556b1c] rounded-xl flex items-center justify-center shadow-lg shadow-[#6b8e23]/30">
                <i className="ri-shopping-bag-3-line text-white text-2xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-[#6b5c3b]">Products</p>
                <p className="text-3xl font-bold text-[#2f3e1e] drop-shadow-sm">{products.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Charts and Recent Sales */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Payment Methods */}
          <div className="bg-gradient-to-br from-white to-[#faf8f4] p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] hover:shadow-[0_12px_35px_rgb(0,0,0,0.1)] transition-all duration-300">
            <h3 className="text-lg font-semibold text-[#2f3e1e] mb-4">Payment Methods Today</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full mr-3 bg-[#008000]"></div>
                  <span className="text-sm text-[#6b5c3b]">Cash</span>
                </div>
                <span className="text-sm font-semibold text-[#2f3e1e]">{todayStats.cashSales} sales</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full mr-3 bg-[#5f7434]"></div>
                  <span className="text-sm text-[#6b5c3b]">Card</span>
                </div>
                <span className="text-sm font-semibold text-[#2f3e1e]">{todayStats.cardSales} sales</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full mr-3 bg-[#7a8c45]"></div>
                  <span className="text-sm text-[#6b5c3b]">Transfer</span>
                </div>
                <span className="text-sm font-semibold text-[#2f3e1e]">{todayStats.transferSales} sales</span>
              </div>
            </div>
          </div>

          {/* Top Products */}
          <div className="bg-gradient-to-br from-white to-[#f8f6f0] p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] hover:shadow-[0_12px_35px_rgb(0,0,0,0.1)] transition-all duration-300">
            <h3 className="text-lg font-semibold text-[#2f3e1e] mb-4">Best Selling Products</h3>
            <div className="space-y-3">
              {topProducts.map((product, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <span className="w-6 h-6 bg-[#f4ead3] text-[#008000] rounded-full flex items-center justify-center text-xs font-medium mr-3">
                      {index + 1}
                    </span>
                    <span className="text-sm text-[#2f3e1e] truncate">{product.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-[#2f3e1e]">{product.quantity} units</div>
                    <div className="text-xs text-[#6b5c3b]">{money(product.revenue)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Sales */}
        <div className="bg-gradient-to-br from-white to-[#faf9f6] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Recent Sales</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sales.slice(0, 5).map((sale) => (
                  <tr key={sale.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sale.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sale.customer?.name || 'General Customer'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{money(sale.total)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{sale.paymentMethod}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full capitalize ${
                          sale.status === 'completed'
                            ? 'bg-[#dff3df] text-[#0b3f0b]'
                            : sale.status === 'cancelled'
                              ? 'bg-[#fde4e0] text-[#7a2010]'
                              : 'bg-[#fff4d4] text-[#7a5b00]'
                        }`}
                      >
                        {sale.status ?? 'pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderPOS = () => (
    <div className="relative flex h-screen bg-gradient-to-br from-[#f6f1e3] to-[#ebe5d5]">
      {/* Products Section */}
      <div className="flex-1 p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-[#2f3e1e] drop-shadow-sm">Products</h2>
            <div className="flex items-center gap-2">
              {/* View Mode Selector */}
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as 'simple' | 'normal' | 'custom')}
                className="px-4 py-2.5 bg-gradient-to-br from-white to-[#f8f6f0] border-2 border-[#e0d8c8] rounded-xl text-sm font-semibold text-gray-700 focus:ring-2 focus:ring-[#008000]/20 focus:border-[#008000] shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer"
              >
                <option value="simple">Simplified</option>
                <option value="normal">Common</option>
                <option value="custom">Custom</option>
              </select>
              {/* Modelo Button - Configure extras for Custom mode */}
              <button
                type="button"
                onClick={() => setShowModeloModal(true)}
                className="inline-flex items-center px-4 py-2.5 bg-gradient-to-br from-white to-[#f8f6f0] border-2 border-[#e0d8c8] rounded-xl hover:border-[#008000]/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 text-sm font-semibold text-gray-700 shadow-sm"
              >
                <i className="ri-settings-3-line mr-2 text-[#7a8c45]"></i>
                Model
              </button>
              <button
                type="button"
                onClick={() => setCartOpen(prev => !prev)}
                className="relative inline-flex items-center px-4 py-2.5 bg-gradient-to-br from-[#008000] to-[#006600] border-2 border-[#006600] rounded-xl hover:from-[#006600] hover:to-[#005500] hover:shadow-lg hover:shadow-[#008000]/25 hover:-translate-y-0.5 transition-all duration-300 text-sm font-semibold text-white shadow-md"
              >
                <i className="ri-shopping-cart-line mr-2"></i>
                {cartOpen ? 'Hide cart' : 'Show cart'}
                {cart.length > 0 && !cartOpen && (
                  <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white"></span>
                )}
              </button>
            </div>
          </div>
          
          {/* Search */}
          <div className="relative mb-4">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <i className="ri-search-line text-[#7a8c45] text-lg"></i>
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-12 pr-4 py-3.5 bg-gradient-to-r from-white to-[#faf9f5] border-2 border-[#e0d8c8] rounded-xl focus:ring-2 focus:ring-[#008000]/20 focus:border-[#008000] text-sm shadow-[inset_0_2px_4px_rgb(0,0,0,0.04)] transition-all duration-300 placeholder:text-gray-400"
              placeholder="Search products..."
            />
          </div>

          {/* Categories */}
          <div className="flex flex-wrap gap-2 mb-4">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 shadow-sm ${
                  selectedCategory === category
                    ? 'bg-gradient-to-br from-[#008000] to-[#006600] text-white shadow-md shadow-[#008000]/25 scale-105'
                    : 'bg-gradient-to-br from-white to-[#f8f6f0] border border-[#e0d8c8] text-gray-700 hover:border-[#008000]/40 hover:shadow-md hover:-translate-y-0.5'
                }`}
              >
                {category === 'all' ? 'All categories' : category}
              </button>
            ))}
          </div>
        </div>

        {/* Products Grid - Conditional based on viewMode */}
        {viewMode === 'simple' ? (
          /* SIMPLE VIEW: Just name and price buttons like POS terminals */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-6">
            {paginatedProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                disabled={product.stock <= 0}
                onClick={() => {
                  setSelectedProductDetail(product);
                  setSimpleAddQuantity(1);
                  setShowProductDetailModal(true);
                }}
                className={`p-3 rounded-lg text-center transition-all ${
                  product.stock <= 0
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-[#008000] text-white hover:bg-[#006600] active:scale-95'
                }`}
              >
                <div className="font-semibold text-sm truncate">{product.name}</div>
                <div className="text-xs mt-1 opacity-90">{money(product.price)}</div>
              </button>
            ))}
          </div>
        ) : viewMode === 'custom' ? (
          /* CUSTOM VIEW: Like Normal but clicking opens customization panel */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3 mb-6">
            {paginatedProducts.map((product) => (
              <div
                key={product.id}
                onClick={() => {
                  if (product.stock > 0) {
                    setCustomizeProduct(product);
                    setCustomizeQuantity(1);
                    setProductExtras([]);
                    setShowCustomizeModal(true);
                  }
                }}
                className={`bg-white rounded-xl shadow-sm border p-3 transition-all overflow-hidden cursor-pointer ${
                  product.stock <= 0
                    ? 'border-gray-300 opacity-60 cursor-not-allowed'
                    : 'border-gray-200 hover:shadow-md hover:border-[#008000]'
                }`}
              >
                <div className="flex items-stretch gap-3">
                  <div className="min-w-0 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-gray-600 truncate">{product.category || ''}</p>
                        <h3 className="font-semibold text-gray-900 text-sm leading-5 truncate">{product.name}</h3>
                        {product.sku && (
                          <p className="text-[11px] text-gray-400 truncate">{product.sku}</p>
                        )}
                      </div>
                      {product.stock <= 0 ? (
                        <span className="shrink-0 rounded-full bg-red-50 text-red-700 px-2 py-0.5 text-[11px] font-medium">
                          Out
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-[11px] font-medium">
                          Stock: {product.stock}
                        </span>
                      )}
                    </div>
                    <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                      <span className="text-base font-extrabold text-[#008000] whitespace-nowrap">
                        {money(product.price)}
                      </span>
                      <span className="text-xs text-gray-500">Click to customize</span>
                    </div>
                  </div>
                  <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center overflow-hidden">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDMwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xNTAgMTAwQzE2MS4wNDYgMTAwIDE3MCA5MC45NTQzIDE3MCA4MEM1NyA2OS4wNDU3IDE0Ny45NTQgNjAgMTM2IDYwQzEyNC45NTQgNjAgMTE2IDY5LjA0NTcgMTE2IDgwQzExNiA5MC45NTQzIDEyNC45NTQgMTAwIDEzNiAxMDBIMTUwWiIgZmlsbD0iIzlDQTNBRiIvPgo8cGF0aCBkPSJNMTg2IDEyMEgxMTRDMTA3LjM3MyAxMjAgMTAyIDEyNS4zNzMgMTAyIDEzMlYyMDBDMTAyIDIwNi4yMjcgMTA3LjM3MyAyMTIgMTE0IDIxMkgxODZDMTkyLjYyNyAyMTIgMTk4IDIwNi4yMjJgMTk0IDIwMFYxMzJDMTk0IDEyNS4zNzMgMTkyLjYyNyAxMjAgMTg2IDEyMFoiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+';
                        }}
                      />
                    ) : (
                      <i className="ri-image-line text-gray-400 text-2xl" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* NORMAL VIEW: Current design with + button */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4 mb-6">
            {paginatedProducts.map((product) => (
              <div
                key={product.id}
                className={`bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.08)] border p-4 transition-all duration-300 overflow-hidden group ${
                  product.stock <= 0
                    ? 'border-gray-300 opacity-60'
                    : 'border-[#e8e0d0] hover:shadow-[0_8px_30px_rgb(0,128,0,0.12)] hover:-translate-y-1 hover:border-[#008000]/30'
                }`}
              >
                <div className="flex items-stretch gap-4">
                  <div className="min-w-0 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-[#7a8c45] font-medium truncate uppercase tracking-wide">{product.category || ''}</p>
                        <h3 className="font-bold text-gray-900 text-base leading-5 truncate mt-0.5">{product.name}</h3>
                        {product.sku && (
                          <p className="text-[11px] text-gray-400 truncate mt-0.5">{product.sku}</p>
                        )}
                      </div>
                      {product.stock <= 0 ? (
                        <span className="shrink-0 rounded-full bg-gradient-to-r from-red-100 to-red-50 text-red-700 px-2.5 py-1 text-[11px] font-semibold shadow-sm">
                          Out
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-gradient-to-r from-amber-100 to-amber-50 text-amber-700 px-2.5 py-1 text-[11px] font-semibold shadow-sm">
                          Stock: {product.stock}
                        </span>
                      )}
                    </div>
                    <div className="mt-auto pt-4 flex items-center justify-between gap-2">
                      <span className="text-xl font-extrabold text-[#008000] whitespace-nowrap drop-shadow-sm">
                        {money(product.price)}
                      </span>
                      <button
                        type="button"
                        disabled={product.stock <= 0}
                        onClick={() => addToCart(product)}
                        className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg transition-all duration-300 shadow-md ${
                          product.stock <= 0
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-gradient-to-br from-[#008000] to-[#006600] text-white hover:from-[#006600] hover:to-[#005500] hover:shadow-lg hover:shadow-[#008000]/30 hover:scale-110 active:scale-95'
                        }`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center overflow-hidden shadow-inner group-hover:shadow-md transition-all duration-300">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDMwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xNTAgMTAwQzE2MS4wNDYgMTAwIDE3MCA5MC45NTQzIDE3MCA4MEM1NyA2OS4wNDU3IDE0Ny45NTQgNjAgMTM2IDYwQzEyNC45NTQgNjAgMTE2IDY5LjA0NTcgMTE2IDgwQzExNiA5MC45NTQzIDEyNC45NTQgMTAwIDEzNiAxMDBIMTUwWiIgZmlsbD0iIzlDQTNBRiIvPgo8cGF0aCBkPSJNMTg2IDEyMEgxMTRDMTA3LjM3MyAxMjAgMTAyIDEyNS4zNzMgMTAyIDEzMlYyMDBDMTAyIDIwNi4yMjcgMTA3LjM3MyAyMTIgMTE0IDIxMkgxODZDMTkyLjYyNyAyMTIgMTk4IDIwNi4yMjJgMTk0IDIwMFYxMzJDMTk0IDEyNS4zNzMgMTkyLjYyNyAxMjAgMTg2IDEyMFoiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+';
                        }}
                      />
                    ) : (
                      <i className="ri-image-line text-gray-400 text-2xl" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Controles de Paginación */}
        {totalPages > 1 && (
          <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.06)] border border-[#e8e0d0] px-5 py-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">
                {startIndex + 1}-{Math.min(endIndex, filteredProducts.length)} de {filteredProducts.length}
              </span>
              
              <div className="flex items-center space-x-1 sm:space-x-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl flex items-center space-x-1 text-sm font-semibold transition-all duration-300 shadow-sm ${
                  currentPage === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-br from-[#008000] to-[#006600] text-white hover:from-[#006600] hover:to-[#005500] hover:shadow-md hover:-translate-y-0.5'
                }`}
              >
                <i className="ri-arrow-left-s-line text-base"></i>
                <span className="hidden sm:inline">Previous</span>
              </button>

              <div className="flex items-center space-x-1">
                {/* Mostrar paginación inteligente */}
                {totalPages <= 7 ? (
                  // Si hay 7 o menos páginas, mostrar todas
                  Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-sm font-semibold transition-all duration-300 ${
                        currentPage === page
                          ? 'bg-gradient-to-br from-[#008000] to-[#006600] text-white shadow-md shadow-[#008000]/25 scale-110'
                          : 'bg-gradient-to-br from-white to-[#f8f6f0] text-gray-700 border border-[#e0d8c8] hover:border-[#008000]/40 hover:shadow-md hover:-translate-y-0.5'
                      }`}
                    >
                      {page}
                    </button>
                  ))
                ) : (
                  // Si hay más de 7 páginas, mostrar algunas con puntos suspensivos
                  <>
                    <button
                      onClick={() => setCurrentPage(1)}
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-sm font-semibold transition-all duration-300 ${
                        currentPage === 1
                          ? 'bg-gradient-to-br from-[#008000] to-[#006600] text-white shadow-md shadow-[#008000]/25 scale-110'
                          : 'bg-gradient-to-br from-white to-[#f8f6f0] text-gray-700 border border-[#e0d8c8] hover:border-[#008000]/40 hover:shadow-md hover:-translate-y-0.5'
                      }`}
                    >
                      1
                    </button>
                    
                    {currentPage > 3 && (
                      <span className="px-1 text-gray-400 text-sm">...</span>
                    )}
                    
                    {Array.from({ length: 3 }, (_, i) => {
                      const page = currentPage - 1 + i;
                      if (page <= 1 || page >= totalPages) return null;
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-sm font-semibold transition-all duration-300 ${
                            currentPage === page
                              ? 'bg-gradient-to-br from-[#008000] to-[#006600] text-white shadow-md shadow-[#008000]/25 scale-110'
                              : 'bg-gradient-to-br from-white to-[#f8f6f0] text-gray-700 border border-[#e0d8c8] hover:border-[#008000]/40 hover:shadow-md hover:-translate-y-0.5'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                    
                    {currentPage < totalPages - 2 && (
                      <span className="px-1 text-gray-400 text-sm">...</span>
                    )}
                    
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-sm font-semibold transition-all duration-300 ${
                        currentPage === totalPages
                          ? 'bg-gradient-to-br from-[#008000] to-[#006600] text-white shadow-md shadow-[#008000]/25 scale-110'
                          : 'bg-gradient-to-br from-white to-[#f8f6f0] text-gray-700 border border-[#e0d8c8] hover:border-[#008000]/40 hover:shadow-md hover:-translate-y-0.5'
                      }`}
                    >
                      {totalPages}
                    </button>
                  </>
                )}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl flex items-center space-x-1 text-sm font-semibold transition-all duration-300 shadow-sm ${
                  currentPage === totalPages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-br from-[#008000] to-[#006600] text-white hover:from-[#006600] hover:to-[#005500] hover:shadow-md hover:-translate-y-0.5'
                }`}
              >
                <span className="hidden sm:inline">Next</span>
                <i className="ri-arrow-right-s-line text-base"></i>
              </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={`fixed inset-0 z-30 ${cartOpen ? '' : 'pointer-events-none'}`}>
        <button
          type="button"
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${cartOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setCartOpen(false)}
        />

        <div
          className={`absolute top-0 right-0 h-full w-full sm:w-96 bg-gradient-to-b from-white to-[#faf9f5] border-l border-[#d8cbb5] flex flex-col shadow-[0_0_50px_rgb(0,0,0,0.15)] will-change-transform transition-transform duration-500 ease-in-out ${
            cartOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="p-6 border-b border-[#006600] bg-gradient-to-br from-[#008000] to-[#006600] shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white drop-shadow-sm">Shopping Cart</h2>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="p-2.5 text-white/90 hover:text-white rounded-xl hover:bg-white/20 transition-all duration-300 hover:scale-110"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>
          
            <div className="mt-4">
              <div className="relative">
                <i className="ri-user-line absolute left-3 top-1/2 -translate-y-1/2 text-white/90 pointer-events-none"></i>
                <select
                  value={selectedCustomer ? String(selectedCustomer.id) : ''}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    if (!selectedId) {
                      setSelectedCustomer(null);
                      return;
                    }
                    const customer = customers.find((c) => String(c.id) === selectedId) || null;
                    setSelectedCustomer(customer);
                  }}
                  className="pos-customer-select w-full appearance-none pl-10 pr-10 py-3.5 rounded-xl bg-white/20 text-white placeholder-white/70 border-2 border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 shadow-inner transition-all duration-300"
                >
                  <option value="" className="text-gray-900">
                    Select Customer
                  </option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={String(customer.id)} className="text-gray-900">
                      {customer.name}
                    </option>
                  ))}
                </select>
                <i className="ri-arrow-down-s-line absolute right-3 top-1/2 -translate-y-1/2 text-white/90 pointer-events-none"></i>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {cart.length === 0 ? (
              <div className="text-center text-gray-400 mt-12">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center shadow-inner">
                  <i className="ri-shopping-cart-line text-4xl text-gray-300"></i>
                </div>
                <p className="text-lg font-medium">Empty cart</p>
                <p className="text-sm mt-1">Add products to get started</p>
              </div>
            ) : (
              <div className="space-y-4">
                {cart.map((item, index) => (
                  <div key={`${item.id}-${index}`} className="bg-gradient-to-br from-white to-[#f8f6f0] rounded-xl overflow-hidden border border-[#e8e0d0] shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="flex items-center p-3">
                      <div className="w-12 h-12 bg-gray-200 rounded-lg overflow-hidden mr-3 flex-shrink-0">
                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover object-top"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yNCAyMEMyNi4yMDkxIDIwIDI4IDE4LjIwOTEgMjggMTZDMjggMTMuNzkwOSAyNi4yMDkxIDEyIDI0IDEyQzIxLjc5MDkgMTIgMjAgMTMuNzkwOSAyMCAxNkMyMCAxOC4yMDkxIDIxLjc5MDkgMjAgMjQgMjBaIiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0zMiAyNEgxNkMxNC44OTU0IDI0IDE0IDI0Ljg5NTQgMTQgMjZWMzRDMTQgMzUuMTA0NiAxNC44OTU0IDM2IDE2IDM2SDMyQzMzLjEwNDYgMzYgMzQgMzUuMTA0NiAzNCAzNFYyNkMzNCAyNC44OTU0IDMzLjEwNDYgMjQgMzIgMjRaIiBmaWxsPSIjOUNBM0FGIi8+Cjwvc3ZnPg==';
                            }}
                          />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 text-sm truncate">{item.name}</h4>
                        <p className="text-xs text-gray-500">{money(item.price)} c/u</p>
                        <p className="text-sm font-semibold text-gray-900">{money(item.total)}</p>
                        <p className={`text-xs mt-0.5 ${
                          item.quantity >= item.stock
                            ? 'text-red-600 font-medium'
                            : item.stock - item.quantity <= 3
                            ? 'text-amber-600'
                            : 'text-gray-400'
                        }`}>
                          Available stock: {item.stock - item.quantity}
                        </p>
                      </div>

                      <div className="flex items-center space-x-2 ml-3">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="w-7 h-7 bg-gradient-to-br from-gray-100 to-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:from-gray-200 hover:to-gray-300 hover:shadow-sm transition-all duration-200 shadow-sm"
                        >
                          <i className="ri-subtract-line text-sm"></i>
                        </button>
                        <span className="w-8 text-center text-sm font-bold text-[#2f3e1e]">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          disabled={item.quantity >= item.stock}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 shadow-sm ${
                            item.quantity >= item.stock
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-gradient-to-br from-[#008000] to-[#006600] text-white hover:from-[#006600] hover:to-[#005500] hover:shadow-md'
                          }`}
                        >
                          <i className="ri-add-line text-sm"></i>
                        </button>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="w-7 h-7 bg-gradient-to-br from-red-100 to-red-200 text-red-600 rounded-lg flex items-center justify-center hover:from-red-200 hover:to-red-300 hover:shadow-sm transition-all duration-200 shadow-sm ml-2"
                        >
                          <i className="ri-delete-bin-line text-sm"></i>
                        </button>
                      </div>
                    </div>

                    {/* Extras/Complementarios */}
                    {item.extras && item.extras.length > 0 && (
                      <div className="px-3 pb-3 pt-1 border-t border-gray-200 bg-blue-50">
                        <p className="text-xs font-medium text-blue-700 mb-1">
                          <i className="ri-add-circle-line mr-1"></i>
                          Extras:
                        </p>
                        <div className="space-y-1">
                          {item.extras.map((extra, extraIndex) => (
                            <div key={extraIndex} className="flex items-center justify-between text-xs">
                              <span className="text-gray-700">
                                {extra.quantity}x {extra.name}
                              </span>
                              <span className="text-[#008000] font-medium">
                                +{money(extra.price * extra.quantity)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>


        {/* Edit Customer Modal (root level) */}
        {showEditCustomerModal && editCustomer && (
          <Modal>
            <div className="bg-white rounded-lg p-6 w-96 max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Edit Customer</h3>
                <button onClick={() => setShowEditCustomerModal(false)} className="text-gray-400 hover:text-gray-600">
                  <i className="ri-close-line"></i>
                </button>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); saveEditedCustomer(); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    value={editCustomer.name || ''}
                    onChange={(e) => setEditCustomer(prev => ({ ...(prev as Customer), name: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Document *</label>
                  <input
                    type="text"
                    value={editCustomer.document || ''}
                    onChange={(e) => setEditCustomer(prev => ({ ...(prev as Customer), document: formatDocument(e.target.value) }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    value={editCustomer.phone || ''}
                    onChange={(e) => setEditCustomer(prev => ({ ...(prev as Customer), phone: formatPhone(e.target.value) }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={editCustomer.email || ''}
                    onChange={(e) => setEditCustomer(prev => ({ ...(prev as Customer), email: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <textarea
                    value={editCustomer.address || ''}
                    onChange={(e) => setEditCustomer(prev => ({ ...(prev as Customer), address: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Type</label>
                  <select
                    value={editCustomer.type || 'regular'}
                    onChange={(e) => setEditCustomer(prev => ({ ...(prev as Customer), type: e.target.value as 'regular' | 'vip' }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="regular">Regular</option>
                    <option value="vip">VIP</option>
                  </select>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button type="button" onClick={() => setShowEditCustomerModal(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 px-4 py-2 bg-[#008000] text-white rounded-lg hover:bg-[#006600] transition-colors">Save Changes</button>
                </div>
              </form>
            </div>
          </Modal>
        )}

          {cart.length > 0 && (
            <div className="p-6 border-t border-[#e8e0d0] bg-gradient-to-t from-[#f5f0e5] to-transparent">
              <div className="space-y-3 mb-5 bg-white/80 rounded-xl p-4 shadow-sm border border-[#e8e0d0]">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal:</span>
                  <span className="font-medium text-[#2f3e1e]">{money(getSubtotal())}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>ITBIS (18%):</span>
                  <span className="font-medium text-[#2f3e1e]">{money(getTax())}</span>
                </div>
                <div className="flex justify-between text-xl font-bold border-t border-[#e0d8c8] pt-3">
                  <span className="text-[#2f3e1e]">Total:</span>
                  <span className="text-[#008000] drop-shadow-sm">{money(getTotal())}</span>
                </div>
              </div>
              
              <button
                onClick={() => {
                  setPaymentMethod('');
                  setAmountReceived('');
                  setShowPaymentModal(true);
                }}
                className="w-full bg-gradient-to-br from-[#008000] to-[#006600] text-white py-4 rounded-xl font-bold text-lg hover:from-[#006600] hover:to-[#005500] hover:shadow-lg hover:shadow-[#008000]/30 hover:-translate-y-0.5 transition-all duration-300 shadow-md whitespace-nowrap"
              >
                <i className="ri-wallet-3-line mr-2"></i>
                Process Payment
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderInventoryView = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Inventory (quick view)</h2>
          <p className="text-gray-600 text-sm">
            Basic product and stock query available for Point of Sale.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <i className="ri-search-line text-gray-400"></i>
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              placeholder="Search by name, SKU or barcode..."
            />
          </div>
          <div className="w-full md:w-60">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm pr-8"
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category === 'all' ? 'All categories' : category}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SKU
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stock
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sale Price
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProductsForInventory.map((product) => (
                <tr key={product.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{product.sku}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 truncate max-w-xs">
                    {product.name}
                    {availableExtras.includes(product.id) && (
                      <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Extra</span>
                    )}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                    {product.category || 'N/A'}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 text-right">
                    {product.stock}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 text-right">
                    {money(product.price)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-center">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        product.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {product.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-sm text-gray-500"
                  >
                    No products found for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderCashCount = () => {
    const today = new Date().toISOString().split('T')[0];
    const todaySales = sales.filter((sale) => sale.date === today && sale.status === 'completed');

    const totalCash = todaySales
      .filter((sale) => sale.paymentMethod === 'cash')
      .reduce((sum, sale) => sum + sale.total, 0);

    const totalCard = todaySales
      .filter((sale) => sale.paymentMethod === 'card')
      .reduce((sum, sale) => sum + sale.total, 0);

    const totalTransfer = todaySales
      .filter((sale) => sale.paymentMethod === 'transfer')
      .reduce((sum, sale) => sum + sale.total, 0);

    const totalSalesAmount = todaySales.reduce((sum, sale) => sum + sale.total, 0);

    const countedCash = cashDenominations.reduce((sum, denom) => {
      const qty = parseInt(denom.quantity || '0', 10) || 0;
      return sum + denom.value * qty;
    }, 0);

    const cashDifference = countedCash - totalCash;

    const handleSaveCashClosing = async () => {
      if (!user?.id) {
        toast.error('You must log in to save the cash count');
        return;
      }
      if (todaySales.length === 0) {
        toast.error('There are no completed sales for today');
        return;
      }

      try {
        setSavingCashClosing(true);
        await cashClosingService.create(user.id, {
          closing_date: today,
          cashier_name: (user as any)?.user_metadata?.full_name || user.email || 'Point of Sale',
          shift_name: 'POS Shift',
          opening_balance: 0,
          total_sales: totalSalesAmount,
          cash_sales: totalCash,
          card_sales: totalCard,
          transfer_sales: totalTransfer,
          other_sales: 0,
          total_expenses: 0,
          expected_cash_balance: totalCash,
          actual_cash_balance: countedCash,
          difference: cashDifference,
          status: cashDifference === 0 ? 'closed' : 'pending_review',
          notes: cashClosingNotes || null,
        });

        toast.success('Cash count saved successfully');
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[POS] Error saving cash closing from POS', error);
        toast.error('Error saving cash count');
      } finally {
        setSavingCashClosing(false);
      }
    };

    const handleExportCashClosing = async () => {
      try {
        const rows = todaySales.map((sale) => ({
          id: sale.id,
          date: sale.date,
          time: sale.time,
          customer: sale.customer?.name || 'General Customer',
          total: sale.total || 0,
          paymentMethod: sale.paymentMethod,
          status: sale.status,
        }));

        await exportToExcelStyled(
          rows,
          [
            { key: 'id', title: 'Sale ID', width: 20 },
            { key: 'date', title: 'Date', width: 12 },
            { key: 'time', title: 'Time', width: 10 },
            { key: 'customer', title: 'Customer', width: 28 },
            { key: 'total', title: 'Total', width: 14, numFmt: '#,##0.00' },
            { key: 'paymentMethod', title: 'Method', width: 16 },
            { key: 'status', title: 'Status', width: 12 },
          ],
          `cash_count_pos_${today}`,
          'ArqueoCajaPOS'
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[POS] Error exporting cash count to Excel', error);
        alert('Error exporting cash count to Excel');
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Surplus and Shortage Record</h2>
            <p className="text-gray-600 text-sm">
              Based on Point of Sale cash count: compares expected vs counted cash and records differences.
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleExportCashClosing}
              className="px-4 py-2 bg-[#008000] text-white rounded-lg hover:bg-[#006600] transition-colors whitespace-nowrap"
              disabled={todaySales.length === 0}
            >
              <i className="ri-file-excel-2-line mr-2" />
              Export Excel
            </button>
            <button
              onClick={handleSaveCashClosing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={savingCashClosing || !user?.id || todaySales.length === 0}
            >
              {savingCashClosing ? 'Saving...' : 'Save Cash Count'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily sales summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Completed sales:</span>
                <span className="font-medium">{todaySales.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total in sales:</span>
                <span className="font-medium">{money(totalSalesAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Expected cash in drawer:</span>
                <span className="font-medium">{money(totalCash)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Cards:</span>
                <span className="font-medium">{money(totalCard)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Transfers:</span>
                <span className="font-medium">{money(totalTransfer)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cash count in drawer</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Denomination
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {cashDenominations.map((row, index) => {
                    const qty = parseInt(row.quantity || '0', 10) || 0;
                    const rowTotal = row.value * qty;
                    return (
                      <tr key={row.value}>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-700">
                          {money(row.value)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-right">
                          <input
                            type="text"
                            value={row.quantity}
                            onChange={(e) => handleCashDenominationChange(index, e.target.value)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-right text-gray-900">
                          {money(rowTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-4 py-2 text-right font-semibold text-gray-700" colSpan={2}>
                      Total counted cash
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-900">
                      {money(countedCash)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-right font-semibold text-gray-700" colSpan={2}>
                      Difference vs expected cash
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-semibold ${
                        cashDifference === 0
                          ? 'text-emerald-600'
                          : cashDifference > 0
                          ? 'text-blue-600'
                          : 'text-red-600'
                      }`}
                    >
                      {money(cashDifference)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Cash count observations</h3>
          <textarea
            rows={3}
            value={cashClosingNotes}
            onChange={(e) => setCashClosingNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            placeholder="Notes or observations about the cash count..."
          ></textarea>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Today's sales used in cash count</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sale ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {todaySales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sale.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sale.time}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sale.customer?.name || 'General Customer'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {money(sale.total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                      {sale.paymentMethod === 'cash'
                        ? 'Cash'
                        : sale.paymentMethod === 'card'
                        ? 'Card'
                        : sale.paymentMethod === 'transfer'
                        ? 'Transfer'
                        : sale.paymentMethod}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          sale.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : sale.status === 'cancelled'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {sale.status === 'completed'
                          ? 'Completed'
                          : sale.status === 'cancelled'
                          ? 'Cancelled'
                          : 'Refunded'}
                      </span>
                    </td>
                  </tr>
                ))}
                {todaySales.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-6 text-center text-sm text-gray-500"
                    >
                      There are no completed sales for today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderSales = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">Sales History</h2>
        <button
          onClick={exportSalesReport}
          className="bg-[#008000] text-white px-4 py-2 rounded-lg hover:bg-[#006600] transition-colors whitespace-nowrap"
        >
          <i className="ri-download-line mr-2"></i>
          Export Report
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sale ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sales.map((sale) => (
                <tr key={sale.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sale.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {sale.date} {sale.time}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {sale.customer?.name || 'General Customer'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {sale.items.length} products
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {money(sale.total)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                    {sale.paymentMethod === 'cash' ? 'Cash' : 
                     sale.paymentMethod === 'card' ? 'Card' : 'Transfer'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      sale.status === 'completed' ? 'bg-green-100 text-green-800' :
                      sale.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {sale.status === 'completed' ? 'Completed' : 
                       sale.status === 'cancelled' ? 'Cancelled' : 'Refunded'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );


  const renderReports = () => {
    const todayStats = getTodayStats();
    const topProducts = getTopProducts();
    
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-gray-900">Reports and Analysis</h2>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Day Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Sales:</span>
                <span className="font-medium">{todayStats.totalSales}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Revenue:</span>
                <span className="font-medium">{money(todayStats.totalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Average per Sale:</span>
                <span className="font-medium">
                  {formatAmount(todayStats.totalSales > 0 ? (todayStats.totalAmount / todayStats.totalSales) : 0)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Methods</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Cash:</span>
                <span className="font-medium">{todayStats.cashSales} sales</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Card:</span>
                <span className="font-medium">{todayStats.cardSales} sales</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Transfer:</span>
                <span className="font-medium">{todayStats.transferSales} sales</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">General Statistics</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Customers:</span>
                <span className="font-medium">{customers.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">VIP Customers:</span>
                <span className="font-medium">{customers.filter(c => c.type === 'vip').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Active Products:</span>
                <span className="font-medium">{products.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Products Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Best Selling Products</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Position</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity Sold</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {topProducts.map((product, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{product.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.quantity} units</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatAmount(product.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="p-6 bg-[#f5f0e3] min-h-screen -m-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#2f3e1e]">Point of Sale</h1>
            <p className="text-[#6b5c3b]">Complete sales and management system</p>
          </div>
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="bg-white/80 border border-[#d8cbb5] text-[#2f3e1e] px-4 py-2 rounded-lg hover:bg-[#e3e7d3] transition-colors whitespace-nowrap shadow-sm"
          >
            <i className="ri-arrow-left-line mr-2"></i>
            Back to Home
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="border-b border-[#d8cbb5] mb-6">
          <nav className="-mb-px flex flex-wrap gap-x-4 gap-y-2">
            {[
              { id: 'dashboard', name: 'Dashboard', icon: 'ri-dashboard-line' },
              { id: 'pos', name: 'Point of Sale', icon: 'ri-shopping-cart-line' },
              { id: 'inventory', name: 'Inventory', icon: 'ri-archive-line' },
              { id: 'cash-diff', name: 'Surplus / Shortage', icon: 'ri-scales-3-line' },
              { id: 'cash-closing', name: 'Cash Closing', icon: 'ri-safe-line' },
              { id: 'sales', name: 'Sales', icon: 'ri-file-list-line' },
              { id: 'invoicing', name: 'Invoicing', icon: 'ri-file-text-line' },
              { id: 'reports', name: 'Reports', icon: 'ri-bar-chart-line' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'invoicing') {
                    navigate('/billing/invoicing');
                  } else if (tab.id === 'cash-closing') {
                    navigate('/billing/cash-closing');
                  } else {
                    setActiveTab(tab.id);
                  }
                }}
                className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-[#008000] text-[#2f3e1e]'
                    : 'border-transparent text-[#8a7d5c] hover:text-[#008000] hover:border-[#d8cbb5]'
                }`}
              >
                <i className={`${tab.icon} mr-2`}></i>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'pos' && renderPOS()}
        {activeTab === 'inventory' && renderInventoryView()}
        {activeTab === 'cash-diff' && renderCashCount()}
        {activeTab === 'sales' && renderSales()}
        {activeTab === 'reports' && renderReports()}

        {/* Customer Selection Modal */}
        {showCustomerModal && (
          <Modal>
            <div className="bg-white rounded-lg p-6 w-96 max-h-96 overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Select Customer</h3>
                <button
                  onClick={() => setShowCustomerModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
              
              <div className="space-y-2">
                <button
                  onClick={() => {
                    const general = customers.find((c) => String(c.name || '').trim().toLowerCase() === 'general customer');
                    setSelectedCustomer(general || null);
                    setShowCustomerModal(false);
                  }}
                  className="w-full text-left p-3 hover:bg-gray-50 rounded-lg border"
                >
                  <div className="font-medium">General Customer</div>
                  <div className="text-sm text-gray-500">No specific information</div>
                </button>
                
                {customers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setShowCustomerModal(false);
                    }}
                    className="w-full text-left p-3 hover:bg-gray-50 rounded-lg border"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{customer.name}</div>
                        <div className="text-sm text-gray-500">{customer.document}</div>
                      </div>
                      {customer.type === 'vip' && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          VIP
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </Modal>
        )}

        {/* Payment Modal */}
        {showPaymentModal && (
          <Modal>
            <div className="bg-white rounded-lg p-6 w-96">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Process Payment</h3>
                <button
                  onClick={() => {
                    setShowPaymentModal(false);
                    setPaymentMethod('');
                    setAmountReceived('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
              
              <div className="mb-4">
                <div className="text-2xl font-bold text-center mb-4">
                  Total: {formatAmount(getTotal())}
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="">Select...</option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </div>
                
                {paymentMethod === 'cash' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount Received
                    </label>
                    <input
                      type="text"
                      ref={amountInputRef}
                      value={amountReceived}
                      onChange={(e) => handleAmountReceivedChange(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                    {amountReceived && (
                      <div className="mt-2 text-sm">
                        Change: {formatAmount(Math.max(0, parseAmountInput(amountReceived) - getTotal()))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <button
                onClick={processPayment}
                className="w-full bg-[#008000] text-white py-3 rounded-lg font-medium hover:bg-[#006600] transition-colors whitespace-nowrap"
              >
                Confirm Payment
              </button>
            </div>
          </Modal>
        )}

        {/* Product Detail Modal (Simple Mode) */}
        {showProductDetailModal && selectedProductDetail && (
          <Modal>
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">{selectedProductDetail.name}</h3>
                <button
                  onClick={() => {
                    setShowProductDetailModal(false);
                    setSelectedProductDetail(null);
                    setSimpleAddQuantity(1);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              {selectedProductDetail.category && (
                <p className="text-sm text-[#008000] mb-3">{selectedProductDetail.category}</p>
              )}

              {selectedProductDetail.imageUrl && (
                <div className="w-full h-48 bg-gray-100 rounded-lg overflow-hidden mb-4">
                  <img
                    src={selectedProductDetail.imageUrl}
                    alt={selectedProductDetail.name}
                    className="w-full h-full object-contain"
                  />
                </div>
              )}

              <div className="space-y-3 mb-6">
                {selectedProductDetail.sku && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">SKU:</span>
                    <span className="text-gray-900">{selectedProductDetail.sku}</span>
                  </div>
                )}
                {selectedProductDetail.barcode && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Barcode:</span>
                    <span className="text-gray-900">{selectedProductDetail.barcode}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Stock:</span>
                  <span className={`font-medium ${selectedProductDetail.stock > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {selectedProductDetail.stock} units
                  </span>
                </div>
                {selectedProductDetail.description && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-gray-500 mb-1">Description:</p>
                    <p className="text-sm text-gray-700">{selectedProductDetail.description}</p>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-gray-600">Quantity</p>
                    <p className="text-2xl font-bold text-[#008000]">{money(selectedProductDetail.price * simpleAddQuantity)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSimpleAddQuantity(prev => Math.max(1, prev - 1))}
                      className="w-10 h-10 rounded-lg bg-white border border-gray-300 flex items-center justify-center text-gray-700 hover:bg-gray-50"
                    >
                      -
                    </button>
                    <span className="w-12 text-center text-xl font-bold">{simpleAddQuantity}</span>
                    <button
                      type="button"
                      onClick={() => setSimpleAddQuantity(prev => Math.min(selectedProductDetail.stock, prev + 1))}
                      className="w-10 h-10 rounded-lg bg-white border border-gray-300 flex items-center justify-center text-gray-700 hover:bg-gray-50"
                    >
                      +
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={selectedProductDetail.stock <= 0}
                  onClick={() => {
                    addToCart(selectedProductDetail, simpleAddQuantity);
                    setShowProductDetailModal(false);
                    setSelectedProductDetail(null);
                    setSimpleAddQuantity(1);
                  }}
                  className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors ${
                    selectedProductDetail.stock <= 0
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-[#008000] text-white hover:bg-[#006600]'
                  }`}
                >
                  Add to Cart
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Product Customization Modal (Custom Mode) */}
        {showCustomizeModal && customizeProduct && (
          <Modal>
            <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">{customizeProduct.name}</h3>
                <button
                  onClick={() => {
                    setShowCustomizeModal(false);
                    setCustomizeProduct(null);
                    setCustomizeQuantity(1);
                    setProductExtras([]);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              {customizeProduct.category && (
                <p className="text-sm text-[#008000] mb-3">{customizeProduct.category}</p>
              )}

              {customizeProduct.imageUrl && (
                <div className="w-full h-48 bg-gray-100 rounded-lg overflow-hidden mb-4">
                  <img
                    src={customizeProduct.imageUrl}
                    alt={customizeProduct.name}
                    className="w-full h-full object-contain"
                  />
                </div>
              )}

              {/* Quantity Selector */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Quantity</p>
                    <p className="text-lg font-bold text-gray-900">
                      Total ({customizeQuantity} {customizeQuantity === 1 ? 'unit' : 'units'})
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setCustomizeQuantity(prev => Math.max(1, prev - 1))}
                      className="w-10 h-10 rounded-lg bg-white border border-gray-300 flex items-center justify-center text-gray-700 hover:bg-gray-50"
                    >
                      -
                    </button>
                    <span className="w-12 text-center text-xl font-bold">{customizeQuantity}</span>
                    <button
                      type="button"
                      onClick={() => setCustomizeQuantity(prev => Math.min(customizeProduct.stock, prev + 1))}
                      className="w-10 h-10 rounded-lg bg-white border border-gray-300 flex items-center justify-center text-gray-700 hover:bg-gray-50"
                    >
                      +
                    </button>
                  </div>
                </div>
                <p className="text-xl font-bold text-[#008000] mt-2">
                  {money(customizeProduct.price * customizeQuantity + productExtras.reduce((sum, e) => sum + e.price * e.quantity, 0))}
                </p>
              </div>

              {/* Extras/Add-ons Section */}
              <div className="border rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-gray-900 mb-3">Extras / Add-ons</h4>
                
                {productExtras.length === 0 ? (
                  <p className="text-sm text-gray-500 mb-3">No extras added yet</p>
                ) : (
                  <div className="space-y-2 mb-3">
                    {productExtras.map((extra, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg p-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{extra.name}</span>
                          <span className="text-sm text-[#008000]">+{money(extra.price)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setProductExtras(prev => prev.map((e, i) => 
                                i === idx ? { ...e, quantity: Math.max(0, e.quantity - 1) } : e
                              ).filter(e => e.quantity > 0));
                            }}
                            className="w-7 h-7 rounded bg-white border text-gray-600 hover:bg-gray-50"
                          >
                            -
                          </button>
                          <span className="w-6 text-center text-sm font-medium">{extra.quantity}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setProductExtras(prev => prev.map((e, i) => 
                                i === idx ? { ...e, quantity: e.quantity + 1 } : e
                              ));
                            }}
                            className="w-7 h-7 rounded bg-white border text-gray-600 hover:bg-gray-50"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick add extras - from configured products */}
                <div className="space-y-2">
                  {availableExtras.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">
                      No extras configured. Click "Modelo" to add products as extras.
                    </p>
                  ) : (
                    products
                      .filter(p => availableExtras.includes(p.id) && p.id !== customizeProduct?.id)
                      .map((extraProduct) => (
                        <div
                          key={extraProduct.id}
                          className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          {/* Small image */}
                          <div className="w-10 h-10 rounded-lg bg-gray-200 overflow-hidden flex-shrink-0">
                            {extraProduct.imageUrl ? (
                              <img
                                src={extraProduct.imageUrl}
                                alt={extraProduct.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yMCAxNkMyMS42NTY5IDE2IDIzIDE0LjY1NjkgMjMgMTNDMjMgMTEuMzQzMSAyMS42NTY5IDEwIDIwIDEwQzE4LjM0MzEgMTAgMTcgMTEuMzQzMSAxNyAxM0MxNyAxNC42NTY5IDE4LjM0MzEgMTYgMjAgMTZaIiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0yNiAyMEgxNEMxMy40NDc3IDIwIDEzIDIwLjQ0NzcgMTMgMjFWMjhDMTMgMjguNTUyMyAxMy40NDc3IDI5IDE0IDI5SDI2QzI2LjU1MjMgMjkgMjcgMjguNTUyMyAyNyAyOFYyMUMyNyAyMC40NDc3IDI2LjU1MjMgMjAgMjYgMjBaIiBmaWxsPSIjOUNBM0FGIi8+Cjwvc3ZnPg==';
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <i className="ri-image-line text-gray-400 text-sm"></i>
                              </div>
                            )}
                          </div>
                          
                          {/* Product info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{extraProduct.name}</p>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-[#008000] font-semibold">+{money(extraProduct.price)}</span>
                              <span className={`text-xs ${extraProduct.stock > 5 ? 'text-gray-500' : 'text-amber-600'}`}>
                                ({extraProduct.stock} units)
                              </span>
                            </div>
                          </div>
                          
                          {/* Add button */}
                          <button
                            type="button"
                            disabled={extraProduct.stock <= 0}
                            onClick={() => {
                              const existing = productExtras.find(e => e.name === extraProduct.name);
                              if (existing) {
                                setProductExtras(prev => prev.map(e => 
                                  e.name === extraProduct.name ? { ...e, quantity: e.quantity + 1 } : e
                                ));
                              } else {
                                setProductExtras(prev => [...prev, { name: extraProduct.name, price: extraProduct.price, quantity: 1 }]);
                              }
                            }}
                            className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                              extraProduct.stock <= 0
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                : 'bg-[#008000] text-white hover:bg-[#006600]'
                            }`}
                          >
                            +
                          </button>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Add to Cart Button */}
              <button
                type="button"
                onClick={() => {
                  // Calculate extras total
                  const extrasTotal = productExtras.reduce((sum, e) => sum + e.price * e.quantity, 0);
                  const itemTotal = (customizeProduct.price * customizeQuantity) + extrasTotal;
                  
                  // Add to cart with extras
                  setCart(prev => {
                    // For custom items with extras, always add as new item to preserve extras
                    const newItem: CartItem = {
                      ...customizeProduct,
                      quantity: customizeQuantity,
                      total: itemTotal,
                      extras: productExtras.length > 0 ? [...productExtras] : undefined
                    };
                    return [...prev, newItem];
                  });
                  
                  // Reduce stock for extras products (update state, localStorage, and Supabase)
                  if (productExtras.length > 0) {
                    // Update localStorage
                    try {
                      const savedProducts = JSON.parse(localStorage.getItem('contabi_products') || '[]') as Product[];
                      const updatedProducts = savedProducts.map(p => {
                        const extraUsed = productExtras.find(e => e.name === p.name);
                        if (extraUsed) {
                          return { ...p, stock: Math.max(0, p.stock - extraUsed.quantity) };
                        }
                        return p;
                      });
                      localStorage.setItem('contabi_products', JSON.stringify(updatedProducts));
                    } catch {}
                    
                    // Update Supabase if user is logged in
                    if (user?.id) {
                      for (const extra of productExtras) {
                        const extraProduct = products.find(p => p.name === extra.name);
                        if (extraProduct && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(extraProduct.id)) {
                          const newStock = Math.max(0, extraProduct.stock - extra.quantity);
                          inventoryService.updateItem(user.id, extraProduct.id, {
                            current_stock: newStock,
                          }).catch(err => console.error('[POS] Error updating extra stock:', err));
                        }
                      }
                    }
                    
                    // Update state
                    setProducts(prev => {
                      const updated = prev.map(p => {
                        const extraUsed = productExtras.find(e => e.name === p.name);
                        if (extraUsed) {
                          return { ...p, stock: Math.max(0, p.stock - extraUsed.quantity) };
                        }
                        return p;
                      });
                      return updated;
                    });
                  }
                  
                  setShowCustomizeModal(false);
                  setCustomizeProduct(null);
                  setCustomizeQuantity(1);
                  setProductExtras([]);
                  toast.success(`Added ${customizeQuantity}x ${customizeProduct.name} to cart`);
                }}
                className="w-full py-3 bg-[#008000] text-white rounded-lg font-semibold hover:bg-[#006600] transition-colors"
              >
                Add to Cart - {money(customizeProduct.price * customizeQuantity + productExtras.reduce((sum, e) => sum + e.price * e.quantity, 0))}
              </button>
            </div>
          </Modal>
        )}

        {/* Modelo Modal - Configure which products can be extras */}
        {showModeloModal && (
          <Modal>
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Configure Extras</h3>
                  <p className="text-sm text-gray-500">Select which products can be added as extras in Custom mode</p>
                </div>
                <button
                  onClick={() => setShowModeloModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  <i className="ri-information-line mr-1"></i>
                  Selected products will appear as add-on options when customizing any product in Custom mode.
                </p>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {products.map((product) => (
                  <label
                    key={product.id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      availableExtras.includes(product.id)
                        ? 'border-[#008000] bg-green-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={availableExtras.includes(product.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            saveAvailableExtras([...availableExtras, product.id]);
                          } else {
                            saveAvailableExtras(availableExtras.filter(id => id !== product.id));
                          }
                        }}
                        className="w-5 h-5 text-[#008000] border-gray-300 rounded focus:ring-[#008000]"
                      />
                      <div>
                        <p className="font-medium text-gray-900">{product.name}</p>
                        <p className="text-xs text-gray-500">{product.category} • Stock: {product.stock}</p>
                      </div>
                    </div>
                    <span className="font-semibold text-[#008000]">{money(product.price)}</span>
                  </label>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  {availableExtras.length} product{availableExtras.length !== 1 ? 's' : ''} selected as extras
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => saveAvailableExtras([])}
                    className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Clear All
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModeloModal(false)}
                    className="px-4 py-2 text-sm text-white bg-[#008000] rounded-lg hover:bg-[#006600] transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        )}

        {/* New Customer Modal */}
        {showNewCustomerModal && (
          <Modal>
            <div className="bg-white rounded-lg p-6 w-96 max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">New Customer</h3>
                <button
                  onClick={() => setShowNewCustomerModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
              
              <form onSubmit={(e) => { e.preventDefault(); addNewCustomer(); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Document *
                  </label>
                  <input
                    type="text"
                    value={newCustomer.document}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, document: formatDocument(e.target.value) }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="001-1234567-8"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: formatPhone(e.target.value) }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="809-123-4567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="cliente@email.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address
                  </label>
                  <textarea
                    value={newCustomer.address}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={2}
                    placeholder="Full address"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Type
                  </label>
                  <select
                    value={newCustomer.type}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, type: e.target.value as 'regular' | 'vip' }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                  >
                    <option value="regular">Regular</option>
                    <option value="vip">VIP</option>
                  </select>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    Save Customer
                  </button>
                </div>
              </form>
            </div>
          </Modal>
        )}

        {/* Print Type Modal - Auto opens after payment */}
        <InvoiceTypeModal
          isOpen={showPrintTypeModal}
          onClose={() => {
            setShowPrintTypeModal(false);
            setCompletedSale(null);
          }}
          onSelect={handlePrintTypeSelect}
          documentType="invoice"
          title="Print Receipt"
        />
      </div>
    </DashboardLayout>
  );
}
