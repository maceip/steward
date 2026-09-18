# Release authority D: what it means to be our own authority

Historical design research imported from agent-hosting. Statements about
"today", undecided custody and implementation status below describe the
original investigation, not the current repository or a verified deployment.
See the [2026-09-17 review](../reviews/governance-protocol-review.md) for
implementation findings and the [project governance plan](agent-operated-project-governance.md)
for the proposed general scope. In particular, a SCITT registration receipt
does not by itself establish per-release member approval or an advancing SVN.

Status: homework for the org decision on ADR 0023/0024 item 9, 2026-09-16.
Nothing here is implemented; ADR 0024 stays "custody undecided" until this is
decided.

## 1. "Delegating to CCF" is not a thing — we already run CCF

CCF is a framework, not an organisation. agentdns *is* a CCF network: one
node in an Azure ACI SEV-SNP container at 128.251.125.64, one member (key on
the operator's Mac), a constitution we wrote (`ccf/governance/actions.js` on
top of CCF 7.0.15's defaults). There is no external "CCF" whose governance we
could delegate to. Microsoft-hosted variants, checked 2026-09-16:

| Offering | State | Use for us |
|---|---|---|
| Azure Managed CCF | deprecated, docs archived, migrate to ACL | none |
| Azure confidential ledger (ACL) | GA; append-only ledger on CCF, server-side JS programming | possible host for a release ledger, but the consortium is Microsoft's, not ours |
| Microsoft Signing Transparency (MST, SCITT on CCF) | GA; verification scoped to Microsoft services; the app (`scitt-ccf-ledger`) is open source | the *app* is reusable for a self-hosted release ledger |
| Sigstore (Fulcio/Rekor) | public, free, keyless; identities are OIDC (GitHub Actions) as `did:x509` | an external transparency log for CI-built releases; trust root is GitHub+Sigstore |

## 2. The thought experiment, answered

**How long does it take to join?**
- A *node* joining an existing CCF network: start container (30–60 s on ACI),
  present its SNP quote, the primary checks it against the join tables
  (`public:ccf.gov.nodes.snp.*`), then ledger/snapshot catch-up. One to a few
  minutes end to end. It is admitted only if its measurement, host data
  (CCE digest), UVM endorsement and TCB are already allowed — which is exactly
  what `adns_set_node_join_policy` now governs.
- A *member* joining: one `set_member` proposal (certificate + encryption
  public key) accepted under `resolve()`, then the new member's `ack` of the
  state digest. Minutes, given quorum. The new member gets a recovery share on
  the next share refresh.

**Where is the governance stack located?** Entirely inside the ledger and the
enclave: the constitution is JS stored in `public:ccf.gov.constitution` and
executed by the primary's QuickJS runtime inside the SNP guest; proposals,
ballots, members and the join policy are `public:ccf.gov.*` tables; every
governance write is a receipted transaction. Only the member *private keys*
live outside — today: one key on one laptop.

**What are the rules?** The constitution's three functions: `validate(input)`
(schema of each action), `resolve(proposal, proposer, votes)` (when a proposal
is accepted — ours currently returns "Accepted" for every proposal, the CCF
sandbox sample), `apply(proposal, id)`. Built-in actions include
`set_member`/`remove_member`, `set_constitution`, `set_js_app`,
`add_snp_measurement`/`add_snp_host_data`/`add_snp_uvm_endorsement`,
`set_snp_minimum_tcb_version`, `transition_service_to_open`,
`trigger_recovery_shares_refresh`, `set_recovery_threshold`. Ours add owner
grants, zones, transfers, appraisal policies, and since 2026-09-16 the
release authority and the SVN-gated node join policy.

## 3. What D adds over plain CCF governance

In CCF/ccfdns the members *are* the release authority: code identities become
allowed because member-signed proposals pass `resolve()`. D adds a second,
separable signature on the policy payload plus an SVN ratchet:

- separation of duties — the people who approve a release need not be the
  people who operate the DNS node or hold recovery shares;
- anti-rollback — a retired measurement cannot be re-admitted without a
  newer, signed SVN (CCF alone lets `add_snp_measurement` re-add anything);
- a consumer-side pin (`pins.release_authority`) that is independent of the
  DNS network's service identity, so a compromised DNS operator cannot
  quietly approve new workload code.

Whether D is a *key* or a *consortium* is the open design point.

## 4. Design: a release consortium as a second CCF network

"Bootstrap an entirely new org that copies the CCF governance stack, with
caveats" means: run a **second CCF network — the agent.hosting release
ledger** — whose only job is to record and receipt release decisions.

```
 release approvers (members, 2-of-2, separate custody)
        │ proposals: register_release {svn, payload, purpose}
        ▼
 release ledger (CCF, SNP, its own constitution; D = its service identity)
        │ transparent statement = COSE_Sign1(payload) + CCF receipt
        ▼
 agentdns constitution: adns_set_node_join_policy / adns_set_appraisal_policy
   verify: receipt endorsed by D's service identity, svn ratchet, payload hash
        │ committed by agentdns members (operators)
        ▼
 agent.hosting pins: release_authority = {did: release ledger identity, svn}
```

Concretely:

1. **App.** Either the open-source SCITT app (`scitt-ccf-ledger`, the same
   code MST runs) — statements are COSE_Sign1, receipts are SCITT
   transparent statements; issuers are configured by governance — or a
   ~200-line CCF JS app (`set_js_app`) with one endpoint that stores a
   member-approved release statement and returns the CCF receipt. SCITT is
   standard and gives us verifiers for free; the JS app is smaller to audit.
2. **Identity of D.** `did:x509:0:sha256:<release ledger service CA>::subject:CN:agent.hosting-release-ledger`
   — i.e. D is the release ledger's *service identity*, which CCF rotates
   only on recovery (handled by the same recovery-chain rule as ADR 0023).
   Our constitution change: `signature` becomes `{did, svn, statement}` where
   `statement` is the COSE/receipt bundle; verification is a ~100-line
   receipt check in constitution JS (SHA-256 Merkle path, ECDSA over the root,
   endorsement by D's service certificate) — the same construction
   `tools/verify_claims_receipt.py` already implements in Python.
3. **Members.** Two, in separate custody (your decision): one on the operator
   Mac, one in Azure Key Vault (HSM, sign-only). CCF member signing is
   COSE_Sign1 with the member certificate; `ccf_control.py` needs a Key Vault
   signer (`az keyvault key sign` returns the raw signature). `resolve()` for
   the release ledger counts votes: accepted when all active members vote yes
   (2-of-2), later majority when there are more.
4. **Hosting.** One ACI SNP container group like agentdns (same
   `azure-aci-snp` profile, same `prepare_aci_control.py` /
   `build_aci_template.py` pattern), plus the same audit
   (`tools/audit_ccf_node.py`) so agentdns members can pin the release
   ledger's identity before trusting its receipts. Cost ≈ one more small
   confidential container group.
5. **Synergy.** The release ledger is also the natural place for the worker's
   chain-head anchors (SCITT statements with receipts) if we prefer to keep
   the DNS network's ledger to DNS facts; `AgentdnsAnchor` would gain a
   sibling. Not required.

### The caveats

- **Same people.** Two networks do not create independence if the same person
  holds every key. Separation of duties is real only if the release members
  and the DNS operator members differ, or at least sit in different custody
  (laptop vs Key Vault vs a second person).
- **Two things to recover.** Each network has its own recovery shares,
  service identity history and rollover; both must be in the pins.
- **Bootstrapping is the weak moment.** The first release policy admitted to
  agentdns must be D-signed, but D's own node must first be admitted under a
  policy nobody signed. Record that genesis explicitly (tx ids in both
  ledgers) rather than pretending otherwise.
- **`resolve()` is code.** The vote rule is only as real as the constitution;
  the current "accept everything" must be replaced in *both* networks.
- **Verification in the constitution.** Receipt verification in QuickJS is
  feasible but must be tested against real CCF receipts (we have the Python
  verifier to cross-check) before the live `set_constitution`.

## 5. Alternatives, for the record

| Option | D is | Pros | Cons |
|---|---|---|---|
| A. Release consortium (this doc) | a second CCF network's service identity | separation of duties, receipts, anti-rollback, standard SCITT verifiers | second network to run and recover; bootstrap genesis |
| B. D = agentdns consortium | the agentdns members' 2-of-2 proposals | no new key or network; matches CCF/ccfdns | operators approve their own code; no independent pin |
| C. D = Key Vault HSM key | one sign-only key in Key Vault | cheap, audited, separate RBAC | a key, not a governance process; rotation is manual |
| D. D = Sigstore CI identity | Fulcio did:x509 of the tagged build | release = build, public log, free | trust root is GitHub OIDC + Sigstore; CI compromise = D compromise |

## 6. Effort and order

1. Decide A–D and the member roster (below). — you
2. Replace `resolve()` with real vote counting in agentdns; add Key Vault
   member signing to `ccf_control.py`; add the second member. — ~1 day
3. If A: stand up the release ledger (SCITT app on ACI SNP), audit and pin its
   identity, write its genesis record; extend `adns_set_node_join_policy` /
   `adns_set_appraisal_policy` to verify receipts from D. — ~2–3 days
4. Sign `P(svn=1)` mirroring the live join policy (host data
   `f6eed9ea…`, UVM svn 104, TCB `00a10f11` = {10,0,27,88}, no
   measurement entries) and commit it; then run the primary upgrade runbook
   under a D-signed `P(svn=2)`. — 1 day plus build time
5. Pin D in `infra/trust/pins.json`, drop the `release_authority: null`
   warnings, and let `verify` check the policy signer.

## 7. Correction and references (added after review)

**Correction.** CCF *has* a governance stack; it is part of the framework and
runs inside every CCF network, ours included: the constitution
(`validate`/`resolve`/`apply` JS executed in the enclave), members with
COSE-signed proposals and ballots, receipted `public:ccf.gov.*` tables. What
does not exist is an external CCF network run by a third party that we could
delegate to. Section 1 should be read with that distinction.

**CCF documentation**

- Governance: https://microsoft.github.io/CCF/main/governance/index.html
- Constitution: https://microsoft.github.io/CCF/main/governance/constitution.html
- Proposals and voting: https://microsoft.github.io/CCF/main/governance/proposals.html
- Adding/activating a member: https://microsoft.github.io/CCF/main/governance/adding_member.html
- Member keys in HSM: https://microsoft.github.io/CCF/main/governance/hsm_keys.html
- Opening a network: https://microsoft.github.io/CCF/main/governance/open_network.html
- Recovery: https://microsoft.github.io/CCF/main/operations/recovery.html
- SNP platform: https://microsoft.github.io/CCF/main/operations/platforms/snp.html
- Receipts: https://microsoft.github.io/CCF/main/audit/receipts.html
- Default constitution our live one extends (CCF 7.0.15, 2026-09-11):
  https://github.com/microsoft/CCF/blob/ccf-7.0.15/samples/constitutions/default/actions.js

**Reference network to copy: `microsoft/scitt-ccf-ledger`**

The open-source application behind Microsoft's Signing Transparency (GA, in
production for Microsoft's own service builds). Last commit 2026-09-14.

- Repository: https://github.com/microsoft/scitt-ccf-ledger
- Production service: https://learn.microsoft.com/en-us/azure/confidential-ledger/about-microsoft-signing-transparency-ledger
- Constitution layout (operator half + application half, same shape as ours):
  `app/constitution/{actions.js, validate.js, resolve.js, apply.js, scitt.js}`
- `resolve.js` is a real majority rule over active members — the first file to
  copy into agentdns.
- Registration policy is governed by `set_scitt_configuration` as a JS or
  Rego script over the statement's protected headers, e.g. issuer
  `did:x509:…::eku:…` and `_svn >= 0`:
  https://github.com/microsoft/scitt-ccf-ledger/blob/main/docs/configuration.md
- Reproducible builds: https://github.com/microsoft/scitt-ccf-ledger/blob/main/docs/reproducibility.md
- Runs on SNP; "virtual" mode for development (`docker/run-dev.sh`,
  `docker/run-dev-cluster.sh`).

**Other**

- `microsoft/ccfdns` (research prototype agentdns was ported from; last commit
  2025-10-06; not an active production network): https://github.com/microsoft/ccfdns
- Sigstore/Fulcio `did:x509` identities: https://docs.sigstore.dev/certificate_authority/oidc-in-fulcio/
- Managed CCF deprecation: https://learn.microsoft.com/en-us/azure/confidential-ledger/managed-confidential-consortium-framework-migration

**What copying scitt-ccf-ledger buys.** A second network running their
unmodified, reproducible app; our members under their majority `resolve.js`;
a `set_scitt_configuration` policy admitting only statements from our release
signer DID with an advancing `_svn`; SCITT receipts that the agentdns
constitution verifies before accepting a node-join or appraisal policy. D is
then the release ledger's service identity; the release signer key only
produces statements and cannot make anything "approved" without the ledger's
members and policy.
