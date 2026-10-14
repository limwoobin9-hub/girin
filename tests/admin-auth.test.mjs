import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { sealData } from "iron-session";
import { issueAdminSession, readAdminToken, safeReturnTo, SESSION_SECONDS } from "../admin-overrides/lib/admin-session.ts";
import { adminConfigured, verifyAdminPassword } from "../admin-overrides/lib/admin-password.ts";
import { takeLoginAttempt } from "../admin-overrides/lib/admin-throttle.ts";
import { normalizeQuestions, readStudentQuestions, readQuestionsForStudents, withQuestionOwner } from "../admin-overrides/lib/student-questions.ts";

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
  assert.equal(safeReturnTo("/questions"), "/questions");
  for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "/login", "/api/answers", "/%2f%2fevil.example"]) assert.equal(safeReturnTo(value), "/");
});

test("repeated attempts are throttled", () => {
  const ip = randomBytes(8).toString("hex");
  for (let i = 0; i < 10; i++) assert.equal(takeLoginAttempt(ip), 0);
  assert.ok(takeLoginAttempt(ip) > 0);
});

test("question records preserve text and answers while rejecting invalid identifiers", () => {
  const rows = normalizeQuestions([
    { id: 2, body: "질문\n두 번째 줄", answer: "선생님 답변", image: "image.png", created_at: "2026-10-14 09:00" },
    { id: "3", body: "사진 질문", answer: "", image: true, created_at: "2026-10-14 10:00" },
    { id: 2, body: "중복" }, { id: "../admin", body: "잘못된 번호" }, null,
  ]);
  assert.deepEqual(rows.map((row) => row.id), [3, 2]);
  assert.equal(rows[1].body, "질문\n두 번째 줄");
  assert.equal(rows[1].answer, "선생님 답변");
  assert.equal(rows[0].image, true);
  assert.equal(rows[0].answer, "");
  assert.deepEqual(normalizeQuestions([]), []);
  assert.throws(() => normalizeQuestions({ error: "unavailable" }));
});

test("question lookup uses a read-only GET and surfaces upstream denial", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify([{ id: 5, body: "질문", answer: "답변" }]), { status: 200 });
  };
  try {
    const result = await readStudentQuestions("3291");
    assert.equal(result[0].answer, "답변");
    assert.equal(calls[0].url, "https://hw.girinkorean.com/api/my/3291/questions");
    assert.equal(calls[0].options.method, undefined);
    assert.equal(calls.length, 1);
    globalThis.fetch = async () => new Response("", { status: 403 });
    await assert.rejects(readStudentQuestions("3291"), /허용하지 않습니다/);
  } finally { globalThis.fetch = originalFetch; }
});

test("all-student lookup retains ownership and reports failures separately from empty records", async () => {
  const question = normalizeQuestions([{ id: 7, body: "질문", answer: "답변", image: true }]);
  const students = [{ id: "101", name: "가학생" }, { id: "102", name: "나학생" }, { id: "103", name: "다학생" }, { id: "104", name: "라학생" }];
  const result = await readQuestionsForStudents(students, async (id) => {
    if (id === "103") throw new Error("upstream unavailable");
    return id === "104" ? [] : question;
  });
  assert.equal(result.checked, 4);
  assert.equal(result.unavailable, 1);
  assert.deepEqual(result.items.map((row) => [row.student_id, row.student_name, row.id]), [["101", "가학생", 7], ["102", "나학생", 7]]);
  assert.equal(withQuestionOwner(students[0], question)[0].image, true);
});

test("all-student lookup bounds concurrent upstream requests", async () => {
  let active = 0, peak = 0, calls = 0;
  const students = Array.from({ length: 11 }, (_, id) => ({ id: String(id + 1), name: `학생${id + 1}` }));
  const result = await readQuestionsForStudents(students, async () => {
    calls++; active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setImmediate(resolve));
    active--;
    return [];
  });
  assert.equal(calls, students.length);
  assert.equal(result.checked, students.length);
  assert.equal(result.unavailable, 0);
  assert.ok(peak > 1 && peak <= 4);
});

