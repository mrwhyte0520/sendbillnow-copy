import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { inventoryService } from '../../services/database';
import { supplierCatalogService } from './supplierCatalog.service';
import {
  createManualCatalogProduct,
  importCatalogFromGoogleSheets,
} from './catalogImport.utils';
import type {
  NormalizedCatalogProductInput,
  SupplierCatalogPriceHistoryEntry,
  SupplierCatalogProduct,
  SupplierCatalogSyncSchedule,
} from './types';
import { parseCSV, type CatalogParserProduct } from '../supplier-intelligence/catalog-parsers/parseCSV';
import { parseExcel } from '../supplier-intelligence/catalog-parsers/parseExcel';
import { parseJSON } from '../supplier-intelligence/catalog-parsers/parseJSON';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

type SupplierCatalogManagerProps = {
  compact?: boolean;
  onCatalogUpdated?: () => void;
};

const initialManualForm: NormalizedCatalogProductInput = {
  productName: '',
  price: 0,
  stock: 0,
  category: '',
  description: '',
  supplier: '',
  imageUrl: '',
  sku: '',
};

const mapParsedProductToCatalogInput = (product: CatalogParserProduct): NormalizedCatalogProductInput => ({
  productName: String(product.product_name || product.description || product.id || '').trim(),
  description: String(product.description || '').trim(),
  category: String(product.category || '').trim(),
  supplier: String(product.supplier || '').trim(),
  price: Number(product.price) || 0,
  stock: Math.max(Number(product.stock) || 0, 0),
  imageUrl: String(product.image_url || '').trim(),
  sku: String(product.id || '').trim(),
});

const isValidCatalogInput = (item: NormalizedCatalogProductInput) => {
  return Boolean(String(item.productName || '').trim() && String(item.supplier || '').trim());
};

const generateImportSku = () => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `PRD-${timestamp}-${random}`;
};

const syncImportedProductsToInventory = async (userId: string, items: NormalizedCatalogProductInput[]) => {
  const existingItems = await inventoryService.getItems(userId);
  const existingBySkuOrName = new Map<string, any>();

  (existingItems || []).forEach((item: any) => {
    const skuKey = String(item?.sku || '').trim().toLowerCase();
    const nameKey = String(item?.name || '').trim().toLowerCase();

    if (skuKey) {
      existingBySkuOrName.set(`sku:${skuKey}`, item);
    }

    if (nameKey) {
      existingBySkuOrName.set(`name:${nameKey}`, item);
    }
  });

  for (const product of items) {
    const name = String(product.productName || '').trim() || 'Unnamed Product';
    const sku = String(product.sku || '').trim() || generateImportSku();
    const supplier = String(product.supplier || '').trim() || 'Imported Supplier';
    const price = Number(product.price) || 0;
    const stock = Math.max(Number(product.stock) || 0, 0);
    const payload = {
      name,
      sku,
      category: String(product.category || 'Supplier Imported').trim() || 'Supplier Imported',
      selling_price: price,
      cost_price: price,
      current_stock: stock,
      min_stock: 0,
      max_stock: Math.max(stock, 0),
      barcode: '',
      description: String(product.description || '').trim(),
      supplier,
      image_url: String(product.imageUrl || '').trim(),
      is_active: true,
      expense_account_id: null,
      inventory_account_id: null,
      cogs_account_id: null,
      warehouse_id: null,
    };

    const skuKey = sku ? `sku:${sku.toLowerCase()}` : '';
    const nameKey = `name:${name.toLowerCase()}`;
    const existingMatch = (skuKey ? existingBySkuOrName.get(skuKey) : null) || existingBySkuOrName.get(nameKey);

    if (existingMatch?.id) {
      const updated = await inventoryService.updateItem(userId, String(existingMatch.id), payload);
      const nextMatch = { ...existingMatch, ...payload, ...(updated || {}) };
      if (skuKey) {
        existingBySkuOrName.set(skuKey, nextMatch);
      }
      existingBySkuOrName.set(nameKey, nextMatch);
      continue;
    }

    const created = await inventoryService.createItem(userId, payload);
    if (created) {
      const createdSkuKey = String(created?.sku || sku || '').trim().toLowerCase();
      const createdNameKey = String(created?.name || name || '').trim().toLowerCase();
      if (createdSkuKey) {
        existingBySkuOrName.set(`sku:${createdSkuKey}`, created);
      }
      if (createdNameKey) {
        existingBySkuOrName.set(`name:${createdNameKey}`, created);
      }
    }
  }
};

