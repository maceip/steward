# Agent-only verifier experiments

Run with Node.js 22 or later; no dependencies or private project credentials:

```sh
node research/agent-verifiers/run.mjs
node research/agent-verifiers/run.mjs --output docs/reviews/agent-verifier-results.json
```

The runner exits nonzero if any scenario disagrees with its specified result.
Some results deliberately assert an attack succeeds within a documented trust
boundary. `passed` means the observed behavior matches the expectation; it does
not mean every attack was prevented. See the report's `expected_limitations`.

Read [the research report](../../docs/reviews/agent-verifier-strategies.md) for
the recommendation, standards sources, threat assumptions and observed limits.

| File | Purpose |
|---|---|
| `protocol.mjs` | Consumer checks, root transitions, quorum signatures, hash-chain replay and witness locking |
| `lab.mjs` | Ephemeral Ed25519 agents, authoritative-state fixture and simulated atomic activation gate |
| `run.mjs` | Independent adversarial scenarios, fork schedules and machine-readable results |

All approval/status/root actions are automated. Agent domains are modeled with
different keys and domain labels in one process; this does not demonstrate
independent operators, protected key custody or hardware attestation. No LLM or
human intervention decides acceptance. Public statements and actual signatures
are evaluated by the consumer implementation.

`Consumer.inspect()` verifies historical/current evidence under a selected
strategy. `Consumer.activate()` repeats the checks at the simulated effect
boundary. Online activation additionally requires the authoritative commit
gate; a cached positive inspection does not authorize that operation. The
strategy is a trusted caller choice and cannot be selected by an incoming
bundle. Production must pin its permitted strategy and prohibit automatic
downgrade on outage.

The store is an in-memory model with one file-roundtrip restart test. It is
not authenticated or resistant to restoring an old filesystem snapshot.
The activation effect updates that model; it does not install a container.
The witness log replays at most 64 hash-linked, signed state events. It is not
a Merkle proof format. The receipt demonstration uses a laboratory receipt,
not a real CCF receipt. JSON objects use a restricted local canonical encoding,
not a complete interoperable wire parser or a claim of JCS/DSSE compliance.

The prototypes do not implement TUF, CT, SCITT, live networking, consensus,
clock synchronization, crash-safe deployment, runtime attestation, proof of
build provenance or human-free bootstrap trust discovery. Agent root rotation
requires signatures from the old and new root quorums; complete loss of the
old quorum has no recovery path in this experiment.
