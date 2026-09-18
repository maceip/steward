# Steward protocol review, origins and analogs

Reviewed 2026-09-17 at `082d1d9` in `codex/steward-governance-review`.
Scope: repository history, constitution and agent code, local tests, offline
probes, and linked primary sources. The live service, private keys and other
repositories were not inspected.

## Assessment

Steward has useful foundations: explicit governance code, signed member
requests, recorded verdicts, bounded policy structures, a release-authority
signature path and an advancing node-policy version. Its strongest product
direction is **verifiable upgrade authorization for agent-operated projects**.
The reusable unit is a policy-bound state transition with verifiable evidence.

Today it is an AgentDNS-specific CCF constitution and a polling member client.
It has neither a general project boundary nor a complete consumer verification
protocol. The advertised reputation caps and signed-upgrade discipline have
counterexamples. Correcting the README helps discovery; making the promise real
requires the work in the [adoption plan](../design/agent-operated-project-governance.md).

## Origins: implementation lineage and borrowed ideas

The local history establishes this sequence. Commit links include imported
design work and the history preceding repository extraction.

| Date / commit | Evidence | Implication |
|---|---|---|
| Sep 13, [`8fb8bbd`](https://github.com/maceip/steward/commit/8fb8bbd) | Initial Rust CCF DNS authority history | DNS is the originating application |
| Sep 15, [`7b21933`](https://github.com/maceip/steward/commit/7b21933) | Release authority D, signed node policy, attested grants | Upgrade governance emerged from protecting the hosting attestation chain |
| Sep 15, [`fc6909d`](https://github.com/maceip/steward/commit/fc6909d), [`5019ec4`](https://github.com/maceip/steward/commit/5019ec4) | Release-authority investigation and governance-stack survey | General governance questions preceded the separate repository |
| Sep 16, [`2024475`](https://github.com/maceip/steward/commit/2024475), [`614dae6`](https://github.com/maceip/steward/commit/614dae6) | Weighted governors, verdicts and agent operations; recorded application | Agent governance was layered onto the DNS application |
| Sep 16, [`f5bea89`](https://github.com/maceip/steward/commit/f5bea89), [`fb83296`](https://github.com/maceip/steward/commit/fb83296) | Imported design history; extracted layout and README | Repository separation did not complete protocol generalization |
| Sep 16, [`082d1d9`](https://github.com/maceip/steward/commit/082d1d9) | Advisory LLM and 36-hour local wait | Latest automation differs from parts of the historical ADR |

The imported design describes Microsoft's `ccfdns` as upstream inspiration;
its [upstream README](https://github.com/microsoft/ccfdns) describes an attested
DNS server built on CCF. This review does not establish a line-by-line fork
relationship for the Rust implementation.

The direct governance dependency is CCF: the composer vendors its 7.0.15
default actions and adds Steward's `validate`, `resolve` and `apply` code.
[CCF's versioned documentation](https://raw.githubusercontent.com/microsoft/CCF/ccf-7.0.15/doc/governance/constitution.rst)
defines those functions and their state-access permissions. CCF supplies a
framework; each deployment must establish its own governance participants.

The existing ADR names TUF, Sigstore, SCITT, Tor, Fabric, DAO councils, KERI and
BountyNet as influences. This records intent, not implementation of their
security properties. BountyNet is an unqualified reference: this repository
supplies no precise paper or implementation citation, so it should not support
an external security claim.

## Closest analogs and what to reuse

These comparisons are not evidence of demand or endorsement. Sources were
checked on the review date; activity dates do not establish adoption.

| Analog | Existing function | Implication for Steward |
|---|---|---|
| [TUF](https://theupdateframework.github.io/specification/latest/) | Threshold roles, delegated targets, root transitions, client version persistence and expiry checks | Closest update-trust model. Reuse a conforming client for metadata delivery; specify how agents authorize target changes |
| [Sigstore](https://docs.sigstore.dev/about/threat-model/) and [GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations) | Artifact signing, identity and build provenance | Treat these as evidence inputs; add project policy and state-transition authorization |
| [in-toto statements](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md) and [SLSA VSA](https://slsa.dev/spec/v1.2/verification_summary) | Digest-bound claims and a verifier's result under a policy | Closest portable evidence format; a review result and authority to change state are distinct claims |
| [SCITT on CCF](https://github.com/microsoft/scitt-ccf-ledger/blob/main/docs/configuration.md) | Governance-configured registration policy evaluates submitted statements | Strong backend reference; a receipt for registered evidence is a separate fact from a threshold release decision |
| [OpenZeppelin Governor / TimelockController](https://docs.openzeppelin.com/contracts/5.x/api/governance) | Proposal decisions and separately enforced delayed execution | Borrow an explicit queue/execute boundary, cancellation and predecessor binding |
| [Fabric endorsement policies](https://hyperledger-fabric.readthedocs.io/en/latest/endorsement-policies.html) | Required endorsements over organizational identities | Borrow explicit authority domains and role requirements |
| [RATS architecture, RFC 9334](https://www.rfc-editor.org/rfc/rfc9334.html) | Attester evidence, verifier appraisal, relying-party decisions and freshness | Keep runtime identity evidence separate from authorization and consumer policy |
| [Sigsum](https://www.sigsum.org/) and [KERI](https://weboftrust.github.io/ietf-keri/draft-ssmith-keri.html) | Public key-use transparency; key-event history and rotation commitments | Consider later for checkpoint witnessing and root continuity, with explicit trust assumptions |

Two corrections to the older research matter. SCITT registration policy is
not automatically a member vote for each release. A predicate such as
`svn >= 0` is not an anti-rollback ratchet: it must be compared with authenticated
prior state. Expiry and pre-rotation also have prerequisites; neither alone
guarantees protection against key compromise.

## Current guarantees and missing enforcement

Findings refer to the reviewed commit. P0 means a blocker for promising
autonomous upgrade authorization to adopters, not a claim of a remotely
exploitable issue in the uninspected deployment.

| ID / priority | Evidence | Consequence and required change |
|---|---|---|
| G1 / P0 | [`resolve.js`](../../constitution/resolve.js), weight calculation: `[1,1,1]` becomes `[0,0,0]`; `[64,1,1]` becomes `[1,0,0]` | Three newcomers cannot decide even unanimously; one veteran can pass a high-impact proposal alone under defaults. Specify a threshold model with safety/liveness tests across roster sizes; count only eligible nonzero voters |
| G2 / P0 | [`ccf-7.0.15-actions.js`](../../constitution/ccf-7.0.15-actions.js), default SNP measurement/host-data/UVM/TCB actions remain available | A governance-approved default action changes join tables without D's signature or advancing the governed SVN. Close all alternate mutation paths and test the complete composition |
| G3 / P0 | `resolve.js`, `proposalIdForVotes()` returns the first matching text without checking ID or state | A finding for a later identical proposal can be ignored. Use the actual proposal ID; pinned CCF 7.0.15 documents it as the fourth `resolve` argument |
| G4 / P0 | [`steward.py`](../../steward/steward.py), `run_checks()` approves its fallback; `main()` never loads governance parameters; Python `HIGH_IMPACT` omits `adns_ksk_rollover` | Authority changes and other important actions lack substantive agent appraisal. Offline `checks` even succeeds for unknown actions. Load authenticated policy, share classifications, deny unsupported checks and validate schemas locally |
| G5 / P0 | `resolve.js` processes trapdoor votes first; `steward.py` waits using local `first_seen` | A human overrides agent decisions; another agent client bypasses the wait. Conflicting trapdoor results depend on ballot order. Define an agent-operated profile and enforce delay at the effect boundary |
| G6 / P0 | [`actions.js`](../../constitution/actions.js), `adns_settle` rewards matching `Accepted`/`Rejected` | Reputation measures agreement, not correctness. Cheap agreeable proposals can raise scores; accurate dissent can be penalized. Begin with fixed agent-role and authority-domain thresholds; evaluate reputation separately |
| G7 / P0 | `adnsRequireAuthoritySignature` signs `{svn,payload}`; `purpose` is an error string. Appraisal `zone` is outside the signature | Authorization lacks explicit project, network, action and target binding. Bind those fields before multi-project reuse |
| G8 / P0 | No generic project registry, portable approval exporter, independent consumer verifier or runtime adapter contract | Ship a complete producer-to-consumer flow before broad onboarding |
| G9 / P1 | Authority validity is checked for ordering, but signature verification never compares it with current time | Expiry is stored rather than enforced. Specify time sources, offline bounds, revocation and durable consumer state |
| G10 / P1 | `check_constitution()` compares local bytes; composer checks only upstream digest | No tag or checkout validation. Bind review to authenticated immutable source/build evidence and exact composition |
| G11 / P1 | `review()` skips already-voted proposals and never emits `withdraw`; `settle()` marks completion after proposing or a `ValueError` | Blocks lack automated resolution; submission is confused with acceptance. Reconcile committed state, retry idempotently, and add appeals/finality |
| G12 / P1 | `open_join` is a parameter and Python check; admission needs an existing member's proposal | Open participation is not permissionless voting or proof of independence. Separate project enrollment, review, governance and recovery custody |

G2 requires governance acceptance; it bypasses the additional D constraint,
not governance authentication. The offline probe does not simulate CCF's
transaction engine. Likewise, an unknown action in G4 is rejected by the real
constitution validator; the defect is the agent check's success claim and
missing semantic review for recognized actions.

Changing the constitution can change any of its rules. Strong continuity also
needs a consumer-pinned root/update policy that cannot be silently replaced by
the decision it constrains. A TEE does not remove that trust boundary.

## Agent operation and DNS coupling

The client checks selected fields, records verdicts, submits ballots, requests
settlement and sponsors members. It loads a PEM signing key. This does not
establish attestation of its reviewer process, model, prompt or toolchain.

The LLM hook always records a passing `llm_review` check, including on findings
or errors; its test expects this. Its role is advisory, despite older comments
saying it can block. In the proposed profile, a model can suggest a challenge
with referenced evidence for deterministic or independently authorized
adjudication. Untrusted project content must not direct the signing process.

DNS coupling goes beyond names: appraisal requires zones, grants use DNS names
and record types, effects go to `public:agentdns.*`, and release authority and
governor parameters are global. The service unit embeds one IP; the CLI defaults
to `agentdns.test`, installation-specific paths and an operator email. Separate
core state from adapters. Project agents must not become CCF infrastructure
members with global `set_constitution` or `set_js_app` powers.

The historical log reports one operator controlling the relevant keys; it does
not prove current custody or independence. Multiple agent hosts under one
administrator still share a control domain.

## Documentation corrections

- The original README led with agent.hosting / AgentDNS. The revised entry
  point states generic scope and current maturity separately.
- The ADR says both node and appraisal policies require D when D is absent.
  At this commit, node policy always requires D; appraisal has an unsigned
  pre-D path, covered by an existing test.
- The log's final prose said 24 hours. The checked-in CLI and unit specify
  129600 seconds / 36 hours. Deployed settings were not queried.
- The test header references `control_smoke.py`, absent here. Unit results do
  not replace full CCF integration coverage.
- No project `LICENSE` file or protocol conformance specification was found.
  Before reuse, document the chosen license, applicable vendored notices,
  installation, supported versions and contribution workflow.

## Validation and reproducible evidence

`node --test constitution/tests/governance_actions_test.js`: **19 passed**.
The following diagnostic loads the actual four constitution sources with an
in-memory KV shim, without keys, network access or a CCF node:

```sh
node docs/reviews/governance-probes.cjs
```

| Probe | Observed result |
|---|---|
| Three minimum-reputation agents, unanimous yes | `Open` |
| Veteran alone with two newcomers | `Accepted` |
| Two conflicting trapdoor ballots | True first: `Accepted`; false first: `Rejected` |
| Finding on second proposal with identical text | `Accepted` despite finding |
| Default join-table actions with D configured, no D signature | Tables change; policy SVN stays 4 |

These assert existing defects and deliberately stay outside CI. Convert them
to desired-behavior regression tests with the fixes. They do not model CCF
ordering, transactional rollback or enclave attestation.

The Python suite passed **8 tests** with outbound notification mocked:

```sh
python -c 'import unittest,sys; from unittest.mock import patch; suite=unittest.defaultTestLoader.discover("steward/tests"); runner=unittest.TextTestRunner(); ctx=patch.object(sys.modules["test_steward"].steward,"notify_trapdoor_email",return_value=False); ctx.start(); result=runner.run(suite); ctx.stop(); sys.exit(not result.wasSuccessful())'
```

Initially three Python tests failed because Windows `core.autocrlf=true`
changed the vendored CCF bytes. `.gitattributes` now requires LF for constitution
sources. Restoring existing Git blob bytes resolved this; composition equals
the original committed sources byte for byte, SHA-256:
`6fd2190bfe90a9d603b44bf4e70ede3cd2d8b6991bd56c3f339845d00f16099b`.
No governance behavior was changed in this review.

## Recommendation

Retain CCF for the first backend while defining a backend-independent
authorization contract. Prove the complete agent upgrade flow on a non-DNS
project. Gate adoption on the P0 findings and independent consumer verification;
test repeat use before growing a consortium or adding reputation economics.
The [design and adoption plan](../design/agent-operated-project-governance.md)
specifies guarantees, work packages and adoption criteria.
