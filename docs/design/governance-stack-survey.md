# Governance stacks we could copy — survey beyond CCF

Historical survey imported from agent-hosting. The "Today" column, activity
claims and effort estimates are preserved as the original investigation.
Use the [2026-09-17 review](../reviews/governance-protocol-review.md) for the
current code assessment and refreshed analogs, and the
[adoption plan](agent-operated-project-governance.md) for project-wide scope.

Status: homework for the release-authority decision (companion to
`release-authority-design.md`), 2026-09-16. Every "active" claim below was
checked against the project's latest commit date or live page on 2026-09-16.

## What we are actually governing

| Need | Question it answers | Today |
|---|---|---|
| **N1 Release authority** | which code (measurement / CCE / UVM / TCB, and which workload policy) is approved; by whom; with what threshold; how keys rotate; how rollback is refused | one member key on one laptop; `resolve()` accepts everything; D mechanism exists but no D |
| **N2 Transparency / receipts** | can a third party verify later that an approval or a chain head was recorded, without trusting us | CCF receipts from the agentdns ledger (our own network) |
| **N3 DNS key governance** | who holds the KSK, how it rolls, how the DS changes at the parent | KSK inside the agentdns enclave; no online rollover; Azure DNS still authoritative |
| **N4 Attestation-root governance** | which hardware/UVM roots are trusted | AMD ARK + Microsoft UVM endorsement, fixed in the appraisal policy |

## Candidates

| # | Stack | Active network you can point at | Governance rule | Copyable software | Fits | Effort to adopt | Caveats |
|---|---|---|---|---|---|---|---|
| 1 | **TUF via tuf-on-ci** (The Update Framework) | Sigstore root of trust: `sigstore/root-signing` (commit 2026-09-15), published at https://tuf-repo-cdn.sigstore.dev/ ; PyPI (PEP 458) | named human keyholders with hardware keys, per-role thresholds, signing events as PRs, expiry forces re-signing, monotonic `version` refuses rollback, online roles via KMS | https://github.com/theupdateframework/tuf-on-ci , https://github.com/theupdateframework/python-tuf (2026-09-15), https://github.com/theupdateframework/go-tuf | **N1 excellent** (threshold, rotation, anti-rollback, expiry are the protocol) | days | needs GitHub Actions + a KMS for online roles; delivers signed *metadata*, not a Merkle log |
| 2 | **Sigstore private instance** (Fulcio + Rekor + CT log, `scaffolding`) | Sigstore public good (npm provenance, GitHub artifact attestations, Kubernetes releases); https://docs.sigstore.dev/about/threat-model/ | identities are OIDC (CI or humans), short-lived certs, every signature logged in Rekor with inclusion proofs; trust root delivered by #1 | https://github.com/sigstore/scaffolding (2026-09-11), rekor (2026-09-14), fulcio (2026-09-02) | N1 (identity = build), **N2** | 1–2 weeks (Kubernetes) | trust root becomes your OIDC provider; you still need #1 for the root |
| 3 | **Sigsum** (minimal transparency log + witness cosigning) | https://www.sigsum.org/ ; witnesses run by independent orgs (Glasklar et al.) | log operator appends; independent witnesses cosign checkpoints; clients require *k* witness signatures | https://git.glasklar.is/sigsum/core/sigsum-go | **N2 excellent**, cheap independence | days | no identity/policy layer — pair with #1 or CCF |
| 4 | **transparency-dev / Certificate Transparency** (Trillian, Tessera, witness network) | CT logs by Google, Cloudflare, DigiCert, Let's Encrypt; https://certificate.transparency.dev/logs/ ; https://transparency.dev/ | log lifecycle (pending → usable → read-only → retired) set by Chrome/Apple CT policy; SCT/inclusion proofs; witnesses | https://github.com/google/trillian (2026-09-10), https://github.com/transparency-dev/tessera (2026-09-15) | N2 | medium | policy authority is the browsers, not you — pattern only |
| 5 | **CCF + scitt-ccf-ledger** (SCITT statements/receipts) | Microsoft Signing Transparency (GA, logs Microsoft's own builds) | member proposals under a constitution (majority `resolve.js`), registration policy in JS/Rego over statement headers (`did:x509` issuer, `_svn`) | https://github.com/microsoft/scitt-ccf-ledger (2026-09-14) | N1 + N2 in one, confidential execution | 2–3 days (we already run CCF) | one more network to recover; same people problem |
| 6 | **ICANN Root KSK ceremonies + RFC 5011 / RFC 6781** | the DNS root since 2010; KSK rolled 2018 | Trusted Community Representatives, two facilities, HSMs, scripted and filmed quarterly ceremonies, published audit logs; RFC 5011 automated trust-anchor update; RFC 6781 rollover practice | procedures, not software: https://www.iana.org/dnssec/ceremonies , https://www.iana.org/dnssec/procedures , https://www.rfc-editor.org/rfc/rfc5011 , https://www.rfc-editor.org/rfc/rfc6781 | **N3** | procedure: days; online rollover code in agentdns: ~1–2 weeks | the reference for how a DNS key is governed by humans; the software half is ours to write |
| 7 | **CSA Distributed Compliance Ledger** (Matter) | Matter production mainnet (device attestation roots for every certified Matter device) | Cosmos-SDK proof-of-authority chain; vendors and trustees; multi-approval thresholds for PAA roots and compliance records | https://github.com/zigbee-alliance/distributed-compliance-ledger (2026-07-07) | **N4**, N1-like for hardware roots | weeks | heavy; built for many vendors, we have one hardware root |
| 8 | **KERI / GLEIF vLEI** | GLEIF vLEI ecosystem in production (https://www.gleif.org/en/vlei/introducing-the-verifiable-lei-vlei) | per-identifier key event logs, **pre-rotation** (commit to the next key before use → hijack-resistant rotation), witnesses issue receipts, watchers detect duplicity | https://github.com/WebOfTrust/keripy (2026-09-15); spec https://weboftrust.github.io/ietf-keri/draft-ssmith-keri.html | N1 rotation model, N2 receipts | weeks (niche tooling) | small ecosystem; strong ideas (pre-rotation) worth borrowing even if not adopted |
| 9 | **Tor directory authorities** | Tor network since 2006 | 9 independent operators, hourly vote, majority consensus, long-lived identity keys with medium-term signing keys | https://spec.torproject.org/dir-spec/index.html | N1 pattern for *independent* multi-party consensus | pattern only | operators must actually be independent |
| 10 | **Hyperledger Fabric consortium** | enterprise consortia (active, 2026-09-15) | MSPs per org, endorsement policies (`MAJORITY Endorsement`), chaincode lifecycle requires org approvals | https://github.com/hyperledger/fabric | N1/N2 for multi-org | weeks+ | heavy; overkill for one org |
| 11 | **Safe multisig + timelock** (L2 security councils) | Optimism privileged roles https://docs.optimism.io/superchain/privileged-roles ; Arbitrum, others | m-of-n signers plus a delay before effect, public on-chain verifiability | https://github.com/safe-global/safe-smart-account (2026-09-03) | N1 pattern (threshold + delay) | days if you accept a public chain | public chain fees and dependency; identity ≠ code identity |
| 12 | **in-toto layouts / SLSA VSA / Notation trust policy** | Google BCID (internal), SLSA adopters; AKS image verification | a policy names functionaries, thresholds and steps that must be signed; verifiers emit a Verification Summary Attestation | https://github.com/in-toto/in-toto (2026-08-27), https://slsa.dev/spec/v1.1/verification_summary , https://github.com/notaryproject/notation (2026-08-03) | N1 policy *language* | days | needs #1/#2 for keys and logs |
| 13 | **Veraison + CoRIM** (IETF RATS) | Arm/Linaro attestation verification | endorsements provisioned as CoRIM, appraisal policy in Rego | https://github.com/veraison/services (2026-09-15) | N4 plumbing (a TDX profile later) | medium | verification, not governance |

## What each stack would look like for us

**Smallest real thing (recommended if you want to move this week):**
D = a **TUF root run with tuf-on-ci**, copied from `sigstore/root-signing`:
two keyholders now (your laptop hardware key + a Key Vault/HSM key), threshold
2, `release-policy.json` targets carrying the node-join and appraisal policies
with a monotonic `version` (that is the SVN). The agentdns constitution's
`signature` field becomes "≥ threshold TUF role signatures over the canonical
policy", which is ~60 lines of QuickJS with `ccf.crypto.verifySignature`.
Receipts stay CCF (already live). KSK governance copies ICANN procedurally and
we implement RFC 6781 rollover in agentdns. Time: about a week including the
constitution change and tests.

**One stack for approvals and receipts:** `scitt-ccf-ledger` as a second
network (see `release-authority-design.md`). Two to three days on top of what
we run, one more thing to recover.

**Maximum public verifiability:** private Sigstore (Fulcio + Rekor) with a TUF
root, plus Sigsum witnesses cosigning the log checkpoint; CI-built releases
signed by OIDC identity. One to two weeks; your identity provider becomes part
of the trust root.

**Borrow regardless of choice:** KERI's pre-rotation (publish the hash of the
*next* D key with every policy, so a rotation is only valid if it was
committed to in advance) and TUF's expiry (a policy that is not re-signed
within its window stops being valid), both of which close rollback and
key-hijack cases our current constitution does not.

