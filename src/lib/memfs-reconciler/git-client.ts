/**
 * Git client for memFS bare-repo operations.
 *
 * Shells out to system `git` via child_process.execFile (no shell expansion,
 * no injection surface). All operations target the bare repo served by the
 * memfs-sidecar via the Letta server's /v1/git/<agent_id>/state.git proxy.
 *
 * On the VPS:
 *   Letta server (8283) --proxies--> memfs-sidecar (8285) --serves--> bare repos
 *
 * From lettactl's POV, we just talk to Letta's /v1/git/ endpoint and the
 * server handles the sidecar plumbing transparently.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execFileAsync = promisify(execFile);

export interface GitClientOptions {
  baseUrl: string; // e.g., http://localhost:8283
  authToken: string | null; // Bearer for SECURE mode; null for insecure
  commitAuthor?: {
    name: string;
    email: string;
  };
}

export class GitClient {
  private readonly baseUrl: string;
  private readonly authToken: string | null;
  private readonly authorName: string;
  private readonly authorEmail: string;

  constructor(opts: GitClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.authToken = opts.authToken;
    this.authorName = opts.commitAuthor?.name ?? 'lettactl';
    this.authorEmail = opts.commitAuthor?.email ?? 'lettactl@localhost';
  }

  /**
   * The remote URL for an agent's bare repo, with auth embedded if SECURE.
   * Sidecar auto-creates bare repos on first ref-discovery, so this URL is
   * valid even before any commits exist.
   */
  bareRepoUrl(agentId: string): string {
    if (this.authToken) {
      const url = new URL(`/v1/git/${encodeURIComponent(agentId)}/state.git`, this.baseUrl);
      // Embed Bearer-equivalent in the URL for HTTPS auth.
      url.username = 'x-access-token';
      url.password = this.authToken;
      return url.toString();
    }
    return `${this.baseUrl}/v1/git/${encodeURIComponent(agentId)}/state.git`;
  }

  /**
   * Clone the bare repo into a fresh temp dir. Returns the temp dir path.
   * If the bare repo has no commits yet, clones an empty repo (master is set
   * to the next commit on first push).
   *
   * Caller is responsible for calling `cleanup(tempDir)` in a finally block.
   */
  async cloneToTemp(agentId: string): Promise<string> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lettactl-memfs-'));
    try {
      await this.runGit(['clone', this.bareRepoUrl(agentId), tempDir]);
      return tempDir;
    } catch (err) {
      // Clean up the empty temp dir we created if clone failed.
      await this.cleanup(tempDir).catch((e) => {
        // eslint-disable-next-line no-console
        console.error('[GitClient.cloneToTemp] cleanup-after-clone-failure errored:', e);
      });
      throw new Error(
        `[GitClient] git clone failed for agent ${agentId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Write the file set to `workdir`, stage all changes, commit with the given
   * message, and push. Returns the pushed commit SHA.
   *
   * Files are overwritten if they already exist; missing parent dirs are
   * created. Files NOT in `files` are left alone — caller must explicitly
   * pass the full desired file set for "replace all" semantics.
   */
  async writeCommitPush(
    workdir: string,
    files: Map<string, string>,
    commitMessage: string,
    deletedFiles: string[] = [],
  ): Promise<string> {
    if (files.size === 0 && deletedFiles.length === 0) {
      throw new Error('[GitClient.writeCommitPush] files map is empty — nothing to commit');
    }

    for (const relPath of deletedFiles) {
      const absPath = path.join(workdir, relPath);
      await fs.rm(absPath, { recursive: true, force: true });
    }

    // Write all files
    for (const [relPath, content] of files) {
      const absPath = path.join(workdir, relPath);
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, content, 'utf8');
    }

    // Stage everything that changed (new + modified)
    await this.runGit(['add', '-A'], { cwd: workdir });

    // Check whether anything is actually staged — git commit fails on empty diff.
    const { stdout: statusOut } = await this.runGit(['status', '--porcelain'], { cwd: workdir });
    if (statusOut.trim() === '') {
      // Nothing to commit. Return current HEAD so caller knows the no-op state.
      const { stdout: headSha } = await this.runGit(['rev-parse', 'HEAD'], { cwd: workdir }).catch(() => ({ stdout: '' }));
      return headSha.trim();
    }

    // Commit with explicit per-invocation author (don't depend on system git config).
    await this.runGit(
      [
        '-c',
        `user.email=${this.authorEmail}`,
        '-c',
        `user.name=${this.authorName}`,
        'commit',
        '-m',
        commitMessage,
      ],
      { cwd: workdir },
    );

    // Push to the bare repo (default remote 'origin', default branch — usually master)
    await this.runGit(['push'], { cwd: workdir });

    const { stdout: sha } = await this.runGit(['rev-parse', 'HEAD'], { cwd: workdir });
    return sha.trim();
  }

  /**
   * Return path -> blob SHA for every tracked file at HEAD of the bare repo.
   * Returns an empty Map if the bare repo has no commits yet.
   *
   * Implementation: clone to temp, `git ls-tree -r HEAD`, parse, cleanup.
   */
  async listBareRepoFiles(agentId: string): Promise<Map<string, string>> {
    let tempDir: string | null = null;
    try {
      tempDir = await this.cloneToTemp(agentId);
      const { stdout } = await this.runGit(['ls-tree', '-r', 'HEAD'], { cwd: tempDir }).catch(() => ({
        stdout: '',
      })); // No commits yet = empty
      const out = new Map<string, string>();
      for (const line of stdout.split('\n')) {
        // Format: <mode> <type> <sha>\t<path>
        const m = line.match(/^\d+ blob ([a-f0-9]+)\t(.+)$/);
        if (m) out.set(m[2], m[1]);
      }
      return out;
    } finally {
      if (tempDir) {
        await this.cleanup(tempDir).catch((e) => {
          // eslint-disable-next-line no-console
          console.error('[GitClient.listBareRepoFiles] cleanup errored:', e);
        });
      }
    }
  }

  async cleanup(tempDir: string): Promise<void> {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  private async runGit(
    args: string[],
    opts: { cwd?: string } = {},
  ): Promise<{ stdout: string; stderr: string }> {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }; // Never prompt for credentials
    try {
      const result = await execFileAsync('git', args, {
        cwd: opts.cwd,
        env,
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout: result.stdout.toString(), stderr: result.stderr.toString() };
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stdout?: Buffer; stderr?: Buffer };
      const stderr = e.stderr?.toString() ?? '';
      throw new Error(
        `git ${args.filter((a) => !a.includes('@')).join(' ')} failed: ${e.message}\n${stderr}`,
      );
    }
  }
}
