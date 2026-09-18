# Options for the four governance blockers

Status: alternatives for discussion, 2026-09-17. No option is selected or
implemented by this document. Based on the [protocol review](../reviews/governance-protocol-review.md)
at `082d1d9` and the [adoption plan](agent-operated-project-governance.md).

Follow-up: [three agent-only verifier strategies and experimental results](../reviews/agent-verifier-strategies.md),
2026-09-18, tests the shared consumer contract and its freshness limits.

Recommendation for the first pilot: **1A + 2A + 3B + 4A**. Design the project
identity and verifier contract so a shared service can later implement **4B**
without changing the meaning of an authorization. These choices favor direct
agent operation and a small set of testable guarantees.

## 1. Voting caps can deadlock newcomers or concentrate authority

| Option | Mechanism | Pros | Cons |
|---|---|---|---|
| **1A. Fixed threshold over independent agent authorities — recommended initially** | Equal voting authority for an admitted roster, for example two approvals from three independently controlled domains. Freeze the roster and policy for each proposal. Keep reputation informational. | Small, auditable rule; newcomers have real votes once admitted; one voter cannot authorize alone; two-of-three can progress with one unavailable participant. | Admission and actual independence must be established; expertise does not change voting weight; two compromised domains can authorize a bad release; a quorum outage stops upgrades. |
| **1B. Repair reputation weighting** | Precompute normalized weights with caps applied to final counted shares, exact bounded arithmetic and a minimum of two approving domains. Use an explicitly separate equal-weight bootstrap profile whenever the caps are infeasible. Replace agreement-based reputation with independently evaluated review outcomes. | Preserves the intended adaptive governance model; can reward demonstrated expertise; caps can limit established authorities. | Substantially harder to specify and test; small rosters make caps infeasible; bootstrapping changes the assurance profile; measuring correct review outcomes remains unresolved and can create gaming incentives. |
| **1C. Require approvals by role** | Require independent build/provenance and security/policy reviewer roles, with explicit thresholds inside each role. A change needs every mandatory role's approval. | Checks required expertise directly; easy to explain which responsibilities were satisfied; adding many general reviewers cannot displace a required specialist. | A missing required role blocks progress; requires alternate reviewers and scoped recovery; one custodian holding all role keys defeats independence; more onboarding and policy complexity. |

For 1B, giving everyone a minimum integer weight does not fix the mathematics.
If every voter is a newcomer, their collective share cannot simultaneously be
100% of the electorate and at most 20%. A 34% per-domain cap also cannot work
with fewer than three domains. Declare infeasible states and their bootstrap
rules rather than silently rescaling until someone gets all effective weight.

For every option, define approval, ordinary rejection, abstention, expiration
and evidence-based blocking separately. Under two-of-three approval, one
ordinary no must not accidentally override two yes votes. A mandatory failed
check can still prevent activation. Membership changes must invalidate or
explicitly reauthorize pending proposals. Fix the actual proposal-ID binding
and test conflicting successors against the serialized project state.

Independent domains mean distinct administrative/key control, not different
model names, processes or cloud regions. Domain enrollment is itself governed;
a self-declared extra identity cannot grant extra authority. Equal voting
does not make open voting Sybil-resistant.

## 2. Default CCF actions bypass signed upgrade policy

| Option | Mechanism | Pros | Cons |
|---|---|---|---|
| **2A. One authorized upgrade path — recommended** | Explicitly allowlist exposed actions. Remove direct trust-table mutation actions from normal governance; use one signed, versioned transition to set the complete permitted upgrade state. Handle application/constitution/root changes through separately authorized paths. | Smallest bypass surface; exact resulting state is reviewable; straightforward negative tests; future upstream actions do not silently become permitted. | Existing operational tools need migration; emergency repairs require the governed path; the action allowlist needs maintenance when CCF changes. |
| **2B. Guard every sensitive action** | Keep the operational action interface, but put a mandatory authorization guard around dispatch. Sign the complete action batch, project/network, prior state and expected result; prevent replay and partial or reordered reuse. | Better compatibility; accommodates incremental maintenance; one guard can cover multiple operations. | Larger surface to inventory; mixed-action proposals are subtle; an unguarded mutation reopens the bypass; more ongoing audit work. |
| **2C. Independent agent release authority** | A separately controlled agent quorum signs release authorizations. CCF and the deployment/consumer verifier require that authorization under a pinned external root for every privileged effect. | Separates operation from release approval; one authority can serve different backends; consumer enforcement can reject decisions from a compromised governance service. | More keys, services and recovery coordination; added latency and availability dependency; deploying another ledger alone fixes nothing unless every effect checks its authorization. |

The inventory must include node trust tables, application replacement,
constitution changes, authority replacement and any other path that can alter
the enforced rule. The current D signing key must become agent-operated for
the intended unattended flow; simply removing the extra signature requirement
would discard the assurance instead of enforcing it.

