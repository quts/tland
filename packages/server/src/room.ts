import { randomUUID } from 'node:crypto';
import type { ServerMessage } from '@tland/shared';

/** A single connected socket. Kept transport-agnostic so it is easy to test. */
export interface Connection {
  readonly id: string;
  send(message: ServerMessage): void;
  close(): void;
}

/**
 * The one shared room. State lives in memory only: restarting the server
 * empties the world, which is intentional for this project.
 */
export class Room {
  private readonly connections = new Map<string, Connection>();
  private readonly maxPlayers: number;
  private currentTick = 0;

  // Written out rather than as a parameter property: Node's type-stripping
  // dev runner does not support those.
  constructor(maxPlayers: number) {
    this.maxPlayers = maxPlayers;
  }

  get tick(): number {
    return this.currentTick;
  }

  get size(): number {
    return this.connections.size;
  }

  get isFull(): boolean {
    return this.connections.size >= this.maxPlayers;
  }

  static newId(): string {
    return randomUUID();
  }

  add(connection: Connection): void {
    this.connections.set(connection.id, connection);
  }

  remove(id: string): void {
    this.connections.delete(id);
  }

  advanceTick(): void {
    this.currentTick += 1;
  }

  /** Send to everyone, optionally skipping one connection. */
  broadcast(message: ServerMessage, exceptId?: string): void {
    for (const connection of this.connections.values()) {
      if (connection.id === exceptId) continue;
      connection.send(message);
    }
  }
}
