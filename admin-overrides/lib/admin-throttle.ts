// A per-instance backstop for repeated login attempts; counters contain no credentials.
const attempts = new Map<string, { count: number; resetsAt: number }>();
const WINDOW_MS = 5 * 60_000;
const LIMIT = 10;

export function takeLoginAttempt(ip: string): number {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.resetsAt <= now) attempts.delete(key);
  const previous = attempts.get(ip);
  if (previous && previous.count >= LIMIT) return Math.ceil((previous.resetsAt - now) / 1000);
  if (attempts.size >= 4096 && !previous) attempts.delete(attempts.keys().next().value!);
  attempts.set(ip, previous ? { ...previous, count: previous.count + 1 } : { count: 1, resetsAt: now + WINDOW_MS });
  return 0;
}

export function resetLoginAttempts(ip: string) { attempts.delete(ip); }
