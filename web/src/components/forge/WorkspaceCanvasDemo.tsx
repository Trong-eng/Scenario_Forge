'use client';

import { FormEvent, useRef, useState } from 'react';
import { Plus, Send, Sparkles } from 'lucide-react';
import type { ProviderEvaluation, ProviderRunView, RegistryArtifactOutcome } from '@/shared/api/schemas';
import { DefinitionPanel } from './DefinitionPanel';
import type { FieldGroup } from './definitionModel';
import { InspectorPanel, type InspectorLive } from './InspectorPanel';
import { WorkspaceCanvas } from './WorkspaceCanvas';
import { WorkspaceSplitLayout } from './WorkspaceSplitLayout';
import { builderRailDefaultFraction, type CanvasPresentation, type CanvasStep, type CanvasStepView, type WorkspaceGuideState } from './workspaceCanvasModel';
import { CanvasArtifactCard } from './CanvasArtifactCard';

type DemoStage = 'intake' | 'structured' | 'approval' | 'run-ready' | 'complete';

const defaultPrompt = 'Một người đi bộ băng qua trước ego tại ngã tư Town05, trời mưa, ban đêm; ego chạy 10 m/s.';

const demoGroups: FieldGroup[] = [
  { id: 'global', title: 'Global', fields: [
    { id: 'map', label: 'Map', value: 'Town05', provenance: 'grounded', options: ['Town01', 'Town03', 'Town05'] },
    { id: 'weather', label: 'Weather', value: 'Rain', provenance: 'user', options: ['Clear', 'Rain', 'Fog'] },
    { id: 'time', label: 'Time of day', value: 'Night', provenance: 'user', options: ['Day', 'Night'] },
  ] },
  { id: 'relations', title: 'Relations', fields: [
    { id: 'topology', label: 'Topology', value: 'Four-way intersection', provenance: 'grounded' },
    { id: 'location', label: 'Location', value: 'Ngã tư / giao lộ', provenance: 'user' },
    { id: 'conflict', label: 'Conflict region', value: 'Crosswalk', provenance: 'grounded' },
  ] },
  { id: 'ego', title: 'Ego', fields: [
    { id: 'speed', label: 'Initial speed', value: '10 m/s', provenance: 'user' },
    { id: 'mission', label: 'Mission', value: 'Go straight', provenance: 'default' },
    { id: 'controller', label: 'Controller', value: 'Autopilot', provenance: 'default' },
  ] },
  { id: 'actors', title: 'Other actors', fields: [
    { id: 'side', label: 'Side', value: 'Right', provenance: 'user' },
    { id: 'type', label: 'Actor type', value: 'Pedestrian', provenance: 'user' },
    { id: 'maneuver', label: 'Maneuver', value: 'Cross', provenance: 'grounded' },
  ] },
];

const demoRun: ProviderRunView = {
  run: { schema_version: '1.0.0', run_id: 'run-demo-42', build_id: 'bld-demo-42', manifest_hash: 'sha256:demo-manifest', seed: 42, status: 'succeeded', mode: 'smoke' },
  job_id: 'job-demo-42', approval_id: 'approval-demo-42', attempt: 0, status: 'succeeded',
  progress: { phase: 'completed', completed_steps: 6, total_steps: 6 },
  sampled_values: { pedestrian_speed: 1.4, trigger_distance: 18 },
  versions: { carla: '0.9.15', scenic: '3.1.0' },
  failure: null, cleanup: { outcome: 'succeeded', detail: null }, artifact: null, replay_of: null,
};

const demoEvaluation: ProviderEvaluation = {
  schema_version: '1.0.0',
  evaluation: { schema_version: '1.0.0', evaluation_id: 'eval-demo-42', run_id: 'run-demo-42', definition_hash: 'sha256:demo-definition', outcome: 'pass' },
  report: { minimum_distance_m: 3.8, collision: false, outcome: 'pass' },
};

const demoArtifacts: RegistryArtifactOutcome[] = [{
  project_id: 'demo-project', artifact_id: 'run_video-demo-42', status: 'published',
  manifest_hash: 'sha256:demo-manifest', checksum: 'sha256:demo-video', public_uri: '/carla-sim.mp4', tombstone_reason: null,
}];

function stepViews(stage: DemoStage): CanvasStepView[] {
  const buildDone = stage === 'run-ready' || stage === 'complete';
  const buildAvailable = stage === 'approval';
  const runAvailable = stage === 'run-ready';
  return [
    { id: 'structured', labelKey: 'canvas.step.structured', state: 'complete' },
    buildDone
      ? { id: 'build', labelKey: 'canvas.step.build', state: 'complete' }
      : buildAvailable
        ? { id: 'build', labelKey: 'canvas.step.build', state: 'available', reasonKey: 'canvas.buildAwaitingApproval' }
        : { id: 'build', labelKey: 'canvas.step.build', state: 'locked', reasonKey: 'canvas.buildFromChat' },
    stage === 'complete'
      ? { id: 'run', labelKey: 'canvas.step.run', state: 'complete' }
      : runAvailable
        ? { id: 'run', labelKey: 'canvas.step.run', state: 'available' }
        : { id: 'run', labelKey: 'canvas.step.run', state: 'locked', reasonKey: 'canvas.runNeedsApproval' },
  ];
}

