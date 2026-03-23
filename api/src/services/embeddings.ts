import type pg from "pg";
import OpenAI from "openai";

const openai = new OpenAI();

interface ContactFields {
  name: string;
  role: string | null;
  company: string | null;
  location: string | null;
  notes: string | null;
}

export function buildEmbeddingText(contact: ContactFields): string {
  return [contact.name, contact.role, contact.company, contact.location, contact.notes]
    .filter(Boolean)
    .join(" ");
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
    input: text,
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || "1536"),
  });
  return response.data[0].embedding;
}

export async function updateContactEmbedding(
  db: pg.Pool,
  contactId: string
): Promise<void> {
  const { rows } = await db.query(
    "SELECT name, role, company, location, notes FROM contacts WHERE id = $1",
    [contactId]
  );
  if (!rows[0]) return;

  const text = buildEmbeddingText(rows[0]);
  const embedding = await generateEmbedding(text);

  await db.query("UPDATE contacts SET embedding = $1 WHERE id = $2", [
    JSON.stringify(embedding),
    contactId,
  ]);
}

export async function batchUpdateEmbeddings(
  db: pg.Pool,
  contactIds: string[]
): Promise<void> {
  const batchSize = 100;
  for (let i = 0; i < contactIds.length; i += batchSize) {
    const batch = contactIds.slice(i, i + batchSize);
    await Promise.all(batch.map((id) => updateContactEmbedding(db, id)));
  }
}
