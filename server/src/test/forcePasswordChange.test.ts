/**
 * Proves the forced-password-change flow end to end: a staff-created
 * member login starts with mustChangePassword=true, is reported fresh
 * by both /auth/login and /auth/me, a wrong current password is
 * rejected, and a correct change clears the flag and lets the login
 * stand on its own password afterward.
 *
 * Run with: npm test (see package.json)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import bcrypt from "bcryptjs";
import { app } from "../app";
import { prisma } from "../lib/prisma";

const RUN_ID = Date.now();
const TEMP_PASSWORD = "TempPassword123!";
const NEW_PASSWORD = "MyOwnPassword456!";

let member: { id: string };
let staffUser: { id: string; email: string };
let staffToken: string;

before(async () => {
  const passwordHash = await bcrypt.hash(TEMP_PASSWORD, 10);
  staffUser = await prisma.user.create({
    data: { name: "Test Staff", email: `test-staff-pw-${RUN_ID}@example.com`, passwordHash, role: "manager" },
  });
  member = await prisma.member.create({
    data: { memberNumber: `TEST-PW-${RUN_ID}`, fullName: "Test Password Member", status: "active" },
  });
  await prisma.shareCapitalAccount.create({ data: { memberId: member.id, balance: 0 } });

  const loginStaff = await request(app)
    .post("/api/auth/login")
    .send({ email: staffUser.email, password: TEMP_PASSWORD });
  staffToken = loginStaff.body.token;
  assert.ok(staffToken, "staff login should succeed");
});

after(async () => {
  await prisma.user.deleteMany({ where: { memberId: member.id } });
  await prisma.user.deleteMany({ where: { id: staffUser.id } });
  await prisma.shareCapitalAccount.deleteMany({ where: { memberId: member.id } });
  await prisma.member.deleteMany({ where: { id: member.id } });
  await prisma.$disconnect();
});

test("a staff-created member login starts with mustChangePassword true, reported at login", async () => {
  const createRes = await request(app)
    .post(`/api/members/${member.id}/login`)
    .set("Authorization", `Bearer ${staffToken}`)
    .send({ email: `test-member-pw-${RUN_ID}@example.com`, password: TEMP_PASSWORD });
  assert.equal(createRes.status, 201);

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: `test-member-pw-${RUN_ID}@example.com`, password: TEMP_PASSWORD });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.user.mustChangePassword, true);

  const memberToken = loginRes.body.token;
  const meRes = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${memberToken}`);
  assert.equal(meRes.body.user.mustChangePassword, true);
});

test("changing the password with the wrong current password is rejected", async () => {
  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: `test-member-pw-${RUN_ID}@example.com`, password: TEMP_PASSWORD });
  const memberToken = loginRes.body.token;

  const res = await request(app)
    .post("/api/auth/change-password")
    .set("Authorization", `Bearer ${memberToken}`)
    .send({ currentPassword: "WrongPassword!", newPassword: NEW_PASSWORD });
  assert.equal(res.status, 400);
});

test("changing the password with the correct current password clears mustChangePassword", async () => {
  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: `test-member-pw-${RUN_ID}@example.com`, password: TEMP_PASSWORD });
  const memberToken = loginRes.body.token;

  const changeRes = await request(app)
    .post("/api/auth/change-password")
    .set("Authorization", `Bearer ${memberToken}`)
    .send({ currentPassword: TEMP_PASSWORD, newPassword: NEW_PASSWORD });
  assert.equal(changeRes.status, 200);
  assert.equal(changeRes.body.changed, true);

  const meRes = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${memberToken}`);
  assert.equal(meRes.body.user.mustChangePassword, false);

  // Old password no longer works, new one does.
  const oldLogin = await request(app)
    .post("/api/auth/login")
    .send({ email: `test-member-pw-${RUN_ID}@example.com`, password: TEMP_PASSWORD });
  assert.equal(oldLogin.status, 401);

  const newLogin = await request(app)
    .post("/api/auth/login")
    .send({ email: `test-member-pw-${RUN_ID}@example.com`, password: NEW_PASSWORD });
  assert.equal(newLogin.status, 200);
  assert.equal(newLogin.body.user.mustChangePassword, false);
});

test("a staff-reset password sets mustChangePassword true again", async () => {
  const resetRes = await request(app)
    .patch(`/api/members/${member.id}/login`)
    .set("Authorization", `Bearer ${staffToken}`)
    .send({ password: "AnotherTempPassword789!" });
  assert.equal(resetRes.status, 200);

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: `test-member-pw-${RUN_ID}@example.com`, password: "AnotherTempPassword789!" });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.user.mustChangePassword, true);
});
