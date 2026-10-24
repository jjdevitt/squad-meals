# Squad Decisions Log

This file records architectural, culinary, and operational decisions made by the Squad Meals team across sessions.

## Initial Architecture Decisions
- **Framework:** `@bradygaster/squad-sdk` with `.squad/` repository-native agent charters and `squad.config.ts`.
- **LLM Backend:** Local Ollama server (`http://localhost:11434`), auto-detecting the first available installed local model unless overridden via `--model` or `OLLAMA_MODEL`.
- **Output Format:**
  - Each recipe is written to its own dedicated Markdown file (`output/recipes/<slug>.md`).
  - A consolidated shopping list is written to `output/shopping-list.md`.

## Session Run (2026-10-24T13:59:29.745Z)
- **Prompt:** chicken breast dinner no cream sauces
- **Model:** `llama3:latest`
- **Recipes Planned:** Lemon Herb Chicken Breast, Spicy Chicken Breast Fajitas
- **Files Written by @scribe:**
  - `output/recipes/lemon-herb-chicken-breast.md`
  - `output/recipes/spicy-chicken-breast-fajitas.md`
  - `output/shopping-list.md`
