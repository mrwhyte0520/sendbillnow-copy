
import { useState } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { exportToExcelStyled } from '../../../utils/exportImportUtils';

interface PayrollConcept {
  id: string;
  code: string;
  name: string;
  description: string;
  type: 'income' | 'deduction' | 'contribution';
  category: 'salary' | 'bonus' | 'overtime' | 'commission' | 'allowance' | 'tax' | 'social_security' | 'insurance' | 'loan' | 'other';
  calculation_type: 'fixed' | 'percentage' | 'formula';
  amount?: number;
  percentage?: number;
  formula?: string;
  is_taxable: boolean;
  affects_social_security: boolean;
  is_mandatory: boolean;
  is_active: boolean;
  created_at: string;
}

export default function PayrollConceptsPage() {
  const [concepts, setConcepts] = useState<PayrollConcept[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingConcept, setEditingConcept] = useState<PayrollConcept | null>(null);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    type: 'income' as PayrollConcept['type'],
    category: 'salary' as PayrollConcept['category'],
    calculation_type: 'fixed' as PayrollConcept['calculation_type'],
    amount: 0,
    percentage: 0,
    formula: '',
    is_taxable: true,
    affects_social_security: true,
    is_mandatory: false
  });

  const filteredConcepts = concepts.filter(concept => {
    const matchesSearch = concept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         concept.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         concept.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || concept.type === filterType;
    const matchesCategory = filterCategory === 'all' || concept.category === filterCategory;
    return matchesSearch && matchesType && matchesCategory;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingConcept) {
      setConcepts(prev => prev.map(concept => 
        concept.id === editingConcept.id 
          ? { ...concept, ...formData }
          : concept
      ));
    } else {
      const newConcept: PayrollConcept = {
        id: Date.now().toString(),
        ...formData,
        is_active: true,
        created_at: new Date().toISOString().split('T')[0]
      };
      setConcepts(prev => [...prev, newConcept]);
    }
    
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      type: 'income',
      category: 'salary',
      calculation_type: 'fixed',
      amount: 0,
      percentage: 0,
      formula: '',
      is_taxable: true,
      affects_social_security: true,
      is_mandatory: false
    });
    setEditingConcept(null);
    setShowForm(false);
  };

  const handleEdit = (concept: PayrollConcept) => {
    setFormData({
      code: concept.code,
      name: concept.name,
      description: concept.description,
      type: concept.type,
      category: concept.category,
      calculation_type: concept.calculation_type,
      amount: concept.amount || 0,
      percentage: concept.percentage || 0,
      formula: concept.formula || '',
      is_taxable: concept.is_taxable,
      affects_social_security: concept.affects_social_security,
      is_mandatory: concept.is_mandatory
    });
    setEditingConcept(concept);
    setShowForm(true);
  };

  const toggleStatus = (id: string) => {
    setConcepts(prev => prev.map(concept => 
      concept.id === id ? { ...concept, is_active: !concept.is_active } : concept
    ));
  };

  const exportToExcel = async () => {
    const today = new Date().toISOString().split('T')[0];

    const rows = filteredConcepts.map(concept => ({
      code: concept.code,
      name: concept.name,
      description: concept.description,
      type:
        concept.type === 'income' ? 'Ingreso'
        : concept.type === 'deduction' ? 'Deducción'
        : 'Aporte',
      category: concept.category,
      calculationType:
        concept.calculation_type === 'fixed' ? 'Fijo'
        : concept.calculation_type === 'percentage' ? 'Porcentaje'
        : 'Fórmula',
      value:
        concept.calculation_type === 'fixed'
          ? `${(concept.amount ?? 0).toLocaleString()}`
          : concept.calculation_type === 'percentage'
            ? `${concept.percentage ?? 0}%`
            : concept.formula || '',
      taxable: concept.is_taxable ? 'Sí' : 'No',
      affectsSS: concept.affects_social_security ? 'Sí' : 'No',
      mandatory: concept.is_mandatory ? 'Sí' : 'No',
      status: concept.is_active ? 'Activo' : 'Inactivo',
    }));

    if (!rows.length) {
      alert('No hay conceptos para exportar.');
      return;
    }

    await exportToExcelStyled(
      rows,
      [
        { key: 'code', title: 'Código', width: 14 },
        { key: 'name', title: 'Nombre', width: 26 },
        { key: 'description', title: 'Descripción', width: 40 },
        { key: 'type', title: 'Tipo', width: 14 },
        { key: 'category', title: 'Categoría', width: 18 },
        { key: 'calculationType', title: 'Tipo Cálculo', width: 18 },
        { key: 'value', title: 'Valor', width: 18 },
        { key: 'taxable', title: 'Gravable', width: 12 },
        { key: 'affectsSS', title: 'Afecta SS', width: 12 },
        { key: 'mandatory', title: 'Obligatorio', width: 12 },
        { key: 'status', title: 'Estado', width: 12 },
      ],
      `conceptos_nomina_${today}`,
      'Conceptos'
    );
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'income': return 'Ingreso';
      case 'deduction': return 'Deducción';
      case 'contribution': return 'Aporte';
      default: return type;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'income': return 'bg-green-100 text-green-800';
      case 'deduction': return 'bg-red-100 text-red-800';
      case 'contribution': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryLabel = (category: string) => {
    const labels = {
      salary: 'Salario',
      bonus: 'Bono',
      overtime: 'Horas Extra',
      commission: 'Comisión',
      allowance: 'Auxilio',
      tax: 'Impuesto',
      social_security: 'Seguridad Social',
      insurance: 'Seguro',
      loan: 'Préstamo',
      other: 'Otro'
    };
    return labels[category as keyof typeof labels] || category;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Conceptos de Nómina</h1>
            <p className="text-gray-600">Gestiona los conceptos de ingresos, deducciones y aportes</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={exportToExcel}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <i className="ri-download-line"></i>
              Exportar
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <i className="ri-add-line"></i>
              Nuevo Concepto
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Conceptos</p>
                <p className="text-2xl font-bold text-gray-900">{concepts.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <i className="ri-list-check-line text-xl text-blue-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ingresos</p>
                <p className="text-2xl font-bold text-gray-900">
                  {concepts.filter(c => c.type === 'income').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <i className="ri-arrow-up-circle-line text-xl text-green-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Deducciones</p>
                <p className="text-2xl font-bold text-gray-900">
                  {concepts.filter(c => c.type === 'deduction').length}
                </p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <i className="ri-arrow-down-circle-line text-xl text-red-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Obligatorios</p>
                <p className="text-2xl font-bold text-gray-900">
                  {concepts.filter(c => c.is_mandatory).length}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <i className="ri-shield-check-line text-xl text-orange-600"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Buscar
              </label>
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  placeholder="Buscar conceptos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo
              </label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos los tipos</option>
                <option value="income">Ingresos</option>
                <option value="deduction">Deducciones</option>
                <option value="contribution">Aportes</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Categoría
              </label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todas las categorías</option>
                <option value="salary">Salario</option>
                <option value="bonus">Bono</option>
                <option value="overtime">Horas Extra</option>
                <option value="allowance">Auxilio</option>
                <option value="tax">Impuesto</option>
                <option value="social_security">Seguridad Social</option>
                <option value="insurance">Seguro</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterType('all');
                  setFilterCategory('all');
                }}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Concepts Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Concepto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Categoría
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cálculo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Propiedades
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredConcepts.map((concept) => (
                  <tr key={concept.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{concept.name}</div>
                        <div className="text-sm text-gray-500">{concept.code}</div>
                        <div className="text-xs text-gray-400">{concept.description}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTypeColor(concept.type)}`}>
                        {getTypeLabel(concept.type)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {getCategoryLabel(concept.category)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {concept.calculation_type === 'fixed' && concept.amount && `${concept.amount.toLocaleString()}`}
                      {concept.calculation_type === 'percentage' && concept.percentage && `${concept.percentage}%`}
                      {concept.calculation_type === 'formula' && 'Fórmula'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {concept.is_mandatory && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                            Obligatorio
                          </span>
                        )}
                        {concept.is_taxable && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            Gravable
                          </span>
                        )}
                        {concept.affects_social_security && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                            Afecta SS
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        concept.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {concept.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(concept)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                        <button
                          onClick={() => toggleStatus(concept.id)}
                          className={`${concept.is_active ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}`}
                        >
                          <i className={`${concept.is_active ? 'ri-pause-circle-line' : 'ri-play-circle-line'}`}></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingConcept ? 'Editar Concepto' : 'Nuevo Concepto'}
                </h2>
                <button
                  onClick={resetForm}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Código *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.code}
                      onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: SAL001"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Nombre del concepto"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo *
                    </label>
                    <select
                      required
                      value={formData.type}
                      onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="income">Ingreso</option>
                      <option value="deduction">Deducción</option>
                      <option value="contribution">Aporte</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descripción
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Descripción del concepto..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Categoría *
                    </label>
                    <select
                      required
                      value={formData.category}
                      onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="salary">Salario</option>
                      <option value="bonus">Bono</option>
                      <option value="overtime">Horas Extra</option>
                      <option value="commission">Comisión</option>
                      <option value="allowance">Auxilio</option>
                      <option value="tax">Impuesto</option>
                      <option value="social_security">Seguridad Social</option>
                      <option value="insurance">Seguro</option>
                      <option value="loan">Préstamo</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo de Cálculo *
                    </label>
                    <select
                      required
                      value={formData.calculation_type}
                      onChange={(e) => setFormData(prev => ({ ...prev, calculation_type: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="fixed">Monto Fijo</option>
                      <option value="percentage">Porcentaje</option>
                      <option value="formula">Fórmula</option>
                    </select>
                  </div>
                </div>

                {/* Calculation Value */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {formData.calculation_type === 'fixed' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Monto Fijo ()
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  )}

                  {formData.calculation_type === 'percentage' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Porcentaje (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={formData.percentage}
                        onChange={(e) => setFormData(prev => ({ ...prev, percentage: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  )}

                  {formData.calculation_type === 'formula' && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Fórmula
                      </label>
                      <input
                        type="text"
                        value={formData.formula}
                        onChange={(e) => setFormData(prev => ({ ...prev, formula: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Ej: salario_base * 0.1"
                      />
                    </div>
                  )}
                </div>

                {/* Properties */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="is_taxable"
                        checked={formData.is_taxable}
                        onChange={(e) => setFormData(prev => ({ ...prev, is_taxable: e.target.checked }))}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="is_taxable" className="ml-2 block text-sm text-gray-900">
                        Es gravable (afecta ISR)
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="affects_social_security"
                        checked={formData.affects_social_security}
                        onChange={(e) => setFormData(prev => ({ ...prev, affects_social_security: e.target.checked }))}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="affects_social_security" className="ml-2 block text-sm text-gray-900">
                        Afecta Seguridad Social
                      </label>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="is_mandatory"
                        checked={formData.is_mandatory}
                        onChange={(e) => setFormData(prev => ({ ...prev, is_mandatory: e.target.checked }))}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="is_mandatory" className="ml-2 block text-sm text-gray-900">
                        Es obligatorio
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-6">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    {editingConcept ? 'Actualizar' : 'Crear'} Concepto
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
