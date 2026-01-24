import { useState, useEffect } from 'react';

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
}

export default function CustomerDisplayPage() {
  const [data, setData] = useState<CustomerDisplayData>({
    cart: [],
    subtotal: 0,
    discount: 0,
    tax: 0,
    total: 0,
    taxRate: 18,
  });
  const [lastAddedItem, setLastAddedItem] = useState<string | null>(null);

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

  const formatMoney = (value: number) => {
    const n = Number(value) || 0;
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getTotalItems = () => data.cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a2810] via-[#2f3e1e] to-[#1a2810] text-white flex flex-col">
      {/* Header */}
      <header className="bg-black/30 backdrop-blur-sm border-b border-white/10 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#6b8f3a] rounded-full flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold">Your Order</h1>
              <p className="text-sm text-white/60">Items update in real-time</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-white/60">Items</div>
            <div className="text-3xl font-bold text-[#a4c26a]">{getTotalItems()}</div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col max-w-4xl mx-auto w-full p-4">
        {data.cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center mb-6">
              <svg className="w-12 h-12 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-white/80 mb-2">Waiting for items...</h2>
            <p className="text-white/50">Products will appear here as they are added</p>
          </div>
        ) : (
          <>
            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
              {data.cart.map((item, index) => (
                <div
                  key={`${item.id}-${index}`}
                  className={`bg-white/10 backdrop-blur-sm rounded-xl p-4 border transition-all duration-300 ${
                    lastAddedItem === item.name
                      ? 'border-[#a4c26a] bg-[#a4c26a]/20 scale-[1.02]'
                      : 'border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{item.name}</h3>
                      {item.extras && item.extras.length > 0 && (
                        <div className="text-sm text-[#a4c26a] mt-1">
                          + {item.extras.map(e => `${e.name} (${e.quantity})`).join(', ')}
                        </div>
                      )}
                      <div className="text-sm text-white/60 mt-1">
                        {formatMoney(item.price)} each
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="bg-white/20 px-4 py-2 rounded-lg">
                        <span className="text-xl font-bold">{item.quantity}</span>
                      </div>
                      <div className="text-right min-w-[100px]">
                        <div className="text-xl font-bold text-[#a4c26a]">{formatMoney(item.total)}</div>
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
      <footer className="bg-black/40 backdrop-blur-sm border-t border-white/10 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-3 mb-4">
            <div className="flex justify-between text-lg text-white/70">
              <span>Subtotal</span>
              <span>{formatMoney(data.subtotal)}</span>
            </div>
            {data.discount > 0 && (
              <div className="flex justify-between text-lg text-[#e57373]">
                <span>Discount</span>
                <span>-{formatMoney(data.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg text-white/70">
              <span>Tax ({data.taxRate}%)</span>
              <span>{formatMoney(data.tax)}</span>
            </div>
          </div>
          <div className="border-t border-white/20 pt-4">
            <div className="flex justify-between items-center">
              <span className="text-2xl font-semibold">Total</span>
              <span className="text-4xl font-bold text-[#a4c26a]">{formatMoney(data.total)}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
