import type { SshConfig } from "./ssh.js";
import { SshPool } from "./ssh.js";

// ── Types ──────────────────────────────────────────────────────────────────

export type AppStatus = "loading" | "running" | "stopped" | "deployed" | "not deployed" | "failed" | "unknown";

export interface AppInfo {
  name: string;
  status: AppStatus;
  deployed: boolean;
  processCount: number;
  processTypes: string[];
  processTypeCounts: Record<string, number>;
  domains: string[];
  appType: string;
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

export interface DatabaseListInfo extends DatabaseInfo {
  size: string;
  sizeBytes: number;
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
const FAST_APPS_CACHE_TTL_MS = 30_000;
const APP_TYPE_CACHE_TTL_MS = 60 * 60_000;
const BACKGROUND_REFRESH_MS = 60_000;
const APPS_STATUS_TIMEOUT_MS = 10_000;
const APPS_DOMAIN_TIMEOUT_MS = 5_000;
const APP_TYPE_COMMAND_TIMEOUT_MS = 1_500;

const APPS_LIST_CACHE_KEY = "apps:list";
const APPS_INDEX_CACHE_KEY = "apps:index";
const APPS_NAMES_CACHE_KEY = "apps:names";
const DATABASES_LIST_CACHE_KEY = "databases:list";
const POSTGRES_NAMES_CACHE_KEY = "postgres:names";

// ── Client ─────────────────────────────────────────────────────────────────

export class DokkuClient {
  private cache = new Map<string, CacheEntry<unknown>>();
  private pool: SshPool;
  private appsListRefresh: Promise<AppInfo[]> | null = null;
  private appTypeRefresh: Promise<void> | null = null;
  private databasesListRefresh: Promise<DatabaseListInfo[]> | null = null;
  private backgroundRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private backgroundRefreshRunning = false;

  constructor(private cfg: SshConfig) {
    this.pool = new SshPool(cfg);
  }

  private exec(args: string[], timeoutMs?: number): Promise<string> {
    return this.pool.exec(args, timeoutMs);
  }

  /** Pre-warm the SSH connection and apps cache. */
  async warmup(): Promise<void> {
    try {
      await this.appsListFast();
      console.log("SSH connection warmed up, app index cache populated");
    } catch (err) {
      console.error("Warmup failed:", err instanceof Error ? err.message : err);
    }
  }

  startBackgroundRefresh(intervalMs = BACKGROUND_REFRESH_MS): () => void {
    if (this.backgroundRefreshTimer) return () => this.stopBackgroundRefresh();

    const run = () => {
      if (this.backgroundRefreshRunning) return;
      this.backgroundRefreshRunning = true;
      Promise.allSettled([
        this.ensureAppsListRefresh(),
        this.ensureDatabasesListRefresh(),
      ]).finally(() => {
        this.backgroundRefreshRunning = false;
      });
    };

    run();
    this.backgroundRefreshTimer = setInterval(run, intervalMs);
    this.backgroundRefreshTimer.unref?.();
    return () => this.stopBackgroundRefresh();
  }

  stopBackgroundRefresh(): void {
    if (!this.backgroundRefreshTimer) return;
    clearInterval(this.backgroundRefreshTimer);
    this.backgroundRefreshTimer = null;
  }

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (entry && Date.now() < entry.expires) return entry.data as T;
    return undefined;
  }

  private getStaleCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    return entry?.data as T | undefined;
  }

