// Research prototype: real Ed25519 signatures, simulated agents and time.
// Not a production verifier or an implementation of TUF, SCITT, CT or CCF receipts.
import {createHash, createPublicKey, randomBytes, sign, verify} from 'node:crypto';

export const MODES = ['online', 'offline', 'witnessed'];
export const ZERO = '0'.repeat(64);
export function requireThat(ok, code) {
  if (!ok) throw Object.assign(new Error(code), {code});
}
export function canonical(value) {
  let nodes = 0;
  function walk(v, depth) {
    requireThat(++nodes <= 20000 && depth <= 20, 'STRUCTURE_LIMIT');
    if (v === null || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number') {
      requireThat(Number.isSafeInteger(v) && !Object.is(v, -0), 'INVALID_NUMBER');
      return String(v);
    }
    if (typeof v === 'string') {
      requireThat(v.length <= 65536 && !/[\uD800-\uDFFF]/u.test(v), 'INVALID_STRING');
      return JSON.stringify(v);
    }
    if (Array.isArray(v)) return '[' + v.map(x => walk(x, depth + 1)).join(',') + ']';
    requireThat(v && Object.getPrototypeOf(v) === Object.prototype, 'INVALID_OBJECT');
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + walk(v[k], depth + 1)).join(',') + '}';
  }
  const text = walk(value, 0);
  requireThat(Buffer.byteLength(text) <= 1024 * 1024, 'SIZE_LIMIT');
  return text;
}
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const digest = value => sha256(canonical(value));
export const clone = value => JSON.parse(JSON.stringify(value));
export const keyId = pem => sha256(createPublicKey(pem).export({type: 'spki', format: 'der'}));
const message = body => Buffer.from('steward-verifier-research/v1\0' + canonical(body));
export function signed(payload, agents) {
  return {payload: clone(payload), signatures: agents.map(a => ({
    key_id: a.id, signature: sign(null, message(payload), a.privateKey).toString('base64url'),
  }))};
}
function shape(object, fields) {
  requireThat(object && !Array.isArray(object) && typeof object === 'object' &&
    JSON.stringify(Object.keys(object).sort()) === JSON.stringify([...fields].sort()), 'SCHEMA');
}
function integer(v, min = 0) { requireThat(Number.isSafeInteger(v) && v >= min, 'INVALID_NUMBER'); }
function hash(v) { requireThat(typeof v === 'string' && /^[0-9a-f]{64}$/.test(v), 'INVALID_HASH'); }
function scope(body, pins) {
  for (const name of ['project', 'network', 'target']) requireThat(body[name] === pins[name], 'SCOPE_' + name.toUpperCase());
}
function rootShape(root, pins) {
  shape(root, ['type', 'project', 'network', 'target', 'version', 'previous', 'issued_at', 'expires_at', 'keys', 'roles']);
  scope(root, pins);
  requireThat(root.type === 'root', 'ROOT_TYPE');
  integer(root.version, 1); integer(root.issued_at); integer(root.expires_at);
  hash(root.previous);
  requireThat(root.expires_at > root.issued_at, 'ROOT_TIME');
  shape(root.roles, ['root', 'policy', 'release', 'status', 'witness']);
  requireThat(Object.keys(root.keys).length <= 32, 'KEY_LIMIT');
  for (const [id, key] of Object.entries(root.keys)) {
    shape(key, ['domain', 'public_key']);
    requireThat(typeof key.domain === 'string' && key.domain.length > 0 && key.domain.length < 128, 'DOMAIN');
    requireThat(createPublicKey(key.public_key).asymmetricKeyType === 'ed25519' && keyId(key.public_key) === id, 'KEY_ID');
  }
  for (const [name, role] of Object.entries(root.roles)) {
    shape(role, ['threshold', 'keys']);
    integer(role.threshold, name === 'witness' ? 3 : 2);
    requireThat(Array.isArray(role.keys) && new Set(role.keys).size === role.keys.length, 'ROLE_KEYS');
    requireThat(role.keys.every(id => Object.hasOwn(root.keys, id)), 'ROLE_KEYS');
    const domains = new Set(role.keys.map(id => root.keys[id].domain));
    requireThat(domains.size >= role.threshold, 'ROLE_DOMAINS');
    if (name === 'witness') requireThat(domains.size === 4 && role.keys.length === 4 && role.threshold === 3, 'WITNESS_PROFILE');
  }
}
export function quorum(envelope, root, roleName, revoked = []) {
  shape(envelope, ['payload', 'signatures']);
  requireThat(Array.isArray(envelope.signatures) && envelope.signatures.length <= 32, 'SIGNATURE_LIMIT');
  const role = root.roles[roleName], domains = new Set(), ids = new Set();
  for (const s of envelope.signatures) {
    shape(s, ['key_id', 'signature']);
    if (!role.keys.includes(s.key_id) || ids.has(s.key_id) || revoked.includes(s.key_id)) continue;
    requireThat(typeof s.signature === 'string' && /^[A-Za-z0-9_-]{86}$/.test(s.signature), 'SIGNATURE_ENCODING');
    const bytes = Buffer.from(s.signature, 'base64url');
    requireThat(bytes.toString('base64url') === s.signature, 'SIGNATURE_ENCODING');
    if (verify(null, message(envelope.payload), root.keys[s.key_id].public_key, bytes)) {
      ids.add(s.key_id); domains.add(root.keys[s.key_id].domain);
    }
  }
  requireThat(domains.size >= role.threshold, 'QUORUM_' + roleName.toUpperCase());
}
function statusShape(s, pins) {
  shape(s, ['type', 'project', 'network', 'target', 'version', 'root_digest', 'policy_digest',
    'authorization', 'sequence', 'previous', 'approved_at', 'not_before', 'active', 'revoked_keys']);
  scope(s, pins); requireThat(s.type === 'status', 'STATUS_TYPE');
  integer(s.version, 1); integer(s.sequence, 1); integer(s.approved_at); integer(s.not_before);
  for (const name of ['root_digest', 'policy_digest', 'authorization', 'previous']) hash(s[name]);
  requireThat(typeof s.active === 'boolean' && Array.isArray(s.revoked_keys) &&
    s.revoked_keys.length <= 32 && new Set(s.revoked_keys).size === s.revoked_keys.length, 'STATUS_SCHEMA');
  s.revoked_keys.forEach(hash);
}

