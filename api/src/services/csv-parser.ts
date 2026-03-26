import { parse as parseSync } from "csv-parse/sync";
import { parse } from "csv-parse";
import { createReadStream } from "fs";
import { createInterface } from "readline";

export interface ParsedContact {
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  location: string | null;
  linkedin_url: string | null;
  notes: string | null;
  connected_on: string | null;
}

function parseLinkedInDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function mapRecord(r: any): ParsedContact {
  const firstName = r["First Name"] || r["first_name"] || r["Name"] || "";
  const lastName = r["Last Name"] || r["last_name"] || "";
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();

  return {
    name: name || "Unknown",
    email: r["Email Address"] || r["email"] || r["Email"] || null,
    phone: r["Phone"] || r["phone"] || null,
    company: r["Company"] || r["company"] || r["Organization"] || null,
    role: r["Position"] || r["role"] || r["Title"] || r["Job Title"] || null,
    location: r["Location"] || r["location"] || r["City"] || null,
    linkedin_url: r["Profile URL"] || r["URL"] || r["linkedin_url"] || null,
    notes: r["Notes"] || r["notes"] || null,
    connected_on: parseLinkedInDate(r["Connected On"]),
  };
}

function stripPreamble(csvText: string): string {
  const lines = csvText.split("\n");
  const headerIndex = lines.findIndex(
    (line) => line.includes("First Name") || line.includes("Email Address")
  );
  if (headerIndex <= 0) return csvText;
  return lines.slice(headerIndex).join("\n");
}

// Sync parser for API routes (small uploads via multer)
export function parseContactsCsv(csvText: string): ParsedContact[] {
  const cleaned = stripPreamble(csvText);
  const records = parseSync(cleaned, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records.map(mapRecord);
}

// Streaming parser for CLI imports (large files)
export async function* streamContactsCsv(filePath: string): AsyncGenerator<ParsedContact> {
  // Detect preamble by reading first few lines
  const headerLine = await findHeaderLine(filePath);

  const parser = createReadStream(filePath, "utf-8").pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      from_line: headerLine,
    })
  );

  for await (const record of parser) {
    yield mapRecord(record);
  }
}

async function findHeaderLine(filePath: string): Promise<number> {
  const rl = createInterface({
    input: createReadStream(filePath, "utf-8"),
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (line.includes("First Name") || line.includes("Email Address")) {
      rl.close();
      return lineNum;
    }
    if (lineNum >= 10) break;
  }
  rl.close();
  return 1;
}
