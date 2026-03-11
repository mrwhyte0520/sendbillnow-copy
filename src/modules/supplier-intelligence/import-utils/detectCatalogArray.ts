type CatalogRow = Record<string, unknown>;

const getNestedValue = (value: unknown, path: string): unknown => {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
};

const asRows = (value: unknown): CatalogRow[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CatalogRow => Boolean(item) && typeof item === 'object');
};

export function detectCatalogArray(payload: unknown): CatalogRow[] {
  const directRows = asRows(payload);
  if (directRows.length > 0) return directRows;

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const commonPaths = ['data.products', 'data.items', 'data.results', 'data.data', 'products', 'items', 'results', 'data'];

  for (const path of commonPaths) {
    const rows = asRows(getNestedValue(payload, path));
    if (rows.length > 0) {
      return rows;
    }
  }

  for (const value of Object.values(payload as Record<string, unknown>)) {
    const nestedRows = detectCatalogArray(value);
    if (nestedRows.length > 0) {
      return nestedRows;
    }
  }

  return [];
}
