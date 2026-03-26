/**
 * Demo seed script — generates realistic contact, interaction, and briefing data
 * to showcase the You.ai personal assistant.
 *
 * Usage: DATABASE_URL=postgresql://... npx tsx api/scripts/seed-demo.ts
 *
 * Story: User is based in Sydney, has a strong Singapore + Sydney network,
 * some London/NYC/SF contacts. About to travel to Singapore.
 */

import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ── Contact data ──────────────────────────────────────────────────────────────

interface SeedContact {
  name: string;
  company: string;
  role: string;
  location: string;
  priority_ring: number;
  notes?: string;
}

const CONTACTS: SeedContact[] = [
  // ── Singapore (~30) — finance, tech, VC ──
  { name: "Wei Lin Tan", company: "Temasek", role: "Investment Director", location: "Singapore", priority_ring: 1, notes: "Key relationship — co-invested in 2 deals together" },
  { name: "Priya Sharma", company: "GIC", role: "Portfolio Manager", location: "Singapore", priority_ring: 1, notes: "Met at Milken 2025, strong crypto/DeFi conviction" },
  { name: "Jason Lim", company: "Grab", role: "VP Engineering", location: "Singapore", priority_ring: 1, notes: "Ex-Google, potential advisor for AI product" },
  { name: "Rachel Ng", company: "Stripe", role: "Head of APAC Partnerships", location: "Singapore", priority_ring: 1, notes: "Introduced us to 3 enterprise clients" },
  { name: "Arun Krishnan", company: "Monk's Hill Ventures", role: "Partner", location: "Singapore", priority_ring: 1, notes: "Series A lead investor contact" },
  { name: "Michelle Teo", company: "DBS Bank", role: "Managing Director, Digital", location: "Singapore", priority_ring: 2, notes: "Innovation lab partnership discussions" },
  { name: "David Ong", company: "Sea Group", role: "Senior Director, AI", location: "Singapore", priority_ring: 2 },
  { name: "Siti Aminah", company: "Funding Societies", role: "CTO", location: "Singapore", priority_ring: 2, notes: "Technical deep-dive on AI lending models" },
  { name: "Kenneth Ho", company: "Vertex Ventures", role: "Principal", location: "Singapore", priority_ring: 2, notes: "SEA fintech dealflow" },
  { name: "Li Wei Chen", company: "Binance", role: "Head of Institutional", location: "Singapore", priority_ring: 2 },
  { name: "Nina Patel", company: "Sequoia Capital SEA", role: "Vice President", location: "Singapore", priority_ring: 2, notes: "Met at Token2049" },
  { name: "Tommy Koh", company: "Lazada", role: "VP Product", location: "Singapore", priority_ring: 3 },
  { name: "Farah Ibrahim", company: "Shopee", role: "Engineering Manager", location: "Singapore", priority_ring: 3 },
  { name: "Marcus Yeo", company: "Carousell", role: "Head of Growth", location: "Singapore", priority_ring: 3 },
  { name: "Chandra Suresh", company: "Razorpay", role: "GM Southeast Asia", location: "Singapore", priority_ring: 3 },
  { name: "Angela Wu", company: "ByteDance", role: "Product Lead, TikTok Commerce", location: "Singapore", priority_ring: 3 },
  { name: "Daniel Tan", company: "Gojek", role: "Staff Engineer", location: "Singapore", priority_ring: 3 },
  { name: "Mei Ling Chong", company: "Standard Chartered", role: "Head of Digital Assets", location: "Singapore", priority_ring: 3 },
  { name: "Rajesh Nair", company: "Crypto.com", role: "Director of Engineering", location: "Singapore", priority_ring: 3 },
  { name: "Jessica Tan", company: "Ping An", role: "Chief Strategy Officer", location: "Singapore", priority_ring: 2, notes: "Insurance + AI intersection" },
  { name: "Alex Kwok", company: "Matrixport", role: "Head of Product", location: "Singapore", priority_ring: 3 },
  { name: "Samantha Lee", company: "Endeavour Ventures", role: "Associate", location: "Singapore", priority_ring: 4 },
  { name: "Ryan Goh", company: "PropertyGuru", role: "Senior Engineer", location: "Singapore", priority_ring: 4 },
  { name: "Nurul Huda", company: "Advance Intelligence", role: "Data Scientist", location: "Singapore", priority_ring: 4 },
  { name: "Vincent Loh", company: "Nium", role: "Product Manager", location: "Singapore", priority_ring: 4 },
  { name: "Patrick Tan", company: "Zilliqa", role: "Co-founder", location: "Singapore", priority_ring: 3, notes: "Web3 infrastructure" },
  { name: "Grace Lim", company: "Antler", role: "Venture Partner", location: "Singapore", priority_ring: 2, notes: "Early-stage deal sourcing" },
  { name: "Benjamin Koh", company: "MAS", role: "Fintech Director", location: "Singapore", priority_ring: 2, notes: "Regulatory insight — Singapore fintech sandbox" },
  { name: "Harish Mehta", company: "Tiger Global", role: "Principal", location: "Singapore", priority_ring: 2, notes: "Growth-stage investor, strong APAC network" },
  { name: "Ying Xuan Loh", company: "AWS", role: "Solutions Architect, Startups", location: "Singapore", priority_ring: 3 },

  // ── Sydney / Melbourne (~25) — home base ──
  { name: "Sarah Mitchell", company: "Atlassian", role: "Engineering Manager", location: "Sydney", priority_ring: 1, notes: "Close friend, monthly catch-ups" },
  { name: "James Chen", company: "Canva", role: "Head of Product", location: "Sydney", priority_ring: 1, notes: "Product strategy discussions" },
  { name: "Tom Bradley", company: "SafetyCulture", role: "CTO", location: "Sydney", priority_ring: 1 },
  { name: "Emily Watson", company: "Afterpay", role: "VP Engineering", location: "Sydney", priority_ring: 1, notes: "Payments + BNPL expertise" },
  { name: "Liam O'Brien", company: "Rokt", role: "Principal Engineer", location: "Sydney", priority_ring: 2 },
  { name: "Zara Hossain", company: "Culture Amp", role: "Senior Product Manager", location: "Melbourne", priority_ring: 2 },
  { name: "Matt Thompson", company: "Blackbird Ventures", role: "Partner", location: "Sydney", priority_ring: 1, notes: "Key VC relationship — our Series seed investor" },
  { name: "Sophie Anderson", company: "Zip Co", role: "Head of Data", location: "Sydney", priority_ring: 2 },
  { name: "Daniel Park", company: "Immutable", role: "Staff Engineer", location: "Sydney", priority_ring: 2, notes: "Web3 gaming infrastructure" },
  { name: "Rebecca Liu", company: "Airwallex", role: "GM Australia", location: "Melbourne", priority_ring: 2, notes: "Cross-border payments" },
  { name: "Nathan Hughes", company: "Airtasker", role: "VP Product", location: "Sydney", priority_ring: 3 },
  { name: "Chloe Martin", company: "Linktree", role: "Engineering Lead", location: "Melbourne", priority_ring: 3 },
  { name: "Andrew Kim", company: "Harrison.ai", role: "ML Engineer", location: "Sydney", priority_ring: 3, notes: "AI in healthcare" },
  { name: "Megan Scott", company: "UNSW", role: "Professor of Computer Science", location: "Sydney", priority_ring: 3, notes: "Former lecturer, advisor" },
  { name: "Oliver Brown", company: "Macquarie Group", role: "Director, Technology", location: "Sydney", priority_ring: 2 },
  { name: "Jasmine Tran", company: "Buildkite", role: "Senior Engineer", location: "Melbourne", priority_ring: 4 },
  { name: "Marcus Williams", company: "ANZ", role: "Head of Innovation", location: "Melbourne", priority_ring: 3 },
  { name: "Lucy Zhao", company: "Eucalyptus", role: "Product Manager", location: "Sydney", priority_ring: 4 },
  { name: "Ben Taylor", company: "Qantas", role: "Director of Digital", location: "Sydney", priority_ring: 2, notes: "Loyalty program + tech modernization" },
  { name: "Kate Sullivan", company: "CBA", role: "Executive Manager, AI", location: "Sydney", priority_ring: 2 },
  { name: "Ryan Cooper", company: "Atlassian", role: "Staff Engineer", location: "Sydney", priority_ring: 3 },
  { name: "Hannah Lewis", company: "Canva", role: "Design Lead", location: "Sydney", priority_ring: 4 },
  { name: "Jack Murray", company: "Xero", role: "VP Engineering", location: "Melbourne", priority_ring: 3 },
  { name: "Priya Desai", company: "NAB", role: "Data Science Lead", location: "Melbourne", priority_ring: 3 },

  // ── London (~10) ──
  { name: "James Whitfield", company: "Revolut", role: "VP Product", location: "London", priority_ring: 2, notes: "Fintech expansion into APAC" },
  { name: "Sophia Chen", company: "DeepMind", role: "Research Scientist", location: "London", priority_ring: 2, notes: "AI safety research" },
  { name: "Oliver Thompson", company: "Wise", role: "Senior Engineer", location: "London", priority_ring: 3 },
  { name: "Emma Richardson", company: "Monzo", role: "Head of Product", location: "London", priority_ring: 3 },
  { name: "Harry Collins", company: "Checkout.com", role: "Engineering Manager", location: "London", priority_ring: 3 },
  { name: "Amara Okafor", company: "Intercom", role: "Product Lead", location: "London", priority_ring: 4 },
  { name: "George Patterson", company: "Goldman Sachs", role: "VP, Digital Assets", location: "London", priority_ring: 2, notes: "Institutional crypto" },
  { name: "Isla MacLeod", company: "Baillie Gifford", role: "Investment Manager", location: "London", priority_ring: 3 },
  { name: "Raj Patel", company: "Thought Machine", role: "CTO", location: "London", priority_ring: 3 },
  { name: "Charlotte Evans", company: "Starling Bank", role: "Head of Engineering", location: "London", priority_ring: 4 },

  // ── New York (~8) ──
  { name: "Michael Torres", company: "a16z", role: "Partner", location: "New York", priority_ring: 1, notes: "Crypto fund, key fundraising contact" },
  { name: "Sarah Kim", company: "Coinbase", role: "Director of Product", location: "New York", priority_ring: 2 },
  { name: "David Rosenberg", company: "Two Sigma", role: "Quantitative Researcher", location: "New York", priority_ring: 3 },
  { name: "Jennifer Wu", company: "JP Morgan", role: "Executive Director, Blockchain", location: "New York", priority_ring: 2 },
  { name: "Alex Petrov", company: "Chainalysis", role: "VP Engineering", location: "New York", priority_ring: 3 },
  { name: "Maria Gonzalez", company: "Bloomberg", role: "Senior Product Manager", location: "New York", priority_ring: 4 },
  { name: "Chris Anderson", company: "Gemini", role: "Head of Engineering", location: "New York", priority_ring: 3 },
  { name: "Lisa Chang", company: "Galaxy Digital", role: "Portfolio Manager", location: "New York", priority_ring: 2, notes: "Institutional digital asset allocation" },

  // ── San Francisco (~7) ──
  { name: "Kevin Zhang", company: "Anthropic", role: "Research Engineer", location: "San Francisco", priority_ring: 2, notes: "AI safety, model capabilities" },
  { name: "Amanda Reeves", company: "Stripe", role: "Staff Engineer", location: "San Francisco", priority_ring: 3 },
  { name: "Brian Park", company: "OpenAI", role: "Product Manager", location: "San Francisco", priority_ring: 2, notes: "API platform strategy" },
  { name: "Diana Huang", company: "Paradigm", role: "Investment Partner", location: "San Francisco", priority_ring: 2, notes: "Crypto + AI intersection investing" },
  { name: "Eric Thompson", company: "Ripple", role: "Head of Engineering", location: "San Francisco", priority_ring: 3 },
  { name: "Natalie Foster", company: "Scale AI", role: "VP Operations", location: "San Francisco", priority_ring: 3 },
  { name: "Steve Liu", company: "Figma", role: "Engineering Manager", location: "San Francisco", priority_ring: 4 },

  // ── Hong Kong (~5) ──
  { name: "Raymond Cheung", company: "HashKey Capital", role: "Managing Director", location: "Hong Kong", priority_ring: 2, notes: "HK crypto regulatory expertise" },
  { name: "Michelle Wong", company: "HSBC", role: "Head of Digital, Asia", location: "Hong Kong", priority_ring: 2 },
  { name: "Tony Leung", company: "Animoca Brands", role: "VP Product", location: "Hong Kong", priority_ring: 3 },
  { name: "Karen Yip", company: "FTX Claims Trust", role: "Legal Counsel", location: "Hong Kong", priority_ring: 4 },
  { name: "Peter Chan", company: "Circle", role: "GM Asia Pacific", location: "Hong Kong", priority_ring: 3 },

  // ── Tokyo (~3) ──
  { name: "Yuki Tanaka", company: "SoftBank", role: "Investment Director", location: "Tokyo", priority_ring: 2, notes: "Vision Fund, AI/fintech" },
  { name: "Kenji Nakamura", company: "Mercari", role: "CTO", location: "Tokyo", priority_ring: 3 },
  { name: "Ayumi Sato", company: "Rakuten", role: "VP of AI", location: "Tokyo", priority_ring: 3 },

  // ── Berlin (~2) ──
  { name: "Max Schneider", company: "N26", role: "Head of Product", location: "Berlin", priority_ring: 3 },
  { name: "Laura Fischer", company: "Zalando", role: "Engineering Director", location: "Berlin", priority_ring: 4 },

  // ── Dubai (~2) ──
  { name: "Ahmed Al-Rashid", company: "DIFC Innovation Hub", role: "Director", location: "Dubai", priority_ring: 3, notes: "UAE fintech corridor" },
  { name: "Fatima Hassan", company: "Bybit", role: "Head of MENA", location: "Dubai", priority_ring: 3 },
];

