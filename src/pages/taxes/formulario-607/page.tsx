import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { formatMoney } from '../../../utils/numberFormat';

interface Formulario607 {
  id?: number;
  fecha_factura: string;
  tipo_comprobante: string;
  ncf: string;
  ncf_modificado?: string;
  tipo_ingreso: string;
  rnc_cedula_cliente: string;
  nombre_cliente: string;
  monto_facturado: number;
  itbis_facturado: number;
  tipo_pago: string;
  fecha_registro?: string;
}

const Formulario607Page = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [registros, setRegistros] = useState<Formulario607[]>([]);
  const [filteredRegistros, setFilteredRegistros] = useState<Formulario607[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Formulario607 | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState<Formulario607>({
    fecha_factura: '',
    tipo_comprobante: 'B01',
    ncf: '',
    ncf_modificado: '',
    tipo_ingreso: 'Venta de bienes',
    rnc_cedula_cliente: '',
    nombre_cliente: '',
    monto_facturado: 0,
    itbis_facturado: 0,
    tipo_pago: 'Efectivo'
  });

  const tiposComprobante = [
    { value: 'B01', label: 'B01 - Crédito Fiscal' },
    { value: 'B02', label: 'B02 - Consumidor Final' },
    { value: 'B14', label: 'B14 - Régimen Especial' },
    { value: 'B15', label: 'B15 - Gubernamental' },
    { value: 'B16', label: 'B16 - Exportaciones' }
  ];

  const tiposIngreso = [
    'Venta de bienes',
    'Prestación de servicios',
    'Arrendamiento',
    'Venta de activos',
    'Otros ingresos'
  ];

  const tiposPago = [
    'Efectivo',
    'Transferencia',
    'Tarjeta de crédito',
    'Tarjeta de débito',
    'Cheque',
    'Crédito'
  ];

  useEffect(() => {
    loadRegistros();
  }, []);

  useEffect(() => {
    filterRegistros();
  }, [registros, searchTerm, filterMonth, filterYear]);

  const loadRegistros = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('formulario_607')
        .select('*')
        .order('fecha_factura', { ascending: false });

      if (error) throw error;
      setRegistros(data || []);
    } catch (error) {
      console.error('Error loading registros:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterRegistros = () => {
    let filtered = [...registros];

    if (searchTerm) {
      filtered = filtered.filter(registro =>
        registro.ncf.toLowerCase().includes(searchTerm.toLowerCase()) ||
        registro.nombre_cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
        registro.rnc_cedula_cliente.includes(searchTerm)
      );
    }

    if (filterMonth) {
      filtered = filtered.filter(registro => {
        const fecha = new Date(registro.fecha_factura);
        return fecha.getMonth() + 1 === parseInt(filterMonth);
      });
    }

    if (filterYear) {
      filtered = filtered.filter(registro => {
        const fecha = new Date(registro.fecha_factura);
        return fecha.getFullYear() === parseInt(filterYear);
      });
    }

    setFilteredRegistros(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingRecord) {
        const { error } = await supabase
          .from('formulario_607')
          .update(formData)
          .eq('id', editingRecord.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('formulario_607')
          .insert([formData]);
        if (error) throw error;
      }

      await loadRegistros();
      resetForm();
      setShowModal(false);
    } catch (error) {
      console.error('Error saving registro:', error);
      alert('Error al guardar el registro');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (registro: Formulario607) => {
    setEditingRecord(registro);
    setFormData({
      fecha_factura: registro.fecha_factura,
      tipo_comprobante: registro.tipo_comprobante,
      ncf: registro.ncf,
      ncf_modificado: registro.ncf_modificado || '',
      tipo_ingreso: registro.tipo_ingreso,
      rnc_cedula_cliente: registro.rnc_cedula_cliente,
      nombre_cliente: registro.nombre_cliente,
      monto_facturado: registro.monto_facturado,
      itbis_facturado: registro.itbis_facturado,
      tipo_pago: registro.tipo_pago
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Está seguro de eliminar este registro?')) return;

    try {
      const { error } = await supabase
        .from('formulario_607')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadRegistros();
    } catch (error) {
      console.error('Error deleting registro:', error);
      alert('Error al eliminar el registro');
    }
  };

  const resetForm = () => {
    setFormData({
      fecha_factura: '',
      tipo_comprobante: 'B01',
      ncf: '',
      ncf_modificado: '',
      tipo_ingreso: 'Venta de bienes',
      rnc_cedula_cliente: '',
      nombre_cliente: '',
      monto_facturado: 0,
      itbis_facturado: 0,
      tipo_pago: 'Efectivo'
    });
    setEditingRecord(null);
  };

  const exportToCSV = () => {
    const headers = [
      'Fecha Factura',
      'Tipo Comprobante',
      'NCF',
      'NCF Modificado',
      'Tipo Ingreso',
      'RNC/Cédula Cliente',
      'Nombre Cliente',
      'Monto Facturado',
      'ITBIS Facturado',
      'Tipo Pago'
    ];

    const csvContent = [
      headers.join(','),
      ...filteredRegistros.map(registro => [
        registro.fecha_factura,
        registro.tipo_comprobante,
        registro.ncf,
        registro.ncf_modificado || '',
        registro.tipo_ingreso,
        registro.rnc_cedula_cliente,
        `"${registro.nombre_cliente}"`,
        formatMoney(registro.monto_facturado, ''),
        formatMoney(registro.itbis_facturado, ''),
        registro.tipo_pago
      ].join(','))
    ].join('\n');

    const csvForExcel = '\uFEFF' + csvContent.replace(/\n/g, '\r\n');
    const blob = new Blob([csvForExcel], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `formulario_607_${filterYear}_${filterMonth || 'completo'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToTXT = () => {
    const txtContent = filteredRegistros.map(registro => 
      `${registro.fecha_factura}|${registro.tipo_comprobante}|${registro.ncf}|${registro.ncf_modificado || ''}|${registro.tipo_ingreso}|${registro.rnc_cedula_cliente}|${registro.nombre_cliente}|${formatMoney(registro.monto_facturado, '')}|${formatMoney(registro.itbis_facturado, '')}|${registro.tipo_pago}`
    ).join('\n');

    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `formulario_607_${filterYear}_${filterMonth || 'completo'}.txt`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const calculateTotals = () => {
    const totalMonto = filteredRegistros.reduce((sum, registro) => sum + registro.monto_facturado, 0);
    const totalItbis = filteredRegistros.reduce((sum, registro) => sum + registro.itbis_facturado, 0);
    return { totalMonto, totalItbis };
  };

  const { totalMonto, totalItbis } = calculateTotals();

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard Formulario 607</h2>
        <button
          onClick={() => setActiveTab('home')}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          <i className="ri-home-line mr-2"></i>
          Volver al Inicio
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-blue-100 text-blue-600">
              <i className="ri-file-list-3-line text-2xl"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Registros</p>
              <p className="text-2xl font-bold text-gray-900">{registros.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-100 text-green-600">
              <i className="ri-money-dollar-circle-line text-2xl"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Monto Total</p>
              <p className="text-2xl font-bold text-gray-900">{formatMoney(totalMonto, '')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-yellow-100 text-yellow-600">
              <i className="ri-percent-line text-2xl"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">ITBIS Total</p>
              <p className="text-2xl font-bold text-gray-900">{formatMoney(totalItbis, '')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-purple-100 text-purple-600">
              <i className="ri-calendar-line text-2xl"></i>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Este Mes</p>
              <p className="text-2xl font-bold text-gray-900">
                {registros.filter(r => {
                  const fecha = new Date(r.fecha_factura);
                  const now = new Date();
                  return fecha.getMonth() === now.getMonth() && fecha.getFullYear() === now.getFullYear();
                }).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tipos de Comprobante</h3>
          <div className="space-y-3">
            {tiposComprobante.map(tipo => {
              const count = registros.filter(r => r.tipo_comprobante === tipo.value).length;
              return (
                <div key={tipo.value} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{tipo.label}</span>
                  <span className="font-semibold text-gray-900">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Métodos de Pago</h3>
          <div className="space-y-3">
            {tiposPago.map(tipo => {
              const count = registros.filter(r => r.tipo_pago === tipo).length;
              const monto = registros.filter(r => r.tipo_pago === tipo).reduce((sum, r) => sum + r.monto_facturado, 0);
              return (
                <div key={tipo} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{tipo}</span>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">{count} ventas</div>
                    <div className="text-sm text-gray-500">{formatMoney(monto, '')}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  const renderRegistros = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Gestión de Registros</h2>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          Nuevo Registro
        </button>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Buscar <span className="text-red-500">*</span></label>
            <input
              type="text"
              placeholder="NCF, cliente, RNC..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Mes</label>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos los meses</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(0, i).toLocaleString('es', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Año</label>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Array.from({ length: 5 }, (_, i) => {
                const year = new Date().getFullYear() - i;
                return (
                  <option key={year} value={year}>
                    {year}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="flex items-end space-x-2">
            <button
              onClick={exportToCSV}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-file-excel-2-line mr-2"></i>
              CSV
            </button>
            <button
              onClick={exportToTXT}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
            >
              <i className="ri-file-text-line mr-2"></i>
              TXT
            </button>
          </div>
        </div>

        <div className="text-sm text-gray-600 mb-4">
          Mostrando {filteredRegistros.length} de {registros.length} registros
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tipo/NCF
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ITBIS
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pago
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRegistros.map((registro) => (
                <tr key={registro.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(registro.fecha_factura).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{registro.tipo_comprobante}</div>
                    <div className="text-sm text-gray-500">{registro.ncf}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{registro.nombre_cliente}</div>
                    <div className="text-sm text-gray-500">{registro.rnc_cedula_cliente}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatMoney(registro.monto_facturado, '')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatMoney(registro.itbis_facturado, '')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {registro.tipo_pago}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleEdit(registro)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      <i className="ri-edit-line"></i>
                    </button>
                    <button
                      onClick={() => handleDelete(registro.id!)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Formulario 607 - DGII</h1>
          <p className="text-gray-600 mt-2">Registro de ventas con comprobantes fiscales</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'dashboard'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="ri-dashboard-line mr-2"></i>
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('registros')}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'registros'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="ri-file-list-3-line mr-2"></i>
                Registros
              </button>
            </nav>
          </div>
        </div>

        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'registros' && renderRegistros()}

        {showModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">
                  {editingRecord ? 'Editar Registro' : 'Nuevo Registro'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha Factura *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.fecha_factura}
                      onChange={(e) => setFormData({ ...formData, fecha_factura: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo Comprobante *
                    </label>
                    <select
                      required
                      value={formData.tipo_comprobante}
                      onChange={(e) => setFormData({ ...formData, tipo_comprobante: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {tiposComprobante.map(tipo => (
                        <option key={tipo.value} value={tipo.value}>
                          {tipo.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      NCF *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="B0100000001"
                      value={formData.ncf}
                      onChange={(e) => setFormData({ ...formData, ncf: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      NCF Modificado
                    </label>
                    <input
                      type="text"
                      placeholder="Opcional"
                      value={formData.ncf_modificado}
                      onChange={(e) => setFormData({ ...formData, ncf_modificado: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo Ingreso *
                    </label>
                    <select
                      required
                      value={formData.tipo_ingreso}
                      onChange={(e) => setFormData({ ...formData, tipo_ingreso: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {tiposIngreso.map(tipo => (
                        <option key={tipo} value={tipo}>
                          {tipo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      RNC/Cédula Cliente *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="123456789"
                      value={formData.rnc_cedula_cliente}
                      onChange={(e) => setFormData({ ...formData, rnc_cedula_cliente: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre Cliente *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Nombre completo del cliente"
                      value={formData.nombre_cliente}
                      onChange={(e) => setFormData({ ...formData, nombre_cliente: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Monto Facturado *
                    </label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={formData.monto_facturado}
                      onChange={(e) => setFormData({ ...formData, monto_facturado: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ITBIS Facturado *
                    </label>
                    <input
                      type="number" min="0"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={formData.itbis_facturado}
                      onChange={(e) => setFormData({ ...formData, itbis_facturado: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo Pago *
                    </label>
                    <select
                      required
                      value={formData.tipo_pago}
                      onChange={(e) => setFormData({ ...formData, tipo_pago: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {tiposPago.map(tipo => (
                        <option key={tipo} value={tipo}>
                          {tipo}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end space-x-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    {loading ? 'Guardando...' : editingRecord ? 'Actualizar' : 'Guardar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Formulario607Page;