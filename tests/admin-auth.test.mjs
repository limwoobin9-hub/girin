import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { sealData } from "iron-session";
import { issueAdminSession, readAdminToken, safeReturnTo, SESSION_SECONDS } from "../admin-overrides/lib/admin-session.ts";
import { adminConfigured, verifyAdminPassword } from "../admin-overrides/lib/admin-password.ts";
import { takeLoginAttempt } from "../admin-overrides/lib/admin-throttle.ts";

const secret = randomBytes(48).toString("hex");
const salt = randomBytes(16);
process.env.GIRIN_ADMIN_SESSION_SECRET = secret;
process.env.GIRIN_ADMIN_PASSWORD_HASH = `scrypt:${salt.toString("hex")}:${scryptSync("test-only-password", salt, 64).toString("hex")}`;

test("only the configured administrator credentials succeed", async () => {
  assert.equal(adminConfigured(), true);
  assert.equal(await verifyAdminPassword("admin", "test-only-password"), true);
  assert.equal(await verifyAdminPassword("admin", "incorrect"), false);
  assert.equal(await verifyAdminPassword("student", "test-only-password"), false);
  assert.equal(await verifyAdminPassword("Admin", "test-only-password"), false);
});

test("sessions are opaque, encrypted and authenticated", async () => {
  const token = await issueAdminSession();
  assert.equal(token.includes("admin"), false);
  assert.equal((await readAdminToken(token))?.role, "admin");
  assert.equal(await readAdminToken(token.slice(0, -10) + "tampered"), null);
  assert.equal(await readAdminToken(undefined), null);
  assert.equal(await readAdminToken("admin"), null);
});

test("non-admin claims and expired sessions cannot authorize access", async () => {
  const issuedAt = Date.now();
  const valid = { username: "admin", role: "admin", version: 1, issuedAt, expiresAt: issuedAt + SESSION_SECONDS * 1000 };
  for (const data of [
    { ...valid, role: "student" },
    { ...valid, username: "student" },
    { ...valid, version: 2 },
    { ...valid, issuedAt: issuedAt - SESSION_SECONDS * 1000 - 1000, expiresAt: issuedAt - 1000 },
  ]) {
    const token = await sealData(data, { password: secret, ttl: SESSION_SECONDS });
    assert.equal(await readAdminToken(token), null);
  }
});

test("missing secrets fail closed", async () => {
  const token = await issueAdminSession();
  delete process.env.GIRIN_ADMIN_SESSION_SECRET;
  try {
    assert.equal(adminConfigured(), false);
    assert.equal(await readAdminToken(token), null);
    await assert.rejects(issueAdminSession());
  } finally { process.env.GIRIN_ADMIN_SESSION_SECRET = secret; }
});

test("return URLs stay within existing protected pages", () => {
  assert.equal(safeReturnTo("/scores?sort=new"), "/scores?sort=new");
  for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "/login", "/api/answers", "/%2f%2fevil.example"]) assert.equal(safeReturnTo(value), "/");
});

test("repeated attempts are throttled", () => {
  const ip = randomBytes(8).toString("hex");
  for (let i = 0; i < 10; i++) assert.equal(takeLoginAttempt(ip), 0);
  assert.ok(takeLoginAttempt(ip) > 0);
});
