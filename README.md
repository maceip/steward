# Steward

**Verifiable upgrade governance for agent-operated open-source projects.**

Steward is developing a protocol through which a project's agents can authorize
software and policy changes, publish the evidence behind each decision, and let
downstream agents verify an upgrade against the project's pinned rules.

The intended primitive is a verifiable authorization to move from one approved
state to another. A project brings its artifacts, policy and agent authorities;
consumers decide which project roots and guarantees they require.

## Status

This repository contains an early CCF-based implementation extracted from
AgentDNS. AgentDNS / agent.hosting is the first integration. The current code
combines governance, release-authority and DNS actions, and its deployment
scripts target that installation. General project onboarding, a portable
authorization bundle and a standalone consumer verifier are **planned**.

The existing governance profile uses reputation-weighted agent ballots and an
unrestricted human override. The proposed project profile has agents managing
admission, review, authorization, execution and recovery directly. It requires
protocol changes before it can replace the existing profile.

Start with the [protocol review and origins](docs/reviews/governance-protocol-review.md)
and the [agent-operated project design and adoption plan](docs/design/agent-operated-project-governance.md).
The review records unresolved voting and upgrade-policy bypasses; the present
prototype does not yet provide the complete guarantees described by the plan.

The [three agent-only verifier experiments](docs/reviews/agent-verifier-strategies.md)
compare online activation, offline bundles and witnessed project history with
executable adversarial cases. These are isolated research prototypes; they do
not change the deployed protocol.

## First use case

An open-source agent tool or service publishes a new container image. Review
agents check its source/build evidence and project policy. A deployment agent
upgrades only when it can verify authorization for that exact image digest,
the policy and authorities that approved it, and the allowed state transition.

This is the proposed first product flow. Runtime attestation adds a separate
check that a running instance matches an approved artifact and configuration.
A release authorization alone cannot establish that runtime fact or guarantee
that software has no vulnerabilities.

## Repository

| Path | Contents |
|---|---|
| `constitution/` | Pinned CCF 7.0.15 actions, AgentDNS and governance actions, vote resolution, tests |
| `steward/` | Agent review/verdict/ballot/settlement client and constitution composer |
| `governance/` | Historical proposal bodies and recorded application transactions |
| `docs/reviews/` | Current protocol assessment and offline diagnostic probes |
| `research/agent-verifiers/` | Experimental verifiers, simulated signing agents and adversarial scenarios |
| `docs/design/` | Proposed project protocol and adoption plan; historical design research |
| `docs/decisions/` | Existing AgentDNS governance decision and its qualifications |
| `deploy/` | AgentDNS-specific systemd deployment; requires existing member credentials |

## Local checks

Use Node.js 22+ and Python 3.12+ with `cryptography` installed. Network member
operations additionally require the `ccf` Python package and an authenticated
service certificate.

```sh
node --test constitution/tests/governance_actions_test.js
python3 -m unittest discover -s steward/tests -p 'test_*.py'
python3 steward/compose_constitution.py --output constitution.js
python3 steward/steward.py checks proposal.json
```

Python flow tests mock notification delivery and never call real sendmail. The
`checks` command runs selected agent checks; it does not execute the complete
constitution validator or verify a consumer authorization bundle.

## Constitution provenance

The operating rule is to review a tagged commit and submit exactly the
constitution composed from that checkout. The current agent checks equality
with its local composition and pins the upstream CCF file's digest. It does
**not** verify the Git tag, tag signature or checkout cleanliness. Exact LF
bytes are required and are specified in `.gitattributes`.

Recorded AgentDNS transactions are in
[the governance log](governance/agent.hosting/README.md). These records describe
that integration; they are not a current remote attestation of its deployment.
