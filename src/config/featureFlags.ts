const globalAny = globalThis as { __sendbillFeatureCache?: Record<string, boolean> };

if (!globalAny.__sendbillFeatureCache) {
  globalAny.__sendbillFeatureCache = {};
}

const flagCache = globalAny.__sendbillFeatureCache;

const readBooleanEnv = (key: string, defaultValue: boolean) => {
  if (flagCache[key] !== undefined) return flagCache[key];

  const raw = import.meta.env?.[key];
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (['1', 'true', 'on', 'enabled', 'yes'].includes(normalized)) {
      flagCache[key] = true;
    } else if (['0', 'false', 'off', 'disabled', 'no'].includes(normalized)) {
      flagCache[key] = false;
    }
  }

  if (flagCache[key] === undefined) {
    flagCache[key] = defaultValue;
  }

  return flagCache[key];
};

export const featureFlags = {
  banksModuleEnabled: readBooleanEnv('VITE_FEATURE_BANKS_MODULE', true),
};

export const isBanksModuleEnabled = () => featureFlags.banksModuleEnabled;
