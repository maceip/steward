# Operational state across hosting, ADNS and Steward

Status: implementation plan, 2026-09-18. Prioritized around the owner's request
for a working, well-designed operating workflow. The repository assessment was
4/10 for end-to-end state tracking; this document does not change that rating.

## The outcome

An agent starting from a fresh checkout can discover the deployment, explain
differences from the desired configuration, make a bounded change, and finish
or resume it without reconstructing earlier agents' work from chat or SSH notes.

Use the existing AWS deployment as the first complete workflow. Observe the
existing ADNS and Steward integration alongside it. The Azure bootstrap and
anycast roots remain explicit, separately owned deployment paths.

## Clear ownership

| State | Authoritative owner | What the operating workflow reads |
|---|---|---|
| Cloud resources and their desired configuration | Terraform roots in agent-hosting | Resource addresses, cloud IDs, outputs and refreshed plan |
| Installed software and component data | Existing service installers and durable stores | Release identity, service health and backup/restore result |
| DNS registrations and application transactions | ADNS/CCF | Committed registration/request state and effective service identity |
| Upgrade authorization and governance | Steward/CCF | Current policy, authorization and activation eligibility |
| Progress of one operational change | Small durable operation record | Intent, target generation, completed steps and unresolved outcome |

A common status response assembles these facts and names their source and
observation time. It does not become another writable copy of CCF or Terraform
state. Unreachable and unobserved components report `unknown`, with a reason.
Historical files and successful provisioning cannot establish current readiness.

## Delivery order

1. **Make the current deployment reproducible.** Preserve and commit the actual
   Terraform configuration and provider locks after review. Establish one owner
   for every resource and list external dependencies. Reconcile cloud inventory
   and imports before creating anything. Keep private state out of Git.
2. **Provide one useful status command.** Combine Terraform resource identity,
   running release, service health, ADNS registration and Steward status. Show
   desired value, observed value, observation time and next actionable step.
   Generate the deployment summary from these observations rather than editing
   several competing "current hosts" documents.
3. **Make one change repeatable.** Save a Terraform plan and apply that exact
   plan; invoke existing installers; verify the actual service before cutover.
   Persist progress under a stable operation ID. After an interrupted call,
   query the component's actual result before retrying. Reuse ADNS request IDs
   and its reconciliation behavior. Serialize conflicting operations and use
   ordinary shared Terraform state/locking for agents in separate checkouts.
4. **Make replacement finish the job.** Exercise configure, data restore,
   verification, registration/cutover and retirement as one explicit workflow.
   A cloud-init ready marker is only infrastructure readiness. Preserve the
   current service until the replacement passes the applicable service checks.
5. **Keep the result observable.** Schedule read-only infrastructure and service
   checks. Report a specific discrepancy and repair step. Reuse the same change
   workflow for repairs. Enforce required cutover conditions in the runner;
   Terraform `check` warnings alone are not an execution gate.

Existing Terraform, installers, ADNS clients and Steward checks are the starting
points. The coordinating code should stay small. A Terraform/OpenTofu migration,
new provider abstraction, new cryptographic format, and autonomous fleet repair
are separate projects. Standard backend security settings apply as part of
ordinary setup; custom security machinery is outside this delivery path.

## Acceptance for an 8/10 assessment

| Exercise | Required result |
|---|---|
| Fresh agent checkout | Finds the same deployment and shared state; identifies missing access without inventing current observations |
| Unchanged configuration | Refreshed plan contains no unintended changes; rerunning configuration preserves service data and identities |
| External resource or service change | Status distinguishes cloud drift, software/configuration drift and registration/authorization problems |
| Interrupted update | Resume determines the prior result and completes without duplicate provisioning, lost data or repeated external effects |
| Two agents target the same deployment | Conflicting changes serialize; the second agent refreshes/replans instead of applying stale assumptions |
| Replacement host | Existing artifacts and restored component state yield a working service; external verification passes before old resources retire |

Use local tests for operation transitions and adapter failures, followed by a
bounded real deployment rehearsal for the complete workflow. Record what was
actually exercised. Passing syntax checks or mocked cloud tests alone does not
meet these acceptance criteria.
