// Dependency-free adversarial experiment runner. Each case gets fresh keys/state.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Consumer, WitnessAgent, MODES, clone, digest, quorum, sha256, signed} from './protocol.mjs';
import {fixture, resignProof, resignRelease} from './lab.mjs';

const results = [];
function scenario(strategy, name, expected, run) {
  try {
    run();
    results.push({strategy, name, expected, passed: true});
  } catch (error) {
    results.push({strategy, name, expected, passed: false, error: error.stack});
  }
}
function rejects(fn, code) { assert.throws(fn, e => e.code === code, 'must reject with ' + code); }
function inspect(f, mode, issued, now = f.now, artifact = f.artifact) {
  return f.consumer.inspect(mode, issued.bundle, artifact, now, issued.request);
}
function activate(f, mode, issued, now = f.now, artifact = f.artifact) {
  return f.consumer.activate(mode, issued.bundle, artifact, now, issued.request, f.commitGate);
}
function negative(mode, name, code, mutate) {
  scenario(mode, name, 'reject:' + code, () => {
    const f = fixture(), i = f.issue(mode);
    mutate(f, i);
    rejects(() => inspect(f, mode, i), code);
  });
}

for (const mode of MODES) {
  scenario(mode, 'valid agent-authorized upgrade', 'accept', () => {
    const f = fixture(), i = f.issue(mode);
    activate(f, mode, i);
    assert.equal(f.consumer.state.installed.head, digest(f.release));
    assert.equal(f.consumer.state.installed.sequence, 1);
  });
  scenario(mode, 'second upgrade extends installed state', 'accept:sequence 2', () => {
    const f = fixture(); activate(f, mode, f.issue(mode));
    f.now += 20; f.artifact = Buffer.from('open-source-agent-worker release 2\n');
    f.release = {...f.release, sequence: 2, previous: f.consumer.state.installed.head,
      artifact: sha256(f.artifact), approved_at: f.now - 10, not_before: f.now};
    f.updateStatus(); activate(f, mode, f.issue(mode));
    assert.equal(f.consumer.state.installed.sequence, 2);
  });
  negative(mode, 'tampered artifact bytes', 'ARTIFACT', f => { f.artifact = Buffer.from('malicious replacement'); });
  for (const field of ['project', 'network', 'target']) {
    negative(mode, 'wrong ' + field, 'SCOPE_' + field.toUpperCase(), (f, i) => {
      i.bundle.release.payload[field] += '-other'; resignRelease(f, i);
    });
  }
  negative(mode, 'wrong action', 'ACTION', (f, i) => {
    i.bundle.release.payload.action = 'replace-root'; resignRelease(f, i);
  });
  negative(mode, 'unsigned policy alteration', 'QUORUM_POLICY', (_, i) => { i.bundle.policy.payload.delay = 1; });
  negative(mode, 'different validly signed policy', 'POLICY_DIGEST', (f, i) => {
    i.bundle.policy.payload.version++; i.bundle.policy = signed(i.bundle.policy.payload, f.keys.policy.slice(0, 2));
  });
  negative(mode, 'invalid approving signature', 'QUORUM_RELEASE', (_, i) => {
    const s = i.bundle.release.signatures[0];
    s.signature = (s.signature[0] === 'A' ? 'B' : 'A') + s.signature.slice(1);
  });
  negative(mode, 'duplicate signer cannot form quorum', 'QUORUM_RELEASE', (_, i) => {
    i.bundle.release.signatures = [i.bundle.release.signatures[0], i.bundle.release.signatures[0]];
  });
  negative(mode, 'status agents cannot approve releases', 'QUORUM_RELEASE', (f, i) => {
    i.bundle.release = signed(i.bundle.release.payload, f.keys.status);
  });
  scenario(mode, 'different keys under one operator count once', 'reject:QUORUM_RELEASE', () => {
    const f = fixture();
    f.root.keys[f.keys.release[1].id].domain = f.root.keys[f.keys.release[0].id].domain;
    f.initialRoot = clone(f.root); f.knownRoots[digest(f.root)] = clone(f.root);
    f.consumer = new Consumer(f.pins, f.root); f.release.root_digest = digest(f.root); f.updateStatus();
    const i = f.issue(mode);
    rejects(() => inspect(f, mode, i), 'QUORUM_RELEASE');
  });
  negative(mode, 'wrong predecessor', 'PREVIOUS_STATE', (f, i) => {
    i.bundle.release.payload.previous = 'a'.repeat(64); resignRelease(f, i);
  });
  negative(mode, 'skipped release sequence', 'PREVIOUS_STATE', (f, i) => {
    i.bundle.release.payload.sequence = 2; resignRelease(f, i);
  });
  negative(mode, 'attempted early activation', 'NOT_ACTIVE', (f, i) => {
    i.bundle.release.payload.not_before = 110; resignRelease(f, i);
  });
  negative(mode, 'delay shorter than signed policy', 'DELAY', (f, i) => {
    i.bundle.release.payload.not_before = 85; resignRelease(f, i);
  });
  negative(mode, 'expired release', 'RELEASE_EXPIRED', (f, i) => {
    i.bundle.release.payload.expires_at = 100; resignRelease(f, i);
  });
  negative(mode, 'receipt alone has no activation proof', 'PROOF_REQUIRED', (_, i) => { i.bundle.proof = null; });
  negative(mode, 'unrequested proof strategy', 'PROOF_TYPE', (_, i) => {
    i.bundle.proof.envelope.payload.type = mode === 'offline' ? 'online' : 'offline';
  });
  negative(mode, 'authenticated revocation', 'REVOKED', (f, i) => {
    i.bundle.proof.envelope.payload.status.active = false; resignProof(f, i);
  });
  negative(mode, 'revoked approving authority no longer counts', 'QUORUM_RELEASE', (f, i) => {
    i.bundle.proof.envelope.payload.status.revoked_keys = [f.keys.release[0].id]; resignProof(f, i);
  });
  negative(mode, 'current state names another policy', 'STATUS_POLICY', (f, i) => {
    i.bundle.proof.envelope.payload.status.policy_digest = 'a'.repeat(64); resignProof(f, i);
  });
  negative(mode, 'current state names another authorization', 'STATUS_AUTHORIZATION', (f, i) => {
    i.bundle.proof.envelope.payload.status.authorization = 'a'.repeat(64); resignProof(f, i);
  });
  negative(mode, 'status names an untrusted root', mode === 'witnessed' ? 'LOG_ROOT' : 'STATUS_ROOT', (f, i) => {
    i.bundle.proof.envelope.payload.status.root_digest = 'a'.repeat(64); resignProof(f, i);
  });
  for (const field of ['project', 'network', 'target']) {
    negative(mode, 'status from another ' + field, 'SCOPE_' + field.toUpperCase(), (f, i) => {
      i.bundle.proof.envelope.payload.status[field] += '-other'; resignProof(f, i);
    });
  }
  negative(mode, 'proof validity exceeds policy', 'PROOF_FRESHNESS', (f, i) => {
    i.bundle.proof.envelope.payload.expires_at++; resignProof(f, i);
  });
  negative(mode, 'future-dated proof', 'PROOF_FRESHNESS', (f, i) => {
    i.bundle.proof.envelope.payload.issued_at++; resignProof(f, i);
  });
  negative(mode, 'proof quorum unavailable', mode === 'witnessed' ? 'QUORUM_WITNESS' : 'QUORUM_STATUS', (_, i) => {
    i.bundle.proof.envelope.signatures.pop();
  });
  negative(mode, 'unknown critical release field', 'SCHEMA', (_, i) => { i.bundle.release.payload.override = true; });
  negative(mode, 'excessively large evidence field', 'INVALID_STRING', (_, i) => {
    i.bundle.release.payload.override = 'x'.repeat(65537);
  });
  scenario(mode, 'proof rechecked at delayed execution', 'reject:PROOF_FRESHNESS', () => {
    const f = fixture(), i = f.issue(mode); inspect(f, mode, i);
    f.now += f.policy.max_age[mode];
    rejects(() => activate(f, mode, i), 'PROOF_FRESHNESS');
    assert.equal(f.consumer.state.installed.sequence, 0);
  });
  scenario(mode, 'artifact rechecked at execution', 'reject:ARTIFACT', () => {
    const f = fixture(), i = f.issue(mode); inspect(f, mode, i);
    rejects(() => activate(f, mode, i, f.now, Buffer.from('swapped bytes')), 'ARTIFACT');
  });
  scenario(mode, 'observed revocation survives an old active proof', 'reject:rollback', () => {
    const f = fixture(), old = f.issue(mode); inspect(f, mode, old);
    f.now++; f.updateStatus({active: false});
    const revoked = f.issue(mode);
    rejects(() => inspect(f, mode, revoked), 'REVOKED');
    rejects(() => inspect(f, mode, old), mode === 'witnessed' ? 'LOG_ROLLBACK' : 'STATUS_ROLLBACK');
  });
  scenario(mode, 'same status version with different contents', 'reject:equivocation', () => {
    const f = fixture(), first = f.issue(mode); inspect(f, mode, first);
    const conflicting = clone(first);
    conflicting.bundle.proof.envelope.payload.status.active = false; resignProof(f, conflicting);
    rejects(() => inspect(f, mode, conflicting), mode === 'witnessed' ? 'LOG_FORK' : 'STATUS_EQUIVOCATION');
  });
  scenario(mode, 'clock moves backwards', 'reject:CLOCK_ROLLBACK', () => {
    const f = fixture(), i = f.issue(mode); inspect(f, mode, i);
    rejects(() => inspect(f, mode, i, 99), 'CLOCK_ROLLBACK');
  });
  scenario(mode, 'root rotation authorized by old and new quorums', 'accept', () => {
    const f = fixture(); f.rotate(); const i = f.issue(mode); activate(f, mode, i);
    assert.equal(f.consumer.state.root.version, 2);
  });
  scenario(mode, 'root rotation can be inspected then rechecked at execution', 'accept', () => {
    const f = fixture(); f.rotate(); const i = f.issue(mode);
    inspect(f, mode, i); activate(f, mode, i); assert.equal(f.consumer.state.root.version, 2);
  });
  scenario(mode, 'root rotation preserves an existing upgrade history', 'accept:root 2, sequence 2', () => {
    const f = fixture(); activate(f, mode, f.issue(mode));
    f.now += 20; f.rotate(); f.artifact = Buffer.from('release 2 under root 2\n');
    f.release = {...f.release, sequence: 2, previous: f.consumer.state.installed.head,
      artifact: sha256(f.artifact), approved_at: f.now - 10, not_before: f.now};
    f.updateStatus({version: 2}); const i = f.issue(mode);
    inspect(f, mode, i); activate(f, mode, i);
    assert.equal(f.consumer.state.root.version, 2); assert.equal(f.consumer.state.installed.sequence, 2);
  });
  for (const half of ['old', 'new']) scenario(mode, 'root rotation signed only by ' + half + ' quorum', 'reject:QUORUM_ROOT', () => {
    const f = fixture(), oldKeys = f.rotate();
    f.roots[0] = signed(f.root, (half === 'old' ? oldKeys : f.keys).root.slice(0, 2));
    const i = f.issue(mode); rejects(() => inspect(f, mode, i), 'QUORUM_ROOT');
  });
  scenario(mode, 'skipped root version', 'reject:ROOT_CHAIN', () => {
    const f = fixture(), oldKeys = f.rotate(); f.root.version++;
    f.roots[0] = signed(f.root, [...oldKeys.root.slice(0, 2), ...f.keys.root.slice(0, 2)]);
    const i = f.issue(mode); rejects(() => inspect(f, mode, i), 'ROOT_CHAIN');
  });
  scenario(mode, 'expired trust root', 'reject:ROOT_EXPIRED', () => {
    const f = fixture(), i = f.issue(mode); rejects(() => inspect(f, mode, i, 5000), 'ROOT_EXPIRED');
  });
  scenario(mode, 'valid root update cannot lower quorum below consumer floor', 'reject:INVALID_NUMBER', () => {
    const f = fixture(), oldKeys = f.rotate(); f.root.roles.release.threshold = 1;
    f.roots[0] = signed(f.root, [...oldKeys.root.slice(0, 2), ...f.keys.root.slice(0, 2)]);
    const i = f.issue(mode); rejects(() => inspect(f, mode, i), 'INVALID_NUMBER');
  });
  scenario(mode, 'accepted root update survives denied activation', 'reject:QUORUM_POLICY under retired root', () => {
    const f = fixture(), oldPolicy = signed(f.policy, f.keys.policy.slice(0, 2));
    f.rotate(); f.status.active = false;
    const next = f.issue(mode);
    rejects(() => inspect(f, mode, next), 'REVOKED');
    assert.equal(f.consumer.state.root.version, 2);
    next.bundle.roots = []; next.bundle.policy = oldPolicy;
    rejects(() => inspect(f, mode, next), 'QUORUM_POLICY');
  });
  scenario(mode, 'replay rejected after saved-state restart', 'reject:PREVIOUS_STATE', () => {
    const f = fixture(), i = f.issue(mode); activate(f, mode, i);
    const filename = path.join(tmpdir(), 'steward-verifier-' + randomUUID() + '.json');
    try {
      writeFileSync(filename, JSON.stringify(f.consumer.state), {flag: 'wx'});
      f.consumer = new Consumer(f.pins, f.initialRoot, JSON.parse(readFileSync(filename, 'utf8')));
      rejects(() => inspect(f, mode, i), 'PREVIOUS_STATE');
    } finally { unlinkSync(filename); }
  });
  scenario(mode, 'historical receipt stays valid after revocation', 'receipt-valid; upgrade-rejected', () => {
    const f = fixture(), receipt = signed({type: 'research-receipt', entry: digest(f.release), recorded_at: 80}, f.keys.status.slice(0, 2));
    f.updateStatus({active: false}); const i = f.issue(mode);
    quorum(receipt, f.root, 'status');
    rejects(() => activate(f, mode, i), 'REVOKED');
  });
  scenario(mode, 'revocation after permit issuance before effect', mode === 'online' ? 'reject:GATE_STATUS_CHANGED' : 'LIMITATION:accept cached proof within lease', () => {
    const f = fixture(), i = f.issue(mode); inspect(f, mode, i);
    f.now++; f.updateStatus({active: false});
    if (mode === 'online') rejects(() => activate(f, mode, i), 'GATE_STATUS_CHANGED');
    else assert.equal(activate(f, mode, i).sequence, 1);
  });
  scenario(mode, 'partition and hidden revocation', mode === 'offline' ? 'LIMITATION:accept cached snapshot before expiry' : 'reject:no online evidence', () => {
    const f = fixture(), cached = f.issue(mode); f.now++; f.updateStatus({active: false}); f.gateAvailable = false;
    if (mode === 'offline') assert.equal(activate(f, mode, cached).sequence, 1);
    else if (mode === 'online') rejects(() => activate(f, mode, cached), 'GATE_UNAVAILABLE');
    else {
      cached.request = f.consumer.request(f.release, f.now);
      rejects(() => activate(f, mode, cached), 'CHALLENGE');
    }
  });
  if (mode !== 'offline') {
    scenario(mode, 'reply cannot satisfy another request nonce', 'reject:CHALLENGE', () => {
      const f = fixture(), i = f.issue(mode); i.request = f.consumer.request(f.release, f.now);
      rejects(() => inspect(f, mode, i), 'CHALLENGE');
    });
    scenario(mode, 'old challenge invalid after consumer restart', 'reject:CHALLENGE', () => {
      const f = fixture(), i = f.issue(mode);
      f.consumer = new Consumer(f.pins, f.initialRoot, f.consumer.state);
      rejects(() => inspect(f, mode, i), 'CHALLENGE');
    });
  }
}

