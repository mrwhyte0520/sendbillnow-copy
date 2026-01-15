import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';

const SUPER_ADMIN_EMAILS = ['rolianaurora30@gmail.com', 'htcreportes@gmail.com'];

interface DemoRequest {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  business_name: string | null;
  location: string | null;
  business_type: string;
  description: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  approved_at?: string;
  trial_days?: number;
}

export default function AdminDemoRequestsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal para aprobar
  const [approveModal, setApproveModal] = useState<{ show: boolean; request: DemoRequest | null }>({
    show: false,
    request: null
  });
  const [trialDays, setTrialDays] = useState(14);
  const [generatedPassword, setGeneratedPassword] = useState('');

  // Verificar acceso super admin
  const isSuperAdmin = !!user?.email && SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase());

  useEffect(() => {
    if (!isSuperAdmin && user) {
      navigate('/dashboard');
    }
  }, [isSuperAdmin, user, navigate]);

  useEffect(() => {
    if (isSuperAdmin) {
      loadRequests();
    }
  }, [isSuperAdmin]);

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

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const openApproveModal = (request: DemoRequest) => {
    const pwd = generatePassword();
    setGeneratedPassword(pwd);
    setTrialDays(14);
    setApproveModal({ show: true, request });
  };

  const handleApprove = async () => {
    if (!approveModal.request) return;

    const request = approveModal.request;
    setProcessing(request.id);

    try {
      // Llamar al API endpoint para crear usuario y enviar email
      const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';

      const response = await fetch(`${apiBase}/api/approve-demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          email: request.email,
          fullName: request.full_name,
          password: generatedPassword,
          trialDays: trialDays,
          businessName: request.business_name
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Error al aprobar la solicitud');
      }

      // Actualizar estado local
      setRequests(prev => prev.map(r => 
        r.id === request.id 
          ? { ...r, status: 'approved' as const, approved_at: new Date().toISOString(), trial_days: trialDays }
          : r
      ));

      setApproveModal({ show: false, request: null });
      alert(`Usuario creado exitosamente.\n\nEmail: ${request.email}\nContraseña: ${generatedPassword}\nTrial: ${trialDays} días\n\nSe ha enviado un email con las credenciales.`);

    } catch (error: any) {
      console.error('Error approving request:', error);
      alert(error.message || 'Error al aprobar la solicitud');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (request: DemoRequest) => {
    if (!confirm(`¿Rechazar la solicitud de ${request.full_name}?`)) return;

    setProcessing(request.id);
    try {
      const { error } = await supabase
        .from('demo_requests')
        .update({ status: 'rejected' })
        .eq('id', request.id);

      if (error) throw error;

      setRequests(prev => prev.map(r => 
        r.id === request.id ? { ...r, status: 'rejected' as const } : r
      ));
    } catch (error) {
      console.error('Error rejecting request:', error);
      alert('Error al rechazar la solicitud');
    } finally {
      setProcessing(null);
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
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

  if (!isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <i className="ri-lock-2-fill text-6xl text-red-500 mb-4"></i>
            <h2 className="text-2xl font-bold text-gray-900">Access Denied</h2>
            <p className="text-gray-600 mt-2">You don't have permission to access this page.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

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
                <option value="approved">Approved</option>
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
                          request.status === 'approved' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {request.status === 'pending' ? 'Pending' :
                           request.status === 'approved' ? 'Approved' : 'Rejected'}
                        </span>
                        {request.status === 'approved' && request.trial_days && (
                          <div className="text-xs text-gray-500 mt-1">
                            {request.trial_days} days trial
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {request.status === 'pending' && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openApproveModal(request)}
                              disabled={processing === request.id}
                              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                            >
                              <i className="ri-check-line mr-1"></i>
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(request)}
                              disabled={processing === request.id}
                              className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                            >
                              <i className="ri-close-line mr-1"></i>
                              Reject
                            </button>
                          </div>
                        )}
                        {request.status !== 'pending' && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Approve Modal */}
        {approveModal.show && approveModal.request && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Approve Demo Request</h3>
                <button
                  onClick={() => setApproveModal({ show: false, request: null })}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Applicant</p>
                  <p className="font-medium text-gray-900">{approveModal.request.full_name}</p>
                  <p className="text-sm text-gray-600">{approveModal.request.email}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Trial Duration (days)
                  </label>
                  <select
                    value={trialDays}
                    onChange={(e) => setTrialDays(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]/30 focus:border-[#008000]"
                  >
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                    <option value={90}>90 days</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Generated Password
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={generatedPassword}
                      onChange={(e) => setGeneratedPassword(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000]/30 focus:border-[#008000] font-mono"
                    />
                    <button
                      onClick={() => setGeneratedPassword(generatePassword())}
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <i className="ri-refresh-line"></i>
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    This password will be sent to the user via email.
                  </p>
                </div>

                <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
                  <i className="ri-information-line mr-1"></i>
                  An email will be sent to <strong>{approveModal.request.email}</strong> with the login credentials.
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setApproveModal({ show: false, request: null })}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  disabled={processing === approveModal.request.id || !generatedPassword}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {processing === approveModal.request.id ? (
                    <>
                      <i className="ri-loader-4-line animate-spin mr-2"></i>
                      Processing...
                    </>
                  ) : (
                    <>
                      <i className="ri-check-line mr-2"></i>
                      Approve & Create User
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
