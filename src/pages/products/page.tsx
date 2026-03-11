import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { inventoryService, chartAccountsService, settingsService } from '../../services/database';
import { useAuth } from '../../hooks/useAuth';
import { usePlanLimitations } from '../../hooks/usePlanLimitations';
import SupplierResultsTable from '../../modules/suppliers/SupplierResultsTable';
import SupplierIntelligenceTable from '../../modules/supplier-intelligence/SupplierIntelligenceTable';
import SupplierCatalogManager from '../../modules/supplier-catalog/SupplierCatalogManager';
import { supplierCatalogService } from '../../modules/supplier-catalog/supplierCatalog.service';
import { supplierApiService } from '../../modules/suppliers/supplierApi.service';
import type { SupplierProductResult } from '../../modules/supplier-adapters/SupplierAdapter';

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  maxStock: number;
  barcode: string;
  description: string;
  supplier: string;
  imageUrl: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
  expenseAccountId?: string | null;
  inventoryAccountId?: string | null;
  cogsAccountId?: string | null;
  warehouseId?: string | null;
  preferredSupplier?: string | null;
  lastSupplierPrice?: number | null;
  supplierProductId?: string | null;
  source?: string | null;
  stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
}

interface Category {
  id: string;
  name: string;
}

export default function ProductsPage() {
  const { user } = useAuth();
  const { checkQuantityLimit } = usePlanLimitations();
  const location = useLocation();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [categories, setCategories] = useState<Category[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);

  const [warehouses, setWarehouses] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: '',
    price: '',
    cost: '',
    stock: '',
    minStock: '',
    maxStock: '',
    barcode: '',
    description: '',
    supplier: '',
    imageUrl: '',
    status: 'active' as 'active' | 'inactive',
    expenseAccountId: '' as string | '',
    inventoryAccountId: '' as string | '',
    cogsAccountId: '' as string | '',
    warehouseId: '' as string | '',
    preferredSupplier: '' as string | '',
    lastSupplierPrice: '' as string | '',
    supplierProductId: '' as string | ''
  });

  const [categoryFormData, setCategoryFormData] = useState({
    name: ''
  });

  const [supplierResults, setSupplierResults] = useState<SupplierProductResult[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierError, setSupplierError] = useState('');
  const isSupplierIntelligenceRoute = location.pathname.startsWith('/supplier-intelligence');

  useEffect(() => {
    if (location.pathname.startsWith('/supplier-intelligence')) {
      setActiveTab('products');
      return;
    }

    if (location.pathname === '/products' && activeTab !== 'dashboard' && activeTab !== 'products') {
      setActiveTab('dashboard');
    }
  }, [location.pathname]);

  const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

  useEffect(() => {
    if (isSupplierIntelligenceRoute) {
      setProducts([]);
      setCategories([]);
      setLoading(false);
      return;
    }

    loadProducts();
    loadCategories();
    loadAccounts();
    loadWarehouses();
  }, [user, isSupplierIntelligenceRoute]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      if (user) {
        const data = await inventoryService.getItems(user.id);
        if (data && data.length > 0) {
          const transformedProducts = data.map((item: any) => ({
            id: item.id,
            name: item.name,
            sku: item.sku,
            category: item.category || 'Electrónicos',
            price: item.selling_price || 0,
            cost: item.cost_price || 0,
            stock: item.current_stock || 0,
            minStock: item.min_stock || 0,
            maxStock: item.max_stock || 0,
            barcode: item.barcode || '',
            description: item.description || '',
            supplier: item.supplier || '',
            imageUrl: item.image_url || '',
            status: item.is_active ? 'active' : 'inactive',
            createdAt: item.created_at,
            updatedAt: item.updated_at,
            expenseAccountId: item.expense_account_id || null,
            inventoryAccountId: item.inventory_account_id || null,
            cogsAccountId: item.cogs_account_id || null,
            warehouseId: item.warehouse_id || null,
            preferredSupplier: item.preferred_supplier || item.supplier || null,
            lastSupplierPrice: item.last_supplier_price ?? item.last_purchase_price ?? null,
            supplierProductId: item.supplier_product_id || null,
          }));
          setProducts(transformedProducts);
        } else {
          setProducts([]);
        }
      } else {
        setProducts([]);
      }
    } catch (error) {
      console.error('Error loading products:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async () => {
    if (!user) return;
    try {
      const data = await chartAccountsService.getAll(user.id);
      const options = (data || [])
        .filter((acc: any) => acc.allow_posting !== false)
        .map((acc: any) => ({ id: acc.id, code: acc.code, name: acc.name }));
      setAccounts(options);
    } catch (error) {
      console.error('Error loading chart of accounts for products:', error);
    }
  };

  const loadWarehouses = async () => {
    try {
      const data = await settingsService.getWarehouses();
      setWarehouses(data || []);
    } catch (error) {
      console.error('Error loading warehouses for products:', error);
      setWarehouses([]);
    }
  };

  const loadCategories = () => {
    try {
      const saved = localStorage.getItem('contabi_categories');
      if (saved) {
        setCategories(JSON.parse(saved));
      } else if (products.length > 0) {
        const unique = Array.from(new Set(products.map(p => p.category).filter(Boolean))).map((name, idx) => ({ id: `${idx + 1}` , name }));
        setCategories(unique);
        localStorage.setItem('contabi_categories', JSON.stringify(unique));
      } else {
        setCategories([]);
      }
    } catch {}
  };

  const saveCategories = (next: Category[]) => {
    try {
      localStorage.setItem('contabi_categories', JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('categoriesUpdated'));
    } catch {}
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.barcode.includes(searchTerm) ||
                         product.supplier.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    const matchesStatus = selectedStatus === 'all' || 
                         (selectedStatus === 'low_stock' && product.stock <= product.minStock) ||
                         product.status === selectedStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  useEffect(() => {
    setShowBulkActions(selectedProducts.length > 0);
  }, [selectedProducts]);

  useEffect(() => {
    const normalizedSearch = searchTerm.trim();
    let isCancelled = false;

    if (!isSupplierIntelligenceRoute) {
      setSupplierResults([]);
      setSupplierError('');
      setSupplierLoading(false);
      return;
    }

    if (!user?.id) {
      setSupplierResults([]);
      setSupplierError('');
      setSupplierLoading(false);
      return;
    }

    if (!normalizedSearch) {
      setSupplierLoading(true);
      supplierCatalogService.searchProducts('', user.id).then((results) => {
        if (isCancelled) {
          return;
        }
        setSupplierError('');
        setSupplierResults(Array.isArray(results) ? results : []);
      }).catch((error: any) => {
        if (isCancelled) {
          return;
        }
        setSupplierResults([]);
        setSupplierError(error?.message || '⚠️ Unable to load imported supplier catalog.');
      }).finally(() => {
        if (!isCancelled) {
          setSupplierLoading(false);
        }
      });
      return () => {
        isCancelled = true;
      };
    }

    const timeoutId = window.setTimeout(async () => {
      setSupplierLoading(true);

      try {
        setSupplierError('');
        const results = await supplierApiService.searchProducts(normalizedSearch, {
          sortBy: 'price',
          limit: 50,
          userId: user.id,
        });

        if (isCancelled) {
          return;
        }

        console.log('Supplier search query:', normalizedSearch);
        console.log('Supplier results:', results.length);

        setSupplierResults(Array.isArray(results) ? results : []);
      } catch (error: any) {
        if (isCancelled) {
          return;
        }

        console.error('Supplier search error:', error);
        setSupplierResults([]);
        setSupplierError(error?.message || '⚠️ Unable to load suppliers. Please try again.');
      } finally {
        if (!isCancelled) {
          setSupplierLoading(false);
        }
      }
    }, 350);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isSupplierIntelligenceRoute, searchTerm, user?.id]);

  useEffect(() => {
    const activeProducts = products
      .filter(p => p.status === 'active')
      .map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        stock: p.stock,
        category: p.category,
        barcode: p.barcode,
        imageUrl: p.imageUrl,
        sku: p.sku,
        cost: p.cost,
        minStock: p.minStock,
        maxStock: p.maxStock,
        description: p.description,
        supplier: p.supplier,
        status: p.status,
        preferredSupplier: p.preferredSupplier,
        lastSupplierPrice: p.lastSupplierPrice,
        supplierProductId: p.supplierProductId,
      }));
    try {
      localStorage.setItem('contabi_products', JSON.stringify(activeProducts));
      window.dispatchEvent(new CustomEvent('productsUpdated'));
    } catch {}
  }, [products]);

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!categoryFormData.name.trim()) {
      alert('Por favor ingrese un nombre para la categoría');
      return;
    }

    // Check if category already exists
    const categoryExists = categories.some(cat => 
      cat.name.toLowerCase() === categoryFormData.name.trim().toLowerCase()
    );

    if (categoryExists) {
      alert('Esta categoría ya existe');
      return;
    }

    try {
      const newCategory: Category = {
        id: editingCategory?.id || Date.now().toString(),
        name: categoryFormData.name.trim()
      };

      if (editingCategory) {
        // Update existing category
        setCategories(prev => {
          const next = prev.map(cat => cat.id === editingCategory.id ? newCategory : cat);
          saveCategories(next);
          return next;
        });
        
        // Update products that use this category
        setProducts(prev => prev.map(product => 
          product.category === editingCategory.name 
            ? { ...product, category: newCategory.name, updatedAt: new Date().toISOString() }
            : product
        ));
      } else {
        // Add new category
        setCategories(prev => {
          const next = [...prev, newCategory];
          saveCategories(next);
          return next;
        });
      }

      resetCategoryForm();
      setShowCategoryModal(false);
    } catch (error) {
      console.error('Error saving category:', error);
      alert('Error al guardar la categoría. Intente nuevamente.');
    }
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setCategoryFormData({
      name: category.name
    });
    setShowCategoryModal(true);
  };

  const handleDeleteCategory = (categoryId: string) => {
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return;

    const productsInCategory = products.filter(p => p.category === category.name);
    
    if (productsInCategory.length > 0) {
      alert(`No se puede eliminar la categoría "${category.name}" porque tiene ${productsInCategory.length} productos asociados. Primero mueva los productos a otra categoría.`);
      return;
    }

    if (confirm(`¿Está seguro de que desea eliminar la categoría "${category.name}"?`)) {
      setCategories(prev => {
        const next = prev.filter(cat => cat.id !== categoryId);
        saveCategories(next);
        return next;
      });
    }
  };

  const resetCategoryForm = () => {
    setCategoryFormData({
      name: ''
    });
    setEditingCategory(null);
  };

  const totalProducts = products.length;
  const activeProducts = isSupplierIntelligenceRoute
    ? supplierResults.length
    : products.filter(p => p.status === 'active').length;
  const lowStockProducts = isSupplierIntelligenceRoute
    ? supplierResults.filter((p: any) => Number(p?.stock) <= 5).length
    : products.filter(p => p.stock <= p.minStock).length;
  const totalValue = products.reduce((sum, p) => sum + (p.price * p.stock), 0);
  const displayProducts = filteredProducts;

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const maxSizeBytes = 2 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      alert('Image too large. Maximum size is 2MB.');
      event.target.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setFormData(prev => ({ ...prev, imageUrl: e.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (!editingProduct) {
        const { allowed, message } = checkQuantityLimit('maxProducts', products.length);
        if (!allowed) {
          alert(message || 'Has alcanzado el límite de productos de tu plan.');
          return;
        }
      }

      const newProduct: Product = {
        id: editingProduct?.id || Date.now().toString(),
        name: formData.name,
        sku: formData.sku,
        category: formData.category,
        price: parseFloat(formData.price),
        cost: parseFloat(formData.cost),
        stock: parseInt(formData.stock),
        minStock: parseInt(formData.minStock),
        maxStock: parseInt(formData.maxStock),
        barcode: formData.barcode,
        description: formData.description,
        supplier: formData.supplier,
        imageUrl: formData.imageUrl,
        status: formData.status,
        createdAt: editingProduct?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expenseAccountId: formData.expenseAccountId || null,
        inventoryAccountId: formData.inventoryAccountId || null,
        cogsAccountId: formData.cogsAccountId || null,
        warehouseId: formData.warehouseId || null,
        preferredSupplier: formData.preferredSupplier || formData.supplier || null,
        lastSupplierPrice: formData.lastSupplierPrice ? parseFloat(formData.lastSupplierPrice) : null,
        supplierProductId: formData.supplierProductId || null,
      };

      if (user) {
        const itemData = {
          name: formData.name,
          sku: formData.sku,
          category: formData.category,
          selling_price: parseFloat(formData.price),
          cost_price: parseFloat(formData.cost),
          current_stock: parseInt(formData.stock),
          min_stock: parseInt(formData.minStock),
          max_stock: parseInt(formData.maxStock),
          barcode: formData.barcode,
          description: formData.description,
          supplier: formData.supplier,
          image_url: formData.imageUrl,
          is_active: formData.status === 'active',
          expense_account_id: formData.expenseAccountId || null,
          inventory_account_id: formData.inventoryAccountId || null,
          cogs_account_id: formData.cogsAccountId || null,
          warehouse_id: formData.warehouseId || null,
          preferred_supplier: formData.preferredSupplier || formData.supplier || null,
          last_supplier_price: formData.lastSupplierPrice ? parseFloat(formData.lastSupplierPrice) : null,
          supplier_product_id: formData.supplierProductId || null,
        };

        if (editingProduct && isUuid(editingProduct.id)) {
          await inventoryService.updateItem(user.id, editingProduct.id, itemData);
        } else {
          await inventoryService.createItem(user.id, itemData);
        }
      }

      if (editingProduct) {
        setProducts(prev => prev.map(p => p.id === editingProduct.id ? newProduct : p));
      } else {
        setProducts(prev => [...prev, newProduct]);
      }

      resetForm();
      setShowModal(false);
    } catch (error) {
      console.error('Error saving product:', error);
      alert('Error al guardar el producto. Intente nuevamente.');
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku,
      category: product.category,
      price: product.price.toString(),
      cost: product.cost.toString(),
      stock: product.stock.toString(),
      minStock: product.minStock.toString(),
      maxStock: product.maxStock.toString(),
      barcode: product.barcode,
      description: product.description,
      supplier: product.supplier,
      imageUrl: product.imageUrl,
      status: product.status,
      expenseAccountId: product.expenseAccountId || '',
      inventoryAccountId: product.inventoryAccountId || '',
      cogsAccountId: product.cogsAccountId || '',
      warehouseId: product.warehouseId || '',
      preferredSupplier: product.preferredSupplier || '',
      lastSupplierPrice: product.lastSupplierPrice != null ? String(product.lastSupplierPrice) : '',
      supplierProductId: product.supplierProductId || '',
    });
    setShowModal(true);
  };

  const handleUseSupplierQuote = (quote: SupplierProductResult) => {
    setFormData((prev) => ({
      ...prev,
      name: quote.productName,
      sku: quote.sku,
      category: quote.category,
      price: String(quote.price),
      cost: String(quote.price),
      stock: prev.stock || String(quote.quantity || 1),
      description: quote.description,
      supplier: quote.supplier,
      preferredSupplier: quote.supplier,
      lastSupplierPrice: String(quote.price),
      supplierProductId: quote.productId,
    }));
    setShowModal(true);
  };

  const handleAddQuoteToInvoice = (quote: SupplierProductResult) => {
    navigate('/accounts-payable/invoices', {
      state: {
        prefillSupplierQuote: {
          supplier: quote.supplier,
          supplierProductId: quote.productId,
          delivery: quote.delivery,
          productName: quote.productName,
          quantity: quote.quantity,
          price: quote.price,
          sku: quote.sku,
          description: quote.description,
        },
      },
    });
  };

  const handleCreatePurchaseOrderFromQuote = async (quote: SupplierProductResult) => {
    try {
      const response = await supplierApiService.createPurchaseOrderFromQuote(quote);
      const draft = response?.purchaseOrderDraft;
      navigate('/accounts-payable/purchase-orders', {
        state: {
          prefillSupplierQuote: {
            ...draft,
            supplierName: quote.supplier,
            quantity: quote.quantity,
            productName: quote.productName,
            delivery: quote.delivery,
            price: quote.price,
          },
        },
      });
    } catch (error: any) {
      alert(error?.message || 'No se pudo preparar la orden de compra.');
    }
  };

  const handleDeleteSupplierQuote = async (quote: SupplierProductResult) => {
    if (!user?.id) return;
    if (!confirm('¿Está seguro de que desea eliminar este producto importado?')) {
      return;
    }

    try {
      const quoteSku = String(quote.sku || '').trim().toLowerCase();
      const quoteName = String(quote.productName || '').trim().toLowerCase();

      const catalogProducts = await supplierCatalogService.getProducts(user.id);
      const catalogMatch = catalogProducts.find((item) => {
        const itemSku = String(item.sku || '').trim().toLowerCase();
        const itemName = String(item.productName || '').trim().toLowerCase();
        if (quoteSku && itemSku === quoteSku) return true;
        return itemName === quoteName;
      });

      if (catalogMatch?.id) {
        await supplierCatalogService.deleteProduct(user.id, catalogMatch.id);
      }

      const inventoryItems = await inventoryService.getItems(user.id);
      const inventoryMatch = (inventoryItems || []).find((item: any) => {
        const itemSku = String(item?.sku || '').trim().toLowerCase();
        const itemName = String(item?.name || '').trim().toLowerCase();
        if (quoteSku && itemSku === quoteSku) return true;
        return itemName === quoteName;
      });

      if (inventoryMatch?.id) {
        await inventoryService.deleteItem(String(inventoryMatch.id));
      }

      window.dispatchEvent(new CustomEvent('productsUpdated'));

      const refreshed = searchTerm.trim()
        ? await supplierApiService.searchProducts(searchTerm.trim(), {
            sortBy: 'price',
            limit: 50,
            userId: user.id,
          })
        : await supplierCatalogService.searchProducts('', user.id);

      setSupplierResults(Array.isArray(refreshed) ? refreshed : []);
    } catch (error: any) {
      console.error('Supplier quote delete error:', error);
      setSupplierError(error?.message || '⚠️ Unable to remove imported supplier product.');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Está seguro de que desea eliminar este producto?')) {
      try {
        if (user) {
          await inventoryService.deleteItem(id);
        }
        setProducts(prev => prev.filter(p => p.id !== id));
      } catch (error) {
        console.error('Error deleting product:', error);
        alert('Error al eliminar el producto. Intente nuevamente.');
      }
    }
  };

  const handleBulkDelete = async () => {
    if (confirm(`¿Está seguro de que desea eliminar ${selectedProducts.length} productos seleccionados?`)) {
      try {
        for (const id of selectedProducts) {
          if (user) {
            await inventoryService.deleteItem(id);
          }
        }
        setProducts(prev => prev.filter(p => !selectedProducts.includes(p.id)));
        setSelectedProducts([]);
        setShowBulkActions(false);
      } catch (error) {
        console.error('Error deleting products:', error);
        alert('Error al eliminar los productos. Intente nuevamente.');
      }
    }
  };

  const handleBulkStatusChange = (status: 'active' | 'inactive') => {
    setProducts(prev => prev.map(p =>
      selectedProducts.includes(p.id) ? { ...p, status, updatedAt: new Date().toISOString() } : p
    ));
    setSelectedProducts([]);
    setShowBulkActions(false);
  };

  const exportToCSV = () => {
    const headers = ['Nombre', 'SKU', 'Categoría', 'Precio', 'Costo', 'Stock', 'Stock Mín', 'Stock Máx', 'Proveedor', 'Estado'];
    const csvContent = [
      headers.join(','),
      ...filteredProducts.map(product => [
        `"${product.name}"`,
        product.sku,
        product.category,
        product.price,
        product.cost,
        product.stock,
        product.minStock,
        product.maxStock,
        `"${product.supplier}"`,
        product.status === 'active' ? 'Activo' : 'Inactivo'
      ].join(','))
    ].join('\n');

    const csvForExcel = '\uFEFF' + csvContent.replace(/\n/g, '\r\n');
    const blob = new Blob([csvForExcel], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `productos_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      sku: '',
      category: '',
      price: '',
      cost: '',
      stock: '',
      minStock: '',
      maxStock: '',
      barcode: '',
      description: '',
      supplier: '',
      imageUrl: '',
      status: 'active',
      expenseAccountId: '',
      inventoryAccountId: '',
      cogsAccountId: '',
      warehouseId: ''
      ,preferredSupplier: ''
      ,lastSupplierPrice: ''
      ,supplierProductId: ''
    });
    setEditingProduct(null);
  };

  const generateSKU = () => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `PRD-${timestamp}-${random}`;
  };

  const generateBarcode = () => {
    return Math.floor(Math.random() * 9000000000000) + 1000000000000;
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const selectAllProducts = () => {
    if (selectedProducts.length === filteredProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProducts.map(p => p.id));
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando módulo de productos...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => window.REACT_APP_NAVIGATE('/dashboard')}
              className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
            >
              <i className="ri-arrow-left-line mr-2"></i>
              Volver al Inicio
            </button>
            <div className="h-6 w-px bg-gray-300"></div>
            <h1 className="text-2xl font-bold text-gray-900">{isSupplierIntelligenceRoute ? 'Supplier Intelligence' : 'Gestión de Productos'}</h1>
          </div>
          {!isSupplierIntelligenceRoute ? (
            <button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-add-line mr-2"></i>
              Agregar Producto
            </button>
          ) : null}
        </div>

        {/* Tabs */}
        {!isSupplierIntelligenceRoute ? (
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <i className="ri-dashboard-line mr-2"></i>
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('products')}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'products'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <i className="ri-shopping-bag-line mr-2"></i>
              Productos
            </button>
            <button
              onClick={() => setActiveTab('categories')}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'categories'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <i className="ri-folder-line mr-2"></i>
              Categorías
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'reports'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <i className="ri-file-chart-line mr-2"></i>
              Reportes
            </button>
          </nav>
        </div>
        ) : null}

        {isSupplierIntelligenceRoute ? (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-600 to-emerald-600 rounded-2xl p-6 text-white shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-blue-100">Supplier Intelligence</p>
                  <h2 className="mt-2 text-3xl font-bold">Compare suppliers in a dedicated view</h2>
                  <p className="mt-2 text-sm text-blue-50 max-w-3xl">
                    Search materials or products and compare pricing, delivery, stock, and direct actions for quotes, invoices, and purchase orders.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:min-w-[320px]">
                  <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
                    <p className="text-xs text-blue-100">Active Products</p>
                    <p className="mt-1 text-2xl font-semibold">{activeProducts}</p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
                    <p className="text-xs text-blue-100">Low Stock</p>
                    <p className="mt-1 text-2xl font-semibold">{lowStockProducts}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative md:col-span-2">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <i className="ri-search-line text-gray-400"></i>
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="Search hammer, drill, screws, ceramic..."
                  />
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <span className="font-medium">{supplierResults.length}</span>
                  <span className="ml-1">offers found</span>
                </div>
              </div>
            </div>

            <SupplierIntelligenceTable
              loading={supplierLoading}
              query={searchTerm}
              results={supplierResults}
              error={supplierError}
              onDeleteQuote={handleDeleteSupplierQuote}
              onUseQuote={handleUseSupplierQuote}
              onAddToInvoice={handleAddQuoteToInvoice}
              onCreatePurchaseOrder={handleCreatePurchaseOrderFromQuote}
            />

            <SupplierCatalogManager compact onCatalogUpdated={() => {
              if (!user?.id) {
                setSupplierResults([]);
                setSupplierError('');
                setSupplierLoading(false);
                return;
              }
              setSupplierLoading(true);
              const refreshPromise = searchTerm.trim()
                ? supplierApiService.searchProducts(searchTerm.trim(), {
                    sortBy: 'price',
                    limit: 50,
                    userId: user.id,
                  })
                : supplierCatalogService.searchProducts('', user.id);

              refreshPromise.then((results) => {
                setSupplierResults(Array.isArray(results) ? results : []);
              }).catch((error: any) => {
                console.error('Supplier catalog refresh error:', error);
                setSupplierError(error?.message || '⚠️ Unable to refresh suppliers after import.');
              }).finally(() => {
                setSupplierLoading(false);
              });
            }} />

            {!isSupplierIntelligenceRoute && (
              <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Related Internal Products</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Use this reference to see which items already exist in your inventory before using a quote.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {displayProducts.slice(0, 8).map((product) => (
                    <div key={product.id} className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">{product.category}</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${product.stock <= product.minStock ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {product.stock <= product.minStock ? 'Low Stock' : 'Available'}
                        </span>
                      </div>
                      <h4 className="font-medium text-gray-900">{product.name}</h4>
                      <p className="text-xs text-gray-500 mt-1">SKU: {product.sku}</p>
                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="text-gray-600">Stock: {product.stock}</span>
                        <span className="font-semibold text-gray-900">{product.price.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Dashboard Tab */}
        {!isSupplierIntelligenceRoute && activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className="p-3 rounded-full bg-blue-100">
                    <i className="ri-shopping-bag-line text-2xl text-blue-600"></i>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Productos</p>
                    <p className="text-2xl font-semibold text-gray-900">{products.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className="p-3 rounded-full bg-green-100">
                    <i className="ri-check-line text-2xl text-green-600"></i>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Productos Activos</p>
                    <p className="text-2xl font-semibold text-gray-900">{products.filter(p => p.status === 'active').length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className="p-3 rounded-full bg-red-100">
                    <i className="ri-alert-line text-2xl text-red-600"></i>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Stock Bajo</p>
                    <p className="text-2xl font-semibold text-gray-900">{products.filter(p => p.stock <= p.minStock).length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className="p-3 rounded-full bg-purple-100">
                    <i className="ri-money-dollar-circle-line text-2xl text-purple-600"></i>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Valor Total</p>
                    <p className="text-2xl font-semibold text-gray-900">{products.reduce((sum, p) => sum + (p.price * p.stock), 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Resumen Financiero</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <p className="text-sm text-gray-600">Valor Total Inventario</p>
                  <p className="text-2xl font-bold text-blue-600">{products.reduce((sum, p) => sum + (p.price * p.stock), 0).toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Costo Total</p>
                  <p className="text-2xl font-bold text-orange-600">{products.reduce((sum, p) => sum + (p.cost * p.stock), 0).toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Ganancia Potencial</p>
                  <p className="text-2xl font-bold text-green-600">{(products.reduce((sum, p) => sum + (p.price * p.stock), 0) - products.reduce((sum, p) => sum + (p.cost * p.stock), 0)).toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Low Stock Alert */}
            {products.filter(p => p.stock <= p.minStock).length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <i className="ri-alert-line text-red-600 text-xl mr-3"></i>
                  <div>
                    <h4 className="text-red-800 font-medium">Alerta de Stock Bajo</h4>
                    <p className="text-red-700 text-sm">
                      {products.filter(p => p.stock <= p.minStock).length} productos tienen stock por debajo del mínimo recomendado.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setActiveTab('products');
                      setSelectedStatus('low_stock');
                    }}
                    className="ml-auto bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm whitespace-nowrap"
                  >
                    Ver Productos
                  </button>
                </div>
              </div>
            )}

        {/* Product Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* datos básicos ya existentes (nombre, sku, precios, etc.) */}
                  {/* ... se mantienen sin cambios ... */}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cuenta Contable (Compras/Gastos)
                    </label>
                    <select
                      value={formData.expenseAccountId}
                      onChange={(e) => setFormData(prev => ({ ...prev, expenseAccountId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Sin cuenta asignada</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cuenta de Inventario
                    </label>
                    <select
                      value={formData.inventoryAccountId}
                      onChange={(e) => setFormData(prev => ({ ...prev, inventoryAccountId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Sin cuenta asignada</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cuenta de Costo de Ventas
                    </label>
                    <select
                      value={formData.cogsAccountId}
                      onChange={(e) => setFormData(prev => ({ ...prev, cogsAccountId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Sin cuenta asignada</option>
                      {accounts
                        .filter((acc) => {
                          const code = String(acc.code || '');
                          const normalized = code.replace(/\./g, '');
                          return normalized.startsWith('5');
                        })
                        .map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} - {acc.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Almacén
                    </label>
                    <select
                      value={formData.warehouseId || (warehouses[0]?.id ?? '')}
                      onChange={(e) =>
                        setFormData(prev => ({ ...prev, warehouseId: e.target.value || '' }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {warehouses.length === 0 && (
                        <option value="">Sin almacenes configurados</option>
                      )}
                      {warehouses.map((wh) => (
                        <option key={wh.id} value={wh.id}>
                          {wh.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setShowModal(false);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

            {/* Recent Products */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Productos Recientes</h3>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {products.slice(0, 5).map((product) => (
                    <div key={product.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                      <div className="flex items-center space-x-4">
                        <img
                          src={product.imageUrl || 'https://readdy.ai/api/search-image?query=generic%20product%20placeholder%20on%20clean%20white%20background%2C%20professional%20product%20photography%2C%20high%20quality%2C%20detailed%20view%2C%20simple%20design&width=60&height=60&seq=placeholder002&orientation=squarish'}
                          alt={product.name}
                          className="w-12 h-12 object-cover object-top rounded-lg"
                        />
                        <div>
                          <h4 className="font-medium text-gray-900">{product.name}</h4>
                          <p className="text-sm text-gray-500">{product.sku}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-gray-900">{product.price.toLocaleString()}</p>
                        <p className="text-sm text-gray-500">Stock: {product.stock}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Products Tab */}
        {!isSupplierIntelligenceRoute && activeTab === 'products' && (
          <div className="space-y-6">
            <SupplierResultsTable
              loading={supplierLoading}
              query={searchTerm}
              results={supplierResults}
              error={supplierError}
              onUseQuote={handleUseSupplierQuote}
              onAddToInvoice={handleAddQuoteToInvoice}
              onCreatePurchaseOrder={handleCreatePurchaseOrderFromQuote}
            />

            {/* Filters and Actions */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <i className="ri-search-line text-gray-400"></i>
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="Buscar productos..."
                  />
                </div>
                
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm pr-8"
                >
                  <option value="all">Todas las Categorías</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.name}>{category.name}</option>
                  ))}
                </select>

                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm pr-8"
                >
                  <option value="all">Todos los Estados</option>
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                  <option value="low_stock">Stock Bajo</option>
                </select>

                <button
                  onClick={exportToCSV}
                  className="bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors text-sm whitespace-nowrap"
                >
                  <i className="ri-download-line mr-2"></i>
                  Exportar Excel
                </button>

                <div className="text-sm text-gray-600 flex items-center">
                  <span className="font-medium">{filteredProducts.length}</span>
                  <span className="ml-1">productos</span>
                </div>
              </div>

              {/* Bulk Actions */}
              {showBulkActions && (
                <div className="flex items-center justify-between bg-blue-50 p-3 rounded-lg">
                  <span className="text-sm text-blue-800">
                    {selectedProducts.length} productos seleccionados
                  </span>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleBulkStatusChange('active')}
                      className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors whitespace-nowrap"
                    >
                      Activar
                    </button>
                    <button
                      onClick={() => handleBulkStatusChange('inactive')}
                      className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700 transition-colors whitespace-nowrap"
                    >
                      Desactivar
                    </button>
                    <button
                      onClick={handleBulkDelete}
                      className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 transition-colors whitespace-nowrap"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )}

              {/* Select All */}
              <div className="flex items-center mt-4">
                <input
                  type="checkbox"
                  checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                  onChange={selectAllProducts}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 text-sm text-gray-600">
                  Seleccionar todos los productos visibles
                </label>
              </div>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProducts.length === 0 ? (
                <div className="col-span-full text-center py-12">
                  <i className="ri-shopping-bag-line text-6xl text-gray-300 mb-4 block"></i>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No hay productos registrados</h3>
                  <p className="text-gray-500 mb-4">Comience agregando su primer producto al inventario.</p>
                  <button
                    onClick={() => {
                      resetForm();
                      setShowModal(true);
                    }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-add-line mr-2"></i>
                    Agregar Primer Producto
                  </button>
                </div>
              ) : (
                filteredProducts.map((product) => (
                  <div key={product.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    {/* Selection Checkbox */}
                    <div className="p-3 border-b border-gray-100">
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(product.id)}
                        onChange={() => toggleProductSelection(product.id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </div>

                    {/* Product Image */}
                    <div className="w-full h-48 bg-gray-100 overflow-hidden">
                      <img
                        src={product.imageUrl || 'https://readdy.ai/api/search-image?query=generic%20product%20placeholder%20on%20clean%20white%20background%2C%20professional%20product%20photography%2C%20high%20quality%2C%20detailed%20view%2C%20simple%20design&width=300&height=300&seq=placeholder003&orientation=squarish'}
                        alt={product.name}
                        className="w-full h-full object-cover object-top"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDMwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xNTAgMTAwQzE2MS4wNDYgMTAwIDE3MCA5MC45NTQzIDE3MCA4MEM1NyA2OS4wNDU3IDE0Ny45NTQgNjAgMTM2IDYwQzEyNC45NTQgNjAgMTE2IDY5LjA0NTcgMTE2IDgwQzExNiA5MC45NTQzIDEyNC45NTQgMTAwIDEzNiAxMDBIMTUwWiIgZmlsbD0iIzlDQTNBRiIvPgo8cGF0aCBkPSJNMTg2IDEyMEgxMTRDMTA3LjM3MyAxMjAgMTAyIDEyNS4zNzMgMTAyIDEzMlYyMDBDMTAyIDIwNi42MjcgMTA3LjM3MyAyMTIgMTE0IDIxMkgxODZDMTkyLjYyNyAyMTIgMTk4IDIwNi4yMjJgMTk0IDIwMFYxMzJDMTk0IDEyNS4zNzMgMTkyLjYyNyAxMjAgMTg2IDEyMFoiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+';
                        }}
                      />
                    </div>

                    {/* Product Info */}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">{product.category}</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          product.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {product.status === 'active' ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>

                      <h3 className="font-semibold text-gray-900 mb-1 text-sm">{product.name}</h3>
                      <p className="text-xs text-gray-500 mb-2">SKU: {product.sku}</p>
                      <p className="text-xs text-gray-500 mb-3">Supplier: {product.supplier || 'N/A'}</p>
                      
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-lg font-bold text-blue-600">{product.price.toLocaleString()}</div>
                          <div className="text-xs text-gray-500">Costo: {product.cost.toLocaleString()}</div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-medium ${product.stock <= product.minStock ? 'text-red-600' : 'text-gray-900'}`}>
                            Stock: {product.stock}
                          </div>
                          <div className="text-xs text-gray-500">Min: {product.minStock}</div>
                        </div>
                      </div>

                      {product.stock <= product.minStock ? (
                        <div className="bg-red-50 text-red-700 text-xs p-2 rounded mb-3">
                          <i className="ri-alert-line mr-1"></i>
                          Stock bajo
                        </div>
                      ) : null}

                      {/* Actions */}
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(product)}
                          className="flex-1 bg-blue-50 text-blue-600 py-2 px-3 rounded-lg hover:bg-blue-100 transition-colors text-sm whitespace-nowrap"
                        >
                          <i className="ri-edit-line mr-1"></i>
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="flex-1 bg-red-50 text-red-600 py-2 px-3 rounded-lg hover:bg-red-100 transition-colors text-sm whitespace-nowrap"
                        >
                          <i className="ri-delete-bin-line mr-1"></i>
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Categories Tab */}
        {activeTab === 'categories' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-gray-900">Gestión de Categorías</h3>
                  <button
                    onClick={() => {
                      resetCategoryForm();
                      setShowCategoryModal(true);
                    }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-add-line mr-2"></i>
                    Nueva Categoría
                  </button>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categories.map((category) => {
                    const categoryProducts = products.filter(p => p.category === category.name);
                    const categoryValue = categoryProducts.reduce((sum, p) => sum + (p.price * p.stock), 0);
                    
                    return (
                      <div key={category.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium text-gray-900 text-lg">{category.name}</h4>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleEditCategory(category)}
                              className="text-blue-600 hover:text-blue-800 transition-colors"
                              title="Editar categoría"
                            >
                              <i className="ri-edit-line"></i>
                            </button>
                            <button
                              onClick={() => handleDeleteCategory(category.id)}
                              className="text-red-600 hover:text-red-800 transition-colors"
                              title="Eliminar categoría"
                            >
                              <i className="ri-delete-bin-line"></i>
                            </button>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Productos:</span>
                            <span className="font-medium text-gray-900">{categoryProducts.length}</span>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Valor total:</span>
                            <span className="font-medium text-green-600">{categoryValue.toLocaleString()}</span>
                          </div>
                          
                          {categoryProducts.length > 0 && (
                            <button
                              onClick={() => {
                                setActiveTab('products');
                                setSelectedCategory(category.name);
                                setSearchTerm('');
                                setSelectedStatus('all');
                              }}
                              className="w-full mt-3 bg-blue-50 text-blue-600 py-2 px-3 rounded-lg hover:bg-blue-100 transition-colors text-sm whitespace-nowrap"
                            >
                              <i className="ri-eye-line mr-2"></i>
                              Ver Productos
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {categories.length === 0 && (
                  <div className="text-center py-12">
                    <i className="ri-folder-line text-6xl text-gray-300 mb-4 block"></i>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No hay categorías registradas</h3>
                    <p className="text-gray-500 mb-4">Comience creando su primera categoría de productos.</p>
                    <button
                      onClick={() => {
                        resetCategoryForm();
                        setShowCategoryModal(true);
                      }}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                    >
                      <i className="ri-add-line mr-2"></i>
                      Crear Primera Categoría
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Reporte de Inventario</h3>
                <p className="text-gray-600 mb-4">Exportar lista completa de productos con stock y precios.</p>
                <button
                  onClick={exportToCSV}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  <i className="ri-download-line mr-2"></i>
                  Descargar Excel
                </button>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Productos con Stock Bajo</h3>
                <p className="text-gray-600 mb-4">Lista de productos que necesitan reabastecimiento.</p>
                <button
                  onClick={() => {
                    const lowStockData = products.filter(p => p.stock <= p.minStock);
                    const headers = ['Nombre', 'SKU', 'Stock Actual', 'Stock Mínimo', 'Diferencia'];
                    const csvContent = [
                      headers.join(','),
                      ...lowStockData.map(product => [
                        `"${product.name}"`,
                        product.sku,
                        product.stock,
                        product.minStock,
                        product.minStock - product.stock
                      ].join(','))
                    ].join('\n');

                    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `stock_bajo_${new Date().toISOString().split('T')[0]}.csv`;
                    link.click();
                  }}
                  className="w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                >
                  <i className="ri-alert-line mr-2"></i>
                  Descargar Reporte
                </button>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Valorización de Inventario</h3>
                <p className="text-gray-600 mb-4">Reporte financiero del valor total del inventario.</p>
                <button
                  onClick={() => {
                    const headers = ['Categoría', 'Productos', 'Valor Total', 'Costo Total', 'Ganancia'];
                    const categoryData = categories.map(cat => {
                      const catProducts = products.filter(p => p.category === cat.name);
                      const totalValue = catProducts.reduce((sum, p) => sum + (p.price * p.stock), 0);
                      const totalCost = catProducts.reduce((sum, p) => sum + (p.cost * p.stock), 0);
                      return [
                        cat.name,
                        catProducts.length,
                        totalValue,
                        totalCost,
                        totalValue - totalCost
                      ];
                    });

                    const csvContent = [
                      headers.join(','),
                      ...categoryData.map(row => row.join(','))
                    ].join('\n');

                    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `valorizacion_${new Date().toISOString().split('T')[0]}.csv`;
                    link.click();
                  }}
                  className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
                >
                  <i className="ri-money-dollar-circle-line mr-2"></i>
                  Descargar Valorización
                </button>
              </div>
            </div>

            {/* Statistics Summary */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Estadísticas Generales</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">{totalProducts}</p>
                  <p className="text-sm text-gray-600">Total de Productos</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{activeProducts}</p>
                  <p className="text-sm text-gray-600">Productos Activos</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{lowStockProducts}</p>
                  <p className="text-sm text-gray-600">Stock Bajo</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-600">{totalValue.toLocaleString()}</p>
                  <p className="text-sm text-gray-600">Valor Total</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Category Modal */}
        {showCategoryModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-md">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
                  </h2>
                  <button
                    onClick={() => setShowCategoryModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>

                <form onSubmit={handleCategorySubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre de la Categoría *
                    </label>
                    <input
                      type="text"
                      required
                      value={categoryFormData.name}
                      onChange={(e) => setCategoryFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ej: Electrónicos, Ropa, Hogar..."
                    />
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowCategoryModal(false)}
                      className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                    >
                      {editingCategory ? 'Actualizar' : 'Crear'} Categoría
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Product Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {editingProduct ? 'Editar Producto' : 'Agregar Producto'}
                  </h2>
                  <button
                    onClick={() => setShowModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="ri-close-line text-xl"></i>
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Product Image */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Imagen del Producto
                    </label>
                    <div className="flex items-center space-x-4">
                      {formData.imageUrl && (
                        <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden">
                          <img
                            src={formData.imageUrl}
                            alt="Preview"
                            className="w-full h-full object-cover object-top"
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 transition-colors text-center"
                        >
                          <i className="ri-upload-cloud-line text-2xl text-gray-400 mb-2 block"></i>
                          <span className="text-sm text-gray-600">
                            {formData.imageUrl ? 'Cambiar imagen' : 'Subir imagen'}
                          </span>
                        </button>
                        <div className="mt-1 text-xs text-gray-500">Máximo 2MB</div>
                      </div>
                    </div>
                  </div>

                  {/* Basic Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Nombre del Producto *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        SKU *
                      </label>
                      <div className="flex">
                        <input
                          type="text"
                          required
                          value={formData.sku}
                          onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                          className="flex-1 p-3 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, sku: generateSKU() }))}
                          className="px-3 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg hover:bg-gray-200 transition-colors"
                        >
                          <i className="ri-refresh-line"></i>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Categoría *
                      </label>
                      <select
                        required
                        value={formData.category}
                        onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                      >
                        <option value="">Seleccionar categoría</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.name}>{category.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Código de Barras
                      </label>
                      <div className="flex">
                        <input
                          type="text"
                          value={formData.barcode}
                          onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                          className="flex-1 p-3 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, barcode: generateBarcode().toString() }))}
                          className="px-3 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg hover:bg-gray-200 transition-colors"
                        >
                          <i className="ri-refresh-line"></i>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Precio de Venta *
                      </label>
                      <input
                        type="number" min="0"
                        step="0.01"
                        required
                        value={formData.price}
                        onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Costo *
                      </label>
                      <input
                        type="number" min="0"
                        step="0.01"
                        required
                        value={formData.cost}
                        onChange={(e) => setFormData(prev => ({ ...prev, cost: e.target.value }))}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* Inventory */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Stock Actual *
                      </label>
                      <input
                        type="number" min="0"
                        required
                        value={formData.stock}
                        onChange={(e) => setFormData(prev => ({ ...prev, stock: e.target.value }))}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Stock Mínimo *
                      </label>
                      <input
                        type="number" min="0"
                        required
                        value={formData.minStock}
                        onChange={(e) => setFormData(prev => ({ ...prev, minStock: e.target.value }))}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Stock Máximo *
                      </label>
                      <input
                        type="number" min="0"
                        required
                        value={formData.maxStock}
                        onChange={(e) => setFormData(prev => ({ ...prev, maxStock: e.target.value }))}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* Additional Info */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Proveedor
                    </label>
                    <input
                      type="text"
                      value={formData.supplier}
                      onChange={(e) => setFormData(prev => ({ ...prev, supplier: e.target.value }))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Descripción
                    </label>
                    <textarea
                      rows={3}
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Estado
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as 'active' | 'inactive' }))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
                    >
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </div>

                  {/* Actions */}
                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                    >
                      {editingProduct ? 'Actualizar' : 'Agregar'} Producto
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
