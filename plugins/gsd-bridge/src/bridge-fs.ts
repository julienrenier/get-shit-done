/**
 * Filesystem helper for gsd-bridge coordination files.
 *
 * The MCP server writes pending.json; the Elicitation hook (Plan 03) writes
 * response.json. Both live under {cwd}/.planning/.bridge/. Atomic rename
 * prevents the browser / hook from reading half-written state.
 *
 * Security (threat model T-01-02-01, T-01-02-02):
 *   - bridgeDir() refuses cwd values whose resolved .planning/.bridge/ path
 *     escapes the cwd root (path-traversal guard).
 *   - readResponse() caps JSON size at 256 KB (JSON bomb guard).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const BRIDGE_REL = path.join('.planning', '.bridge');
const MAX_RESPONSE_BYTES = 256_000;

export function bridgeDir(cwd: string): string {
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw new Error('bridgeDir: cwd must be a non-empty string');
  }
  const absCwd = path.resolve(cwd);
  const dir = path.resolve(absCwd, BRIDGE_REL);
  // Path traversal guard: resolved bridge dir must stay under absCwd.
  if (!dir.startsWith(absCwd + path.sep) && dir !== absCwd) {
    throw new Error('bridgeDir: resolved path escaped cwd');
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writePending(cwd: string, payload: unknown): string {
  const dir = bridgeDir(cwd);
  const target = path.join(dir, 'pending.json');
  const tmp = `${target}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
  fs.renameSync(tmp, target); // POSIX atomic on same volume
  return target;
}

export function readResponse(cwd: string): Record<string, unknown> | null {
  const target = path.join(bridgeDir(cwd), 'response.json');
  if (!fs.existsSync(target)) return null;
  try {
    const stat = fs.statSync(target);
    if (stat.size > MAX_RESPONSE_BYTES) return null; // 256_000 byte JSON bomb guard
    const raw = fs.readFileSync(target, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null; // stale/half-written file — silent
  }
}

export async function waitForResponse(
  cwd: string,
  opts: { timeoutMs: number; pollMs: number } = { timeoutMs: 120_000, pollMs: 250 },
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const r = readResponse(cwd);
    if (r !== null) {
      // Consume the response so the same bridge dir can be reused.
      try {
        fs.unlinkSync(path.join(bridgeDir(cwd), 'response.json'));
      } catch {
        // swallow: already consumed by another reader, or race on delete
      }
      return r;
    }
    await new Promise((res) => setTimeout(res, opts.pollMs));
  }
  throw new Error('waitForResponse: timeout');
}
