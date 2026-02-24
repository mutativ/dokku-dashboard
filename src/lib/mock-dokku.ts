import { DokkuClient } from "./dokku.js";
import type { AppInfo, AppMeta, DatabaseInfo, GitReport } from "./dokku.js";

const MOCK_APPS: AppInfo[] = [
  // api group
  {
    name: "api-server",
    status: "running",
    deployed: true,
    processCount: 2,
    processTypes: ["web"],
    processTypeCounts: { web: 2 },
    domains: ["api.example.com"],
    appType: "api",
  },
  {
    name: "api-worker",
    status: "running",
    deployed: true,
    processCount: 1,
    processTypes: ["worker"],
    processTypeCounts: { worker: 1 },
    domains: [],
      appType: "api",
  },
  {
    name: "api-cron",
    status: "stopped",
    deployed: true,
    processCount: 0,
    processTypes: ["cron"],
    processTypeCounts: { cron: 0 },
    domains: [],
      appType: "api",
  },
  // frontend — standalone
  {
    name: "frontend",
    status: "running",
    deployed: true,
    processCount: 1,
    processTypes: ["web"],
    processTypeCounts: { web: 1 },
    domains: ["example.com", "www.example.com"],
    appType: "api",
  },
  // staging group
  {
    name: "staging-api",
    status: "running",
    deployed: true,
    processCount: 1,
    processTypes: ["web"],
    processTypeCounts: { web: 1 },
    domains: ["staging.example.com"],
    appType: "api",
  },
  {
    name: "staging-worker",
    status: "stopped",
    deployed: true,
    processCount: 0,
    processTypes: ["worker"],
    processTypeCounts: { worker: 0 },
    domains: [],
      appType: "api",
  },
];

