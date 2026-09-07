import fs from "node:fs";
import path from "node:path";

function cleanTestDb() {
  const dataDir = path.resolve("./data");
  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir);
    for (const f of files) {
      if (f.startsWith("test-backlog.db")) {
        try {
          fs.unlinkSync(path.join(dataDir, f));
        } catch {}
      }
    }
  }
}

export function setup() {
  cleanTestDb();
}

export function teardown() {
  cleanTestDb();
}
