import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outputPath = resolve(process.argv[2] || 'build/version.json');
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
writeFileSync(outputPath, `${JSON.stringify({ version }, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outputPath} for ${version}`);
