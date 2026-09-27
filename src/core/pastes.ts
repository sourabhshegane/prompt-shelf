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
  /**
   * Matches the placeholder; group 1 is its number or its character count, and an optional group 2
   * is the number of extra lines it says it hides. Must be global.
   */
  pattern: RegExp;
  /** `number`: Claude's `[Pasted text #3 +12 lines]`. `chars`: Codex's `[Pasted Content 1500 chars]`. */
  key: 'number' | 'chars';
}

const RECENT_PASTES = 50;
const charCount = (text: string) => [...text].length;
const lineBreaks = (text: string) => text.split('\n').length - 1;

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

  // Whether `text` can be the paste behind a placeholder that says it hides `extraLines` lines.
  private static fits(text: string, extraLines: string | undefined): boolean {
    return lineBreaks(text) === (extraLines === undefined ? 0 : Number(extraLines));
  }

  /**
   * Maps placeholder numbers on screen to the pastes that produced them. A short paste gets no
   * placeholder, so k numbers above the highest seen belong to the last k pastes, in order. If
   * the agent starts numbering again (a new session, /clear), a number already mapped to a paste
   * that doesn't fit its placeholder goes to the newest paste that does. Returns whether it
   * mapped anything.
   */
  learn(screenText: string, pastes: string[]): boolean {
    if (this.label.key !== 'number' || !pastes.length) return false;
    const labels = new Map<number, string | undefined>();
    for (const m of screenText.matchAll(this.label.pattern)) labels.set(Number(m[1]), m[2]);
    const fresh = [...labels.keys()].filter((n) => n > this.highest).sort((a, b) => a - b);
    let mapped = false;
    if (fresh.length) {
      const owners = pastes.slice(-fresh.length);
      fresh.slice(-owners.length).forEach((n, i) => this.byNumber.set(n, owners[i]!));
      this.highest = fresh[fresh.length - 1]!;
      mapped = true;
    }
    for (const [n, extra] of labels) {
      const known = this.byNumber.get(n);
      if (known !== undefined && PasteLabels.fits(known, extra)) continue;
      const owner = [...pastes].reverse().find((p) => PasteLabels.fits(p, extra));
      if (owner === undefined) continue;
      this.byNumber.set(n, owner);
      mapped = true;
    }
    return mapped;
  }

  /**
   * The text with every placeholder replaced, or null when one of them can't be matched to a paste
   * that fits it; never a wrong paste's text.
   */
  expand(text: string): string | null {
    const bySize = this.label.key === 'chars' ? this.sizeQueues(text) : null;
    let unknown = false;
    const out = text.replace(this.label.pattern, (whole, n: string, extra: string | undefined) => {
      const pasted = bySize ? bySize.get(Number(n))?.shift() : this.byNumber.get(Number(n));
      if (pasted === undefined || (!bySize && !PasteLabels.fits(pasted, extra))) unknown = true;
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

// A paste still waiting for its placeholder is dropped after this long (short pastes never get one).
const PENDING_MS = 5000;

/**
 * Follows pastes from the moment they're sent until the agent shows their placeholder. `check`
 * is called every so often while pastes are waiting; `expand` (on the stash key) always tries one
 * last match first and never drops a waiting paste before trying it.
 */
export class PasteTracker {
  private pending: { text: string; at: number }[] = [];

  constructor(
    private readonly labels: PasteLabels,
    private readonly screenText: () => string,
    private readonly now: () => number = Date.now,
  ) {}

  get waiting(): boolean {
    return this.pending.length > 0;
  }

  pasted(text: string): void {
    this.labels.remember(text);
    this.pending.push({ text, at: this.now() });
  }

  check(): void {
    this.match();
    const now = this.now();
    this.pending = this.pending.filter((p) => now - p.at < PENDING_MS);
  }

  expand(draft: string): string | null {
    this.match();
    return this.labels.expand(draft);
  }

  private match(): void {
    if (this.pending.length && this.labels.learn(this.screenText(), this.pending.map((p) => p.text))) this.pending = [];
  }
}
