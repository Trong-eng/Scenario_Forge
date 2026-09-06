import type {
  ProviderApproval, ProviderArtifact, ProviderBuild, ProviderDefinition, ProviderEvaluation,
  ProviderJob, ProviderRegistryItem, ProviderRunView, ProviderVariant, RegistryArtifactOutcome,
  RecoveryRequiredResult,
} from '@/shared/api/schemas';

export type LiveSession = { projectId: string; projectToken: string };
export type LiveStage = 'idle' | 'loading' | 'ready' | 'submitting' | 'error';
export type LiveNav = 'workspace' | 'library' | 'runs';
export type LiveWorkspaceState = {
  session: LiveSession | null;
  stage: LiveStage;
  status: string;
  error: string | null;
  /** A successful PATCH whose successor is not yet visible after refresh. */
  definitionRefreshRequired?: boolean;
  recovery: RecoveryRequiredResult | null;
  definitions: ProviderDefinition[];
  registry: ProviderRegistryItem[];
  selectedDefinition: ProviderDefinition | null;
  variant: ProviderVariant | null;
  buildJob: ProviderJob | null;
  build: ProviderBuild | null;
  approval: ProviderApproval | null;
  run: ProviderRunView | null;
  evaluation: ProviderEvaluation | null;
  artifacts: ProviderArtifact[];
  artifactOutcomes: RegistryArtifactOutcome[];
  /**
   * True while the workspace is still polling for a Run's evidence. A Run
   * reaches a terminal status before its signed video URL is published, so
   * status alone would stop a waiting state a moment too early and show a
   * "no video" frame that the next poll contradicts.
   */
  runEvidencePending: boolean;
};
