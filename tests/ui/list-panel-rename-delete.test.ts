import { describe, it, expect } from 'vitest';
import { ListPanel } from '../../src/ui/list-panel.js';

describe('ListPanel rename and delete shelf features', () => {
  it('returns delete-shelf action when d and y are pressed on a shelf tab', () => {
    const panel = new ListPanel([], { cwd: '/test', hotkeyLabel: 'cmd+s', shelves: ['Ideas', 'Work'] });
    // Navigate: Stash -> Skills -> Ideas
    panel.handleKey('\x1b[C'); // Right arrow to Skills
    panel.handleKey('\x1b[C'); // Right arrow to Ideas shelf
    const confirmAction = panel.handleKey('d'); // Show confirmation
    expect(confirmAction.type).toBe('none'); // Just enters confirm mode
    const deleteAction = panel.handleKey('y'); // Confirm deletion
    expect(deleteAction.type).toBe('delete-shelf');
    expect((deleteAction as any).shelf).toBe('Ideas');
  });

  it('returns rename-shelf action when r is pressed and name is confirmed', () => {
    const panel = new ListPanel([], { cwd: '/test', hotkeyLabel: 'cmd+s', shelves: ['Ideas'] });
    // Navigate: Stash -> Skills -> Ideas
    panel.handleKey('\x1b[C'); // Right arrow to Skills
    panel.handleKey('\x1b[C'); // Right arrow to Ideas shelf
    panel.handleKey('r'); // Start rename
    // Clear the field and type new name
    const backspaces = '\x7f'.repeat(5); // Backspace 5 times to clear "Ideas"
    panel.handleKey(backspaces);
    panel.handleKey('Todo');
    const action = panel.handleKey('\r'); // Enter to confirm
    expect(action.type).toBe('rename-shelf');
    expect((action as any).shelf).toBe('Ideas');
    expect((action as any).newName).toBe('Todo');
  });

  it('cancels shelf deletion when n is pressed', () => {
    const panel = new ListPanel([], { cwd: '/test', hotkeyLabel: 'cmd+s', shelves: ['Ideas'] });
    // Navigate: Stash -> Skills -> Ideas
    panel.handleKey('\x1b[C'); // Right arrow to Skills
    panel.handleKey('\x1b[C'); // Right arrow to Ideas shelf
    panel.handleKey('d'); // Show confirmation
    const action = panel.handleKey('n'); // Cancel deletion
    expect(action.type).toBe('none');
  });

  it('does not rename if name is same as original', () => {
    const panel = new ListPanel([], { cwd: '/test', hotkeyLabel: 'cmd+s', shelves: ['Ideas'] });
    // Navigate: Stash -> Skills -> Ideas
    panel.handleKey('\x1b[C'); // Right arrow to Skills
    panel.handleKey('\x1b[C'); // Right arrow to Ideas shelf
    panel.handleKey('r'); // Start rename
    const action = panel.handleKey('\r'); // Enter without changing
    expect(action.type).toBe('none');
  });

  it('renders help with rename and delete options for shelf tabs', () => {
    const panel = new ListPanel([], { cwd: '/test', hotkeyLabel: 'cmd+s', shelves: ['Ideas'] });
    // Navigate: Stash -> Skills -> Ideas
    panel.handleKey('\x1b[C'); // Right arrow to Skills
    panel.handleKey('\x1b[C'); // Right arrow to Ideas shelf
    panel.handleKey('?'); // Show help
    const helpOutput = panel.render(120, 30);
    expect(helpOutput).toContain('rename this shelf');
    expect(helpOutput).toContain('delete this shelf');
  });
});
