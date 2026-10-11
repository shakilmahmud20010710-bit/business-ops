# BusinessOps

A simple cash flow tracker for small businesses.

The idea the project turns on: a small business owner rarely knows, on any given day, how
much cash the business actually has. Full ERP answers that but costs a subscription and
assumes the owner understands double-entry bookkeeping. BusinessOps takes the smallest
useful part — money in, money out, and what is owed — and puts it on one dashboard that
answers five questions the owner asks every week.

---

## Running it

Everything runs in Docker. You need Docker Desktop and nothing else.

### Windows — double-click

`start.bat` installs Docker Desktop if it is missing, waits for the engine, starts the
stack and opens the app. Only the install step asks for Administrator.

```
start.bat            install if needed, then start
stop.bat             stop the containers, keep the data
start.bat -Reset     wipe the database and restore the demo data
start.bat -Logs      follow the container logs after starting
```

If Docker Desktop had to be installed, Windows needs one restart before the engine will
run — the script says so and you run `start.bat` again afterwards.

### macOS, Linux, or if you already have Docker

```bash
cp .env.example .env
docker compose up --build
```

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:5174      |
| API      | http://localhost:8002      |
| MySQL    | localhost:3308             |

Ports deliberately differ from On-Watch, so both projects can run at the same time.

```bash
docker compose down          # stop, keep data
docker compose down -v       # stop, drop the database volume
docker compose logs -f backend
```

Backend and frontend are bind-mounted, so edits reload inside the container without a
rebuild.

## Stack

- **Frontend** — React 18 (JavaScript) + Vite, hand-rolled SVG charts, no chart library
- **Backend** — Flask 3 (Python 3.12) + Flask-SQLAlchemy, application-factory pattern
- **Database** — MySQL 8.4, schema and ~700 seeded transactions across six months

## Money is never a float

Every amount is a whole number of **minor units (cents)**, stored as `BIGINT`, parsed and
formatted only through `backend/app/money.py`. This is design decision 3 and NFR-03:
floating-point arithmetic gives wrong totals for money, and in a cash flow tool one wrong
total destroys trust in every other figure on the screen.

The frontend mirrors the same rule in `src/lib/api.js::money()`.

## Layout

```
businessops/
├── docker-compose.yml
├── db/init/              schema + six months of seed transactions
├── backend/app/
│   ├── cashflow.py       ← the cash flow engine (see below)
│   ├── money.py          minor-unit parsing and formatting
│   ├── models.py         SQLAlchemy models
│   └── blueprints/       health, reference, transactions, dashboard
└── frontend/src/
    ├── styles/tokens.css design tokens
    ├── components/       Masthead, Page, Tile, BarChart, Pending
    └── pages/            Dashboard, Transactions, Receivables, Accounts
```

## What works right now

- Docker stack: three services, healthcheck-gated startup, hot reload on both sides
- MySQL schema for all six entities
- Demo data: 669 transactions across six months of trading for a small print shop —
  roughly $17k in and $13.4k out per month, weekday and back-to-school seasonality,
  and payments landing in the till or the bank according to how they were paid.
  16 customer invoices and 14 supplier bills with a realistic ageing profile,
  including five invoices already overdue
- `GET /health` — round trips to MySQL
- `GET /api/transactions` — live, with date / type / category / account filters and paging
- `GET /api/accounts/balances` — live, and the **worked example** for the cash flow module
- `GET /api/categories`, `GET /api/accounts` — live
- `GET /api/invoices`, `GET /api/bills` — live, with days-overdue calculated on read
- Frontend shell, routing, design system; the Transactions, Accounts and
  Invoices & Bills pages are fully working against real data

## Status

**Complete.** All 21 functional requirements from the Assessment 2 proposal are
implemented and verified against the running system, and the test suite passes.

| Area | Requirements |
|---|---|
| Authentication and roles | FR-01 to FR-03, FR-20 — login screen, 24-hour token, staff record but cannot export or delete |
| Setup | FR-04, FR-05 — accounts with opening balances, categories (a category's type cannot change once in use) |
| Recording | FR-06 to FR-08 — entry form, edit and delete, with the prior state kept in an audit table |
| Ledger | FR-09, FR-10 — filters and a running balance computed over every transaction, not just the rows on screen |
| Dashboard | FR-11 to FR-14, FR-16, FR-21 — the five figures, each one clickable through to the entries behind it |
| Receivables | FR-15, FR-17 — invoices and bills; marking one paid writes the transaction that settles it |
| Reporting | FR-18, FR-19 — monthly cash flow statement and CSV export |

### Tests

```bash
docker exec businessops_backend python -m pytest tests/ -q
```

11 tests. The first is the one that matters: it recomputes cash on hand by hand from the
account openings plus every transaction row and asserts the dashboard figure matches
(NFR-04).

## Design language

Light, warm, printed-ledger. Paper-toned surfaces, Source Serif headings over IBM Plex Sans
body, 2px radii, generous whitespace, burnt-orange accent, horizontal top navigation and no
sidebar anywhere.
