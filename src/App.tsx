
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
          <AppRoutes />
          <Toaster position="top-right" richColors closeButton />
        </BrowserRouter>
      </AccountingFormatProvider>
    </I18nextProvider>
  );
}

export default App;
