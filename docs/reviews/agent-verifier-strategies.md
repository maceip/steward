# Three agent-only verifier strategies: research and executable experiments

Date: 2026-09-18. Based on Steward `082d1d9`, in
`codex/steward-governance-review`. Implementation is isolated in
[`research/agent-verifiers/`](../../research/agent-verifiers/README.md).
No live governance, infrastructure or credentials were changed.

## Finding and recommendation

The seven checks in the task are necessary, but **when the authorization is
checked** determines what the consumer can claim. A valid signature or receipt
can outlive the authorization it records.

Use **strategy A, an online agent activation gate**, when Steward promises that
an upgrade remains authorized at activation. Use **strategy C, witnessed state
history**, to strengthen independent audit and resistance to conflicting views.
Strategy B supports offline operation only when the consumer explicitly accepts
bounded stale authorization. It must not silently replace A during an outage.

The implementation ran **169 scenario expectations: 57 online, 52 offline and
60 witnessed, all matching their expected outcomes**. Five expectations
deliberately reproduce limitations. The witnessed test also exercises all 16
combinations of one equivocating witness and the participant omitted from the
first three-of-four quorum. These are finite model experiments with real
cryptographic signatures, not proof of production security or a live CCF test.

## Standards research

The following primary sources were consulted on the review date. The strategies
are designs informed by these sources, not certified implementations of them.