function DemoAgent({ stage, prompt, onPromptChange, onStart, onOpenCanvas }: {
  stage: DemoStage;
  prompt: string;
  onPromptChange: (value: string) => void;
  onStart: (event: FormEvent) => void;
  onOpenCanvas: () => void;
}) {
  const intake = stage === 'intake';
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const [followup, setFollowup] = useState('');
  const composerValue = intake ? prompt : followup;
  const submitComposer = (event: FormEvent) => {
    if (intake) {
      onStart(event);
      return;
    }
    event.preventDefault();
    setFollowup('');
  };
  return <section aria-label="Agent workspace" className="flex h-full min-h-0 flex-col overflow-hidden">
    <div className="flex shrink-0 items-center gap-3 px-5 py-4">
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles aria-hidden="true" className="size-4" /></span>
      <div className="min-w-0 flex-1"><h2 className="text-[length:calc(15px*var(--font-scale))] font-semibold">Scenario Forge Agent</h2><p className="text-[length:calc(12px*var(--font-scale))] text-muted-foreground">{intake ? 'Sẵn sàng nhận yêu cầu' : 'Definition v1 đã sẵn sàng'}</p></div>
    </div>
    {intake ? <div className="grid min-h-0 flex-1 place-items-center px-6">
      <div className="w-full max-w-[42rem] text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground">S</span>
        <h1 className="mt-5 text-[clamp(1.7rem,3vw,2.35rem)] font-semibold tracking-[-0.045em]">Bắt đầu bằng một tình huống giao thông</h1>
        <p className="mx-auto mt-3 max-w-md text-[length:calc(14px*var(--font-scale))] leading-relaxed text-muted-foreground">Nhập prompt để xem toàn bộ cách Chat và Canvas phối hợp qua ba bước.</p>
      </div>
    </div> : <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8">
      <div className="mx-auto flex max-w-[46rem] flex-col gap-5">
        <p className="ml-auto max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-[length:calc(13px*var(--font-scale))] leading-relaxed text-primary-foreground">{prompt}</p>
        <div className="space-y-2 pl-2"><p className="text-[length:calc(15px*var(--font-scale))] leading-relaxed">Mình đã dựng Definition v1. Mở tài liệu bên dưới để xem và chỉnh các trường.</p><p className="text-[length:calc(12px*var(--font-scale))] text-muted-foreground">Đây là dữ liệu mô phỏng giao diện; chưa gửi Build hoặc Run tới CARLA.</p></div>
        <CanvasArtifactCard onOpen={onOpenCanvas} meta="Demo UI · Không chạy CARLA" />
        {stage === 'approval' ? <p className="rounded-xl border border-border bg-surface/50 p-4 text-[length:calc(13px*var(--font-scale))]">Build demo đã publish. Duyệt manifest trong Canvas để mở khóa Run.</p> : null}
        {stage === 'run-ready' ? <p className="rounded-xl border border-success/30 bg-success/10 p-4 text-[length:calc(13px*var(--font-scale))]">Build đã duyệt. Chọn Smoke run hoặc Full run trong Canvas.</p> : null}
        {stage === 'complete' ? <p className="rounded-xl border border-success/30 bg-success/10 p-4 text-[length:calc(13px*var(--font-scale))]">Run demo hoàn tất. Video và outcome ở Canvas; chi tiết kỹ thuật vẫn được thu gọn.</p> : null}
      </div>
    </div>}
    <form onSubmit={submitComposer} className="shrink-0 px-5 pb-5">
      <div className="mx-auto flex max-w-[46rem] items-end gap-2 rounded-2xl border border-input bg-card p-1.5 shadow-[0_8px_28px_rgba(43,31,24,0.08)]">
        <span className="relative shrink-0">
          <button type="button" onClick={() => setCapabilitiesOpen((open) => !open)} aria-expanded={capabilitiesOpen} aria-label="Mở Capabilities" title="Capabilities" className="grid size-10 place-items-center rounded-xl text-muted-foreground outline-none transition-colors hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"><Plus aria-hidden="true" className="size-5" /></button>
          {capabilitiesOpen ? <span role="dialog" aria-label="Capabilities preview" className="absolute bottom-[calc(100%+0.65rem)] left-0 z-20 w-64 rounded-xl border border-border bg-card p-3 shadow-float">
            <strong className="block text-[length:calc(13px*var(--font-scale))]">Capabilities</strong>
            <span className="mt-1 block text-[length:calc(12px*var(--font-scale))] leading-relaxed text-muted-foreground">Danh mục khả năng hiện có sẽ mở tại đây và đưa lựa chọn trở lại ô chat.</span>
          </span> : null}
        </span>
        <label htmlFor="demo-scenario-prompt" className="sr-only">Scenario prompt</label>
        <textarea id="demo-scenario-prompt" aria-label="Scenario prompt" rows={1} value={composerValue} placeholder={intake ? undefined : 'Tiếp tục cuộc hội thoại với agent…'} onChange={(event) => intake ? onPromptChange(event.target.value) : setFollowup(event.target.value)} className="chat-composer-input min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[length:calc(13px*var(--font-scale))] outline-none" />
        <button type="submit" disabled={!composerValue.trim()} aria-label={intake ? 'Bắt đầu demo' : 'Gửi tin nhắn demo'} className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"><Send aria-hidden="true" className="size-4" /></button>
      </div>
    </form>
  </section>;
}

