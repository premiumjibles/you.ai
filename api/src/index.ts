import express from "express";
import { contactsRouter } from "./routes/contacts.js";
import { briefingsRouter } from "./routes/briefings.js";
import { outreachRouter } from "./routes/outreach.js";
import { interactionsRouter } from "./routes/interactions.js";
import { subAgentsRouter } from "./routes/sub-agents.js";
import { importRouter } from "./routes/import.js";
import pool from "./db/client.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/contacts", contactsRouter(pool));
app.use("/api/briefings", briefingsRouter(pool));
app.use("/api/outreach", outreachRouter(pool));
app.use("/api/interactions", interactionsRouter(pool));
app.use("/api/sub-agents", subAgentsRouter(pool));
app.use("/api/import", importRouter(pool));

const port = parseInt(process.env.API_PORT || "3000");
app.listen(port, process.env.API_HOST || "0.0.0.0", () => {
  console.log(`API server listening on port ${port}`);
});

export default app;
