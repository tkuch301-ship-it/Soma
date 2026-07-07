import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";
import { resetDbForTests } from "../lib/db";

/**
 * Points SOMA_DB_PATH at a fresh temp directory before every test and tears
 * it down afterwards so each test gets an isolated better-sqlite3 database
 * and no temp files are left behind on disk.
 *
 * Call this once inside a `describe` block:
 *
 *   describe("repo", () => {
 *     useTempDb();
 *     it(...)
 *   });
 */
export function useTempDb(): void {
  let tmpDir: string | undefined;
  const originalDbPath = process.env.SOMA_DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "soma-test-"));
    process.env.SOMA_DB_PATH = path.join(tmpDir, "test.db");
    // Drop any connection cached under a previous path/test.
    resetDbForTests();
  });

  afterEach(() => {
    resetDbForTests();
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
    if (originalDbPath === undefined) {
      delete process.env.SOMA_DB_PATH;
    } else {
      process.env.SOMA_DB_PATH = originalDbPath;
    }
  });
}
