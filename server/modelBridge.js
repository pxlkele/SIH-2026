const { spawn } = require('child_process');
const path = require('path');

// On Windows, `python3` resolves to a broken Microsoft Store alias stub —
// use `python`, override with PYTHON_BIN if a machine differs.
const PYTHON_BIN = process.env.PYTHON_BIN || 'python';
const MODEL_DIR = path.join(__dirname, '..', 'model');

// Spawns one `serve_stdio.py` subprocess and speaks its JSON-per-line
// protocol (see model/README.md :: Inference API). One instance per user
// session — the subprocess holds the filter state for that session.
function spawnModelSession() {
  const proc = spawn(PYTHON_BIN, ['serve_stdio.py'], { cwd: MODEL_DIR });

  let buffer = '';
  const resultHandlers = [];
  const errorHandlers = [];

  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep the trailing partial line, if any

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch (err) {
        errorHandlers.forEach((cb) => cb(new Error(`bad JSON from model: ${trimmed}`)));
        continue;
      }
      resultHandlers.forEach((cb) => cb(parsed));
    }
  });

  proc.stderr.on('data', (chunk) => {
    errorHandlers.forEach((cb) => cb(new Error(`model stderr: ${chunk.toString()}`)));
  });

  return {
    send(sample) {
      proc.stdin.write(JSON.stringify(sample) + '\n');
    },
    onResult(cb) {
      resultHandlers.push(cb);
    },
    onError(cb) {
      errorHandlers.push(cb);
    },
    onExit(cb) {
      proc.on('exit', cb);
    },
    // Signals no more samples; serve_stdio.py exits on its own once stdin
    // closes. Use this for a clean shutdown (e.g. end of replayed log).
    end() {
      proc.stdin.end();
    },
    // Force-terminates the subprocess (e.g. client disconnected mid-session).
    kill() {
      proc.kill();
    },
  };
}

module.exports = { spawnModelSession, PYTHON_BIN, MODEL_DIR };
