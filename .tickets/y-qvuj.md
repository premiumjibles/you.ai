---
id: y-qvuj
status: open
deps: []
links: []
created: 2026-03-23T11:33:12Z
type: feature
priority: 2
assignee: Jibles
---
# Interactive setup script — Docker install, HTTPS/domain, guided credential entry

## Notes

**2026-03-23T11:42:48Z**

Additional UX issues found during first real deployment:
- Setup prints localhost URLs that aren't accessible on a remote server (needs to detect server IP or domain)
- SSH tunneling required to access n8n UI — not user-friendly
- 'Open n8n UI and configure Gmail OAuth2 credentials' — no specifics on how
- Next steps mention Telegram setup even when user chose --whatsapp
- Workflow import failed silently — n8n REST API auth changed in recent versions (owner account instead of basic auth)
- n8n shows empty 'Start from scratch' — none of the 7 workflows were imported
- Step 4 says 'Enable WhatsApp' even though user already passed --whatsapp
- Sean wants to explore PikaPods for n8n hosting and managed DB to simplify infrastructure
- Target audience: tech-savvy non-engineers, not just developers

**2026-03-23T11:45:21Z**

Workflow import via n8n REST API doesn't work with owner account auth. CLI import works: docker compose exec n8n n8n import:workflow --input=/workflows/<file>.json. Setup script should use CLI import instead of REST API.
