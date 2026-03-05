
import { Suspense } from 'react';
import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { AccountingFormatProvider } from "./providers/AccountingFormatProvider";
import { Toaster } from "sonner";

function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <AccountingFormatProvider>
        <BrowserRouter basename={__BASE_PATH__}>
          <Suspense
            fallback={
              <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="text-gray-700">Loading...</div>
              </div>
            }
          >
            <AppRoutes />
          </Suspense>
          <Toaster position="top-right" richColors closeButton />
        </BrowserRouter>
      </AccountingFormatProvider>
    </I18nextProvider>
  );
}

export default App;
