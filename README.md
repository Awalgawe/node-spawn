# @awalgawe/spawn

A simple promise wrapper for `child_process.spawn` that lets you process output streams while waiting for completion.

## Why?

Sometimes you need to:

- Process command output line by line as it comes
- Wait for the command to finish before continuing
- Cancel long-running commands
- Handle errors properly

This is a thin wrapper that makes these common patterns easier.

## Installation

```bash
npm install @awalgawe/spawn
```

## Usage

### Get command output automatically

```typescript
import spawn from "@awalgawe/spawn";

const { stdout } = await spawn("ls", ["-la"]);
console.log("Files:", stdout.toString());
```

### Handle errors and still get output

```typescript
try {
  const { code, signal, stdout, stderr } = await spawn("grep", [
    "pattern",
    "nonexistent.txt",
  ]);
  // ...
} catch (err) {
  const { code, signal, stdout, stderr } = err.cause;
  console.log("Command failed:", err.message);
  console.log("Stdout:", stdout.toString());
  console.log("Stderr:", stderr.toString());
}

try {
  let processedStdout = "";
  let processedStderr = "";

  const { code, signal } = await spawn("grep", ["pattern", "nonexistent.txt"], {
    onStdOut: (chunk, abort) => {
      // Process output as it comes
      processedStdout += doSomething(chunk);
    },
    onStdErr: (chunk, abort) => {
      processedStderr += doSomethingElse(chunk);
    },
  });
} catch (err) {
  const { code, signal } = err.cause;
  // ...
}
```

### Process output as it comes

```typescript
import spawn from "@awalgawe/spawn";

await spawn("ping", ["-c", "5", "google.com"], {
  onStdOut: (chunk, abort) => {
    console.log("Ping:", chunk.toString().trim());
    // You can abort the process at any time
    // if (someCondition) abort();
  },
  onStdErr: (chunk, abort) => {
    console.error("Error:", chunk.toString().trim());
  },
});
console.log("Ping completed");
```

### Handle errors with exit codes

```typescript
try {
  await spawn("grep", ["pattern", "nonexistent.txt"]);
} catch (err) {
  const { code } = err.cause;
  if (code === 1) {
    console.log("No matches found");
  } else if (code === 2) {
    console.log("File not found or other error");
  }
}
```

### Cancel long-running commands

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

try {
  await spawn("ping", ["google.com"], {
    signal: controller.signal,
    onStdOut: (chunk, abort) => console.log(chunk.toString()),
  });
} catch (err) {
  console.log("Command was cancelled or failed");
}
```

### Real-world example: Processing log files

```typescript
let lineBuffer = "";
const errors = [];

await spawn("tail", ["-f", "app.log"], {
  onStdOut: (chunk, abort) => {
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split("\n");
    lineBuffer = lines.pop() || ""; // Keep incomplete line

    lines.forEach((line) => {
      if (line.includes("ERROR")) {
        errors.push(line);
        console.log("Found error:", line);

        // Optionally abort on critical errors
        if (line.includes("CRITICAL")) {
          abort();
        }
      }
    });
  },
  signal: someAbortSignal,
});
```

## TypeScript Support

The return type changes based on which callbacks you provide:

```typescript
// No callbacks → includes stdout and stderr
const result1 = await spawn("ls");
result1.stdout; // ✅ Buffer
result1.stderr; // ✅ Buffer

// With onStdOut → no stdout property
const result2 = await spawn("ls", [], { onStdOut: (chunk, abort) => {} });
result2.stdout; // ❌ TypeScript error
result2.stderr; // ✅ Buffer

// With onStdErr → no stderr property
const result3 = await spawn("ls", [], { onStdErr: (chunk, abort) => {} });
result3.stdout; // ✅ Buffer
result3.stderr; // ❌ TypeScript error

// With both callbacks → no output properties
const result4 = await spawn("ls", [], {
  onStdOut: (chunk, abort) => {},
  onStdErr: (chunk, abort) => {},
});
result4.stdout; // ❌ TypeScript error
result4.stderr; // ❌ TypeScript error
```

## API

### `spawn(command, args?, options?)`

Returns a promise that resolves when the process completes.

- **`command`**: Command to execute
- **`args`**: Command arguments (optional)
- **`options`**:
  - `onStdOut(chunk, abort)`: Process stdout data as it arrives. The `abort` function can be called to immediately terminate the process.
  - `onStdErr(chunk, abort)`: Process stderr data as it arrives. The `abort` function can be called to immediately terminate the process.
  - `signal`: AbortSignal to cancel the command

**Return type varies based on callbacks:**

- No callbacks: `{ code, signal, stdout: Buffer, stderr: Buffer }`
- With onStdOut: `{ code, signal, stderr: Buffer }`
- With onStdErr: `{ code, signal, stdout: Buffer }`
- With both: `{ code, signal }`

Rejects with error details in `error.cause` which includes `{ code, signal, stdout?: Buffer, stderr?: Buffer }`.

## License

MIT
