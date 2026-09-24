const PASTE_START = Buffer.from('\x1b[200~');
const PASTE_END = Buffer.from('\x1b[201~');

const FUNCTION_KEYS: Record<string, string[]> = {
  f1: ['\x1bOP', '\x1b[11~'],
  f2: ['\x1bOQ', '\x1b[12~'],
  f3: ['\x1bOR', '\x1b[13~'],
  f4: ['\x1bOS', '\x1b[14~'],
  f5: ['\x1b[15~'],
  f6: ['\x1b[17~'],
  f7: ['\x1b[18~'],
  f8: ['\x1b[19~'],
  f9: ['\x1b[20~'],
  f10: ['\x1b[21~'],
  f11: ['\x1b[23~'],
  f12: ['\x1b[24~'],
};

export interface Hotkey {
  label: string;
  sequences: Buffer[];
}

export function parseHotkey(spec: string): Hotkey {
  const label = spec.trim().toLowerCase();
  const ctrl = /^ctrl\+([a-z])$/.exec(label);
  if (ctrl) {
    const letter = ctrl[1]!;
    return {
      label,
      sequences: [Buffer.from([letter.toUpperCase().charCodeAt(0) - 64]), Buffer.from(`\x1b[${letter.charCodeAt(0)};5u`)],
    };
  }
  const fkey = FUNCTION_KEYS[label];
  if (fkey) return { label, sequences: fkey.map((s) => Buffer.from(s, 'latin1')) };
  throw new Error(`Unsupported hotkey "${spec}". Use ctrl+<letter> or f1..f12.`);
}

/** Strips any of the given hotkeys from input; each press reports the index of the hotkey that fired. */
export class KeyInterceptor {
  private inPaste = false;
  private pending = Buffer.alloc(0);
  private readonly escaped: Buffer[];
  private readonly owner = new Map<Buffer, number>();
  private readonly singles = new Map<number, number>();

  constructor(hotkeys: Hotkey | Hotkey[]) {
    const list = Array.isArray(hotkeys) ? hotkeys : [hotkeys];
    list.forEach((hotkey, index) => {
      for (const seq of hotkey.sequences) {
        if (seq.length === 1) this.singles.set(seq[0]!, index);
        else this.owner.set(seq, index);
      }
    });
    this.escaped = [...this.owner.keys()].filter((s) => s[0] === 0x1b);
  }

  get hasPending(): boolean {
    return this.pending.length > 0;
  }

  flush(): Buffer {
    const out = this.pending;
    this.pending = Buffer.alloc(0);
    return out;
  }

  feed(chunk: Buffer): { passthrough: Buffer; presses: number[] } {
    const data = Buffer.concat([this.pending, chunk]);
    this.pending = Buffer.alloc(0);
    const out: number[] = [];
    const presses: number[] = [];
    let i = 0;
    while (i < data.length) {
      if (data[i] === 0x1b) {
        const marker = this.matchPrefix(data, i, [PASTE_START, PASTE_END, ...this.escaped]);
        if (marker === 'partial') {
          this.pending = data.subarray(i);
          break;
        }
        if (marker === PASTE_START || marker === PASTE_END) {
          this.inPaste = marker === PASTE_START;
          for (let j = 0; j < marker.length; j++) out.push(data[i + j]!);
          i += marker.length;
          continue;
        }
        if (marker && !this.inPaste) {
          presses.push(this.owner.get(marker)!);
          i += marker.length;
          continue;
        }
      }
      const single = this.inPaste ? undefined : this.singles.get(data[i]!);
      if (single !== undefined) {
        presses.push(single);
        i++;
        continue;
      }
      out.push(data[i]!);
      i++;
    }
    return { passthrough: Buffer.from(out), presses };
  }

  private matchPrefix(data: Buffer, at: number, candidates: Buffer[]): Buffer | 'partial' | null {
    for (const marker of candidates) {
      const avail = data.subarray(at, at + marker.length);
      if (avail.equals(marker)) return marker;
      if (avail.length < marker.length && marker.subarray(0, avail.length).equals(avail)) return 'partial';
    }
    return null;
  }
}
