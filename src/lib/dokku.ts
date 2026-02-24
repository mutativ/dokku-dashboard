import type { SshConfig } from "./ssh.js";
import { SshPool } from "./ssh.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AppInfo {
  name: string;
  status: string; // "running", "stopped", "missing"
  deployed: boolean;
  processCount: number;
  processTypes: string[];
  processTypeCounts: Record<string, number>;
  domains: string[];
}

export interface GitReport {
  deployBranch: string;
  sourceHash: string;
  lastUpdatedAt: string;
}

export interface AppMeta {
  psReport: Record<string, string>;
  gitReport: GitReport | null;
  gitRev: string;
  appType: string;
  githubRepo: string;
  processes: Array<{ name: string; type: string; status: string }>;
}

export interface AppProcessInfo {
  type: string;
  count: number;
}

export interface DatabaseInfo {
  name: string;
  links: string[];
}

export interface DatabaseConnectionInfo {
  dsn: string;
  host: string;
  port: string;
  name: string;
  user: string;
  password: string;
}

export interface ResourceLimit {
  type: string;
  memory: string;
  cpu: string;
}

// ── Cache helper ────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const CACHE_TTL_MS = 120_000; // 2 minutes

// ── Client ─────────────────────────────────────────────────────────────────

export class DokkuClient {
  private cache = new Map<string, CacheEntry<unknown>>();
  private pool: SshPool;

  constructor(private cfg: SshConfig) {
    this.pool = new SshPool(cfg);
  }

  private exec(args: string[]): Promise<string> {
    return this.pool.exec(args);
  }

