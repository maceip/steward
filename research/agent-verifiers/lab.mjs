// Agent simulation and ephemeral test key factory. No real project credentials.
import {generateKeyPairSync} from 'node:crypto';
import {Consumer, WitnessAgent, ZERO, clone, digest, keyId, quorum, requireThat, sha256, signed} from './protocol.mjs';

function agent(domain) {
  const {privateKey, publicKey} = generateKeyPairSync('ed25519');
  const pem = publicKey.export({type: 'spki', format: 'pem'});
  return {id: keyId(pem), domain, pem, privateKey};
}
export function keySet() {
  return Object.fromEntries(['root', 'policy', 'release', 'status', 'witness'].map(role =>
    [role, Array.from({length: role === 'witness' ? 4 : 3}, (_, i) => agent(role + '-operator-' + i))]));
}
function rootFor(keys, pins, old = null) {
  return {type: 'root', ...pins, version: old ? old.version + 1 : 1,
    previous: old ? digest(old) : ZERO, issued_at: 0, expires_at: 5000,
    keys: Object.fromEntries(Object.values(keys).flat().map(a => [a.id, {domain: a.domain, public_key: a.pem}])),
    roles: Object.fromEntries(Object.entries(keys).map(([role, agents]) =>
      [role, {threshold: role === 'witness' ? 3 : 2, keys: agents.map(a => a.id)}])),
  };
}
export function fixture() {
  const f = {now: 100, pins: {project: 'example/worker', network: 'steward-research', target: 'worker:prod'},
    keys: keySet(), roots: [], knownRoots: {}, events: []};
  f.root = rootFor(f.keys, f.pins);
  f.initialRoot = clone(f.root);
  f.knownRoots[digest(f.root)] = clone(f.root);
  f.consumer = new Consumer(f.pins, f.initialRoot);
  f.policy = {type: 'policy', ...f.pins, version: 1, action: 'upgrade', delay: 10,
    max_age: {online: 5, offline: 60, witnessed: 10}};
  f.artifact = Buffer.from('open-source-agent-worker release 1\n');
  f.release = {type: 'release', ...f.pins, action: 'upgrade', sequence: 1, previous: ZERO,
    artifact: sha256(f.artifact), policy_digest: digest(f.policy), root_digest: digest(f.root),
    approved_at: 80, not_before: 90, expires_at: 1000};
  f.updateStatus = function (changes = {}) {
    this.status = {type: 'status', ...this.pins, version: this.status ? this.status.version + 1 : 1,
      root_digest: digest(this.root), policy_digest: digest(this.policy), authorization: digest(this.release),
      sequence: this.release.sequence, previous: this.release.previous,
      approved_at: this.release.approved_at, not_before: this.release.not_before,
      active: true, revoked_keys: [], ...changes};
  };
  f.updateStatus();
  f.resetWitnesses = function () { this.witnesses = this.keys.witness.map(a => new WitnessAgent(a)); };
  f.resetWitnesses();
  f.gateAvailable = true;
  f.usedPermits = new Set();
  // Models an atomic authorizer + effect controller, not a remote shell call.
  // Production must make this check and the actual privileged transition atomic.
  f.commitGate = (proof, effect) => {
    requireThat(f.gateAvailable, 'GATE_UNAVAILABLE');
    quorum(proof.envelope, f.root, 'status');
    const p = proof.envelope.payload;
    requireThat(p.type === 'online' && f.now < p.expires_at, 'GATE_EXPIRED');
    requireThat(!f.usedPermits.has(p.nonce), 'GATE_REPLAY');
    requireThat(digest(p.status) === digest(f.status) && f.status.active, 'GATE_STATUS_CHANGED');
    const result = effect();
    f.usedPermits.add(p.nonce);
    return result;
  };
  f.append = function (status = this.status) {
    const prior = this.events.at(-1)?.payload;
    if (prior && digest(prior.status) === digest(status)) return;
    const e = {type: 'state-event', index: this.events.length + 1,
      previous: prior ? digest(prior) : ZERO, status: clone(status)};
    this.events.push(signed(e, this.keys.status.slice(0, 2)));
  };
  f.issue = function (mode, {request, signers, unsafeWitnesses = false} = {}) {
    const req = mode === 'offline' ? null : request ?? this.consumer.request(this.release, this.now);
    const payload = {type: mode, issued_at: this.now, expires_at: this.now + this.policy.max_age[mode],
      nonce: req?.nonce ?? null, intent: req?.intent ?? null, status: clone(this.status), log_size: null, log_head: null};
    let envelope, events = null;
    if (mode === 'witnessed') {
      this.append(); events = clone(this.events);
      payload.log_size = events.length; payload.log_head = digest(events.at(-1).payload);
      if (unsafeWitnesses) envelope = signed(payload, signers ?? this.keys.witness.slice(0, 3));
      else envelope = {payload, signatures: this.witnesses.slice(0, 3).map(w => w.attest(payload, events, this.knownRoots, this.pins))};
    } else envelope = signed(payload, signers ?? this.keys.status.slice(0, 2));
    return {bundle: {roots: clone(this.roots), policy: signed(this.policy, this.keys.policy.slice(0, 2)),
      release: signed(this.release, this.keys.release.slice(0, 2)), proof: {envelope, events}}, request: req};
  };
  f.rotate = function () {
    const old = this.root, oldKeys = this.keys;
    this.keys = keySet(); this.root = rootFor(this.keys, this.pins, old);
    this.roots.push(signed(this.root, [...oldKeys.root.slice(0, 2), ...this.keys.root.slice(0, 2)]));
    this.knownRoots[digest(this.root)] = clone(this.root);
    this.release.root_digest = digest(this.root);
    this.resetWitnesses(); this.updateStatus();
    return oldKeys;
  };
  return f;
}

// Malicious evidence builders used to check the consumer independently of issuer
// correctness. These deliberately sign modified statements with laboratory keys.
export function resignProof(f, issued) {
  const p = issued.bundle.proof.envelope.payload;
  if (p.type === 'witnessed') {
    const events = issued.bundle.proof.events;
    const e = events.at(-1).payload;
    e.status = clone(p.status);
    events[events.length - 1] = signed(e, f.keys.status.slice(0, 2));
    p.log_size = events.length; p.log_head = digest(e);
  }
  issued.bundle.proof.envelope = signed(p, p.type === 'witnessed' ? f.keys.witness.slice(0, 3) : f.keys.status.slice(0, 2));
}
export function resignRelease(f, issued) { issued.bundle.release = signed(issued.bundle.release.payload, f.keys.release.slice(0, 2)); }
