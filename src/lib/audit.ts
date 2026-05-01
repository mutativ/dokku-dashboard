/** Structured audit logger for SSH command execution. */

const SENSITIVE_PATTERNS = /KEY|SECRET|HASH|PASSWORD|TOKEN|PRIVATE|CREDENTIAL|DSN/i;
const SLOW_COMMAND_MS = 1_000;

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
  if (durationMs >= SLOW_COMMAND_MS) entry.slow = true;

  const line = JSON.stringify(entry);
  if (status === "error") {
    console.error(line);
  } else if (durationMs >= SLOW_COMMAND_MS) {
    console.warn(line);
  } else {
    console.log(line);
  }
}
