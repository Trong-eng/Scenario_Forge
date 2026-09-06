import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentMarkdown } from '@/components/forge/AgentMarkdown';

describe('AgentMarkdown', () => {
  it('renders headings, lists, emphasis and inline code', () => {
    const { container } = render(<AgentMarkdown>{[
      '## Kết quả',
      '',
      'Agent đã **dựng xong** Definition với `map=Town05`.',
      '',
      '- Người đi bộ băng qua',
      '- Ego chạy 10 m/s',
    ].join('\n')}</AgentMarkdown>);

    expect(screen.getByText('Kết quả').tagName).toBe('H4');
    expect(container.querySelector('strong')?.textContent).toBe('dựng xong');
    expect(container.querySelector('code')?.textContent).toBe('map=Town05');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('renders a code block with a copy control', () => {
    const { container } = render(<AgentMarkdown>{'```python\nego = Car\n```'}</AgentMarkdown>);

    expect(container.querySelector('pre')?.textContent).toContain('ego = Car');
    expect(screen.getByLabelText('Chép đoạn mã')).not.toBeNull();
  });

  it('scrolls a wide table inside its own container so the column never widens', () => {
    const { container } = render(<AgentMarkdown>{[
      '| Tham số | Giá trị |',
      '| --- | --- |',
      '| map | Town05 |',
    ].join('\n')}</AgentMarkdown>);

    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    expect(table?.parentElement?.className).toContain('overflow-x-auto');
  });

  it('marks links safe for cross-origin navigation', () => {
    const { container } = render(<AgentMarkdown>{'[tài liệu](https://example.com)'}</AgentMarkdown>);
    const link = container.querySelector('a');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it('does not render raw HTML from model output', () => {
    // The reply is LLM-generated from user-supplied text, so raw HTML must be
    // escaped, not sanitised (CHATGPT-INTERACTION-SPEC §8). Streamdown escapes
    // only because `rehypePlugins` is passed empty, which drops its default
    // `raw -> sanitize -> harden` chain. This case pins that choice against a
    // dependency bump that changes the default resolution.
    const { container } = render(
      <AgentMarkdown>{'<img src="x" onerror="alert(1)"> và <b>đậm</b> và <script>alert(2)</script>'}</AgentMarkdown>,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<b>đậm</b>');
  });

  it('leaves hostile markdown inert — no handlers, no unsafe URLs', () => {
    // Asserts on the live DOM rather than on strings: that is what an attacker
    // actually reaches. Streamdown applies NO default urlTransform (react-markdown
    // did), so this also pins the guard that replaces it.
    const { container } = render(<AgentMarkdown>{[
      '[a](javascript:alert(1))',
      '[b](JaVaScRiPt:alert(2))',
      '[c](data:text/html;base64,PHNjcmlwdD4=)',
      '![d](javascript:alert(3))',
      '<div onclick="alert(4)">x</div>',
    ].join('\n\n')}</AgentMarkdown>);

    expect(container.querySelectorAll('script, iframe, object, embed, img, form, input')).toHaveLength(0);

    for (const element of Array.from(container.querySelectorAll('*'))) {
      for (const attribute of Array.from(element.attributes)) {
        expect(attribute.name.toLowerCase().startsWith('on')).toBe(false);
      }
    }

    for (const element of Array.from(container.querySelectorAll('[href], [src]'))) {
      const url = element.getAttribute('href') ?? element.getAttribute('src') ?? '';
      expect(url === '' || /^(https?:\/\/|#|\/|\.)/.test(url)).toBe(true);
    }
  });

  it('still allows an ordinary https link', () => {
    const { container } = render(<AgentMarkdown>{'[tài liệu](https://example.com/a)'}</AgentMarkdown>);

    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com/a');
  });

  it('appends the caret only while streaming', () => {
    const { container, rerender } = render(<AgentMarkdown caret>Đang xử lý</AgentMarkdown>);
    expect(container.querySelector('[data-agent-caret="true"]')).not.toBeNull();

    rerender(<AgentMarkdown>Đang xử lý</AgentMarkdown>);
    expect(container.querySelector('[data-agent-caret="true"]')).toBeNull();
  });
});
