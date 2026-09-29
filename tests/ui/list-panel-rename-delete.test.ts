import { describe, it, expect } from 'vitest';
import { ListPanel } from '../../src/ui/list-panel.js';
import type { Prompt } from '../../src/domain/prompt.js';

const saved = (id: string, shelf: string): Prompt => ({ id, text: `prompt ${id}`, agent: 'claude', cwd: '/test', createdAt: '2026-09-29T10:00:00Z', shelf });

// Stash -> Skills -> first shelf.
const onIdeas = (prompts: Prompt[] = []) => {
  const panel = new ListPanel(prompts, { cwd: '/test', hotkeyLabel: 'ctrl+f', shelves: ['Ideas', 'Work'] });
  panel.handleKey('\x1b[C');
  panel.handleKey('\x1b[C');
  return panel;
};

describe('ListPanel shelf delete', () => {
  it('asks before deleting the shelf with D, naming how many prompts go with it', () => {
    const panel = onIdeas([saved('1', 'Ideas'), saved('2', 'Ideas')]);
    expect(panel.handleKey('D').type).toBe('none');
    expect(panel.render(120, 10)).toContain('delete Ideas and its 2 prompts?');
    expect(panel.handleKey('y')).toEqual({ type: 'delete-shelf', shelf: 'Ideas' });
  });

  it('keeps the shelf when the answer is not y', () => {
    const panel = onIdeas();
    panel.handleKey('D');
    expect(panel.handleKey('n')).toEqual({ type: 'none' });
  });

  it('still deletes only the selected prompt with d on a shelf', () => {
    const panel = onIdeas([saved('1', 'Ideas')]);
    panel.handleKey('d');
    expect(panel.handleKey('y')).toMatchObject({ type: 'delete', prompt: { id: '1' } });
  });

  it('does nothing with D outside a shelf', () => {
    const panel = new ListPanel([], { cwd: '/test', hotkeyLabel: 'ctrl+f', shelves: ['Ideas'] });
    panel.handleKey('D');
    expect(panel.handleKey('y')).toEqual({ type: 'none' });
  });
});

describe('ListPanel shelf rename', () => {
  it('starts from the current name and returns the new one', () => {
    const panel = onIdeas();
    panel.handleKey('r');
    expect(panel.render(120, 10)).toContain('rename shelf: Ideas');
    panel.handleKey('\x7f'.repeat(5));
    panel.handleKey('Todo');
    expect(panel.handleKey('\r')).toEqual({ type: 'rename-shelf', shelf: 'Ideas', newName: 'Todo' });
  });

  it('does nothing when the name is unchanged or the rename is cancelled', () => {
    const panel = onIdeas();
    panel.handleKey('r');
    expect(panel.handleKey('\r')).toEqual({ type: 'none' });
    panel.handleKey('r');
    panel.handleKey('x');
    expect(panel.handleKey('\x1b')).toEqual({ type: 'none' });
  });

  it('shows r and D in the footer and the help on shelf tabs only', () => {
    const panel = onIdeas();
    expect(panel.render(160, 10)).toContain('delete shelf');
    panel.handleKey('?');
    const help = panel.render(160, 30);
    expect(help).toContain('rename this shelf');
    expect(help).toContain('delete this shelf and its prompts');
    const stash = new ListPanel([], { cwd: '/test', hotkeyLabel: 'ctrl+f', shelves: ['Ideas'] });
    expect(stash.render(160, 10)).not.toContain('delete shelf');
  });
});
