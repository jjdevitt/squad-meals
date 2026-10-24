import readline from 'node:readline';
import path from 'node:path';
import type { AgentId, AgentRuntimeState, SquadPipelineResult } from './types.js';
import type { SquadMealsEngine } from './squad-engine.js';

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  cyan: '\x1b[36m',
  brightCyan: '\x1b[96m',
  green: '\x1b[32m',
  brightGreen: '\x1b[92m',
  yellow: '\x1b[33m',
  brightYellow: '\x1b[93m',
  magenta: '\x1b[35m',
  brightMagenta: '\x1b[95m',
  blue: '\x1b[34m',
  brightBlue: '\x1b[94m',
  red: '\x1b[31m',
  brightRed: '\x1b[91m',
  white: '\x1b[97m',
  gray: '\x1b[90m',
  bgBlue: '\x1b[44m',
  bgDark: '\x1b[48;5;235m',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  altScreenOn: '\x1b[?1049h',
  altScreenOff: '\x1b[?1049l',
  clearScreen: '\x1b[2J\x1b[H',
  home: '\x1b[H',
};

const AGENT_ASCII: Record<
  AgentId,
  {
    idle: string[];
    processing: string[][];
    done: string[];
    error: string[];
  }
> = {
  'meal-planner': {
    idle: [
      '    .---.    ',
      '   (     )   ',
      '    |===|    ',
      '   ( - - )   ',
      '    \\ _ /    ',
      '   /|___|\\   ',
    ],
    processing: [
      [
        '  * .---. !  ',
        '   ( ~~~ )   ',
        '    |===|    ',
        '   ( O o ) ? ',
        '    \\ o /    ',
        '  ~\\|___|/>  ',
      ],
      [
        '  ! .---. *  ',
        '   (  ~  )   ',
        '    |===|    ',
        '   ( o O ) ! ',
        '    \\ O /    ',
        '   <|___|/ ~ ',
      ],
      [
        '    .---. ~  ',
        '   ( ~~~ )   ',
        '    |===|    ',
        '   ( ^ ^ ) * ',
        '    \\ v /    ',
        '   /|___|\\*  ',
      ],
    ],
    done: [
      '    .---.    ',
      '   (     )   ',
      '    |===|    ',
      '   ( ^ ^ ) v ',
      '    \\ w /    ',
      '   /|___|\\   ',
    ],
    error: [
      '    .---.    ',
      '   (     )   ',
      '    |===|    ',
      '   ( x x ) ! ',
      '    \\ ~ /    ',
      '   /|___|\\   ',
    ],
  },
  researcher: {
    idle: [
      '    .===.    ',
      '   /_____\\   ',
      '   | - - |   ',
      '   |  _  |(o)',
      '   /|___|\\ / ',
      '    |   |    ',
    ],
    processing: [
      [
        '  ? .===.    ',
        '   /_____\\   ',
        '   | O O |(Q)',
        '   |  o  | / ',
        '   /|___|/   ',
        '   /  ?  \\   ',
      ],
      [
        '    .===. ?  ',
        '   /_____\\(Q)',
        '   | 0 0 | / ',
        '   |  ~  |/  ',
        '   /|___|\\   ',
        '   \\  !  /   ',
      ],
      [
        '  * .===. !  ',
        '   /_____\\   ',
        '   | @ @ |(@)',
        '   |  O  | \\ ',
        '   /|___|\\   ',
        '    | * |    ',
      ],
    ],
    done: [
      '    .===.    ',
      '   /_____\\   ',
      '   | ^ ^ |(v)',
      '   |  v  | / ',
      '   /|___|\\   ',
      '    |   |    ',
    ],
    error: [
      '    .===.    ',
      '   /_____\\   ',
      '   | x x |(!)',
      '   |  ~  | / ',
      '   /|___|\\   ',
      '    |   |    ',
    ],
  },
  shopper: {
    idle: [
      '    _===_    ',
      '   ( - - )   ',
      '    \\ _ /  _ ',
      '   /|___|\\|#|',
      '    |   | |_|',
      '    d   b o o',
    ],
    processing: [
      [
        '  + _===_    ',
        '   ( O O )   ',
        '    \\ o / [+]',
        '   /|___|\\|#|',
        '    /   \\ |_|',
        '    d   b o o',
      ],
      [
        '    _===_ +  ',
        '   ( > < )   ',
        '    \\ O / [*]',
        '   /|___|\\|#|',
        '    \\   / |_|',
        '    d   b o o',
      ],
      [
        '  * _===_ $  ',
        '   ( ^ O )   ',
        '    \\ v / [#]',
        '   /|___|\\|#|',
        '    |   | |_|',
        '    d   b o o',
      ],
    ],
    done: [
      '    _===_    ',
      '   ( ^ ^ ) v ',
      '    \\ v / [=]',
      '   /|___|\\|#|',
      '    |   | |_|',
      '    d   b o o',
    ],
    error: [
      '    _===_    ',
      '   ( x x ) ! ',
      '    \\ ~ / [!]',
      '   /|___|\\|#|',
      '    |   | |_|',
      '    d   b o o',
    ],
  },
  scribe: {
    idle: [
      '    /~~~\\    ',
      '   ( - - )  /',
      '    \\ _ /  / ',
      '   /|___|\\*  ',
      '   [=====]   ',
      '   |_____|   ',
    ],
    processing: [
      [
        '  ~ /~~~\\    ',
        '   ( O O ) /\\',
        '    \\ ~ / // ',
        '   /|___|\\*  ',
        '   [==#==]   ',
        '   |~~_~~|   ',
      ],
      [
        '    /~~~\\ ~  ',
        '   ( - O ) / ',
        '    \\ o / // ',
        '   /|___|\\*  ',
        '   [=#=#=]   ',
        '   |_~~~_|   ',
      ],
      [
        '  * /~~~\\ !  ',
        '   ( O - )  /',
        '    \\ ~ /  / ',
        '   /|___|\\*  ',
        '   [#####]   ',
        '   |=====|   ',
      ],
    ],
    done: [
      '    /~~~\\    ',
      '   ( ^ ^ ) v ',
      '    \\ v /  / ',
      '   /|___|\\*  ',
      '   [=MD==]   ',
      '   |_____|   ',
    ],
    error: [
      '    /~~~\\    ',
      '   ( x x ) ! ',
      '    \\ ~ /  / ',
      '   /|___|\\*  ',
      '   [=ERR=]   ',
      '   |_____|   ',
    ],
  },
};

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function padVisible(str: string, width: number): string {
  const visibleLen = stripAnsi(str).length;
  if (visibleLen >= width) {
    return truncateVisible(str, width);
  }
  return str + ' '.repeat(width - visibleLen);
}

