import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { inventoryService, settingsService, storesService, warehouseEntriesService, warehouseTransfersService, deliveryNotesService, invoicesService, suppliersService, resolveTenantId, productCategoriesService } from '../../services/database';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { exportToExcelWithHeaders } from '../../utils/exportImportUtils';

// Removed sample data: the view only feeds from the database

export default function InventoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [items, setItems] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [realSalesTotal, setRealSalesTotal] = useState(0);

  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [productCategories, setProductCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [categoryForm, setCategoryForm] = useState<{ name: string; description: string; color: string }>({
    name: '',
    description: '',
    color: '#6b7a40',
  });
  const [warehouseEntries, setWarehouseEntries] = useState<any[]>([]);
  const [warehouseTransfers, setWarehouseTransfers] = useState<any[]>([]);
  const [entryInvoices, setEntryInvoices] = useState<any[]>([]);
  const [entryDeliveryNotes, setEntryDeliveryNotes] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string; type?: string }[]>([]);
  const [accountingSettings, setAccountingSettings] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [showEmptyWarehouseModal, setShowEmptyWarehouseModal] = useState(false);
  const [emptyWarehouseSource, setEmptyWarehouseSource] = useState<any>(null);
  const [emptyWarehouseTargetId, setEmptyWarehouseTargetId] = useState('');
  const [emptyingWarehouse, setEmptyingWarehouse] = useState(false);
  const [showViewWarehouseModal, setShowViewWarehouseModal] = useState(false);
  const [viewWarehouse, setViewWarehouse] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transferNumberRequestRef = useRef(0);

  // Filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('');
  const [movementWarehouseFilter, setMovementWarehouseFilter] = useState('');
  const [movementDateFrom, setMovementDateFrom] = useState('');
  const [movementDateTo, setMovementDateTo] = useState('');
  const [movementSourceFilter, setMovementSourceFilter] = useState('');
  const [movementStoreFilter, setMovementStoreFilter] = useState('');
  const [warehouseEntryLines, setWarehouseEntryLines] = useState<any[]>([
    { inventory_item_id: '', quantity: '', unit_cost: '', notes: '' },
  ]);
  const [transferLines, setTransferLines] = useState<any[]>([
    { inventory_item_id: '', quantity: '', notes: '' },
  ]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const tab = String(params.get('tab') || '').toLowerCase();
    const normalized = tab === 'items' ? 'products' : tab;
    const allowed = new Set(['dashboard', 'products', 'movements', 'entries', 'transfers', 'warehouses', 'categories', 'reports']);
    if (allowed.has(normalized)) {
      setActiveTab(normalized);
    }
  }, [location.search]);

  const getWarehouseStats = (warehouseId: string) => {
    const wid = String(warehouseId || '');
    const inWarehouse = (Array.isArray(items) ? items : []).filter((it: any) => String(it?.warehouse_id ?? '') === wid);
    const products = inWarehouse.length;
    const stockTotal = inWarehouse.reduce((sum: number, it: any) => sum + (Number(it?.current_stock) || 0), 0);
    const valueTotal = inWarehouse.reduce((sum: number, it: any) => {
      const stock = Number(it?.current_stock) || 0;
      const cost = Number(it?.cost_price) || 0;
      return sum + stock * cost;
    }, 0);

    return {
      products,
      stockTotal,
      valueTotal,
    };
  };

  useEffect(() => {
    if (user) {
      loadData();
      loadWarehouses();
      loadStores();
      loadSuppliers();
      setAccounts([]);
      setAccountingSettings(null);
    } else {
      // No user: clear data (do not use sample data)
      setItems([]);
      setMovements([]);
      setWarehouseEntries([]);
      setWarehouseTransfers([]);
      setLoading(false);
    }
  }, [user, activeTab]);

  useEffect(() => {
    const loadRealSalesTotal = async () => {
      try {
        if (!user?.id) return;
        if (activeTab !== 'dashboard') return;

        const tenantId = await resolveTenantId(user.id);
        if (!tenantId) {
          setRealSalesTotal(0);
          return;
        }

        // Real sales = sum of posted invoice totals for this tenant
        // (Avoid invoice_lines joins which may not exist in some environments)
        const { data, error } = await supabase
          .from('invoices')
          .select('total_amount,status')
          .eq('user_id', tenantId);

        if (error) throw error;

        const total = (data || []).reduce((sum: number, inv: any) => {
          const st = String(inv?.status || '').toLowerCase();
          if (st === 'draft' || st === 'cancelled' || st === 'cancelada') return sum;
          return sum + (Number(inv?.total_amount ?? 0) || 0);
        }, 0);

        setRealSalesTotal(total);
      } catch (e) {
        console.error('Error loading real sales total:', e);
        setRealSalesTotal(0);
      }
    };

    loadRealSalesTotal();
  }, [user?.id, activeTab]);

  useEffect(() => {
    const loadEntrySources = async () => {
      if (!user?.id) return;
      try {
        const [invoices, notes] = await Promise.all([
          invoicesService.getAll(user.id),
          deliveryNotesService.getAll(user.id),
        ]);
        setEntryInvoices(invoices || []);
        setEntryDeliveryNotes(notes || []);
      } catch (error) {
        console.error('Error loading warehouse entry sources:', error);
        setEntryInvoices([]);
        setEntryDeliveryNotes([]);
      }
    };
    loadEntrySources();
  }, [user?.id]);

  useEffect(() => {
    const loadEntriesIfNeeded = async () => {
      if (user && activeTab === 'entries') {
        try {
          const data = await warehouseEntriesService.getAll(user.id);
          setWarehouseEntries(data || []);
        } catch (error) {
          console.error('Error loading warehouse entries:', error);
          setWarehouseEntries([]);
        }
      }
    };
    loadEntriesIfNeeded();
  }, [user, activeTab]);

  useEffect(() => {
    const loadTransfersIfNeeded = async () => {
      if (user && activeTab === 'transfers') {
        try {
          const data = await warehouseTransfersService.getAll(user.id);
          setWarehouseTransfers(data || []);
        } catch (error) {
          console.error('Error loading warehouse transfers:', error);
          setWarehouseTransfers([]);
        }
      }
    };
    loadTransfersIfNeeded();
  }, [user, activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);

      let itemsData = [];
      let movementsData = [];

      if (activeTab === 'products' || activeTab === 'dashboard' || activeTab === 'warehouses' || activeTab === 'transfers') {
        try {
          itemsData = await inventoryService.getItems(user!.id);
          if (!itemsData || itemsData.length === 0) {
            itemsData = [];
          }
        } catch (error) {
          console.warn('Error loading items:', error);
          itemsData = [];
        }
        setItems(itemsData);
      }

      if (activeTab === 'movements' || activeTab === 'dashboard' || activeTab === 'warehouses' || activeTab === 'transfers') {
        try {
          movementsData = await inventoryService.getMovements(user!.id);
          if (!movementsData || movementsData.length === 0) {
            movementsData = [];
          }
        } catch (error) {
          console.warn('Error loading movements:', error);
          movementsData = [];
        }
        setMovements(movementsData);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setItems([]);
      setMovements([]);
    } finally {
      setLoading(false);
    }
  };

  const loadWarehouses = async () => {
    try {
      const data = await settingsService.getWarehouses();
      setWarehouses(data || []);
    } catch (error) {
      console.error('Error loading warehouses:', error);
      setWarehouses([]);
    }
  };

  const loadStores = async () => {
    try {
      if (!user?.id) return;
      const data = await storesService.getAll(user.id);
      setStores(data || []);
    } catch (error) {
      console.error('Error loading stores:', error);
      setStores([]);
    }
  };

  const loadSuppliers = async () => {
    try {
      if (!user?.id) return;
      const data = await suppliersService.getAll(user.id);
      setSuppliers(data || []);
    } catch (error) {
      console.error('Error loading suppliers:', error);
      setSuppliers([]);
    }
  };

  const loadProductCategories = async () => {
    try {
      if (!user?.id) return;
      const data = await productCategoriesService.getAll(user.id);
      setProductCategories(data || []);
    } catch (error) {
      console.error('Error loading product categories:', error);
      setProductCategories([]);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadProductCategories();
    }
  }, [user?.id]);

  const handleDeleteWarehouse = async (warehouse: any) => {
    if (!warehouse?.id) return;
    const stats = getWarehouseStats(warehouse.id);
    const name = String(warehouse?.name || 'this location');

    if (stats.products > 0) {
      alert(
        `You cannot delete this location because it has ${stats.products} product(s).\n\n` +
        `Please transfer the products to another location first (use the Empty button).`
      );
      return;
    }

    if (!confirm(`Permanently delete ${name}? This action cannot be undone.`)) {
      return;
    }

    try {
      await settingsService.deleteWarehouse(warehouse.id);
      await loadWarehouses();
      if (user?.id) {
        await loadData();
      }
    } catch (error: any) {
      console.error('Error deleting warehouse:', error);
      const msg = String(error?.message || 'Error deleting location');
      const isConflict = msg.toLowerCase().includes('still referenced') || msg.toLowerCase().includes('cannot delete');
      if (isConflict) {
        const ok = confirm(
          `${msg}\n\n` +
          `This location has movement history, so it cannot be permanently deleted.\n` +
          `Do you want to deactivate it instead? (It will be hidden from the list)`
        );
        if (ok) {
          try {
            await settingsService.updateWarehouse(warehouse.id, { ...warehouse, active: false });
            await loadWarehouses();
            if (user?.id) {
              await loadData();
            }
            return;
          } catch (deErr: any) {
            console.error('Error deactivating warehouse:', deErr);
            alert(deErr?.message || 'Error deactivating location');
            return;
          }
        }
      }
      alert(msg);
      return;
    }
  };

  const handleOpenEmptyWarehouse = (warehouse: any) => {
    if (!warehouse?.id) return;
    const stats = getWarehouseStats(warehouse.id);
    if (stats.products <= 0) {
      alert('This location has no products to transfer.');
      return;
    }
    setEmptyWarehouseSource(warehouse);
    setEmptyWarehouseTargetId('');
    setShowEmptyWarehouseModal(true);
  };

  const handleConfirmEmptyWarehouse = async () => {
    if (!user?.id) return;
    if (!emptyWarehouseSource?.id) return;
    if (!emptyWarehouseTargetId) {
      alert('Please select a destination location.');
      return;
    }
    if (String(emptyWarehouseTargetId) === String(emptyWarehouseSource.id)) {
      alert('Destination location must be different from the source location.');
      return;
    }

    const productsInSource = (Array.isArray(items) ? items : [])
      .filter((it: any) => String(it?.warehouse_id ?? '') === String(emptyWarehouseSource.id))
      .map((it: any) => ({
        id: String(it?.id || ''),
        name: String(it?.name || ''),
        qty: Number(it?.current_stock) || 0,
      }))
      .filter((it: any) => it.id && it.qty > 0);

    if (productsInSource.length === 0) {
      alert('This location has no stock to transfer.');
      setShowEmptyWarehouseModal(false);
      setEmptyWarehouseSource(null);
      setEmptyWarehouseTargetId('');
      return;
    }

    setEmptyingWarehouse(true);
    try {
      const sourceName = String(emptyWarehouseSource?.name || 'Source');
      const dest = warehouses.find((w: any) => String(w?.id) === String(emptyWarehouseTargetId));
      const destName = String(dest?.name || 'Destination');

      const transferPayload: any = {
        from_warehouse_id: emptyWarehouseSource.id,
        to_warehouse_id: emptyWarehouseTargetId,
        transfer_date: new Date().toISOString().slice(0, 10),
        description: `Empty location: ${sourceName} -> ${destName}`,
        status: 'draft',
      };

      const linesPayload = productsInSource.map((p: any) => ({
        inventory_item_id: p.id,
        quantity: p.qty,
        notes: `Empty location transfer: ${p.name}`,
      }));

      const created = await warehouseTransfersService.create(user.id, transferPayload, linesPayload);
      await warehouseTransfersService.post(user.id, created.transfer.id);

      const data = await warehouseTransfersService.getAll(user.id);
      setWarehouseTransfers(data || []);
      await loadData();
      await loadWarehouses();

      setShowEmptyWarehouseModal(false);
      setEmptyWarehouseSource(null);
      setEmptyWarehouseTargetId('');
      alert('Location emptied successfully. You can now delete it.');
    } catch (err: any) {
      console.error('Error emptying warehouse:', err);
      alert(`Error transferring products: ${err?.message || 'check console for details'}`);
    } finally {
      setEmptyingWarehouse(false);
    }
  };

  const handleDelete = async (id: any) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      if (user) {
        await inventoryService.deleteItem(id);
        loadData();
      }
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Error deleting item. Please try again.');
    }
  };

  const generateSKU = async () => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    const sku = `INV-${timestamp}-${random}`;
    setFormData((prev: any) => ({ ...prev, sku }));
    return sku;
  };

  const handleOpenModal = (type: string, data?: any) => {
    setModalType(type);
    setSelectedItem(data || null);
    setFormData(data || {});
    if (type === 'warehouse_entry') {
      setWarehouseEntryLines([{ inventory_item_id: '', quantity: '', unit_cost: '', notes: '' }]);
    }
    if (type === 'warehouse_transfer') {
      setTransferLines([{ inventory_item_id: '', quantity: '', notes: '' }]);
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setModalType('');
    setSelectedItem(null);
    setFormData({});
    setWarehouseEntryLines([{ inventory_item_id: '', quantity: '', unit_cost: '', notes: '' }]);
    setTransferLines([{ inventory_item_id: '', quantity: '', notes: '' }]);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev: any) => ({ ...prev, image_url: reader.result as string }));
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Error uploading image');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    try {
      if (modalType === 'item') {
        if (selectedItem?.id) {
          await inventoryService.updateItem(selectedItem.id, formData);
        } else {
          const sku = formData.sku || await generateSKU();
          await inventoryService.createItem(user.id, { ...formData, sku });
        }
        await loadData();
      } else if (modalType === 'movement') {
        await inventoryService.createMovement(user.id, {
          inventory_item_id: formData.item_id || formData.inventory_item_id,
          movement_type: formData.movement_type || 'entry',
          quantity: Number(formData.quantity) || 0,
          unit_cost: Number(formData.unit_cost) || 0,
          reference: formData.reference || '',
          notes: formData.notes || '',
          movement_date: formData.movement_date || new Date().toISOString().slice(0, 10),
        });
        await loadData();
      } else if (modalType === 'warehouse') {
        if (selectedItem?.id) {
          await settingsService.updateWarehouse(selectedItem.id, formData);
        } else {
          // Check warehouse limit before creating
          const limitCheck = await settingsService.checkWarehouseLimit(user.id);
          if (!limitCheck.allowed) {
            alert(limitCheck.message || 'You have reached the maximum number of warehouses for your plan.');
            return;
          }
          await settingsService.createWarehouse(formData);
        }
        await loadWarehouses();
      } else if (modalType === 'warehouse_entry') {
        const validLines = warehouseEntryLines.filter((l: any) => l.inventory_item_id && Number(l.quantity) > 0);
        if (validLines.length === 0) {
          alert('Please add at least one item with quantity');
          return;
        }
        await warehouseEntriesService.create(user.id, {
          warehouse_id: formData.warehouse_id,
          supplier_id: formData.supplier_id || null,
          entry_date: formData.entry_date || new Date().toISOString().slice(0, 10),
          reference: formData.reference || '',
          notes: formData.notes || '',
        }, validLines);
        const data = await warehouseEntriesService.getAll(user.id);
        setWarehouseEntries(data || []);
        await loadData();
      } else if (modalType === 'warehouse_transfer') {
        const validLines = transferLines.filter((l: any) => l.inventory_item_id && Number(l.quantity) > 0);
        if (validLines.length === 0) {
          alert('Please add at least one item with quantity');
          return;
        }
        if (!formData.from_warehouse_id || !formData.to_warehouse_id) {
          alert('Please select source and destination locations');
          return;
        }
        if (formData.from_warehouse_id === formData.to_warehouse_id) {
          alert('Source and destination must be different');
          return;
        }
        const created = await warehouseTransfersService.create(user.id, {
          from_warehouse_id: formData.from_warehouse_id,
          to_warehouse_id: formData.to_warehouse_id,
          transfer_date: formData.transfer_date || new Date().toISOString().slice(0, 10),
          description: formData.description || '',
          status: 'draft',
        }, validLines);
        // Auto-post the transfer to actually move inventory
        await warehouseTransfersService.post(user.id, created.transfer.id);
        const data = await warehouseTransfersService.getAll(user.id);
        setWarehouseTransfers(data || []);
        await loadData();
        await loadWarehouses();
      } else if (modalType === 'add_to_inventory') {
        if (!formData.inventory_item_id || !formData.quantity) {
          alert('Please select a product and enter quantity');
          return;
        }
        await inventoryService.createMovement(user.id, {
          inventory_item_id: formData.inventory_item_id,
          movement_type: 'entry',
          quantity: Number(formData.quantity) || 0,
          unit_cost: Number(formData.unit_cost) || 0,
          reference: formData.reference || 'Manual Entry',
          notes: formData.notes || '',
          movement_date: new Date().toISOString().slice(0, 10),
        });
        await loadData();
      }
      handleCloseModal();
    } catch (error: any) {
      console.error('Error submitting:', error);
      alert(error?.message || 'Error saving. Please try again.');
    }
  };

  // Export functions
  const exportToExcel = async () => {
    const isItemsTab = activeTab === 'products';
    const dataToExport = isItemsTab ? filteredItems : filteredMovements;

    if (!dataToExport || dataToExport.length === 0) {
      alert('No data to export.');
      return;
    }

    let companyName = '';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName = (info as any).name || (info as any).company_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      console.error('Error getting company info for inventory Excel:', error);
    }

    const periodText = `Period: ${new Date().toISOString().slice(0, 7)}`;

    if (isItemsTab) {
      const rows = dataToExport.map((item: any) => ({
        sku: item.sku,
        name: item.name,
        category: item.category || 'N/A',
        current_stock: item.current_stock,
        minimum_stock: item.minimum_stock || 0,
        cost_price: item.cost_price || 0,
        selling_price: item.selling_price || 0,
        status: item.is_active ? 'Active' : 'Inactive',
      }));

      const headers = [
        { key: 'sku', title: 'SKU' },
        { key: 'name', title: 'Name' },
        { key: 'category', title: 'Category' },
        { key: 'current_stock', title: 'Current Stock' },
        { key: 'minimum_stock', title: 'Minimum Stock' },
        { key: 'cost_price', title: 'Cost Price' },
        { key: 'selling_price', title: 'Selling Price' },
        { key: 'status', title: 'Status' },
      ];

      const fileBase = `inventory_products_${new Date().toISOString().split('T')[0]}`;
      const title = 'Inventory Products';

      exportToExcelWithHeaders(rows, headers, fileBase, 'Products', [16, 30, 22, 16, 16, 16, 16, 14], {
        title,
        companyName,
        headerStyle: 'dgii_606',
        periodText,
      });
    } else {
      const rows = dataToExport.map((movement: any) => ({
        movement_date: movement.movement_date,
        product_name: movement.inventory_items?.name || 'N/A',
        type:
          movement.movement_type === 'entry'
            ? 'Entry'
            : movement.movement_type === 'exit'
            ? 'Exit'
            : movement.movement_type === 'transfer'
            ? 'Transfer'
            : 'Adjustment',
        quantity: movement.quantity,
        unit_cost: movement.unit_cost || 0,
        total_cost: movement.total_cost || 0,
        reference: movement.reference || 'N/A',
      }));

      const headers = [
        { key: 'movement_date', title: 'Date' },
        { key: 'product_name', title: 'Product' },
        { key: 'type', title: 'Type' },
        { key: 'quantity', title: 'Quantity' },
        { key: 'unit_cost', title: 'Unit Cost' },
        { key: 'total_cost', title: 'Total Cost' },
        { key: 'reference', title: 'Reference' },
      ];

      const fileBase = `inventory_movements_${new Date().toISOString().split('T')[0]}`;
      const title = 'Inventory Movements';

      exportToExcelWithHeaders(rows, headers, fileBase, 'Movements', [16, 30, 18, 14, 18, 18, 26], {
        title,
        companyName,
        headerStyle: 'dgii_606',
        periodText,
      });
    }
  };

  const exportValuationToExcel = async () => {
    if (!items || items.length === 0) {
      alert('No data to generate valuation report.');
      return;
    }

    let companyName = '';
    try {
      const info = await settingsService.getCompanyInfo();
      if (info && (info as any)) {
        const resolvedName = (info as any).name || (info as any).company_name || (info as any).legal_name;
        if (resolvedName) {
          companyName = String(resolvedName);
        }
      }
    } catch (error) {
      console.error('Error getting company info for valuation Excel:', error);
    }

    const periodText = `Period: ${new Date().toISOString().slice(0, 7)}`;

    const rows = items.map((item: any) => {
      const stock = Number(item.current_stock || 0) || 0;
      const costPrice = Number(item.cost_price || 0) || 0;
      const sellingPrice = Number(item.selling_price || 0) || 0;

      return {
        product: item.name,
        stock,
        cost_price: costPrice,
        selling_price: sellingPrice,
        value_cost: stock * costPrice,
        value_sale: stock * sellingPrice,
      };
    });

    const headers = [
      { key: 'product', title: 'Product' },
      { key: 'stock', title: 'Stock' },
      { key: 'cost_price', title: 'Cost Price' },
      { key: 'selling_price', title: 'Selling Price' },
      { key: 'value_cost', title: 'Cost Value' },
      { key: 'value_sale', title: 'Sale Value' },
    ];

    const fileBase = `inventory_valuation_${new Date().toISOString().split('T')[0]}`;
    const title = 'Inventory Valuation (Cost and Sale)';

    exportToExcelWithHeaders(rows, headers, fileBase, 'Valuation', [32, 12, 16, 16, 18, 18], {
      title,
      companyName,
      headerStyle: 'dgii_606',
      periodText,
    });
  };

  // Applied filters
  const filteredItems = items.filter(item => {
    const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !categoryFilter || item.category === categoryFilter;
    const matchesStatus = !statusFilter || 
                         (statusFilter === 'active' && item.is_active) ||
                         (statusFilter === 'inactive' && !item.is_active) ||
                         (statusFilter === 'low_stock' && item.current_stock <= item.minimum_stock);
    const matchesWarehouse = !warehouseFilter || item.warehouse_id === warehouseFilter;

    return matchesSearch && matchesCategory && matchesStatus && matchesWarehouse;
  });

  const filteredMovements = movements.filter(movement => {
    const matchesSearch = movement.inventory_items?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         movement.reference?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !movementTypeFilter || movement.movement_type === movementTypeFilter;

    const matchesWarehouse =
      !movementWarehouseFilter ||
      movement.inventory_items?.warehouse_id === movementWarehouseFilter;

    const sourceType = (movement.source_type || 'manual') as string;
    const matchesSourceType = !movementSourceFilter || sourceType === movementSourceFilter;

    const matchesStore = !movementStoreFilter || movement.store_id === movementStoreFilter;

    const movementDate = movement.movement_date ? new Date(movement.movement_date) : null;
    const fromDate = movementDateFrom ? new Date(movementDateFrom) : null;
    const toDate = movementDateTo ? new Date(movementDateTo) : null;

    const matchesFrom = !fromDate || (movementDate && movementDate >= fromDate);
    const matchesTo = !toDate || (movementDate && movementDate <= toDate);

    return matchesSearch && matchesType && matchesWarehouse && matchesSourceType && matchesStore && matchesFrom && matchesTo;
  });

  const categories = Array.from(
    new Set(
      [
        ...productCategories
          .map((category: any) => (category?.name ? String(category.name) : ''))
          .filter((name) => Boolean(name && name.trim().length)),
        ...items
          .map((item) => item.category)
          .filter((category): category is string => Boolean(category && category.trim().length)),
      ],
    ),
  );

  // Build warehouseBalances: { warehouseId: { itemId: quantity } }
  const warehouseBalances: Record<string, Record<string, number>> = {};
  items.forEach((item) => {
    if (item.warehouse_id) {
      const wid = String(item.warehouse_id);
      if (!warehouseBalances[wid]) {
        warehouseBalances[wid] = {};
      }
      warehouseBalances[wid][String(item.id)] = Number(item.current_stock) || 0;
    }
  });
  const totalProducts = items.length;
  const activeProducts = items.filter(item => item.is_active).length;
  const lowStockCount = items.filter(
    item => item.item_type !== 'service' && item.minimum_stock != null && item.current_stock <= item.minimum_stock,
  ).length;
  const dashboardStats = [
    {
      label: 'Total Products',
      value: totalProducts.toLocaleString('en-US'),
      icon: 'ri-box-3-line',
      iconBg: 'bg-[#d7e4c5]',
      iconColor: 'text-[#2e3c21]',
    },
    {
      label: 'Active Items',
      value: activeProducts.toLocaleString('en-US'),
      icon: 'ri-checkbox-circle-line',
      iconBg: 'bg-[#e0e9cf]',
      iconColor: 'text-[#4f5f33]',
    },
    {
      label: 'Low Stock Alerts',
      value: lowStockCount.toLocaleString('en-US'),
      icon: 'ri-alert-line',
      iconBg: 'bg-[#f7d8d0]',
      iconColor: 'text-[#b7422a]',
    },
    {
      label: 'Locations',
      value: warehouses.length.toLocaleString('en-US'),
      icon: 'ri-building-line',
      iconBg: 'bg-[#f2e7ce]',
      iconColor: 'text-[#6b562d]',
    },
  ];

  const lowStockItems = items
    .filter(item => item.item_type !== 'service' && item.minimum_stock != null && item.current_stock <= item.minimum_stock)
    .slice(0, 5);
  const recentMovements = movements.slice(0, 5);

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {dashboardStats.map((stat) => (
          <div key={stat.label} className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl border border-[#e8e0d0] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:shadow-[0_12px_40px_rgb(0,128,0,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center shadow-lg ${stat.iconBg}`}>
                <i className={`${stat.icon} ${stat.iconColor} text-2xl`}></i>
              </div>
              <div>
                <p className="text-sm font-medium text-[#6b7a40]">{stat.label}</p>
                <p className="text-3xl font-bold text-[#2e3c21] drop-shadow-sm">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-br from-white to-[#faf9f5] border border-[#e8e0d0] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] p-8">
        <h3 className="text-xl font-bold text-[#2e3c21] mb-6 drop-shadow-sm">Financial Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <p className="text-sm font-medium text-[#7b6e4f]">Total Cost Value (Average)</p>
            <p className="text-2xl font-bold text-[#4f5f33]">
              ${items
                .filter(item => item.item_type !== 'service')
                .reduce((sum, item) => {
                  const cost = item.average_cost ?? item.cost_price ?? 0;
                  return sum + ((item.current_stock || 0) * cost);
                }, 0)
                .toLocaleString('es-DO')}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[#7b6e4f]">Total Sale Value</p>
            <p className="text-2xl font-bold text-[#6b7a40]">
              ${realSalesTotal.toLocaleString('es-DO')}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[#7b6e4f]">Potential Profit</p>
            <p className="text-2xl font-bold text-[#7c8c45]">
              ${items
                .filter(item => item.item_type !== 'service')
                .reduce((sum, item) => {
                  const cost = item.average_cost ?? item.cost_price ?? 0;
                  return sum + ((item.current_stock || 0) * ((item.selling_price || 0) - cost));
                }, 0)
                .toLocaleString('es-DO')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-white to-[#faf9f5] border border-[#e8e0d0] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] overflow-hidden hover:shadow-[0_12px_35px_rgb(0,0,0,0.1)] hover:-translate-y-1 transition-all duration-300">
          <div className="px-6 py-5 border-b border-[#e8ddc7] bg-gradient-to-r from-[#fdf6e7] to-[#f8f4e8]">
            <h3 className="text-lg font-bold text-[#3b4d2d] drop-shadow-sm">Low Stock Products</h3>
          </div>
          <div className="p-6">
            {lowStockItems.length === 0 ? (
              <p className="text-[#7b6e4f] text-center py-4">No low stock products</p>
            ) : (
              <div className="space-y-3">
                {lowStockItems.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-4 bg-[#fdeee9] border border-[#f3d4c8] rounded-lg shadow-[0_2px_4px_rgb(0,0,0,0.1)] hover:shadow-[0_4px_8px_rgb(0,0,0,0.2)] transition-all duration-300"
                  >
                    <div>
                      <p className="font-medium text-[#2e3c21]">{item.name}</p>
                      <p className="text-sm text-[#7b6e4f]">SKU: {item.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-[#b7422a]">
                        Stock: {item.current_stock} {item.unit_of_measure}
                      </p>
                      <p className="text-xs text-[#7b6e4f]">Minimum: {item.minimum_stock}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-white to-[#faf9f5] border border-[#e8e0d0] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] overflow-hidden hover:shadow-[0_12px_35px_rgb(0,0,0,0.1)] hover:-translate-y-1 transition-all duration-300">
          <div className="px-6 py-5 border-b border-[#e8ddc7] bg-gradient-to-r from-[#fdf6e7] to-[#f8f4e8]">
            <h3 className="text-lg font-bold text-[#3b4d2d] drop-shadow-sm">Recent Movements</h3>
          </div>
          <div className="p-6">
            {recentMovements.length === 0 ? (
              <p className="text-[#7b6e4f] text-center py-4">No recent movements</p>
            ) : (
              <div className="space-y-3">
                {recentMovements.map(movement => (
                  <div
                    key={movement.id}
                    className="flex items-center justify-between p-4 bg-[#f8f2e6] border border-[#e8ddc7] rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-[#2e3c21]">{movement.inventory_items?.name}</p>
                      <p className="text-sm text-[#7b6e4f]">
                        {movement.movement_date
                          ? new Date(movement.movement_date).toLocaleDateString('en-US')
                          : 'N/A'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          movement.movement_type === 'entry'
                            ? 'bg-[#d7e4c5] text-[#4f5f33]'
                            : movement.movement_type === 'exit'
                              ? 'bg-[#f7d8d0] text-[#b7422a]'
                              : movement.movement_type === 'transfer'
                                ? 'bg-[#dfe7f7] text-[#37486b]'
                                : 'bg-[#f5e7c5] text-[#6b562d]'
                        }`}
                      >
                        {movement.movement_type === 'entry'
                          ? 'Entry'
                          : movement.movement_type === 'exit'
                            ? 'Exit'
                            : movement.movement_type === 'transfer'
                              ? 'Transfer'
                              : 'Adjustment'}
                      </span>
                      <p className="text-sm text-[#7b6e4f] mt-1">Quantity: {movement.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderItems = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-lg font-semibold text-[#2e3c21]">Products</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportToExcel}
            className="bg-[#4f5f33] text-white px-4 py-2 rounded-lg hover:bg-[#3b4d2d] transition-colors whitespace-nowrap"
          >
            <i className="ri-file-excel-line mr-2"></i>
            Export Excel
          </button>
          <button
            onClick={() => handleOpenModal('item')}
            className="bg-[#6b7a40] text-white px-4 py-2 rounded-lg hover:bg-[#4f5f33] transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line mr-2"></i>
            Add Product
          </button>
          <button
            onClick={() => handleOpenModal('add_to_inventory')}
            className="bg-[#008000] text-white px-4 py-2 rounded-lg hover:bg-[#006600] transition-colors whitespace-nowrap"
          >
            <i className="ri-stack-line mr-2"></i>
            Add to Inventory
          </button>
        </div>
      </div>

      <div className="bg-white/90 border border-[#eadfc6] rounded-xl shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#3b4d2d] mb-1">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by product or reference..."
              className="w-full border border-[#d4c9b1] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#6b7a40] focus:border-[#6b7a40]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#3b4d2d] mb-1">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full border border-[#d4c9b1] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#6b7a40] pr-8"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#3b4d2d] mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border border-[#d4c9b1] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#6b7a40] pr-8"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="low_stock">Low Stock</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setCategoryFilter('');
                setStatusFilter('');
              }}
              className="w-full bg-[#d9ccb2] text-[#2e3c21] px-4 py-2 rounded-lg border border-[#cbbd9e] hover:bg-[#cfbea1] transition-colors whitespace-nowrap"
            >
              <i className="ri-refresh-line mr-2"></i>
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white/95 border border-[#eadfc6] rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#eadfc6]">
            <thead className="bg-[#f1ead6]">
              <tr>
                {['SKU', 'Name', 'Category', 'Stock', 'Cost Price', 'Sale Price', 'Status', 'Actions'].map((header) => (
                  <th
                    key={header}
                    className="px-6 py-3 text-left text-xs font-semibold text-[#5f543a] uppercase tracking-wider"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-[#f1ead6]">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-[#faf5e6]">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[#2e3c21]">
                    {item.sku}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2e3c21]">
                    {item.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[#7b6e4f]">
                    {item.category || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2e3c21]">
                    <span className={item.current_stock <= item.minimum_stock ? 'text-[#b7422a] font-semibold' : ''}>
                      {item.current_stock} {item.unit_of_measure}
                    </span>
                    {item.minimum_stock && (
                      <div className="text-xs text-[#7b6e4f]">
                        Min: {item.minimum_stock}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2e3c21]">
                    {(() => {
                      const cost = item.average_cost ?? item.cost_price ?? 0;
                      return `$${cost.toLocaleString('es-DO')}`;
                    })()}
                    {item.last_purchase_price != null && (
                      <div className="text-xs text-[#7b6e4f]">
                        Last Purchase: ${item.last_purchase_price.toLocaleString('es-DO')}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[#2e3c21]">
                    ${item.selling_price?.toLocaleString('es-DO') || '0'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      item.is_active
                        ? 'bg-[#d7e4c5] text-[#4f5f33]'
                        : 'bg-[#f7d8d0] text-[#b7422a]'
                    }`}>
                      {item.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleOpenModal('item', item)}
                      className="text-[#4f5f33] hover:text-[#2e3c21]"
                      title="Edit"
                    >
                      <i className="ri-edit-line"></i>
                    </button>
                    <button
                      onClick={() => handleOpenModal('movement', { item_id: item.id, item_name: item.name })}
                      className="text-[#6b7a40] hover:text-[#4f5f33]"
                      title="New Movement"
                    >
                      <i className="ri-arrow-up-down-line"></i>
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-[#b7422a] hover:text-[#952f18]"
                      title="Delete"
                    >
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredItems.length === 0 && (
            <div className="text-center py-8">
              <p className="text-[#7b6e4f]">No products found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderMovements = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-lg font-semibold text-gray-900">Movements</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportToExcel}
            className="bg-[#008000] text-white px-4 py-2 rounded-lg hover:bg-[#006600] transition-colors whitespace-nowrap"
          >
            <i className="ri-file-excel-line mr-2"></i>
            Export Excel
          </button>
          <button
            onClick={() => handleOpenModal('movement')}
            className="bg-[#008000] text-white px-4 py-2 rounded-lg hover:bg-[#006600] transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line mr-2"></i>
            New Movement
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by product or reference..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Movement Type
            </label>
            <select
              value={movementTypeFilter}
              onChange={(e) => setMovementTypeFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
            >
              <option value="">All types</option>
              <option value="entry">Entry</option>
              <option value="exit">Exit</option>
              <option value="transfer">Transfer</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Type
            </label>
            <select
              value={movementSourceFilter}
              onChange={(e) => setMovementSourceFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
            >
              <option value="">All documents</option>
              <option value="manual">Manual</option>
              <option value="purchase_order">Purchase Order</option>
              <option value="delivery_note">Delivery Note</option>
              <option value="pos_sale">POS Sale</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date Range
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={movementDateFrom}
                onChange={(e) => setMovementDateFrom(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="date"
                value={movementDateTo}
                onChange={(e) => setMovementDateTo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Store / Location
            </label>
            <select
              value={movementStoreFilter}
              onChange={(e) => setMovementStoreFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
            >
              <option value="">All stores</option>
              {stores.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
            <select
              value={movementWarehouseFilter}
              onChange={(e) => setMovementWarehouseFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
            >
              <option value="">All locations</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setSearchTerm('');
                setMovementTypeFilter('');
                setMovementWarehouseFilter('');
                setMovementDateFrom('');
                setMovementDateTo('');
                setMovementSourceFilter('');
                setMovementStoreFilter('');
              }}
              className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors whitespace-nowrap"
            >
              <i className="ri-refresh-line mr-2"></i>
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Cost</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Cost</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredMovements.map((movement) => (
              <tr key={movement.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(movement.movement_date).toLocaleDateString('es-DO')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {movement.inventory_items?.name || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    movement.movement_type === 'entry' ? 'bg-green-100 text-green-800' :
                    movement.movement_type === 'exit' ? 'bg-red-100 text-red-800' :
                    movement.movement_type === 'transfer' ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {movement.movement_type === 'entry' ? 'Entry' :
                     movement.movement_type === 'exit' ? 'Exit' :
                     movement.movement_type === 'transfer' ? 'Transfer' :
                     'Adjustment'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {movement.quantity}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ${movement.unit_cost?.toLocaleString('es-DO') || '0'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ${movement.total_cost?.toLocaleString('es-DO') || '0'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {movement.reference || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {movement.notes || 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredMovements.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">No movements found</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderWarehouseEntriesTab = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-lg font-semibold text-gray-900">Location Entries</h3>
        <button
          onClick={() => handleOpenModal('warehouse_entry')}
          className="bg-[#008000] text-white px-4 py-2 rounded-lg hover:bg-[#006600] transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          New Entry
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Doc. Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Doc. No.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Issuer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {warehouseEntries.map((entry: any) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(() => {
                      const raw = entry.document_date ? String(entry.document_date) : '';
                      if (!raw) return 'N/A';
                      // Avoid timezone shift: treat YYYY-MM-DD as local date
                      const parts = raw.split('T')[0].split('-');
                      if (parts.length === 3) {
                        const [y, m, d] = parts;
                        return `${d}/${m}/${y}`;
                      }
                      return raw;
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entry.document_number || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(entry.warehouses && entry.warehouses.name) || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entry.source_type === 'conduce_suplidor'
                      ? 'Supplier delivery note'
                      : entry.source_type === 'devolucion_cliente'
                        ? 'Customer return'
                        : entry.source_type === 'ap_invoice'
                          ? 'Supplier invoice'
                        : entry.source_type || 'Other'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entry.issuer_name || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {entry.description || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      entry.status === 'posted'
                        ? 'bg-green-100 text-green-800'
                        : entry.status === 'cancelled'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {entry.status === 'posted'
                        ? 'Posted'
                        : entry.status === 'cancelled'
                          ? 'Cancelled'
                          : 'Draft'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {warehouseEntries.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">No location entries found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderWarehouseTransfersTab = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-lg font-semibold text-gray-900">Location Transfers</h3>
        <button
          onClick={() => handleOpenModal('warehouse_transfer')}
          className="bg-[#008000] text-white px-4 py-2 rounded-lg hover:bg-[#006600] transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          New Transfer
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Doc. No.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dest. Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {warehouseTransfers.map((transfer: any) => (
                <tr key={transfer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {transfer.transfer_date
                      ? new Date(transfer.transfer_date).toLocaleDateString('es-DO')
                      : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {transfer.document_number || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(transfer.from_warehouse && transfer.from_warehouse.name) || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(transfer.to_warehouse && transfer.to_warehouse.name) || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {Array.isArray(transfer.warehouse_transfer_lines)
                      ? transfer.warehouse_transfer_lines.length
                      : 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {transfer.description || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        transfer.status === 'posted'
                          ? 'bg-green-100 text-green-800'
                          : transfer.status === 'cancelled'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {transfer.status === 'posted'
                        ? 'Posted'
                        : transfer.status === 'cancelled'
                          ? 'Cancelled'
                          : 'Draft'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {warehouseTransfers.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">No location transfers found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderWarehouses = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Location Management</h3>
        <button
          onClick={() => handleOpenModal('warehouse')}
          className="bg-[#008000] text-white px-4 py-2 rounded-lg hover:bg-[#006600] transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          New Location
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {warehouses.map((warehouse) => {
          const stats = getWarehouseStats(warehouse.id);
          return (
            <div key={warehouse.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-[#dff3df] rounded-lg flex items-center justify-center">
                    <i className="ri-building-line text-[#008000]"></i>
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 ml-3">{warehouse.name}</h4>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setViewWarehouse(warehouse);
                      setShowViewWarehouseModal(true);
                    }}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-blue-50"
                    title="View products"
                  >
                    <i className="ri-eye-line text-blue-600"></i>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEmptyWarehouse(warehouse)}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                    title="Empty (transfer all products)"
                  >
                    <i className="ri-inbox-unarchive-line text-gray-700"></i>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenModal('warehouse', warehouse)}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                    title="Edit"
                  >
                    <i className="ri-edit-line text-gray-700"></i>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteWarehouse(warehouse)}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-red-50"
                    title="Delete"
                  >
                    <i className="ri-delete-bin-line text-red-600"></i>
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-2">{warehouse.location}</p>
              <p className="text-xs text-gray-400 mb-4">{warehouse.description}</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Products:</span>
                  <span className="font-medium text-[#008000]">{stats.products}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Stock:</span>
                  <span className="font-medium text-[#008000]">{stats.stockTotal}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Value:</span>
                  <span className="font-medium text-[#008000]">${stats.valueTotal.toLocaleString('es-DO')}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const handleCreateCategory = async () => {
    if (!user?.id) return;
    const name = String(categoryForm.name || '').trim();
    if (!name) {
      alert('Category name is required');
      return;
    }

    try {
      await productCategoriesService.create(user.id, {
        name,
        description: categoryForm.description || '',
        color: categoryForm.color || '#6b7a40',
      });
      await loadProductCategories();
      setCategoryForm({ name: '', description: '', color: '#6b7a40' });
      setSelectedCategory(null);
    } catch (error: any) {
      console.error('Error creating category:', error);
      alert(error?.message || 'Error creating category');
    }
  };

  const handleUpdateCategory = async () => {
    if (!user?.id) return;
    if (!selectedCategory?.id) return;
    const name = String(categoryForm.name || '').trim();
    if (!name) {
      alert('Category name is required');
      return;
    }

    try {
      await productCategoriesService.update(String(selectedCategory.id), {
        name,
        description: categoryForm.description || '',
        color: categoryForm.color || '#6b7a40',
      });
      await loadProductCategories();
      setCategoryForm({ name: '', description: '', color: '#6b7a40' });
      setSelectedCategory(null);
    } catch (error: any) {
      console.error('Error updating category:', error);
      alert(error?.message || 'Error updating category');
    }
  };

  const handleDeleteCategory = async (category: any) => {
    if (!user?.id) return;
    if (!category?.id) return;

    const productsUsingCategory = items.filter((item: any) => String(item?.category || '') === String(category?.name || ''));
    if (productsUsingCategory.length > 0) {
      alert(`Cannot delete this category. It is used by ${productsUsingCategory.length} product(s).`);
      return;
    }

    if (!confirm(`Delete category "${String(category.name || '')}"? This action cannot be undone.`)) return;

    try {
      await productCategoriesService.delete(String(category.id));
      await loadProductCategories();
      if (selectedCategory?.id && String(selectedCategory.id) === String(category.id)) {
        setSelectedCategory(null);
        setCategoryForm({ name: '', description: '', color: '#6b7a40' });
      }
    } catch (error: any) {
      console.error('Error deleting category:', error);
      alert(error?.message || 'Error deleting category');
    }
  };

  const renderCategories = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-[#2e3c21]">Product Categories</h3>
      </div>

      <div className="bg-white/90 border border-[#eadfc6] rounded-xl shadow p-6">
        <h4 className="text-md font-semibold text-[#3b4d2d] mb-4">
          {selectedCategory ? 'Edit Category' : 'Add New Category'}
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#3b4d2d] mb-1">Name *</label>
            <input
              type="text"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full border border-[#d4c9b1] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#6b7a40]"
              placeholder="Category name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#3b4d2d] mb-1">Description</label>
            <input
              type="text"
              value={categoryForm.description}
              onChange={(e) => setCategoryForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full border border-[#d4c9b1] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#6b7a40]"
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#3b4d2d] mb-1">Color</label>
            <input
              type="color"
              value={categoryForm.color || '#6b7a40'}
              onChange={(e) => setCategoryForm((prev) => ({ ...prev, color: e.target.value }))}
              className="w-full h-[42px] border border-[#d4c9b1] rounded-lg px-1 py-1 focus:outline-none focus:ring-2 focus:ring-[#6b7a40]"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={selectedCategory ? handleUpdateCategory : handleCreateCategory}
              className="flex-1 bg-[#6b7a40] text-white px-4 py-2 rounded-lg hover:bg-[#4f5f33] transition-colors"
            >
              {selectedCategory ? 'Update' : 'Add Category'}
            </button>
            {selectedCategory && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory(null);
                  setCategoryForm({ name: '', description: '', color: '#6b7a40' });
                }}
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white/90 border border-[#eadfc6] rounded-xl shadow overflow-hidden">
        {productCategories.length === 0 ? (
          <div className="text-center py-12 text-[#7b6e4f]">
            <i className="ri-price-tag-3-line text-4xl mb-2"></i>
            <p>No categories yet. Add your first category above.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-[#eadfc6]">
            <thead className="bg-[#f1ead6]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#5f543a] uppercase tracking-wider">Color</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#5f543a] uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#5f543a] uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#5f543a] uppercase tracking-wider">Products</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#5f543a] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-[#eadfc6]">
              {productCategories.map((category: any) => {
                const productsCount = items.filter((item: any) => String(item?.category || '') === String(category?.name || '')).length;
                return (
                  <tr key={category.id} className="hover:bg-[#faf8f3]">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div
                        className="w-6 h-6 rounded-full border border-gray-300"
                        style={{ backgroundColor: category.color || '#6b7a40' }}
                      ></div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[#2e3c21]">
                      {category.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#7b6e4f]">
                      {category.description || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#6b7a40] font-medium">
                      {productsCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCategory(category);
                            setCategoryForm({
                              name: String(category?.name || ''),
                              description: String(category?.description || ''),
                              color: String(category?.color || '#6b7a40'),
                            });
                          }}
                          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                          title="Edit"
                        >
                          <i className="ri-edit-line text-gray-700"></i>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(category)}
                          className="p-2 rounded-lg border border-gray-200 hover:bg-red-50"
                          title="Delete"
                        >
                          <i className="ri-delete-bin-line text-red-600"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  const renderReports = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Inventory Reports</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Stock Report */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-[#dff3df] rounded-lg flex items-center justify-center">
              <i className="ri-file-list-3-line text-[#008000]"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 ml-3">Stock Report</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Detailed report of all products with their current stock levels.
          </p>
          <button
            onClick={() => navigate('/inventory/reports')}
            className="w-full bg-[#008000] text-white px-4 py-2 rounded-lg hover:bg-[#006600] transition-colors whitespace-nowrap"
          >
            <i className="ri-download-line mr-2"></i>
            Generate Report
          </button>
        </div>

        {/* Physical Inventory Count */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-[#dff3df] rounded-lg flex items-center justify-center">
              <i className="ri-clipboard-line text-[#008000]"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 ml-3">Physical Inventory Count</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            List for physical count with spaces for counted quantities and observations.
          </p>
          <button
            onClick={() => navigate('/inventory/physical-count')}
            className="w-full bg-[#008000] text-white px-4 py-2 rounded-lg hover:bg-[#006600] transition-colors whitespace-nowrap"
          >
            <i className="ri-download-line mr-2"></i>
            Generate Format
          </button>
        </div>

        {/* Physical Inventory Report */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-[#dff3df] rounded-lg flex items-center justify-center">
              <i className="ri-clipboard-check-line text-[#008000]"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 ml-3">Physical Inventory Report</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Physical count results with quantity differences and valuation by product.
          </p>
          <button
            onClick={() => navigate('/inventory/physical-result')}
            className="w-full bg-[#008000] text-white px-4 py-2 rounded-lg hover:bg-[#006600] transition-colors whitespace-nowrap"
          >
            <i className="ri-bar-chart-2-line mr-2"></i>
            View Report
          </button>
        </div>

        {/* Movements Report */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-[#dff3df] rounded-lg flex items-center justify-center">
              <i className="ri-arrow-up-down-line text-[#008000]"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 ml-3">Movements Report</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Complete history of all inventory movements made.
          </p>
          <button
            onClick={() => {
              setActiveTab('movements');
              exportToExcel();
            }}
            className="w-full bg-[#008000] text-white px-4 py-2 rounded-lg hover:bg-[#006600] transition-colors whitespace-nowrap"
          >
            <i className="ri-download-line mr-2"></i>
            Generate Report
          </button>
        </div>

        {/* Valuation Report */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-[#dff3df] rounded-lg flex items-center justify-center">
              <i className="ri-money-dollar-circle-line text-[#008000]"></i>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 ml-3">Valuation Report</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Report of total inventory value at cost and sale prices.
          </p>
          <button
            onClick={exportValuationToExcel}
            className="w-full bg-[#008000] text-white px-4 py-2 rounded-lg hover:bg-[#006600] transition-colors whitespace-nowrap"
          >
            <i className="ri-download-line mr-2"></i>
            Generate Report
          </button>
        </div>

      </div>

      {/* General Statistics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">General Statistics</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Total Products</p>
            <p className="text-2xl font-bold text-blue-600">{items.length}</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Categories</p>
            <p className="text-2xl font-bold text-green-600">{categories.length}</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Monthly Movements</p>
            <p className="text-2xl font-bold text-purple-600">
              {movements.filter(m => {
                const movementDate = new Date(m.movement_date);
                const now = new Date();
                return (
                  movementDate.getMonth() === now.getMonth() &&
                  movementDate.getFullYear() === now.getFullYear()
                );
              }).length}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Locations</p>
            <p className="text-2xl font-bold text-indigo-600">{warehouses.length}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderModal = () => {
    if (!showModal) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {modalType === 'item'
                ? (selectedItem ? 'Edit Product' : 'New Product')
                : modalType === 'movement'
                  ? 'Inventory Movement'
                  : modalType === 'warehouse'
                    ? (selectedItem ? 'Edit Location' : 'New Location')
                    : modalType === 'warehouse_entry'
                      ? 'Location Entry'
                      : modalType === 'warehouse_transfer'
                        ? 'Location Transfer'
                        : modalType === 'add_to_inventory'
                          ? 'Add to Inventory'
                          : 'Inventory Management'}
            </h3>
            <button
              type="button"
              onClick={handleCloseModal}
              className="text-gray-400 hover:text-gray-600"
            >
              <i className="ri-close-line text-xl" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {modalType === 'item' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SKU *
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.sku || ''}
                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                      <button
                        type="button"
                        onClick={generateSKU}
                        className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-200 transition-colors whitespace-nowrap text-sm"
                      >
                        Generate
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    {productCategories.length === 0 ? (
                      <div className="w-full border border-dashed border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-500 bg-gray-50">
                        No categories yet. Add one in the <strong>Categories</strong> tab.
                      </div>
                    ) : (
                      <select
                        value={formData.category || ''}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      >
                        <option value="">Select a category</option>
                        {productCategories.map((category: any) => (
                          <option key={category.id} value={category.name}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Product Type
                    </label>
                    <select
                      value={formData.product_type || 'unit'}
                      onChange={(e) => setFormData({ ...formData, product_type: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                    >
                      <option value="unit">Unit</option>
                      <option value="box">Box</option>
                      <option value="mixed_box">Mixed Box</option>
                      <option value="mixed_pallet">Mixed Pallets</option>
                      <option value="package">Package</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantity per Type
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.quantity_per_type ?? 1}
                      onChange={(e) => setFormData({ ...formData, quantity_per_type: parseInt(e.target.value) || 1 })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="E.g.: 24 for box of 24"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vendor / Supplier
                    </label>
                    <select
                      value={formData.vendor_id || ''}
                      onChange={(e) => setFormData({ ...formData, vendor_id: e.target.value || null })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                    >
                      <option value="">Select vendor</option>
                      {suppliers.map((sup: any) => (
                        <option key={sup.id} value={sup.id}>
                          {sup.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unit of Measure
                    </label>
                    <input
                      type="text"
                      list="unit-of-measure-options"
                      value={formData.unit_of_measure || ''}
                      onChange={(e) => setFormData({ ...formData, unit_of_measure: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Select or type unit"
                    />
                    <datalist id="unit-of-measure-options">
                      <option value="Unit" />
                      <option value="Piece" />
                      <option value="Box" />
                      <option value="Pack" />
                      <option value="Dozen" />
                      <option value="Pair" />
                      <option value="Kg" />
                      <option value="Gram" />
                      <option value="Pound" />
                      <option value="Ounce" />
                      <option value="Liter" />
                      <option value="Gallon" />
                      <option value="Meter" />
                      <option value="Foot" />
                      <option value="Inch" />
                      <option value="Square meter" />
                      <option value="Square foot" />
                      <option value="Roll" />
                      <option value="Bag" />
                      <option value="Bottle" />
                      <option value="Can" />
                      <option value="Barrel" />
                      <option value="Sack" />
                      <option value="Service" />
                      <option value="Hour" />
                      {/* Add existing custom units */}
                      {Array.from(new Set(items.map((it: any) => it.unit_of_measure).filter((u: any) => u && String(u).trim() !== '')))
                        .filter((u: any) => !['Unit', 'Piece', 'Box', 'Pack', 'Dozen', 'Pair', 'Kg', 'Gram', 'Pound', 'Ounce', 'Liter', 'Gallon', 'Meter', 'Foot', 'Inch', 'Square meter', 'Square foot', 'Roll', 'Bag', 'Bottle', 'Can', 'Barrel', 'Sack', 'Service', 'Hour'].includes(u))
                        .map((unit: any) => (
                          <option key={String(unit)} value={String(unit)} />
                        ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Initial Stock
                    </label>
                    <input
                      type="number" min="0"
                      value={formData.current_stock ?? ''}
                      onChange={(e) => setFormData({ ...formData, current_stock: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Location
                    </label>
                    <select
                      value={formData.warehouse_id || (warehouses[0]?.id ?? '')}
                      onChange={(e) =>
                        setFormData({ ...formData, warehouse_id: e.target.value || null })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                    >
                      {warehouses.length === 0 && (
                        <option value="">No locations configured</option>
                      )}
                      {warehouses.map((wh) => (
                        <option key={wh.id} value={wh.id}>
                          {wh.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Minimum Stock
                    </label>
                    <input
                      type="number" min="0"
                      value={formData.minimum_stock ?? ''}
                      onChange={(e) => setFormData({ ...formData, minimum_stock: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Maximum Stock
                    </label>
                    <input
                      type="number" min="0"
                      value={formData.maximum_stock ?? ''}
                      onChange={(e) => setFormData({ ...formData, maximum_stock: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Purchase Price (before tax)
                    </label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      value={formData.cost_price ?? ''}
                      onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sale Price
                    </label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      value={formData.selling_price ?? ''}
                      onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Pricing by Type Section */}
                <div className="border-t pt-4 mt-4">
                  <h4 className="text-md font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <i className="ri-price-tag-3-line text-green-600"></i>
                    Pricing by Type
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Unit Price
                      </label>
                      <input
                        type="number" min="0"
                        step="0.01"
                        value={formData.unit_price ?? ''}
                        onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Box Price
                      </label>
                      <input
                        type="number" min="0"
                        step="0.01"
                        value={formData.box_price ?? ''}
                        onChange={(e) => setFormData({ ...formData, box_price: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Pallet Price
                      </label>
                      <input
                        type="number" min="0"
                        step="0.01"
                        value={formData.pallet_price ?? ''}
                        onChange={(e) => setFormData({ ...formData, pallet_price: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Package Price
                      </label>
                      <input
                        type="number" min="0"
                        step="0.01"
                        value={formData.package_price ?? ''}
                        onChange={(e) => setFormData({ ...formData, package_price: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Product Image
                    </label>
                    <div className="flex items-center gap-4">
                      {formData.image_url && (
                        <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={formData.image_url}
                            alt={formData.name || 'Product'}
                            className="w-full h-full object-cover"
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
                          <i className="ri-upload-cloud-line text-2xl text-gray-400 mb-2 block" />
                          <span className="text-sm text-gray-600">
                            {formData.image_url ? 'Change image' : 'Upload image'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Item Type
                      </label>
                      <select
                        value={formData.item_type || 'inventory'}
                        onChange={(e) => setFormData({ ...formData, item_type: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      >
                        <option value="inventory">Inventory product</option>
                        <option value="service">Service</option>
                        <option value="fixed_asset">Fixed asset</option>
                      </select>
                    </div>
                    <div>
                      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={formData.is_active !== false}
                          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Active
                      </label>
                    </div>
                    <div>
                      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={formData.is_commissionable === false}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              is_commissionable: e.target.checked ? false : true,
                            })
                          }
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Not commissionable
                      </label>
                    </div>
                  </div>
                </div>

                {/* Accounting Accounts section hidden */}
              </>)} 

            {modalType === 'movement' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Product *
                    </label>
                    <select
                      value={formData.item_id || ''}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        const selected = items.find((it) => String(it.id) === String(selectedId));
                        setFormData({
                          ...formData,
                          item_id: selectedId,
                          unit_cost: selected?.cost_price ?? formData.unit_cost,
                        });
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      required
                    >
                      <option value="">Select product</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.sku})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Movement Type *
                    </label>
                    <select
                      value={formData.movement_type || ''}
                      onChange={(e) => setFormData({ ...formData, movement_type: e.target.value, adjustment_direction: 'positive' })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      required
                    >
                      <option value="">Select type</option>
                      <option value="entry">Entry</option>
                      <option value="exit">Exit</option>
                      <option value="transfer">Transfer</option>
                      <option value="adjustment">Adjustment</option>
                    </select>
                  </div>
                  {formData.movement_type === 'adjustment' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Adjustment Type *
                      </label>
                      <select
                        value={formData.adjustment_direction || 'positive'}
                        onChange={(e) => setFormData({ ...formData, adjustment_direction: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                        required
                      >
                        <option value="positive">Positive adjustment (stock increase)</option>
                        <option value="negative">Negative adjustment (decrease/shrinkage)</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Accounting Account (offset)
                    </label>
                    <select
                      value={formData.account_id || ''}
                      onChange={(e) => setFormData({ ...formData, account_id: e.target.value || null })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      required
                    >
                      <option value="">Select account</option>
                      {accounts
                        .filter((acc) => {
                          const t = (acc.type || '').toLowerCase();
                          return t === 'asset' || acc.code?.startsWith('1');
                        })
                        .map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} - {acc.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantity *
                    </label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      value={formData.quantity ?? ''}
                      onChange={(e) =>
                        setFormData({ ...formData, quantity: parseFloat(e.target.value || '0') })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unit Cost
                    </label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      value={formData.unit_cost ?? ''}
                      readOnly
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Movement Date *
                    </label>
                    <input
                      type="date"
                      value={formData.movement_date || new Date().toISOString().split('T')[0]}
                      onChange={(e) => setFormData({ ...formData, movement_date: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reference
                    </label>
                    <input
                      type="text"
                      value={formData.reference || ''}
                      onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="E.g.: Invoice #123, Order #456"
                    />
                  </div>
                  <div className="md:col-span-2 lg:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={formData.notes || ''}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                      placeholder="Additional information about the movement"
                    />
                  </div>
                </div>
              </>
            )}

            {modalType === 'add_to_inventory' && (
              <>
                {/* Product Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Select Product *
                    </label>
                    <select
                      value={formData.item_id || ''}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        const selected = items.find((it) => String(it.id) === String(selectedId));
                        if (selected) {
                          const defaultUnitPrice = selected.unit_price || selected.cost_price || selected.selling_price || 0;
                          const defaultBoxPrice = selected.box_price || (selected.quantity_per_type ? (defaultUnitPrice * Number(selected.quantity_per_type || 1)) : 0) || 0;
                          const defaultPalletPrice = selected.pallet_price || selected.cost_price || selected.selling_price || 0;
                          const defaultPackagePrice = selected.package_price || (selected.quantity_per_type ? (defaultUnitPrice * Number(selected.quantity_per_type || 1)) : 0) || 0;
                          setFormData({
                            ...formData,
                            item_id: selectedId,
                            product_name: selected.name,
                            sku: selected.sku,
                            category: selected.category,
                            warehouse_id: selected.warehouse_id,
                            vendor_id: selected.vendor_id,
                            image_url: selected.image_url,
                            current_stock: selected.current_stock || 0,
                            minimum_stock: selected.minimum_stock || 0,
                            maximum_stock: selected.maximum_stock || 0,
                            product_type: selected.product_type || 'unit',
                            quantity_per_type: selected.quantity_per_type || 1,
                            unit_price: defaultUnitPrice,
                            box_price: defaultBoxPrice,
                            pallet_price: defaultPalletPrice,
                            package_price: defaultPackagePrice,
                            add_quantity: 0,
                            entry_type: selected.product_type || 'unit',
                          });
                        }
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 pr-8"
                      required
                    >
                      <option value="">Select a product to add inventory</option>
                      {items.filter((it) => it.item_type === 'inventory' || !it.item_type).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.sku} - {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {formData.item_id && (
                  <>
                    {/* Product Info Display */}
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex items-start gap-4">
                        {formData.image_url && (
                          <div className="w-20 h-20 rounded-lg overflow-hidden bg-white flex-shrink-0">
                            <img
                              src={formData.image_url}
                              alt={formData.product_name || 'Product'}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-xs text-gray-500">SKU</p>
                            <p className="font-medium text-gray-900">{formData.sku}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Product Name</p>
                            <p className="font-medium text-gray-900">{formData.product_name}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Category</p>
                            <p className="font-medium text-gray-900">{formData.category || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Location</p>
                            <p className="font-medium text-gray-900">
                              {warehouses.find((w) => w.id === formData.warehouse_id)?.name || '-'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Entry Type */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Entry Type *
                        </label>
                        <select
                          value={formData.entry_type || 'unit'}
                          onChange={(e) => setFormData({ ...formData, entry_type: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 pr-8"
                        >
                          <option value="unit">Unit</option>
                          <option value="box">Box</option>
                          <option value="mixed_box">Mixed Box</option>
                          <option value="pallet">Pallet Price</option>
                          <option value="mixed_pallet">Mixed Pallets</option>
                          <option value="package">Package</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Vendor / Supplier
                        </label>
                        <select
                          value={formData.vendor_id || ''}
                          onChange={(e) => setFormData({ ...formData, vendor_id: e.target.value || null })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 pr-8"
                        >
                          <option value="">Select vendor</option>
                          {suppliers.map((sup: any) => (
                            <option key={sup.id} value={sup.id}>
                              {sup.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="text-md font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <i className="ri-stack-line text-green-600"></i>
                        Stock Calculation
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Actual Stock
                          </label>
                          <input
                            type="number"
                            value={formData.current_stock ?? 0}
                            readOnly
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-700 font-bold text-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Add to Stock *
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={formData.add_quantity ?? ''}
                            onChange={(e) => {
                              const addQty = parseInt(e.target.value) || 0;
                              const totalStock = (Number(formData.current_stock) || 0) + addQty;
                              setFormData({ ...formData, add_quantity: e.target.value, total_stock: totalStock });
                            }}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 font-bold text-lg"
                            placeholder="Enter quantity"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Total Stock
                          </label>
                          <input
                            type="number"
                            value={formData.total_stock ?? (Number(formData.current_stock) || 0)}
                            readOnly
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-700 font-bold text-lg"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                        <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                          <i className="ri-alert-line text-yellow-600"></i>
                          <span className="text-sm text-yellow-800">
                            <strong>Minimum Stock:</strong> {formData.minimum_stock ?? 0}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <i className="ri-information-line text-blue-600"></i>
                          <span className="text-sm text-blue-800">
                            <strong>Maximum Stock:</strong> {formData.maximum_stock ?? 0}
                          </span>
                        </div>
                      </div>

                      {formData.total_stock !== undefined && formData.maximum_stock > 0 && formData.total_stock > formData.maximum_stock && (
                        <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200 flex items-center gap-2">
                          <i className="ri-error-warning-line text-red-600"></i>
                          <span className="text-sm text-red-800">
                            <strong>Warning:</strong> Total stock ({formData.total_stock}) exceeds maximum stock ({formData.maximum_stock})
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="text-md font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <i className="ri-price-tag-3-line text-green-600"></i>
                        Entry Price ({formData.entry_type === 'unit' ? 'Unit' : formData.entry_type === 'box' ? 'Box' : formData.entry_type === 'pallet' ? 'Pallet Price' : formData.entry_type === 'mixed_pallet' ? 'Mixed Pallets' : formData.entry_type === 'package' ? 'Package' : 'Mixed Box'})
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {formData.entry_type === 'unit' ? 'Unit Price' : formData.entry_type === 'box' ? 'Box Price' : formData.entry_type === 'pallet' || formData.entry_type === 'mixed_pallet' ? 'Pallet Price' : formData.entry_type === 'package' ? 'Package Price' : 'Mixed Box Price'}
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={
                              formData.entry_type === 'unit' ? (formData.unit_price ?? '') :
                              formData.entry_type === 'box' ? (formData.box_price ?? '') :
                              formData.entry_type === 'pallet' || formData.entry_type === 'mixed_pallet' ? (formData.pallet_price ?? '') :
                              formData.entry_type === 'package' ? (formData.package_price ?? '') :
                              (formData.box_price ?? '')
                            }
                            onChange={(e) => {
                              const priceField = formData.entry_type === 'unit' ? 'unit_price' :
                                formData.entry_type === 'box' || formData.entry_type === 'mixed_box' ? 'box_price' :
                                formData.entry_type === 'pallet' || formData.entry_type === 'mixed_pallet' ? 'pallet_price' : 'package_price';
                              setFormData({ ...formData, [priceField]: e.target.value });
                            }}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Entry Date
                          </label>
                          <input
                            type="date"
                            value={formData.entry_date || new Date().toISOString().split('T')[0]}
                            onChange={(e) => setFormData({ ...formData, entry_date: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* Notes */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Notes
                      </label>
                      <textarea
                        value={formData.entry_notes || ''}
                        onChange={(e) => setFormData({ ...formData, entry_notes: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                        rows={2}
                        placeholder="Additional notes about this inventory entry"
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {modalType === 'warehouse_entry' && (
              <>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Entry Source</label>
                      <select
                        value={formData.source_type || ''}
                        onChange={(e) => setFormData({ ...formData, source_type: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      >
                        <option value="">Select source</option>
                        <option value="conduce_suplidor">Supplier delivery note / Purchase order</option>
                        <option value="devolucion_cliente">Customer return</option>
                        <option value="otros">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Receiving Location *</label>
                      <select
                        value={formData.warehouse_id || ''}
                        onChange={(e) => setFormData({ ...formData, warehouse_id: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                        required
                      >
                        <option value="">Select location</option>
                        {warehouses.map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            {wh.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Related Invoice <span className="text-red-500">*</span></label>
                      <select
                        value={formData.related_invoice_id || ''}
                        onChange={(e) => {
                          const value = e.target.value || null;
                          let issuerName = formData.issuer_name || '';
                          let documentNumber = formData.document_number || '';
                          if (value) {
                            const inv = entryInvoices.find((x) => String(x.id) === String(value));
                            const customerName = (inv as any)?.customers?.name as string | undefined;
                            if (customerName) {
                              issuerName = customerName;
                            }
                            const invNumber = String((inv as any)?.invoice_number || '');
                            // If the invoice has a number (NCF or internal), use it as document number
                            if (invNumber) {
                              documentNumber = invNumber;
                            }
                          }
                          setFormData({
                            ...formData,
                            related_invoice_id: value,
                            issuer_name: issuerName,
                            document_number: documentNumber || null,
                          });
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      >
                        <option value="">No invoice</option>
                        {entryInvoices.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {(inv.invoice_number || inv.id) + (inv.customers?.name ? ` - ${inv.customers.name}` : '')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Related Delivery Note</label>
                      <select
                        value={formData.related_delivery_note_id || ''}
                        onChange={(e) => {
                          const value = e.target.value || null;
                          let issuerName = formData.issuer_name || '';
                          if (value) {
                            const dn = entryDeliveryNotes.find((x) => String(x.id) === String(value));
                            const customerName = (dn as any)?.customers?.name as string | undefined;
                            if (customerName) {
                              issuerName = customerName;
                            }
                          }
                          setFormData({
                            ...formData,
                            related_delivery_note_id: value,
                            issuer_name: issuerName,
                          });
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      >
                        <option value="">No delivery note</option>
                        {entryDeliveryNotes.map((dn) => (
                          <option key={dn.id} value={dn.id}>
                            {(dn.document_number || dn.id) + (dn.customers?.name ? ` - ${dn.customers.name}` : '')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Document Date</label>
                      <input
                        type="date"
                        value={formData.document_date || new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setFormData({ ...formData, document_date: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Document Number</label>
                      <input
                        type="text"
                        value={formData.document_number || ''}
                        onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="E.g.: NCF or delivery note number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Issuer Name</label>
                      <input
                        type="text"
                        value={formData.issuer_name || ''}
                        onChange={(e) => setFormData({ ...formData, issuer_name: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Supplier or customer name"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Description</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      placeholder="E.g.: Product return, partial receipt, etc."
                    />
                  </div>

                  <div className="mt-4">
                    <h4 className="text-md font-semibold text-gray-900 mb-2">Product Lines</h4>
                    <div className="space-y-3">
                      {warehouseEntryLines.map((line, idx) => (
                        <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Item</label>
                            <select
                              value={line.inventory_item_id || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                const selected = items.find((it) => String(it.id) === String(value));
                                const baseCost =
                                  selected && selected.average_cost != null
                                    ? Number(selected.average_cost) || 0
                                    : selected
                                      ? Number(selected.cost_price) || 0
                                      : 0;
                                setWarehouseEntryLines((prev) =>
                                  prev.map((ln, i) =>
                                    i === idx
                                      ? {
                                          ...ln,
                                          inventory_item_id: value,
                                          unit_cost:
                                            baseCost > 0
                                              ? String(baseCost)
                                              : ln.unit_cost,
                                        }
                                      : ln,
                                  ),
                                );
                              }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                            >
                              <option value="">Select product</option>
                              {items.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name} ({item.sku})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                            <input
                              type="number"
                              step="1"
                              min="0"
                              value={line.quantity}
                              onChange={(e) => {
                                const value = e.target.value;
                                setWarehouseEntryLines((prev) =>
                                  prev.map((ln, i) => (i === idx ? { ...ln, quantity: value } : ln)),
                                );
                              }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Unit Cost</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.unit_cost}
                              readOnly
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                            <input
                              type="text"
                              value={line.notes || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setWarehouseEntryLines((prev) =>
                                  prev.map((ln, i) => (i === idx ? { ...ln, notes: value } : ln)),
                                );
                              }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setWarehouseEntryLines((prev) => [
                                  ...prev,
                                  { inventory_item_id: '', quantity: '', unit_cost: '', notes: '' },
                                ]);
                              }}
                              className="px-3 py-2 bg-green-100 text-green-700 rounded-lg border border-green-200 hover:bg-green-200 text-xs"
                            >
                              <i className="ri-add-line"></i>
                            </button>
                            {warehouseEntryLines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setWarehouseEntryLines((prev) => prev.filter((_, i) => i !== idx));
                                }}
                                className="px-3 py-2 bg-red-100 text-red-700 rounded-lg border border-red-200 hover:bg-red-200 text-xs"
                              >
                                <i className="ri-delete-bin-line"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {modalType === 'warehouse_transfer' && (
              <>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Source Location *</label>
                      <select
                        value={formData.from_warehouse_id || ''}
                        onChange={(e) => setFormData({ ...formData, from_warehouse_id: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                        required
                      >
                        <option value="">Select location</option>
                        {warehouses.map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            {wh.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Destination Location *</label>
                      <select
                        value={formData.to_warehouse_id || ''}
                        onChange={(e) => setFormData({ ...formData, to_warehouse_id: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                        required
                      >
                        <option value="">Select location</option>
                        {warehouses.map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            {wh.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Date *</label>
                      <input
                        type="date"
                        value={formData.transfer_date || new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setFormData({ ...formData, transfer_date: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Document Number</label>
                      <input
                        type="text"
                        value={formData.document_number || ''}
                        onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="E.g.: Internal reference"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description / Concept</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      placeholder="E.g.: Transfer between warehouses"
                    />
                  </div>

                  <div className="mt-4">
                    <h4 className="text-md font-semibold text-gray-900 mb-2">Product Lines</h4>
                    <div className="space-y-3">
                      {transferLines.map((line, idx) => {
                        const originId = formData.from_warehouse_id;
                        const originBalances = originId
                          ? warehouseBalances[String(originId)] || {}
                          : {};

                        const availableItems = originId
                          ? items.filter((it) => {
                              if (!it || !it.id) return false;
                              const inWarehouse = String(it.warehouse_id) === String(originId);
                              const qty = Number(it.current_stock) || 0;
                              return inWarehouse && qty > 0;
                            })
                          : items;

                        const selectedItem = availableItems.find(
                          (it) => String(it.id) === String(line.inventory_item_id),
                        );
                        const availableQty = selectedItem
                          ? Number(selectedItem.current_stock) || 0
                          : 0;

                        return (
                          <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium text-gray-700 mb-1">Item</label>
                              <select
                                value={line.inventory_item_id || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  // Auto-fill quantity with total stock when selecting product
                                  const selected = availableItems.find((it) => String(it.id) === String(value));
                                  const stockQty = selected ? String(Number(selected.current_stock) || 0) : '';
                                  setTransferLines((prev) =>
                                    prev.map((ln, i) => (i === idx ? { ...ln, inventory_item_id: value, quantity: stockQty } : ln)),
                                  );
                                }}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                              >
                                <option value="">Select product</option>
                                {availableItems.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name} ({item.sku}) - Stock: {item.current_stock}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Units to Transfer</label>
                              <input
                                type="number"
                                value={line.quantity}
                                readOnly
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-700 cursor-not-allowed"
                              />
                              {selectedItem && (
                                <p className="mt-1 text-xs text-green-600 font-medium">
                                  All {availableQty} units will be transferred
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                              <input
                                type="text"
                                value={line.notes || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setTransferLines((prev) =>
                                    prev.map((ln, i) => (i === idx ? { ...ln, notes: value } : ln)),
                                  );
                                }}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setTransferLines((prev) => [
                                    ...prev,
                                    { inventory_item_id: '', quantity: '', notes: '' },
                                  ]);
                                }}
                                className="px-3 py-2 bg-green-100 text-green-700 rounded-lg border border-green-200 hover:bg-green-200 text-xs"
                              >
                                <i className="ri-add-line"></i>
                              </button>
                              {transferLines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTransferLines((prev) => prev.filter((_, i) => i !== idx));
                                  }}
                                  className="px-3 py-2 bg-red-100 text-red-700 rounded-lg border border-red-200 hover:bg-red-200 text-xs"
                                >
                                  <i className="ri-delete-bin-line"></i>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}

            {modalType === 'warehouse' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={formData.location || ''}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Address or location zone"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Location description"
                  />
                </div>
              </div>
            )}

            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={handleCloseModal}
                className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-[#008000] text-white py-2 px-4 rounded-lg hover:bg-[#006600] transition-colors whitespace-nowrap"
              >
                {selectedItem ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="ml-4 text-gray-600">Loading inventory module...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f1e3] p-6">

      {/* Header with back button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#c0b59f] bg-[#fdf6e7] text-[#3b4d2d] text-sm font-medium shadow-sm hover:bg-[#f4ead4] hover:border-[#b1a78f] transition-colors"
          >
            <i className="ri-arrow-left-line text-lg"></i>
            <span>Back to Home</span>
          </button>

          <div className="h-6 w-px bg-gray-300"></div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-[#d4c9b1] mb-6">
        <nav className="-mb-px flex flex-wrap gap-4">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: 'ri-dashboard-line' },
            { id: 'products', label: 'Products', icon: 'ri-box-3-line' },
            { id: 'movements', label: 'Movements', icon: 'ri-exchange-line' },
            { id: 'entries', label: 'Entries', icon: 'ri-download-line' },

            { id: 'transfers', label: 'Transfers', icon: 'ri-swap-line' },
            { id: 'warehouses', label: 'Locations', icon: 'ri-building-line' },
            { id: 'categories', label: 'Categories', icon: 'ri-price-tag-3-line' },
            { id: 'reports', label: 'Reports', icon: 'ri-file-chart-line' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-2 px-2 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-[#6b7a40] text-[#3b4d2d]'
                  : 'border-transparent text-gray-500 hover:text-[#4f5f33] hover:border-[#c7bda7]'
              }`}
            >
              <i className={tab.icon}></i>
              {tab.label}
            </button>
          ))}

        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'products' && renderItems()}
        {activeTab === 'movements' && renderMovements()}
        {activeTab === 'entries' && renderWarehouseEntriesTab()}
        {activeTab === 'transfers' && renderWarehouseTransfersTab()}
        {activeTab === 'warehouses' && renderWarehouses()}
        {activeTab === 'categories' && renderCategories()}
        {activeTab === 'reports' && renderReports()}
      </div>

      {/* Modal */}
      {renderModal()}

      {showEmptyWarehouseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Empty Location</h2>
              <button
                onClick={() => {
                  if (emptyingWarehouse) return;
                  setShowEmptyWarehouseModal(false);
                  setEmptyWarehouseSource(null);
                  setEmptyWarehouseTargetId('');
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div className="text-sm text-gray-600">
                Source:
                <span className="font-semibold text-gray-900"> {emptyWarehouseSource?.name || ''}</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Destination Location *</label>
                <select
                  value={emptyWarehouseTargetId}
                  onChange={(e) => setEmptyWarehouseTargetId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]"
                >
                  <option value="">Select destination</option>
                  {warehouses
                    .filter((w: any) => String(w?.id) !== String(emptyWarehouseSource?.id))
                    .map((w: any) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
                This will transfer ALL products/stock from the source location to the selected destination.
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  if (emptyingWarehouse) return;
                  setShowEmptyWarehouseModal(false);
                  setEmptyWarehouseSource(null);
                  setEmptyWarehouseTargetId('');
                }}
                className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors whitespace-nowrap"
                disabled={emptyingWarehouse}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmEmptyWarehouse}
                disabled={emptyingWarehouse || !emptyWarehouseTargetId}
                className="flex-1 bg-[#008000] text-white py-2 px-4 rounded-lg font-medium hover:bg-[#006600] disabled:opacity-50"
              >
                {emptyingWarehouse ? 'Transferring...' : 'Transfer All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showViewWarehouseModal && viewWarehouse && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                Products in: {viewWarehouse?.name || 'Location'}
              </h2>
              <button
                onClick={() => {
                  setShowViewWarehouseModal(false);
                  setViewWarehouse(null);
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {(() => {
                const productsInWarehouse = (Array.isArray(items) ? items : [])
                  .filter((it: any) => String(it?.warehouse_id ?? '') === String(viewWarehouse?.id));
                
                if (productsInWarehouse.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-500">
                      <i className="ri-inbox-line text-4xl mb-2"></i>
                      <p>No products in this location</p>
                    </div>
                  );
                }

                return (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stock</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {productsInWarehouse.map((item: any) => {
                        const stock = Number(item?.current_stock) || 0;
                        const cost = Number(item?.cost_price) || 0;
                        const value = stock * cost;
                        return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-600">{item.sku || 'N/A'}</td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.name}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">{stock}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">${cost.toLocaleString('es-DO')}</td>
                            <td className="px-4 py-3 text-sm text-right font-medium text-[#008000]">${value.toLocaleString('es-DO')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            <div className="p-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowViewWarehouseModal(false);
                  setViewWarehouse(null);
                }}
                className="w-full bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}