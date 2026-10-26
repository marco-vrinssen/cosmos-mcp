import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const SERVICE = 'cosmos.so';

export const SETUP = [
  'Not signed in to Cosmos, so your own collections are not readable. Public elements and collections work without a sign-in.',
  'To sign in, set COSMOS_USERNAME (your email or username) and COSMOS_PASSWORD in the environment of this MCP server, then restart the MCP host.',
  'On macOS the keychain works instead, without a restart. Run this and type your Cosmos password when asked:',
  `  security add-generic-password -s ${SERVICE} -a <email or username> -w`,
].join('\n');

// The environment wins over the keychain, which is read without a shell. A missing item means signed out, not an error.
export async function findCredentials() {
  const { COSMOS_USERNAME: username, COSMOS_PASSWORD: password } = process.env;
  if (username && password) return { username, password };
  if (process.platform !== 'darwin') return null;
  try {
    const { stdout } = await run('security', ['find-generic-password', '-s', SERVICE], { timeout: 5_000 });
    const account = stdout.match(/"acct"<blob>="(.+)"/)?.[1];
    if (!account) return null;
    const { stdout: secret } = await run('security', ['find-generic-password', '-s', SERVICE, '-a', account, '-w'], { timeout: 5_000 });
    const keychainPassword = secret.replace(/\n$/, '');
    return keychainPassword ? { username: account, password: keychainPassword } : null;
  } catch {
    return null;
  }
}
