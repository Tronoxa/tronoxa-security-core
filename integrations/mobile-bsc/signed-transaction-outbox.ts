import * as SecureStore from 'expo-secure-store';

const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const RAW_TRANSACTION_PATTERN = /^0x[0-9a-fA-F]+$/;
const KEY_PREFIX = 'bsc.broadcast.outbox.';
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function storeSignedBscTransaction(hash: string, rawTransaction: string): Promise<void> {
  assertHash(hash);
  if (!RAW_TRANSACTION_PATTERN.test(rawTransaction) || rawTransaction.length > 300_002) {
    throw new Error('bsc_signed_transaction_outbox_invalid');
  }
  await SecureStore.setItemAsync(key(hash), rawTransaction, SECURE_OPTIONS);
}

export async function loadSignedBscTransaction(hash: string): Promise<string | null> {
  assertHash(hash);
  const rawTransaction = await SecureStore.getItemAsync(key(hash), SECURE_OPTIONS);
  if (rawTransaction === null) return null;
  if (!RAW_TRANSACTION_PATTERN.test(rawTransaction) || rawTransaction.length > 300_002) {
    await deleteSignedBscTransaction(hash);
    return null;
  }
  return rawTransaction;
}

export async function deleteSignedBscTransaction(hash: string): Promise<void> {
  assertHash(hash);
  await SecureStore.deleteItemAsync(key(hash), SECURE_OPTIONS);
}

function key(hash: string): string {
  return `${KEY_PREFIX}${hash.slice(2).toLowerCase()}`;
}

function assertHash(hash: string): void {
  if (!HASH_PATTERN.test(hash)) throw new Error('bsc_signed_transaction_hash_invalid');
}
