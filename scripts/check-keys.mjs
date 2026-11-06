/**
 * Guards the project's key policy at build time.
 *
 * The barcode-database keys are paid/rate-limited test credentials. They must
 * never reach a published bundle, and the whole design leans on Vite's
 * dead-code elimination to guarantee that. This runs before `vite build` and
 * fails loudly if the guarantee is ever broken, so a future refactor that
 * accidentally reads a barcode key outside the `import.meta.env.DEV` guard is
 * caught here instead of in production.
 *
 * It also refuses to build if a barcode key was pasted into a tracked file,
 * which is the other way these leak.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Barcode env vars that must not ship. */
const BARCODE_VARS = [
  "VITE_UPCMDB_API_KEY",
  "VITE_UPCDATABASE_API_KEY",
  "VITE_EANDATA_API_KEY",
  "VITE_UPCITEMDB_API_KEY",
];

/** The single module allowed to read them, and only behind the DEV guard. */
const GATED_MODULE = "src/config/envKeys.ts";

/**
 * Paths that legitimately name these variables without shipping a value:
 * type declarations (no runtime code) and test infrastructure (not imported by
 * the app, so it is never bundled).
 */
const ALLOWED_PATHS = [GATED_MODULE, "src/test/", "src/vite-env.d.ts"];

function isAllowed(rel) {
  return ALLOWED_PATHS.some((allowed) => rel === allowed || rel.startsWith(allowed));
}

const ROOT = new URL("..", import.meta.url).pathname;
const ERRORS = [];

/* 1. Only the gated module may read a barcode env var at runtime. */
for (const file of sourceFiles(join(ROOT, "src"))) {
  const rel = relative(ROOT, file);
  if (isAllowed(rel)) continue;
  const text = readFileSync(file, "utf8");
  for (const name of BARCODE_VARS) {
    if (text.includes(name)) {
      ERRORS.push(`${rel} reads ${name}; only ${GATED_MODULE} may, behind import.meta.env.DEV`);
    }
  }
}

/* 2. That module must actually gate on DEV. */
{
  const gated = readFileSync(join(ROOT, GATED_MODULE), "utf8");
  if (!gated.includes("import.meta.env.DEV")) {
    ERRORS.push(`${GATED_MODULE} no longer checks import.meta.env.DEV, so keys would ship`);
  }
}

/* 3. No real key value may appear in a tracked source or doc file. */
for (const secret of localSecretValues()) {
  for (const file of trackedTextFiles()) {
    const rel = relative(ROOT, file);
    if (rel.startsWith(".env")) continue;
    if (readFileSync(file, "utf8").includes(secret.value)) {
      ERRORS.push(`${rel} contains the literal value of ${secret.name}; move it to a .env file`);
    }
  }
}

if (ERRORS.length > 0) {
  console.error("\nKey policy violated:\n");
  for (const error of ERRORS) console.error(`  - ${error}`);
  console.error("\nBarcode keys are dev-only. See README.md > Configuration.\n");
  process.exit(1);
}

console.log("Key policy OK: barcode keys are reachable in development only.");

/**
 * Values from the developer's own `.env.development.local`, if present. Used to
 * detect a key copy-pasted into source. A missing file is fine (CI, fresh clone).
 */
function localSecretValues() {
  const envFiles = [".env.development.local", ".env.local"];
  const found = [];
  for (const envFile of envFiles) {
    let text;
    try {
      text = readFileSync(join(ROOT, envFile), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!match) continue;
      const [, name, value] = match;
      // Short or obviously-placeholder values would produce false positives.
      if (value.trim().length >= 12) found.push({ name, value: value.trim() });
    }
  }
  return found;
}

/** Text files that could accidentally embed a key. */
function* trackedTextFiles() {
  const skipDirs = new Set(["node_modules", "dist", ".git", "coverage", ".vite"]);
  const roots = ["src", "scripts", "public", "."];
  const seen = new Set();
  for (const entry of roots) {
    const path = join(ROOT, entry);
    let entries;
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of entries) {
      if (item.isDirectory()) {
        if (skipDirs.has(item.name)) continue;
        for (const nested of walk(join(path, item.name), skipDirs)) {
          if (!seen.has(nested)) {
            seen.add(nested);
            yield nested;
          }
        }
      } else if (/\.(ts|tsx|js|mjs|md|json|html)$/.test(item.name)) {
        const file = join(path, item.name);
        if (!seen.has(file)) {
          seen.add(file);
          yield file;
        }
      }
    }
  }
}

function* walk(dir, skipDirs) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const item of entries) {
    const path = join(dir, item.name);
    if (item.isDirectory()) {
      if (skipDirs.has(item.name)) continue;
      yield* walk(path, skipDirs);
    } else if (/\.(ts|tsx|js|mjs|md|json|html)$/.test(item.name)) {
      yield path;
    }
  }
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* sourceFiles(path);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) {
      yield path;
    }
  }
}