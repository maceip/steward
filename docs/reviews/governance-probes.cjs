// Offline diagnostics for the 2026-09-17 review, NOT desired-behavior tests.
// These assertions reproduce defects at 082d1d9. Update/remove them when fixed.
// Executes actual composed sources with in-memory KV; no CCF node, keys or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../constitution');
const source = ['ccf-7.0.15-actions.js', 'actions.js', 'exports.js', 'resolve.js']
  .map(name => fs.readFileSync(path.join(root, name), 'utf8'))
  .join('\n').replace(/^export /gm, '');
const prefix = 'public:ccf.gov.';
const A = 'a'.repeat(64), B = 'b'.repeat(64), C = 'c'.repeat(64);
const P = '1'.repeat(64), Q = '2'.repeat(64);
const release = JSON.stringify({actions: [{name: 'set_recovery_threshold', args: {recovery_threshold: 1}}]});

function fixture(roster) {
  const tables = new Map();
  const keyOf = key => Buffer.from(key).toString('hex');
  function table(name) {
    if (!tables.has(name)) tables.set(name, new Map());
    const map = tables.get(name);
    return {
      get: key => map.get(keyOf(key)), has: key => map.has(keyOf(key)),
      set: (key, value) => map.set(keyOf(key), value),
      delete: key => map.delete(keyOf(key)), clear: () => map.clear(),
      forEach: fn => map.forEach((value, key) => fn(value, Buffer.from(key, 'hex'))),
      get size() { return map.size; },
    };
  }
  const ccf = {
    strToBuf: value => Buffer.from(value), bufToStr: value => Buffer.from(value).toString(),
    jsonCompatibleToBuf: value => Buffer.from(JSON.stringify(value)),
    bufToJsonCompatible: value => JSON.parse(Buffer.from(value).toString()),
    kv: new Proxy({}, {get: (_, name) => table(name)}),
  };
  const context = vm.createContext({ccf});
  vm.runInContext(source + '\nglobalThis.reviewActions = actions;', context);
  const write = (name, key, value) => table(name).set(Buffer.from(key), ccf.jsonCompatibleToBuf(value));
  for (const [id, memberClass, reputation] of roster) {
    write(prefix + 'members.info', id, {status: 'Active'});
    write(prefix + 'agentdns.governors', id, {class: memberClass, reputation});
  }
  return {
    write,
    read: (name, key) => ccf.bufToJsonCompatible(table(name).get(Buffer.from(key))),
    proposal(id, state = 'Open') {
      table(prefix + 'proposals').set(Buffer.from(id), Buffer.from(release));
      write(prefix + 'proposals_info', id, {state, proposer_id: A});
    },
    resolve(votes, id = P) { return context.resolve(release, A, votes, id); },
    invoke(name, args) {
      const action = context.reviewActions.get(name);
      action.validate(args);
      action.apply(args, P);
    },
  };
}
const yes = member_id => ({member_id, vote: true});
function report(probe, observed) { console.log(JSON.stringify({probe, observed})); }

{
  const f = fixture([[A, 'agent', 1], [B, 'agent', 1], [C, 'agent', 1]]);
  const state = f.resolve([yes(A), yes(B), yes(C)]);
  assert.equal(state, 'Open');
  report('three newcomers, unanimous yes', state);
}
{
  const f = fixture([[A, 'agent', 64], [B, 'agent', 1], [C, 'agent', 1]]);
  const state = f.resolve([yes(A)]);
  assert.equal(state, 'Accepted');
  report('veteran alone after newcomer rounding', state);
}
{
  const f = fixture([[A, 'trapdoor', 1], [B, 'trapdoor', 1]]);
  const approveFirst = f.resolve([yes(A), {member_id: B, vote: false}]);
  const vetoFirst = f.resolve([{member_id: B, vote: false}, yes(A)]);
  assert.equal(approveFirst, 'Accepted');
  assert.equal(vetoFirst, 'Rejected');
  report('conflicting trapdoor ballot order', {approveFirst, vetoFirst});
}
{
  const f = fixture([[A, 'agent', 4], [B, 'agent', 4], [C, 'agent', 4]]);
  f.proposal(P, 'Rejected');
  f.proposal(Q);
  // A valid finding recorded on the second proposal should govern that proposal.
  f.write(prefix + 'agentdns.verdicts', Q + '/' + B, {by: B, verdict: 'block'});
  const state = f.resolve([yes(A), yes(B), yes(C)], Q);
  assert.equal(state, 'Accepted');
  report('second identical proposal has a block finding', state);
}
{
  const f = fixture([[A, 'agent', 4]]);
  // Seed an already governed D and SVN floor. These default actions never read D.
  f.write(prefix + 'agentdns.release_authority', 'release-authority', {did: 'review-fixture', svn: 4});
  f.write(prefix + 'agentdns.node_join_policy', 'node-join-policy', {svn: 4});
  f.invoke('add_snp_measurement', {measurement: 'ab'.repeat(48)});
  f.invoke('add_snp_host_data', {host_data: 'cd'.repeat(32), security_policy: ''});
  assert.equal(f.read(prefix + 'nodes.snp.measurements', 'ab'.repeat(48)), 'AllowedToJoin');
  assert.equal(f.read(prefix + 'nodes.snp.host_data', 'cd'.repeat(32)), '');
  assert.equal(f.read(prefix + 'agentdns.node_join_policy', 'node-join-policy').svn, 4);
  report('default join-table actions with no D signature', 'tables changed; policy SVN stayed 4');
}
