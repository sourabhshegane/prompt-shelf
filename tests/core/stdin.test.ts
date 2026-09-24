import { describe, it, expect } from 'vitest';
import { parseHotkey, KeyInterceptor } from '../../src/core/keys.js';
import { StdinPipeline } from '../../src/core/stdin.js';

const pipeline = () => new StdinPipeline(new KeyInterceptor(parseHotkey('ctrl+q')));

describe('StdinPipeline', () => {
  it('reassembles a multibyte character split across chunks', () => {
    const p = pipeline();
    const euro = Buffer.from('€');
    const first = p.feed(euro.subarray(0, 1));
    const second = p.feed(euro.subarray(1));
    expect(first.text).toBe('');
    expect(second.text).toBe('€');
  });

  it('keeps the hotkey presses and decodes around it', () => {
    const p = pipeline();
    const a = p.feed(Buffer.concat([Buffer.from('é').subarray(0, 1)]));
    const b = p.feed(Buffer.concat([Buffer.from('é').subarray(1), Buffer.from([0x11]), Buffer.from('x')]));
    expect(a).toEqual({ text: '', presses: [] });
    expect(b).toEqual({ text: 'éx', presses: [0] });
  });

  it('decodes flushed pending bytes with the same decoder', () => {
    const p = pipeline();
    p.feed(Buffer.from('ü').subarray(0, 1));
    expect(p.feed(Buffer.from('ü').subarray(1)).text).toBe('ü');
    p.feed(Buffer.from('\x1b'));
    expect(p.hasPending).toBe(true);
    expect(p.flush()).toBe('\x1b');
    expect(p.hasPending).toBe(false);
  });

  it('decodes overlay input with the same decoder and no interception', () => {
    const p = pipeline();
    const char = Buffer.from('ñ');
    expect(p.decodeOnly(char.subarray(0, 1))).toBe('');
    expect(p.decodeOnly(Buffer.concat([char.subarray(1), Buffer.from([0x11])]))).toBe('ñ\x11');
  });
});
