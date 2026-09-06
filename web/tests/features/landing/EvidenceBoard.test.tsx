import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EvidenceBoard } from '@/features/landing/EvidenceBoard';

describe('EvidenceBoard', () => {
  it('uses the approved Edufun image as the visible intake artifact', () => {
    const { container } = render(<EvidenceBoard state="description" />);

    expect(screen.getByTestId('evidence-board').getAttribute('data-evidence-state')).toBe('description');
    expect(screen.getByTestId('evidence-scene-description').getAttribute('data-active')).toBe('true');
    expect(screen.getByRole('img', { name: /tình huống Edufun/i }).getAttribute('src')).toContain(
      'url=%2Flanding%2Fscenario-forge-edufun-thumbnail-v2.png',
    );
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('promotes the structured workbench when the Scenario IR checkpoint becomes active', () => {
    render(<EvidenceBoard state="scenario-ir" />);

    expect(screen.getByTestId('evidence-scene-scenario-ir').getAttribute('data-active')).toBe('true');
    expect(screen.getByRole('img', { name: /Workbench có cấu trúc/i }).getAttribute('src')).toContain(
      'url=%2Flanding%2Fworkbench-preview.png',
    );
  });

  it('turns approval and run proof into distinct authored evidence states', () => {
    const { rerender } = render(<EvidenceBoard state="approval" />);

    expect(screen.getByTestId('evidence-scene-approval').getAttribute('data-active')).toBe('true');
    expect(screen.getByText('APPROVED')).toBeDefined();
    expect(screen.getByText('sha256:8f2c…71ad')).toBeDefined();

    rerender(<EvidenceBoard state="run-evidence" />);
    expect(screen.getByTestId('evidence-scene-run-evidence').getAttribute('data-active')).toBe('true');
    expect(screen.getByText('12.8s')).toBeDefined();
    expect(screen.getByText('9 rule checks')).toBeDefined();
    expect(screen.getByText('Exact seed')).toBeDefined();
  });
});