// Full bounded hash-chain replay is intentionally used instead of claiming a
// production Merkle inclusion/consistency implementation. Each event has quorum
// authorization; witnesses additionally lock a single extending history.
export function inspectLog(events, roots, pins, checkpoint = null) {
  requireThat(Array.isArray(events) && events.length > 0 && events.length <= 64, 'LOG_LIMIT');
  let previous = ZERO, priorStatus = null;
  const heads = [];
  for (let i = 0; i < events.length; i++) {
    const envelope = events[i], e = envelope.payload;
    shape(e, ['type', 'index', 'previous', 'status']);
    requireThat(e.type === 'state-event' && e.index === i + 1 && e.previous === previous, 'LOG_CHAIN');
    statusShape(e.status, pins);
    const root = roots[e.status.root_digest];
    requireThat(root !== undefined, 'LOG_ROOT');
    quorum(envelope, root, 'status');
    if (priorStatus) {
      requireThat(e.status.version === priorStatus.version + 1, 'LOG_VERSION');
      requireThat(root.version >= roots[priorStatus.root_digest].version, 'LOG_ROOT_ROLLBACK');
      requireThat(priorStatus.revoked_keys.every(id => e.status.revoked_keys.includes(id)), 'LOG_REVOCATION_ROLLBACK');
      if (e.status.authorization === priorStatus.authorization) {
        requireThat(e.status.sequence === priorStatus.sequence && e.status.previous === priorStatus.previous &&
          e.status.approved_at === priorStatus.approved_at && e.status.not_before === priorStatus.not_before &&
          e.status.policy_digest === priorStatus.policy_digest, 'LOG_REWRITE');
        requireThat(priorStatus.active || !e.status.active, 'LOG_REACTIVATION');
      } else {
        requireThat(e.status.sequence === priorStatus.sequence + 1 && e.status.previous === priorStatus.authorization, 'LOG_SUCCESSOR');
      }
    }
    previous = digest(e); heads.push(previous); priorStatus = e.status;
  }
  if (checkpoint) {
    requireThat(events.length >= checkpoint.size, 'LOG_ROLLBACK');
    requireThat(heads[checkpoint.size - 1] === checkpoint.head, 'LOG_FORK');
  }
  return {size: events.length, head: previous, status: clone(priorStatus)};
}