scenario('online', 'cached positive result cannot bypass commit gate', 'reject:COMMIT_GATE_REQUIRED', () => {
  const f = fixture(), i = f.issue('online');
  rejects(() => f.consumer.activate('online', i.bundle, f.artifact, f.now, i.request), 'COMMIT_GATE_REQUIRED');
});
scenario('online', 'two activation attempts consume only once', 'reject:PREVIOUS_STATE', () => {
  const f = fixture(), i = f.issue('online'); activate(f, 'online', i);
  rejects(() => activate(f, 'online', i), 'PREVIOUS_STATE');
  assert.equal(f.usedPermits.size, 1);
});
scenario('online', 'another consumer cannot reuse a consumed permit', 'reject:GATE_REPLAY', () => {
  const f = fixture(), i = f.issue('online'); activate(f, 'online', i);
  rejects(() => f.commitGate(i.bundle.proof, () => assert.fail('effect must not run')), 'GATE_REPLAY');
});

scenario('witnessed', 'one unavailable witness still permits activation', 'accept:3-of-4', () => {
  const f = fixture(), i = f.issue('witnessed'), p = i.bundle.proof.envelope.payload;
  i.bundle.proof.envelope.signatures = f.witnesses.slice(1).map(w => w.attest(p, i.bundle.proof.events, f.knownRoots, f.pins));
  activate(f, 'witnessed', i);
});
scenario('witnessed', 'tampered historical event', 'reject:QUORUM_STATUS', () => {
  const f = fixture(), i = f.issue('witnessed'); i.bundle.proof.events[0].payload.status.active = false;
  rejects(() => inspect(f, 'witnessed', i), 'QUORUM_STATUS');
});
scenario('witnessed', 'omitted revocation event under a newer checkpoint', 'reject:CHECKPOINT_BINDING', () => {
  const f = fixture(); f.issue('witnessed'); f.updateStatus({active: false});
  const i = f.issue('witnessed'); i.bundle.proof.events.pop();
  rejects(() => inspect(f, 'witnessed', i), 'CHECKPOINT_BINDING');
});
scenario('witnessed', 'witness remembers its checkpoint across restart', 'reject:LOG_FORK', () => {
  const f = fixture(), i = f.issue('witnessed');
  i.bundle.proof.envelope.payload.status.revoked_keys = [f.keys.release[2].id]; resignProof(f, i);
  const restarted = new WitnessAgent(f.keys.witness[0], clone(f.witnesses[0].checkpoint));
  rejects(() => restarted.attest(i.bundle.proof.envelope.payload, i.bundle.proof.events, f.knownRoots, f.pins), 'LOG_FORK');
});
scenario('witnessed', 'revocation cannot disappear in a later log state', 'reject:LOG_REVOCATION_ROLLBACK', () => {
  const f = fixture(); f.updateStatus({revoked_keys: [f.keys.release[2].id]}); f.issue('witnessed');
  f.updateStatus(); rejects(() => f.issue('witnessed'), 'LOG_REVOCATION_ROLLBACK');
});
scenario('witnessed', 'revoked authorization cannot be silently reactivated', 'reject:LOG_REACTIVATION', () => {
  const f = fixture(); f.updateStatus({active: false}); f.issue('witnessed');
  f.updateStatus(); rejects(() => f.issue('witnessed'), 'LOG_REACTIVATION');
});