  /** Pre-warm the SSH connection and apps cache. */
  async warmup(): Promise<void> {
    try {
      await this.appsList();
      console.log("SSH connection warmed up, apps cache populated");
    } catch (err) {
      console.error("Warmup failed:", err instanceof Error ? err.message : err);
    }
  }

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (entry && Date.now() < entry.expires) return entry.data as T;
    this.cache.delete(key);
    return undefined;
  }

  private setCache<T>(key: string, data: T): T {
    this.cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
    return data;
  }

  invalidateCache(prefix?: string) {
    if (!prefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  // ── Apps ────────────────────────────────────────────────────────────────

  async appsList(): Promise<AppInfo[]> {
    const cached = this.getCached<AppInfo[]>("apps:list");
    if (cached) return cached;

    // Single SSH call to get all app statuses at once
    const out = await this.exec(["ps:report"]);
    const apps: AppInfo[] = [];
    const blocks = out.split(/(?======>\s)/);

    for (const block of blocks) {
      const headerMatch = block.match(/=====> (\S+) ps information/);
      if (!headerMatch) continue;
      const name = headerMatch[1];
      let status = "unknown";
      let deployed = false;

      if (/Running:\s+true/i.test(block)) {
        status = "running";
        deployed = true;
      } else if (/Running:\s+false/i.test(block) && /Deployed:\s+true/i.test(block)) {
        status = "stopped";
        deployed = true;
      } else if (/Deployed:\s+true/i.test(block)) {
        status = "deployed";
        deployed = true;
      } else {
        status = "not deployed";
      }

      // Extract process info from status lines like "Status web 1" or "Status web.1"
      const processTypeCounts: Record<string, number> = {};
      let processCount = 0;
      const statusMatches = block.matchAll(/Status\s+(\w+)[.\s]+\d+/g);
      for (const m of statusMatches) {
        processTypeCounts[m[1]] = (processTypeCounts[m[1]] ?? 0) + 1;
        processCount++;
      }

      apps.push({ name, status, deployed, processCount, processTypes: Object.keys(processTypeCounts), processTypeCounts, domains: [] });
    }

    // Fetch all domains in a single SSH call to avoid channel exhaustion
    try {
      const domainsMap = await this.domainsReportAll();
      for (const app of apps) {
        app.domains = domainsMap.get(app.name) ?? [];
      }
    } catch {
      // leave domains empty if batch call fails
    }

    return this.setCache("apps:list", apps);
  }

  async appsListNames(): Promise<string[]> {
    const out = await this.exec(["apps:list"]);
    return out
      .trim()
      .split("\n")
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean);
  }

  async appsCreate(name: string): Promise<string> {
    const out = await this.exec(["apps:create", name]);
    this.invalidateCache("apps:");
    return out;
  }

  async appsDestroy(name: string): Promise<string> {
    const out = await this.exec(["apps:destroy", name, "--force"]);
    this.invalidateCache("apps:");
    return out;
  }

  async appsReport(name: string): Promise<string> {
    return this.exec(["ps:report", name]);
  }

  // ── Process management ─────────────────────────────────────────────────

  async psStart(name: string): Promise<string> {
    const out = await this.exec(["ps:start", name]);
    this.invalidateCache("apps:");
    return out;
  }

  async psStop(name: string): Promise<string> {
    const out = await this.exec(["ps:stop", name]);
    this.invalidateCache("apps:");
    return out;
  }

  async psRestart(name: string): Promise<string> {
    const out = await this.exec(["ps:restart", name]);
    this.invalidateCache("apps:");
    return out;
  }

  async psRebuild(name: string): Promise<string> {
    const out = await this.exec(["ps:rebuild", name]);
    this.invalidateCache("apps:");
    return out;
  }

  async psScale(
    name: string,
    scaling?: Record<string, number>,
  ): Promise<string> {
    if (!scaling) {
      return this.exec(["ps:scale", name]);
    }
    const args = ["ps:scale", name];
    for (const [type, count] of Object.entries(scaling)) {
      args.push(`${type}=${count}`);
    }
    return this.exec(args);
  }

  // ── Logs ───────────────────────────────────────────────────────────────

  streamLogs(
    name: string,
    onData: (chunk: string) => void,
    onClose: (code: number) => void,
  ): { abort: () => void } {
    return this.pool.stream(["logs", name, "--tail", "--num", "100"], onData, onClose);
  }

  async getLogs(name: string, num = 100): Promise<string> {
    return this.exec(["logs", name, "--num", String(num)]);
  }

  // ── Config (env vars) ──────────────────────────────────────────────────

  async configShow(name: string): Promise<Record<string, string>> {
    const out = await this.exec(["config:show", name]);
    const vars: Record<string, string> = {};
    for (const line of out.trim().split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) {
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        if (key && !key.startsWith("====")) {
          vars[key] = val;
        }
      }
    }
    return vars;
  }

  async configSet(
    name: string,
    vars: Record<string, string>,
    noRestart = false,
  ): Promise<string> {
    const args = ["config:set"];
    if (noRestart) args.push("--no-restart");
    args.push(name);
    for (const [k, v] of Object.entries(vars)) {
      args.push(`${k}=${v}`);
    }
    return this.exec(args);
  }

  async configUnset(
    name: string,
    keys: string[],
    noRestart = false,
  ): Promise<string> {
    const args = ["config:unset"];
    if (noRestart) args.push("--no-restart");
    args.push(name, ...keys);
    return this.exec(args);
  }

  // ── Domains ────────────────────────────────────────────────────────────

  /** Fetch domains for all apps in a single SSH call. */
  async domainsReportAll(): Promise<Map<string, string[]>> {
    const out = await this.exec(["domains:report"]);
    const result = new Map<string, string[]>();
    let currentApp: string | null = null;
    for (const line of out.trim().split("\n")) {
      const headerMatch = line.match(/=====> (\S+) domains information/);
      if (headerMatch) {
        currentApp = headerMatch[1];
        result.set(currentApp, []);
        continue;
      }
      if (!currentApp) continue;
      const match = line.match(/Domains app vhosts:\s+(.+)/);
      if (match) {
        const domains = match[1].trim().split(/\s+/).filter(Boolean);
        result.set(currentApp, domains);
      }
    }
    return result;
  }

  async domainsReport(name: string): Promise<string[]> {
    const out = await this.exec(["domains:report", name]);
    const domains: string[] = [];
    for (const line of out.trim().split("\n")) {
      const match = line.match(/Domains app vhosts:\s+(.+)/);
      if (match) {
        domains.push(
          ...match[1]
            .split(/\s+/)
            .map((d) => d.trim())
            .filter(Boolean),
        );
      }
    }
    return domains;
  }

  async domainsAdd(name: string, domain: string): Promise<string> {
    return this.exec(["domains:add", name, domain]);
  }

  async domainsRemove(name: string, domain: string): Promise<string> {
    return this.exec(["domains:remove", name, domain]);
  }

  // ── Let's Encrypt ──────────────────────────────────────────────────────

  async letsencryptEnable(name: string): Promise<string> {
    return this.exec(["letsencrypt:enable", name]);
  }

  async letsencryptDisable(name: string): Promise<string> {
    return this.exec(["letsencrypt:disable", name]);
  }

  // ── Postgres ───────────────────────────────────────────────────────────

  async postgresList(): Promise<string[]> {
    try {
      const out = await this.exec(["postgres:list"]);
      return out
        .trim()
        .split("\n")
        .slice(1) // skip header
        .map((l) => l.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  async postgresCreate(name: string): Promise<string> {
    return this.exec(["postgres:create", name]);
  }

  async postgresDestroy(name: string): Promise<string> {
    return this.exec(["postgres:destroy", name, "--force"]);
  }

  async postgresInfo(name: string): Promise<string> {
    return this.exec(["postgres:info", name]);
  }

  async postgresLink(dbName: string, appName: string): Promise<string> {
    return this.exec(["postgres:link", dbName, appName]);
  }

  async postgresUnlink(dbName: string, appName: string): Promise<string> {
    return this.exec(["postgres:unlink", dbName, appName]);
  }

  async postgresLinks(dbName: string): Promise<string[]> {
    try {
      const out = await this.exec(["postgres:links", dbName]);
      return out
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  async postgresConnectionInfo(dbName: string): Promise<string> {
    return this.exec(["postgres:info", dbName]);
  }

  // ── Resource limits ────────────────────────────────────────────────────

  async resourceReport(name: string): Promise<string> {
    return this.exec(["resource:report", name]);
  }

  async resourceLimitSet(
    name: string,
    processType: string,
    limits: { memory?: string; cpu?: string },
  ): Promise<string> {
    const args = ["resource:limit", name];
    if (limits.memory) args.push(`--memory`, limits.memory);
    if (limits.cpu) args.push(`--cpu`, limits.cpu);
    if (processType !== "web") args.push(`--process-type`, processType);
    return this.exec(args);
  }

  // ── Deploy info ────────────────────────────────────────────────────────

  async deployInfo(name: string): Promise<string> {
    try {
      return await this.exec(["ps:report", name]);
    } catch {
      return "No deploy info available";
    }
  }

  // ── Git report ──────────────────────────────────────────────────────

  async gitReport(name: string): Promise<GitReport | null> {
    try {
      const out = await this.exec(["git:report", name]);
      const get = (key: string) => {
        const m = out.match(new RegExp(`${key}:\\s+(.+)`));
        return m?.[1]?.trim() ?? "";
      };
      return {
        deployBranch: get("Git deploy branch"),
        sourceHash: get("Git source image"),
        lastUpdatedAt: get("Git last updated at"),
      };
    } catch {
      return null;
    }
  }

  async getAppMeta(name: string): Promise<AppMeta> {
    const [reportRaw, config, gitInfo] = await Promise.all([
      this.appsReport(name),
      this.configShow(name).catch(() => ({} as Record<string, string>)),
      this.gitReport(name),
    ]);

    // Parse ps:report into structured kv
    const psReport: Record<string, string> = {};
    const processes: AppMeta["processes"] = [];
    for (const line of reportRaw.trim().split("\n")) {
      if (line.startsWith("====")) continue;
      const match = line.match(/^\s*(.+?):\s+(.*)$/);
      if (!match) continue;
      const key = match[1].trim();
      const val = match[2].trim();
      psReport[key] = val;

      // Parse status lines like "Status web 1" or "Status web.1" → "running (CID: ...)"
      const statusMatch = key.match(/^Status\s+(\w+)[.\s]+(\d+)$/);
      if (statusMatch) {
        // Extract status word from "running (CID: ...)" format
        const statusWord = val.match(/^(\w+)/)?.[1] ?? val;
        processes.push({
          name: `${statusMatch[1]}.${statusMatch[2]}`,
          type: statusMatch[1],
          status: statusWord,
        });
      }
    }

    return {
      psReport,
      gitReport: gitInfo,
      gitRev: config.GIT_REV ?? "",
      appType: config.DOKKU_APP_TYPE ?? psReport["Restore"] ?? "",
      githubRepo: config.GITHUB_REPO ?? "",
      processes,
    };
  }

  // ── Postgres query execution ──────────────────────────────────────────

  /** Execute a SQL query via postgres:connect stdin pipe. */
  async postgresQuery(
    dbName: string,
    sql: string,
  ): Promise<{ columns: string[]; rows: string[][]; rowCount: number }> {
    // Enforce LIMIT 1000 if no LIMIT clause present
    const upperSql = sql.toUpperCase();
    const hasLimit = /\bLIMIT\b/.test(upperSql);
    const limitedSql = hasLimit ? sql : `${sql.replace(/;?\s*$/, "")} LIMIT 1000`;

    // Wrap with statement timeout (5s) and CSV output
    const wrappedSql = `SET statement_timeout = '5s';\n\\pset format csv\n${limitedSql};`;
    const out = await this.pool.execWithStdin(
      ["postgres:connect", dbName],
      wrappedSql,
    );

    // Filter out psql meta lines (e.g. "Output format is csv.", timing, row counts)
    const lines = out
      .trim()
      .split("\n")
      .filter((l) => l && !/^(Output format|Time:|Pager|Null display|\(\d+ rows?\))/.test(l));
    if (lines.length === 0) return { columns: [], rows: [], rowCount: 0 };

    const columns = parseCsvLine(lines[0]);
    const rows = lines.slice(1).map(parseCsvLine);
    return { columns, rows, rowCount: rows.length };
  }

  /** List tables in a postgres database. */
  async postgresTables(dbName: string): Promise<Array<{ name: string; type: string; rowEstimate: string }>> {
    const sql = `SELECT c.relname AS name,
      CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE c.relkind::text END AS type,
      c.reltuples::bigint AS row_estimate
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m')
    ORDER BY c.relname;`;

    const result = await this.postgresQuery(dbName, sql);
    return result.rows.map((r) => ({
      name: r[0],
      type: r[1],
      rowEstimate: r[2],
    }));
  }

  /** Get column schema for a table. */
  async postgresTableSchema(dbName: string, tableName: string): Promise<Array<{ column: string; type: string; nullable: string; defaultVal: string }>> {
    // Validate table name to prevent injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new Error("Invalid table name");
    }
    const sql = `SELECT column_name, data_type, is_nullable, COALESCE(column_default, '-') AS column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = '${tableName}'
    ORDER BY ordinal_position;`;

    const result = await this.postgresQuery(dbName, sql);
    return result.rows.map((r) => ({
      column: r[0],
      type: r[1],
      nullable: r[2],
      defaultVal: r[3],
    }));
  }

  /** Preview rows from a table (first 50). */
  async postgresTablePreview(dbName: string, tableName: string): Promise<{ columns: string[]; rows: string[][]; rowCount: number }> {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new Error("Invalid table name");
    }
    return this.postgresQuery(dbName, `SELECT * FROM "${tableName}" LIMIT 50;`);
  }
}

/** Parse a CSV line respecting quoted fields. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}
