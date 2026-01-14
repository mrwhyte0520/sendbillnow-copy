import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { taxService } from '../../services/database';
import { useAuth } from '../../hooks/useAuth';
import { formatMoney } from '../../utils/numberFormat';

export default function TaxesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [taxStats, setTaxStats] = useState({
    itbis_cobrado: 0,
    itbis_pagado: 0,
    itbis_neto: 0,
    retenciones: 0
  });
  const [ncfSeries, setNcfSeries] = useState<any[]>([]);
  const [fiscalDeadlines, setFiscalDeadlines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      loadDashboardData();
    } else {
      setLoading(false);
    }
  }, [user?.id]);

  const loadDashboardData = async () => {
    if (!user?.id) return;
    
    try {
      const [stats, series, deadlines] = await Promise.all([
        taxService.getTaxStatistics(user.id),
        taxService.getNcfSeries(user.id),
        taxService.getFiscalDeadlines(user.id)
      ]);
      setTaxStats(stats);
      setNcfSeries(series);
      setFiscalDeadlines(deadlines);
      
      console.log('Fiscal deadlines loaded:', deadlines);
      console.log('Deadlines count:', deadlines?.length || 0);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const modules = [
    {
      title: 'Tax Configuration',
      description: 'Configure tax rates and fiscal parameters',
      icon: 'ri-settings-line',
      href: '/taxes/configuration',
      color: 'blue'
    },
    {
      title: 'NCF/E-CF Management',
      description: 'Fiscal sequence maintenance',
      icon: 'ri-file-shield-line',
      href: '/taxes/ncf',
      color: 'green'
    },
    {
      title: 'Fiscal Series',
      description: 'Manage fiscal document series',
      icon: 'ri-list-ordered-line',
      href: '/taxes/fiscal-series',
      color: 'purple'
    },
    {
      title: 'Report 606',
      description: 'Purchases and services report',
      icon: 'ri-file-chart-line',
      href: '/taxes/report-606',
      color: 'orange'
    },
    {
      title: 'Report 607',
      description: 'Sales and services report',
      icon: 'ri-file-chart-2-line',
      href: '/taxes/report-607',
      color: 'red'
    },
    {
      title: 'Report 608',
      description: 'Cancelled documents report',
      icon: 'ri-file-damage-line',
      href: '/taxes/report-608',
      color: 'indigo'
    },
    {
      title: 'Report 623',
      description: 'Foreign payments report',
      icon: 'ri-global-line',
      href: '/taxes/report-623',
      color: 'pink'
    },
    {
      title: 'Report IT-1',
      description: 'Monthly ITBIS declaration',
      icon: 'ri-calendar-check-line',
      href: '/taxes/report-it1',
      color: 'teal'
    },
    {
      title: 'Report IR-17',
      description: 'ISR withholding report',
      icon: 'ri-percent-line',
      href: '/taxes/report-ir17',
      color: 'cyan'
    },
    {
      title: 'Form 607',
      description: 'Sales register with NCF fiscal receipts per DGII',
      icon: 'ri-file-list-3-line',
      href: '/taxes/formulario-607',
      color: 'purple'
    },
    {
      title: 'ITBIS Proportionality',
      description: 'Monthly calculation of deductible ITBIS proportionality',
      icon: 'ri-calculator-line',
      href: '/taxes/itbis-proportionality',
      color: 'emerald'
    }
  ];

  const taxStatsDisplay = [
    {
      title: 'ITBIS Collected',
      value: formatMoney(taxStats.itbis_cobrado, ''),
      change: '+12%',
      icon: 'ri-money-dollar-circle-line',
      color: 'green'
    },
    {
      title: 'ITBIS Paid',
      value: formatMoney(taxStats.itbis_pagado, ''),
      change: '+8%',
      icon: 'ri-bank-card-line',
      color: 'blue'
    },
    {
      title: 'Net ITBIS Due',
      value: formatMoney(taxStats.itbis_neto, ''),
      change: '+15%',
      icon: 'ri-calculator-line',
      color: 'orange'
    },
    {
      title: 'Withholdings',
      value: formatMoney(taxStats.retenciones, ''),
      change: '+5%',
      icon: 'ri-percent-line',
      color: 'purple'
    }
  ];

  const documentTypes = [
    { value: 'B01', label: 'B01 - Tax Credit' },
    { value: 'B02', label: 'B02 - Final Consumer' },
    { value: 'B14', label: 'B14 - Special Regime' },
    { value: 'B15', label: 'B15 - Government' },
    { value: 'B16', label: 'B16 - Exports' }
  ];

  const fiscalDocuments = ncfSeries.map(series => ({
    type: documentTypes.find(t => t.value === series.document_type)?.label || series.document_type,
    series: series.series_prefix,
    current: series.current_number.toString().padStart(8, '0'),
    remaining: series.end_number - series.current_number + 1,
    status: series.status === 'active' ? 'Active' : 'Inactive'
  }));

  // Calculate upcoming deadlines from database or use defaults
  const upcomingDeadlines = fiscalDeadlines.length > 0 
    ? fiscalDeadlines.map((deadline: any) => {
        const dueDate = new Date(deadline.due_date);
        const today = new Date();
        const diffTime = dueDate.getTime() - today.getTime();
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let priority = 'Medium';
        if (daysLeft <= 0) priority = 'Urgent';
        else if (daysLeft <= 7) priority = 'High';
        
        return {
          report: deadline.report_name || deadline.description,
          dueDate: dueDate.toLocaleDateString('es-DO'),
          daysLeft: Math.max(0, daysLeft),
          priority
        };
      })
    : [
        {
          report: 'IT-1 Febrero 2024',
          dueDate: '20/03/2024',
          daysLeft: 5,
          priority: 'High'
        },
        {
          report: 'Reporte 607 Febrero',
          dueDate: '29/03/2024',
          daysLeft: 14,
          priority: 'Medium'
        },
        {
          report: 'IR-17 Retenciones',
          dueDate: '15/03/2024',
          daysLeft: 0,
          priority: 'Urgent'
        }
      ];

  const handleAccessModule = (moduleHref: string) => {
    navigate(moduleHref);
  };

  const handleGenerateReport = (reportName: string) => {
    if (reportName.includes('IT-1')) {
      navigate('/taxes/report-it1');
    } else if (reportName.includes('607')) {
      navigate('/taxes/report-607');
    } else if (reportName.includes('IR-17')) {
      navigate('/taxes/report-ir17');
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 bg-gradient-to-br from-[#f6f1e3] to-[#ebe5d5] min-h-screen space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-[#6b5c3b]">Compliance</p>
            <h1 className="text-3xl font-bold text-[#2f3e1e] drop-shadow-sm">Tax Management Module</h1>
            <p className="text-[#6b5c3b] mt-1">Complete tax compliance system for Dominican Republic</p>
          </div>
          <div className="flex items-center gap-2 text-[#6b5c3b] bg-white border border-[#e4d8c4] px-4 py-2 rounded-full shadow-sm">
            <i className="ri-government-line text-xl"></i>
            <span className="text-sm font-medium">DGII Compliant</span>
          </div>
        </div>

        {/* Tax Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {taxStatsDisplay.map((stat, index) => (
            <div key={index} className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] p-6 hover:shadow-[0_12px_40px_rgb(0,128,0,0.12)] hover:-translate-y-1 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#6b5c3b]">{stat.title}</p>
                  <p className="text-2xl font-bold text-[#2f3e1e] mt-1">{stat.value}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-[#f3ecda] flex items-center justify-center">
                  <i className={`${stat.icon} text-xl text-[#2f3e1e]`}></i>
                </div>
              </div>
              <div className="mt-4">
                <span className="text-sm font-medium text-[#4f5f33]">{stat.change}</span>
                <span className="text-sm text-[#6b5c3b] ml-1">vs previous month</span>
              </div>
            </div>
          ))}
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((module, index) => (
            <div key={index} className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0] p-6 hover:shadow-[0_12px_40px_rgb(0,128,0,0.12)] hover:-translate-y-1 transition-all duration-300 cursor-pointer">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 rounded-xl bg-[#f3ecda] flex items-center justify-center mr-4">
                  <i className={`${module.icon} text-xl text-[#2f3e1e]`}></i>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-[#2f3e1e] mb-2">{module.title}</h3>
              <p className="text-[#6b5c3b] mb-4 text-sm">{module.description}</p>
              <button 
                onClick={() => handleAccessModule(module.href)}
                className="w-full bg-[#2f3e1e] text-white py-2.5 px-4 rounded-lg hover:bg-[#1f2913] transition-colors shadow-sm"
              >
                Access
              </button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Fiscal Documents Status */}
          <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0]">
            <div className="p-6 border-b border-[#e8e0d0]">
              <h3 className="text-lg font-semibold text-[#2f3e1e]">Fiscal Series Status</h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {fiscalDocuments.map((doc, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-[#faf8f3] rounded-xl border border-[#e8e0d0]">
                    <div>
                      <p className="font-medium text-[#2f3e1e]">{doc.type}</p>
                      <p className="text-sm text-[#6b5c3b]">Series: {doc.series}</p>
                      <p className="text-xs text-[#8b7355]">Current: {doc.current}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-[#2f3e1e]">{doc.remaining}</p>
                      <p className="text-xs text-[#8b7355]">available</p>
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        doc.status === 'Active' ? 'bg-[#e0e9cf] text-[#4f5f33]' : 'bg-[#f0ebe0] text-[#6b5c3b]'
                      }`}>
                        {doc.status}
                      </span>
                    </div>
                  </div>
                ))}
                {fiscalDocuments.length === 0 && (
                  <div className="text-center text-[#6b5c3b] py-8">
                    <i className="ri-file-shield-line text-4xl text-[#d8cbb5] mb-2"></i>
                    <p>No fiscal series configured</p>
                  </div>
                )}
              </div>
              <div className="mt-4">
                <button 
                  onClick={() => navigate('/taxes/ncf')}
                  className="w-full bg-[#2f3e1e] text-white py-2.5 px-4 rounded-lg hover:bg-[#1f2913] transition-colors shadow-sm"
                >
                  Configure NCF Series
                </button>
              </div>
            </div>
          </div>

          {/* Upcoming Deadlines */}
          <div className="bg-gradient-to-br from-white to-[#faf9f5] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#e8e0d0]">
            <div className="p-6 border-b border-[#e8e0d0]">
              <h3 className="text-lg font-semibold text-[#2f3e1e]">Upcoming Tax Deadlines</h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {upcomingDeadlines.map((deadline, index) => (
                  <div key={index} className={`p-4 rounded-xl border ${
                    deadline.priority === 'Urgent' ? 'bg-[#fef2f2] border-[#fecaca]' :
                    deadline.priority === 'High' ? 'bg-[#fff7ed] border-[#fed7aa]' :
                    'bg-[#fefce8] border-[#fef08a]'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        deadline.priority === 'Urgent' ? 'bg-[#fee2e2] text-[#991b1b]' :
                        deadline.priority === 'High' ? 'bg-[#ffedd5] text-[#9a3412]' :
                        'bg-[#fef9c3] text-[#854d0e]'
                      }`}>
                        {deadline.priority === 'Urgent' ? 'Urgent' :
                         deadline.priority === 'High' ? 'High' : 'Medium'}
                      </span>
                      <span className="text-sm font-medium text-[#2f3e1e]">
                        {deadline.daysLeft === 0 ? 'Due Today' : `${deadline.daysLeft} days`}
                      </span>
                    </div>
                    <p className="font-medium text-[#2f3e1e]">{deadline.report}</p>
                    <p className="text-sm text-[#6b5c3b]">Due: {deadline.dueDate}</p>
                    <button 
                      onClick={() => handleGenerateReport(deadline.report)}
                      className="mt-3 w-full bg-[#7a2e1b] text-white py-2 px-4 rounded-lg hover:bg-[#5c1f12] transition-colors text-sm shadow-sm"
                    >
                      Generate Report
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
