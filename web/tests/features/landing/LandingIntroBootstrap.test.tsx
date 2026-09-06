import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Page from '../../../app/page';

describe('landing intro bootstrap markup', () => {
  it('places the parser-blocking session decision before landing markup', () => {
    const html = renderToStaticMarkup(<Page />);
    const criticalStyle = html.indexOf('id="sf-intro-critical"');
    const bootstrap = html.indexOf('id="sf-intro-bootstrap"');
    const intro = html.indexOf('data-testid="landing-intro"');
    const landing = html.indexOf('id="hero-title"');

    expect(criticalStyle).toBeGreaterThanOrEqual(0);
    expect(criticalStyle).toBeLessThan(bootstrap);
    expect(bootstrap).toBeGreaterThanOrEqual(0);
    expect(bootstrap).toBeLessThan(intro);
    expect(intro).toBeLessThan(landing);
    expect(html).toContain('data-sf-intro');
    expect(html).toContain('[data-sf-intro-content]{visibility:hidden}');
    expect(html.slice(criticalStyle, bootstrap)).not.toContain('&#x27;');
    expect(html).toContain('<noscript>');
  });
});
