import { spawn as nodeSpawn } from "node:child_process";

/**
 * Options for configuring the execution of a child process.
 */
export interface RunOptions {
  /**
   * Callback invoked when the child process writes to stdout.
   * @param chunk - The data chunk received from stdout
   * @param abort - Function to immediately terminate the child process
   */
  onStdOut?: (chunk: Buffer, abort: () => void) => void;

  /**
   * Callback invoked when the child process writes to stderr.
   * @param chunk - The data chunk received from stderr
   * @param abort - Function to immediately terminate the child process
   */
  onStdErr?: (chunk: Buffer, abort: () => void) => void;

  /**
   * AbortSignal to cancel the operation. When aborted, the child process
   * is terminated with SIGTERM and the promise rejects.
   */
  signal?: AbortSignal;
}

/**
 * Base result interface
 */
interface BaseRunResult {
  /**
   * Exit code of the child process. null if the process was terminated by a signal.
   */
  code: number | null;

  /**
   * Signal that terminated the child process. null if the process exited normally.
   */
  signal: NodeJS.Signals | null;
}

/**
 * Result with stdout and stderr data
 */
export interface RunResultWithOutput extends BaseRunResult {
  stdout: string;
  stderr: string;
}

/**
 * Result with stdout data only
 */
export interface RunResultWithStdout extends BaseRunResult {
  stdout: string;
}

/**
 * Result with stderr data only
 */
export interface RunResultWithStderr extends BaseRunResult {
  stderr: string;
}

/**
 * Result with no output data
 */
export interface RunResultWithoutOutput extends BaseRunResult {}

/**
 * Executes a child process and returns a promise that resolves with the process result.
 *
 * The promise rejects if:
 * - The process exits with a non-zero code
 * - The process is terminated by a signal
 * - An error occurs during process execution
 * - The operation is aborted via AbortSignal
 *
 * When rejected, the error includes a `cause` property with `{ code, signal }` for detailed analysis.
 *
 * @param command - The command to execute
 * @param args - Arguments to pass to the command (default: [])
 * @param options - Configuration options (default: {})
 * @returns Promise that resolves with the process exit code and signal
 *
 * @example
 * ```typescript
 * // Basic usage - get output in result
 * const result = await spawn('ls', ['-la']);
 * console.log('Files:', result.stdout);
 * console.log('Exit code:', result.code);
 *
 * // With real-time output handling
 * await spawn('grep', ['pattern', 'file.txt'], {
 *   onStdOut: (chunk) => console.log('Found:', chunk.toString())
 * });
 *
 * // With cancellation
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 5000); // 5s timeout
 * await spawn('long-running-command', [], { signal: controller.signal });
 *
 * // Error handling with cause
 * try {
 *   await spawn('grep', ['pattern', 'file.txt']);
 * } catch (err) {
 *   const { code } = err.cause;
 *   if (code === 1) console.log('No matches found');
 *   else console.log('Grep error');
 * }
 * ```
 */

// Function overloads for precise typing
export default function spawn(
  command: string,
  args?: string[]
): Promise<RunResultWithOutput>;

export default function spawn(
  command: string,
  args: string[],
  options: {
    onStdOut: (chunk: Buffer, abort: () => void) => void;
    onStdErr: (chunk: Buffer, abort: () => void) => void;
    signal?: AbortSignal;
  }
): Promise<RunResultWithoutOutput>;

export default function spawn(
  command: string,
  args: string[],
  options: {
    onStdOut: (chunk: Buffer, abort: () => void) => void;
    onStdErr?: undefined;
    signal?: AbortSignal;
  }
): Promise<RunResultWithStderr>;

export default function spawn(
  command: string,
  args: string[],
  options: {
    onStdOut?: undefined;
    onStdErr: (chunk: Buffer, abort: () => void) => void;
    signal?: AbortSignal;
  }
): Promise<RunResultWithStdout>;

export default function spawn(
  command: string,
  args: string[],
  options: { onStdOut?: undefined; onStdErr?: undefined; signal?: AbortSignal }
): Promise<RunResultWithOutput>;

export default function spawn<T extends RunOptions>(
  command: string,
  args: string[] = [],
  options: T = {} as T
): Promise<BaseRunResult> {
  const { onStdOut, onStdErr, signal } = options;
  return new Promise<BaseRunResult>((resolve, reject) => {
    // Check if already aborted
    if (signal?.aborted) {
      reject(
        new Error("Operation was aborted", {
          cause: { code: null, signal: "SIGABRT" },
        })
      );
      return;
    }

    const child = nodeSpawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const abort = () => child.kill("SIGABRT");

    // Collect output if no callbacks provided
    let stdoutData = "";
    let stderrData = "";

    // Store callback references for proper cleanup
    const stdoutHandler = onStdOut
      ? (chunk: Buffer) => onStdOut(chunk, abort)
      : (chunk: Buffer) => {
          stdoutData += chunk.toString();
        };

    const stderrHandler = onStdErr
      ? (chunk: Buffer) => onStdErr(chunk, abort)
      : (chunk: Buffer) => {
          stderrData += chunk.toString();
        };

    child.stdout.on("data", stdoutHandler);
    child.stderr.on("data", stderrHandler);

    // Handle abort signal
    const abortHandler = () => {
      child.kill("SIGTERM");
      reject(
        new Error("Operation was aborted", {
          cause: { code: null, signal: "SIGABRT" },
        })
      );
    };

    if (signal) {
      signal.addEventListener("abort", abortHandler);
    }

    function cleanup() {
      child.stdout.off("data", stdoutHandler);
      child.stderr.off("data", stderrHandler);
      if (signal) signal.removeEventListener("abort", abortHandler);
      child.off("close", onClose);
      child.off("error", onError);
    }

    function onClose(code: number | null, signal: NodeJS.Signals | null) {
      cleanup();

      const result = {
        code,
        signal,
        ...(onStdOut ? {} : { stdout: stdoutData }),
        ...(onStdErr ? {} : { stderr: stderrData }),
      } as any;

      if (code === 0 && signal === null) {
        resolve(result);
      } else {
        const message = signal
          ? `Process killed with signal: ${signal}`
          : `Process exited with code: ${code}`;

        reject(new Error(message, { cause: { code, signal } }));
      }
    }

    function onError(err: Error) {
      cleanup();
      reject(err);
    }

    child.once("close", onClose);
    child.once("error", onError);
  });
}