function truncateVisible(str: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  const plain = stripAnsi(str);
  if (plain.length <= maxWidth) return str;
  if (maxWidth <= 3) return plain.slice(0, maxWidth);
  return plain.slice(0, maxWidth - 1) + '…';
}

function centerVisible(str: string, width: number): string {
  const visibleLen = stripAnsi(str).length;
  if (visibleLen >= width) return truncateVisible(str, width);
  const left = Math.floor((width - visibleLen) / 2);
  const right = width - visibleLen - left;
  return ' '.repeat(left) + str + ' '.repeat(right);
}

function wrapText(text: string, maxWidth: number): string[] {
  if (maxWidth <= 4) return [text.slice(0, Math.max(1, maxWidth))];
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxWidth) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

export class SquadMealsTui {
  private engine: SquadMealsEngine;
  private inputBuffer = '';
  private cursorPos = 0;
  private animFrame = 0;
  private animTimer: NodeJS.Timeout | null = null;
  private isBusy = false;
  private statusBanner = 'Initializing Squad Meals...';
  private modelStatus = 'Detecting local Ollama model...';
  private recentLogs: string[] = [];
  private lastResult: SquadPipelineResult | null = null;
  private running = false;

  constructor(engine: SquadMealsEngine) {
    this.engine = engine;
  }

  public addLog(message: string): void {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    this.recentLogs.push(`[${time}] ${message}`);
    if (this.recentLogs.length > 20) {
      this.recentLogs.shift();
    }
    this.render();
  }

  public setStatusBanner(banner: string): void {
    this.statusBanner = banner;
    this.render();
  }

  public setModelStatus(status: string): void {
    this.modelStatus = status;
    this.render();
  }