export function WorkspaceCanvasDemo() {
  const [stage, setStage] = useState<DemoStage>('intake');
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasPresentation, setCanvasPresentation] = useState<Exclude<CanvasPresentation, 'closed'>>('split');
  const [activeStep, setActiveStep] = useState<CanvasStep>('structured');
  const [chatFraction, setChatFraction] = useState(builderRailDefaultFraction);
  const [compactSurface, setCompactSurface] = useState<'chat' | 'canvas'>('chat');
  const [seed, setSeed] = useState('42');
  const [groups, setGroups] = useState(demoGroups);
  const panelRef = useRef<HTMLElement>(null);
  const definitionReady = stage !== 'intake';
  const approved = stage === 'run-ready' || stage === 'complete';
  const run = stage === 'complete' ? demoRun : null;
  const live: InspectorLive | null = stage === 'structured' ? null : {
    seed,
    buildLabel: 'bld-demo-42 · Seed 42',
    readiness: approved ? 'Ready to run' : 'Approval required',
    preflight: [
      { label: 'Build published', state: 'pass' },
      { label: 'Manifest hash (full)', state: 'hash', value: 'sha256:demo-manifest-42' },
    ],
    run,
    evaluation: run ? demoEvaluation : null,
    artifacts: run ? demoArtifacts : [],
  };
  const guide: WorkspaceGuideState = { activeStep, phase: stage === 'complete' ? 'complete' : 'working', direction: 'forward' };

  const openCanvas = () => { setCanvasOpen(true); setCanvasPresentation('split'); setCompactSurface('canvas'); };
  const start = (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim() || stage !== 'intake') return;
    setStage('structured');
    setActiveStep('structured');
  };
  const startBuild = () => { setStage('approval'); setActiveStep('build'); openCanvas(); };
  const approveBuild = () => { setStage('run-ready'); setActiveStep('run'); };
  const finishRun = () => { setStage('complete'); setActiveStep('run'); };

  return <div className="h-dvh min-h-0 bg-background text-foreground">
    <main className="h-full min-h-0 overflow-hidden">
      <WorkspaceSplitLayout
        canvasOpen={definitionReady && canvasOpen}
        chatFraction={chatFraction}
        onChatFractionChange={setChatFraction}
        compactSurface={compactSurface}
        onCompactSurfaceChange={setCompactSurface}
        chat={<DemoAgent stage={stage} prompt={prompt} onPromptChange={setPrompt} onStart={start} onOpenCanvas={openCanvas} />}
        canvas={<WorkspaceCanvas
          steps={stepViews(stage)}
          activeStep={activeStep}
          guide={guide}
          runProgress={run ? { completedSteps: run.progress.completed_steps, totalSteps: run.progress.total_steps } : undefined}
          runTerminal={Boolean(run)}
          onStepChange={setActiveStep}
          presentation={canvasPresentation}
          onPresentationChange={setCanvasPresentation}
          onClose={() => { setCanvasOpen(false); setCanvasPresentation('split'); setCompactSurface('chat'); }}
          structured={<DefinitionPanel tab="structured" availableTabs={['structured']} groups={groups} inspectorOpen={false} inspectorAvailable={false} pendingEdits={0} onTabChange={() => undefined} onFieldChange={(groupId, fieldId, value) => setGroups((current) => current.map((group) => group.id !== groupId ? group : { ...group, fields: group.fields.map((field) => field.id === fieldId ? { ...field, value, provenance: 'user' } : field) }))} onCompare={() => undefined} onSubmit={() => undefined} onOpenInspector={() => undefined} onGroundAndBuild={stage === 'structured' ? startBuild : undefined} />}
          build={<InspectorPanel embedded mode="build" live={live} approved={approved} seed={seed} scenicSource={'param map = "Town05"\nparam weather = "rain"\nscenario PedestrianCrossing'} onClose={() => undefined} onApprove={approveBuild} onCopyManifest={() => undefined} onCopyScenic={() => undefined} onSeedChange={setSeed} onRun={finishRun} overlay={false} panelRef={panelRef} onPanelKeyDown={() => undefined} showClose={false} />}
          run={<InspectorPanel embedded mode="run" live={live} approved={approved} seed={seed} run={run} evaluation={run ? demoEvaluation : null} artifacts={run ? demoArtifacts : []} onClose={() => undefined} onApprove={approveBuild} onCopyManifest={() => undefined} onSeedChange={setSeed} onRun={finishRun} overlay={false} panelRef={panelRef} onPanelKeyDown={() => undefined} showClose={false} />}
        />}
      />
    </main>
  </div>;
}
