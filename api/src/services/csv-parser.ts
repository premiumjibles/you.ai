import { parse } from "csv-parse/sync";

interface ParsedContact {
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  location: string | null;
  linkedin_url: string | null;
  notes: string | null;
}

export function parseContactsCsv(csvText: string): ParsedContact[] {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records.map((r: any) => {
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
      linkedin_url: r["Profile URL"] || r["linkedin_url"] || null,
      notes: r["Notes"] || r["notes"] || null,
    };
  });
}
