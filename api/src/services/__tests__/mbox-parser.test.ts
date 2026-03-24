import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

vi.mock("../ingestion.js", () => ({
  upsertContact: vi.fn().mockResolvedValue({ action: "created", contact: { id: "test-id" } }),
}));

import { parseMbox } from "../mbox-parser.js";

function writeTempMbox(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "mbox-test-"));
  const path = join(dir, "test.mbox");
  writeFileSync(path, content);
  return path;
}

function makeMockDb() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) } as any;
}

describe("parseMbox", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses plain text emails", async () => {
    const mbox = `From alice@example.com Thu Jan 02 10:00:00 2025
From: Alice <alice@example.com>
To: bob@example.com
Subject: Hello
Date: Thu, 02 Jan 2025 10:00:00 +0000
Message-ID: <msg001@example.com>

This is a plain text email.
`;
    const path = writeTempMbox(mbox);
    const db = makeMockDb();
    const result = await parseMbox(path, db);
    expect(result.contacts).toBeGreaterThan(0);
    expect(result.interactions).toBeGreaterThan(0);
    unlinkSync(path);
  });

  it("handles HTML-only emails with fallback", async () => {
    const mbox = `From notifications@site.com Sat Jan 04 08:00:00 2025
From: Site <notifications@site.com>
To: user@example.com
Subject: HTML Only
Date: Sat, 04 Jan 2025 08:00:00 +0000
Message-ID: <html001@site.com>
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

<html><body><p>This is <strong>HTML only</strong> content.</p></body></html>
`;
    const path = writeTempMbox(mbox);
    const db = makeMockDb();
    const result = await parseMbox(path, db);
    expect(result.interactions).toBeGreaterThan(0);

    const insertCall = db.query.mock.calls.find((c: any[]) => c[0].includes("INSERT INTO interactions"));
    expect(insertCall).toBeDefined();
    const rawContent = insertCall![1][1];
    expect(rawContent).toContain("HTML only");
    expect(rawContent).not.toContain("<strong>");
    unlinkSync(path);
  });

  it("unescapes mboxrd >From lines", async () => {
    const mbox = `From alice@example.com Thu Jan 02 10:00:00 2025
From: Alice <alice@example.com>
To: bob@example.com
Subject: From Test
Date: Thu, 02 Jan 2025 10:00:00 +0000
Message-ID: <from-test@example.com>

Some text here.
>From our analysis, this should be unescaped.
More text.
`;
    const path = writeTempMbox(mbox);
    const db = makeMockDb();
    await parseMbox(path, db);

    const insertCall = db.query.mock.calls.find((c: any[]) => c[0].includes("INSERT INTO interactions"));
    const rawContent = insertCall![1][1];
    expect(rawContent).toContain("From our analysis");
    expect(rawContent).not.toContain(">From our analysis");
    unlinkSync(path);
  });

  it("splits multiple messages correctly", async () => {
    const mbox = `From alice@example.com Thu Jan 02 10:00:00 2025
From: Alice <alice@example.com>
To: bob@example.com
Subject: First
Date: Thu, 02 Jan 2025 10:00:00 +0000
Message-ID: <msg-a@example.com>

First message.

From charlie@example.com Fri Jan 03 11:00:00 2025
From: Charlie <charlie@example.com>
To: bob@example.com
Subject: Second
Date: Fri, 03 Jan 2025 11:00:00 +0000
Message-ID: <msg-b@example.com>

Second message.
`;
    const path = writeTempMbox(mbox);
    const db = makeMockDb();
    const result = await parseMbox(path, db);
    expect(result.contacts).toBe(3);
    unlinkSync(path);
  });

  it("filters out owner email", async () => {
    const prev = process.env.OWNER_EMAIL;
    process.env.OWNER_EMAIL = "owner@example.com";

    const mbox = `From alice@example.com Thu Jan 02 10:00:00 2025
From: Alice <alice@example.com>
To: owner@example.com
Subject: Test
Date: Thu, 02 Jan 2025 10:00:00 +0000
Message-ID: <owner-test@example.com>

Hello owner.
`;
    const path = writeTempMbox(mbox);
    const db = makeMockDb();
    const result = await parseMbox(path, db);
    expect(result.contacts).toBe(1);
    unlinkSync(path);
    process.env.OWNER_EMAIL = prev;
  });
});