let forkSchedules = 0;
scenario('witnessed', 'conflicting checkpoints with one Byzantine witness', 'reject second quorum in all 16 schedules', () => {
  // A 3-of-4 quorum intersects another in >=2 identities. With at most one
  // equivocating witness, an honest locked witness must refuse the fork.
  for (let malicious = 0; malicious < 4; malicious++) for (let omitted = 0; omitted < 4; omitted++) {
    const f = fixture(), base = f.issue('witnessed'); f.resetWitnesses();
    const first = base.bundle.proof.envelope.payload, events = base.bundle.proof.events;
    for (let w = 0; w < 4; w++) if (w !== omitted) f.witnesses[w].attest(first, events, f.knownRoots, f.pins);
    const fork = clone(base); fork.bundle.proof.envelope.payload.status.revoked_keys = [f.keys.release[2].id]; resignProof(f, fork);
    const p = fork.bundle.proof.envelope.payload;
    const signatures = [signed(p, [f.keys.witness[malicious]]).signatures[0]];
    for (let w = 0; w < 4; w++) if (w !== malicious) {
      try { signatures.push(f.witnesses[w].attest(p, fork.bundle.proof.events, f.knownRoots, f.pins)); }
      catch (e) { assert.equal(e.code, 'LOG_FORK'); }
    }
    fork.bundle.proof.envelope.signatures = signatures;
    assert.ok(signatures.length <= 2);
    rejects(() => inspect(f, 'witnessed', fork), 'QUORUM_WITNESS'); forkSchedules++;
  }
});

