
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePlans } from '../../hooks/usePlans';

interface TrialGuardProps {
  children: ReactNode;
  feature?: string;
}

export default function TrialGuard({ children, feature }: TrialGuardProps) {
  const { hasAccess, trialInfo, currentPlan, getTrialStatus } = usePlans();

  const trialStatus = getTrialStatus();

  if (!hasAccess()) {
    const formatTimeLeft = () => {
      if (trialInfo.daysLeft > 0) {
        return `${trialInfo.daysLeft} days`;
      } else if (trialInfo.hoursLeft > 0) {
        return `${trialInfo.hoursLeft} hours`;
      } else if (trialInfo.minutesLeft > 0) {
        return `${trialInfo.minutesLeft} minutes`;
      } else {
        return 'Expired';
      }
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-navy-900 to-navy-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full text-center">
          <div className="mb-6">
            <i className="ri-lock-line text-6xl text-red-500 mb-4"></i>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Restricted Access
            </h2>
            <p className="text-gray-600">
              {trialStatus === 'expired' 
                ? 'Your 15-day trial period has expired. To continue using Sendbillnow, select a subscription plan.'
                : 'You do not have access to this feature. Check your subscription.'
              }
            </p>
          </div>

          {/* Trial Status */}
          <div className="bg-red-50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-center mb-2">
              <i className="ri-time-line text-red-500 mr-2"></i>
              <span className="font-semibold text-red-800">Trial Status</span>
            </div>
            <div className="text-2xl font-bold text-red-600 mb-1">
              {formatTimeLeft()}
            </div>
            <div className="text-sm text-red-600">
              {trialStatus === 'expired' ? 'Period expired' : 'Time remaining'}
            </div>
          </div>

          {feature && (
            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>Requested feature:</strong> {feature}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                This feature requires an active subscription
              </p>
            </div>
          )}

          {/* Current Plan Status */}
          {currentPlan ? (
            <div className="bg-green-50 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-center mb-2">
                <i className="ri-vip-crown-line text-green-500 mr-2"></i>
                <span className="font-semibold text-green-800">Current Plan</span>
              </div>
              <div className="text-lg font-bold text-green-600">
                {currentPlan.name}
              </div>
              <div className="text-sm text-green-600">
                {currentPlan.active ? 'Active' : 'Inactive'}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-center mb-2">
                <i className="ri-user-line text-gray-500 mr-2"></i>
                <span className="font-semibold text-gray-700">No Subscription</span>
              </div>
              <div className="text-sm text-gray-600">
                Using free trial period
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Link
              to="/plans"
              className="w-full bg-gradient-to-r from-navy-600 to-navy-700 text-white py-3 px-4 rounded-lg font-semibold hover:from-navy-700 hover:to-navy-800 transition-all duration-200 block whitespace-nowrap"
            >
              {trialStatus === 'expired' ? 'Subscribe Now' : 'View Subscription Plans'}
            </Link>
            
            <Link
              to="/dashboard"
              className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-semibold hover:bg-gray-50 transition-all duration-200 block whitespace-nowrap"
            >
              Back to Dashboard
            </Link>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-2">
              Need help? Contact our support
            </p>
            <div className="flex items-center justify-center text-xs text-gray-400">
              <i className="ri-shield-check-line mr-1"></i>
              <span>Sendbillnow - Dominican Accounting System</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
