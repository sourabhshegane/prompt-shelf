import { StringDecoder } from 'node:string_decoder';
import type { KeyInterceptor } from './keys.js';

export class StdinPipeline {
  private readonly decoder = new StringDecoder('utf8');

  constructor(private readonly interceptor: KeyInterceptor) {}

  get hasPending(): boolean {
    return this.interceptor.hasPending;
  }

  feed(chunk: Buffer): { text: string; presses: number[] } {
    const { passthrough, presses } = this.interceptor.feed(chunk);
    return { text: this.decoder.write(passthrough), presses };
  }

  decodeOnly(chunk: Buffer): string {
    return this.decoder.write(chunk);
  }

  flush(): string {
    return this.decoder.write(this.interceptor.flush());
  }
}
