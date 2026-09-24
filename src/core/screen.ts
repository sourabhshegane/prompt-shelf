import xterm, { type Terminal as TerminalType } from '@xterm/headless';
import serialize from '@xterm/addon-serialize';

const { Terminal } = xterm;
const { SerializeAddon } = serialize;

export interface Cursor {
  x: number;
  y: number;
}

export class Screen {
  private readonly term: TerminalType;
  private readonly serializer = new SerializeAddon();

  constructor(cols: number, rows: number) {
    this.term = new Terminal({ cols, rows, allowProposedApi: true, scrollback: 0 });
    this.term.loadAddon(this.serializer);
  }

  write(data: string | Buffer): Promise<void> {
    return new Promise((resolve) => this.term.write(typeof data === 'string' ? data : new Uint8Array(data), resolve));
  }

  resize(cols: number, rows: number): void {
    this.term.resize(cols, rows);
  }

  // dropDim blanks faint (SGR 2) cells, e.g. an agent's placeholder text in an empty input box.
  lines(opts: { dropDim?: boolean } = {}): string[] {
    const buf = this.term.buffer.active;
    const out: string[] = [];
    for (let i = 0; i < this.term.rows; i++) {
      const line = buf.getLine(buf.viewportY + i);
      if (!line) {
        out.push('');
      } else if (!opts.dropDim) {
        out.push(line.translateToString(true));
      } else {
        let text = '';
        for (let x = 0; x < line.length; x++) {
          const cell = line.getCell(x);
          if (!cell || cell.getWidth() === 0) continue;
          text += cell.isDim() ? ' '.repeat(cell.getWidth()) : cell.getChars() || ' ';
        }
        out.push(text.trimEnd());
      }
    }
    return out;
  }

  cursor(): Cursor {
    const buf = this.term.buffer.active;
    return { x: buf.cursorX, y: buf.cursorY };
  }

  serialize(): string {
    return this.serializer.serialize();
  }

  get cols(): number {
    return this.term.cols;
  }

  get rows(): number {
    return this.term.rows;
  }
}
