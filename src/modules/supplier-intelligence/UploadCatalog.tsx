import { useState, type ChangeEvent } from 'react';
import { parseCatalogFile, parseProductsFromApi, validateImportProducts } from './ProductImporter';
import type { SupplierImportResult, SupplierImportSource, SupplierProductInput } from './types';

type UploadCatalogProps = {
  disabled?: boolean;
  onImport: (products: SupplierProductInput[], source: SupplierImportSource) => Promise<SupplierImportResult | void>;
};

const emptyManualProduct: SupplierProductInput = {
  product: '',
  prov: '',
  location: '',
  id: '',
  category: 'General',
  price: 0,
  qty: 0,
  margin_percent: 0,
  delivery: '',
  tax: 0,
  amount: 0,
  image: '',
  description: '',
  source: 'manual',
};

export default function UploadCatalog({ disabled, onImport }: UploadCatalogProps) {
  const [manualProduct, setManualProduct] = useState<SupplierProductInput>(emptyManualProduct);
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [apiSupplier, setApiSupplier] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<{
    excel: File | null;
    csv: File | null;
    json: File | null;
  }>({
    excel: null,
    csv: null,
    json: null,
  });
  const [working, setWorking] = useState(false);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');

  const parseNumericInput = (value: string) => {
    if (value.trim() === '') return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

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

      setManualProduct((current) => ({ ...current, image: imageDataUrl }));
      setError('');
    } catch (imageError: any) {
      setError(imageError?.message || 'Unable to load image.');
    } finally {
      event.target.value = '';
    }
  };

  const handleCatalogFile = async (file: File | null) => {
    if (!file) return;
    setWorking(true);
    setError('');
    setSummary('');

    try {
      const parsed = await parseCatalogFile(file);
      const valid = validateImportProducts(parsed);
      if (valid.length === 0) {
        throw new Error('Catalog format not recognized. Please use the correct template.');
      }
      const source = (valid[0]?.source || 'csv') as SupplierImportSource;
      const result = await onImport(valid, source);
      if (result) {
        setSummary(`Import completed successfully. Processed: ${result.processed}. Imported: ${result.imported}. Skipped: ${result.skipped}.`);
      }
    } catch (err: any) {
      setError(err?.message || 'Catalog format not recognized. Please use the correct template.');
    } finally {
      setWorking(false);
    }
  };

  const handleFileSelected = (type: 'excel' | 'csv' | 'json', file: File | null) => {
    setSelectedFiles((current) => ({ ...current, [type]: file }));
    setError('');
    setSummary('');
  };

  const handleCatalogImport = async (type: 'excel' | 'csv' | 'json') => {
    const file = selectedFiles[type];
    if (!file) return;
    await handleCatalogFile(file);
  };

  const handleManualSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setWorking(true);
    setError('');
    setSummary('');

    try {
      const valid = validateImportProducts([{ ...manualProduct, source: 'manual' }]);
      if (valid.length === 0) {
        throw new Error('Catalog format not recognized. Please use the correct template.');
      }
      const result = await onImport(valid, 'manual');
      if (result) {
        setSummary(`Import completed successfully. Processed: ${result.processed}. Imported: ${result.imported}. Skipped: ${result.skipped}.`);
      }
      setManualProduct(emptyManualProduct);
    } catch (err: any) {
      setError(err?.message || 'Catalog format not recognized. Please use the correct template.');
    } finally {
      setWorking(false);
    }
  };

  const handleApiImport = async () => {
    setWorking(true);
    setError('');
    setSummary('');

    try {
      const items = await parseProductsFromApi(apiEndpoint);
      if (!items.length) {
        throw new Error('Catalog format not recognized. Please use the correct template.');
      }
      const normalizedItems = items.map((item) => ({
        ...item,
        prov: String(item.prov || '').trim() || apiSupplier.trim() || 'Imported Supplier',
      }));
      const result = await onImport(normalizedItems, 'api');
      if (result) {
        setSummary(`Import completed successfully. Processed: ${result.processed}. Imported: ${result.imported}. Skipped: ${result.skipped}.`);
      }
      setApiEndpoint('');
      setApiSupplier('');
    } catch (err: any) {
      setError(err?.message || 'Catalog format not recognized. Please use the correct template.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Supplier Catalog Import</p>
          <h2 className="text-lg font-semibold text-slate-900">Upload catalogs and manage supplier products</h2>
          <p className="text-sm text-slate-500">Import Excel, CSV, JSON, sync external APIs, and add products manually with image support.</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {summary ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{summary}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
          <span className="block font-medium text-slate-900">Excel Import</span>
          <span className="mt-1 block text-xs">.xlsx / .xls</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="mt-3 block w-full text-xs"
            disabled={disabled || working}
            onChange={(event) => handleFileSelected('excel', event.target.files?.[0] || null)}
          />
          {selectedFiles.excel ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-slate-500">Selected file: {selectedFiles.excel.name}</p>
              <button type="button" onClick={() => handleCatalogImport('excel')} disabled={disabled || working} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
                Import Catalog
              </button>
            </div>
          ) : null}
        </label>

        <label className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
          <span className="block font-medium text-slate-900">CSV Import</span>
          <span className="mt-1 block text-xs">.csv</span>
          <input
            type="file"
            accept=".csv"
            className="mt-3 block w-full text-xs"
            disabled={disabled || working}
            onChange={(event) => handleFileSelected('csv', event.target.files?.[0] || null)}
          />
          {selectedFiles.csv ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-slate-500">Selected file: {selectedFiles.csv.name}</p>
              <button type="button" onClick={() => handleCatalogImport('csv')} disabled={disabled || working} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
                Import Catalog
              </button>
            </div>
          ) : null}
        </label>

        <label className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
          <span className="block font-medium text-slate-900">JSON Import</span>
          <span className="mt-1 block text-xs">Structured product JSON</span>
          <input
            type="file"
            accept=".json,application/json"
            className="mt-3 block w-full text-xs"
            disabled={disabled || working}
            onChange={(event) => handleFileSelected('json', event.target.files?.[0] || null)}
          />
          {selectedFiles.json ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-slate-500">Selected file: {selectedFiles.json.name}</p>
              <button type="button" onClick={() => handleCatalogImport('json')} disabled={disabled || working} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
                Import Catalog
              </button>
            </div>
          ) : null}
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">External API ingestion</h3>
        <div className="grid grid-cols-1 gap-3">
          <input
            type="text"
            value={apiSupplier}
            onChange={(event) => setApiSupplier(event.target.value)}
            placeholder="Supplier name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            disabled={disabled || working}
          />
          <input
            type="url"
            value={apiEndpoint}
            onChange={(event) => setApiEndpoint(event.target.value)}
            placeholder="https://api.example.com/catalog"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            disabled={disabled || working}
          />
          <div>
            <button
              type="button"
              onClick={handleApiImport}
              disabled={disabled || working || !apiEndpoint.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Import API
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleManualSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-800">Manual Quick Add</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Product Name" value={manualProduct.product} onChange={(event) => setManualProduct((prev) => ({ ...prev, product: event.target.value }))} disabled={disabled || working} />
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Supplier" value={manualProduct.prov} onChange={(event) => setManualProduct((prev) => ({ ...prev, prov: event.target.value }))} disabled={disabled || working} />
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Price" type="number" min={0} step="0.01" value={manualProduct.price === 0 ? '' : manualProduct.price} onChange={(event) => setManualProduct((prev) => ({ ...prev, price: parseNumericInput(event.target.value) }))} disabled={disabled || working} />
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Stock / Qty" type="number" min={0} step="1" value={manualProduct.qty === 0 ? '' : manualProduct.qty} onChange={(event) => setManualProduct((prev) => ({ ...prev, qty: parseNumericInput(event.target.value) }))} disabled={disabled || working} />
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Category" value={manualProduct.category} onChange={(event) => setManualProduct((prev) => ({ ...prev, category: event.target.value }))} disabled={disabled || working} />
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Image URL" value={manualProduct.image} onChange={(event) => setManualProduct((prev) => ({ ...prev, image: event.target.value }))} disabled={disabled || working} />
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Product ID / SKU" value={manualProduct.id} onChange={(event) => setManualProduct((prev) => ({ ...prev, id: event.target.value }))} disabled={disabled || working} />
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Location" value={manualProduct.location} onChange={(event) => setManualProduct((prev) => ({ ...prev, location: event.target.value }))} disabled={disabled || working} />
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Margin %" type="number" min={0} step="0.01" value={manualProduct.margin_percent === 0 ? '' : manualProduct.margin_percent} onChange={(event) => setManualProduct((prev) => ({ ...prev, margin_percent: parseNumericInput(event.target.value) }))} disabled={disabled || working} />
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Delivery" value={manualProduct.delivery} onChange={(event) => setManualProduct((prev) => ({ ...prev, delivery: event.target.value }))} disabled={disabled || working} />
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Tax" type="number" min={0} step="0.01" value={manualProduct.tax === 0 ? '' : manualProduct.tax} onChange={(event) => setManualProduct((prev) => ({ ...prev, tax: parseNumericInput(event.target.value) }))} disabled={disabled || working} />
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Product Image</p>
                <p className="text-xs text-slate-500">Upload an image file or keep using `Image URL`.</p>
              </div>
              <input type="file" accept="image/*" className="block w-full text-xs md:w-auto" disabled={disabled || working} onChange={handleManualImageSelected} />
            </div>
            {manualProduct.image ? (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <img src={manualProduct.image} alt={manualProduct.product || 'Product preview'} className="h-20 w-20 rounded-lg border border-slate-200 bg-white object-cover" />
                <button
                  type="button"
                  onClick={() => setManualProduct((current) => ({ ...current, image: '' }))}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                  disabled={disabled || working}
                >
                  Remove Image
                </button>
              </div>
            ) : null}
          </div>
          <textarea className="min-h-[96px] rounded-xl border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Description" value={manualProduct.description} onChange={(event) => setManualProduct((prev) => ({ ...prev, description: event.target.value }))} disabled={disabled || working} />
        </div>
        <button type="submit" disabled={disabled || working} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          Create Product
        </button>
      </form>
    </div>
  );
}
