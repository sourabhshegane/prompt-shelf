export interface Writable {
  write(data: string): void;
}

const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

const yieldTick = () => new Promise<void>((r) => setTimeout(r, 0));

export async function injectPaste(target: Writable, text: string, chunkSize = 512): Promise<void> {
  const body = text.replace(/\r?\n/g, '\r');
  target.write(PASTE_START);
  for (let i = 0; i < body.length; i += chunkSize) {
    target.write(body.slice(i, i + chunkSize));
    await yieldTick();
  }
  target.write(PASTE_END);
}
