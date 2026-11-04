const assert = require('node:assert/strict');

const newB = require('bip39');

const newT = require('tronweb').TronWeb;
const clone = x => JSON.parse(JSON.stringify(x));
const results = [];
// Block real network I/O: every RPC needed below is explicitly mocked.
for (const mod of ['node:http', 'node:https']) {
  require(mod).request = () => { throw Error('NETWORK_FORBIDDEN'); };
  require(mod).get = () => { throw Error('NETWORK_FORBIDDEN'); };
}
global.fetch = async () => { throw Error('NETWORK_FORBIDDEN'); };
const fixtureKey = '1'.repeat(64);
const owner = newT.address.fromPrivateKey(fixtureKey);
const recipient = newT.address.fromPrivateKey('2'.repeat(64));
const other = newT.address.fromPrivateKey('3'.repeat(64));
const token = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const blockHeader = { ref_block_bytes: '0001', ref_block_hash: '0011223344556677', timestamp: 1793700000000, expiration: 1793700060000 };
async function exercise(T, label, root) {
  const client = new T({fullHost:'http://127.0.0.1'});
  client.fullNode.request = async () => { throw Error('UNEXPECTED_RPC'); };
  const trx = await client.transactionBuilder.sendTrx(recipient, 1000000, owner, {blockHeader});
  const trxCopy = clone(trx);
  const signed = await client.trx.sign(trxCopy, fixtureKey);
  assert.equal(signed.signature.length, 1);
  const trc = (await client.transactionBuilder.triggerSmartContract(token, 'transfer(address,uint256)', {feeLimit:50000000,txLocal:true,blockHeader}, [{type:'address',value:recipient},{type:'uint256',value:'1234567'}], owner)).transaction;
  const signedToken = await client.trx.sign(clone(trc), fixtureKey);
  const permission = {type:0,permission_name:'owner',threshold:1,keys:[{address:owner,weight:1}]};
  const active = {type:2,permission_name:'active',threshold:1,parent_id:0,operations:'7fff1fc0033e0000000000000000000000000000000000000000000000000000',keys:[{address:owner,weight:1}]};
  const update = await client.transactionBuilder.updateAccountPermissions(owner,permission,null,[active],{blockHeader});
  const signedUpdate = await client.trx.sign(clone(update),fixtureKey);
  const delegated = await client.transactionBuilder.delegateResource(1000000,recipient,'ENERGY',owner,false,undefined,{blockHeader,permissionId:2});
  const reclaimed = await client.transactionBuilder.undelegateResource(1000000,recipient,'ENERGY',owner,{blockHeader,permissionId:2});
  const signedDelegate = await client.trx.multiSign(clone(delegated),fixtureKey,2);
  const signedReclaim = await client.trx.multiSign(clone(reclaimed),fixtureKey,2);
  const withPermission = await client.transactionBuilder.sendTrx(recipient,1000000,owner,{blockHeader,permissionId:2});
  const substituted = await client.transactionBuilder.sendTrx(other,9000000,owner,{blockHeader,permissionId:2});
  let calls = 0;
  const response = tx => ({result:{},permission:{threshold:1,keys:[{address:T.address.toHex(owner).toLowerCase(),weight:1}]},approved_list:[],transaction:{transaction:clone(tx)}});
  client.trx.getSignWeight = async () => { calls++; return response(substituted); };
  let substitution;
  try {
    const changed = await client.trx.multiSign(clone(trx),fixtureKey,2);
    substitution = changed.txID === substituted.txID ? 'signed-substituted-transaction' : 'signed-other';
  } catch(e) { substitution = e.message; }
  assert.match(substitution, /Invalid transaction/);
  assert.equal(trxCopy.signature, undefined);
  client.trx.getSignWeight = async () => { calls++; return response(withPermission); };
  const refreshed = await client.trx.multiSign(clone(trx),fixtureKey,2);
  assert.equal(refreshed.txID, withPermission.txID);
  const priorCalls = calls;
  const existing = await client.trx.multiSign(clone(withPermission),fixtureKey,2);
  assert.equal(calls, priorCalls);
  assert.equal(existing.txID,withPermission.txID);
  const dateInput = clone(trx); dateInput.extraMetadata = new Date(0);
  let dateResult;
  try {await client.trx.sign(dateInput,fixtureKey);dateResult='accepted';}catch(e){dateResult=e.message;}
  assert.notEqual(dateResult, 'accepted');
  results.push({label,substitution,inputSignatureMutated:!!trxCopy.signature,plainTrxTrc20PermissionSigning:true,validMultisigRefresh:true,existingPermissionSkipsRefresh:true,dateResult});
  return {signed,signedToken,signedUpdate,signedDelegate,signedReclaim};
}
(async()=>{
  const words = newB.entropyToMnemonic(Buffer.alloc(16));
  assert.equal(words, Array(11).fill('abandon').concat('about').join(' '));
  assert(newB.validateMnemonic(words));
  const malformed='00'.repeat(16)+'zz'+'11'.repeat(15);

  assert.throws(()=>newB.entropyToMnemonic(malformed));
  assert.throws(()=>newB.setDefaultWordlist('__proto__'));
  await exercise(newT, '6.5.1');
  console.log('Dependency security regressions passed: mnemonic validation, TRX/TRC20, permissions, delegation, substitution rejection and immutable signing.');
})().catch(e=>{console.error(e);process.exitCode=1;});
