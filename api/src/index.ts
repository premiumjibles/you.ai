import express from "express";
import { contactsRouter } from "./routes/contacts.js";
import pool from "./db/client.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/contacts", contactsRouter(pool));

const port = parseInt(process.env.API_PORT || "3000");
app.listen(port, process.env.API_HOST || "0.0.0.0", () => {
  console.log(`API server listening on port ${port}`);
});

export default app;
