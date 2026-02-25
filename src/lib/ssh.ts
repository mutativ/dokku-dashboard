import { Client } from "ssh2";
import type { DashboardEnv } from "../config.js";
import { auditLog } from "./audit.js";

export interface SshConfig {
  host: string;
  port: number;
  username: string;
  privateKey: Buffer;
  timeoutMs: number;
}

export function sshConfigFromEnv(env: DashboardEnv): SshConfig {
  if (!env.DOKKU_SSH_KEY) {
    throw new Error("DOKKU_SSH_KEY is not set — SSH commands will not work");
  }
  return {
    host: env.DOKKU_SSH_HOST,
    port: env.DOKKU_SSH_PORT,
    username: env.DOKKU_SSH_USER,
    privateKey: Buffer.from(env.DOKKU_SSH_KEY, "base64"),
    timeoutMs: env.SSH_COMMAND_TIMEOUT_MS,
  };
}

/** Shell-escape a single argument to prevent injection. */
export function shellEscape(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

// ── Command allowlist ──────────────────────────────────────────────────────

const ALLOWED_COMMANDS = new Set([
  "apps:list",
  "apps:create",
  "apps:destroy",
  "ps:report",
  "ps:start",
  "ps:stop",
  "ps:restart",
  "ps:rebuild",
  "ps:scale",
  "logs",
  "config:get",
  "config:show",
  "config:set",
  "config:unset",
  "domains:report",
  "domains:add",
  "domains:remove",
  "letsencrypt:enable",
  "letsencrypt:disable",
  "postgres:list",
  "postgres:create",
  "postgres:destroy",
  "postgres:info",
  "postgres:link",
  "postgres:unlink",
  "postgres:links",
  "postgres:connect",
  "resource:report",
  "resource:limit",
  "git:report",
]);

function assertAllowedCommand(args: string[]): void {
  const cmd = args[0];
  if (!cmd || !ALLOWED_COMMANDS.has(cmd)) {
    throw new Error(`Blocked command: ${cmd ?? "(empty)"}`);
  }
}

/**
 * Persistent SSH connection pool. Maintains a single long-lived connection
 * and reconnects automatically on failure.
 */
export class SshPool {
  private conn: Client | null = null;
  private ready = false;
  private connecting = false;
  private waiters: Array<{
    resolve: (conn: Client) => void;
    reject: (err: Error) => void;
  }> = [];

  constructor(private cfg: SshConfig) {}

  private connect(): Promise<Client> {
    if (this.conn && this.ready) return Promise.resolve(this.conn);

    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      if (this.connecting) return;
      this.connecting = true;

      const conn = new Client();

      conn.on("ready", () => {
        this.conn = conn;
        this.ready = true;
        this.connecting = false;
        const pending = this.waiters.splice(0);
        for (const w of pending) w.resolve(conn);
      });

      conn.on("error", (err) => {
        // Only reset state if this is still the active connection, to avoid
        // a stale connection's error handler corrupting a newly established one.
        if (this.conn === conn || this.connecting) {
          this.ready = false;
          this.conn = null;
          this.connecting = false;
        }
        const pending = this.waiters.splice(0);
        for (const w of pending) w.reject(err);
      });

      conn.on("close", () => {
        if (this.conn === conn) {
          this.ready = false;
          this.conn = null;
          this.connecting = false;
        }
      });

      conn.connect({
        host: this.cfg.host,
        port: this.cfg.port,
        username: this.cfg.username,
        privateKey: this.cfg.privateKey,
        keepaliveInterval: 15_000,
        keepaliveCountMax: 3,
      });
    });
  }

  /** Execute a command on the persistent connection. Reconnects if needed. */
  async exec(args: string[]): Promise<string> {
    assertAllowedCommand(args);
    const cmd = args.map(shellEscape).join(" ");
    const start = performance.now();
    let conn: Client;

    try {
      conn = await this.connect();
    } catch {
      // First connect failed, retry once
      conn = await this.connect();
    }

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          const err = new Error(`SSH command timed out after ${this.cfg.timeoutMs}ms: ${cmd}`);
          auditLog(args, "error", performance.now() - start, err.message);
          reject(err);
        }
      }, this.cfg.timeoutMs);

      conn.exec(cmd, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            // Connection may be stale — force reconnect next time
            if (this.conn === conn) {
              this.ready = false;
              this.conn.end();
              this.conn = null;
            }
            auditLog(args, "error", performance.now() - start, err.message);
            reject(err);
          }
          return;
        }

        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on("close", (code: number) => {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            if (code === 0) {
              auditLog(args, "ok", performance.now() - start);
              resolve(stdout);
            } else {
              const errMsg = `SSH command failed (exit ${code}): ${cmd}\n${stderr || stdout}`;
              auditLog(args, "error", performance.now() - start, errMsg);
              reject(new Error(errMsg));
            }
          }
        });
      });
    });
  }

  /** Execute a command with stdin data piped in. Uses the persistent connection. */
  async execWithStdin(args: string[], stdin: string): Promise<string> {
    assertAllowedCommand(args);
    const cmd = args.map(shellEscape).join(" ");
    const start = performance.now();
    let conn: Client;

    try {
      conn = await this.connect();
    } catch {
      conn = await this.connect();
    }

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          const err = new Error(`SSH command timed out after ${this.cfg.timeoutMs}ms: ${cmd}`);
          auditLog(args, "error", performance.now() - start, err.message);
          reject(err);
        }
      }, this.cfg.timeoutMs);

      conn.exec(cmd, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            if (this.conn === conn) {
              this.ready = false;
              this.conn.end();
              this.conn = null;
            }
            auditLog(args, "error", performance.now() - start, err.message);
            reject(err);
          }
          return;
        }

        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on("close", (code: number) => {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            if (code === 0) {
              auditLog(args, "ok", performance.now() - start);
              resolve(stdout);
            } else {
              const errMsg = `SQL error: ${stderr || stdout}`;
              auditLog(args, "error", performance.now() - start, errMsg);
              reject(new Error(errMsg));
            }
          }
        });

        // Write SQL to stdin and close it
        stream.write(stdin);
        stream.end();
      });
    });
  }

  /**
   * Execute a command with stdin on a fresh, dedicated connection.
   * Used for interactive commands like postgres:connect that cause Dokku's
   * sshcommand handler to close the underlying TCP connection after execution,
   * which would poison the shared persistent pool.
   */
  execOneshotWithStdin(args: string[], stdin: string): Promise<string> {
    assertAllowedCommand(args);
    const cmd = args.map(shellEscape).join(" ");
    const start = performance.now();

    return new Promise((resolve, reject) => {
      const conn = new Client();
      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          conn.end();
          const err = new Error(`SSH command timed out after ${this.cfg.timeoutMs}ms: ${cmd}`);
          auditLog(args, "error", performance.now() - start, err.message);
          reject(err);
        }
      }, this.cfg.timeoutMs);

      conn.on("ready", () => {
        conn.exec(cmd, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            if (!settled) {
              settled = true;
              conn.end();
              auditLog(args, "error", performance.now() - start, err.message);
              reject(err);
            }
            return;
          }

          stream.on("data", (data: Buffer) => { stdout += data.toString(); });
          stream.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

          stream.on("close", (code: number) => {
            clearTimeout(timer);
            conn.end();
            if (!settled) {
              settled = true;
              if (code === 0) {
                auditLog(args, "ok", performance.now() - start);
                resolve(stdout);
              } else {
                const errMsg = `SQL error: ${stderr || stdout}`;
                auditLog(args, "error", performance.now() - start, errMsg);
                reject(new Error(errMsg));
              }
            }
          });

          stream.write(stdin);
          stream.end();
        });
      });

      conn.on("error", (err) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          auditLog(args, "error", performance.now() - start, err.message);
          reject(err);
        }
      });

      conn.connect({
        host: this.cfg.host,
        port: this.cfg.port,
        username: this.cfg.username,
        privateKey: this.cfg.privateKey,
        keepaliveInterval: 0,
      });
    });
  }

  /** Stream a command. Uses a separate connection since streams are long-lived. */
  stream(
    args: string[],
    onData: (chunk: string) => void,
    onClose: (code: number) => void,
  ): { abort: () => void } {
    assertAllowedCommand(args);
    const cmd = args.map(shellEscape).join(" ");
    const start = performance.now();
    const conn = new Client();
    let aborted = false;

    conn.on("ready", () => {
      conn.exec(cmd, (err, stream) => {
        if (err) {
          auditLog(args, "error", performance.now() - start, err.message);
          onClose(1);
          conn.end();
          return;
        }

        auditLog(args, "ok", performance.now() - start);

        stream.on("data", (data: Buffer) => {
          if (!aborted) onData(data.toString());
        });

        stream.stderr.on("data", (data: Buffer) => {
          if (!aborted) onData(data.toString());
        });

        stream.on("close", (code: number) => {
          if (!aborted) onClose(code);
          conn.end();
        });
      });
    });

    conn.on("error", () => {
      auditLog(args, "error", performance.now() - start, "connection error");
      if (!aborted) onClose(1);
    });

    conn.connect({
      host: this.cfg.host,
      port: this.cfg.port,
      username: this.cfg.username,
      privateKey: this.cfg.privateKey,
    });

    return {
      abort() {
        aborted = true;
        conn.end();
      },
    };
  }
}
