import { useState } from 'react';
import type { SupplierProductRow } from './types';

type SupplierTableProps = {
  products: SupplierProductRow[];
  currentBusinessId: string;
  onDelete?: (row: SupplierProductRow) => Promise<void>;
  onEdit?: (row: SupplierProductRow, updates: SupplierProductRow) => Promise<void>;
};

const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='8' fill='%23e2e8f0'/%3E%3Cpath d='M12 25l5-5 4 4 7-8 4 9H12z' fill='%2394a3b8'/%3E%3Ccircle cx='15' cy='15' r='3' fill='%2394a3b8'/%3E%3C/svg%3E";

const asText = (value: unknown) => String(value ?? '').trim();

const resolveImageValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = resolveImageValue(item);
      if (resolved) return resolved;
    }
    return '';
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return resolveImageValue(
      record.url
      ?? record.src
      ?? record.link
      ?? record.image
      ?? record.image_url
      ?? record.imageUrl
      ?? record.thumbnail
      ?? record.photo
      ?? record.picture,
    );
  }

  return asText(value);
};

const parseNumericInput = (value: string) => {
  if (value.trim() === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const calculateSalePrice = (row: Pick<SupplierProductRow, 'price' | 'margin_percent'>) => {
  const purchasePrice = Number(row.price || 0);
  const marginPercent = Number(row.margin_percent || 0);
  return Number((purchasePrice * (1 + (marginPercent / 100))).toFixed(2));
};

const calculateAmount = (row: Pick<SupplierProductRow, 'qty' | 'price' | 'delivery' | 'tax'>) => {
  const subtotal = Number(row.qty || 0) * Number(row.price || 0);
  const delivery = Number(row.delivery || 0);
  const tax = Number(row.tax || 0);
  return subtotal + (Number.isFinite(delivery) ? delivery : 0) + (Number.isFinite(tax) ? tax : 0);
};

function resolveImageSource(row: SupplierProductRow) {
  const record = row as unknown as Record<string, unknown>;
  const directCandidates = [
    row.image,
    record.thumbnail,
    record.image_url,
    record.imageUrl,
    record.photo,
    record.picture,
  ];

  for (const candidate of directCandidates) {
    const resolved = resolveImageValue(candidate);
    if (resolved) {
      return resolved;
    }
  }

  const images = record.images;
  if (Array.isArray(images)) {
    const firstImage = resolveImageValue(images);
    if (firstImage) {
      return firstImage;
    }
  }

  return PLACEHOLDER_IMAGE;
}

function SupplierImageCell({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const safeSrc = src || PLACEHOLDER_IMAGE;
  const currentSrc = failed ? PLACEHOLDER_IMAGE : safeSrc;

  return <img src={currentSrc} alt={alt} className="h-10 w-10 rounded object-cover bg-slate-100" onError={() => setFailed(true)} />;
}

export default function SupplierTable({ products, currentBusinessId, onDelete, onEdit }: SupplierTableProps) {
  const safeRows = products.filter((item) => item.business_id === currentBusinessId);
  const [selectedRow, setSelectedRow] = useState<SupplierProductRow | null>(null);
  const [editingRow, setEditingRow] = useState<SupplierProductRow | null>(null);
  const [draftRow, setDraftRow] = useState<SupplierProductRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const beginEdit = (row: SupplierProductRow) => {
    const marginPercent = Number(row.margin_percent || 0);
    const salePrice = marginPercent > 0 ? Number(row.sale_price || 0) : calculateSalePrice(row);
    setEditingRow(row);
    setDraftRow({
      ...row,
      margin_percent: marginPercent,
      sale_price: salePrice,
      amount: Number(row.amount || calculateAmount(row)),
    });
  };

  const closeEdit = () => {
    setEditingRow(null);
    setDraftRow(null);
    setSavingEdit(false);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2">PROV</th>
              <th className="px-3 py-2">LOCATION</th>
              <th className="px-3 py-2">PRODUCT</th>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">CATEGORY</th>
              <th className="px-3 py-2">DESCRIPTION</th>
              <th className="px-3 py-2">QTY</th>
              <th className="px-3 py-2">PURCHASE PRICE</th>
              <th className="px-3 py-2">TAX</th>
              <th className="px-3 py-2">% PROFIT</th>
              <th className="px-3 py-2">SALE PRICE</th>
              <th className="px-3 py-2">AMOUNT</th>
              <th className="px-3 py-2">IMAGE</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {safeRows.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-3 py-6 text-center text-slate-500">No supplier products loaded for this business.</td>
              </tr>
            ) : (
              safeRows.map((row) => (
                <tr key={row.db_id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-800">{row.prov}</td>
                  <td className="px-3 py-2 text-slate-700">{row.location}</td>
                  <td className="px-3 py-2 text-slate-700">
                    <button
                      type="button"
                      onClick={() => setSelectedRow(row)}
                      className="text-left text-blue-700 hover:underline"
                    >
                      {row.product}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{row.id}</td>
                  <td className="px-3 py-2 text-slate-700">{row.category}</td>
                  <td className="px-3 py-2 text-slate-700 max-w-[240px] truncate" title={row.description}>{row.description}</td>
                  <td className="px-3 py-2 text-slate-700">{Number(row.qty || 0)}</td>
                  <td className="px-3 py-2 text-slate-700">${Number(row.price || 0).toFixed(2)}</td>
                  <td className="px-3 py-2 text-slate-700">${Number(row.tax || 0).toFixed(2)}</td>
                  <td className="px-3 py-2 text-slate-700">{Number(row.margin_percent || 0).toFixed(2)}%</td>
                  <td className="px-3 py-2 text-slate-700">${Number(row.sale_price || calculateSalePrice(row)).toFixed(2)}</td>
                  <td className="px-3 py-2 text-slate-700">${Number(row.amount || calculateAmount(row)).toFixed(2)}</td>
                  <td className="px-3 py-2"><SupplierImageCell src={resolveImageSource(row)} alt={row.product} /></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => beginEdit(row)}
                        className="rounded border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete?.(row)}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {selectedRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setSelectedRow(null)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{selectedRow.prov}</p>
                <h3 className="mt-1 text-2xl font-semibold text-slate-900">{selectedRow.product}</h3>
                <p className="mt-2 text-sm text-slate-600">{selectedRow.description || 'No description available.'}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="rounded border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-[220px,1fr]">
              <img
                src={resolveImageSource(selectedRow)}
                alt={selectedRow.product}
                className="h-[220px] w-[220px] rounded-xl bg-slate-100 object-cover"
                onError={(event) => {
                  event.currentTarget.src = PLACEHOLDER_IMAGE;
                }}
              />

              <div className="grid grid-cols-2 gap-3 text-sm text-slate-700">
                <div><span className="font-medium text-slate-900">Location:</span> {selectedRow.location || '-'}</div>
                <div><span className="font-medium text-slate-900">ID:</span> {selectedRow.id || '-'}</div>
                <div><span className="font-medium text-slate-900">Category:</span> {selectedRow.category || '-'}</div>
                <div><span className="font-medium text-slate-900">Qty:</span> {Number(selectedRow.qty || 0)}</div>
                <div><span className="font-medium text-slate-900">Purchase Price:</span> ${Number(selectedRow.price || 0).toFixed(2)}</div>
                <div><span className="font-medium text-slate-900">Tax:</span> ${Number(selectedRow.tax || 0).toFixed(2)}</div>
                <div><span className="font-medium text-slate-900">% Profit:</span> {Number(selectedRow.margin_percent || 0).toFixed(2)}%</div>
                <div><span className="font-medium text-slate-900">Sale Price:</span> ${Number(selectedRow.sale_price || calculateSalePrice(selectedRow)).toFixed(2)}</div>
                <div><span className="font-medium text-slate-900">Amount:</span> ${Number(selectedRow.amount || calculateAmount(selectedRow)).toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {editingRow && draftRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={closeEdit}>
          <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{draftRow.prov}</p>
                <h3 className="mt-1 text-2xl font-semibold text-slate-900">Edit supplier product</h3>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="rounded border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" value={draftRow.product} onChange={(event) => setDraftRow((prev) => prev ? ({ ...prev, product: event.target.value }) : prev)} placeholder="Product" />
              <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" value={draftRow.prov} onChange={(event) => setDraftRow((prev) => prev ? ({ ...prev, prov: event.target.value }) : prev)} placeholder="Supplier" />
              <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" value={draftRow.id} onChange={(event) => setDraftRow((prev) => prev ? ({ ...prev, id: event.target.value }) : prev)} placeholder="ID / SKU" />
              <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" value={draftRow.category} onChange={(event) => setDraftRow((prev) => prev ? ({ ...prev, category: event.target.value }) : prev)} placeholder="Category" />
              <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" value={draftRow.location} onChange={(event) => setDraftRow((prev) => prev ? ({ ...prev, location: event.target.value }) : prev)} placeholder="Location" />
              <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" type="number" min={0} step="1" value={draftRow.qty === 0 ? '' : draftRow.qty} onChange={(event) => setDraftRow((prev) => prev ? ({ ...prev, qty: parseNumericInput(event.target.value) }) : prev)} placeholder="Qty" />
              <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" type="number" min={0} step="0.01" value={draftRow.price === 0 ? '' : draftRow.price} onChange={(event) => setDraftRow((prev) => {
                if (!prev) return prev;
                const price = parseNumericInput(event.target.value);
                const next = {
                  ...prev,
                  price,
                };
                return {
                  ...next,
                  sale_price: calculateSalePrice(next),
                  amount: calculateAmount({ ...next, tax: prev.tax }),
                };
              })} placeholder="Purchase Price" />
              <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" type="number" min={0} step="0.01" value={draftRow.tax === 0 ? '' : draftRow.tax} onChange={(event) => setDraftRow((prev) => {
                if (!prev) return prev;
                const tax = parseNumericInput(event.target.value);
                const next = { ...prev, tax };
                return {
                  ...next,
                  amount: calculateAmount(next),
                };
              })} placeholder="Tax" />
              <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" type="number" min={0} step="0.01" value={draftRow.margin_percent === 0 ? '' : draftRow.margin_percent} onChange={(event) => setDraftRow((prev) => {
                if (!prev) return prev;
                const margin_percent = parseNumericInput(event.target.value);
                const next = {
                  ...prev,
                  margin_percent,
                };
                return {
                  ...next,
                  sale_price: calculateSalePrice(next),
                };
              })} placeholder="% Profit" />
              <input className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm" type="number" min={0} step="0.01" value={Number(draftRow.sale_price || calculateSalePrice(draftRow)).toFixed(2)} readOnly placeholder="Sale Price" />
              <input className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm" type="number" min={0} step="0.01" value={Number(draftRow.amount || calculateAmount(draftRow)).toFixed(2)} readOnly placeholder="Amount" />
              <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm md:col-span-2" value={draftRow.image} onChange={(event) => setDraftRow((prev) => prev ? ({ ...prev, image: event.target.value }) : prev)} placeholder="Image URL" />
              <textarea className="min-h-[110px] rounded-xl border border-slate-300 px-3 py-2 text-sm md:col-span-2" value={draftRow.description} onChange={(event) => setDraftRow((prev) => prev ? ({ ...prev, description: event.target.value }) : prev)} placeholder="Description" />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeEdit} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                disabled={savingEdit || !onEdit}
                onClick={async () => {
                  if (!onEdit) return;
                  setSavingEdit(true);
                  try {
                    const normalizedDraft = {
                      ...draftRow,
                      qty: Number(draftRow.qty || 0),
                      price: Number(draftRow.price || 0),
                      tax: Number(draftRow.tax || 0),
                      margin_percent: Number(draftRow.margin_percent || 0),
                    };
                    await onEdit(editingRow, {
                      ...normalizedDraft,
                      sale_price: calculateSalePrice(normalizedDraft),
                      amount: calculateAmount(normalizedDraft),
                    });
                    closeEdit();
                  } finally {
                    setSavingEdit(false);
                  }
                }}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
