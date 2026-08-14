import {getStore} from "@netlify/blobs";

const STORE_NAME = "career-unified-private-cvs";

function store() {
  return getStore(STORE_NAME);
}

function toArrayBuffer(buffer: Buffer) {
  return Uint8Array.from(buffer).buffer;
}

export async function savePrivateCv(
  key: string,
  buffer: Buffer,
  metadata: Record<string, unknown>,
) {
  await store().set(key, toArrayBuffer(buffer), {metadata});
}

export async function readPrivateCv(key: string) {
  const data = await store().get(key, {type: "arrayBuffer", consistency: "strong"});
  return data ? Buffer.from(data) : null;
}

export async function copyPrivateCv(
  sourceKey: string,
  destinationKey: string,
  metadata: Record<string, unknown>,
) {
  const buffer = await readPrivateCv(sourceKey);
  if (!buffer) return false;
  await savePrivateCv(destinationKey, buffer, metadata);
  return true;
}

export async function deletePrivateCv(key: string) {
  if (!key) return;
  await store().delete(key);
}