  public async start(initialPrompt?: string): Promise<void> {
    this.running = true;

    // Enter alternate screen buffer if interactive TTY
    if (process.stdout.isTTY) {
      process.stdout.write(ANSI.altScreenOn + ANSI.clearScreen + ANSI.hideCursor);
    }

    // Start animation ticker for active processing agents
    this.animTimer = setInterval(() => {
      const anyProcessing = this.engine.getAgents().some((a) => a.status === 'processing');
      if (anyProcessing) {
        this.animFrame = (this.animFrame + 1) % 3;
        this.render();
      }
    }, 240);

    process.stdout.on('resize', () => {
      if (process.stdout.isTTY) {
        process.stdout.write(ANSI.clearScreen);
      }
      this.render();
    });

    this.setupKeyboardInput();
    this.render();

    // Check Ollama connection on startup
    const resolved = await this.engine.ollama.resolveModel();
    if (resolved.online) {
      this.setModelStatus(
        `Ollama Online (${this.engine.ollama.host}) • Active Model: ${resolved.model} (${resolved.availableModels.length} available)`
      );
      this.setStatusBanner(
        'Enter a meal planning prompt below and press [Enter] (or type /help, /model <name>, /quit)'
      );
      this.addLog(`Connected to local Ollama. Using model "${resolved.model}".`);
    } else {
      this.setModelStatus(
        `Ollama Offline (${this.engine.ollama.host}) • Fallback Model: ${resolved.model}`
      );
      this.setStatusBanner(
        `Warning: ${resolved.error || 'Cannot reach Ollama'}. Start 'ollama serve' or use /model <name>.`
      );
      this.addLog(`Ollama warning: ${resolved.error}`);
    }

    if (initialPrompt) {
      await this.submitPrompt(initialPrompt);
    }
  }

