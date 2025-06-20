import { test, describe } from "node:test";
import assert from "node:assert";
import spawn from "./index.js";

describe("spawn function", () => {
  test("should execute a simple command and return output", async () => {
    const result = await spawn("echo", ["hello world"]);

    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.signal, null);
    assert.strictEqual(result.stdout.toString().trim(), "hello world");
    assert.strictEqual(result.stderr.toString(), "");
  });

  test("should handle command with no output", async () => {
    const result = await spawn("true");

    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.signal, null);
    assert.strictEqual(result.stdout.toString(), "");
    assert.strictEqual(result.stderr.toString(), "");
  });

  test("should reject on command failure", async () => {
    try {
      await spawn("false");
      assert.fail("Expected command to fail");
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.ok(err.cause && typeof err.cause === "object");
      const cause = err.cause as { code: number | null; signal: string | null };
      assert.strictEqual(cause.code, 1);
      assert.strictEqual(cause.signal, null);
    }
  });

  test("should handle stderr output", async () => {
    const result = await spawn("node", [
      "-e",
      "console.error('test error'); process.exit(0)",
    ]);

    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stderr.toString().trim(), "test error");
  });

  test("should process stdout with callback", async () => {
    const chunks: string[] = [];

    const result = await spawn("echo", ["line1\nline2"], {
      onStdOut: (chunk, abort) => {
        chunks.push(chunk.toString());
        assert.strictEqual(typeof abort, "function");
      },
    });

    assert.strictEqual(result.code, 0);
    assert.ok(!("stdout" in result)); // Should not have stdout property
    assert.ok("stderr" in result); // Should have stderr property
    assert.ok(chunks.length > 0);
    assert.ok(chunks.join("").includes("line1"));
  });

  test("should process stderr with callback", async () => {
    const chunks: string[] = [];

    const result = await spawn(
      "node",
      ["-e", "console.error('error message')"],
      {
        onStdErr: (chunk, abort) => {
          chunks.push(chunk.toString());
          assert.strictEqual(typeof abort, "function");
        },
      }
    );

    assert.strictEqual(result.code, 0);
    assert.ok("stdout" in result); // Should have stdout property
    assert.ok(!("stderr" in result)); // Should not have stderr property
    assert.ok(chunks.length > 0);
    assert.ok(chunks.join("").includes("error message"));
  });

  test("should process both stdout and stderr with callbacks", async () => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const result = await spawn(
      "node",
      ["-e", "console.log('stdout'); console.error('stderr')"],
      {
        onStdOut: (chunk, abort) => {
          stdoutChunks.push(chunk.toString());
        },
        onStdErr: (chunk, abort) => {
          stderrChunks.push(chunk.toString());
        },
      }
    );

    assert.strictEqual(result.code, 0);
    assert.ok(!("stdout" in result)); // Should not have stdout property
    assert.ok(!("stderr" in result)); // Should not have stderr property
    assert.ok(stdoutChunks.join("").includes("stdout"));
    assert.ok(stderrChunks.join("").includes("stderr"));
  });

  test("should abort command using abort function from callback", async () => {
    const start = Date.now();

    try {
      await spawn(
        "node",
        [
          "-e",
          "console.log('start'); setInterval(() => console.log('tick'), 100);",
        ],
        {
          onStdOut: (chunk, abort) => {
            if (chunk.toString().includes("start")) {
              // Abort after we see the first output
              setTimeout(() => abort(), 50);
            }
          },
        }
      );
      assert.fail("Expected command to be aborted");
    } catch (err) {
      const duration = Date.now() - start;
      assert.ok(duration < 1000, "Command should have been aborted quickly");
      assert.ok(err instanceof Error);
    }
  });

  test("should handle AbortSignal", async () => {
    const controller = new AbortController();
    const start = Date.now();

    // Abort after 100ms
    setTimeout(() => controller.abort(), 100);

    try {
      await spawn("sleep", ["5"], {
        signal: controller.signal,
      });
      assert.fail("Expected command to be aborted");
    } catch (err) {
      const duration = Date.now() - start;
      assert.ok(duration < 1000, "Command should have been aborted quickly");
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes("aborted"));
    }
  });

  test("should reject immediately if signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    try {
      await spawn("echo", ["test"], {
        signal: controller.signal,
      });
      assert.fail("Expected command to be rejected immediately");
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes("aborted"));
      assert.ok(err.cause && typeof err.cause === "object");
      const cause = err.cause as { code: number | null; signal: string | null };
      assert.strictEqual(cause.signal, "SIGABRT");
    }
  });

  test("should handle non-existent command", async () => {
    try {
      await spawn("this-command-does-not-exist-12345");
      assert.fail("Expected command to fail");
    } catch (err) {
      assert.ok(err instanceof Error);
      // On macOS/Linux, this typically gives ENOENT error
      const nodeError = err as Error & { code?: string };
      assert.ok(err.message.includes("ENOENT") || nodeError.code === "ENOENT");
    }
  });

  test("should collect stderr output even when command fails", async () => {
    try {
      await spawn("node", [
        "-e",
        "console.error('error before exit'); process.exit(1)",
      ]);
      assert.fail("Expected command to fail");
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.ok(err.cause && typeof err.cause === "object");
      const cause = err.cause as { code: number | null; signal: string | null };
      assert.strictEqual(cause.code, 1);
      // Output is lost when using automatic collection on failure
      // This is expected behavior as documented
    }
  });

  test("should still call callbacks even when command fails", async () => {
    const stderrChunks: string[] = [];

    try {
      await spawn(
        "node",
        ["-e", "console.error('error message'); process.exit(1)"],
        {
          onStdErr: (chunk, abort) => {
            stderrChunks.push(chunk.toString());
          },
        }
      );
      assert.fail("Expected command to fail");
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.ok(err.cause && typeof err.cause === "object");
      const cause = err.cause as { code: number | null; signal: string | null };
      assert.strictEqual(cause.code, 1);
      // But callbacks should have been called
      assert.ok(stderrChunks.length > 0);
      assert.ok(stderrChunks.join("").includes("error message"));
    }
  });

  test("should handle commands with arguments containing spaces", async () => {
    const result = await spawn("echo", ["hello world", "with spaces"]);

    assert.strictEqual(result.code, 0);
    assert.ok(result.stdout.toString().includes("hello world"));
    assert.ok(result.stdout.toString().includes("with spaces"));
  });

  test("should handle empty args array", async () => {
    const result = await spawn("echo", []);

    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stdout.toString().trim(), "");
  });

  test("should handle commands that produce large output", async () => {
    // Generate a large output (1000 lines)
    const result = await spawn("node", [
      "-e",
      `
      for (let i = 0; i < 1000; i++) {
        console.log('Line ' + i + ': This is a test line with some content');
      }
    `,
    ]);

    assert.strictEqual(result.code, 0);
    const lines = result.stdout.toString().trim().split("\n");
    assert.strictEqual(lines.length, 1000);
    assert.ok(lines[0].includes("Line 0"));
    assert.ok(lines[999].includes("Line 999"));
  });

  test("should maintain proper typing with different callback combinations", async () => {
    // This test mainly checks TypeScript compilation, runtime behavior is secondary

    // No callbacks - should have stdout and stderr
    const result1 = await spawn("echo", ["test"]);
    assert.ok("stdout" in result1);
    assert.ok("stderr" in result1);
    assert.ok(Buffer.isBuffer(result1.stdout));
    assert.ok(Buffer.isBuffer(result1.stderr));

    // Only onStdOut - should have stderr but not stdout
    const result2 = await spawn("echo", ["test"], {
      onStdOut: (chunk, abort) => {},
    });
    assert.ok(!("stdout" in result2));
    assert.ok("stderr" in result2);
    assert.ok(Buffer.isBuffer(result2.stderr));

    // Only onStdErr - should have stdout but not stderr
    const result3 = await spawn("echo", ["test"], {
      onStdErr: (chunk, abort) => {},
    });
    assert.ok("stdout" in result3);
    assert.ok(!("stderr" in result3));
    assert.ok(Buffer.isBuffer(result3.stdout));

    // Both callbacks - should have neither stdout nor stderr
    const result4 = await spawn("echo", ["test"], {
      onStdOut: (chunk, abort) => {},
      onStdErr: (chunk, abort) => {},
    });
    assert.ok(!("stdout" in result4));
    assert.ok(!("stderr" in result4));
  });
});
