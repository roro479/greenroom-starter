# Loom Script — Greenroom AI Settlement Worksheet
## 7-Minute Walkthrough

---

### Minute 1 — The Empty State (0:00–1:00)

Open the shows list at `/shows`. Filter to a vs deal — something like Pale Lake or Coastal Spell. Click through to the settle page.

> "This is Mariana's world every Friday night. She's the lead booker at The Crescent, a 650-capacity room in Nashville. She has nine unread texts from the tour manager, the room is loading out, and she's trying to settle a show."

Point to the amber empty state card:

> "Here's what Greenroom gives her right now: a warning that says 'the in-app tool can't settle a vs deal yet.' Below it, you can see the raw numbers — gross box office, fees, expenses — pulled from the system. And below that, the deal notes she actually wrote when she booked the show. All the information is here. The engine just can't read it."

> "This happens for about 62% of her shows. Vs deals, percentage-of-net, door deals — all land here. So she opens a Google Sheet. Does the math. Screenshots the result to the GM. Emails a PDF to the agent. There's no audit trail. And we'll see in a minute why that's where the $720 disputes come from."

---

### Minute 2 — The Deal Notes (1:00–2:00)

Scroll down to the deal notes section in the empty state card. Read the `dealNotesFreetext` aloud:

> "Five thousand versus eighty percent of net after expenses, whichever greater. Expenses capped two-five. Hospitality cap five hundred. Ratchets to ninety percent over eighty percent capacity."

> "This is the source of truth. Mariana wrote this when she negotiated the deal. It's in Greenroom. But the settlement engine doesn't speak prose — it looks for structured fields, and for complex deals, those fields aren't reliably filled. The notes and the structured fields sometimes contradict each other. We'll see that in a second too."

> "What we need is something that can read this note and extract the deal terms — with enough confidence to show Mariana exactly what it found and where. That's what we built."

---

### Minute 3 — Parse Deal (2:00–3:30)

Click the **Parse Deal** button.

> "I'm calling Claude — sonnet-4, temperature zero — with the deal notes as the user message. While it processes..."

Spinner shows: "Reading your deal notes…"

> "Notice the message. This isn't a silent spinner — Mariana needs to know what's happening. At 2am, a broken spinner is the worst outcome."

Extraction result appears in Stage 2.

> "Here's what came back. Guarantee: $5,000. Percentage: 80%. Basis: net. Expense cap: $2,500. Hospitality cap: $500. Ratchet tiers: 80% base, 90% over 80% capacity."

Point to the amber source quote callouts:

> "Every field shows the exact substring from the deal notes that it came from. Not a paraphrase — the actual text. This is auditable. If Mariana or the agent ever questions a number, the source quote is the answer."

Point to the warning icon on a field with confidence below 0.8:

> "This field has low confidence — the model flagged it as ambiguous. Mariana needs to verify it. And notice — any field where the extraction contradicts the existing structured database field gets flagged too. In this case the structured percentage field says 75%, but the prose was updated after a phone renegotiation to 85%. Both values are shown side by side."

---

### Minute 4 — Confirm and Run Settlement (3:30–5:00)

Walk through the confirmation form:

> "This step is mandatory. There is no auto-skip. Mariana sees every extracted field as an editable input. She can change anything. The confirm button isn't enabled until every ambiguous term is resolved."

Scroll to the recoups section (if present):

> "Here's the Coastal Spell pattern. There's a marketing recoup in the notes — $900 — but the deal email was ambiguous about whether it's inside or outside the expense cap. These two interpretations yield different settlement amounts. Inside the cap, the recoup counts toward the $2,500 limit — the agent's preferred read. Outside the cap, it comes off gross before net is computed — Mariana's original read. That dispute cost $720 and a week of emails."

> "The confirm button is disabled until Mariana makes an explicit choice here. We never default."

Select an option, then click **Confirm & Run Settlement**.

> "When she confirms, the server action runs the math immediately and persists the worksheet. Nothing re-runs on page load — what you see here is exactly what the share link and the PDF will show."

Worksheet renders:

> "Here's the worksheet. Gross box office at the top. Ticket platform fees. Net. Each expense line, with absorbed vs. passed-through flagged. The ratchet tier evaluation — 83% fill rate triggers the 90% tier. Guarantee vs. percentage comparison — percentage wins at $12,196. Every number has a formula and a source reference."

Point to the large hero total:

> "This is what the tour manager is waiting for. It's large, it's clear, and every number behind it is traceable."

---

### Minute 5 — Share Link (5:00–5:45)

Click the **Share with TM** button. Open the link in a new tab. Resize to mobile width (375px).

> "This is what Diego — the tour manager — sees on his phone while he's walking to the back office. No login. No Greenroom account. Just the worksheet."

> "Gross, fees, net, every expense, the final number. If there are recoups, they're shown with their dispute status. GM approval shows if Marcus has signed off."

> "The TM can review this on the way in. By the time he sits down, he's already seen the math. The conversation becomes: any questions? Not: where did this number come from?"

> "Note what's not here: no internal notes, no confirmation audit log, no user IDs. Just what the settlement shows."

---

### Minute 6 — GM Approval and the DB Finding (5:45–6:30)

Back on the settle page, click **GM Approve**:

> "Marcus gets the same worksheet Mariana sees. He clicks one button. His approval is logged with a timestamp. This replaces the screenshot text at 1:30am — Marcus is now approving the actual data, not a photo of a spreadsheet."

Open the database directly or switch to the reports page:

> "Here's the finding that changed the design of this feature. Every disputed settlement in the database — every single one — has a positive signoff text. 'Looks good.' 'Thumbs up.' 'OK wire Monday.' The TM agreed at the table. The dispute came from the agent, the next morning, reading a PDF."

> "That means the 2am conversation isn't the trust problem. The 9am email is. Mariana's math is fine. The problem is she can't prove it. This feature gives her the proof: source quotes, step-by-step formulas, GM-approved numbers, a shareable link. The 9am email becomes the settlement link, not a PDF screenshot."

---

### Minute 7 — Roadmap (6:30–7:00)

> "This is Phase 1. The extraction layer and the human confirmation step. Two things this enables next."

> "Phase 2 is the email to the agent. Right now Mariana sends a PDF she generated from a spreadsheet. With this, she sends the shareable link — same worksheet, GM-approved, every number sourced. Agents who currently re-audit PDFs can see the math in real time."

> "Phase 3 is pre-show risk flagging. We now have structured, confirmed deal terms for every vs deal. Before the show, we run the math at 50%, 75%, and 100% capacity and ask: does this deal have variance? Is there an ambiguous recoup that needs clarification before Friday? Does the deal have a ratchet that only triggers at near-sellout — and current advance sales suggest it might not? Surface that on Wednesday afternoon, when the agent is reachable, instead of at 2am. That's built on this infrastructure. You can't do it without confirmed deal terms."

> "The extraction layer is the foundation. This is what we shipped."

---

*Total runtime: approximately 7 minutes. Live demo recommended; can run against any vs deal in the starter DB.*
