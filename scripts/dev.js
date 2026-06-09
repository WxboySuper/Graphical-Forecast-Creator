#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const root = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const viteBin = path.join(root, 'node_modules', '.bin', isWindows ? 'vite.cmd' : 'vite');

const children = [];

const isPortFree = (port) =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });

const findFreePort = async (startPort, maxAttempts = 20) => {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = startPort + offset;
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(`No free API port found from ${startPort} to ${startPort + maxAttempts - 1}.`);
};

const start = (name, command, args, options = {}) => {
  const env = options.env || process.env;
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: isWindows && command.endsWith('.cmd'),
    ...options,
    env,
  });
  children.push(child);
  child.on('error', (error) => {
    console.error(`[dev] failed to start ${name}: ${error.message}`);
    shutdown(1);
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      return;
    }
    if (code && code !== 0) {
      console.error(`[dev] ${name} exited with code ${code}`);
      shutdown(code);
    }
  });
};

const shutdown = (code = 0) => {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const main = async () => {
  const apiPort = Number(process.env.PORT || (await findFreePort(3006)));
  const apiTarget = `http://127.0.0.1:${apiPort}`;
  if (apiPort !== 3006 && !process.env.PORT) {
    console.log(`[dev] API port 3006 is in use; using ${apiPort}.`);
  }

  const env = {
    ...process.env,
    PORT: String(apiPort),
    VITE_API_TARGET: process.env.VITE_API_TARGET || apiTarget,
  };

  start('api', process.execPath, [path.join(root, 'server', 'analytics.js')], {
    cwd: path.join(root, 'server'),
    env,
  });
  start('vite', viteBin, process.argv.slice(2), { env });
};

main().catch((error) => {
  console.error(`[dev] ${error.message}`);
  shutdown(1);
});
