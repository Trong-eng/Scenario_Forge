export const workflowSteps = [
  { code: '01', label: 'Mô tả', detail: 'Một tình huống giao thông bằng ngôn ngữ tự nhiên.' },
  { code: '02', label: 'Scenario IR', detail: 'Claims, actor, map, trigger và seed thành cấu trúc.' },
  { code: '03', label: 'Validation', detail: 'Catalog allow-list và validator deterministic kiểm tra.' },
  { code: '04', label: 'Human approval', detail: 'Reviewer duyệt đúng manifest hash.' },
  { code: '05', label: 'CARLA run', detail: 'Worker chạy artifact đã được phê duyệt.' },
  { code: '06', label: 'Evidence', detail: 'Timeline, telemetry và lineage quay về cùng một hồ sơ.' },
] as const;

export const trustSignals = [
  { index: 'A', title: 'Catalog có biên', body: 'Map, actor và thuộc tính được chọn từ allow-list có phiên bản — không bịa ID để đi tiếp.' },
  { index: 'B', title: 'Validation deterministic', body: 'Cùng một IR, policy và seed tạo ra cùng một kết luận kiểm định có thể tái lập.' },
  { index: 'C', title: 'Approval gắn hash', body: 'Phê duyệt thuộc về đúng manifest. Semantic change làm mất hiệu lực, không tự chạy lại.' },
] as const;

export const pilotMetrics = [
  { value: '< 15 phút', label: 'từ mô tả đến bản chạy smoke' },
  { value: '100%', label: 'run có seed và manifest hash' },
  { value: '0', label: 'run sau semantic change chưa duyệt' },
] as const;

export type WorkflowStep = (typeof workflowSteps)[number];
