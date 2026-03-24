import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

vi.mock("../ingestion.js", () => ({
  upsertContact: vi.fn().mockResolvedValue({ action: "created", contact: { id: "test-id" } }),
}));

import { parseIcs } from "../ics-parser.js";

function writeTempIcs(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "ics-test-"));
  const path = join(dir, "test.ics");
  writeFileSync(path, content);
  return path;
}

function makeMockDb() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) } as any;
}

const wrapCalendar = (events: string) => `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
${events}
END:VCALENDAR`;

describe("parseIcs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses a simple event with attendees", async () => {
    const ics = wrapCalendar(`BEGIN:VEVENT
UID:simple@test.com
DTSTART:20250110T140000Z
DTEND:20250110T150000Z
SUMMARY:Team Meeting
STATUS:CONFIRMED
ATTENDEE;CUTYPE=INDIVIDUAL;PARTSTAT=ACCEPTED;CN="Alice":mailto:alice@example.com
ATTENDEE;CUTYPE=INDIVIDUAL;PARTSTAT=ACCEPTED;CN="Bob":mailto:bob@example.com
END:VEVENT`);
    const path = writeTempIcs(ics);
    const db = makeMockDb();
    const result = await parseIcs(path, db);
    expect(result.contacts).toBe(2);
    expect(result.interactions).toBe(2);
    unlinkSync(path);
  });

  it("skips cancelled events", async () => {
    const ics = wrapCalendar(`BEGIN:VEVENT
UID:cancelled@test.com
DTSTART:20250110T140000Z
DTEND:20250110T150000Z
SUMMARY:Cancelled Meeting
STATUS:CANCELLED
ATTENDEE;CUTYPE=INDIVIDUAL;PARTSTAT=ACCEPTED;CN="Alice":mailto:alice@example.com
END:VEVENT`);
    const path = writeTempIcs(ics);
    const db = makeMockDb();
    const result = await parseIcs(path, db);
    expect(result.contacts).toBe(0);
    expect(result.interactions).toBe(0);
    unlinkSync(path);
  });

  it("skips declined attendees", async () => {
    const ics = wrapCalendar(`BEGIN:VEVENT
UID:declined@test.com
DTSTART:20250110T140000Z
DTEND:20250110T150000Z
SUMMARY:Meeting
STATUS:CONFIRMED
ATTENDEE;CUTYPE=INDIVIDUAL;PARTSTAT=ACCEPTED;CN="Alice":mailto:alice@example.com
ATTENDEE;CUTYPE=INDIVIDUAL;PARTSTAT=DECLINED;CN="Bob":mailto:bob@example.com
END:VEVENT`);
    const path = writeTempIcs(ics);
    const db = makeMockDb();
    const result = await parseIcs(path, db);
    expect(result.contacts).toBe(1);
    unlinkSync(path);
  });

  it("skips room resources", async () => {
    const ics = wrapCalendar(`BEGIN:VEVENT
UID:room@test.com
DTSTART:20250110T140000Z
DTEND:20250110T150000Z
SUMMARY:Meeting
STATUS:CONFIRMED
ATTENDEE;CUTYPE=INDIVIDUAL;PARTSTAT=ACCEPTED;CN="Alice":mailto:alice@example.com
ATTENDEE;CUTYPE=ROOM;ROLE=NON-PARTICIPANT;CN="Room A":mailto:room-a@office.com
END:VEVENT`);
    const path = writeTempIcs(ics);
    const db = makeMockDb();
    const result = await parseIcs(path, db);
    expect(result.contacts).toBe(1);
    unlinkSync(path);
  });

  it("filters out owner email", async () => {
    const prev = process.env.OWNER_EMAIL;
    process.env.OWNER_EMAIL = "owner@example.com";

    const ics = wrapCalendar(`BEGIN:VEVENT
UID:owner@test.com
DTSTART:20250110T140000Z
DTEND:20250110T150000Z
SUMMARY:Meeting
STATUS:CONFIRMED
ATTENDEE;CUTYPE=INDIVIDUAL;PARTSTAT=ACCEPTED;CN="Owner":mailto:owner@example.com
ATTENDEE;CUTYPE=INDIVIDUAL;PARTSTAT=ACCEPTED;CN="Alice":mailto:alice@example.com
END:VEVENT`);
    const path = writeTempIcs(ics);
    const db = makeMockDb();
    const result = await parseIcs(path, db);
    expect(result.contacts).toBe(1);
    unlinkSync(path);
    process.env.OWNER_EMAIL = prev;
  });

  it("extracts organizer as a participant", async () => {
    const ics = wrapCalendar(`BEGIN:VEVENT
UID:organizer@test.com
DTSTART:20250110T140000Z
DTEND:20250110T150000Z
SUMMARY:Meeting
STATUS:CONFIRMED
ORGANIZER;CN="Organizer Person":mailto:organizer@example.com
ATTENDEE;CUTYPE=INDIVIDUAL;PARTSTAT=ACCEPTED;CN="Alice":mailto:alice@example.com
END:VEVENT`);
    const path = writeTempIcs(ics);
    const db = makeMockDb();
    const result = await parseIcs(path, db);
    expect(result.contacts).toBe(2);
    unlinkSync(path);
  });

  it("stores rich raw_content with description and location", async () => {
    const ics = wrapCalendar(`BEGIN:VEVENT
UID:rich@test.com
DTSTART:20250110T140000Z
DTEND:20250110T150000Z
SUMMARY:Quarterly Review
DESCRIPTION:Discuss performance metrics and roadmap.
LOCATION:123 Market St
STATUS:CONFIRMED
ATTENDEE;CUTYPE=INDIVIDUAL;PARTSTAT=ACCEPTED;CN="Alice":mailto:alice@example.com
END:VEVENT`);
    const path = writeTempIcs(ics);
    const db = makeMockDb();
    await parseIcs(path, db);

    const insertCall = db.query.mock.calls.find((c: any[]) => c[0].includes("INSERT INTO interactions"));
    const rawContent = insertCall![1][1];
    expect(rawContent).toContain("Summary: Quarterly Review");
    expect(rawContent).toContain("Location: 123 Market St");
    expect(rawContent).toContain("Description: Discuss performance metrics");
    unlinkSync(path);
  });
});
