import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { TemplatesWorkspace } from '../../../src/components/forge/TemplatesWorkspace';

afterEach(cleanup);

it('owns a bounded empty state until the provider publishes a Templates contract', () => {
  render(<TemplatesWorkspace />);

  expect(screen.getByRole('heading', { name: 'Mẫu' })).toBeDefined();
  expect(screen.getByText('Chưa có mẫu nào từ nhà cung cấp')).toBeDefined();
  expect(screen.queryByRole('button')).toBeNull();
});
