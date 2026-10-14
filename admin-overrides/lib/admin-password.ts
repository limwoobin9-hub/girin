import { scrypt, timingSafeEqual } from "node:crypto";

export function adminConfigured(): boolean {
  return /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(process.env.GIRIN_ADMIN_PASSWORD_HASH ?? "") &&
    (process.env.GIRIN_ADMIN_SESSION_SECRET?.length ?? 0) >= 32;
}

export async function verifyAdminPassword(username: string, password: string): Promise<boolean> {
  if (!adminConfigured()) return false;
  const [, salt, expected] = process.env.GIRIN_ADMIN_PASSWORD_HASH!.split(":");
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, Buffer.from(salt, "hex"), 64, { N: 16384, r: 8, p: 1 }, (error, value) => error ? reject(error) : resolve(value));
  });
  const passwordMatches = timingSafeEqual(derived, Buffer.from(expected, "hex"));
  return passwordMatches && username === "admin";
}