const deleteImportedProductFromInventory = async (userId: string, product: SupplierCatalogProduct) => {
  const existingItems = await inventoryService.getItems(userId);
  const normalizedSku = String(product.sku || '').trim().toLowerCase();
  const normalizedName = String(product.productName || '').trim().toLowerCase();

  const match = (existingItems || []).find((item: any) => {
    const itemSku = String(item?.sku || '').trim().toLowerCase();
    const itemName = String(item?.name || '').trim().toLowerCase();
    if (normalizedSku && itemSku === normalizedSku) {
      return true;
    }
    return itemName === normalizedName;
  });

  if (match?.id) {
    await inventoryService.deleteItem(String(match.id));
  }
};

export default function SupplierCatalogManager({ compact = false, onCatalogUpdated }: SupplierCatalogManagerProps) {
  const { user } = useAuth();
  const [products, setProducts] = useState<SupplierCatalogProduct[]>([]);
  const [priceHistory, setPriceHistory] = useState<SupplierCatalogPriceHistoryEntry[]>([]);
  const [schedules, setSchedules] = useState<SupplierCatalogSyncSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState('');
  const [apiSyncUrl, setApiSyncUrl] = useState('');
  const [apiSyncSupplier, setApiSyncSupplier] = useState('');
  const [manualForm, setManualForm] = useState<NormalizedCatalogProductInput>(initialManualForm);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ supplier: '', frequency: 'daily', source: 'csv', sourceReference: '' });
  const [selectedFiles, setSelectedFiles] = useState<{
    excel: File | null;
    csv: File | null;
    json: File | null;
  }>({
    excel: null,
    csv: null,
    json: null,
  });

  const handleManualImageSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file.');
      event.target.value = '';
      return;
    }

    try {
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Unable to read image file.'));
        reader.readAsDataURL(file);
      });

      setManualForm((current) => ({ ...current, imageUrl: imageDataUrl }));
      setError('');
    } catch (imageError: any) {
      setError(imageError?.message || 'Unable to load image.');
    } finally {
      event.target.value = '';
    }
  };

  const loadData = async () => {
    if (!user?.id) {
      setProducts([]);
      setPriceHistory([]);
      setSchedules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [productRows, historyRows, scheduleRows] = await Promise.all([
        supplierCatalogService.getProducts(user.id),
        supplierCatalogService.getPriceHistory(user.id),
        supplierCatalogService.getSchedules(user.id),
      ]);
      setProducts(productRows);
      setPriceHistory(historyRows);
      setSchedules(scheduleRows);
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load supplier catalog.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id]);

  const notifyCatalogUpdated = () => {
    loadData();
    onCatalogUpdated?.();
    window.dispatchEvent(new CustomEvent('supplierCatalogUpdated'));
  };

  const supplierOptions = useMemo(() => {
    return Array.from(new Set(products.map((product) => product.supplier))).sort((left, right) => left.localeCompare(right));
  }, [products]);

  const handleImportedProducts = async (items: NormalizedCatalogProductInput[], source: 'excel' | 'csv' | 'google-sheets' | 'json', sourceReference?: string) => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      await supplierCatalogService.saveImportedProducts(user.id, items, source, sourceReference);
      let inventorySyncWarning = '';
      try {
        await syncImportedProductsToInventory(user.id, items);
      } catch (inventoryError) {
        console.error('Supplier catalog inventory sync error:', inventoryError);
        inventorySyncWarning = ' Catalog imported, but some products could not be migrated to Productos automatically.';
      }
      setSuccessMessage(`${items.length} products imported successfully.${inventorySyncWarning}`);
      notifyCatalogUpdated();
    } catch (importError: any) {
      setError(importError?.message || 'Unable to import supplier catalog.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>, type: 'excel' | 'csv' | 'json') => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFiles((current) => ({ ...current, [type]: file }));
  };

  const handleCatalogImport = async (type: 'excel' | 'csv' | 'json') => {
    const file = selectedFiles[type];
    if (!file || !user?.id) return;

    const normalizedFileName = file.name.toLowerCase();
    const detectedType =
      normalizedFileName.endsWith('.xlsx') || normalizedFileName.endsWith('.xls')
        ? 'excel'
        : normalizedFileName.endsWith('.csv')
          ? 'csv'
          : normalizedFileName.endsWith('.json')
            ? 'json'
              : type;

    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      let parsedProducts: CatalogParserProduct[] = [];

      if (detectedType === 'excel') {
        parsedProducts = await parseExcel(file);
      }
      if (detectedType === 'csv') {
        parsedProducts = await parseCSV(file);
      }
      if (detectedType === 'json') {
        parsedProducts = await parseJSON(file);
      }

      const items = parsedProducts.map(mapParsedProductToCatalogInput).filter(isValidCatalogInput);

      if (items.length === 0) {
        throw new Error('Catalog format not recognized. Please use the template.');
      }

      await supplierCatalogService.saveImportedProducts(user.id, items, detectedType, file.name);
      let inventorySyncWarning = '';
      try {
        await syncImportedProductsToInventory(user.id, items);
      } catch (inventoryError) {
        console.error('Supplier catalog inventory sync error:', inventoryError);
        inventorySyncWarning = ' Algunos productos no pudieron migrarse automáticamente a Productos.';
      }
      setSuccessMessage(`Catalog successfully imported. ${items.length} products added to Supplier Intelligence.${inventorySyncWarning}`);
      notifyCatalogUpdated();
    } catch (importError: any) {
      setError(importError?.message || 'Catalog format not recognized. Please use the template.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSheetsImport = async () => {
    if (!googleSheetsUrl.trim()) return;
    const items = await importCatalogFromGoogleSheets(googleSheetsUrl);
    await handleImportedProducts(items, 'google-sheets', googleSheetsUrl);
    setGoogleSheetsUrl('');
  };

  const handleManualSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.id) return;
    setLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      if (editingProductId) {
        await supplierCatalogService.updateProduct(user.id, editingProductId, manualForm);
        try {
          await syncImportedProductsToInventory(user.id, [manualForm]);
        } catch (inventoryError) {
          console.error('Supplier catalog inventory sync error:', inventoryError);
        }
        setSuccessMessage('Product updated successfully.');
      } else {
        const normalized = createManualCatalogProduct(manualForm);
        await supplierCatalogService.createManualProduct(user.id, normalized);
        try {
          await syncImportedProductsToInventory(user.id, [normalized]);
        } catch (inventoryError) {
          console.error('Supplier catalog inventory sync error:', inventoryError);
        }
        setSuccessMessage('Product created successfully.');
      }
      setManualForm(initialManualForm);
      setEditingProductId(null);
      notifyCatalogUpdated();
    } catch (submitError: any) {
      setError(submitError?.message || 'Unable to save product.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditProduct = (product: SupplierCatalogProduct) => {
    setEditingProductId(product.id);
    setManualForm({
      productName: product.productName,
      price: product.price,
      stock: product.stock,
      category: product.category,
      description: product.description,
      supplier: product.supplier,
      imageUrl: product.imageUrl,
      sku: product.sku,
    });
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      const productToDelete = products.find((item) => item.id === productId) || null;
      if (productToDelete) {
        try {
          await deleteImportedProductFromInventory(user.id, productToDelete);
        } catch (inventoryError) {
          console.error('Supplier catalog inventory delete sync error:', inventoryError);
        }
      }
      await supplierCatalogService.deleteProduct(user.id, productId);
      setSuccessMessage('Product removed successfully.');
      notifyCatalogUpdated();
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Unable to remove product.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearAllData = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      await supplierCatalogService.clearAllCatalogData(user.id);
      setSuccessMessage('All supplier catalog data has been cleared.');
      notifyCatalogUpdated();
    } catch (clearError: any) {
      setError(clearError?.message || 'Unable to clear catalog data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSchedule = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      await supplierCatalogService.saveSchedule(user.id, {
        supplier: scheduleForm.supplier,
        frequency: scheduleForm.frequency as 'manual' | 'daily' | 'weekly',
        source: scheduleForm.source as 'excel' | 'csv' | 'google-sheets' | 'json' | 'api',
        sourceReference: scheduleForm.sourceReference,
      });
      setScheduleForm({ supplier: '', frequency: 'daily', source: 'csv', sourceReference: '' });
      setSuccessMessage('Scheduled sync saved successfully.');
      notifyCatalogUpdated();
    } catch (scheduleError: any) {
      setError(scheduleError?.message || 'Unable to save sync schedule.');
    } finally {
      setLoading(false);
    }
  };

  const handleApiSync = async () => {
    if (!user?.id || !apiSyncUrl.trim() || !apiSyncSupplier.trim()) return;
    setLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      const items = await supplierCatalogService.runApiSync(user.id, apiSyncSupplier, apiSyncUrl);
      let inventorySyncWarning = '';
      try {
        await syncImportedProductsToInventory(user.id, items);
      } catch (inventoryError) {
        console.error('Supplier catalog API inventory sync error:', inventoryError);
        inventorySyncWarning = ' Algunos productos no pudieron migrarse automáticamente a Productos.';
      }
      setSuccessMessage(`Supplier API sync completed successfully. ${items.length} products added to Supplier Intelligence.${inventorySyncWarning}`);
      setApiSyncUrl('');
      setApiSyncSupplier('');
      notifyCatalogUpdated();
    } catch (syncError: any) {
      setError(syncError?.message || 'Unable to sync supplier API.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Supplier Catalog Import</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-900">Import supplier catalogs and manage price updates</h3>
            <p className="mt-2 text-sm text-slate-500">Upload Excel, CSV, JSON, paste Google Sheets, sync supplier APIs, and add products manually without breaking Supplier Intelligence.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Products: {products.length}</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Price updates: {priceHistory.length}</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Schedules: {schedules.length}</span>
          </div>
        </div>
        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {successMessage ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div> : null}
      </div>

      <div className={`grid gap-5 ${compact ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1 xl:grid-cols-[1.2fr_1fr]'}`}>
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="text-base font-semibold text-slate-900">Upload Catalog</h4>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                <span className="block font-medium text-slate-900">Excel Import</span>
                <span className="mt-1 block text-xs">.xlsx / .xls</span>
                <input type="file" accept=".xlsx,.xls" className="mt-3 block w-full text-xs" onChange={(event) => handleFileImport(event, 'excel')} />
                {selectedFiles.excel ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-slate-500">Selected file: {selectedFiles.excel.name}</p>
                    <button type="button" onClick={() => handleCatalogImport('excel')} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
                      Import Catalog
                    </button>
                  </div>
                ) : null}
              </label>
              <label className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                <span className="block font-medium text-slate-900">CSV Import</span>
                <span className="mt-1 block text-xs">.csv</span>
                <input type="file" accept=".csv" className="mt-3 block w-full text-xs" onChange={(event) => handleFileImport(event, 'csv')} />
                {selectedFiles.csv ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-slate-500">Selected file: {selectedFiles.csv.name}</p>
                    <button type="button" onClick={() => handleCatalogImport('csv')} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
                      Import Catalog
                    </button>
                  </div>
                ) : null}
              </label>
              <label className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                <span className="block font-medium text-slate-900">JSON Import</span>
                <span className="mt-1 block text-xs">Structured product JSON</span>
                <input type="file" accept=".json,application/json" className="mt-3 block w-full text-xs" onChange={(event) => handleFileImport(event, 'json')} />
                {selectedFiles.json ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-slate-500">Selected file: {selectedFiles.json.name}</p>
                    <button type="button" onClick={() => handleCatalogImport('json')} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
                      Import Catalog
                    </button>
                  </div>
                ) : null}
              </label>
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-900">Google Sheets Import</p>
              <div className="mt-3 flex flex-col gap-3 md:flex-row">
                <input value={googleSheetsUrl} onChange={(event) => setGoogleSheetsUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/..." className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" />
                <button type="button" onClick={handleGoogleSheetsImport} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Import Sheet</button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="text-base font-semibold text-slate-900">Manual Quick Add</h4>
            <form onSubmit={handleManualSubmit} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <input value={manualForm.productName} onChange={(event) => setManualForm((current) => ({ ...current, productName: event.target.value }))} placeholder="Product Name" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              <input value={manualForm.supplier} onChange={(event) => setManualForm((current) => ({ ...current, supplier: event.target.value }))} placeholder="Supplier" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              <input type="number" min={0} step="0.01" value={manualForm.price} onChange={(event) => setManualForm((current) => ({ ...current, price: Number(event.target.value) || 0 }))} placeholder="Price" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              <input type="number" min={0} step="1" value={manualForm.stock} onChange={(event) => setManualForm((current) => ({ ...current, stock: Number(event.target.value) || 0 }))} placeholder="Stock" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              <input value={manualForm.category} onChange={(event) => setManualForm((current) => ({ ...current, category: event.target.value }))} placeholder="Category" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input value={manualForm.imageUrl} onChange={(event) => setManualForm((current) => ({ ...current, imageUrl: event.target.value }))} placeholder="Image URL" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input value={manualForm.sku || ''} onChange={(event) => setManualForm((current) => ({ ...current, sku: event.target.value }))} placeholder="SKU" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Product Image</p>
                    <p className="text-xs text-slate-500">Upload an image file or keep using `Image URL`.</p>
                  </div>
                  <input type="file" accept="image/*" onChange={handleManualImageSelected} className="block w-full text-xs md:w-auto" />
                </div>
                {manualForm.imageUrl ? (
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <img src={manualForm.imageUrl} alt={manualForm.productName || 'Product preview'} className="h-20 w-20 rounded-lg border border-slate-200 bg-white object-cover" />
                    <button
                      type="button"
                      onClick={() => setManualForm((current) => ({ ...current, imageUrl: '' }))}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                    >
                      Remove Image
                    </button>
                  </div>
                ) : null}
              </div>
              <textarea value={manualForm.description} onChange={(event) => setManualForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" className="min-h-[96px] rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2" />
              <div className="md:col-span-2 flex flex-wrap gap-3">
                <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">{editingProductId ? 'Update Product' : 'Create Product'}</button>
                {editingProductId ? <button type="button" onClick={() => { setEditingProductId(null); setManualForm(initialManualForm); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700">Cancel Edit</button> : null}
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="text-base font-semibold text-slate-900">Automated Supplier Price Updates</h4>
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-900">API Supplier Sync</p>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <input value={apiSyncSupplier} onChange={(event) => setApiSyncSupplier(event.target.value)} placeholder="Supplier name" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  <input value={apiSyncUrl} onChange={(event) => setApiSyncUrl(event.target.value)} placeholder="https://supplier-api.example.com/catalog" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  <button type="button" onClick={handleApiSync} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Run API Sync</button>
                </div>
              </div>
              <form onSubmit={handleSaveSchedule} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-900">Scheduled Catalog Updates</p>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <input value={scheduleForm.supplier} onChange={(event) => setScheduleForm((current) => ({ ...current, supplier: event.target.value }))} placeholder="Supplier" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                  <select value={scheduleForm.source} onChange={(event) => setScheduleForm((current) => ({ ...current, source: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <option value="csv">CSV</option>
                    <option value="excel">Excel</option>
                    <option value="json">JSON</option>
                    <option value="google-sheets">Google Sheets</option>
                    <option value="pdf">PDF</option>
                    <option value="api">API</option>
                  </select>
                  <select value={scheduleForm.frequency} onChange={(event) => setScheduleForm((current) => ({ ...current, frequency: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <option value="daily">Daily catalog sync</option>
                    <option value="weekly">Weekly catalog sync</option>
                    <option value="manual">Manual</option>
                  </select>
                  <input value={scheduleForm.sourceReference} onChange={(event) => setScheduleForm((current) => ({ ...current, sourceReference: event.target.value }))} placeholder="Catalog file reference or API URL" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
                  <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Save Schedule</button>
                </div>
              </form>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="text-base font-semibold text-slate-900">Price Change Tracking</h4>
            <div className="mt-4 space-y-3 max-h-[320px] overflow-auto">
              {priceHistory.length === 0 ? <p className="text-sm text-slate-500">No price changes logged yet.</p> : priceHistory.slice(0, 12).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-900">{entry.productId}</span>
                    <span>{new Date(entry.changeDate).toLocaleString()}</span>
                  </div>
                  <p className="mt-1">{currencyFormatter.format(entry.oldPrice)} → {currencyFormatter.format(entry.newPrice)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h4 className="text-base font-semibold text-slate-900">My Products</h4>
            <p className="mt-1 text-sm text-slate-500">Suppliers can manage their own catalog, update prices, stock, product details, and images.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Suppliers: {supplierOptions.length}</span>
            {products.length > 0 && (
              <button type="button" onClick={handleClearAllData} disabled={loading} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                Clear All Data
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Category</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Price</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Stock</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Source</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">No supplier catalog products yet.</td>
                </tr>
              ) : products.slice(0, compact ? 8 : 50).map((product) => (
                <tr key={product.id}>
                  <td className="px-4 py-4 text-sm text-slate-900">
                    <div className="flex items-center gap-3">
                      {product.imageUrl ? <img src={product.imageUrl} alt={product.productName} className="h-10 w-10 rounded-md object-cover" /> : <div className="h-10 w-10 rounded-md bg-slate-100" />}
                      <div>
                        <p className="font-medium">{product.productName}</p>
                        <p className="text-xs text-slate-500">{product.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-700">{product.supplier}</td>
                  <td className="px-4 py-4 text-sm text-slate-700">{product.category}</td>
                  <td className="px-4 py-4 text-right text-sm text-slate-700">{currencyFormatter.format(product.price || 0)}</td>
                  <td className="px-4 py-4 text-right text-sm text-slate-700">{product.stock}</td>
                  <td className="px-4 py-4 text-sm text-slate-700">{product.source}</td>
                  <td className="px-4 py-4 text-right text-sm">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => handleEditProduct(product)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700">Edit</button>
                      <button type="button" onClick={() => handleDeleteProduct(product.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-red-700">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading ? <div className="mt-4 text-sm text-slate-500">Loading supplier catalog...</div> : null}
      </div>
    </div>
  );
}
