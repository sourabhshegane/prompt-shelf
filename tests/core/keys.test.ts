import { describe, it, expect } from 'vitest';
import { parseHotkey, KeyInterceptor } from '../../src/core/keys.js';

const sequences = (spec: string) => parseHotkey(spec).sequences.map((b) => b.toString('latin1'));

describe('parseHotkey', () => {
  it('maps ctrl+letter to the control byte and the CSI-u form', () => {
    expect(sequences('ctrl+q')).toEqual(['\x11', '\x1b[113;5u']);
    expect(sequences('Ctrl+A')).toEqual(['\x01', '\x1b[97;5u']);
    expect(parseHotkey('Ctrl+A').label).toBe('ctrl+a');
  });
  it('maps function keys to their SS3 and CSI forms', () => {
    expect(sequences('f2')).toContain('\x1bOQ');
    expect(sequences('f2')).toContain('\x1b[12~');
    expect(sequences('F5')).toEqual(['\x1b[15~']);
    expect(sequences('f12')).toEqual(['\x1b[24~']);
    expect(parseHotkey('F5').label).toBe('f5');
  });
  it('rejects unsupported specs', () => {
    expect(() => parseHotkey('alt+q')).toThrow(/unsupported hotkey/i);
    expect(() => parseHotkey('ctrl+1')).toThrow(/unsupported hotkey/i);
    expect(() => parseHotkey('f13')).toThrow(/unsupported hotkey/i);
    expect(() => parseHotkey('f0')).toThrow(/unsupported hotkey/i);
  });
});

describe('KeyInterceptor', () => {
  const ki = () => new KeyInterceptor(parseHotkey('ctrl+q'));

  it('strips the kitty-protocol CSI-u encoding too', () => {
    const out = ki().feed(Buffer.from('a\x1b[113;5ub'));
    expect(out.passthrough.toString()).toBe('ab');
    expect(out.presses).toEqual([0]);
  });

  it('does not strip a different CSI-u key', () => {
    const out = ki().feed(Buffer.from('\x1b[27u'));
    expect(out.passthrough.toString()).toBe('\x1b[27u');
    expect(out.presses).toEqual([]);
  });

  it('passes ordinary bytes through untouched', () => {
    const out = ki().feed(Buffer.from('hello\r'));
    expect(out.passthrough.toString()).toBe('hello\r');
    expect(out.presses).toEqual([]);
  });

  it('strips the hotkey and counts it', () => {
    const out = ki().feed(Buffer.from([0x61, 0x11, 0x62]));
    expect(out.passthrough.toString()).toBe('ab');
    expect(out.presses).toEqual([0]);
  });

  it('does not intercept inside a bracketed paste, even across chunks', () => {
    const k = ki();
    const first = k.feed(Buffer.concat([Buffer.from('\x1b[200~x'), Buffer.from([0x11])]));
    expect(first.presses).toEqual([]);
    expect(first.passthrough).toEqual(Buffer.concat([Buffer.from('\x1b[200~x'), Buffer.from([0x11])]));
    const second = k.feed(Buffer.concat([Buffer.from([0x11]), Buffer.from('\x1b[201~'), Buffer.from([0x11])]));
    expect(second.presses).toEqual([0]);
    expect(second.passthrough).toEqual(Buffer.concat([Buffer.from([0x11]), Buffer.from('\x1b[201~')]));
  });

  it('passes through a split escape sequence intact', () => {
    const k = ki();
    const a = k.feed(Buffer.from('\x1b[2'));
    const b = k.feed(Buffer.from('00~'));
    expect(Buffer.concat([a.passthrough, b.passthrough]).toString()).toBe('\x1b[200~');
    const c = k.feed(Buffer.from([0x11]));
    expect(c.presses).toEqual([]);
  });

  it('holds a lone ESC as pending and releases it on flush', () => {
    const k = ki();
    const out = k.feed(Buffer.from('\x1b'));
    expect(out.passthrough.length).toBe(0);
    expect(k.hasPending).toBe(true);
    expect([...k.flush()]).toEqual([0x1b]);
    expect(k.hasPending).toBe(false);
    expect(k.flush().length).toBe(0);
  });

  it('strips a function-key hotkey and counts one press', () => {
    const out = new KeyInterceptor(parseHotkey('f2')).feed(Buffer.from('a\x1bOQb'));
    expect(out.passthrough.toString()).toBe('ab');
    expect(out.presses).toEqual([0]);
  });

  it('passes a different function key through untouched', () => {
    const out = new KeyInterceptor(parseHotkey('f2')).feed(Buffer.from('\x1bOP'));
    expect(out.passthrough.toString()).toBe('\x1bOP');
    expect(out.presses).toEqual([]);
  });

  it('matches a function-key hotkey split across chunks', () => {
    const k = new KeyInterceptor(parseHotkey('f5'));
    expect(k.feed(Buffer.from('\x1b[1')).passthrough.length).toBe(0);
    const out = k.feed(Buffer.from('5~'));
    expect(out.presses).toEqual([0]);
    expect(out.passthrough.length).toBe(0);
  });

  it('a lone ESC followed later by a normal key is delivered in order', () => {
    const k = ki();
    k.feed(Buffer.from('\x1b'));
    const out = k.feed(Buffer.from('x'));
    expect(out.passthrough.toString()).toBe('\x1bx');
    expect(out.presses).toEqual([]);
  });

  it('tells two hotkeys apart and reports presses in order', () => {
    const k = new KeyInterceptor([parseHotkey('ctrl+f'), parseHotkey('ctrl+q')]);
    const out = k.feed(Buffer.from('a\x11b\x06\x1b[113;5uc'));
    expect(out.passthrough.toString()).toBe('abc');
    expect(out.presses).toEqual([1, 0, 1]);
  });
});