// ── Interaction data ──────────────────────────────────────────────────────────

const SUMMARIES = {
  email: [
    "Discussed Q1 performance review and roadmap priorities",
    "Shared deck on AI market landscape in APAC",
    "Follow-up from intro call — exploring partnership",
    "Forwarded article on regulatory changes in digital assets",
    "Scheduled follow-up meeting for next month",
    "Requested intro to their Head of Product",
    "Shared investment memo on Series A target",
    "Discussed potential speaking slot at their conference",
    "Exchange on hiring trends in AI/ML engineering",
    "Proposal for joint webinar on fintech innovation",
    "Sent over case study for their board meeting",
    "Quick catch-up on market conditions",
    "Introduced to their portfolio company founder",
    "Discussed competitive landscape and positioning",
    "Follow-up on due diligence questions",
  ],
  meeting: [
    "Coffee catch-up — discussed market outlook and deal pipeline",
    "Lunch meeting — explored strategic partnership opportunities",
    "Video call to review product demo and feedback",
    "Workshop on AI integration strategy",
    "Quarterly sync on portfolio performance",
    "Office visit — toured their new Singapore HQ",
    "Dinner networking event at Token2049 Singapore",
    "Panel discussion on future of digital banking",
    "Brainstorm session on go-to-market strategy",
    "One-on-one mentoring session",
    "Board meeting — presented quarterly update",
    "Happy hour networking at fintech meetup",
  ],
  linkedin: [
    "Connected after meeting at Web Summit",
    "Congratulated on new role announcement",
    "Shared article on AI in financial services",
    "Discussed upcoming industry conference",
    "Exchanged thoughts on latest funding round",
    "Commented on their post about startup ecosystem",
  ],
  whatsapp: [
    "Quick check-in about upcoming Singapore trip",
    "Shared contact details for intro",
    "Coordinated meeting time for next week",
    "Discussed logistics for dinner event",
    "Sent voice note about deal opportunity",
    "Shared photo from conference",
  ],
};

