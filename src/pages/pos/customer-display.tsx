import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../../hooks/useAuth';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
  extras?: { name: string; price: number; quantity: number }[];
}

interface CustomerDisplayData {
  cart: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  taxRate: number;
  customerName?: string;
  lastAction?: 'add' | 'remove' | 'update' | 'clear';
  lastItemName?: string;
  cashierName?: string;
  registerLabel?: string;
  updatedAt?: string;
}

export default function CustomerDisplayPage() {
  const { user } = useAuth();
  const [data, setData] = useState<CustomerDisplayData>({
    cart: [],
    subtotal: 0,
    discount: 0,
    tax: 0,
    total: 0,
    taxRate: 18,
  });
  const [lastAddedItem, setLastAddedItem] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string>('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  const supabaseUrl = useMemo(() => import.meta.env.VITE_PUBLIC_SUPABASE_URL as string | undefined, []);
  const supabaseAnonKey = useMemo(
    () => import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string | undefined,
    [],
  );

  useEffect(() => {
    // Load initial state (important when the customer display opens after items already exist in the cart)
    try {
      const saved = localStorage.getItem('pos_customer_display_state');
      if (saved) {
        setData(JSON.parse(saved));
      }
    } catch {}

    // Listen for updates from POS via BroadcastChannel
    const channel = new BroadcastChannel('pos_customer_display');
    
    channel.onmessage = (event) => {
      const newData = event.data as CustomerDisplayData;
      setData(newData);
      
      // Highlight last added item
      if (newData.lastAction === 'add' && newData.lastItemName) {
        setLastAddedItem(newData.lastItemName);
        setTimeout(() => setLastAddedItem(null), 1500);
      }
    };

    // Also listen for localStorage updates (backup channel)
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'pos_customer_display_state' || !e.newValue) return;
      try {
        const newData = JSON.parse(e.newValue) as CustomerDisplayData;
        setData(newData);
      } catch {}
    };
    window.addEventListener('storage', onStorage);

    return () => {
      channel.close();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const formatMoney = (value: number) => {
    const n = Number(value) || 0;
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getTotalItems = () => data.cart.reduce((sum, item) => sum + item.quantity, 0);

  const formatUpdatedAt = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  };

  const formatNow = () => {
    const d = now;
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        setShowUnlock(true);
        setUnlockPassword('');
        setUnlockError('');
        return;
      }
      await document.documentElement.requestFullscreen();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[CustomerDisplay] Failed to toggle fullscreen', error);
    }
  };

  const handleUnlock = async () => {
    if (!user?.email) {
      setUnlockError('No user session found. Please login again.');
      return;
    }
    if (!unlockPassword.trim()) {
      setUnlockError('Password is required.');
      return;
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      setUnlockError('Supabase is not configured.');
      return;
    }

    setIsUnlocking(true);
    setUnlockError('');
    try {
      const tempSupabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      const { error } = await tempSupabase.auth.signInWithPassword({
        email: user.email,
        password: unlockPassword,
      });

      if (error) {
        setUnlockError('Invalid password.');
        return;
      }

      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
      } catch {
        setUnlockError('Could not exit fullscreen.');
        return;
      }

      setShowUnlock(false);
      setUnlockPassword('');
      setUnlockError('');
    } catch {
      setUnlockError('Could not verify password.');
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-white text-gray-900 flex flex-col"
      onDoubleClick={toggleFullscreen}
      role="presentation"
    >
      {/* Header */}
      <header className="bg-[#001B9E] border-b border-white/15 p-4 text-white">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/15 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold">Your Order</h1>
              <p className="text-sm text-white/80">Items update in real-time</p>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-3 text-xs text-white/80 whitespace-nowrap">
              <span>{data.registerLabel || 'Register #1'}</span>
              {data.cashierName && (
                <span>{`Cashier: ${data.cashierName}`}</span>
              )}
              {data.updatedAt && (
                <span>{`Updated: ${formatUpdatedAt(data.updatedAt)}`}</span>
              )}
              <span>{`Time: ${formatNow()}`}</span>
            </div>
            <div className="text-sm text-white/80">Items</div>
            <div className="text-3xl font-bold text-white">{getTotalItems()}</div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col max-w-4xl mx-auto w-full p-4 bg-white">
        {data.cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Waiting for items...</h2>
            <p className="text-gray-600">Products will appear here as they are added</p>
          </div>
        ) : (
          <>
            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
              {data.cart.map((item, index) => (
                <div
                  key={`${item.id}-${index}`}
                  className={`bg-white rounded-xl p-4 border transition-all duration-300 ${
                    lastAddedItem === item.name
                      ? 'border-[#001B9E] bg-[#001B9E]/5 scale-[1.02]'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{item.name}</h3>
                      {item.extras && item.extras.length > 0 && (
                        <div className="text-sm text-[#001B9E] mt-1">
                          + {item.extras.map(e => `${e.name} (${e.quantity})`).join(', ')}
                        </div>
                      )}
                      <div className="text-sm text-gray-600 mt-1">
                        {formatMoney(item.price)} each
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="bg-gray-100 px-4 py-2 rounded-lg">
                        <span className="text-xl font-bold">{item.quantity}</span>
                      </div>
                      <div className="text-right min-w-[100px]">
                        <div className="text-xl font-bold text-[#001B9E]">{formatMoney(item.total)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Footer - Totals */}
      <footer className="bg-[#001B9E] border-t border-white/15 p-6 text-white">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-3 mb-4">
            <div className="flex justify-between text-lg text-white/85">
              <span>Subtotal</span>
              <span>{formatMoney(data.subtotal)}</span>
            </div>
            {data.discount > 0 && (
              <div className="flex justify-between text-lg text-[#e57373]">
                <span>Discount</span>
                <span>-{formatMoney(data.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg text-white/85">
              <span>Tax ({data.taxRate}%)</span>
              <span>{formatMoney(data.tax)}</span>
            </div>
          </div>
          <div className="border-t border-white/25 pt-4">
            <div className="flex justify-between items-center">
              <span className="text-2xl font-semibold">Total</span>
              <span className="text-4xl font-bold text-white">{formatMoney(data.total)}</span>
            </div>
          </div>
        </div>
      </footer>

      {showUnlock && (
        <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-200">
              <div className="text-lg font-semibold text-gray-900">Unlock</div>
              <div className="text-sm text-gray-600">
                Enter your password to exit fullscreen.
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="space-y-1">
                <div className="text-xs text-gray-500">User</div>
                <div className="text-sm font-medium text-gray-900 truncate">{user?.email || '—'}</div>
              </div>
              <input
                type="password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUnlock();
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#001B9E]"
                placeholder="Password"
                autoFocus
              />
              {unlockError ? <div className="text-sm text-red-600">{unlockError}</div> : null}
              <button
                type="button"
                onClick={handleUnlock}
                disabled={isUnlocking}
                className="w-full px-4 py-3 bg-[#001B9E] text-white rounded-xl hover:bg-[#001587] transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isUnlocking ? 'Unlocking...' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