| Source | Relevant evidence | Design consequence |
|---|---|---|
| [RATS, RFC 9334 section 10](https://www.rfc-editor.org/info/rfc9334/) | Freshness uses time, nonces or epochs; evidence and policy can change immediately after generation | Bind fresh requests to the decision and check again at the effect boundary |
| [TUF specification 1.0.36](https://theupdateframework.github.io/specification/latest/) | Consecutive root versions require old/new thresholds; clients persist versions and enforce expiry | Root continuity and rollback protection belong in every consumer; offline freshness has limits |
| [CCF receipts](https://ccf.dev/main/audit/receipts.html) | Receipt verification establishes a transaction against the service's signed ledger history | Add project authorization semantics and present activation status; a historical receipt is not sufficient |
| [SCITT architecture draft 22](https://www.ietf.org/archive/id/draft-ietf-scitt-architecture-22.html) | Distinguishes transparent statements, registration policy and relying-party use | Do not treat successful registration as a complete release-authorization decision; this source is a draft |
| [Certificate Transparency, RFC 9162](https://www.rfc-editor.org/rfc/rfc9162.html) and [Sigsum](https://www.sigsum.org/) | Inclusion, history consistency and independent observation/witnessing address different properties | Witness the current project-state projection as well as its history; inclusion of an old approval cannot prove it is still active |

TUF's guidance separates frequently online keys from ultimate installation
authority. An agent-only design therefore still needs protected, separated
root/release signers. Automating all roles with keys in one application process
would not preserve that protection. The laboratory generates separate keys
solely to test signature/role boundaries; it does not implement custody.

## Common verification contract

Every strategy shares the same consumer code and public statements. This makes
the freshness comparison controlled, but a shared implementation defect could
affect all three; independent implementation and conformance vectors remain
necessary before deployment.

| Required check | Implemented mechanism | Tested counterexample |
|---|---|---|
| Artifact | SHA-256 of the actual bytes, checked again at activation | Artifact swapped after successful inspection |
| Project | Exact project, network, target and action in signed release/policy/status | Validly signed evidence for another project/network/target |
| Policy | Signed policy, exact policy digest in release and current state, enforced delay/freshness | Altered policy or a different validly signed policy |
| Approving authorities | Ed25519 signatures, role eligibility, threshold over unique control domains, current revoked-key list | Duplicate signatures, wrong signing role, two keys under one operator, revoked approver |
| Previous state | Next sequence exactly one higher; previous authorization digest equals saved installed head | Skipped version, wrong predecessor, replay after restart |
| Root history | Consecutive versions, old/new root signatures, hash linkage, expiry and consumer quorum floors | Self-authorized replacement, missing half of the signatures, skipped version, weakened quorum |
| Activation status | Authenticated active/revoked state bound to the exact release, root and policy; strategy-specific freshness | Revoked release, stale response, nonce replay, missing current proof |

Consumers also retain authenticated negative observations. Seeing a revocation
advances the status floor even though the install is refused; replaying an older
active state cannot erase it. Root updates similarly survive denied activation.
Root-chain processing is idempotent when inspection is followed by execution.

The policy grants a **10-second minimum delay** and illustrative proof lifetimes
of **5 seconds online, 60 seconds offline, 10 seconds witnessed**. These are
experiment parameters, not recommended production settings. The clock is a
controlled test input with a saved monotonic floor. Signed approval times are
trusted assertions by the modeled agents; no secure clock service is supplied.

## A. Live challenge-response plus an agent activation gate

A consumer creates a fresh nonce bound to the exact release. Two status agents
sign the current project-state view and a short permit. The consumer verifies
the complete common contract. At activation, the resource-controlling gate
rechecks that the permit still matches authoritative state, has not expired,
and has not been consumed. It then records the transition and consumes the
nonce in the same modeled atomic operation.

All decisions are automated. The gate represents the component that actually
owns upgrade permission, not an LLM recommendation to a separate administrator.
Its state source must provide a consistent, current view of the relevant
project; two signatures from agents reading inconsistent state do not create
consensus.

**Observed:** valid upgrades and authorized root rotation pass. A revocation
introduced after permit issuance but before the effect is refused. Replaying
a consumed permit is refused. Gate outage blocks activation. Fresh clients can
still accept conflicting signed views during inspection if the authoritative
state service equivocates; the model's serialized gate is an explicit trust
assumption, not something supplied by the signature threshold.

**Advantages:** strongest match for authorization at activation; prompt
revocation; no human release or recovery signature in the tested rotation flow.

**Costs:** mandatory connectivity and gate availability; production must make
authorization and the privileged effect atomic or use an equally strong fenced
execution protocol. A CCF read followed by an ordinary remote deployment call
would retain a race. Actual deployer credentials, transactional persistence,
crash recovery and consensus are not implemented in this laboratory.

The guarantee concerns the instant activation is committed. A later revocation
needs a separate running-workload containment or renewal policy.

## B. Expiring, portable offline authorization bundle

Root, policy, release and status agents publish a self-contained signed bundle.
The consumer uses its pinned root and saved state to validate it locally. The
status snapshot binds the active authorization, policy and root and expires
under the signed policy. No human or online round trip is needed at activation
while the bundle is valid.

This borrows threshold roots, rollback floors and expiry discipline from TUF;
it is not a TUF repository/client implementation. Production should reuse a
conforming metadata implementation rather than substitute this local format.

**Observed:** the shared tampering, role, scope, root and rollback attacks are
rejected. Known revocation is sticky. An unseen revocation during a partition
does **not** invalidate an already cached snapshot until its validity ends.
The test deliberately accepts at time 101 with a snapshot issued at 100 and
expiring at 160. Activation at expiry is refused. Two fresh consumers cannot
detect conflicting snapshots solely from their signatures.

**Advantages:** easy artifact distribution; no authorization service on the
activation path; portable verification and resilient operation during short
outages.

**Costs:** revocation can be stale for the configured window, plus whatever
clock uncertainty the production profile permits. Restoring old consumer state
or trusting a bad clock undermines rollback/freshness checks. Appropriate for
projects that explicitly choose that tradeoff; insufficient for a promise of
immediate revocation at activation.

## C. Agent-witnessed history and fresh checkpoints

Status agents sign a sequence of project-state events. Each event links to the
previous event hash. Four independent witness agents validate the signatures
and continuity and remember the last history they accepted. Three witnesses
must sign a nonce-bound checkpoint naming the latest state and history head.
The consumer validates the full history, its saved checkpoint and the latest
active authorization before permitting activation.

The prototype uses bounded full hash-chain replay, up to 64 events, to make
history inspection explicit. It does **not** implement CT Merkle proofs,
Sigsum's wire protocol, gossip, dynamic witness membership consensus or a
production transparency service.

Three-of-four was chosen deliberately. Two such quorums intersect in at least
two witnesses; with at most one equivocating witness, at least one honest
witness would have to sign both conflicting histories. The modeled honest
witness refuses that, including after its checkpoint is restored on restart.
This is a fork-safety argument for the tested model, not a complete Byzantine
consensus or liveness proof. Locking a minority branch can still obstruct
progress; conflict recovery requires a separate design.

**Observed:** all 16 tested fork schedules fail to produce a second quorum.
One unavailable witness still allows three signatures. Two unavailable
witnesses cannot satisfy the threshold. Altered history, omitted revocation
events, rollback and silent reactivation are rejected. A fresh request cannot
use an old nonce-bound reply during a partition.

**Remaining limit:** after a checkpoint has been issued, an unseen revocation
can still race execution within its 10-second validity window. Witnessing
provides consistent observed history, not instantaneous global knowledge. An
already issued checkpoint may remain usable until expiry. Combine this with
A's activation gate if immediate authorization-at-effect is required.

**Advantages:** portable independently witnessed evidence, explicit conflicting
history defense, reduced reliance on a single service's view.

**Costs:** more agents, key custody and connectivity; witness quorum availability;
history storage and consistency proofs; substantially more operational and
recovery work. An honest witness can still sign a consistently recorded false
claim if the trusted status authorities lie; witnessing does not validate
software behavior or repair compromised release authority.

## Results and interpretation

Machine-readable evidence: [`agent-verifier-results.json`](agent-verifier-results.json).
The report includes runtime/platform, exact source hashes, each expected outcome
and failures. `passed` means the scenario matched its expected result.

| Experiment | Online gate | Offline bundle | Witnessed history |
|---|---|---|---|
| Scenario expectations met | 57/57 | 52/52 | 60/60 |
| Expected limitation scenarios included | 1 | 3 | 1 |
| Wrong artifact/project/policy/role/root/predecessor | Reject | Reject | Reject |
| Authenticated current revocation | Reject | Reject | Reject |
| Old active proof after observing revocation | Reject | Reject | Reject |
| Hidden revocation after proof issuance, before effect | Gate rejects | May accept within lease | May accept within lease |
| Partition and no fresh authorization evidence | Gate unavailable: reject | Cached unexpired snapshot may pass | New challenge cannot use old reply |
| Conflicting signed views to fresh consumers | Inspection alone can accept; needs consistent gate state | Can accept without external consistency evidence | Second witness quorum blocked in tested model |
| Old receipt remains cryptographically valid after revocation | Yes; activation still rejected | Yes; activation still rejected | Yes; activation still rejected |

The receipt experiment uses a locally signed laboratory record, not a CCF
receipt fixture. It demonstrates the semantic gap; integrating and validating
real CCF historical proofs is still required. Existing Steward constitution
defects from the earlier review remain outside these isolated experiments.

## Reproduce and next engineering step

```sh
node research/agent-verifiers/run.mjs
node research/agent-verifiers/run.mjs --output docs/reviews/agent-verifier-results.json
```

No dependencies, secrets, network, email or live proposals are needed. All
agent keys are freshly generated in memory and are not saved in the report.
The tests are also included in the repository's Node CI step.

The next implementable slice is a **single-project online activation adapter**:
connect the common verifier to authenticated CCF current state and real receipts;
give the adapter exclusive deployment authority; define crash-safe, idempotent
activation with monotonic fencing; and test revocation races across real
processes. Add authenticated durable consumer/witness storage, secure time,
independent custody and explicit recovery before external enforcement pilots.
Then export C's witnessed evidence for independent consumers. Keep B an
explicitly selected offline assurance profile.