  private setCache<T>(key: string, data: T, ttlMs = CACHE_TTL_MS): T {
    this.cache.set(key, { data, expires: Date.now() + ttlMs });
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

  private appTypeFor(name: string, known?: AppInfo): string {
    return this.getCached<string>(`apps:type:${name}`) ?? known?.appType ?? "";
  }

  private appFromName(name: string, known?: AppInfo): AppInfo {
    return {
      name,
      status: known?.status ?? "loading",
      deployed: known?.deployed ?? false,
      processCount: known?.processCount ?? 0,
      processTypes: known ? [...known.processTypes] : [],
      processTypeCounts: known ? { ...known.processTypeCounts } : {},
      domains: known ? [...known.domains] : [],
      appType: this.appTypeFor(name, known),
    };
  }

  private appsFallback(): AppInfo[] | undefined {
    return this.getStaleCached<AppInfo[]>(APPS_LIST_CACHE_KEY)
      ?? this.getStaleCached<AppInfo[]>(APPS_INDEX_CACHE_KEY);
  }

  private mergeAppsFromNames(names: string[], knownApps?: AppInfo[]): AppInfo[] {
    const knownByName = new Map((knownApps ?? []).map((app) => [app.name, app]));
    return names.map((name) => this.appFromName(name, knownByName.get(name)));
  }

  private appFromPsBlock(name: string, block: string, known?: AppInfo): AppInfo {
    let status: AppStatus = "unknown";
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

    const processTypeCounts: Record<string, number> = {};
    let processCount = 0;
    const statusMatches = block.matchAll(/Status\s+(\w+)[.\s]+\d+/g);
    for (const m of statusMatches) {
      processTypeCounts[m[1]] = (processTypeCounts[m[1]] ?? 0) + 1;
      processCount++;
    }

    return {
      name,
      status,
      deployed,
      processCount,
      processTypes: Object.keys(processTypeCounts),
      processTypeCounts,
      domains: known ? [...known.domains] : [],
      appType: this.appTypeFor(name, known),
    };
  }

  private parseAppsReport(out: string, knownApps?: AppInfo[]): AppInfo[] {
    const knownByName = new Map((knownApps ?? []).map((app) => [app.name, app]));
    const apps: AppInfo[] = [];
    const blocks = out.split(/(?======>\s)/);

    for (const block of blocks) {
      const headerMatch = block.match(/=====> (\S+) ps information/);
      if (!headerMatch) continue;
      const name = headerMatch[1];
      apps.push(this.appFromPsBlock(name, block, knownByName.get(name)));
    }

    return apps;
  }

  async appsListFast(): Promise<AppInfo[]> {
    const cachedFull = this.getCached<AppInfo[]>(APPS_LIST_CACHE_KEY);
    if (cachedFull) return cachedFull;

    const cachedIndex = this.getCached<AppInfo[]>(APPS_INDEX_CACHE_KEY);
    if (cachedIndex) {
      this.refreshAppsListInBackground();
      return cachedIndex;
    }

    const staleFull = this.getStaleCached<AppInfo[]>(APPS_LIST_CACHE_KEY);
    if (staleFull) {
      this.refreshAppsListInBackground();
      return staleFull;
    }

    return this.appsListFromNames();
  }

  private async appsListFromNames(): Promise<AppInfo[]> {
    const fallback = this.appsFallback();
    try {
      const names = await this.appsListNames();
      const apps = this.setCache(
        APPS_INDEX_CACHE_KEY,
        this.mergeAppsFromNames(names, fallback),
        FAST_APPS_CACHE_TTL_MS,
      );
      this.refreshAppsListInBackground();
      return apps;
    } catch (err) {
      if (fallback) return fallback;
      throw err;
    }
  }

  async appsList(): Promise<AppInfo[]> {
    const cached = this.getCached<AppInfo[]>(APPS_LIST_CACHE_KEY);
    if (cached) return cached;

    return this.ensureAppsListRefresh();
  }

  private ensureAppsListRefresh(): Promise<AppInfo[]> {
    if (this.appsListRefresh) return this.appsListRefresh;
    this.appsListRefresh = this.refreshAppsList().finally(() => {
      this.appsListRefresh = null;
    });
    return this.appsListRefresh;
  }

  private refreshAppsListInBackground(): void {
    this.ensureAppsListRefresh().catch((err) => {
      console.error("Background app refresh failed:", err instanceof Error ? err.message : err);
    });
  }

  private async refreshAppsList(): Promise<AppInfo[]> {
    const fallback = this.appsFallback();
    let apps: AppInfo[];

    try {
      // Single SSH call to get all app statuses at once. Keep this bounded so
      // a slow Dokku status report does not block the dashboard page load.
      const out = await this.exec(["ps:report"], Math.min(this.cfg.timeoutMs, APPS_STATUS_TIMEOUT_MS));
      apps = this.parseAppsReport(out, fallback);
    } catch (err) {
      try {
        return await this.appsListFromNames();
      } catch {
        if (fallback) return fallback;
        throw err;
      }
    }

    // Fetch all domains in a single SSH call to avoid channel exhaustion.
    try {
      const domainsMap = await this.domainsReportAll(Math.min(this.cfg.timeoutMs, APPS_DOMAIN_TIMEOUT_MS));
      for (const app of apps) {
        app.domains = domainsMap.get(app.name) ?? [];
      }
    } catch {
      // Keep stale domains from the previous cache if batch call fails.
    }

    this.setCache(APPS_LIST_CACHE_KEY, apps);
    this.refreshAppTypesInBackground(apps);
    return apps;
  }

  private refreshAppTypesInBackground(apps: AppInfo[]): void {
    if (this.appTypeRefresh) return;

    this.appTypeRefresh = (async () => {
      for (const app of apps) {
        const cacheKey = `apps:type:${app.name}`;
        if (this.getCached<string>(cacheKey) !== undefined) continue;

        try {
          const val = (await this.exec(
            ["config:get", app.name, "DOKKU_APP_TYPE"],
            Math.min(this.cfg.timeoutMs, APP_TYPE_COMMAND_TIMEOUT_MS),
          )).trim();
          this.setCache(cacheKey, val, APP_TYPE_CACHE_TTL_MS);
          this.patchCachedApp(app.name, { appType: val });
        } catch {
          // keep stale or empty app type
        }
      }
    })().finally(() => {
      this.appTypeRefresh = null;
    });
  }

  private patchCachedApp(name: string, patch: Partial<AppInfo>): void {
    const patchList = (apps: AppInfo[]) =>
      apps.map((app) => (app.name === name ? { ...app, ...patch } : app));

    for (const key of [APPS_LIST_CACHE_KEY, APPS_INDEX_CACHE_KEY]) {
      const entry = this.cache.get(key);
      if (entry) entry.data = patchList(entry.data as AppInfo[]);
    }
  }

  private removeCachedApp(name: string): void {
    const removeFromList = (apps: AppInfo[]) => apps.filter((app) => app.name !== name);

    for (const key of [APPS_LIST_CACHE_KEY, APPS_INDEX_CACHE_KEY]) {
      const entry = this.cache.get(key);
      if (entry) entry.data = removeFromList(entry.data as AppInfo[]);
    }
  }

  async appsListNames(): Promise<string[]> {
    const cached = this.getCached<string[]>(APPS_NAMES_CACHE_KEY);
    if (cached) return cached;

    try {
      const out = await this.exec(["apps:list"]);
      const names = out
        .trim()
        .split("\n")
        .slice(1)
        .map((l) => l.trim())
        .filter(Boolean);
      return this.setCache(APPS_NAMES_CACHE_KEY, names, FAST_APPS_CACHE_TTL_MS);
    } catch (err) {
      const stale = this.getStaleCached<string[]>(APPS_NAMES_CACHE_KEY);
      if (stale) return stale;
      throw err;
    }
  }

  async appsCreate(name: string): Promise<string> {
    const out = await this.exec(["apps:create", name]);
    this.invalidateCache("apps:");
    this.refreshAppsListInBackground();
    return out;
  }

  async appsDestroy(name: string): Promise<string> {
    const out = await this.exec(["apps:destroy", name, "--force"]);
    this.invalidateCache("apps:");
    this.removeCachedApp(name);
    this.refreshAppsListInBackground();
    return out;
  }

  async appsReport(name: string): Promise<string> {
    return this.exec(["ps:report", name]);
  }

  async appInfo(name: string, options: { domains?: string[]; appType?: string } = {}): Promise<AppInfo> {
    const fallback = this.appsFallback()?.find((app) => app.name === name);
    const out = await this.appsReport(name);
    const app = this.parseAppsReport(out, fallback ? [fallback] : [])[0] ?? this.appFromName(name, fallback);

    app.domains = options.domains ?? fallback?.domains ?? [];
    app.appType = options.appType ?? fallback?.appType ?? "";
    return app;
  }

  // ── Process management ─────────────────────────────────────────────────

  async psStart(name: string): Promise<string> {
    const out = await this.exec(["ps:start", name]);
    this.patchCachedApp(name, { status: "running", deployed: true });
    this.refreshAppsListInBackground();
    return out;
  }

  async psStop(name: string): Promise<string> {
    const out = await this.exec(["ps:stop", name]);
    this.patchCachedApp(name, { status: "stopped", deployed: true, processCount: 0 });
    this.refreshAppsListInBackground();
    return out;
  }

  async psRestart(name: string): Promise<string> {
    const out = await this.exec(["ps:restart", name]);
    this.patchCachedApp(name, { status: "loading" });
    this.refreshAppsListInBackground();
    return out;
  }

  async psRebuild(name: string): Promise<string> {
    const out = await this.exec(["ps:rebuild", name]);
    this.patchCachedApp(name, { status: "loading" });
    this.refreshAppsListInBackground();
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
    const out = await this.exec(args);
    this.patchCachedApp(name, { status: "loading" });
    this.refreshAppsListInBackground();
    return out;
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
    const out = await this.exec(args);
    if (Object.prototype.hasOwnProperty.call(vars, "DOKKU_APP_TYPE")) {
      this.invalidateCache("apps:");
      this.refreshAppsListInBackground();
    }
    return out;
  }

  async configUnset(
    name: string,
    keys: string[],
    noRestart = false,
  ): Promise<string> {
    const args = ["config:unset"];
    if (noRestart) args.push("--no-restart");
    args.push(name, ...keys);
    const out = await this.exec(args);
    if (keys.includes("DOKKU_APP_TYPE")) {
      this.invalidateCache("apps:");
      this.refreshAppsListInBackground();
    }
    return out;
  }

  // ── Domains ────────────────────────────────────────────────────────────

  /** Fetch domains for all apps in a single SSH call. */
  async domainsReportAll(timeoutMs = this.cfg.timeoutMs): Promise<Map<string, string[]>> {
    const out = await this.exec(["domains:report"], timeoutMs);
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
    const out = await this.exec(["domains:add", name, domain]);
    this.invalidateCache("apps:");
    this.refreshAppsListInBackground();
    return out;
  }

  async domainsRemove(name: string, domain: string): Promise<string> {
    const out = await this.exec(["domains:remove", name, domain]);
    this.invalidateCache("apps:");
    this.refreshAppsListInBackground();
    return out;
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
    const cached = this.getCached<string[]>(POSTGRES_NAMES_CACHE_KEY);
    if (cached) return cached;

    return this.refreshPostgresList();
  }

  private async refreshPostgresList(): Promise<string[]> {
    try {
      const out = await this.exec(["postgres:list"]);
      const names = out
        .trim()
        .split("\n")
        .slice(1) // skip header
        .map((l) => l.trim())
        .filter(Boolean);
      return this.setCache(POSTGRES_NAMES_CACHE_KEY, names);
    } catch {
      return this.getStaleCached<string[]>(POSTGRES_NAMES_CACHE_KEY) ?? [];
    }
  }

  async postgresCreate(name: string): Promise<string> {
    const out = await this.exec(["postgres:create", name]);
    this.invalidateCache("postgres:");
    this.invalidateCache("databases:");
    this.refreshDatabasesListInBackground();
    return out;
  }

  async postgresDestroy(name: string): Promise<string> {
    const out = await this.exec(["postgres:destroy", name, "--force"]);
    this.invalidateCache("postgres:");
    this.invalidateCache("databases:");
    this.refreshDatabasesListInBackground();
    return out;
  }

  async postgresInfo(name: string): Promise<string> {
    return this.exec(["postgres:info", name]);
  }

  async postgresLink(dbName: string, appName: string): Promise<string> {
    const out = await this.exec(["postgres:link", dbName, appName]);
    this.invalidateCache("databases:");
    this.refreshDatabasesListInBackground();
    return out;
  }

  async postgresUnlink(dbName: string, appName: string): Promise<string> {
    const out = await this.exec(["postgres:unlink", dbName, appName]);
    this.invalidateCache("databases:");
    this.refreshDatabasesListInBackground();
    return out;
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

  async databasesListFast(): Promise<DatabaseListInfo[]> {
    const cached = this.getCached<DatabaseListInfo[]>(DATABASES_LIST_CACHE_KEY);
    if (cached) return cached;

    const stale = this.getStaleCached<DatabaseListInfo[]>(DATABASES_LIST_CACHE_KEY);
    if (stale) {
      this.refreshDatabasesListInBackground();
      return stale;
    }

    const names = await this.postgresList();
    this.refreshDatabasesListInBackground();
    return names.map((name) => ({ name, links: [], size: "checking", sizeBytes: 0 }));
  }

  async databasesList(): Promise<DatabaseListInfo[]> {
    const cached = this.getCached<DatabaseListInfo[]>(DATABASES_LIST_CACHE_KEY);
    if (cached) return cached;
    return this.ensureDatabasesListRefresh();
  }

  private ensureDatabasesListRefresh(): Promise<DatabaseListInfo[]> {
    if (this.databasesListRefresh) return this.databasesListRefresh;
    this.databasesListRefresh = this.refreshDatabasesList().finally(() => {
      this.databasesListRefresh = null;
    });
    return this.databasesListRefresh;
  }

  private refreshDatabasesListInBackground(): void {
    this.ensureDatabasesListRefresh().catch((err) => {
      console.error("Background database refresh failed:", err instanceof Error ? err.message : err);
    });
  }

  private async refreshDatabasesList(): Promise<DatabaseListInfo[]> {
    const names = await this.postgresList();
    const databases = await Promise.all(
      names.map(async (name) => {
        const [links, size] = await Promise.all([
          this.postgresLinks(name),
          this.postgresDbSize(name),
        ]);
        return { name, links, size: size.pretty, sizeBytes: size.bytes };
      }),
    );

    return this.setCache(DATABASES_LIST_CACHE_KEY, databases);
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

  /** Get the size of a postgres database (bytes + human-readable). */
  async postgresDbSize(dbName: string): Promise<{ bytes: number; pretty: string }> {
    try {
      const result = await this.postgresQuery(
        dbName,
        "SELECT pg_database_size(current_database()) AS bytes, pg_size_pretty(pg_database_size(current_database())) AS pretty",
      );
      if (result.rows.length > 0) {
        return { bytes: parseInt(result.rows[0][0], 10) || 0, pretty: result.rows[0][1] };
      }
    } catch {
      // ignore — size is best-effort
    }
    return { bytes: 0, pretty: "-" };
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
