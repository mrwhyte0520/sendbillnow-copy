import { useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import BasicDashboard from '../dashboard/components/BasicDashboard';
import AdvancedKPIDashboard from '../dashboard/components/AdvancedKPIDashboard';
import { usePlanLimitations } from '../../hooks/usePlanLimitations';

export default function StatisticsPage() {
  const [activeView, setActiveView] = useState<'basic' | 'advanced'>('advanced');
  const { checkFeatureAccess } = usePlanLimitations();

  const hasAdvancedDashboard = checkFeatureAccess('hasAdvancedAnalytics');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#008000] to-[#008000] rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">
                <i className="ri-bar-chart-2-line mr-3"></i>
                Statistics
              </h1>
              <p className="text-stone-200">Metrics and analysis for your business</p>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Dashboard Type Selector */}
              <div className="flex bg-white/10 rounded-lg p-1">
                <button
                  onClick={() => setActiveView('advanced')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                    activeView === 'advanced'
                      ? 'bg-white text-[#008000] shadow-sm'
                      : 'text-white hover:bg-white/10'
                  }`}
                >
                  <i className="ri-dashboard-3-line mr-2"></i>
                  Advanced KPI
                </button>
                <button
                  onClick={() => setActiveView('basic')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                    activeView === 'basic'
                      ? 'bg-white text-[#008000] shadow-sm'
                      : 'text-white hover:bg-white/10'
                  }`}
                >
                  <i className="ri-dashboard-line mr-2"></i>
                  Basic
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Statistics Content */}
        {activeView === 'advanced' ? (
          <AdvancedKPIDashboard />
        ) : (
          <BasicDashboard />
        )}
      </div>
    </DashboardLayout>
  );
}