## What "we are our own authority" means under any of these

The signers are people or machines inside this organisation. What the stack
buys is not independence but: a stated threshold, hardware-bound keys,
rotation that cannot be hijacked, refusal of rollback, and a public record
that any client can check. The pins (`infra/trust/pins.json`) must name the
stack and the keyholders, and the ADRs must say "single-organisation" until a
second organisation holds a key.

## Addendum: on-chain DAO governance (added after review)

| Stack | Rule | Borrowed |
|---|---|---|
| Compound/OpenZeppelin Governor (Governor Bravo, `OpenZeppelin/openzeppelin-contracts` Governor) | token-weighted vote, proposal threshold, quorum, voting delay + period, **timelock** before execution | quorum + threshold framing; the timelock is what our constitution still lacks (no clock) |
| Optimism two-house (Token House + Citizens' House) and Security Council | bicameral: token vote and a reputation-like citizen house; council with a scoped veto | the trap door as a scoped, loud privileged role |
| Aragon / Snapshot | off-chain signalling, on-chain execution, per-space rules | not adopted |
| Conviction voting (1Hive/Gardens), quadratic voting (Gitcoin) | time-weighted or cost-weighted preference | reputation weight with caps is our simpler analogue |
| Futarchy (MetaDAO) | decision markets | not adopted |
| Multisig councils (Safe) | m-of-n with delay | veto/override semantics |

Decision taken 2026-09-16: ADR 0025 — reputation-weighted, open-join, agent-led
with a human trap door, implemented in the agentdns constitution and live.
