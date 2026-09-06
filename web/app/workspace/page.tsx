import { ForgeWorkspace } from '@/components/forge/ForgeWorkspace';
import { WorkspaceCanvasDemo } from '@/components/forge/WorkspaceCanvasDemo';
import { ProtectedRoute } from '@/shared/auth/ProtectedRoute';

export default function WorkspacePage({ searchParams }: { searchParams?: { demo?: string | string[] } }) {
  const demo = Array.isArray(searchParams?.demo) ? searchParams?.demo[0] : searchParams?.demo;
  return (
    <ProtectedRoute>
      {/* Language comes from the root element, which follows the user's
          locale preference; this subtree used to claim lang="en" while
          rendering Vietnamese. */}
      <div className="contents">
        {demo === 'canvas-flow' ? <WorkspaceCanvasDemo /> : <ForgeWorkspace />}
      </div>
    </ProtectedRoute>
  );
}
