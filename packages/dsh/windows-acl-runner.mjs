/**
 * Node-mode trampoline for the upstream Windows ACL runner (H5).
 * Ported from dsh-plugin-desktop/src/windows-acl-runner.ts。
 * 独立 ESM 文件，被 spawn 为 `node windows-acl-runner.mjs <upstream-runner> [args...]`。
 */
import { fileURLToPath, pathToFileURL } from 'node:url';

const RUN_AS_NODE = 'ELECTRON_RUN_AS_NODE';
const RUNNER_FAILURE_EXIT = 127;
const RUNNER_SIGNATURE = 'windows-acl-run';

function removeRunAsNodeEnvironment() {
  for (const key of Object.keys(process.env)) {
    if (key.toUpperCase() === RUN_AS_NODE) delete process.env[key];
  }
}

async function main() {
  const requestedRunner = process.argv[2];
  removeRunAsNodeEnvironment();
  const expectedRunner = fileURLToPath(
    import.meta.resolve('@deepseek-ai/dsh-sandbox-windows-acl/runner'),
  );
  if (requestedRunner !== expectedRunner) {
    throw new Error('desktop trampoline received an unexpected ACL runner');
  }
  process.argv = [process.argv[0], expectedRunner, ...process.argv.slice(3)];
  await import(pathToFileURL(expectedRunner).href);
}

void main().catch((cause) => {
  const detail = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`${RUNNER_SIGNATURE}: desktop trampoline: ${detail}\n`);
  process.exitCode = RUNNER_FAILURE_EXIT;
});
