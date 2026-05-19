# Trade-offs — Greenroom AI Settlement Worksheet

## What was built and why

### AI extraction over a manual form

We could have shipped a structured form — "fill in guarantee, percentage, expense cap" — and skipped the LLM entirely. We didn't, for one reason: Mariana already fills in those fields, inconsistently, and they contradict the prose. If you ask her to fill in the form again at settlement time, she's doing double-entry in a system she doesn't trust.

The LLM reads what Mariana actually wrote and asks her to verify it. That's a fundamentally different interaction: she's reviewing, not re-entering. The source quotes make it auditable. The contradiction detection surfaces drift between the structured fields and the prose — which is real, documented in the seed data, and the source of at least one $720 dispute.

### Provenance over calculation speed

The fastest path to settlement math for vs deals is extending `calculateSettlement()` to handle vs deals with structured fields. No LLM, no extraction, no confirmation step. Ship in a day.

We didn't do that because the problem isn't calculation. Mariana can do the math. The problem is that the output of her math has no provenance — no source quotes, no step citations, no audit trail. The agent gets a PDF that says "$12,285" with no explanation of why. The extraction layer exists to generate that explanation, field by field, traceable to the exact prose in the deal email.

### Human confirmation always required

The confirmation step adds friction. A faster UX would extract and immediately run the math. We chose mandatory confirmation for two reasons:

1. LLMs make mistakes. Confidence scores surface uncertainty, but they don't eliminate it. Mariana is the ground truth for her own deals. Her confirmation is the legal record.

2. The Coastal Spell pattern. The ambiguous recoup that cost $720 could not have been resolved by an LLM — it required a business decision about contract interpretation. The UI surfaces this as an explicit, unresolvable-by-default choice. A system that auto-chooses inside or outside cap on behalf of the venue will occasionally be wrong, and "the AI decided" is not a defensible position with WME at 9am.

## What was cut and why

### Pre-show risk flagging

Phase 3 in the roadmap. Requires confirmed deal terms (now available) and expected sell-through data (already in the DB). Cut from this build to stay focused on the core provenance gap. The extraction infrastructure is the prerequisite — Phase 3 is one sprint behind this one.

### Re-extraction on edit

The current UX: if Mariana wants to re-run extraction after editing `dealNotesFreetext`, she clicks "Re-parse." There's no live sync between the notes field and the extraction. Production would add a "notes changed — re-parse recommended" banner. Cut as premature optimization for a prototype.

### Expense reconciliation UX

Mariana spends half her Wednesday chasing expenses. The worksheet shows expenses from the DB, but there's no workflow to import, reconcile, or flag missing receipts. That's an adjacent problem. Not in scope.

### Inline ratchet/walkout editing

The confirmation form shows extracted ratchet tiers and walkout pots as read-only. Editing requires re-parsing. Production would make these inline-editable like the scalar fields. Cut for complexity — re-parse is a sufficient escape hatch for v1.

## Known risks and mitigations

### LLM accuracy on novel shorthand

**Risk:** Deal notes use venue- or agent-specific shorthand not in the glossary. Claude returns low confidence or wrong values.

**Mitigation:** Confidence scoring surfaces uncertainty. Warning flags on low-confidence fields. Full manual fallback. Mariana must confirm — she's the last line of defense. The system does not fail silently.

### Expense cap interpretation drift

**Risk:** The inside/outside distinction for recoups is genuinely ambiguous in the industry. Different venues treat it differently.

**Mitigation:** We never default. Every null `isInsideExpenseCap` blocks confirm. Mariana's choice is logged in `confirmationLogJson`. In a dispute, the audit log shows exactly when the decision was made and who made it.

### Extraction runs once

**Risk:** If `dealNotesFreetext` is updated after extraction, the confirmed terms don't auto-update.

**Mitigation:** The "Re-parse" button in Stage 2 re-runs extraction and clears confirmed terms. Production would add a change-detection warning. For a prototype, this is acceptable.

## What would change in a production build

| Prototype behavior | Production change |
|-------------------|-------------------|
| Hardcoded `user_mariana` / `user_marcus` user IDs | Real session + role-based access |
| Single venue (The Crescent) | Multi-tenant, venue-scoped data |
| SQLite / libsql | Managed Postgres |
| One extraction per deal, no versioning | Full extraction history with timestamps |
| PDF styling basic | Design-reviewed settlement template |
| No email integration | Send share link directly to agent's email from Greenroom |
| No rate limiting on extraction | API key quota + per-user rate limiting |
| Manual fallback as edge case | Structured fallback telemetry to improve the prompt |
| Settlement stored in worksheetJson only | Append-only audit log for every calculation run |
| No diff between re-extractions | Diff view: "these fields changed since last extraction" |
