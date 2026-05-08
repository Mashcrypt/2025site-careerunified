import { existsSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const appDir = resolve(rootDir, 'resume-builder');
const distDir = resolve(appDir, 'dist');
const outputDir = resolve(rootDir, 'cv-generator');
const npmCmd = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
const npmPrefixArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm'] : [];

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

if (!existsSync(resolve(appDir, 'node_modules'))) {
  run(npmCmd, [...npmPrefixArgs, 'install'], appDir);
}

run(npmCmd, [...npmPrefixArgs, 'run', 'build'], appDir);

if (!existsSync(distDir)) {
  throw new Error('resume-builder/dist was not created by the CV generator build.');
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(distDir, outputDir, { recursive: true });

console.log('CV generator built at /cv-generator/');
