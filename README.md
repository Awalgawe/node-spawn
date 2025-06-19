# @awalgawe/spawn

A modern, promise-based wrapper around `child_process.spawn` with AbortSignal support and proper cleanup.

## Features

- ✅ **Promise-based**: No more callback hell
- ✅ **AbortSignal support**: Standard cancellation API
- ✅ **Proper cleanup**: No memory leaks
- ✅ **TypeScript**: Full type safety
- ✅ **Error details**: Access to exit codes and signals via `error.cause`
- ✅ **Stream handling**: Optional stdout/stderr callbacks

## Installation

```bash
npm install @awalgawe/spawn
```

## Usage

### Basic usage

```typescript
import spawn from '@awalgawe/spawn';

const result = await spawn('ls', ['-la']);
console.log('Exit code:', result.code);
```

### With output handling

```typescript
import spawn from '@awalgawe/spawn';

await spawn('grep', ['pattern', 'file.txt'], {
  onStdOut: (chunk) => console.log('Found:', chunk.toString()),
  onStdErr: (chunk) => console.error('Error:', chunk.toString())
});
```

### With cancellation (AbortSignal)

```typescript
import spawn from '@awalgawe/spawn';

const controller = new AbortController();
setTimeout(() => controller.abort(), 5000); // 5s timeout

try {
  await spawn('long-running-command', [], { 
    signal: controller.signal 
  });
} catch (err) {
  if (err.message.includes('aborted')) {
    console.log('Command was cancelled');
  }
}
```

### Error handling with detailed info

```typescript
import spawn from '@awalgawe/spawn';

try {
  await spawn('grep', ['pattern', 'file.txt']);
} catch (err) {
  const { code, signal } = err.cause;
  
  if (code === 1 && signal === null) {
    console.log('No matches found (normal)');
  } else if (code === 2) {
    console.log('Grep error');
  } else if (signal) {
    console.log(`Process killed with signal: ${signal}`);
  }
}
```

## API

### `spawn(command, args?, options?)`

Executes a child process and returns a promise.

#### Parameters

- **`command`** (string): The command to execute
- **`args`** (string[], optional): Arguments to pass to the command
- **`options`** (RunOptions, optional): Configuration options

#### Options

- **`onStdOut`** (function, optional): Callback for stdout data
  - `(chunk: Buffer, abort: () => void) => void`
- **`onStdErr`** (function, optional): Callback for stderr data
  - `(chunk: Buffer, abort: () => void) => void`
- **`signal`** (AbortSignal, optional): Signal to cancel the operation

#### Returns

Promise that resolves to `RunResult`:
- **`code`** (number | null): Exit code of the process
- **`signal`** (string | null): Signal that terminated the process

#### Error handling

The promise rejects if:
- Process exits with non-zero code
- Process is terminated by a signal
- An error occurs during execution
- Operation is aborted via AbortSignal

Rejected errors include a `cause` property with `{ code, signal }` for detailed analysis.

## Requirements

- Node.js ≥ 16.0.0 (for AbortSignal support)

## License

MIT © awalgawe
