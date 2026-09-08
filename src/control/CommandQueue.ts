import type { CommandKind } from './RobotController';

type Item = { payload: string; kind: CommandKind };
/** One BLE write at a time. Latest motor sample wins; STOP discards stale commands. */
export class CommandQueue {
  private items: Item[] = [];
  private writing = false;
  private closed = false;
  private waiters: (() => void)[] = [];
  constructor(private write: (payload: string) => Promise<void>, private onError: (error: unknown) => void) {}

  send(payload: string, kind: CommandKind) {
    if (this.closed) return;
    if (kind === 'stop') this.items = [];
    if (kind === 'motor') this.items = this.items.filter(i => i.kind !== 'motor');
    const item = { payload, kind };
    if (kind === 'stop') this.items.unshift(item);
    else if (this.items.length < 8) this.items.push(item);
    void this.drain();
  }

  whenIdle(): Promise<void> {
    if ((!this.writing && !this.items.length) || this.closed) return Promise.resolve();
    return new Promise(resolve => this.waiters.push(resolve));
  }
  private resolveIdle() { this.waiters.splice(0).forEach(resolve => resolve()); }
  close() { this.closed = true; this.items = []; this.resolveIdle(); }

  private async drain() {
    if (this.writing || this.closed) return;
    this.writing = true;
    try {
      while (this.items.length && !this.closed) {
        const item = this.items.shift()!;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            this.write(item.payload),
            new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('BLE write timed out')), 300); }),
          ]);
        } finally { clearTimeout(timeout); }
      }
    } catch (error) {
      this.close();
      this.onError(error);
    } finally { this.writing = false; this.resolveIdle(); }
  }
}
