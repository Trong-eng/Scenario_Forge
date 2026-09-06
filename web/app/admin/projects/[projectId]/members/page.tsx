import { AdminMembersPage } from '@/features/admin/AdminMembersPage';
import { ProtectedRoute } from '@/shared/auth/ProtectedRoute';

export default async function AdminMembersRoute({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProtectedRoute requiredRoles={['admin']}><AdminMembersPage projectId={projectId} /></ProtectedRoute>;
}
