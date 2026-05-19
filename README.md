<div align="center">

# Greenroom

**Software for independent music venues.**

This is the starter codebase for the Greenroom Applied AI PM case study.

</div>

---

## What's new — AI Settlement Worksheet

This fork implements the **AI Settlement Worksheet** for `vs`, `percentage_of_net`, and `door` deals — replacing the "deal type not supported" empty state.

### Setup: add the Anthropic API key

The AI extraction step calls Claude. Before running the app, copy the example env file and add your key:

```bash
cp .env.local.example .env.local
# then open .env.local and replace "demo" with your actual key
```

**Demo mode:** If `ANTHROPIC_API_KEY` is not set or is set to `"demo"`, the extraction step returns a realistic simulated result so the full UX flow works without a live API key. A yellow banner in the confirmation form indicates demo mode is active. All other features — math engine, worksheet, share link, PDF export, GM approval — work identically in demo mode.

### How to test AI extraction on an existing deal

1. Open `/shows` and find a **vs deal** show (look for the "vs deal" badge).
2. Click **Settle**.
3. You'll see the deal notes displayed with a **Parse Deal** button.
4. Click it — Claude reads the deal notes and returns structured terms.
5. Review the confirmation form: source quotes, confidence scores, any contradictions with the structured DB fields.
6. For any recoup with ambiguous `isInsideExpenseCap`, the confirm button is blocked until you choose.
7. Confirm → worksheet renders.

### How to run a full vs-deal settlement end-to-end

```bash
# 1. Make sure the DB is up to date
npx drizzle-kit push

# 2. Start the dev server
npm run dev

# 3. Open http://localhost:3000/shows
# Find a vs deal → Settle → Parse Deal → Confirm → View worksheet
```

The worksheet renders:
- **Gross box office** → platform fees → **net**
- Each expense line (absorbed vs. passed-through flagged)
- Ratchet tier evaluation (if applicable)
- Guarantee vs. percentage comparison
- Walkout pot (if applicable)
- **Total to artist**

After the worksheet:
- **Share with TM** opens a mobile-responsive read-only link — no login required
- **Export PDF** downloads a formatted settlement statement
- **GM Approve** logs Marcus's approval with a timestamp

### Running unit tests

```bash
npx vitest run lib/dealMath.test.ts
```

9 tests covering: guarantee wins, percentage wins, ratchet triggers, ratchet doesn't trigger, walkout pot, recoup inside cap, recoup outside cap, percentage-of-net, door deal.

### New files in this fork

| File | Purpose |
|------|---------|
| `lib/extraction.ts` | Anthropic API call + typed extraction types |
| `lib/dealMath.test.ts` | Unit tests for math engine |
| `app/shows/[id]/settle/actions.ts` | Server actions: extract, confirm, GM approve |
| `app/shows/[id]/settle/ExtractionFlow.tsx` | 3-stage client component |
| `app/shows/[id]/settle/GmApproveButton.tsx` | GM approval button |
| `app/shows/[id]/settle/share/page.tsx` | Read-only shareable link |
| `app/shows/[id]/settle/pdf/route.ts` | PDF export (Node.js runtime) |

### New dependencies added

| Package | Purpose |
|---------|---------|
| `@anthropic-ai/sdk` | Anthropic API client for Claude extraction |
| `@react-pdf/renderer` | PDF generation (runs in Node.js runtime only) |
| `vitest` | Unit test runner for math engine |

---

## Before you start

You'll need:

1. **Node.js, version 20 or higher** — get it from [nodejs.org](https://nodejs.org/) (pick the LTS version). Verify with `node -v`.
2. **Git** — most computers have it. Verify with `git --version`. If not, install from [git-scm.com](https://git-scm.com/).
3. **A code editor.** [VS Code](https://code.visualstudio.com/) is great. [Cursor](https://cursor.com/) is what we'd reach for if we were doing this case study.
4. **A GitHub account.** Free at [github.com](https://github.com/).

If you're on Windows, run all the commands below in **Git Bash**, **PowerShell**, or **WSL** — not the legacy Command Prompt.

## Setup, step by step

### 1. Fork this repo to your own GitHub account

Click the **Fork** button at the top right of [https://github.com/samay-cbh/greenroom-starter](https://github.com/samay-cbh/greenroom-starter). You'll get a copy under your own username.

> _Why fork?_ A fork is your own copy of the repo. You'll commit your changes there, and submit your fork's URL when you're done. We can see your commit history that way.

### 2. Clone your fork to your computer

```bash
git clone https://github.com/YOUR-USERNAME/greenroom-starter
cd greenroom-starter
```

(Replace `YOUR-USERNAME` with your actual GitHub username.)

### 3. Install dependencies

```bash
npm install
```

This pulls down all the JavaScript packages the project needs. Takes about 60 seconds. You may see a few warnings — those are normal and safe to ignore.

### 4. Start the app

```bash
npm run dev
```

You'll see something like:

```
▲ Next.js 16.x
- Local:   http://localhost:3000

✓ Ready in 1.2s
```

### 5. Open it in your browser

Go to **[http://localhost:3000](http://localhost:3000)**.

You'll land on Mariana's home view at The Crescent. **Click "Where to start" in the sidebar** for an in-product orientation.

> **Tip:** Press **⌘K** (Mac) or **Ctrl+K** (Windows/Linux) anywhere in the app to open the command palette — search across shows and artists instantly.

---

## What's running

You're logged in automatically as **Mariana Reyes**, lead booker at The Crescent (650-cap, Nashville). The product has these surfaces:

| Route | What it is |
|---|---|
| `/shows` | Mariana's home view. 24 months of completed shows, searchable and grouped by month. |
| `/shows/[id]` | Show detail. Deal terms, artist info, ticket sales, expenses, comps. |
| `/shows/[id]/settle` | The in-app settlement worksheet. **Try it on a few shows.** |
| `/artists` | Roster of artists who've played the venue, bucketed by frequency. |
| `/reports` | Aggregate metrics. The numbers Pri (the CEO) is watching. |
| `/context` | Orientation for you, the candidate. Linked from the sidebar. |

### Recommended path your first time through

1. Open `/context` (the sidebar's "Where to start" link). 5-minute tour.
2. Then `/shows`. Pick a Vs-deal show. Click **Settle**. See what's broken.
3. Pick a Flat-deal show. Click **Settle**. See what works.
4. Read `data/transcripts/*.md` and `data/ceo-memo.md`.
5. Look at `data/dispute-thread.md`. Then press **⌘K** and search "Coastal Spell" to find the matching show.

---

## How the data is shaped

Twenty-four months of synthetic operational data, designed to feel like a real venue:

| Table | Approx rows | What it represents |
|---|---|---|
| `shows` | ~540 | 24 months of shows. The app displays only past shows (more appear as days pass). |
| `artists` | 59 | Mix of recurring (A-tier, 4+ shows) and one-off (D-tier) acts |
| `agents` | 14 | Across WME, CAA, Wasserman, Paradigm, and independents |
| `deals` | ~540 | One per show. Mix is flat ~33%, vs ~33%, % of net ~24%, door ~5%, % of gross ~4% |
| `ticket_sales` | ~540 | One summary row per show, with realistic sell-through distributions |
| `comps` | ~1,900 | Comp tickets across 6 categories |
| `expenses` | ~2,900 | Sound, lights, hospitality, marketing, production, backline |
| `settlements` | ~540 | All shows have settlement data. Past shows display it; future shows hold it until their date arrives. |

A few things worth knowing:

**The deal `notes_freetext` field is the truth.** The structured fields (`guarantee_amount`, `percentage`, `bonuses_json`, `expense_cap`) are filled inconsistently. Mariana enters deals as prose because the structured fields don't model the actual deals well. This mismatch is part of the realism.

**Vs deals come in flavors.** About a third of Vs deals are "standard." The rest mix in walkout pots, tier ratchets, and vs-gross variants. The current in-app tool can't settle most of these.

**Settlements have a lifecycle.** The state machine runs draft → submitted → in_review → signed (or disputed) → revised → finalized → paid → voided.

**Recoups are categorized.** Settlement records carry a `recoups_json` field with line items in categories like `marketing`, `hospitality_overage`, `production_overage`. Each can be `agreed`, `disputed`, or `withdrawn`.

---

## A note before you start

Real venue data is messy. Fields drift over time. Prose contradicts structured values. Statuses don't always match the underlying reality. Patterns hide across many shows that look unremarkable in isolation. **What the UI shows you isn't always what the data says — and neither is necessarily what actually happened.**

We'd encourage you to read the data closely, query `data/greenroom.db` directly, and bring skepticism to anything that seems clean. The candidates we hire are the ones who notice that the surface-level view is incomplete.

---

## Where to look for context

```
data/
├── ceo-memo.md            # Pri's Q4 memo: "winning on completeness, losing on craft"
├── dispute-thread.md      # The March 2025 marketing-recoup dispute, in full
├── greenroom.db           # SQLite database — pre-seeded, ready to go
└── transcripts/
    ├── mariana.md         # 30-min interview with the booker
    ├── diego.md           # Tour manager perspective
    ├── marcus.md          # GM perspective
    └── sarah-kim.md       # Agent perspective (WME)
```

These aren't decorative. They contain signals the database deliberately doesn't capture — Mariana's frustrations, the agent's pet peeves, the things that escalate disputes. Mine them.

---

## File map

```
app/
  context/                  # Candidate orientation page
  shows/                    # Show list with search + month grouping
  shows/[id]/               # Show detail (concert poster-style header)
  shows/[id]/settle/        # Settlement worksheet — ExtractionFlow for vs/net/door deals
  shows/[id]/settle/share/  # Read-only shareable link (no auth, mobile-responsive)
  shows/[id]/settle/pdf/    # PDF export route (Node.js runtime)
  artists/                  # Artist roster (card grid with genre dots)
  reports/                  # Aggregate metrics + craft gap analysis
  icon.svg                  # Brand favicon
  opengraph-image.tsx       # Social share image
components/
  brand/logo.tsx            # The Greenroom frequency-mark logomark / wordmark
  command-palette/          # ⌘K global search (shows + artists)
  ui/                       # Buttons, badges, cards
  layout/
    sidebar.tsx             # Fixed sidebar with active nav state
    nav-links.tsx           # Client component for pathname-aware nav
lib/
  dealMath.ts               # Settlement engine — vs/net/door math, ratchets, walkout pots
  dealMath.test.ts          # Unit tests — 9 cases covering all deal structures
  extraction.ts             # Anthropic API call + typed extraction result
  queries.ts                # Server-side data fetching, extended with dealExtractions join
  format.ts                 # Money + date helpers
db/
  schema.ts                 # All tables — includes dealExtractions + settlement additions
  migrations/               # Auto-generated by drizzle-kit; 0001_tan_puma.sql adds new tables
  seed.ts                   # The 24-month synthetic seed
  index.ts                  # libsql + Drizzle client
data/                       # Markdown context + greenroom.db
```

---

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** with shadcn-style component primitives
- **Drizzle ORM** + **libsql** (pure-JS SQLite — no native compile, no setup)
- **Fraunces** (variable serif, via `next/font/google`) for display headings
- **Geist Sans / Mono** (self-hosted via the `geist` package) for body + code
- **lucide-react** for icons, **date-fns** for dates

Everything is deliberately conventional. Use Cursor, Claude Code, or any other AI tool to navigate and modify the codebase — we expect you to.

---

## How to submit

When you're done:

1. **Push your branch.**
   ```bash
   git add . && git commit -m "your message" && git push
   ```
2. **Send the hiring contact:**
   - The URL of your forked repo and branch name
   - Your 1–2 page PRD-quality memo (PDF)
   - A 5–10 minute Loom walking through the prototype

---

## Troubleshooting

### "Command not found: npm" or "node is not recognized"

Node.js isn't installed (or isn't on your PATH). Install from [nodejs.org](https://nodejs.org/), then restart your terminal.

### "Port 3000 is already in use"

Something else is using port 3000. Two options:

**Stop the other thing first.**
- Mac/Linux: `lsof -ti:3000 | xargs kill -9`
- Windows: `netstat -ano | findstr :3000` then `taskkill /PID <pid> /F`

**Or run on a different port:**
```bash
npm run dev -- -p 3001
```

### "Module not found" or weird build errors

Your `node_modules` is probably corrupt or incomplete. Reset it:

```bash
rm -rf node_modules package-lock.json
npm install
```

### The database looks empty, or you broke the data while exploring

Reset the database:

```bash
npm run db:reset
```

This drops the SQLite file and regenerates 24 months of data. Takes ~5 seconds. Deterministic — same data every time.

### Page looks ugly or buttons aren't visible

Hard-refresh your browser to clear the CSS cache:
- Mac: **⌘ + Shift + R**
- Windows/Linux: **Ctrl + Shift + R**

### "I want to see what's actually in the database"

```bash
npm run db:studio
```

Opens [Drizzle Studio](https://orm.drizzle.team/drizzle-studio/overview) at `local.drizzle.studio` — a visual table browser. You can also open `data/greenroom.db` with any SQLite client (e.g. [TablePlus](https://tableplus.com/), [DBeaver](https://dbeaver.io/), or `sqlite3` CLI).

### Anything else

If you're stuck, email the hiring contact. We'd rather you ask than burn an hour fighting a setup issue.

---

Welcome to The Crescent.