  private setupKeyboardInput(): void {
    if (!process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin });
      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (trimmed) {
          void this.submitPrompt(trimmed);
        }
      });
      return;
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    process.stdin.on('keypress', (str: string | undefined, key: readline.Key) => {
      if (!key) return;

      if ((key.ctrl && key.name === 'c') || (key.ctrl && key.name === 'd')) {
        this.shutdown();
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        const submitted = this.inputBuffer.trim();
        this.inputBuffer = '';
        this.cursorPos = 0;
        this.render();
        if (submitted) {
          void this.submitPrompt(submitted);
        }
        return;
      }

      if (key.name === 'backspace') {
        if (this.cursorPos > 0) {
          this.inputBuffer =
            this.inputBuffer.slice(0, this.cursorPos - 1) + this.inputBuffer.slice(this.cursorPos);
          this.cursorPos -= 1;
          this.render();
        }
        return;
      }

      if (key.name === 'delete') {
        if (this.cursorPos < this.inputBuffer.length) {
          this.inputBuffer =
            this.inputBuffer.slice(0, this.cursorPos) + this.inputBuffer.slice(this.cursorPos + 1);
          this.render();
        }
        return;
      }

      if (key.name === 'left') {
        if (this.cursorPos > 0) {
          this.cursorPos -= 1;
          this.render();
        }
        return;
      }

      if (key.name === 'right') {
        if (this.cursorPos < this.inputBuffer.length) {
          this.cursorPos += 1;
          this.render();
        }
        return;
      }

      if (key.name === 'home' || (key.ctrl && key.name === 'a')) {
        this.cursorPos = 0;
        this.render();
        return;
      }

      if (key.name === 'end' || (key.ctrl && key.name === 'e')) {
        this.cursorPos = this.inputBuffer.length;
        this.render();
        return;
      }

      if (key.ctrl && key.name === 'u') {
        this.inputBuffer = '';
        this.cursorPos = 0;
        this.render();
        return;
      }

      if (str && !key.ctrl && !key.meta && str >= ' ') {
        this.inputBuffer =
          this.inputBuffer.slice(0, this.cursorPos) + str + this.inputBuffer.slice(this.cursorPos);
        this.cursorPos += str.length;
        this.render();
      }
    });
  }

  private async submitPrompt(input: string): Promise<void> {
    if (input === '/quit' || input === '/exit' || input === 'quit' || input === 'exit') {
      this.shutdown();
      return;
    }

    if (input === '/clear') {
      this.recentLogs = [];
      this.engine.resetAgentsForRun();
      this.setStatusBanner('Cleared display state. Ready for next meal planning request.');
      return;
    }

    if (input === '/help') {
      this.addLog(
        'Commands: /model <name> (switch Ollama model), /models (list installed models), /clear (reset), /quit (exit).'
      );
      this.setStatusBanner(
        'Example prompt: "Plan 3 healthy Mediterranean dinners for 4 people using chicken, garlic, and spinach"'
      );
      return;
    }

    if (input === '/models') {
      try {
        const models = await this.engine.ollama.listModels();
        const names = models.map((m) => m.name).join(', ') || 'None installed';
        this.addLog(`Available local Ollama models: ${names}`);
        this.setStatusBanner(`Installed Ollama models: ${names}`);
      } catch (err) {
        this.addLog(`Error listing models: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    if (input.startsWith('/model ')) {
      const newModel = input.slice(7).trim();
      if (newModel) {
        this.engine.ollama.setModel(newModel);
        this.setModelStatus(`Ollama Host: ${this.engine.ollama.host} • Active Model: ${newModel}`);
        this.addLog(`Switched active Ollama model to "${newModel}".`);
      }
      return;
    }

    if (this.isBusy) {
      this.addLog('Squad is currently processing a meal plan. Please wait for Scribe to finish.');
      return;
    }

    this.isBusy = true;
    this.setStatusBanner(`Running Squad pipeline for: "${input}"`);
    this.addLog(`User Prompt: "${input}"`);

    try {
      const result = await this.engine.runPipeline(input);
      this.lastResult = result;
      const relShop = path.relative(process.cwd(), result.scribeOutput.shoppingListFile);
      const relRecipes = result.scribeOutput.recipeFiles.map((f) => path.relative(process.cwd(), f));
      this.setStatusBanner(
        `Complete! Wrote ${relRecipes.length} recipe MD file(s) & ${relShop}. Enter another prompt or /quit.`
      );
      this.addLog(`Pipeline finished! Shopping list -> ${relShop}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatusBanner(`Error: ${msg}`);
      this.addLog(`Pipeline error: ${msg}`);
    } finally {
      this.isBusy = false;
      this.render();
    }
  }

  public render(): void {
    if (!this.running) return;

    const termWidth = Math.max(80, process.stdout.columns || 110);
    const termHeight = Math.max(28, process.stdout.rows || 34);
    const innerWidth = termWidth - 4;

    const lines: string[] = [];

    // =========================================================================
    // 1. TOP HEADER BAR
    // =========================================================================
    const topBorder = `${ANSI.cyan}╔${'═'.repeat(termWidth - 2)}╗${ANSI.reset}`;
    const titleText = `${ANSI.bold}${ANSI.brightCyan}SQUAD MEALS CLI${ANSI.reset} ${ANSI.gray}•${ANSI.reset} ${ANSI.white}Multi-Agent Meal Planner (@bradygaster/squad-sdk + Ollama)${ANSI.reset}`;
    const modelLine = `${ANSI.yellow}${truncateVisible(this.modelStatus, innerWidth)}${ANSI.reset}`;
    const midSep = `${ANSI.cyan}╠${'═'.repeat(termWidth - 2)}╣${ANSI.reset}`;

    lines.push(topBorder);
    lines.push(`${ANSI.cyan}║${ANSI.reset} ${padVisible(titleText, innerWidth)} ${ANSI.cyan}║${ANSI.reset}`);
    lines.push(`${ANSI.cyan}║${ANSI.reset} ${padVisible(modelLine, innerWidth)} ${ANSI.cyan}║${ANSI.reset}`);
    lines.push(midSep);

    // =========================================================================
    // 2. TOP DISPLAY AREA: 4 ASCII AGENT CARDS SIDE-BY-SIDE
    // =========================================================================
    const agents = this.engine.getAgents();
    const colGap = 1;
    const colWidth = Math.max(17, Math.floor((innerWidth - colGap * 3) / 4));

    const getAgentColors = (agent: AgentRuntimeState) => {
      if (agent.status === 'processing') {
        return {
          border: ANSI.brightYellow + ANSI.bold,
          avatar: ANSI.brightYellow + ANSI.bold,
          badge: `${ANSI.bgBlue}${ANSI.white}${ANSI.bold} ⚙ ${agent.statusLabel} ${ANSI.reset}`,
          title: `${ANSI.brightYellow}${ANSI.bold}${agent.name}${ANSI.reset}`,
        };
      }
      if (agent.status === 'done') {
        return {
          border: ANSI.brightGreen,
          avatar: ANSI.brightGreen,
          badge: `${ANSI.brightGreen}${ANSI.bold}✓ ${agent.statusLabel}${ANSI.reset}`,
          title: `${ANSI.brightGreen}${ANSI.bold}${agent.name}${ANSI.reset}`,
        };
      }
      if (agent.status === 'error') {
        return {
          border: ANSI.brightRed,
          avatar: ANSI.brightRed,
          badge: `${ANSI.brightRed}${ANSI.bold}✗ ${agent.statusLabel}${ANSI.reset}`,
          title: `${ANSI.brightRed}${ANSI.bold}${agent.name}${ANSI.reset}`,
        };
      }
      return {
        border: ANSI.gray,
        avatar: ANSI.cyan,
        badge: `${ANSI.gray}• ${agent.statusLabel}${ANSI.reset}`,
        title: `${ANSI.white}${ANSI.bold}${agent.name}${ANSI.reset}`,
      };
    };

    const cardLinesByAgent: string[][] = agents.map((agent) => {
      const colors = getAgentColors(agent);
      const boxInner = colWidth - 2;
      const artSet = AGENT_ASCII[agent.id];
      const rawArt =
        agent.status === 'processing'
          ? artSet.processing[this.animFrame % artSet.processing.length]
          : agent.status === 'done'
          ? artSet.done
          : agent.status === 'error'
          ? artSet.error
          : artSet.idle;

      const cLines: string[] = [];
      cLines.push(`${colors.border}┌${'─'.repeat(boxInner)}┐${ANSI.reset}`);
      cLines.push(
        `${colors.border}│${ANSI.reset}${centerVisible(colors.title, boxInner)}${colors.border}│${ANSI.reset}`
      );
      cLines.push(
        `${colors.border}│${ANSI.reset}${centerVisible(`${ANSI.gray}${agent.handle}${ANSI.reset}`, boxInner)}${colors.border}│${ANSI.reset}`
      );

      for (const artRow of rawArt) {
        cLines.push(
          `${colors.border}│${ANSI.reset}${colors.avatar}${centerVisible(artRow, boxInner)}${ANSI.reset}${colors.border}│${ANSI.reset}`
        );
      }

      cLines.push(`${colors.border}├${'─'.repeat(boxInner)}┤${ANSI.reset}`);
      cLines.push(
        `${colors.border}│${ANSI.reset}${centerVisible(colors.badge, boxInner)}${colors.border}│${ANSI.reset}`
      );
      cLines.push(`${colors.border}└${'─'.repeat(boxInner)}┘${ANSI.reset}`);
      return cLines;
    });

    const cardHeight = cardLinesByAgent[0].length;
    for (let r = 0; r < cardHeight; r++) {
      const rowStr = cardLinesByAgent.map((col) => col[r]).join(' '.repeat(colGap));
      lines.push(`${ANSI.cyan}║${ANSI.reset} ${padVisible(rowStr, innerWidth)} ${ANSI.cyan}║${ANSI.reset}`);
    }

    lines.push(midSep);

    // =========================================================================
    // 3. AGENT FEEDBACK, CONSIDERATIONS & STATUS PANEL (BELOW ASCII AVATARS)
    // =========================================================================
    const sectionHeader = `${ANSI.bold}${ANSI.brightMagenta}AGENT FEEDBACK, CONSIDERATIONS & LIVE STATUS${ANSI.reset}`;
    lines.push(`${ANSI.cyan}║${ANSI.reset} ${padVisible(sectionHeader, innerWidth)} ${ANSI.cyan}║${ANSI.reset}`);

    for (const agent of agents) {
      const isProc = agent.status === 'processing';
      const isDone = agent.status === 'done';
      const indicator = isProc
        ? `${ANSI.brightYellow}▶ [ACTIVE]${ANSI.reset}`
        : isDone
        ? `${ANSI.brightGreen}✓ [DONE]  ${ANSI.reset}`
        : `${ANSI.gray}• [IDLE]  ${ANSI.reset}`;

      const nameCol = padVisible(`${ANSI.bold}${agent.name}${ANSI.reset}`, 14);
      const considerText = truncateVisible(
        agent.consideration,
        Math.max(20, innerWidth - 28)
      );
      const considerColor = isProc ? ANSI.brightYellow : isDone ? ANSI.white : ANSI.gray;

      lines.push(
        `${ANSI.cyan}║${ANSI.reset} ${padVisible(
          `${indicator} ${nameCol} ${considerColor}${considerText}${ANSI.reset}`,
          innerWidth
        )} ${ANSI.cyan}║${ANSI.reset}`
      );

      // Show up to 2 feedback/detail lines below each agent's status row
      const fbLines = agent.feedbackLines.slice(0, 2);
      for (const fb of fbLines) {
        const wrapped = wrapText(fb, Math.max(20, innerWidth - 6))[0] || '';
        const fbFormatted = `    ${ANSI.dim}└─${ANSI.reset} ${
          isProc ? ANSI.brightCyan : ANSI.gray
        }${wrapped}${ANSI.reset}`;
        lines.push(`${ANSI.cyan}║${ANSI.reset} ${padVisible(fbFormatted, innerWidth)} ${ANSI.cyan}║${ANSI.reset}`);
      }
    }

    lines.push(midSep);

    // =========================================================================
    // 4. SQUAD ACTIVITY & OUTPUT LOG
    // =========================================================================
    const remainingRows = Math.max(2, termHeight - lines.length - 5);
    const visibleLogs = this.recentLogs.slice(-remainingRows);
    while (visibleLogs.length < remainingRows) {
      visibleLogs.unshift('');
    }

    for (const logLine of visibleLogs) {
      const formattedLog = logLine
        ? `${ANSI.gray}${truncateVisible(logLine, innerWidth)}${ANSI.reset}`
        : '';
      lines.push(`${ANSI.cyan}║${ANSI.reset} ${padVisible(formattedLog, innerWidth)} ${ANSI.cyan}║${ANSI.reset}`);
    }

    // =========================================================================
    // 5. BOTTOM USER INTERACTION / PROMPT INPUT AREA
    // =========================================================================
    lines.push(midSep);

    const statusLine = `${ANSI.brightCyan}Status:${ANSI.reset} ${truncateVisible(
      this.statusBanner,
      innerWidth - 8
    )}`;
    lines.push(`${ANSI.cyan}║${ANSI.reset} ${padVisible(statusLine, innerWidth)} ${ANSI.cyan}║${ANSI.reset}`);

    const promptPrefix = `${ANSI.bold}${ANSI.brightGreen}Prompt > ${ANSI.reset}`;
    const prefixLen = 9;
    const maxInputVis = Math.max(10, innerWidth - prefixLen - 2);

    let visibleInput = this.inputBuffer;
    let cursorOffset = this.cursorPos;
    if (visibleInput.length > maxInputVis) {
      const start = Math.max(0, this.cursorPos - maxInputVis + 2);
      visibleInput = visibleInput.slice(start, start + maxInputVis);
      cursorOffset = this.cursorPos - start;
    }

    const beforeCursor = visibleInput.slice(0, cursorOffset);
    const atCursorChar = visibleInput[cursorOffset] || ' ';
    const afterCursor = visibleInput.slice(cursorOffset + 1);
    const renderedInput = `${ promptPrefix }${ANSI.white}${beforeCursor}\x1b[7m${atCursorChar}\x1b[27m${afterCursor}${ANSI.reset}`;

    lines.push(`${ANSI.cyan}║${ANSI.reset} ${padVisible(renderedInput, innerWidth)} ${ANSI.cyan}║${ANSI.reset}`);
    lines.push(`${ANSI.cyan}╚${'═'.repeat(termWidth - 2)}╝${ANSI.reset}`);

    process.stdout.write(ANSI.home + lines.join('\n'));
  }

  public shutdown(): void {
    this.running = false;
    if (this.animTimer) {
      clearInterval(this.animTimer);
      this.animTimer = null;
    }
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    if (process.stdout.isTTY) {
      process.stdout.write(ANSI.showCursor + ANSI.altScreenOff + '\n');
    }
    if (this.lastResult) {
      console.log('\n✨ Squad Meals Session Summary:');
      console.log(`   Shopping List: ${this.lastResult.scribeOutput.shoppingListFile}`);
      for (const f of this.lastResult.scribeOutput.recipeFiles) {
        console.log(`   Recipe File:   ${f}`);
      }
    }
    process.exit(0);
  }
}
