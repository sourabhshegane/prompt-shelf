import { describe, it, expect } from 'vitest';
import { statusCwd, statusText } from '../../src/cli/statusline.js';
import type { Prompt } from '../../src/domain/prompt.js';

const draft = (cwd: string): Prompt => ({ id: cwd, text: 'x', agent: 'claude', cwd, createdAt: '2026-10-04T10:00:00Z' });
const base = { cwd: '/repo', inSession: true, save: 'ctrl+f', list: 'ctrl+q' };

describe('stash statusline', () => {
  it('reads the folder from the JSON the agent pipes in', () => {
    expect(statusCwd('{"workspace":{"current_dir":"/a"},"cwd":"/b"}')).toBe('/a');
    expect(statusCwd('{"cwd":"/b"}')).toBe('/b');
    expect(statusCwd('not json')).toBeUndefined();
  });

  it('counts the drafts parked in this folder only', () => {
    expect(statusText({ ...base, prompts: [draft('/repo'), draft('/repo'), draft('/other')] })).toBe('⌁ 2 parked · ctrl+q');
  });

  it('shows the keys when nothing is parked, and nothing outside a stash session', () => {
    expect(statusText({ ...base, prompts: [] })).toBe('⌁ stash · ctrl+f park · ctrl+q list');
    expect(statusText({ ...base, prompts: [draft('/repo')], inSession: false })).toBe('');
  });
});
