import type { SupplierProductResult } from '../../supplier-adapters/SupplierAdapter';

const realisticSupplierNames = [
  'Ferretería Industrial DR',
  'Tools Express',
  'MetalWorks Supply',
  'Distribuidora Caribe',
  'MegaTools Dominicana',
];

const looksDummy = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return true;
  if (normalized.length <= 3) return true;
  if (/^(EE|ASS|DFFF)$/i.test(normalized)) return true;
  if (/^[A-Z]{2,5}$/.test(normalized)) return true;
  return false;
};

const supplierCodeMap: Record<string, string> = {
  ee: 'Ferretería Industrial DR',
  tx: 'Tools Express',
  mw: 'MetalWorks Supply',
};

export const getDisplaySupplierName = (result: SupplierProductResult, index = 0) => {
  const currentName = String(result.supplierRecord?.name || result.supplier || '').trim();
  const mappedName = supplierCodeMap[currentName.toLowerCase()];
  if (mappedName) {
    return mappedName;
  }
  if (!looksDummy(currentName)) {
    return currentName;
  }
  return realisticSupplierNames[index % realisticSupplierNames.length];
};

export const withRealisticSupplierNames = (results: SupplierProductResult[]) => {
  return results.map((result, index) => {
    const displayName = getDisplaySupplierName(result, index);
    return {
      ...result,
      supplier: displayName,
      supplierRecord: result.supplierRecord
        ? {
            ...result.supplierRecord,
            name: result.supplierRecord.name ? displayName : displayName,
          }
        : {
            id: null,
            name: displayName,
            exists: false,
            canCreate: true,
          },
    };
  });
};
