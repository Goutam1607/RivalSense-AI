#!/usr/bin/env node
// Runs a command with the pipeline's virtual-environment Python (cross-platform): node scripts/pipeline.mjs -m pytest
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "services", "pipeline");
const venv = process.platform === "win32" ? path.join(dir, ".venv", "Scripts", "python.exe") : path.join(dir, ".venv", "bin", "python");
const python = existsSync(venv) ? venv : "python";
const r = spawnSync(python, process.argv.slice(2), { cwd: dir, stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
process.exit(r.status ?? 1);
