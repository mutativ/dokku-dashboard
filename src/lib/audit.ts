/** Structured audit logger for SSH command execution. */

const SENSITIVE_PATTERNS = /KEY|SECRET|HASH|PASSWORD|TOKEN|PRIVATE|CREDENTIAL|DSN/i;

/** Redact values in config:set arguments like KEY=value → KEY=***. */
function redactArgs(args: string[]): string[] {
  return args.map((arg) => {
    // config:set APP KEY=value → redact the value part
    const eqIdx = arg.indexOf("=");
    if (eqIdx > 0) {
      const key = arg.slice(0, eqIdx);
      if (SENSITIVE_PATTERNS.test(key)) {
        return `${key}=***`;
      }
    }
    return arg;
  });
}

export function auditLog(
  args: string[],
  status: "ok" | "error",
  durationMs: number,
  error?: string,
): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    cmd: args[0] ?? "unknown",
    args: redactArgs(args.slice(1)),
    status,
    ms: Math.round(durationMs),
  };
  if (error) entry.error = error.slice(0, 200);
  console.log(JSON.stringify(entry));
}
