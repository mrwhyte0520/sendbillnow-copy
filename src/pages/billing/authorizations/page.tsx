import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';

interface ApprovalRequest {
  id: string;
  entity_type: string;
  entity_id: string;
  status: string;
  requested_at: string;
  approved_at: string | null;
  approved_by: string | null;
  notes: string | null;
}

export default function AuthorizationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      navigate('/billing');
    }, 1200);
    return () => clearTimeout(t);
  }, [navigate]);

  const loadRequests = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      let query = supabase
        .from('approval_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('requested_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRequests((data || []) as ApprovalRequest[]);
    } catch (error) {
      console.error('Error loading approval requests:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadRequests();
    }
  }, [user?.id, statusFilter]);

  const handleUpdateStatus = async (id: string, newStatus: 'approved' | 'rejected') => {
    try {
      if (!user?.id) return;
      const payload: any = {
        status: newStatus,
      };
      if (newStatus === 'approved') {
        payload.approved_at = new Date().toISOString();
        payload.approved_by = user.id;
      }
      const { error } = await supabase
        .from('approval_requests')
        .update(payload)
        .eq('id', id);
      if (error) throw error;
      await loadRequests();
    } catch (error) {
      console.error('Error updating approval request:', error);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'customer_payment':
        return 'Pago de cliente';
      case 'supplier_payment':
        return 'Pago a suplidor';
      case 'petty_cash_reimbursement':
        return 'Reembolso de caja chica';
      case 'invoice_discount':
        return 'Descuento en factura';
      case 'quote_discount':
        return 'Descuento en cotización';
      default:
        return type;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h1 className="text-2xl font-bold text-gray-900">Autorizaciones</h1>
          <p className="text-gray-600 mt-1">
            Módulo no disponible por el momento.
          </p>
          <p className="text-gray-500 text-sm mt-3">
            Redirigiendo a Facturación...
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