const INTERACTION_TYPES = ["email", "meeting", "linkedin", "whatsapp"] as const;

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(daysAgo: number): Date {
  const now = Date.now();
  const offset = Math.random() * daysAgo * 24 * 60 * 60 * 1000;
  return new Date(now - offset);
}

function interactionCount(ring: number): number {
  switch (ring) {
    case 1: return 8 + Math.floor(Math.random() * 8); // 8-15
    case 2: return 5 + Math.floor(Math.random() * 6); // 5-10
    case 3: return 2 + Math.floor(Math.random() * 4); // 2-5
    case 4: return Math.floor(Math.random() * 3);      // 0-2
    case 5: return 0;
    default: return 1;
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function companySlug(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 15);
}

// ── Briefing content ──────────────────────────────────────────────────────────

function briefingContent(daysAgo: number): string {
  const briefings = [
    `📊 Market Update
Bitcoin is trading at $68,420, up 2.3% over 24h. Ethereum at $3,850 (+1.1%). Solana rallied 5.2% on DEX volume news. QAN.AX (Qantas) closed at $8.45, up 0.8%. ASX200 up 0.3% to 8,245.

🤝 Network Activity
Wei Lin Tan (Temasek) — exchanged notes on APAC AI deal pipeline.
Sarah Mitchell (Atlassian) — coffee catch-up scheduled for Thursday.
Matt Thompson (Blackbird) — shared intro to a Series B fintech founder.

🌐 AI Industry News
Anthropic announced Claude 4.5 with improved tool use capabilities. OpenAI launched enterprise agent framework. Singapore MAS released updated guidelines on AI in financial services.

📰 Tech Blogs
Paul Graham: "The AI Founder's Playbook" — key takeaway: start with narrow vertical, expand.`,

    `📊 Market Update
Bitcoin consolidated around $67,800 (-0.9%). Ethereum at $3,810 (-1.0%). SOL held steady at $142. QAN.AX at $8.40 (-0.6%). ASX200 flat at 8,220.

🤝 Network Activity
Jason Lim (Grab) — discussed their internal AI platform architecture.
Arun Krishnan (Monk's Hill) — shared deal memo on Indonesian fintech.
Ben Taylor (Qantas) — intro to their loyalty tech team.

🌐 AI Industry News
Google DeepMind published new research on AI agents for enterprise workflows. Y Combinator's latest batch has 40% AI-first companies. Singapore announced $500M AI investment fund.`,

    `📊 Market Update
Bitcoin surged to $69,200 (+2.1%). ETH at $3,920 (+2.9%). Strong altcoin day — SOL +4.5%, AVAX +3.8%. QAN.AX at $8.52 (+1.4%). ASX200 up 0.5%.

🤝 Network Activity
Rachel Ng (Stripe) — discussed APAC expansion strategy and potential integration.
Priya Sharma (GIC) — deep dive on DeFi yield strategies for institutional allocators.
Oliver Brown (Macquarie) — explored AI partnership for wealth management.

🌐 AI Industry News
Stripe launched AI-powered fraud detection for APAC merchants. DBS Bank announced partnership with Anthropic for customer service automation.`,

    `📊 Market Update
Bitcoin pulled back to $66,950 (-3.2%). Broad market correction — ETH -2.8%, SOL -4.1%. QAN.AX steady at $8.48. ASX200 down 0.4% on China data.

🤝 Network Activity
Michael Torres (a16z) — video call on crypto market cycle thesis.
Grace Lim (Antler) — shared 3 early-stage AI startups for review.
James Whitfield (Revolut) — discussed their APAC launch timeline.

🌐 AI Industry News
Meta open-sourced new multimodal model. Australia ASIC released draft framework for AI in financial advice.`,

    `📊 Market Update
Recovery day — Bitcoin back to $68,100 (+1.7%). ETH $3,870 (+1.5%). QAN.AX $8.55 (+0.8%) on strong travel demand. ASX200 up 0.6%.

🤝 Network Activity
Michelle Teo (DBS) — innovation lab proposal finalized.
Benjamin Koh (MAS) — regulatory sandbox update for AI-powered advisors.
Kate Sullivan (CBA) — discussed AI governance framework.

🌐 AI Industry News
Cohere launched enterprise RAG solution. Singapore Smart Nation office released AI ethics guidelines v2.`,

    `📊 Market Update
Bitcoin at $68,500 (+0.6%). ETH $3,890 (+0.5%). Quiet day, low volatility. QAN.AX $8.60 (+0.6%). ASX200 up 0.2%.

🤝 Network Activity
Kevin Zhang (Anthropic) — shared notes on tool-use patterns for AI agents.
Diana Huang (Paradigm) — discussed crypto x AI convergence thesis.
Tom Bradley (SafetyCulture) — explored AI safety tooling opportunity.

🌐 AI Industry News
Y Combinator demo day highlights — 3 companies in AI agent space. AWS announced new SageMaker features for fine-tuning.`,

    `📊 Market Update
Bitcoin hit $69,800 — testing $70k resistance. ETH $3,950 (+1.5%). SOL $148 (+3.2%). QAN.AX $8.65 (+0.6%). ASX200 up 0.4% to 8,280.

🤝 Network Activity
Harish Mehta (Tiger Global) — intro call on growth-stage APAC opportunities.
Raymond Cheung (HashKey) — Hong Kong crypto licensing update.
Emily Watson (Afterpay) — discussed embedded finance + AI use cases.

🌐 AI Industry News
Anthropic raised additional $2B. Singapore fintech festival dates announced — November 2026. New research paper on AI agents outperforming human analysts in market prediction.`,
  ];

  return briefings[daysAgo % briefings.length];
}

// ── Main seed function ────────────────────────────────────────────────────────

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("Truncating all tables...");
    await client.query(`
      TRUNCATE chat_messages, briefings, interactions, outreach_drafts,
               import_history, github_summaries, sub_agents, contacts, app_settings
      CASCADE
    `);

    // ── Contacts ──
    console.log(`Seeding ${CONTACTS.length} contacts...`);
    const contactIds: string[] = [];
    for (const c of CONTACTS) {
      const slug = slugify(c.name);
      const email = `${slug}@${companySlug(c.company)}.com`;
      const linkedinUrl = `https://www.linkedin.com/in/${slug}`;
      const sources = ["linkedin"];
      if (c.priority_ring <= 2) sources.push("gmail", "calendar");
      if (c.priority_ring <= 3 && Math.random() > 0.5) sources.push("whatsapp");

      const { rows } = await client.query(
        `INSERT INTO contacts (name, company, role, location, email, linkedin_url, source_databases, notes, priority_ring)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [c.name, c.company, c.role, c.location, email, linkedinUrl, sources, c.notes || null, c.priority_ring]
      );
      contactIds.push(rows[0].id);
    }

    // ── Interactions ──
    console.log("Seeding interactions...");
    let totalInteractions = 0;
    const groupIds = new Set<string>();

    for (let ci = 0; ci < CONTACTS.length; ci++) {
      const contact = CONTACTS[ci];
      const contactId = contactIds[ci];
      const count = interactionCount(contact.priority_ring);
      let latestDate: Date | null = null;

      for (let j = 0; j < count; j++) {
        const type = randomItem(INTERACTION_TYPES);
        const summaries = SUMMARIES[type];
        const summary = randomItem(summaries);
        const daysSpread = contact.priority_ring <= 2 ? 120 : 180;
        const date = randomDate(daysSpread);

        if (!latestDate || date > latestDate) latestDate = date;

        // Generate unique group_id per contact
        let groupId: string | null = null;
        if (type === "email" || type === "meeting") {
          groupId = `${type}-${ci}-${j}`;
          groupIds.add(groupId);
        }

        await client.query(
          `INSERT INTO interactions (contact_id, type, date, summary, group_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [contactId, type, date.toISOString(), summary, groupId]
        );
        totalInteractions++;
      }

      // Update last_interaction_date on the contact
      if (latestDate) {
        await client.query(
          `UPDATE contacts SET last_interaction_date = $1 WHERE id = $2`,
          [latestDate.toISOString(), contactId]
        );
      }
    }

    // Add some group meetings (multiple contacts in same meeting)
    const sgContacts = contactIds.slice(0, 10); // Top Singapore contacts
    const sydContacts = contactIds.slice(30, 37); // Top Sydney contacts
    const groupMeetings = [
      { contacts: sgContacts.slice(0, 4), summary: "Token2049 Singapore dinner — discussed APAC crypto landscape", daysAgo: 45 },
      { contacts: sgContacts.slice(2, 6), summary: "Singapore fintech roundtable — MAS sandbox update", daysAgo: 30 },
      { contacts: sydContacts.slice(0, 5), summary: "Sydney founders dinner — quarterly catchup", daysAgo: 14 },
      { contacts: sydContacts.slice(2, 6), summary: "Atlassian office meetup — AI product brainstorm", daysAgo: 7 },
      { contacts: [...sgContacts.slice(0, 2), ...sydContacts.slice(0, 2)], summary: "Cross-border fintech strategy call", daysAgo: 21 },
    ];

    for (const gm of groupMeetings) {
      const groupId = `mtg-group-${gm.daysAgo}`;
      const date = new Date(Date.now() - gm.daysAgo * 24 * 60 * 60 * 1000);
      for (const cid of gm.contacts) {
        await client.query(
          `INSERT INTO interactions (contact_id, type, date, summary, group_id)
           VALUES ($1, 'meeting', $2, $3, $4)
           ON CONFLICT (contact_id, group_id) WHERE group_id IS NOT NULL DO NOTHING`,
          [cid, date.toISOString(), gm.summary, groupId]
        );
        totalInteractions++;
      }
    }

    console.log(`  ${totalInteractions} interactions created`);

    // ── Sub-agents ──
    console.log("Seeding sub-agents...");
    const subAgents = [
      { type: "market_tracker", name: "Crypto Watchlist", config: { assets: ["bitcoin", "ethereum", "solana"] } },
      { type: "financial_tracker", name: "Portfolio Tracker", config: { symbols: ["AAPL", "MSFT", "QAN.AX", "^AXJO"] } },
      { type: "network_activity", name: "Network Activity", config: {} },
      { type: "web_search", name: "AI Industry News", config: { query: "artificial intelligence startups funding APAC" } },
      { type: "rss_feed", name: "Tech Blogs", config: { urls: ["https://blog.samaltman.com/feed", "https://paulgraham.com/rss.html"], max_items: 5 } },
    ];

    for (const sa of subAgents) {
      await client.query(
        `INSERT INTO sub_agents (user_id, type, name, config) VALUES ('default', $1, $2, $3)`,
        [sa.type, sa.name, JSON.stringify(sa.config)]
      );
    }

    // ── Briefings ──
    console.log("Seeding briefings...");
    for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
      const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().slice(0, 10);
      await client.query(
        `INSERT INTO briefings (user_id, date, content) VALUES ('default', $1, $2)`,
        [dateStr, briefingContent(daysAgo)]
      );
    }

    // ── App settings ──
    console.log("Seeding app settings...");
    await client.query(
      `INSERT INTO app_settings (key, value) VALUES ('briefing_time', '07:00') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
    );
    await client.query(
      `INSERT INTO app_settings (key, value) VALUES ('timezone', 'Asia/Singapore') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
    );

    await client.query("COMMIT");
    console.log("\nDemo data seeded successfully!");
    console.log(`  ${CONTACTS.length} contacts`);
    console.log(`  ${totalInteractions} interactions`);
    console.log(`  ${subAgents.length} sub-agents`);
    console.log(`  7 briefings`);
    console.log(`  2 app settings`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
