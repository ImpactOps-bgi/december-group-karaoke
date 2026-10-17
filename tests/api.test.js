import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.ADMIN_KEY = "test-admin-key";
delete process.env.NETLIFY_DATABASE_URL; // force memory store

const { _resetMemory, DEFAULT_FOOD } = await import("../netlify/functions/lib/store.js");
const { default: state } = await import("../netlify/functions/state.js");
const { default: ping } = await import("../netlify/functions/ping.js");
const { default: init } = await import("../netlify/functions/init.js");
const { default: claim } = await import("../netlify/functions/claim.js");
const { default: performance } = await import("../netlify/functions/performance.js");
const { default: settings } = await import("../netlify/functions/settings.js");
const { default: food } = await import("../netlify/functions/food.js");

const AUTH = { "content-type": "application/json", "x-admin-key": "test-admin-key" };

const req = (method, body) =>
  new Request("http://test/api", {
    method,
    headers: body ? AUTH : {},
    body: body ? JSON.stringify(body) : undefined
  });
const adminReq = (method, bodyOrUrl) =>
  method === "GET" || method === "DELETE"
    ? new Request(bodyOrUrl, { method, headers: AUTH })
    : req(method, bodyOrUrl);
const get = () => state(new Request("http://test/api/state"));
const post = (fn, body) => fn(new Request("http://test", { method: "POST", headers: AUTH, body: JSON.stringify(body) }));
const noAuth = (fn, body) => fn(new Request("http://test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => _resetMemory());

// ---------- auth ----------
test("admin endpoints reject missing key", async () => {
  for (const fn of [ping, init]) {
    assert.equal((await fn(new Request("http://t"))).status, 401);
  }
  for (const [fn, body] of [[claim, { index: 0, month: "March" }], [settings, { key: "advSemi", value: 5 }]]) {
    assert.equal((await noAuth(fn, body)).status, 401);
  }
  assert.equal((await noAuth(performance, { round: "R1", month: "March", cat: "Solo", judges: 50, votes: 10 })).status, 401);
  assert.equal((await noAuth(food, { item: "Napkins" })).status, 401);
});

test("admin endpoints reject wrong key", async () => {
  const r = await ping(new Request("http://t", { headers: { "x-admin-key": "wrong" } }));
  assert.equal(r.status, 401);
});

test("ping accepts correct key", async () => {
  const r = await ping(new Request("http://t", { headers: { "x-admin-key": "test-admin-key" } }));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

// ---------- state ----------
test("GET state returns seeded shape", async () => {
  const r = await get();
  assert.equal(r.status, 200);
  const s = await r.json();
  assert.deepEqual(s.claims, {});
  assert.deepEqual(s.performances, []);
  assert.equal(s.settings.advSemi, 6);
  assert.equal(s.settings.advFinal, 3);
  assert.equal(s.food.length, DEFAULT_FOOD.length);
  assert.equal(s.food[0].status, "Needed");
});

// ---------- claims ----------
test("claim and unclaim a song", async () => {
  assert.equal((await post(claim, { index: 5, month: "March" })).status, 200);
  const s1 = await (await get()).json();
  assert.equal(s1.claims["5"], "March");
  await post(claim, { index: 5, month: "" });
  const s2 = await (await get()).json();
  assert.equal(s2.claims["5"], undefined);
});

test("claim rejects bad index and bad month", async () => {
  assert.equal((await post(claim, { index: 99, month: "March" })).status, 400);
  assert.equal((await post(claim, { index: -1, month: "March" })).status, 400);
  assert.equal((await post(claim, { index: 5, month: "Smarch" })).status, 400);
});

// ---------- performances ----------
test("add and delete performance", async () => {
  const r = await post(performance, { round: "R1", month: "June", cat: "Group", song: "Stomp", judges: 80, votes: 42 });
  assert.equal(r.status, 201);
  const row = await r.json();
  assert.ok(row.id > 0);
  const s = await (await get()).json();
  assert.equal(s.performances.length, 1);
  assert.equal(s.performances[0].votes, 42);

  const del = await performance(new Request(`http://t?id=${row.id}`, { method: "DELETE", headers: AUTH }));
  assert.equal(del.status, 200);
  assert.equal((await (await get()).json()).performances.length, 0);
});

test("performance validation", async () => {
  assert.equal((await post(performance, { round: "R9", month: "June", cat: "Solo" })).status, 400);
  assert.equal((await post(performance, { round: "R1", month: "Smarch", cat: "Solo" })).status, 400);
  assert.equal((await post(performance, { round: "R1", month: "June", cat: "Duet" })).status, 400);
  assert.equal((await post(performance, { round: "R1", month: "June", cat: "Solo", judges: 150 })).status, 400);
  assert.equal((await post(performance, { round: "R1", month: "June", cat: "Solo", votes: -5 })).status, 400);
});

test("delete unknown performance 404s", async () => {
  const r = await performance(new Request("http://t?id=999", { method: "DELETE", headers: AUTH }));
  assert.equal(r.status, 404);
});

// ---------- settings ----------
test("settings update and validation", async () => {
  assert.equal((await post(settings, { key: "advFinal", value: 4 })).status, 200);
  assert.equal((await (await get()).json()).settings.advFinal, 4);
  assert.equal((await post(settings, { key: "advSemi", value: 99 })).status, 400);
  assert.equal((await post(settings, { key: "password", value: 1 })).status, 400);
});

// ---------- food ----------
test("food add, update, delete", async () => {
  const add = await post(food, { item: "Charcoal for grill", qty: "2 bags" });
  assert.equal(add.status, 201);
  const row = await add.json();

  const upd = await food(new Request("http://t", { method: "PUT", headers: AUTH, body: JSON.stringify({ id: row.id, source: "Alex", status: "Ready" }) }));
  assert.equal(upd.status, 200);
  const updated = await upd.json();
  assert.equal(updated.source, "Alex");
  assert.equal(updated.status, "Ready");

  const s = await (await get()).json();
  assert.equal(s.food.length, DEFAULT_FOOD.length + 1);

  const del = await food(new Request(`http://t?id=${row.id}`, { method: "DELETE", headers: AUTH }));
  assert.equal(del.status, 200);
  assert.equal((await (await get()).json()).food.length, DEFAULT_FOOD.length);
});

test("food validation", async () => {
  assert.equal((await post(food, { item: "  " })).status, 400);
  const badStatus = await food(new Request("http://t", { method: "PUT", headers: AUTH, body: JSON.stringify({ id: 1, status: "Maybe" }) }));
  assert.equal(badStatus.status, 400);
  const missing = await food(new Request("http://t", { method: "PUT", headers: AUTH, body: JSON.stringify({ id: 99999, item: "x" }) }));
  assert.equal(missing.status, 404);
});

// ---------- init ----------
test("init is idempotent and admin-gated", async () => {
  assert.equal((await noAuth(init, {})).status, 401);
  assert.equal((await post(init, {})).status, 200);
  assert.equal((await post(init, {})).status, 200); // second run no-op
});
