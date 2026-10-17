// Data layer: two implementations behind one async API.
// - memory: used when no database URL env var is set (tests, local dev)
// - neon:   Netlify DB / Neon Postgres (production)

export const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const ROUNDS = ["R1", "R2", "R3"];
export const CATS = ["Solo", "Group"];
export const SONG_COUNT = 50;
export const FOOD_STATUS = ["Needed", "Sourcing", "Ready"];

export const DEFAULT_FOOD = [
  "Soft drinks (assorted)", "Juices / juice boxes", "Bottled water", "Ice",
  "Cups", "Napkins", "Plates",
  "Hot dogs + buns", "Hamburgers + buns", "Veggie burgers + buns",
  "Burger toppings (lettuce, tomato, onion, cheese)", "Ketchup / mustard / relish",
  "Fish cakes", "Samosas",
  "Chicken wings — fried", "Chicken wings — BBQ + sauce",
  "Serving trays", "Tongs & food gloves", "Warming trays / chafing dishes",
  "Tablecloths", "Trash bags", "Cash box + change for food sales"
];

const DEFAULT_SETTINGS = { advSemi: 6, advFinal: 3 };

// ---------------- Memory implementation ----------------
let mem = null;
function memDb() {
  if (!mem) {
    mem = {
      claims: {},
      perfs: [],
      settings: {},
      food: DEFAULT_FOOD.map((item, i) => ({ id: i + 1, item, qty: "", source: "", prep: "", serve: "", status: "Needed" })),
      _pid: 1,
      _fid: DEFAULT_FOOD.length + 1
    };
  }
  return mem;
}
export function _resetMemory() { mem = null; }

const memStore = {
  async getState() {
    const m = memDb();
    return {
      claims: { ...m.claims },
      performances: m.perfs.map(p => ({ ...p })),
      settings: { ...DEFAULT_SETTINGS, ...m.settings },
      food: m.food.map(f => ({ ...f }))
    };
  },
  async setClaim(index, month) {
    const m = memDb();
    if (month) m.claims[index] = month; else delete m.claims[index];
    return { index, month: month || null };
  },
  async addPerformance(p) {
    const m = memDb();
    const row = { id: m._pid++, ...p };
    m.perfs.push(row);
    return row;
  },
  async deletePerformance(id) {
    const m = memDb();
    const i = m.perfs.findIndex(p => p.id === id);
    if (i === -1) return false;
    m.perfs.splice(i, 1);
    return true;
  },
  async setSetting(key, value) {
    memDb().settings[key] = value;
    return { key, value };
  },
  async addFood(item, qty) {
    const m = memDb();
    const row = { id: m._fid++, item, qty: qty || "", source: "", prep: "", serve: "", status: "Needed" };
    m.food.push(row);
    return row;
  },
  async updateFood(id, fields) {
    const m = memDb();
    const row = m.food.find(f => f.id === id);
    if (!row) return null;
    for (const k of ["item", "qty", "source", "prep", "serve", "status"]) {
      if (fields[k] !== undefined) row[k] = fields[k];
    }
    return row;
  },
  async deleteFood(id) {
    const m = memDb();
    const i = m.food.findIndex(f => f.id === id);
    if (i === -1) return false;
    m.food.splice(i, 1);
    return true;
  },
  async init() {
    memDb(); // seeds itself
    return { seeded: true };
  }
};

// ---------------- Neon implementation ----------------
// Built-in Netlify Database injects NETLIFY_DB_URL; the older Neon extension
// used NETLIFY_DATABASE_URL — accept either.
const dbUrl = () => process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL;
let neonSql = null;
async function sql() {
  if (!neonSql) {
    const { neon } = await import("@netlify/neon");
    neonSql = neon(dbUrl());
  }
  return neonSql;
}