All options need signed project/network/action/target scope, exact payload and
predecessor binding, monotonic versions and rejection of unsupported actions.
In [CCF](https://raw.githubusercontent.com/microsoft/CCF/ccf-7.0.15/doc/governance/constitution.rst),
an accepted constitution can change the rules themselves. Consumer-pinned
authorization and root-update rules must therefore constrain self-upgrades as
well; a guard in replaceable code is not an immutable security boundary.

## 3. Unrestricted overrides and unenforced waiting periods

Each option below addresses both issues and uses agents as its protocol
participants. Every delay starts from an authenticated committed event and is
enforced at activation, with trusted-time assumptions stated explicitly.

| Option | Mechanism | Pros | Cons |
|---|---|---|---|
| **3A. Remove all special overrides** | Every release, recovery and root change requires the ordinary agent quorum and an enforced activation delay. | Uniform policy; least privileged authority; easy consumer interpretation; no special override key to compromise. | Loss of the quorum can make recovery impossible under the existing root; urgent responses wait; persistent disputes can stop upgrades indefinitely. |
| **3B. Restricted agent recovery council — recommended** | Replace the human override with an independent guardian-agent threshold. Guardians can immediately freeze activation or revoke specified authority. Replacing lost governors follows a predeclared, delayed recovery transition; guardians cannot directly approve arbitrary code or bypass mandatory checks. | Automatic containment and recovery; ordinary releases remain agent-governed; separates stopping a release from approving one. | Guardians add a trust root and can cause denial of service; recovery scope needs precise limits; compromised recovery authority can eventually alter governance within its declared powers. |
| **3C. External execution authority** | Remove local overrides and put activation behind an independently controlled agent execution service or public-chain timelock. Adapters/consumers verify its authorization; any recovery follows that authority's bounded, published rules. | Stronger separation from the governance operator; a separately verifiable execution schedule; reusable across resources. | Another trust and availability dependency; a chain adds fees/finality assumptions and off-chain proof integration; an execution service still needs a sound clock and recovery model. |

For 3A/3B, introduce separate queue and execute operations backed by a specified
authenticated-time mechanism, such as a quorum of bounded-skew time statements
bound to the request. Define clock rollback/fast-forward, disagreement and
outage behavior. A caller-supplied timestamp or a local agent sleep is not an
enforced timelock. Missing trustworthy time leaves an upgrade queued.

The [OpenZeppelin timelock design](https://docs.openzeppelin.com/contracts/5.x/api/governance)
provides a useful queue/execute pattern and distinguishes proposers, executors
and cancellation. Reusing that pattern in CCF requires specifying its own time
and authority model. All privileged execution paths, including modifying the
delay itself, must remain subject to the previously authorized rules.

For 3B, freeze is not automatic permission to resume: the recovery procedure
must explicitly define who restores progress and under what evidence. A human
can operate infrastructure, but no human ballot or laptop signature is required
by the release/recovery protocol. This does not claim that humans cannot
control the organizations or machines operating those agents.

## 4. Project isolation and a standalone consumer verifier

These are alternative deployment architectures. Each includes an independent
verifier; a shared service status response is not a substitute for one.

| Option | Mechanism | Pros | Cons |
|---|---|---|---|
| **4A. Dedicated project instances — recommended for the pilot** | Give each project its own CCF instance, root, credentials and project state. Share implementation and authorization format. A standalone verifier checks exported bundles against that project's pins. | Clearest initial isolation; fewer cross-project authorization paths; project-specific governance; quick way to prove a non-DNS integration. | Higher operating cost; repeated upgrade/recovery work; difficult self-service onboarding at scale; common administrators can remain a shared risk. |
| **4B. Shared service with project-scoped authority — target for hosted adoption** | Use application identities rather than global CCF members for projects. Scope every operation and data access by project, with separate roots, policy, state, quotas and evidence permissions. Consumers independently verify the same bundles. | Low incremental hosting cost; convenient enrollment; centralized operations; fits an adoption-focused hosted product. | More difficult isolation testing; shared outages and infrastructure compromise affect many projects; project signatures protect authorization integrity but do not alone protect data confidentiality or availability. |
| **4C. Federated project authorization logs** | Projects publish signed authorization manifests through existing Git/OCI/object storage, with a common verifier and explicit consistency/freshness rules. Optional CCF or witness services provide committed checkpoints. | Low infrastructure barrier; portable project ownership; consumers need no central Steward account; fits existing open-source distribution. | Must define conflicting-head resolution, witnessing, revocation and offline freshness; a signature alone gives no global ordering; agent coordination and evidence hosting become distributed responsibilities. |

All verifiers take an artifact, authorization bundle, preconfigured project
root and saved state. They check artifact digest; exact policy and eligible
signatures; project/network/action/target; committed decision where required;
root history; predecessor/version; activation time and fresh revocation status.
An installer must enforce the result and persist the new high-water mark.

A [CCF receipt](https://ccf.dev/main/audit/receipts.html) supports committed
transaction verification under the service trust chain; it is not by itself
the project's semantic authorization or current revocation status. The bundle
must bind its decision and policy evidence to that proof. Likewise,
[TUF](https://theupdateframework.github.io/specification/latest/) can supply
root/metadata update, rollback and expiry mechanisms for distribution; it does
not supply Steward's agent decision protocol. Offline historical verification
must not claim knowledge of the latest revocation.

## Suggested sequence

1. Implement 1A and 2A with the known counterexamples as regression cases.
2. Specify and implement 3B, including enforceable delay, constrained recovery
   and the consumer's rule for accepting root changes.
3. Ship one non-DNS project using 4A and an independent reference verifier.
4. Validate repeat adoption before adding 4B. Keep the bundle and root contracts
   stable across deployment choices; adopt role-specific checks from 1C only
   when project requirements justify them.

These are recommendations, not governance decisions. The existing constitution
and deployment remain unchanged by this options document.
