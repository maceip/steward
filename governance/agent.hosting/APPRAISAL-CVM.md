# Azure CVM appraisal candidates for Agent A

These unsigned proposal bodies describe captured mail/worker values for
`azure-cvm-snp`. They are **BLOCKED candidates, not accepted policies or
successful hardware appraisals** (`security_claim: false`). Agent F pushes
only branch `ws/F`. Agent A reviews, fills verified AK root pins, assigns a
new policy identity for any content change, obtains D's signature, and
proposes only after the new primary image and constitution are installed.

| Candidate | Service | Measurement prefix | Genoa minimum TCB (BL, TEE, SNP, microcode) |
|---|---|---|---|
| `appraisal-policy-mail-cvm.candidate.json` | `mail.agent.hosting.` | `b2b53ada66639958` | 12, 0, 28, 88 |
| `appraisal-policy-worker-cvm.candidate.json` | `worker.agent.hosting.` | `aa7c9da55c1386e5` | 10, 0, 27, 88 |
| `appraisal-policy-cvm-combined.candidate.json` | both | both full measurements | 12, 0, 28, 88 |

Both grants use **zone `agent.hosting.`**, whose runtime storage holds one
appraisal policy. Applying separate mail and worker candidates sequentially
would replace one with the other and invalidate existing registrations.
The combined candidate retains the stronger mail TCB floor; the captured
worker state is below that floor even if its corrupted HCL were recaptured.
Do not silently lower the mail floor. Approve a suitable common platform
release or implement separately governed per-subject floors before enabling
both. The candidate window is 2026-09-16 through 2026-10-16 UTC and must be
reviewed at signing. Measurement equality is not a reproducible-build or
application-integrity proof. Host data is explicitly pinned to zero; VMPL 0.

Every candidate has an empty `azure_cvm.ak_root_sha256`, which the verifier
rejects. The CA issuer CN `Azure Cloud Virtual TPM CA - 25` is an additional
constraint, not a replacement for a root certificate pin. Captured inputs:

- Mail HCL binds its 1233-byte runtime JSON to report_data and contains an RSA
  HCLAkPub. No mail AK certificate/chain, VCEK or workload TPM quote is present.
- Worker JSON was recovered from Agent D's worktree. The HCL claims-size says
  1200 while its JSON is 1203 bytes; neither runtime hash matches report_data.
  Its AK leaf is available but issuer chain, VCEK and workload quote are absent.
- No fixture proves a workload key's AK-signed binding. Existing receipt-key
  hashes in the capture are declarations, not hardware verification.

The Rust implementation pins the AMD Genoa ARK certificate (copied from an
existing genuine ACI capture), DER SHA256
`4c6598d19c18719c5dfd4a7d335f674e5bfe1d8f800cea2cf270c10d103db2f1`.
See aDNS `docs/azure-cvm-snp.md` and fixture provenance for the exact COSE/HCL/TPM
contract and tests. No MAA is used; no host was contacted for this change.

## Constitution changes owned by Agent A

`adnsPolicyIdentity` currently allows only the original fields (plus optional
`uvm_endorsement_time_policy`). It rejects `azure_cvm`; add this optional field
and validate VMPL 0..3, nonempty exact AK issuer CN allowlist and nonempty
lowercase 64-hex root certificate digest allowlist before activation.
`adnsGrant` currently permits only `TXT` in `attested_record_types`; add
`SVCB` before granting that type. Add governance tests and compose the
constitution through the normal steward source workflow. Agent F has not
edited constitution sources or `ccf/governance/`.

SVCB records are registration-owned and require both an exact granted owner
name and the SVCB type. Existing grant-mail/grant-worker files are untouched;
review current workload SPKI and host addresses before proposing new grants.
There is no deployment or policy transaction ID in this handoff.
