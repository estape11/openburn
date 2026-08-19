/**
 * Device transport abstraction. TCP is the MVP implementation; USB serial,
 * WebSocket and Ruida-UDP plug in behind the same interface later — the GRBL
 * protocol layer must never know how bytes travel.
 */
import type { EventEmitter } from 'node:events';

export interface TransportEvents {
  /** Raw bytes from the device (chunking is arbitrary — no line semantics here). */
  data: [Buffer];
  /** The link is gone (peer closed, network dropped, or close() was called). */
  close: [];
  error: [Error];
}

export interface Transport extends EventEmitter<TransportEvents> {
  /** Establish the link. Rejects if it cannot. */
  connect(): Promise<void>;
  /** Queue bytes for the device. Throws if the link is not open. */
  write(data: string | Uint8Array): void;
  readonly isOpen: boolean;
  close(): Promise<void>;
}
