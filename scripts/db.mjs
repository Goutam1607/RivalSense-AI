#!/usr/bin/env node
// Local PostgreSQL helper: `node scripts/db.mjs up|down|status`.
//
// Uses Docker (docker-compose.yml) when Docker is installed and running.
// Otherwise falls back to a real PostgreSQL server from the `embedded-postgres`
// npm binaries, stored in .data/postgres. Both expose the same DATABASE_URL.
// Set DB_MODE=docker or DB_MODE=embedded to force one.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// Load .env so DATABASE_URL drives port/user/password/db name.
try {
  require("dotenv").config({ path: path.join(root, ".env"), quiet: true });
} catch {
  /* dotenv optional */
}

const url = new URL(process.env.DATABASE_URL ?? "postgresql://rivalsense:rivalsense@localhost:5432/rivalsense");
const cfg = {
  user: decodeURIComponent(url.username || "rivalsense"),
  password: decodeURIComponent(url.password || "rivalsense"),
  port: Number(url.port || 5432),
  database: url.pathname.replace(/^\//, "") || "rivalsense",
};

const dataDir = path.join(root, ".data", "postgres");
const logFile = path.join(root, ".data", "postgres.log");

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: "pipe", encoding: "utf8", windowsHide: true, ...opts });
}

function dockerAvailable() {
  if (process.env.DB_MODE === "embedded") return false;
  const r = run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  if (r.status === 0) return true;
  if (process.env.DB_MODE === "docker") {
    console.error("DB_MODE=docker but Docker is not running. Start Docker Desktop first.");
    process.exit(1);
  }
  return false;
}

let bins;
async function loadBinaries() {
  const pkg = `@embedded-postgres/${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
  try {
    bins = await import(pkg);
  } catch {
    console.error(`Could not find ${pkg}. Run "npm install" from the repo root first.`);
    process.exit(1);
  }
}

function exe(name) {
  return bins[name];
}

function isRunning() {
  if (!existsSync(dataDir)) return false;
  return run(exe("pg_ctl"), ["status", "-D", dataDir]).status === 0;
}

async function ensureDatabase() {
  const { default: pg } = await import("pg");
  const admin = new pg.Client({ host: "localhost", port: cfg.port, user: cfg.user, password: cfg.password, database: "postgres" });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [cfg.database]);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${cfg.database.replace(/"/g, "")}"`);
    console.log(`Created database "${cfg.database}".`);
  }
  await admin.end();
}

async function embeddedUp() {
  await loadBinaries();
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    console.log("Initialising a new local PostgreSQL data directory in .data/postgres ...");
    mkdirSync(dataDir, { recursive: true });
    const pwFile = path.join(root, ".data", "pwfile.tmp");
    writeFileSync(pwFile, cfg.password);
    const r = run(exe("initdb"), ["-D", dataDir, "-U", cfg.user, "-A", "scram-sha-256", `--pwfile=${pwFile}`, "-E", "UTF8", "--locale=C"]);
    rmSync(pwFile, { force: true });
    if (r.status !== 0) {
      console.error(r.stdout, r.stderr);
      process.exit(1);
    }
  }
  if (isRunning()) {
    console.log(`PostgreSQL is already running on port ${cfg.port}.`);
  } else {
    const r = run(exe("pg_ctl"), ["start", "-D", dataDir, "-l", logFile, "-w", "-o", `-p ${cfg.port}`], { stdio: "ignore" });
    if (r.status !== 0) {
      console.error(`PostgreSQL failed to start. See ${logFile}.`);
      process.exit(1);
    }
    console.log(`PostgreSQL started on port ${cfg.port} (embedded, data in .data/postgres).`);
  }
  await ensureDatabase();
}

async function embeddedDown() {
  await loadBinaries();
  if (!isRunning()) return console.log("PostgreSQL is not running.");
  run(exe("pg_ctl"), ["stop", "-D", dataDir, "-m", "fast", "-w"]);
  console.log("PostgreSQL stopped.");
}

async function dockerUp() {
  const r = run("docker", ["compose", "up", "-d", "--wait"], { cwd: root, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log(`PostgreSQL running in Docker on port ${cfg.port}.`);
}

const cmd = process.argv[2];
const useDocker = dockerAvailable();
if (cmd === "up") {
  await (useDocker ? dockerUp() : embeddedUp());
} else if (cmd === "down") {
  if (useDocker) run("docker", ["compose", "down"], { cwd: root, stdio: "inherit" });
  else await embeddedDown();
} else if (cmd === "status") {
  if (useDocker) run("docker", ["compose", "ps"], { cwd: root, stdio: "inherit" });
  else {
    await loadBinaries();
    console.log(isRunning() ? `Running (embedded) on port ${cfg.port}.` : "Not running.");
  }
} else {
  console.log("Usage: node scripts/db.mjs up|down|status");
  process.exit(1);
}
