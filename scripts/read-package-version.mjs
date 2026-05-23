import { readFileSync } from 'node:fs';

const path = process.argv[2] ?? 'package.json';
const version = JSON.parse(readFileSync(path, 'utf8')).version;
console.log(version);
