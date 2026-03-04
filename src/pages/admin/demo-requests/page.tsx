import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';

interface DemoRequest {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  business_name: string | null;
  location: string | null;
  business_type: string;
  description: string | null;
  status: 'pending' | 'confirmed' | 'rejected';
  created_at: string;
  approved_at?: string;
  trial_days?: number;
}

export default function AdminDemoRequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Access is enforced by ProtectedRoute (RBAC admin module)
    if (user) loadRequests();
  }, [user]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('demo_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error loading demo requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredRequests = requests.filter(r => {
    const matchesStatus = filterStatus === 'all' || r.status === filterStatus;
    const matchesSearch = 
      r.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    return matchesStatus && matchesSearch;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'confirmed').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1F2618] to-[#3E4D2C] rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <i className="ri-admin-line text-3xl"></i>
                Admin - Demo Requests
              </h1>
              <p className="text-[#CFE6AB] mt-1">Manage demo requests and create user accounts</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-white/20 rounded-full text-sm">
                <i className="ri-shield-star-line mr-1"></i>
                Super Admin
              </span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border border-[#E0E7C8] shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Requests</p>
                <p className="text-2xl font-bold text-gray-900">{requests.length}</p>
              </div>
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <i className="ri-file-list-3-line text-blue-600 text-xl"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-[#E0E7C8] shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <i className="ri-time-line text-yellow-600 text-xl"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-[#E0E7C8] shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Approved</p>
                <p className="text-2xl font-bold text-green-600">{approvedCount}</p>
              </div>
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <i className="ri-check-line text-green-600 text-xl"></i>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-[#E0E7C8] shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Rejected</p>
                <p className="text-2xl font-bold text-red-600">{rejectedCount}</p>
              </div>
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <i className="ri-close-line text-red-600 text-xl"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl p-4 border border-[#E0E7C8] shadow-sm">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search by name, email or business..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#008000]/30 focus:border-[#008000]"
              />
            </div>
            <div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 border border-[#E2D6BD] rounded-lg focus:ring-2 focus:ring-[#008000]/30 focus:border-[#008000]"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <button
              onClick={loadRequests}
              className="px-4 py-2 bg-[#566738] text-white rounded-lg hover:bg-[#45532B] transition-colors"
            >
              <i className="ri-refresh-line mr-2"></i>
              Refresh
            </button>
          </div>
        </div>

        {/* Requests Table */}
        <div className="bg-white rounded-xl border border-[#E0E7C8] shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <i className="ri-loader-4-line text-4xl text-[#008000] animate-spin"></i>
              <p className="mt-2 text-gray-600">Loading requests...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-12 text-center">
              <i className="ri-inbox-line text-4xl text-gray-400"></i>
              <p className="mt-2 text-gray-600">No demo requests found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Applicant</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Business</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRequests.map((request) => (
                    <tr key={request.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="font-medium text-gray-900">{request.full_name}</div>
                        <div className="text-sm text-gray-500">{request.email}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900">{request.business_name || '—'}</div>
                        <div className="text-xs text-gray-500">{request.business_type}</div>
                        {request.location && (
                          <div className="text-xs text-gray-400">{request.location}</div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900">{request.phone}</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {new Date(request.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          request.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {request.status === 'pending' ? 'Pending' :
                           request.status === 'confirmed' ? 'Confirmed' : 'Rejected'}
                        </span>
                        {request.status === 'confirmed' && request.trial_days && (
                          <div className="text-xs text-gray-500 mt-1">
                            {request.trial_days} days trial
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-xs text-gray-400">—</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
