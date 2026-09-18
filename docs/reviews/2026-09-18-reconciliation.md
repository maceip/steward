# Cross-repository reconciliation — 2026-09-18

Base: 082d1d9. Sources: Windows steward policy/schema edits, Windows
steward-governance-review docs/research/CI, Mac ws/D grant proposals and ws/F
Azure CVM appraisal candidates. Original source snapshots are preserved off-repo.

Resolutions:
- Preserve optional unified_quote policy schema; this does not implement the
  aDNS uq-eat-v2 verifier, which continues rejecting all evidence.
- Accept the Azure CVM policy fields and SVCB grant type already supported by
  aDNS, with bounded exact field validation and nonempty AK issuer/root pins.
  Policy IDs remain bound to complete content; new fields cannot mutate an old ID.
- Preserve ws/D/ws/F candidates as historical, unapplied files. Empty roots and
  the combined policy's TCB mismatch still prohibit treating them as deployable.
- Preserve governance design/review and verifier research as experimental work.
  It does not replace the deployed voting protocol or resolve the prototype
  bypasses listed in the review.
- Mock email in Python flow tests so local/CI validation cannot send notices.

Validation: 22 Node constitution tests, 8 Python tests, and the research runner
(no failures). aDNS must package the composition from this exact commit and
record its SHA/digest. No live constitution, grant or appraisal policy was changed.
