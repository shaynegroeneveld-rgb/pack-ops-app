import { cp, mkdir } from 'node:fs/promises';
// Keep prior hashed assets available for already-open tabs during an update.
const source = new URL('../takeoff-editor/dist/', import.meta.url);
const target = new URL('../public/takeoff/', import.meta.url);
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
