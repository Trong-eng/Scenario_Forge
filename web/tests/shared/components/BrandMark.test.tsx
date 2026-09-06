import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandMark } from '@/shared/components/BrandMark';

describe('BrandMark', () => {
  it('renders the shared vector mark as a decorative image', () => {
    render(<BrandMark className="logo-size" testId="brand-mark" />);

    const mark = screen.getByTestId('brand-mark');
    expect(mark.getAttribute('src')).toBe('/brand/worker-avatar.png');
    expect(mark.getAttribute('alt')).toBe('');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.className).toContain('logo-size');
  });

  it('ships a script-free SVG browser icon in the same identity', () => {
    const icon = readFileSync(resolve(process.cwd(), 'app/icon.svg'), 'utf8');

    expect(icon).toContain('<svg');
    expect(icon).toContain('#E8612E');
    expect(icon).not.toContain('<image');
    expect(icon).not.toContain('<script');
  });
});
