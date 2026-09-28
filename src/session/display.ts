import type { AgentAdapter } from '../adapters/index.js';
import { ansi, theme } from '../terminal/ansi.js';
import type { Screen } from '../terminal/screen.js';
import { fitLine } from '../terminal/text.js';
import { panelPlacement, toastRow, type InputAnchor, type PanelPlacement } from '../ui/layout.js';
import type { Panel, Status } from '../ui/types.js';

const TOAST_MS = 3000;
// The agent redraws after its input box grows or shrinks, which can paint over a toast, so the
// toast is drawn again once the agent's output has been quiet this long.
const TOAST_REDRAW_MS = 80;

/** Where the display writes: the real terminal, or a fake in tests. */
export interface Output {
  write(data: string): void;
  readonly columns?: number;
  readonly rows?: number;
}

/**
 * Everything drawn on the real terminal: the agent's own output, the open panel (just above the
 * agent's input box) and short messages. While a panel is shown the agent's output is held back,
 * then the agent's screen is repainted from the mirror when the panel closes.
 */
export class Display {
  private shown: { panel: Panel<unknown>; height: number | undefined } | null = null;
  private placement: PanelPlacement | null = null;
  private toastBar: string | null = null;
  private toastTimer: NodeJS.Timeout | null = null;
  private toastRedraw: NodeJS.Timeout | null = null;

  constructor(
    private readonly out: Output,
    private readonly screen: Screen,
    private readonly adapter: Pick<AgentAdapter, 'inputTop' | 'isBorder'>,
  ) {}

  get cols(): number {
    return this.out.columns || 80;
  }

  get rows(): number {
    return this.out.rows || 24;
  }

  get panelShown(): boolean {
    return this.shown !== null;
  }

  /** The agent's output: passed straight through unless a panel covers the screen. */
  agentOutput(data: string): void {
    if (this.shown) return;
    this.out.write(data);
    if (this.toastBar) {
      if (this.toastRedraw) clearTimeout(this.toastRedraw);
      this.toastRedraw = setTimeout(() => this.drawToast(), TOAST_REDRAW_MS);
    }
  }

  /** Shows `panel` above the input box; `height` defaults to the full panel height. */
  show(panel: Panel<unknown>, height?: number): void {
    this.shown = { panel, height };
    this.redraw();
  }

  hide(): void {
    this.shown = null;
    this.placement = null;
    this.repaintAgent();
  }

  /** Draws the shown panel again, with `status` in place of its key hints. */
  redraw(status?: Status): void {
    if (!this.shown) return;
    this.clearToast();
    const next = panelPlacement(this.inputAnchor(), this.shown.height);
    if (this.placement && (this.placement.top !== next.top || this.placement.height !== next.height)) this.repaintAgent();
    this.placement = next;
    const frame = this.shown.panel.render(this.cols, next.height, status).split('\r\n');
    this.out.write(ansi.hideCursor + frame.map((line, i) => ansi.moveTo(next.top + i, 0) + line).join(''));
  }

  /** A short message: in the panel's footer when one is shown, otherwise in a bar above the input box. */
  toast(status: Status): void {
    this.clearToast();
    if (this.shown) {
      this.redraw(status);
      this.toastTimer = setTimeout(() => this.redraw(), TOAST_MS);
      return;
    }
    this.toastBar = ansi.reverse + (status.error ? theme.error : '') + fitLine(` ${status.text} `, this.cols) + ansi.reset;
    this.drawToast();
    this.toastTimer = setTimeout(() => {
      this.toastBar = null;
      this.repaintAgent();
    }, TOAST_MS);
  }

  dispose(): void {
    this.clearToast();
    if (this.shown) this.hide();
  }

  private repaintAgent(): void {
    this.out.write(ansi.clearScreen + ansi.home + this.screen.serialize() + ansi.showCursor);
  }

  private drawToast(): void {
    if (!this.toastBar || this.shown) return;
    this.out.write('\x1b7' + ansi.moveTo(toastRow(this.inputAnchor()), 0) + this.toastBar + '\x1b8');
  }

  private clearToast(): void {
    for (const timer of [this.toastTimer, this.toastRedraw]) if (timer) clearTimeout(timer);
    this.toastTimer = null;
    this.toastRedraw = null;
    this.toastBar = null;
  }

  private inputAnchor(): InputAnchor {
    const lines = this.screen.lines();
    const inputTop = this.adapter.inputTop(lines);
    const hasBorderAbove = inputTop !== null && inputTop > 0 && this.adapter.isBorder(lines[inputTop - 1] ?? '');
    return { rows: this.rows, inputTop, hasBorderAbove };
  }
}
