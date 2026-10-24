# Squad Meals Routing Configuration

## Workflow Pipeline & Dispatch Rules

Incoming user meal planning prompts are routed sequentially and collaboratively through the Squad pipeline:

1. **Stage 1: Initial Recipe Conception (`@meal-planner`)**
   - **Pattern:** `plan-*`, `meal-*`, `recipe-*`, `*` (Initial user request)
   - **Responsibility:** Reviews the user's request, dietary constraints, available ingredients, and number of meals requested. Proposes the initial meal suggestions along with complete initial ingredient lists and step-by-step cooking instructions.

2. **Stage 2: Web Verification & Review Analysis (`@researcher`)**
   - **Pattern:** `research-*`, `verify-*`, `review-*`
   - **Responsibility:** Takes each recipe proposed by `@meal-planner`, searches the web for comparable authentic recipes and community reviews/comments, verifies whether ingredient ratios and cooking instructions match best practices online, and attaches actionable **Researcher Notes & Tweaks** (plus reference sources) to each recipe.

3. **Stage 3: Ingredient Consolidation (`@shopper`)**
   - **Pattern:** `shop-*`, `grocery-*`, `consolidate-*`
   - **Responsibility:** Reviews all finalized ingredients across every planned recipe (incorporating any ingredient tweaks from `@researcher`), normalizes units/quantities, merges duplicate items across multiple recipes into single consolidated entries, and organizes them by grocery aisle/category.

4. **Stage 4: Markdown Documentation (`@scribe`)**
   - **Pattern:** `write-*`, `scribe-*`, `export-*`
   - **Responsibility:** Writes the final polished output to disk:
     - **One separate Markdown file per recipe** (e.g., `output/recipes/<recipe-slug>.md`) containing description, prep/cook time, servings, ingredients, step-by-step instructions, and Researcher verification notes/tweaks.
     - **One consolidated Shopping List Markdown file** (e.g., `output/shopping-list.md`) linking back to the individual recipe files and listing merged quantities.
