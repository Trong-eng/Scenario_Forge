import type { ProviderRegistryItem } from '@/shared/api/schemas';

export function orderSemanticLineage(rows: ProviderRegistryItem[]): ProviderRegistryItem[] {
  return [...rows].sort((left, right) =>
    right.definition_version - left.definition_version
    || right.variant_version - left.variant_version
    || left.build_id.localeCompare(right.build_id),
  );
}

export function preferredLineage(rows: ProviderRegistryItem[]): ProviderRegistryItem | undefined {
  return orderSemanticLineage(rows)[0];
}
