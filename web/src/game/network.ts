// src/game/network.ts
// Multiplayer WebSocket Client with inbox polling for immediate integration into the game loop.

export type ClientToServer =
  | { type: "join"; roomCode: string; username: string; isHost: boolean }
  | {
      type: "input";
      keys: string[];
      mouse: { x: number; y: number };
      aim: number;
      fire: boolean;
      pos: { x: number; y: number };
      animCycle: number;
      weaponId: string;
      ammo: number;
      reserve: number;
      hp: number;
      maxHp: number;
      armor: number;
      dead: boolean;
    }
  | {
      type: "snapshot";
      players: any[];
      zombies: any[];
      bullets: any[];
      enemyBullets: any[];
      loots: any[];
      particles: any[];
      wave: number;
      waveState: string;
      waveTimer: number;
      timeOfDay: number;
      score: number;
    }
  | { type: "chat"; text: string };

export type ServerToClient =
  | { type: "player_joined"; username: string }
  | { type: "player_left"; username: string }
  | { type: "host_disconnected" }
  | {
      type: "input";
      username: string;
      keys: string[];
      mouse: { x: number; y: number };
      aim: number;
      fire: boolean;
      pos: { x: number; y: number };
      animCycle: number;
      weaponId: string;
      ammo: number;
      reserve: number;
      hp: number;
      maxHp: number;
      armor: number;
      dead: boolean;
    }
  | {
      type: "snapshot";
      players: any[];
      zombies: any[];
      bullets: any[];
      enemyBullets: any[];
      loots: any[];
      particles: any[];
      wave: number;
      waveState: string;
      waveTimer: number;
      timeOfDay: number;
      score: number;
    }
  | { type: "chat"; username: string; text: string };

export class Client {
  url: string;
  ws: WebSocket | null = null;
  inbox: ServerToClient[] = [];
  onStatus: (s: "connecting" | "open" | "closed" | "error") => void = () => {};

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    if (this.ws) return;
    this.onStatus("connecting");
    
    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        this.onStatus("open");
      };
      
      this.ws.onclose = () => {
        this.onStatus("closed");
        this.ws = null;
      };
      
      this.ws.onerror = () => {
        this.onStatus("error");
        this.ws = null;
      };
      
      this.ws.onmessage = (e) => {
        try {
          const m = JSON.parse(String(e.data)) as ServerToClient;
          this.inbox.push(m);
        } catch (err) {
          console.error("Failed to parse network message:", err);
        }
      };
    } catch (err) {
      console.error("Failed to construct WebSocket:", err);
      this.onStatus("closed");
      this.ws = null;
    }
  }

  poll(): ServerToClient[] {
    const msgs = this.inbox;
    this.inbox = [];
    return msgs;
  }

  send(msg: ClientToServer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
