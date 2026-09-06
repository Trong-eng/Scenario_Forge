import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EmptyState } from '../../../src/shared/components/EmptyState';
import { LoadingState } from '../../../src/shared/components/LoadingState';
import { ErrorState } from '../../../src/shared/components/ErrorState';

describe('Shared Workbench UI States', () => {
  it('renders the EmptyState component with custom message', () => {
    render(<EmptyState message="No definitions found in project" />);
    expect(screen.getByText('No definitions found in project')).toBeDefined();
  });

  it('renders the LoadingState component with message', () => {
    render(<LoadingState message="Compiling Scenic scenario build..." />);
    expect(screen.getByText('Compiling Scenic scenario build...')).toBeDefined();
  });

  it('renders the ErrorState component with correlation ID and message', () => {
    render(
      <ErrorState
        code="ERR_VALIDATION_FAILED"
        message="Scenic build failed syntax check"
        correlationId="corr-999"
      />
    );
    expect(screen.getByText('ERR_VALIDATION_FAILED')).toBeDefined();
    expect(screen.getByText('Scenic build failed syntax check')).toBeDefined();
    expect(screen.getByText(/corr-999/)).toBeDefined();
  });
});
