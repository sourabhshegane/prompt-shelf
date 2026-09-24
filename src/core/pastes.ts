const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

/** Collects the bracketed pastes in the text forwarded to the agent. */
export class PasteRecorder {
  private buffer: string | null = null;

  feed(text: string): string[] {
    const done: string[] = [];
    let rest = text;
    while (rest) {
      if (this.buffer === null) {
        const start = rest.indexOf(PASTE_START);
        if (start < 0) break;
        this.buffer = '';
        rest = rest.slice(start + PASTE_START.length);
        continue;
      }
      const end = rest.indexOf(PASTE_END);
      if (end < 0) {
        this.buffer += rest;
        break;
      }
      done.push((this.buffer + rest.slice(0, end)).replace(/\r\n?/g, '\n'));
      this.buffer = null;
      rest = rest.slice(end + PASTE_END.length);
    }
    return done;
  }
}

export interface PasteLabel {
  /** Matches the placeholder; group 1 is its number or its character count. Must be global. */
  pattern: RegExp;
  /** `number`: Claude's `[Pasted text #3 +12 lines]`. `chars`: Codex's `[Pasted Content 1500 chars]`. */
  key: 'number' | 'chars';
}

const RECENT_PASTES = 50;
const charCount = (text: string) => [...text].length;

/** Works out which pasted text each collapsed-paste placeholder in the input box stands for. */
export class PasteLabels {
  private readonly byNumber = new Map<number, string>();
  private highest = 0;
  private readonly recent: string[] = [];

  constructor(private readonly label: PasteLabel) {}

  remember(pasted: string): void {
    this.recent.push(pasted);
    if (this.recent.length > RECENT_PASTES) this.recent.shift();
  }

  /**
   * Maps placeholder numbers that are new on screen to the pastes that produced them. Numbers
   * only ever grow and a short paste gets no placeholder at all, so k new numbers belong to the
   * last k pastes, in order. Returns whether any new number was found.
   */
  learn(screenText: string, pastes: string[]): boolean {
    if (this.label.key !== 'number') return false;
    const fresh = [...new Set([...screenText.matchAll(this.label.pattern)].map((m) => Number(m[1])))]
      .filter((n) => n > this.highest)
      .sort((a, b) => a - b);
    if (!fresh.length || !pastes.length) return false;
    const owners = pastes.slice(-fresh.length);
    fresh.slice(-owners.length).forEach((n, i) => this.byNumber.set(n, owners[i]!));
    this.highest = fresh[fresh.length - 1]!;
    return true;
  }

  /** The text with every placeholder replaced, or null when one of them can't be matched to a paste. */
  expand(text: string): string | null {
    const bySize = this.label.key === 'chars' ? this.sizeQueues(text) : null;
    let unknown = false;
    const out = text.replace(this.label.pattern, (whole, n: string) => {
      const pasted = bySize ? bySize.get(Number(n))?.shift() : this.byNumber.get(Number(n));
      if (pasted === undefined) unknown = true;
      return pasted ?? whole;
    });
    return unknown ? null : out;
  }

  // For k placeholders of one size, the last k pastes of that size, oldest first: the box
  // lists pastes in the order they were made.
  private sizeQueues(text: string): Map<number, string[]> {
    const wanted = new Map<number, number>();
    for (const match of text.matchAll(this.label.pattern)) wanted.set(Number(match[1]), (wanted.get(Number(match[1])) ?? 0) + 1);
    const queues = new Map<number, string[]>();
    for (const [size, count] of wanted) queues.set(size, this.recent.filter((p) => charCount(p) === size).slice(-count));
    return queues;
  }
}
