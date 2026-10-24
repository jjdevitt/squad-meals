# Squad Meals CLI (`squad-meals`)

A multi-agent meal planning CLI and Terminal User Interface (TUI) built on the **[`bradygaster/squad`](https://github.com/bradygaster/squad)** (`@bradygaster/squad-sdk`) framework and powered by a locally running **Ollama** LLM for agent reasoning.

---

## Features & Agent Architecture

Squad Meals coordinates four specialized agents defined in [`squad.config.ts`](squad.config.ts) and repository-native `.squad/` charters:

1. **Meal Planner (`@meal-planner`)** — [`.squad/agents/meal-planner/charter.md`](.squad/agents/meal-planner/charter.md)
   - Reviews initial user meal requests, dietary preferences, and available ingredients.
   - Determines what recipes should be made and drafts the initial ingredient lists and step-by-step cooking instructions.
2. **Researcher (`@researcher`)** — [`.squad/agents/researcher/charter.md`](.squad/agents/researcher/charter.md)
   - Reviews Meal Planner's suggested recipes and searches the web (online recipe databases, community reviews, and cook comments) to verify whether the ingredients and instructions match what others are making online.
   - Evaluates whether each recipe is solid or needs tweaking, attaching detailed **Researcher Notes & Tweaks** (and any ingredient adjustments) to the recipe selection.
3. **Shopper (`@shopper`)** — [`.squad/agents/shopper/charter.md`](.squad/agents/shopper/charter.md)
   - Reviews all ingredients needed across the planned recipes (including Researcher tweaks).
   - Consolidates duplicate ingredients shared across multiple recipes into a **single item** on the shopping list with combined quantities, grouped by grocery store section.
4. **Scribe (`@scribe`)** — [`.squad/agents/scribe/charter.md`](.squad/agents/scribe/charter.md)
   - Writes the final output to disk in Markdown format:
     - **1 separate Markdown file per recipe** under `output/recipes/<recipe-slug>.md` (including ingredients, instructions, and `@researcher`'s verification notes/tweaks).
     - **1 consolidated Shopping List Markdown file** at `output/shopping-list.md` linking to each recipe file.

---

## Text User Interface (TUI) Layout

When launched, `squad-meals` opens an interactive full-screen Text User Interface divided into:

- **Top Display Area:**
  - **ASCII Agent Cards (`Meal Planner`, `Researcher`, `Shopper`, `Scribe`):** Each agent has a distinct ASCII avatar that dynamically animates and changes pose, border highlight, and status badge to indicate which agent is actively processing.
  - **Agent Feedback, Considerations & Status Panel:** Directly below the ASCII representations, each agent displays its current status, what it is actively considering, and live feedback/findings (e.g., drafted recipes, web verification tweaks, consolidated ingredient counts, and written Markdown file paths).
  - **Squad Activity Log:** Real-time event log from the `@bradygaster/squad-sdk` `RuntimeEventBus`.
- **Bottom User Interaction Area:**
  - **Interactive Prompt Box (`Prompt >`):** Enter any meal planning request at the bottom of the screen and press `Enter` to trigger the Squad pipeline.

---

## Prerequisites

1. **Node.js** `>= 22.5.0` (required by `@bradygaster/squad-sdk`)
2. **Ollama** installed and running locally (`http://127.0.0.1:11434`)
   - Install Ollama from [https://ollama.com](https://ollama.com)
   - Start the Ollama server and pull at least one local reasoning model (the CLI auto-detects your first installed model by default):
     ```bash
     ollama serve
     ollama pull llama3.2
     ```

---

## Installation

1. Clone or navigate to the project directory:
   ```bash
   cd /Users/jamardevitt/dev/ollama/squad-meals
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. *(Optional)* Build the TypeScript source to `dist/`:
   ```bash
   npm run build
   ```

---

## Running the Program

### 1. Launch the Interactive TUI (Default)
```bash
npm start
```
*(Or run `npx tsx src/index.ts` / `node dist/src/index.js` after building.)*

Once inside the TUI, type a prompt in the bottom input bar and press **Enter**, for example:
```text
Plan 3 weeknight dinners for 4 people using chicken, garlic, lemon, and spinach
```

### 2. Specify a Local Ollama Model or Host
By default, `squad-meals` auto-detects the first available model on your local Ollama instance. You can override it via CLI flag or environment variable:
```bash
# Via CLI flag
npm start -- --model llama3.2

# Via environment variable
OLLAMA_MODEL=mistral npm start
```

### 3. Run with an Initial Prompt from the Command Line
You can pass an initial prompt directly on startup (and optionally `--once` to exit automatically after `Scribe` finishes writing the Markdown files):
```bash
# Launch TUI and immediately start planning
npm start -- --prompt "Plan 2 cozy Italian pasta dinners that share fresh herbs and garlic"

# Run once and exit after writing output files
npm start -- --prompt "Plan 2 healthy Mexican taco bowls" --once
```

---

## Interactive TUI Slash Commands

At the bottom `Prompt >` input bar, you can enter any natural-language meal request or use these built-in commands:

| Command | Description |
| :--- | :--- |
| `/models` | List all models currently installed in your local Ollama instance |
| `/model <name>` | Switch the active Ollama model on the fly (e.g. `/model llama3.2`) |
| `/clear` | Clear activity logs and reset agent panels to idle |
| `/help` | Display usage tips and example prompts |
| `/quit` or `Ctrl+C` | Exit the TUI and print a summary of generated Markdown files |

---

## Output Files (`output/`)

After every run, **Scribe (`@scribe`)** writes:

- **`output/recipes/<recipe-slug>.md`** — **One Markdown file per recipe**, containing:
  - Recipe title, description, prep/cook times, and servings
  - Initial ingredients and instructions from `@meal-planner`
  - Web verification status, community review consensus, recommended recipe tweaks, and reference URLs from `@researcher`
- **`output/shopping-list.md`** — **One consolidated Shopping List Markdown file**, containing:
  - Links to every individual recipe Markdown file generated in the session
  - Consolidated grocery checklist items grouped by category from `@shopper`, combining quantities whenever multiple recipes use the same ingredient
- **`.squad/decisions.md`** — Appends a persistent session log entry to the Squad repository memory.

---

## Project Structure

```text
squad-meals/
├── .squad/
│   ├── team.md                           # Squad roster definition
│   ├── routing.md                        # Agent dispatch & handoff rules
│   ├── decisions.md                      # Persistent Squad decision & session ledger
│   └── agents/
│       ├── meal-planner/charter.md       # Meal Planner agent charter
│       ├── researcher/charter.md         # Researcher agent charter
│       ├── shopper/charter.md            # Shopper agent charter
│       └── scribe/charter.md             # Scribe agent charter
├── squad.config.ts                       # Programmatic @bradygaster/squad-sdk config
├── src/
│   ├── index.ts                          # CLI entry point & argument parser
│   ├── tui.ts                            # Interactive ASCII TUI renderer & input handler
│   ├── squad-engine.ts                   # 4-agent Squad pipeline & EventBus coordinator
│   ├── ollama.ts                         # Local Ollama HTTP/streaming client & model auto-detection
│   ├── web-search.ts                     # Online recipe & review lookup for Researcher
│   └── types.ts                          # Shared TypeScript interfaces
├── output/
│   ├── shopping-list.md                  # Consolidated shopping list written by Scribe
│   └── recipes/
│       └── <recipe-slug>.md              # Individual recipe Markdown files written by Scribe
├── package.json
└── tsconfig.json
```