// Explicit boundaries: stateless quorum signatures can certify conflicting
// views to fresh consumers. They need a consistent authoritative state service;
// crypto thresholds alone do not supply consensus.
for (const mode of ['online', 'offline']) scenario(mode, 'fresh consumers cannot detect a signed split view alone', 'LIMITATION:both inspections accept', () => {
  const f = fixture(), first = f.issue(mode); inspect(f, mode, first);
  f.consumer = new Consumer(f.pins, f.initialRoot);
  f.status.revoked_keys = [f.keys.release[2].id]; // same version, different state
  // Status key 0 equivocates; keys 1 and 2 each sign only one of the two views.
  const fork = f.issue(mode, {signers: [f.keys.status[0], f.keys.status[2]]}); inspect(f, mode, fork);
});

const summary = Object.fromEntries(MODES.map(mode => {
  const cases = results.filter(r => r.strategy === mode);
  return [mode, {cases: cases.length, passed: cases.filter(r => r.passed).length,
    expected_limitations: cases.filter(r => r.expected.startsWith('LIMITATION')).length}];
}));
const report = {schema: 'steward-agent-verifier-experiment/v1', generated_at: new Date().toISOString(),
  runtime: process.version, platform: process.platform, base_commit: '082d1d9',
  source_sha256: Object.fromEntries(['protocol.mjs', 'lab.mjs', 'run.mjs'].map(name =>
    [name, sha256(readFileSync(new URL(name, import.meta.url)))])),
  method: 'Local deterministic agents; real ephemeral Ed25519 keys; simulated time and network availability; no live CCF or deployment.',
  summary, fork_schedules_tested: forkSchedules, results};
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0) {
  assert.ok(process.argv[outputIndex + 1], '--output requires a filename');
  writeFileSync(path.resolve(process.argv[outputIndex + 1]), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({summary, fork_schedules_tested: forkSchedules, failures: results.filter(r => !r.passed)}, null, 2));
if (results.some(r => !r.passed)) process.exitCode = 1;
