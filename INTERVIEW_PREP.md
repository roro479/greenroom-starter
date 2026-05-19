# Interview Prep — Greenroom AI Settlement Worksheet

## One-paragraph pitch

Mariana, the lead booker at The Crescent, can't settle 62% of her deals — vs, percentage-of-net, door — in Greenroom because the settlement engine only handles flat guarantees and simple percentage-of-gross. She settles in a Google Sheet, screenshots the result to the GM, and emails a PDF to the agent the next morning. Every disputed settlement in the database carries a positive TM signoff — "Looks good," "👍," "ok wire monday" — because disputes happen at agent review, not at the 2am table. The gap isn't calculation. The gap is provenance: the deal terms live in `dealNotesFreetext` prose that the engine can't read, and there's no audit trail connecting what Mariana calculated to what the TM verbally agreed to. This feature makes the engine read the notes — via Claude — shows Mariana exactly what it extracted and where it came from, requires her to confirm before math runs, and generates a traceable step-by-step worksheet with a shareable link the TM can open on their phone and a GM approval flow that replaces the screenshot text.

## Defense: "Why not just ship the vs-deal math engine first?"

A vs-deal math engine without the extraction layer solves the wrong problem. Mariana can already do the math — she's been doing it in a Google Sheet for six years. What she can't do is produce a worksheet that traces every number back to a source, covers the edge cases (ratchet tiers, walkout pots, ambiguous recoups), and creates an audit trail the agent can trust at 9am the next day.

If you ship the engine without extraction, you've moved the work from a spreadsheet to a form. Mariana still has to manually type `$5,000`, `80%`, `$2,500` into the engine. You've saved her about three minutes and given her one more thing to keep in sync with the actual deal email. The real friction is "the deal is in the prose, the engine can't read it, and there's no paper trail." Solving the engine alone addresses the first part. This feature solves all three.

The extraction layer is also the infrastructure for Phase 3 (pre-show risk flagging). Once the deal is structured and confirmed, you can compute expected settlement ranges before the show and flag ambiguities — like the recoup interpretation that cost $720 — on Wednesday, when the agent is reachable, instead of at 2am.

## Defense: "LLMs will hallucinate financial terms — this is a money product"

Three mitigations, layered:

1. **Temperature 0** — Claude makes no creative choices. The system prompt specifies exact JSON schema; the model maps prose to it deterministically. There is no "creative" interpretation.

2. **Mandatory human confirmation** — Every extraction goes through Mariana before it touches math. She sees each extracted value, the exact quote it came from, and a warning flag on anything with confidence below 0.8 or that contradicts the existing structured DB fields. She can edit any field. The confirm button is disabled until every ambiguous recoup has an explicit selection. The LLM output never auto-flows into settlement math.

3. **Full fallback path** — If the API fails, the response fails to parse, or the model can't extract required fields, the UI surfaces a manual entry form. Mariana enters the terms directly. The same confirmation flow runs. The math is always deterministic — the LLM is a parser, not a calculator.

What the LLM does: reads prose, extracts structure, expresses confidence. What it never does: run the settlement math or make a choice Mariana doesn't explicitly confirm.

## Defense: "The agent doesn't use Greenroom — how does a worksheet help them?"

The agent gets the worksheet via two channels that don't require a Greenroom account:

1. **Shareable link** — `/shows/[id]/settle/share` is public, no auth required. Mariana sends it to the agent in the same email she currently sends the PDF. The agent opens it on their phone and sees gross, fees, net, every expense line, the deal basis, and the full step-by-step math — exactly what their team needs to verify.

2. **PDF export** — Same data, downloadable, for agents who prefer PDFs or have their own systems.

The difference from today: the PDF Mariana currently sends is a screenshot of a Google Sheet with no traceable source for each number. The new PDF cites deal terms for every line. The agent can see exactly which expense was inside vs. outside the cap, what the ratchet tier evaluated to, and why the percentage won (or the guarantee did). That traceability is what eliminates the 9am "what is this $900 line" email — not the channel.

## The disputed-settlement DB finding

Every settlement with `status = 'disputed'` in the database has a positive `signoff_text`: "Looks good," "👍," "ok wire monday." Zero exceptions.

This means: TMs are signing off at the 2am table. Disputes are happening at agent review the next morning.

The implication for product strategy: the 2am settlement conversation is not the trust problem. The 9am PDF email is the trust problem. Mariana's math is being agreed to by the TM verbally and in Greenroom, and then re-scrutinized by an agent who wasn't in the room, from a document that doesn't show its work.

This shifts the design priority from "make the 2am tool better" to "make the 9am evidence stronger." The shareable link and the provenance worksheet are the direct response. The GM approval replaces the screenshot text — Marcus approves the same worksheet the agent sees, so there's a documented chain of custody before money moves.

## What was cut and why

| Cut | Reason |
|-----|---------|
| Pre-show risk flagging | Phase 3 — explicitly out of scope; requires this infrastructure first |
| Deal intake / notes editing | Out of scope per spec; Mariana trusts the prose, not the form |
| Agent login / portal | Not needed; shareable link + PDF covers the agent use case |
| Inline ratchet tier editing | Complexity for v1; re-parse covers the use case |
| Auto-resolution of ambiguous recoups | The Coastal Spell dispute proves this is wrong; explicit choice required |
| Session management / real user auth | Prototype — hardcoded to Mariana + Marcus user IDs |
| Production hardening | Prototype optimizes for PM-legible code and working UX |

## How this enables Phase 3 (pre-show risk flagging)

Phase 3 requires predicting settlement outcomes before the show. That requires:
- Structured deal terms (this feature provides `confirmedTermsJson`)
- A deterministic math engine that can compute expected ranges at any ticket count (this feature provides `calculateVsDeal()` etc.)
- A definition of "ambiguous" at the deal level (this feature flags `isInsideExpenseCap: null` and `confidence < 0.8`)

With this infrastructure, Phase 3 is: read confirmed terms + expected sell-through → run math at 50%, 75%, 100% capacity → flag if guarantee wins at all thresholds (low-risk) vs. percentage wins only at sellout (high-variance) → surface "this deal has an ambiguous recoup that needs clarification before Friday" on Wednesday.

The extraction layer is the dependency. Phase 3 cannot exist without structured, confirmed deal terms. This is Phase 1.
