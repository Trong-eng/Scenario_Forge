import { AdminDashboard } from '@/features/admin/AdminDashboard';
import { ProtectedRoute } from '@/shared/auth/ProtectedRoute';

export default function AdminPage() {
  return <ProtectedRoute requiredRoles={['admin']}><AdminDashboard /></ProtectedRoute>;
}
