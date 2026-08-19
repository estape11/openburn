/**
 * TCP transport for network GRBL controllers (grblHAL/FluidNC/ESP3D "telnet").
 *
 * "Telnet" here means a RAW socket on port 23 — no IAC option negotiation, no
 * telnet library. TCP_NODELAY is on because the streaming protocol sends many
 * tiny writes and Nagle would batch them into stutter.
 *
 * Reconnection policy (deliberate): `connect()` retries with backoff, but a
 * link that DROPS after being established is reported via 'close' and never
 * silently re-dialed — after a mid-job disconnect the machine's position is
 * unknown and the only safe continuation is operator-driven (abort + re-home,
 * see #17). Silent reconnect is how other senders re-fire a lost laser.
 */
import { EventEmitter } from 'node:events';
import net from 'node:net';
import type { Transport, TransportEvents } from './transport.js';

export interface TcpTransportOptions {
  host: string;
  /** GRBL-over-network convention. */
  port?: number;
  /** Attempts for the initial dial (1 = no retry). */
  connectAttempts?: number;
  /** Base backoff between attempts; doubles each retry. */
  backoffMs?: number;
  /** Per-attempt dial timeout. */
  connectTimeoutMs?: number;
}

export class TcpTransport extends EventEmitter<TransportEvents> implements Transport {
  private socket: net.Socket | null = null;
  private readonly opts: Required<TcpTransportOptions>;

  constructor(options: TcpTransportOptions) {
    super();
    this.opts = {
      host: options.host,
      port: options.port ?? 23,
      connectAttempts: options.connectAttempts ?? 3,
      backoffMs: options.backoffMs ?? 500,
      connectTimeoutMs: options.connectTimeoutMs ?? 4000,
    };
  }

  get isOpen(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  async connect(): Promise<void> {
    let lastError: Error = new Error('connect() never attempted');
    for (let attempt = 0; attempt < this.opts.connectAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, this.opts.backoffMs * 2 ** (attempt - 1)));
      }
      try {
        await this.dial();
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw lastError;
  }

  private dial(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.connect({
        host: this.opts.host,
        port: this.opts.port,
        noDelay: true,
      });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection to ${this.opts.host}:${this.opts.port} timed out`));
      }, this.opts.connectTimeoutMs);

      socket.once('connect', () => {
        clearTimeout(timer);
        socket.setKeepAlive(true, 15_000);
        this.socket = socket;
        socket.on('data', (chunk) => this.emit('data', chunk));
        socket.on('error', (err) => this.emit('error', err));
        socket.on('close', () => {
          if (this.socket === socket) this.socket = null;
          this.emit('close');
        });
        resolve();
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        socket.destroy();
        reject(err);
      });
    });
  }

  write(data: string | Uint8Array): void {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('Transport is not open');
    }
    this.socket.write(data);
  }

  async close(): Promise<void> {
    const socket = this.socket;
    if (!socket || socket.destroyed) return;
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.destroy();
    });
  }
}
