import { importFromExcel } from '../../utils/exportImportUtils';
import type { NormalizedCatalogProductInput } from './types';

const normalizeText = (value: unknown, fallback = '') => String(value ?? fallback).trim();
const normalizeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildSku = (productName: string, supplier: string, index: number) => {
  const base = `${supplier}-${productName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'catalog-product'}-${index + 1}`;
};

const extractField = (row: Record<string, unknown>, keys: string[]) => {
  const matchKey = Object.keys(row).find((key) => keys.includes(key.toLowerCase().trim()));
  return matchKey ? row[matchKey] : undefined;
};

export const normalizeCatalogRows = (
  rows: Array<Record<string, unknown>>,
  fallbackSupplier = 'Imported Supplier',
): NormalizedCatalogProductInput[] => {
  return rows
    .map((row, index) => {
      const productName = normalizeText(extractField(row, ['product name', 'name', 'product', 'title']), 'Unnamed Product');
      const supplier = normalizeText(extractField(row, ['supplier', 'vendor', 'provider']), fallbackSupplier);
      const category = normalizeText(extractField(row, ['category', 'type']), 'General');
      const description = normalizeText(extractField(row, ['description', 'details']), 'No description available.');
      const imageUrl = normalizeText(extractField(row, ['image', 'imageurl', 'image url', 'thumbnail']), '');
      const price = normalizeNumber(extractField(row, ['price', 'unit price', 'cost']), 0);
      const stock = normalizeNumber(extractField(row, ['stock', 'qty', 'quantity', 'inventory']), 0);
      const sku = normalizeText(extractField(row, ['sku', 'code', 'product id']), buildSku(productName, supplier, index));

      return {
        productName,
        price,
        stock,
        category,
        description,
        supplier,
        imageUrl,
        sku,
      };
    })
    .filter((item) => item.productName);
};

export const importCatalogFromExcel = async (file: File, fallbackSupplier?: string) => {
  const rows = await importFromExcel(file);
  return normalizeCatalogRows(rows as Array<Record<string, unknown>>, fallbackSupplier);
};

export const importCatalogFromCsv = async (file: File, fallbackSupplier?: string) => {
  const raw = await file.text();
  return parseCsvText(raw, fallbackSupplier);
};

export const importCatalogFromGoogleSheets = async (url: string, fallbackSupplier?: string) => {
  const csvUrl = buildGoogleSheetsCsvUrl(url);
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error('Unable to load Google Sheets data.');
  }
  const raw = await response.text();
  return parseCsvText(raw, fallbackSupplier, url);
};

export const importCatalogFromJson = async (file: File, fallbackSupplier?: string) => {
  const raw = await file.text();
  const payload = JSON.parse(raw);
  const products = Array.isArray(payload) ? payload : Array.isArray(payload?.products) ? payload.products : [];
  return normalizeCatalogRows(products as Array<Record<string, unknown>>, fallbackSupplier);
};

export const importCatalogFromPdf = async (file: File, fallbackSupplier?: string) => {
  const buffer = await file.arrayBuffer();
  const text = extractPrintableText(buffer);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const products = lines
    .map((line, index) => {
      const parts = line.split(/\s{2,}|\t|\|/).map((part) => part.trim()).filter(Boolean);
      if (parts.length < 2) return null;
      const priceMatch = line.match(/(\d+[\.,]?\d{0,2})/);
      const stockMatch = line.match(/(?:stock|qty|quantity)\s*:?\s*(\d+)/i);
      const productName = parts[0] || `PDF Product ${index + 1}`;
      return {
        productName,
        price: priceMatch ? normalizeNumber(priceMatch[1].replace(',', '.')) : 0,
        stock: stockMatch ? normalizeNumber(stockMatch[1]) : 0,
        category: 'PDF Import',
        description: line,
        supplier: fallbackSupplier || 'PDF Supplier',
        imageUrl: '',
        sku: buildSku(productName, fallbackSupplier || 'pdf-supplier', index),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return products;
};

export const createManualCatalogProduct = (input: Partial<NormalizedCatalogProductInput>) => {
  return normalizeCatalogRows([
    {
      'product name': input.productName,
      price: input.price,
      stock: input.stock,
      category: input.category,
      description: input.description,
      supplier: input.supplier,
      image: input.imageUrl,
      sku: input.sku,
    },
  ], input.supplier || 'Manual Supplier')[0];
};

const parseCsvText = (raw: string, fallbackSupplier?: string, sourceReference?: string) => {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce<Record<string, unknown>>((acc, header, index) => {
      acc[header] = values[index] ?? '';
      return acc;
    }, { sourceReference });
  });
  return normalizeCatalogRows(rows, fallbackSupplier);
};

const splitCsvLine = (line: string) => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
};

const buildGoogleSheetsCsvUrl = (url: string) => {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error('Invalid Google Sheets URL.');
  }
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
};

const extractPrintableText = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let result = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const value = bytes[i];
    if (value === 10 || value === 13 || (value >= 32 && value <= 126)) {
      result += String.fromCharCode(value);
    }
  }
  return result;
};