export class WitnessAgent {
  constructor(agent, saved = null) { this.agent = agent; this.checkpoint = saved; }
  attest(payload, events, roots, pins) {
    const log = inspectLog(events, roots, pins, this.checkpoint);
    requireThat(payload.type === 'witnessed' && payload.log_size === log.size &&
      payload.log_head === log.head && digest(payload.status) === digest(log.status), 'CHECKPOINT_BINDING');
    this.checkpoint = {size: log.size, head: log.head};
    return signed(payload, [this.agent]).signatures[0];
  }
}

export class Consumer {
  constructor(pins, root, saved = null) {
    this.pins = clone(pins);
    rootShape(root, pins);
    this.state = saved ? clone(saved) : {root: clone(root), roots: {[digest(root)]: clone(root)},
      installed: {sequence: 0, head: ZERO}, observation: null, checkpoint: null, last_time: 0};
    // A production store must authenticate this state and prevent snapshot rollback.
    rootShape(this.state.root, pins);
    this.pending = new Map();
  }
  request(release, now) {
    integer(now);
    const request = {nonce: randomBytes(32).toString('hex'), intent: digest(release), created_at: now};
    this.pending.set(request.nonce, clone(request));
    return request;
  }
  roots(chain, now) {
    requireThat(Array.isArray(chain) && chain.length <= 16, 'ROOT_CHAIN_LIMIT');
    for (const envelope of chain) {
      const old = this.state.root, next = envelope.payload;
      rootShape(next, this.pins);
      if (next.version <= old.version) {
        // Rechecking the same bundle at execution must be idempotent. An already
        // authenticated historical root never replaces the current trusted root.
        requireThat(Object.hasOwn(this.state.roots, digest(next)), 'ROOT_CHAIN');
        continue;
      }
      requireThat(next.version === old.version + 1 && next.previous === digest(old), 'ROOT_CHAIN');
      requireThat(next.issued_at <= now, 'ROOT_FUTURE');
      quorum(envelope, old, 'root'); quorum(envelope, next, 'root');
      this.state.root = clone(next); this.state.roots[digest(next)] = clone(next);
    }
    requireThat(this.state.root.issued_at <= now && now < this.state.root.expires_at, 'ROOT_EXPIRED');
    return this.state.root;
  }
  inspect(mode, bundle, artifact, now, request = null) {
    requireThat(MODES.includes(mode), 'MODE');
    canonical(bundle); // enforce bounds before expensive signature/log work
    shape(bundle, ['roots', 'policy', 'release', 'proof']);
    integer(now); requireThat(now >= this.state.last_time, 'CLOCK_ROLLBACK');
    this.state.last_time = now;
    const root = this.roots(bundle.roots, now);
    const policy = bundle.policy.payload, release = bundle.release.payload;
    shape(policy, ['type', 'project', 'network', 'target', 'version', 'action', 'delay', 'max_age']);
    scope(policy, this.pins); requireThat(policy.type === 'policy' && policy.action === 'upgrade', 'POLICY_TYPE');
    integer(policy.version, 1); integer(policy.delay, 1);
    shape(policy.max_age, MODES);
    for (const value of Object.values(policy.max_age)) { integer(value, 1); requireThat(value <= 300, 'MAX_AGE'); }
    quorum(bundle.policy, root, 'policy');
    shape(release, ['type', 'project', 'network', 'target', 'action', 'sequence', 'previous',
      'artifact', 'policy_digest', 'root_digest', 'approved_at', 'not_before', 'expires_at']);
    scope(release, this.pins);
    requireThat(release.type === 'release' && release.action === policy.action, 'ACTION');
    for (const field of ['sequence', 'approved_at', 'not_before', 'expires_at']) integer(release[field]);
    for (const field of ['previous', 'artifact', 'policy_digest', 'root_digest']) hash(release[field]);
    requireThat(release.artifact === sha256(artifact), 'ARTIFACT');
    requireThat(release.policy_digest === digest(policy), 'POLICY_DIGEST');
    requireThat(release.root_digest === digest(root), 'ROOT_DIGEST');
    requireThat(release.sequence === this.state.installed.sequence + 1 && release.previous === this.state.installed.head, 'PREVIOUS_STATE');
    requireThat(release.not_before >= release.approved_at + policy.delay, 'DELAY');
    requireThat(release.approved_at <= now && release.not_before <= now, 'NOT_ACTIVE');
    requireThat(now < release.expires_at, 'RELEASE_EXPIRED');
    quorum(bundle.release, root, 'release');

    const proof = bundle.proof;
    requireThat(proof !== null && typeof proof === 'object', 'PROOF_REQUIRED');
    shape(proof, ['envelope', 'events']);
    const p = proof.envelope.payload;
    shape(p, ['type', 'issued_at', 'expires_at', 'nonce', 'intent', 'status', 'log_size', 'log_head']);
    requireThat(p.type === mode, 'PROOF_TYPE');
    integer(p.issued_at); integer(p.expires_at);
    const age = policy.max_age[mode];
    requireThat(p.issued_at <= now && now < p.expires_at && p.expires_at > p.issued_at && p.expires_at - p.issued_at <= age, 'PROOF_FRESHNESS');
    if (mode === 'offline') {
      requireThat(p.nonce === null && p.intent === null, 'OFFLINE_SCHEMA');
    } else {
      requireThat(request && this.pending.has(request.nonce) &&
        canonical(request) === canonical(this.pending.get(request.nonce)) &&
        request.intent === digest(release) && p.intent === request.intent && p.nonce === request.nonce &&
        p.issued_at >= request.created_at && now - request.created_at < age, 'CHALLENGE');
    }
    statusShape(p.status, this.pins);
    let checkpoint = null;
    if (mode === 'witnessed') {
      quorum(proof.envelope, root, 'witness');
      const log = inspectLog(proof.events, this.state.roots, this.pins, this.state.checkpoint);
      requireThat(p.log_size === log.size && p.log_head === log.head && digest(p.status) === digest(log.status), 'CHECKPOINT_BINDING');
      checkpoint = {size: log.size, head: log.head};
    } else {
      requireThat(proof.events === null && p.log_size === null && p.log_head === null, 'PROOF_SCHEMA');
      quorum(proof.envelope, root, 'status');
    }
    const s = p.status;
    requireThat(s.root_digest === digest(root), 'STATUS_ROOT');
    const observed = this.state.observation;
    if (observed) {
      requireThat(s.version >= observed.version, 'STATUS_ROLLBACK');
      requireThat(s.version !== observed.version || digest(s) === observed.digest, 'STATUS_EQUIVOCATION');
    }
    // Authenticated negative observations advance the floor even when activation
    // is refused, so a later old "active" response cannot erase a known revocation.
    this.state.observation = {version: s.version, digest: digest(s)};
    if (checkpoint) this.state.checkpoint = checkpoint;
    requireThat(s.policy_digest === digest(policy), 'STATUS_POLICY');
    requireThat(s.authorization === digest(release) && s.sequence === release.sequence &&
      s.previous === release.previous && s.approved_at === release.approved_at && s.not_before === release.not_before, 'STATUS_AUTHORIZATION');
    requireThat(s.active, 'REVOKED');
    quorum(bundle.release, root, 'release', s.revoked_keys);
    return {authorization: digest(release), sequence: release.sequence, mode,
      fresh_until: Math.min(release.expires_at, root.expires_at, p.expires_at)};
  }
  activate(mode, bundle, artifact, now, request = null, commitGate = null) {
    // Full verification at the simulated effect boundary, never trust an earlier
    // inspect() boolean. Single-threaded CAS; no crash-safe deployment transaction.
    const expected = digest(this.state.installed);
    const result = this.inspect(mode, bundle, artifact, now, request);
    const effect = () => {
      requireThat(digest(this.state.installed) === expected, 'CONCURRENT_CHANGE');
      requireThat(sha256(artifact) === bundle.release.payload.artifact, 'ARTIFACT');
      this.state.installed = {sequence: result.sequence, head: result.authorization};
      if (request) this.pending.delete(request.nonce);
      return result;
    };
    if (mode === 'online') {
      requireThat(typeof commitGate === 'function', 'COMMIT_GATE_REQUIRED');
      return commitGate(bundle.proof, effect);
    }
    return effect();
  }
}