const MOCK_GIT: Record<string, GitReport> = {
  "api-server": {
    deployBranch: "main",
    sourceHash: "sha256:a1b2c3d4e5f6",
    lastUpdatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  "api-worker": {
    deployBranch: "main",
    sourceHash: "sha256:a1b2c3d4e5f6",
    lastUpdatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  "api-cron": {
    deployBranch: "main",
    sourceHash: "sha256:a1b2c3d4e5f6",
    lastUpdatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  frontend: {
    deployBranch: "main",
    sourceHash: "sha256:deadbeef0123",
    lastUpdatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  "staging-api": {
    deployBranch: "develop",
    sourceHash: "sha256:cafebabe9876",
    lastUpdatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  "staging-worker": {
    deployBranch: "develop",
    sourceHash: "sha256:cafebabe9876",
    lastUpdatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
};

const MOCK_CONFIG: Record<string, Record<string, string>> = {
  "api-server": {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://localhost:5432/api_prod",
    REDIS_URL: "redis://localhost:6379",
    PORT: "5000",
  },
  "api-worker": {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://localhost:5432/api_prod",
    REDIS_URL: "redis://localhost:6379",
    QUEUE_CONCURRENCY: "3",
  },
  "api-cron": {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://localhost:5432/api_prod",
    CRON_SCHEDULE: "0 * * * *",
  },
  frontend: {
    NODE_ENV: "production",
    API_URL: "https://api.example.com",
    PORT: "3000",
  },
  "staging-api": {
    NODE_ENV: "staging",
    DATABASE_URL: "postgres://localhost:5432/api_staging",
    REDIS_URL: "redis://localhost:6379",
    PORT: "5001",
  },
  "staging-worker": {
    NODE_ENV: "staging",
    DATABASE_URL: "postgres://localhost:5432/api_staging",
    QUEUE_CONCURRENCY: "1",
  },
};

const MOCK_DOMAINS: Record<string, string[]> = {
  "api-server": ["api.example.com"],
  "api-worker": [],
  "api-cron": [],
  frontend: ["example.com", "www.example.com"],
  "staging-api": ["staging.example.com"],
  "staging-worker": [],
};

const MOCK_POSTGRES = ["app-db", "staging-db"];

export class MockDokkuClient extends DokkuClient {
  constructor() {
    // Pass a dummy config — all methods are overridden, SSH is never called
    super({ host: "mock", port: 22, username: "dokku", privateKey: Buffer.alloc(0), timeoutMs: 0 });
    console.log("[mock] Using MockDokkuClient — no real SSH connection");
  }

  override async warmup(): Promise<void> {
    console.log("[mock] warmup skipped");
  }

  override async appsList(): Promise<AppInfo[]> {
    return MOCK_APPS;
  }

  override async appsListNames(): Promise<string[]> {
    return MOCK_APPS.map((a) => a.name);
  }

  override async appsCreate(name: string): Promise<string> {
    MOCK_APPS.push({ name, status: "not deployed", deployed: false, processCount: 0, processTypes: [], processTypeCounts: {}, domains: [], appType: "api" });
    return `Creating ${name}... done`;
  }

  override async appsDestroy(name: string): Promise<string> {
    const i = MOCK_APPS.findIndex((a) => a.name === name);
    if (i >= 0) MOCK_APPS.splice(i, 1);
    return `Destroying ${name}... done`;
  }

  override async appsReport(name: string): Promise<string> {
    const app = MOCK_APPS.find((a) => a.name === name);
    return `=====> ${name} ps information\n  Deployed: ${app?.deployed ?? false}\n  Running: ${app?.status === "running"}`;
  }

  override async psStart(name: string): Promise<string> {
    const app = MOCK_APPS.find((a) => a.name === name);
    if (app) { app.status = "running"; app.deployed = true; }
    return `Starting ${name}... done`;
  }

  override async psStop(name: string): Promise<string> {
    const app = MOCK_APPS.find((a) => a.name === name);
    if (app) app.status = "stopped";
    return `Stopping ${name}... done`;
  }

  override async psRestart(name: string): Promise<string> {
    return `Restarting ${name}... done`;
  }

  override async psRebuild(name: string): Promise<string> {
    return `Rebuilding ${name}... done`;
  }

  override async psScale(name: string, scaling?: Record<string, number>): Promise<string> {
    if (!scaling) return `Scaling info for ${name}: web=1`;
    return `Scaling ${name}: ${Object.entries(scaling).map(([k, v]) => `${k}=${v}`).join(" ")}`;
  }

  override streamLogs(
    name: string,
    onData: (chunk: string) => void,
    onClose: (code: number) => void,
  ): { abort: () => void } {
    const lines = [
      `[mock] ${name} | Starting process...`,
      `[mock] ${name} | Listening on port 5000`,
      `[mock] ${name} | GET /health 200 3ms`,
      `[mock] ${name} | GET /api/users 200 42ms`,
      `[mock] ${name} | POST /api/data 201 18ms`,
    ];
    let i = 0;
    let stopped = false;
    const interval = setInterval(() => {
      if (stopped) return;
      if (i < lines.length) {
        onData(lines[i++] + "\n");
      } else {
        onData(`[mock] ${name} | ${new Date().toISOString()} heartbeat\n`);
      }
    }, 500);
    return {
      abort() {
        stopped = true;
        clearInterval(interval);
        onClose(0);
      },
    };
  }

  override async getLogs(name: string): Promise<string> {
    return [
      `[mock] ${name} | Starting process...`,
      `[mock] ${name} | Listening on port 5000`,
      `[mock] ${name} | GET /health 200 3ms`,
      `[mock] ${name} | GET /api/users 200 42ms`,
    ].join("\n");
  }

  override async configShow(name: string): Promise<Record<string, string>> {
    return MOCK_CONFIG[name] ?? {};
  }

  override async configSet(name: string, vars: Record<string, string>): Promise<string> {
    MOCK_CONFIG[name] = { ...MOCK_CONFIG[name], ...vars };
    return `Setting config vars for ${name}... done`;
  }

  override async configUnset(name: string, keys: string[]): Promise<string> {
    for (const k of keys) delete MOCK_CONFIG[name]?.[k];
    return `Unsetting config vars for ${name}... done`;
  }

  override async domainsReport(name: string): Promise<string[]> {
    return MOCK_DOMAINS[name] ?? [];
  }

  override async domainsAdd(name: string, domain: string): Promise<string> {
    if (!MOCK_DOMAINS[name]) MOCK_DOMAINS[name] = [];
    MOCK_DOMAINS[name].push(domain);
    return `Adding domain ${domain} to ${name}... done`;
  }

  override async domainsRemove(name: string, domain: string): Promise<string> {
    if (MOCK_DOMAINS[name]) {
      MOCK_DOMAINS[name] = MOCK_DOMAINS[name].filter((d) => d !== domain);
    }
    return `Removing domain ${domain} from ${name}... done`;
  }

  override async letsencryptEnable(name: string): Promise<string> {
    return `[mock] Let's Encrypt enabled for ${name}`;
  }

  override async letsencryptDisable(name: string): Promise<string> {
    return `[mock] Let's Encrypt disabled for ${name}`;
  }

  override async postgresList(): Promise<string[]> {
    return MOCK_POSTGRES;
  }

  override async postgresCreate(name: string): Promise<string> {
    MOCK_POSTGRES.push(name);
    return `Creating postgres database ${name}... done`;
  }

  override async postgresDestroy(name: string): Promise<string> {
    const i = MOCK_POSTGRES.indexOf(name);
    if (i >= 0) MOCK_POSTGRES.splice(i, 1);
    return `Destroying postgres database ${name}... done`;
  }

  override async postgresInfo(name: string): Promise<string> {
    return `=====> ${name} postgres service information\n  Dsn: postgres://postgres:mock@localhost:5432/${name}`;
  }

  override async postgresLink(dbName: string, appName: string): Promise<string> {
    return `Linking ${dbName} to ${appName}... done`;
  }

  override async postgresUnlink(dbName: string, appName: string): Promise<string> {
    return `Unlinking ${dbName} from ${appName}... done`;
  }

  override async postgresLinks(dbName: string): Promise<string[]> {
    return dbName === "app-db" ? ["api-server", "api-worker", "api-cron", "staging-api", "staging-worker"] : [];
  }

  override async postgresConnectionInfo(_dbName: string): Promise<string> {
    return this.postgresInfo(_dbName);
  }

  override async resourceReport(name: string): Promise<string> {
    return `=====> ${name} resource information\n  Memory limit: 512m\n  CPU limit: -`;
  }

  override async resourceLimitSet(name: string): Promise<string> {
    return `Setting resource limits for ${name}... done`;
  }

  override async deployInfo(name: string): Promise<string> {
    return this.appsReport(name);
  }

  override async gitReport(name: string): Promise<GitReport | null> {
    return MOCK_GIT[name] ?? null;
  }

  override async getAppMeta(name: string): Promise<AppMeta> {
    const app = MOCK_APPS.find((a) => a.name === name);
    const config = await this.configShow(name);
    const gitInfo = await this.gitReport(name);
    const processes = app?.processTypes.flatMap((type) =>
      Array.from({ length: app.processTypeCounts[type] ?? 1 }, (_, i) => ({
        name: `${type}.${i + 1}`,
        type,
        status: app.status === "running" ? "running" : "stopped",
      })),
    ) ?? [];

    return {
      psReport: { Deployed: String(app?.deployed ?? false), Running: String(app?.status === "running") },
      gitReport: gitInfo,
      gitRev: config.GIT_REV ?? "",
      appType: "herokuish",
      githubRepo: config.GITHUB_REPO ?? "",
      processes,
    };
  }

  override async postgresQuery(
    _dbName: string,
    _sql: string,
  ): Promise<{ columns: string[]; rows: string[][]; rowCount: number }> {
    return {
      columns: ["id", "name", "created_at"],
      rows: [
        ["1", "Alice", "2024-01-01"],
        ["2", "Bob", "2024-02-15"],
        ["3", "Carol", "2024-03-20"],
      ],
      rowCount: 3,
    };
  }

  override async postgresTables(_dbName: string): Promise<Array<{ name: string; type: string; rowEstimate: string }>> {
    return [
      { name: "users", type: "table", rowEstimate: "1024" },
      { name: "sessions", type: "table", rowEstimate: "512" },
      { name: "events", type: "table", rowEstimate: "98304" },
    ];
  }

  override async postgresTableSchema(
    _dbName: string,
    _tableName: string,
  ): Promise<Array<{ column: string; type: string; nullable: string; defaultVal: string }>> {
    return [
      { column: "id", type: "integer", nullable: "NO", defaultVal: "nextval('users_id_seq')" },
      { column: "name", type: "character varying", nullable: "NO", defaultVal: "-" },
      { column: "email", type: "character varying", nullable: "NO", defaultVal: "-" },
      { column: "created_at", type: "timestamp", nullable: "YES", defaultVal: "now()" },
    ];
  }

  override async postgresTablePreview(
    _dbName: string,
    _tableName: string,
  ): Promise<{ columns: string[]; rows: string[][]; rowCount: number }> {
    return this.postgresQuery(_dbName, "");
  }
}
