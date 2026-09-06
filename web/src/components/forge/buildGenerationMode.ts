export type BuildGenerationMode = 'baseline' | 'rag';

export function defaultBuildGenerationMode(
  configuredMode = process.env.NEXT_PUBLIC_SCENIC_DEFAULT_GENERATION_MODE,
): BuildGenerationMode {
  return configuredMode === 'rag' ? 'rag' : 'baseline';
}
