# 0002 — Governance: open-join, reputation-weighted, agent-led, with a human trap door

Review annotation, 2026-09-17: this is the existing AgentDNS governance
decision, retained under its original ADR title after extraction. Several
claims below differ from code at `082d1d9`: the weight caps have counterexamples;
the LLM hook is advisory and cannot block; appraisal policy has an unsigned
pre-D path; the wait is local agent policy. See the
[protocol review](../reviews/governance-protocol-review.md) for evidence.
The [general project plan](../design/agent-operated-project-governance.md)
proposes an agent-operated profile without the unrestricted human override;
that profile is not yet implemented or deployed. Paths below retain historical
references to the source repositories.

Status: accepted 2026-09-16 (both repositories; agent-hosting ADR 0025 is the
consumer statement). Replaces the CCF sandbox `resolve()` that accepted every
proposal. Implements what `scitt-ccf-ledger` and agent-hosting's
`docs/proposals/release-authority-design.md` recommend at minimum — a real vote
rule, D-signable policies, receipts — and adds the parts learned from the
surveyed stacks.

## Decision

The agentdns consortium governs itself through `ccf/governance/resolve.js` and
the `adns_*` governor actions:

1. **Members are governors of two classes.** `agent` members are verifier
   agents (LLM-driven or deterministic) that hold a CCF member key inside
   their runtime; `trapdoor` members are humans. The classification lives in
   `public:ccf.gov.agentdns.governors`.
2. **Open join.** Any member may propose `set_member` + `adns_set_governor`
   for a newcomer; admission is decided like any other high-impact proposal.
   Newcomers start at `reputation_min` and their collective weight is capped
   (`newcomer_weight_cap_percent`, default 20%) once there are three or more
   agents, so a flood of fresh identities cannot carry a decision. A single
   member is capped at `max_member_weight_percent` (default 34%) of the counted
   weight, so no veteran decides alone.
3. **Reputation** is earned and lost only by `adns_settle`: after a proposal
   resolves, agents on the winning side gain `reputation_step`, agents on the
   losing side lose it, within `[reputation_min, reputation_max]`. Nothing else
   moves reputation; trapdoors are never scored.
4. **Decision rule.** Verdict-only proposals are statements and self-accept.
   A trapdoor vote is decisive: `false` vetoes, `true` overrides; both are
   ordinary, visible ballots. Otherwise high-impact proposals (constitution,
   members, node join policy, appraisal policies, release authority, governance
   parameters) need yes ≥ 2/3 of counted agent weight and at least
   `min_agent_yes` distinct agents, and are rejected at no ≥ 1/3; routine
   proposals need a strict majority.
5. **Findings block.** `adns_record_verdict {block, checks}` from an agent with
   reputation ≥ `block_reputation` holds a high-impact proposal Open until that
   agent records `withdraw`, regardless of yes-weight. This is BountyNet's
   "verifier reports, release blocked until fixed", with reputation instead of
   bounties. Approve verdicts carry the checks and evidence that justified them.
6. **How an agent knows** (`tools/steward.py`): deterministic checks first —
   a proposed constitution must equal `tools/compose_constitution.py`'s output
   for the reviewed commit; a node-join policy's `svn` must advance past the
   highest accepted one and every `host_data` must equal SHA-256 of the CCE
   text the node serves for it (the attested-build witness in BountyNet's
   sense: the measurement is checked against what it claims to be, not
   trusted); appraisal policies must be well-formed; new members must present
   an unexpired certificate and a recovery key while `open_join` is on. An
   optional LLM reviewer can add a finding but cannot rescue a failed check.
7. **Trap-door window.** The steward defers its deciding yes on high-impact
   proposals for `--min-age-seconds` (default 36 h; Decision #13) after first
   sight, and notifies the operator address with the proposal digest and settle
   time. A human trapdoor can veto by casting a rejecting ballot or withdrawing
   the proposal before the window elapses. This window is steward policy, not
   constitution law: CCF's constitution has no clock. Follow-up: a governed clock table.
8. **Release authority D** stays as designed (ADR 0001 / agent-hosting 0024):
   when set, policies must carry D's signature and the SVN ratchet applies.

   *Correction 2026-09-16:* the constitution requires D's signature on
   `adns_set_node_join_policy` and the appraisal actions whether or not D is
   set — with D unset they throw. The weighted vote is therefore **not** a
   substitute for D. The operator decided to mint D (held by the operator,
   same machine as the trapdoor member key) rather than add a vote-only
   fallback. Governance is single-organisation by decision until a second
   party holds a member key; the steward's key moving to a third-provider
   VPS separates infrastructure, not people.

   *Applied 2026-09-16:* D minted on operator laptop (`did:x509:0:sha256:1YRq01voPnpplmc8U1z8JuIM6iTla__bGbck-J6rd7c::subject:CN:agent.hosting-release-authority`),
   committed via `adns_set_release_authority` at tx `2.330709` (svn 0).
   Constitution v0.2.0 (`1a05b637976e99334f6a1a66ad7eaedf82529919a8a36fc3b4d0731006fa76f1`,
   adding `adns_ksk_rollover`) committed at tx `2.330731`.

## Lineage

TUF/Sigstore root-signing: thresholds over named keyholders, expiry-driven
re-signing; Tor directory authorities and Fabric endorsement policies: majority
of independent members; DAO security councils: a privileged veto/override role
that is loud and rare; scitt-ccf-ledger: majority `resolve.js`, policy over
statement headers with an SVN claim; BountyNet: verifier findings that block a
release until resolved, and checking a measurement against its build witness
rather than trusting it; KERI/TUF: rotation and rollback discipline (SVN
ratchet, kept).

## Consequences

- `resolve()` now reads governance tables; every ballot and verdict is in the
  ledger with the checks that justified it.
- Bootstrapping is explicit: the first member is an unregistered agent with
  minimum reputation and can pass high-impact proposals alone until more
  agents join and `min_agent_yes` is raised. This is recorded in
  `docs/governance/agent.hosting/README.md` with transaction ids.
- The trapdoor can do anything; that is the point of a trap door, and every
  use is a ledger event a consumer can see.
- Single organisation, stated: all keys today are ours. Open join is how that
  changes; the caps and reputation make joining meaningful rather than
  decorative.

## Not done here

Constitution-enforced timelock (needs a clock); SVCB attested records; online
KSK rollover; TDX appraisal profile. Each is tracked in agent-hosting ADR 0024.
