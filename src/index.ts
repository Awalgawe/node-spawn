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
 * Result of a child process execution.
 */
export interface RunResult {
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
 * // Basic usage
 * const result = await spawn('ls', ['-la']);
 * console.log('Exit code:', result.code);
 *
 * // With output handling
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
export default function spawn(
  command: string,
  args: string[] = [],
  { onStdOut, onStdErr, signal }: RunOptions = {}
) {
  return new Promise<RunResult>((resolve, reject) => {
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

    // Store callback references for proper cleanup
    const stdoutHandler = onStdOut
      ? (chunk: Buffer) => onStdOut(chunk, abort)
      : undefined;
    const stderrHandler = onStdErr
      ? (chunk: Buffer) => onStdErr(chunk, abort)
      : undefined;

    if (stdoutHandler) child.stdout.on("data", stdoutHandler);
    if (stderrHandler) child.stderr.on("data", stderrHandler);

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
      if (stdoutHandler) child.stdout.off("data", stdoutHandler);
      if (stderrHandler) child.stderr.off("data", stderrHandler);
      if (signal) signal.removeEventListener("abort", abortHandler);
      child.off("close", onClose);
      child.off("error", onError);
    }

    function onClose(code: number | null, signal: NodeJS.Signals | null) {
      cleanup();

      if (code === 0 && signal === null) {
        resolve({ code, signal });
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
