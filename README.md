# steward

Governance of the agent.hosting / agentdns attestation chain: an **open-join,
reputation-weighted, agent-led consortium with a human trap door**. This repo
holds the rules (the CCF constitution), the actor that applies them (the
steward agent), the governance record, and the design work that led here.

| Path | What |
|---|---|
| `constitution/` | `actions.js` (agentdns actions, release authority, governors), `resolve.js` (the vote rule), `exports.js` (validate/apply), the pinned CCF 7.0.15 default `actions.js`, and tests |
| `steward/` | `steward.py` (review → verdict → ballot → settle → sponsor), `compose_constitution.py`, `ccf_control.py` (member client), tests |
| `governance/` | proposal bodies and the applied-transaction log per governed zone |
| `docs/decisions/` | ADR 0001: the governance shape |
| `docs/design/` | the release-authority homework and the governance-stack survey |
| `deploy/` | systemd unit/timer and installer for a host that holds an agent member key |

## The one rule

A constitution change is a `set_constitution` proposal whose text must equal
`python3 steward/compose_constitution.py` at a **tagged commit** of this repo.
The steward records a `block` finding against anything else, so the tag is the
audit trail. Live digest and transactions: `governance/agent.hosting/README.md`.

## Run

```sh
node --test constitution/tests/governance_actions_test.js
python3 -m unittest discover -s steward/tests -p 'test_*.py'
python3 steward/compose_constitution.py            # prints the composed constitution + sha256
python3 steward/steward.py checks proposal.json    # deterministic checks, offline
```

Lineage: TUF/Sigstore root-signing, scitt-ccf-ledger, Tor directory
authorities, Fabric endorsement policies, DAO security councils, BountyNet,
KERI. See `docs/design/`.
