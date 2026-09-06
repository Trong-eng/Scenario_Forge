import { X } from 'lucide-react';
import type { RegistryComparisonResult } from './useLiveWorkspace';
import { secondaryPanelClass } from './secondarySurfaceStyles';

type Props = {
  comparison: RegistryComparisonResult;
  onClose: () => void;
};

export function RegistryComparisonPanel({ comparison, onClose }: Props) {
  const groups = [
    ['Definition', comparison.definition_changes],
    ['Variant', comparison.variant_changes],
    ['Build', comparison.build_changes],
    ['Run', comparison.run_changes],
    ['Evaluation', comparison.evaluation_changes],
  ] as const;

  return (
    <section aria-label="Registry comparison" className={`${secondaryPanelClass} mt-3 overflow-hidden`}>
      <header className="flex min-h-14 items-center gap-3 border-b border-border px-4 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Registry comparison</h2>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {comparison.left_build_id} → {comparison.right_build_id}
          </p>
        </div>
        <button type="button" aria-label="Close comparison" onClick={onClose} className="icon-button ml-auto">
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>
      <div className="grid grid-cols-2 gap-x-8 px-4 py-2 max-md:grid-cols-1">
        {groups.map(([label, changes]) => (
          <section key={label} className="border-b border-border/60 py-4 last:border-b-0">
            <h3 className="text-xs font-semibold">{label} changes</h3>
            {changes.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {changes.map((change) => <li key={change} className="font-mono text-xs text-foreground/85">{change}</li>)}
              </ul>
            ) : <p className="mt-2 text-xs text-muted-foreground">No changes reported.</p>}
          </section>
        ))}
        <section className="border-b border-border/60 py-4 last:border-b-0">
          <h3 className="text-xs font-semibold">Scenic claims</h3>
          {comparison.scenic_claims.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {comparison.scenic_claims.map((claim) => <li key={claim} className="font-mono text-xs text-foreground/85">{claim}</li>)}
            </ul>
          ) : <p className="mt-2 text-xs text-muted-foreground">No claim changes reported.</p>}
        </section>
      </div>
    </section>
  );
}
