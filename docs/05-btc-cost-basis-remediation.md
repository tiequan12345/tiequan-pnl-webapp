# BTC Cost Basis Remediation Plan

## Purpose
Restore accurate BTC (and other asset) cost basis after transfers, align runtime holdings with recalc logic, and prevent future drift. This plan addresses both the display/holdings pipeline and the transfer-matching logic used during recalculation.

## Executive Summary of Root Causes
1. **Holdings calculation ignores transfer pairing.** Incoming transfers with no valuation flip cost basis to unknown, even when source accounts have known basis.
2. **Recalc transfer matching is too strict.** Transfers with small quantity mismatches (fees, slippage) are treated as invalid/unmatched, so basis is not moved.
3. **Cost basis resets are time‑scoped.** After the last reset, additional transfers occur without a subsequent refresh, so drift accumulates.

## Scope
- **Assets:** Primarily BTC, but the same logic applies to any asset with transfers.
- **Systems:** Holdings API / UI, cost basis recalculation job/endpoint, ledger transfer modeling.
- **Data:** LedgerTransaction history, Cost Basis Reset entries, Holdings view results.

## Guiding Principles
- Preserve historical accuracy (no silent overwrites without audit trail).
- Make transfer cost basis propagation deterministic and auditable.
- Align runtime holdings logic with recalc logic to prevent divergence.
- Prefer robust matching in the presence of fees.

---

## Phase 1 — Triage & Impact Assessment (1–2 days)
**Goal:** Confirm breadth, quantify impact, and identify which transfers are failing.

### 1. Inventory affected accounts and assets
- Enumerate accounts with non‑zero BTC holdings and missing/unknown cost basis.
- Identify destination accounts that received BTC via transfer after the last cost basis reset.

### 2. Categorize transfer anomalies
- Transfers with exact matching quantities (should propagate basis) vs. mismatched quantities (likely fee‑impacted).
- Transfers without partner leg or with ambiguous matching.

### 3. Produce an internal impact report
- List: destination account, transfer date, quantity, expected basis (from source), observed basis (current holdings).
- Highlight material discrepancies for finance/tax implications.

**Deliverable:** Impact matrix covering BTC (and top assets) with a ranked severity list.

---

## Phase 2 — Align Holdings Logic with Transfer Matching (2–4 days)
**Goal:** Ensure runtime holdings matches transfer propagation used by recalc.

### 1. Standardize transfer matching rules
- Define a single transfer pairing policy shared by holdings and recalc.
- Confirm tolerance policy for small mismatches (fee/slippage).
- Define how to treat partial matches and unmatched legs.

### 2. Mirror transfer basis propagation in holdings
- Holdings calculation must:
  - Pair transfer legs reliably.
  - Move basis from source to destination based on average cost at time of transfer.
  - Preserve costBasisKnown flags correctly.

### 3. Add diagnostic flags to holdings results
- Flag rows where basis is unknown due to missing/mismatched transfer pairing.
- Provide visibility for debugging without inspecting the ledger manually.

**Deliverable:** Unified transfer logic spec + updated holdings behavior (no code yet).

---

## Phase 3 — Relax Recalc Transfer Matching (2–3 days)
**Goal:** Ensure the recalc engine handles realistic transfer mismatches.

### 1. Fee‑tolerant matching
- Allow small absolute or relative differences between legs (configurable).
- Prefer pairing by time window and reference, then allow tolerance in quantity.

### 2. Support “fee leg” handling
- If mismatch exceeds tolerance, classify as transfer + fee deduction rather than invalid.
- Decide whether the fee is charged to the source or destination account in basis.

### 3. Reclassify transfer diagnostics
- Distinguish “hard invalid” from “fee‑adjusted mismatch” for auditing.

**Deliverable:** Revised transfer matching policy for recalc, including fee handling rules.

---

## Phase 4 — Data Repair & Reconciliation (1–2 days)
**Goal:** Backfill correct basis and validate results.

### 1. Run full recalculation (after logic alignment)
- Recompute cost basis for all accounts and assets.
- Persist new COST_BASIS_RESET entries as of a known cutoff.

### 2. Verify end‑to‑end holdings output
- Compare output against recalculated resets and expected average costs.
- Validate that holdings view now reflects propagated transfer basis.

### 3. Spot‑check known problematic transfers
- Confirm accounts like EVM HW Wallet and Hydrex now show non‑zero cost basis reflecting inbound transfers.

**Deliverable:** Reconciled dataset + validation checklist showing resolved discrepancies.

---

## Phase 5 — Monitoring & Guardrails (1–2 days)
**Goal:** Prevent recurrence and make anomalies visible.

### 1. Automated health checks
- Alert when holdings contain non‑zero quantity with unknown cost basis.
- Alert when transfers remain unmatched or fee mismatched above tolerance.

### 2. Recalc scheduling strategy
- Option A: Run recalc after bulk import/transfer events.
- Option B: Schedule periodic recalc (daily/weekly) for drift prevention.

### 3. Audit report export
- Generate a periodic transfer‑basis audit report for finance/tax review.

**Deliverable:** Operational monitoring plan and alert thresholds.

---

## Acceptance Criteria
- Holdings view matches recalc outputs for all BTC accounts.
- Transfers with small fee mismatches still propagate basis correctly.
- No accounts show non‑zero BTC with unknown basis without an explicit diagnostic flag.
- Recalc output is stable across repeated runs (idempotent).

---

## Risks & Mitigations
- **Risk:** Relaxed matching may pair incorrect transfers in high‑volume accounts.
  - **Mitigation:** Require time‑window + reference alignment, and log diagnostic confidence.
- **Risk:** Fee handling could distort basis if treated inconsistently.
  - **Mitigation:** Define a canonical policy and document it in product/finance notes.
- **Risk:** Retroactive basis changes affect historical P&L.
  - **Mitigation:** Preserve old resets and record a new “recalc as of” cutoff.

---

## Owners & Collaboration
- **Ledger Logic Owner:** Backend/Finance Engineering
- **Holdings UI Owner:** Frontend
- **Data Verification:** Finance/Accounting
- **Release Approval:** Senior Dev + Finance

---

## Next Actions (Proposed Order)
1. Validate anomaly list and quantify impact (Phase 1).
2. Finalize transfer pairing policy (Phase 2 & 3).
3. Implement logic alignment (Phase 2).
4. Recalc cost basis and reconcile (Phase 4).
5. Add monitoring and periodic audits (Phase 5).
