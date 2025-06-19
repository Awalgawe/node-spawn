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

### Process output as it comes

```typescript
import spawn from '@awalgawe/spawn';

await spawn('ping', ['-c', '5', 'google.com'], {
  onStdOut: (chunk) => {
    console.log('Ping:', chunk.toString().trim());
  },
  onStdErr: (chunk) => {
    console.error('Error:', chunk.toString().trim());
  }
});
console.log('Ping completed');
```

### Handle errors with exit codes

```typescript
try {
  await spawn('grep', ['pattern', 'nonexistent.txt']);
} catch (err) {
  const { code } = err.cause;
  if (code === 1) {
    console.log('No matches found');
  } else if (code === 2) {
    console.log('File not found or other error');
  }
}
```

### Cancel long-running commands

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

try {
  await spawn('ping', ['google.com'], { 
    signal: controller.signal,
    onStdOut: (chunk) => console.log(chunk.toString())
  });
} catch (err) {
  console.log('Command was cancelled or failed');
}
```

### Real-world example: Processing log files

```typescript
let lineBuffer = '';
const errors = [];

await spawn('tail', ['-f', 'app.log'], {
  onStdOut: (chunk) => {
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() || ''; // Keep incomplete line
    
    lines.forEach(line => {
      if (line.includes('ERROR')) {
        errors.push(line);
        console.log('Found error:', line);
      }
    });
  },
  signal: someAbortSignal
});
```

## API

### `spawn(command, args?, options?)`

Returns a promise that resolves when the process completes.

- **`command`**: Command to execute
- **`args`**: Command arguments (optional)
- **`options`**: 
  - `onStdOut(chunk, abort)`: Process stdout data as it arrives
  - `onStdErr(chunk, abort)`: Process stderr data as it arrives  
  - `signal`: AbortSignal to cancel the command

Resolves to `{ code, signal }` or rejects with error details in `error.cause`.

## Note on chunks vs lines

The `onStdOut` callback receives raw data chunks, which may not align with lines. If you need line-by-line processing, you'll need to buffer and split the data yourself (see example above).

## License

MIT
