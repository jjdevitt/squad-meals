#!/usr/bin/env node
import path from 'node:path';
import { OllamaClient } from './ollama.js';
import { SquadMealsEngine } from './squad-engine.js';
import { SquadMealsTui } from './tui.js';
function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') {
            args.help = true;
        }
        else if ((arg === '--model' || arg === '-m') && argv[i + 1]) {
            args.model = argv[++i];
        }
        else if (arg.startsWith('--model=')) {
            args.model = arg.slice('--model='.length);
        }
        else if ((arg === '--host' || arg === '-H') && argv[i + 1]) {
            args.host = argv[++i];
        }
        else if (arg.startsWith('--host=')) {
            args.host = arg.slice('--host='.length);
        }
        else if ((arg === '--output' || arg === '-o') && argv[i + 1]) {
            args.outputDir = path.resolve(process.cwd(), argv[++i]);
        }
        else if (arg.startsWith('--output=')) {
            args.outputDir = path.resolve(process.cwd(), arg.slice('--output='.length));
        }
        else if ((arg === '--prompt' || arg === '-p') && argv[i + 1]) {
            args.prompt = argv[++i];
        }
        else if (arg.startsWith('--prompt=')) {
            args.prompt = arg.slice('--prompt='.length);
        }
        else if (arg === '--once') {
            args.once = true;
        }
        else if (!arg.startsWith('-') && !args.prompt) {
            args.prompt = arg;
        }
    }
    return args;
}
function printHelp() {
    console.log(`
Squad Meals CLI — Multi-Agent Meal Planner (@bradygaster/squad-sdk + Local Ollama)

Usage:
  npm start [-- [options]]
  npx tsx src/index.ts [options]

Options:
  -m, --model <name>     Ollama model to use (default: auto-detect first local model or $OLLAMA_MODEL)
  -H, --host <url>       Local Ollama server URL (default: http://127.0.0.1:11434 or $OLLAMA_HOST)
  -o, --output <dir>     Directory for Markdown output files (default: ./output)
  -p, --prompt "<text>"  Initial meal planning prompt to run immediately on launch
      --once             Run the initial --prompt once and exit after Scribe finishes
  -h, --help             Show this help message

Interactive TUI Commands:
  <any text>             Submit a meal planning prompt to the 4-agent Squad pipeline
  /model <name>          Switch active Ollama model
  /models                List available local Ollama models
  /clear                 Clear logs and reset agent status
  /help                  Show interactive help
  /quit                  Exit the TUI (or press Ctrl+C)
`);
}
async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        process.exit(0);
    }
    const ollama = new OllamaClient(args.host, args.model);
    let tui = null;
    const engine = new SquadMealsEngine({
        ollama,
        outputDir: args.outputDir,
        callbacks: {
            onAgentUpdate: () => {
                tui?.render();
            },
            onLog: (msg) => {
                tui?.addLog(msg);
            },
        },
    });
    await engine.initializeSquadFiles();
    tui = new SquadMealsTui(engine);
    await tui.start(args.prompt);
    if (args.once && args.prompt) {
        setTimeout(() => {
            tui?.shutdown();
        }, 500);
    }
}
main().catch((err) => {
    console.error('Fatal error starting Squad Meals CLI:', err);
    process.exit(1);
});
