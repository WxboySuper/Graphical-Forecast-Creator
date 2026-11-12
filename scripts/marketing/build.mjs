// Placeholder until the marketing site build is added. Replace this with its real build command.
import { cp, mkdir, rm } from 'node:fs/promises';

const source = new URL('../../marketing/site/', import.meta.url);
const output = new URL('../../marketing/dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
