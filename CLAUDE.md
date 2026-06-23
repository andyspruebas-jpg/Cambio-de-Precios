# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite frontend on port 3002
npm run server     # Express backend on port 3005
npm run dev:all    # Both concurrently (standard dev mode)
npm run build      # Production build to dist/
npm run start:prod # Build + preview + server (production)
```

No test runner. TypeScript is checked via `tsc` (tsconfig.json), but there are no test files.

## Architecture

Two-process app:

**Frontend** — React 19 + TypeScript + Vite + Tailwind v4, running on port 3002. All `/api/*` calls proxy to the backend on port 3005.

**Backend** — `server.mjs` (Express, port 3005). Serves as:
- File persistence layer (CSV + JSON in `datos/`, `proveedores/`, `datos/progress/`)
- Auth server (users stored in `usuarios/users.csv`, bcrypt passwords)
- Odoo reverse proxy: all `/api/odoo/*` requests are forwarded to the Odoo server configured by environment variables, with session cookies managed server-side per client IP

## Workflow and Roles

PriceFlow manages a price-change pipeline for retail stores integrating with Odoo ERP (database and server configured by environment variables). The pipeline steps map to UI tabs:

1. **Ingestion** (`analista`, `admin`) — Load Odoo products + import supplier CSV/Excel → merge into `MergedItem[]`
2. **Worksheet** (`analista`, `admin`) — Approve/reject cost and price changes per item
3. **System Update** (`ejecutor`, `admin`) — Push approved items to Odoo via JSON-RPC
4. **Store Execution** (`sala`) — Mark price changes as physically executed at point of sale
5. **Provider Upload** (`proveedor`) — Upload supplier price sheets

User roles: `admin`, `analista`, `ejecutor`, `proveedor`, `sala`. Each role sees only its relevant tab on login.

## State and Storage

**Per-user isolation** is critical. Every user has completely independent data:

- **Odoo products** — IndexedDB via `StorageService`, keyed `priceflow_{userId}_products`
- **Workflow items** — localStorage `priceflow_{userId}_workflow_items` + server `datos/progress/global_worksheet.json`
- **Odoo pending updates** — server `datos/progress/odoo_updates.json` (atomic add/delete endpoints; full-array writes blocked if count changes)
- **History** — server CSV files `datos/history_{userId}.csv`
- **Provider CSV sheets** — `proveedores/*.csv`; archived to `proveedores/archive/` + JSON metadata in `proveedores/archive_data/`
- **Odoo sync snapshots** — `datos/odoo_sync_{timestamp}.csv` (kept to 50 files, auto-cleaned)

The server uses a `fileQueue` (Map of Promises) for atomic writes to prevent race conditions on shared files.

## Key Files

- `types.ts` — Core types: `MergedItem`, `OdooProduct`, `ChangeStatus`
- `services/odooService.ts` — Odoo JSON-RPC calls (auth, fetchProducts, updateProductPrice). Odoo credentials are hardcoded here.
- `services/storageService.ts` — IndexedDB + localStorage + server CSV persistence
- `services/geminiService.ts` — AI price analysis (uses `VITE_OPENAI_API_KEY` via OpenAI SDK, not Gemini despite the filename)
- `contexts/AuthContext.tsx` — Auth state; falls back to hardcoded `DEMO_USERS` if backend unavailable
- `App.tsx` — Top-level state, tab routing, notification system
- `utils/boliviaTime.ts` — All timestamps use Bolivia time (UTC-4)

## Environment Variables

```
VITE_OPENAI_API_KEY    # For AI batch analysis in Worksheet
VITE_GEMINI_API_KEY    # Also exposed as process.env.GEMINI_API_KEY
```

See `.env.template` for reference. Copy to `.env.local`.

## Odoo Integration Notes

- Odoo JSON-RPC uses session cookies; the backend proxy stores them per client IP in memory (`sessionCookies` Map)
- `fetchWithRetry` in `odooService.ts` retries 3× with 500ms delay — handles Odoo concurrent update locks
- Product variants use `product.template.attribute.value` (PTAV) for price writes; many one-off `.mjs` scripts in the root exist from debugging variant price issues (not part of the app)