const neonStore = {
  async getState() {
    const s = await sql();
    const claims = {};
    for (const r of await s`SELECT song_index, month FROM claims`) claims[r.song_index] = r.month;
    const performances = await s`SELECT id, round, month, category AS cat, song, judges, votes FROM performances ORDER BY id`;
    const settings = { ...DEFAULT_SETTINGS };
    for (const r of await s`SELECT key, value FROM settings`) {
      const v = parseInt(r.value);
      settings[r.key] = Number.isNaN(v) ? r.value : v;
    }
    const food = await s`SELECT id, item, qty, source, prep, serve, status FROM food_items ORDER BY id`;
    return { claims, performances, settings, food };
  },
  async setClaim(index, month) {
    const s = await sql();
    if (month) {
      await s`INSERT INTO claims (song_index, month) VALUES (${index}, ${month})
              ON CONFLICT (song_index) DO UPDATE SET month = ${month}, claimed_at = now()`;
    } else {
      await s`DELETE FROM claims WHERE song_index = ${index}`;
    }
    return { index, month: month || null };
  },
  async addPerformance(p) {
    const s = await sql();
    const [row] = await s`INSERT INTO performances (round, month, category, song, judges, votes)
                          VALUES (${p.round}, ${p.month}, ${p.cat}, ${p.song}, ${p.judges}, ${p.votes})
                          RETURNING id, round, month, category AS cat, song, judges, votes`;
    return row;
  },
  async deletePerformance(id) {
    const s = await sql();
    const r = await s`DELETE FROM performances WHERE id = ${id} RETURNING id`;
    return r.length > 0;
  },
  async setSetting(key, value) {
    const s = await sql();
    await s`INSERT INTO settings (key, value) VALUES (${key}, ${String(value)})
            ON CONFLICT (key) DO UPDATE SET value = ${String(value)}`;
    return { key, value };
  },
  async addFood(item, qty) {
    const s = await sql();
    const [row] = await s`INSERT INTO food_items (item, qty) VALUES (${item}, ${qty || ""})
                          RETURNING id, item, qty, source, prep, serve, status`;
    return row;
  },
  async updateFood(id, fields) {
    const s = await sql();
    const allowed = ["item", "qty", "source", "prep", "serve", "status"];
    const sets = allowed.filter(k => fields[k] !== undefined);
    if (!sets.length) {
      const [row] = await s`SELECT id, item, qty, source, prep, serve, status FROM food_items WHERE id = ${id}`;
      return row || null;
    }
    // build SET clause dynamically via individual updates (safe — keys are whitelisted)
    let row = null;
    for (const k of sets) {
      const col = k; // whitelisted column name
      const r = await s.query(
        `UPDATE food_items SET ${col} = $1 WHERE id = $2 RETURNING id, item, qty, source, prep, serve, status`,
        [fields[k], id]
      );
      row = r[0];
    }
    return row;
  },
  async deleteFood(id) {
    const s = await sql();
    const r = await s`DELETE FROM food_items WHERE id = ${id} RETURNING id`;
    return r.length > 0;
  },
  async init() {
    const s = await sql();
    await s`CREATE TABLE IF NOT EXISTS claims (
      song_index integer PRIMARY KEY,
      month text NOT NULL,
      claimed_at timestamptz DEFAULT now()
    )`;
    await s`CREATE TABLE IF NOT EXISTS performances (
      id serial PRIMARY KEY,
      round text NOT NULL,
      month text NOT NULL,
      category text NOT NULL,
      song text DEFAULT '',
      judges integer DEFAULT 0,
      votes integer DEFAULT 0,
      created_at timestamptz DEFAULT now()
    )`;
    await s`CREATE TABLE IF NOT EXISTS settings (
      key text PRIMARY KEY,
      value text NOT NULL
    )`;
    await s`CREATE TABLE IF NOT EXISTS food_items (
      id serial PRIMARY KEY,
      item text NOT NULL,
      qty text DEFAULT '',
      source text DEFAULT '',
      prep text DEFAULT '',
      serve text DEFAULT '',
      status text DEFAULT 'Needed'
    )`;
    const [{ n }] = await s`SELECT count(*)::int AS n FROM food_items`;
    if (n === 0) {
      for (const item of DEFAULT_FOOD) {
        await s`INSERT INTO food_items (item) VALUES (${item})`;
      }
    }
    return { seeded: true };
  }
};

// ---------------- Dispatcher ----------------
const useMemory = () => !dbUrl();

export const store = {
  getState:        (...a) => (useMemory() ? memStore : neonStore).getState(...a),
  setClaim:        (...a) => (useMemory() ? memStore : neonStore).setClaim(...a),
  addPerformance:  (...a) => (useMemory() ? memStore : neonStore).addPerformance(...a),
  deletePerformance: (...a) => (useMemory() ? memStore : neonStore).deletePerformance(...a),
  setSetting:      (...a) => (useMemory() ? memStore : neonStore).setSetting(...a),
  addFood:         (...a) => (useMemory() ? memStore : neonStore).addFood(...a),
  updateFood:      (...a) => (useMemory() ? memStore : neonStore).updateFood(...a),
  deleteFood:      (...a) => (useMemory() ? memStore : neonStore).deleteFood(...a),
  init:            (...a) => (useMemory() ? memStore : neonStore).init(...a)
};
