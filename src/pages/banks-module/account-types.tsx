import DashboardLayout from '../../components/layout/DashboardLayout';

export default function BankAccountTypesPage() {
  return (
    <DashboardLayout>
      <div className="p-6 bg-gradient-to-br from-[#f6f1e3] to-[#ebe5d5] min-h-screen">
        <h1 className="text-2xl font-bold mb-4 text-[#2f3e1e] drop-shadow-sm">Tipos de Cuenta</h1>
        <p className="text-gray-600 text-sm">Pantalla para administrar los tipos de cuenta bancaria.</p>
      </div>
    </DashboardLayout>
  );
}
