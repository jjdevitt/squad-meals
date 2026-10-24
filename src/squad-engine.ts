import fs from 'node:fs/promises';
import path from 'node:path';
import { RuntimeEventBus, resolveSquad } from '@bradygaster/squad-sdk';
import { defineTool } from '@bradygaster/squad-sdk/tools';
import { squadMealsConfig } from '../squad.config.js';
import { OllamaClient, parseJsonFromLlm } from './ollama.js';
import { searchWebForRecipe } from './web-search.js';
import type {
  AgentId,
  AgentRuntimeState,
  ConsolidatedShoppingItem,
  IngredientItem,
  InitialRecipe,
  ResearcherReview,
  ScribeOutputResult,
  ShoppingListResult,
  SquadPipelineResult,
} from './types.js';

export interface SquadEngineCallbacks {
  onAgentUpdate: (agent: AgentRuntimeState) => void;
  onLog: (message: string) => void;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'recipe'
  );
}

/**
 * Deterministic fallback/post-processor that ensures duplicate ingredients
 * across multiple recipes are always consolidated into a single shopping list item.
 */
export function mergeAndConsolidateIngredients(
  recipes: InitialRecipe[],
  reviews: ResearcherReview[],
  llmItems?: ConsolidatedShoppingItem[]
): ConsolidatedShoppingItem[] {
  if (llmItems && llmItems.length > 0) {
    // Deduplicate any remaining items with identical normalized names from LLM output
    const byKey = new Map<string, ConsolidatedShoppingItem>();
    for (const item of llmItems) {
      const key = item.item.trim().toLowerCase();
      if (!key) continue;
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.totalQuantity.includes(item.totalQuantity)) {
          existing.totalQuantity = `${existing.totalQuantity} + ${item.totalQuantity}`;
        }
        const mergedRecipes = new Set([...(existing.usedInRecipes || []), ...(item.usedInRecipes || [])]);
        existing.usedInRecipes = Array.from(mergedRecipes);
        if (item.notes && existing.notes !== item.notes) {
          existing.notes = [existing.notes, item.notes].filter(Boolean).join('; ');
        }
      } else {
        byKey.set(key, {
          item: item.item.trim(),
          totalQuantity: String(item.totalQuantity || '1 unit').trim(),
          category: item.category || 'Pantry & General',
          usedInRecipes: Array.isArray(item.usedInRecipes) ? item.usedInRecipes : [],
          notes: item.notes,
        });
      }
    }
    return Array.from(byKey.values());
  }

  // Deterministic consolidation from raw recipe ingredients + researcher adjustments
  const map = new Map<
    string,
    {
      displayName: string;
      quantities: Array<{ qty: number | null; raw: string; unit: string }>;
      category: string;
      recipes: Set<string>;
      notes: Set<string>;
    }
  >();

  const addIng = (ing: IngredientItem, recipeTitle: string) => {
    const key = ing.name
      .toLowerCase()
      .replace(/\b(fresh|organic|large|medium|small|chopped|diced|minced|sliced)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!key) return;

    const entry = map.get(key) || {
      displayName: ing.name.trim(),
      quantities: [],
      category: ing.category || guessCategory(ing.name),
      recipes: new Set<string>(),
      notes: new Set<string>(),
    };

    const num = parseFloat(String(ing.quantity));
    entry.quantities.push({
      qty: Number.isFinite(num) ? num : null,
      raw: String(ing.quantity || '').trim(),
      unit: String(ing.unit || '').trim().toLowerCase(),
    });
    entry.recipes.add(recipeTitle);
    if (ing.notes) entry.notes.add(ing.notes);
    map.set(key, entry);
  };

  for (const r of recipes) {
    for (const ing of r.ingredients) {
      addIng(ing, r.title);
    }
  }
  for (const rev of reviews) {
    for (const adj of rev.ingredientAdjustments || []) {
      addIng(adj, `${rev.recipeTitle} (Researcher Tweak)`);
    }
  }

  const consolidated: ConsolidatedShoppingItem[] = [];
  for (const entry of map.values()) {
    // Combine quantities with identical units
    const byUnit = new Map<string, { sum: number; rawParts: string[] }>();
    for (const q of entry.quantities) {
      const u = q.unit || 'unit';
      const cur = byUnit.get(u) || { sum: 0, rawParts: [] };
      if (q.qty !== null) {
        cur.sum += q.qty;
      } else if (q.raw) {
        cur.rawParts.push(q.raw);
      }
      byUnit.set(u, cur);
    }

    const formattedQty: string[] = [];
    for (const [unit, val] of byUnit.entries()) {
      const parts: string[] = [];
      if (val.sum > 0) {
        const rounded = Math.round(val.sum * 100) / 100;
        parts.push(unit === 'unit' ? `${rounded}` : `${rounded} ${unit}`);
      }
      if (val.rawParts.length > 0) {
        parts.push(val.rawParts.map((p) => (unit === 'unit' ? p : `${p} ${unit}`)).join(' + '));
      }
      if (parts.length > 0) formattedQty.push(parts.join(' + '));
    }

    consolidated.push({
      item: entry.displayName,
      totalQuantity: formattedQty.join(' + ') || 'As needed',
      category: entry.category,
      usedInRecipes: Array.from(entry.recipes),
      notes: Array.from(entry.notes).join('; ') || undefined,
    });
  }

  return consolidated.sort((a, b) => a.category.localeCompare(b.category) || a.item.localeCompare(b.item));
}

function guessCategory(name: string): string {
  const n = name.toLowerCase();
  if (/(chicken|beef|pork|salmon|shrimp|tofu|turkey|bacon|sausage|fish|lamb)/.test(n)) return 'Meat, Poultry & Protein';
  if (/(milk|cheese|butter|cream|yogurt|egg|parmesan|mozzarella|feta)/.test(n)) return 'Dairy & Eggs';
  if (/(onion|garlic|tomato|lemon|lime|spinach|pepper|carrot|potato|celery|herb|parsley|cilantro|basil|ginger|avocado|mushroom|broccoli|lettuce|cucumber|zucchini)/.test(n))
    return 'Produce';
  if (/(salt|pepper|cumin|paprika|oregano|thyme|cinnamon|chili|curry|turmeric|spice|bay leaf|coriander)/.test(n))
    return 'Spices & Seasonings';
  return 'Pantry & Dry Goods';
}

export class SquadMealsEngine {
  public readonly eventBus: RuntimeEventBus;
  public readonly ollama: OllamaClient;
  public readonly outputDir: string;
  private agents: Map<AgentId, AgentRuntimeState> = new Map();
  private charters: Map<AgentId, string> = new Map();
  private callbacks: SquadEngineCallbacks;

  constructor(options: {
    ollama: OllamaClient;
    outputDir?: string;
    callbacks: SquadEngineCallbacks;
  }) {
    this.eventBus = new RuntimeEventBus();
    this.ollama = options.ollama;
    this.outputDir = options.outputDir || path.resolve(process.cwd(), 'output');
    this.callbacks = options.callbacks;

    // Initialize agent runtime states from squad.config.ts
    for (const def of squadMealsConfig.agents) {
      const id = def.name as AgentId;
      this.agents.set(id, {
        id,
        name: def.role,
        handle: `@${def.name}`,
        role: def.role,
        status: 'idle',
        statusLabel: 'IDLE / READY',
        consideration: def.description || 'Awaiting prompt...',
        feedbackLines: ['Ready in .squad/ roster.', `Charter: ${def.charter}`],
        charterSummary: def.description || '',
      });
    }

    // Subscribe EventBus for coordinator telemetry logging
    this.eventBus.subscribeAll((evt) => {
      if (evt.type === 'coordinator:routing' || evt.type === 'agent:milestone') {
        const msg = (evt.payload as { message?: string })?.message;
        if (msg) {
          this.callbacks.onLog(`[SquadBus:${evt.type}] ${msg}`);
        }
      }
    });
  }

  public getAgents(): AgentRuntimeState[] {
    return [
      this.agents.get('meal-planner')!,
      this.agents.get('researcher')!,
      this.agents.get('shopper')!,
      this.agents.get('scribe')!,
    ];
  }

  public async initializeSquadFiles(): Promise<string> {
    const resolved = resolveSquad(process.cwd());
    for (const def of squadMealsConfig.agents) {
      const id = def.name as AgentId;
      const charterPath = path.resolve(process.cwd(), def.charter || `.squad/agents/${id}/charter.md`);
      try {
        const content = await fs.readFile(charterPath, 'utf8');
        this.charters.set(id, content);
      } catch {
        this.charters.set(id, def.description || '');
      }
    }
    return resolved || path.resolve(process.cwd(), '.squad');
  }

  private updateAgent(
    id: AgentId,
    patch: Partial<Pick<AgentRuntimeState, 'status' | 'statusLabel' | 'consideration' | 'feedbackLines'>>
  ): void {
    const current = this.agents.get(id);
    if (!current) return;
    const updated: AgentRuntimeState = {
      ...current,
      ...patch,
    };
    this.agents.set(id, updated);
    this.callbacks.onAgentUpdate(updated);
  }

  public resetAgentsForRun(): void {
    for (const id of ['meal-planner', 'researcher', 'shopper', 'scribe'] as AgentId[]) {
      this.updateAgent(id, {
        status: 'idle',
        statusLabel: 'QUEUED',
        consideration: 'Standing by for squad handoff...',
        feedbackLines: ['Waiting for upstream agent in pipeline...'],
      });
    }
  }

  /**
   * Executes the full 4-agent Squad pipeline for a user meal planning prompt.
   */
  public async runPipeline(userPrompt: string): Promise<SquadPipelineResult> {
    this.resetAgentsForRun();

    const modelInfo = await this.ollama.resolveModel();
    const model = modelInfo.model;
    if (!modelInfo.online) {
      throw new Error(
        `Cannot reach local Ollama at ${this.ollama.host} (${modelInfo.error || 'offline'}). Start Ollama with \`ollama serve\` and pull a model (e.g. \`ollama pull llama3.2\`).`
      );
    }

    await this.eventBus.emit({
      type: 'session:created',
      sessionId: `meal-run-${Date.now()}`,
      payload: { prompt: userPrompt, model },
      timestamp: new Date(),
    });

    // =========================================================================
    // STAGE 1: MEAL PLANNER (@meal-planner)
    // =========================================================================
    await this.eventBus.emit({
      type: 'coordinator:routing',
      agentName: 'meal-planner',
      payload: { message: `Routing initial request to @meal-planner (${model})` },
      timestamp: new Date(),
    });

    this.updateAgent('meal-planner', {
      status: 'processing',
      statusLabel: 'PLANNING MEALS...',
      consideration: `Analyzing request: "${userPrompt.slice(0, 60)}${userPrompt.length > 60 ? '...' : ''}"`,
      feedbackLines: [
        `Consulting charter & reasoning with Ollama (${model})...`,
        'Selecting cohesive recipes, ingredient quantities, and cooking steps...',
      ],
    });

    const recipes = await this.runMealPlannerAgent(userPrompt, model);

    this.updateAgent('meal-planner', {
      status: 'done',
      statusLabel: `DONE (${recipes.length} RECIPES)`,
      consideration: `Selected ${recipes.length} meal(s): ${recipes.map((r) => r.title).join(', ')}`,
      feedbackLines: recipes.map(
        (r, i) => `${i + 1}. ${r.title} (${r.ingredients.length} ingredients, ${r.instructions.length} steps)`
      ),
    });

    await this.eventBus.emit({
      type: 'agent:milestone',
      agentName: 'meal-planner',
      payload: {
        message: `@meal-planner proposed ${recipes.length} recipes: ${recipes.map((r) => r.title).join(', ')}`,
      },
      timestamp: new Date(),
    });

    // =========================================================================
    // STAGE 2: RESEARCHER (@researcher)
    // =========================================================================
    await this.eventBus.emit({
      type: 'coordinator:routing',
      agentName: 'researcher',
      payload: { message: 'Handoff to @researcher for web recipe & review verification' },
      timestamp: new Date(),
    });

    this.updateAgent('researcher', {
      status: 'processing',
      statusLabel: 'SEARCHING WEB...',
      consideration: `Verifying ${recipes.length} recipe(s) against online sources & reviews...`,
      feedbackLines: ['Querying web recipes & community comments...'],
    });

    const reviews = await this.runResearcherAgent(recipes, model);

    const tweaksCount = reviews.reduce((acc, r) => acc + r.tweaks.length, 0);
    this.updateAgent('researcher', {
      status: 'done',
      statusLabel: `VERIFIED (${tweaksCount} TWEAKS)`,
      consideration: `Checked online recipes & reviews for all ${recipes.length} meals.`,
      feedbackLines: reviews.flatMap((rev) => [
        `• ${rev.recipeTitle}: [${rev.verificationStatus}]`,
        `  Tweak: ${rev.tweaks[0] || 'Ingredients & ratios match top online recipes.'}`,
      ]),
    });

    await this.eventBus.emit({
      type: 'agent:milestone',
      agentName: 'researcher',
      payload: {
        message: `@researcher completed web verification with ${tweaksCount} recommended recipe notes/tweaks.`,
      },
      timestamp: new Date(),
    });

    // =========================================================================
    // STAGE 3: SHOPPER (@shopper)
    // =========================================================================
    await this.eventBus.emit({
      type: 'coordinator:routing',
      agentName: 'shopper',
      payload: { message: 'Handoff to @shopper for cross-recipe ingredient consolidation' },
      timestamp: new Date(),
    });

    const rawIngredientCount = recipes.reduce((acc, r) => acc + r.ingredients.length, 0);
    this.updateAgent('shopper', {
      status: 'processing',
      statusLabel: 'CONSOLIDATING...',
      consideration: `Merging ${rawIngredientCount} raw ingredient entries across ${recipes.length} recipes...`,
      feedbackLines: [
        'Normalizing measurement units & combining duplicate ingredients...',
        'Grouping consolidated shopping list by store aisle...',
      ],
    });

    const shoppingList = await this.runShopperAgent(recipes, reviews, model);
    const multiRecipeCount = shoppingList.items.filter((i) => i.usedInRecipes.length > 1).length;

    this.updateAgent('shopper', {
      status: 'done',
      statusLabel: `DONE (${shoppingList.items.length} ITEMS)`,
      consideration: `Consolidated ${rawIngredientCount} raw ingredients -> ${shoppingList.items.length} unique items (${multiRecipeCount} shared across meals).`,
      feedbackLines: [
        `Total unique grocery items: ${shoppingList.items.length} (${multiRecipeCount} multi-recipe merges)`,
        ...shoppingList.items.slice(0, 4).map(
          (item) => `• ${item.item}: ${item.totalQuantity} [${item.usedInRecipes.length} meal(s)]`
        ),
      ],
    });

    await this.eventBus.emit({
      type: 'agent:milestone',
      agentName: 'shopper',
      payload: {
        message: `@shopper consolidated ${rawIngredientCount} ingredients into ${shoppingList.items.length} shopping list items.`,
      },
      timestamp: new Date(),
    });

    // =========================================================================
    // STAGE 4: SCRIBE (@scribe)
    // =========================================================================
    await this.eventBus.emit({
      type: 'coordinator:routing',
      agentName: 'scribe',
      payload: { message: 'Handoff to @scribe to write individual recipe Markdown files + shopping list Markdown' },
      timestamp: new Date(),
    });

    this.updateAgent('scribe', {
      status: 'processing',
      statusLabel: 'WRITING MARKDOWN...',
      consideration: `Writing ${recipes.length} recipe Markdown file(s) + 1 shopping list Markdown file...`,
      feedbackLines: ['Formatting recipes with Researcher notes and writing to output/...'],
    });

    const scribeOutput = await this.runScribeAgent(userPrompt, model, recipes, reviews, shoppingList);

    this.updateAgent('scribe', {
      status: 'done',
      statusLabel: `SAVED (${scribeOutput.recipeFiles.length + 1} FILES)`,
      consideration: `Wrote ${scribeOutput.recipeFiles.length} recipe MD file(s) + 1 shopping list MD file.`,
      feedbackLines: [
        `Shopping List: ${path.relative(process.cwd(), scribeOutput.shoppingListFile)}`,
        ...scribeOutput.recipeFiles.map((f) => `Recipe MD: ${path.relative(process.cwd(), f)}`),
      ],
    });

    await this.eventBus.emit({
      type: 'agent:milestone',
      agentName: 'scribe',
      payload: {
        message: `@scribe wrote ${scribeOutput.recipeFiles.length} recipe Markdown files and 1 consolidated shopping list file.`,
      },
      timestamp: new Date(),
    });

    return {
      prompt: userPrompt,
      model,
      recipes,
      reviews,
      shoppingList,
      scribeOutput,
    };
  }

  private async runMealPlannerAgent(userPrompt: string, model: string): Promise<InitialRecipe[]> {
    const charter = this.charters.get('meal-planner') || '';
    const systemPrompt = `${charter}

You are the "Meal Planner" agent in a Squad multi-agent meal planning pipeline.
Based on the user's request, decide what recipes should be made (default to 2-3 recipes if the user asks for "meals" or a meal plan without specifying a count, or the exact number requested if they specify 1, 2, 3, etc.).
Ensure recipes share some overlapping fresh ingredients where practical so the Shopper agent can consolidate them effectively.

Respond ONLY with valid JSON matching this exact structure:
{
  "consideration": "Brief 1-sentence explanation of why you chose these meals",
  "recipes": [
    {
      "title": "Recipe Name",
      "description": "Appetizing 1-2 sentence description",
      "prepTime": "15 mins",
      "cookTime": "25 mins",
      "servings": 4,
      "ingredients": [
        { "name": "Garlic cloves", "quantity": "4", "unit": "cloves", "notes": "minced", "category": "Produce" }
      ],
      "instructions": [
        "Step 1 detailed cooking instruction...",
        "Step 2 detailed cooking instruction..."
      ]
    }
  ]
}`;

    const raw = await this.ollama.chat({
      model,
      system: systemPrompt,
      userPrompt: `User Meal Request: ${userPrompt}`,
      formatJson: true,
      temperature: 0.4,
      onToken: (partial, tokens) => {
        if (tokens % 8 === 0) {
          const titleMatches = Array.from(partial.matchAll(/"title"\s*:\s*"([^"]+)"/g)).map((m) => m[1]);
          this.updateAgent('meal-planner', {
            status: 'processing',
            statusLabel: `REASONING (${tokens} tok)`,
            consideration:
              titleMatches.length > 0
                ? `Drafting recipes: ${titleMatches.join(', ')}`
                : `Generating initial meal suggestions and ingredient lists (${tokens} tokens)...`,
            feedbackLines: [
              `Active Ollama model: ${model}`,
              titleMatches.length > 0
                ? `Identified meals so far: ${titleMatches.join(' | ')}`
                : 'Formulating meal concepts & instructions...',
            ],
          });
        }
      },
    });

    const parsed = parseJsonFromLlm<{
      consideration?: string;
      recipes?: Array<Partial<InitialRecipe>>;
    }>(raw, { recipes: [] });

    const list = Array.isArray(parsed.recipes) && parsed.recipes.length > 0 ? parsed.recipes : [];
    const normalized: InitialRecipe[] = list.map((r, idx) => {
      const title = String(r.title || `Chef's Special Meal ${idx + 1}`).trim();
      return {
        title,
        slug: slugify(title),
        description: String(r.description || `Delicious homemade ${title}.`).trim(),
        prepTime: String(r.prepTime || '15 mins'),
        cookTime: String(r.cookTime || '25 mins'),
        servings: Number(r.servings) || 4,
        ingredients: Array.isArray(r.ingredients)
          ? r.ingredients.map((ing) => ({
              name: String(ing?.name || 'Seasoning').trim(),
              quantity: String(ing?.quantity ?? '1').trim(),
              unit: String(ing?.unit ?? 'unit').trim(),
              notes: ing?.notes ? String(ing.notes).trim() : undefined,
              category: ing?.category ? String(ing.category).trim() : guessCategory(String(ing?.name || '')),
            }))
          : [],
        instructions: Array.isArray(r.instructions)
          ? r.instructions.map((s) => String(s).trim()).filter(Boolean)
          : ['Prepare ingredients, cook over medium heat until tender, and season to taste.'],
      };
    });

    if (normalized.length === 0) {
      throw new Error('Meal Planner did not return any valid recipes from Ollama.');
    }

    return normalized;
  }

  private async runResearcherAgent(recipes: InitialRecipe[], model: string): Promise<ResearcherReview[]> {
    const charter = this.charters.get('researcher') || '';
    const reviews: ResearcherReview[] = [];

    // Register Squad SDK tool for web recipe search
    const searchTool = defineTool<{ recipeTitle: string }>({
      name: 'web_recipe_search',
      description: 'Searches online recipe databases and community reviews for a dish',
      parameters: {
        type: 'object',
        properties: { recipeTitle: { type: 'string' } },
        required: ['recipeTitle'],
      },
      agentName: 'researcher',
      handler: async ({ recipeTitle }) => {
        const res = await searchWebForRecipe(recipeTitle);
        return {
          textResultForLlm: JSON.stringify(res),
          resultType: 'success',
        };
      },
    });

    for (let i = 0; i < recipes.length; i++) {
      const recipe = recipes[i];
      this.updateAgent('researcher', {
        status: 'processing',
        statusLabel: `WEB SEARCH (${i + 1}/${recipes.length})`,
        consideration: `Searching the web & reviews for "${recipe.title}"...`,
        feedbackLines: [
          `Querying online recipes & community comments for: ${recipe.title}`,
          ...reviews.map((r) => `✓ Verified ${r.recipeTitle} (${r.verificationStatus})`),
        ],
      });

      await this.eventBus.emit({
        type: 'session:tool_call',
        agentName: 'researcher',
        payload: { tool: searchTool.name, recipe: recipe.title },
        timestamp: new Date(),
      });

      const webSearch = await searchWebForRecipe(recipe.title);

      this.updateAgent('researcher', {
        status: 'processing',
        statusLabel: `ANALYZING (${i + 1}/${recipes.length})`,
        consideration: `Comparing "${recipe.title}" with ${webSearch.results.length} online sources & reviewer tips...`,
        feedbackLines: [
          `Found ${webSearch.results.length} online references for "${recipe.title}"`,
          `Top source: ${webSearch.results[0]?.title || 'Online community recipes'}`,
          'Evaluating whether ingredients/instructions need tweaking...',
        ],
      });

      const systemPrompt = `${charter}

You are the "Researcher" agent in a Squad multi-agent meal planning pipeline.
Review the Meal Planner's proposed recipe and compare it against the Web Search Results & Online Reviewer Comments provided.
1. Verify if the ingredients and instructions are similar to what others are making online.
2. Check community reviews/comments cues to see if the recipe is good as-is or needs tweaking (e.g., seasoning adjustments, cooking technique tips, acid/herb balance, or missing classic ingredients).
3. Add clear, helpful notes/tweaks to the recipe selection. If an extra or adjusted ingredient is warranted, include it in "ingredientAdjustments".

Respond ONLY with valid JSON matching this exact structure:
{
  "verificationStatus": "Tweaks Recommended",
  "similarityAssessment": "1-2 sentences comparing Meal Planner's recipe to online versions",
  "communityFeedbackSummary": "1-2 sentences summarizing what online reviewers/cooks emphasize for this dish",
  "tweaks": [
    "Specific actionable tweak or note #1 based on online reviews",
    "Specific actionable tweak or note #2"
  ],
  "ingredientAdjustments": [
    { "name": "Fresh lemon juice", "quantity": "1", "unit": "tbsp", "notes": "Added per reviewer tips to brighten flavor", "category": "Produce" }
  ]
}`;

      const userContent = JSON.stringify(
        {
          proposedRecipe: {
            title: recipe.title,
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
          },
          webSearchResults: webSearch.results,
        },
        null,
        2
      );

      const raw = await this.ollama.chat({
        model,
        system: systemPrompt,
        userPrompt: userContent,
        formatJson: true,
        temperature: 0.3,
        onToken: (_partial, tokens) => {
          if (tokens % 10 === 0) {
            this.updateAgent('researcher', {
              status: 'processing',
              statusLabel: `REVIEWING (${i + 1}/${recipes.length})`,
              consideration: `Synthesizing review notes for "${recipe.title}" (${tokens} tok)...`,
              feedbackLines: [
                `Recipe ${i + 1}/${recipes.length}: ${recipe.title}`,
                `Sources checked: ${webSearch.results.map((r) => r.title.slice(0, 35)).join('; ')}`,
              ],
            });
          }
        },
      });

      const parsed = parseJsonFromLlm<{
        verificationStatus?: string;
        similarityAssessment?: string;
        communityFeedbackSummary?: string;
        tweaks?: string[];
        ingredientAdjustments?: IngredientItem[];
      }>(raw, {});

      const tweaks =
        Array.isArray(parsed.tweaks) && parsed.tweaks.length > 0
          ? parsed.tweaks.map((t) => String(t).trim()).filter(Boolean)
          : [
              'Online recipes confirm these core ingredients; reviewers recommend seasoning in stages and resting 5 minutes before serving.',
            ];

      const status: 'Verified Solid' | 'Tweaks Recommended' =
        parsed.verificationStatus === 'Verified Solid' ? 'Verified Solid' : 'Tweaks Recommended';

      reviews.push({
        recipeSlug: recipe.slug,
        recipeTitle: recipe.title,
        verificationStatus: status,
        searchQuery: webSearch.query,
        sourcesChecked: webSearch.results,
        similarityAssessment:
          parsed.similarityAssessment ||
          `Ingredients and cooking method closely match popular online versions of ${recipe.title}.`,
        communityFeedbackSummary:
          parsed.communityFeedbackSummary ||
          'Online home cooks highlight aromatics, proper pan heat, and a finishing touch of acid/herbs.',
        tweaks,
        ingredientAdjustments: Array.isArray(parsed.ingredientAdjustments)
          ? parsed.ingredientAdjustments
              .filter((adj) => adj && adj.name)
              .map((adj) => ({
                name: String(adj.name).trim(),
                quantity: String(adj.quantity || '1').trim(),
                unit: String(adj.unit || 'unit').trim(),
                notes: adj.notes ? String(adj.notes).trim() : 'Researcher tweak',
                category: adj.category || guessCategory(String(adj.name)),
              }))
          : [],
      });
    }

    return reviews;
  }

  private async runShopperAgent(
    recipes: InitialRecipe[],
    reviews: ResearcherReview[],
    model: string
  ): Promise<ShoppingListResult> {
    const charter = this.charters.get('shopper') || '';

    // Pre-compute deterministic consolidated baseline so we can pass it to Ollama for refinement
    const deterministicMerged = mergeAndConsolidateIngredients(recipes, reviews);

    const systemPrompt = `${charter}

You are the "Shopper" agent in a Squad multi-agent meal planning pipeline.
Review all ingredients needed across the planned recipes (and Researcher's tweaks) to generate a consolidated shopping list.
CRITICAL RULE: If multiple recipes use the same ingredient (e.g., garlic, olive oil, onion, salt, chicken broth), consolidate them into a SINGLE item on the shopping list with combined total quantity and list all recipes that use it.

Respond ONLY with valid JSON matching this exact structure:
{
  "summary": "1-sentence overview of the consolidated grocery trip",
  "items": [
    {
      "item": "Garlic",
      "totalQuantity": "6 cloves",
      "category": "Produce",
      "usedInRecipes": ["Recipe A", "Recipe B"],
      "notes": "Minced"
    }
  ]
}`;

    const raw = await this.ollama.chat({
      model,
      system: systemPrompt,
      userPrompt: JSON.stringify(
        {
          recipes: recipes.map((r) => ({
            title: r.title,
            ingredients: r.ingredients,
          })),
          researcherAdjustments: reviews.map((rev) => ({
            recipeTitle: rev.recipeTitle,
            ingredientAdjustments: rev.ingredientAdjustments,
          })),
          preMergedCandidate: deterministicMerged,
        },
        null,
        2
      ),
      formatJson: true,
      temperature: 0.2,
      onToken: (_partial, tokens) => {
        if (tokens % 10 === 0) {
          this.updateAgent('shopper', {
            status: 'processing',
            statusLabel: `MERGING (${tokens} tok)`,
            consideration: `Consolidating duplicate ingredients across ${recipes.length} recipes (${tokens} tokens)...`,
            feedbackLines: [
              `Baseline consolidated items: ${deterministicMerged.length}`,
              'Verifying combined quantities and grocery categories with Ollama...',
            ],
          });
        }
      },
    });

    const parsed = parseJsonFromLlm<{
      summary?: string;
      items?: ConsolidatedShoppingItem[];
    }>(raw, {});

    const finalItems = mergeAndConsolidateIngredients(
      recipes,
      reviews,
      Array.isArray(parsed.items) && parsed.items.length > 0 ? parsed.items : undefined
    );

    return {
      summary:
        parsed.summary ||
        `Consolidated ingredients across ${recipes.length} recipes into ${finalItems.length} shopping list items.`,
      items: finalItems,
    };
  }

  private async runScribeAgent(
    userPrompt: string,
    model: string,
    recipes: InitialRecipe[],
    reviews: ResearcherReview[],
    shoppingList: ShoppingListResult
  ): Promise<ScribeOutputResult> {
    const recipesDir = path.join(this.outputDir, 'recipes');
    await fs.mkdir(recipesDir, { recursive: true });

    const writtenRecipeFiles: string[] = [];
    const timestamp = new Date().toISOString().split('T')[0];

    // Write 1 separate Markdown file per recipe
    for (const recipe of recipes) {
      const review = reviews.find((r) => r.recipeSlug === recipe.slug || r.recipeTitle === recipe.title);
      const filePath = path.join(recipesDir, `${recipe.slug}.md`);

      const mdLines: string[] = [
        `# ${recipe.title}`,
        '',
        `> ${recipe.description}`,
        '',
        `- **Date Planned:** ${timestamp}`,
        `- **Prep Time:** ${recipe.prepTime}`,
        `- **Cook Time:** ${recipe.cookTime}`,
        `- **Servings:** ${recipe.servings}`,
        `- **Reasoning Model:** \`${model}\` (via Squad Meals CLI)`,
        `- **Consolidated Shopping List:** [\`../shopping-list.md\`](../shopping-list.md)`,
        '',
        '---',
        '',
        '## Ingredients (`@meal-planner`)',
        '',
        ...recipe.ingredients.map(
          (ing) =>
            `- **${ing.quantity} ${ing.unit}** ${ing.name}${ing.notes ? ` *(${ing.notes})*` : ''}`
        ),
      ];

      if (review && review.ingredientAdjustments.length > 0) {
        mdLines.push(
          '',
          '### Recommended Ingredient Additions / Adjustments (`@researcher`)',
          '',
          ...review.ingredientAdjustments.map(
            (adj) =>
              `- **${adj.quantity} ${adj.unit}** ${adj.name}${adj.notes ? ` — *${adj.notes}*` : ''}`
          )
        );
      }

      mdLines.push(
        '',
        '---',
        '',
        '## Instructions (`@meal-planner`)',
        '',
        ...recipe.instructions.map((step, idx) => `${idx + 1}. ${step.replace(/^\d+[\.\)]\s*/, '')}`)
      );

      if (review) {
        mdLines.push(
          '',
          '---',
          '',
          `## Researcher Web Verification & Notes (\`@researcher\`)`,
          '',
          `- **Verification Status:** **${review.verificationStatus}**`,
          `- **Search Query:** \`${review.searchQuery}\``,
          `- **Online Similarity Assessment:** ${review.similarityAssessment}`,
          `- **Community Review & Comment Consensus:** ${review.communityFeedbackSummary}`,
          '',
          '### Recommended Tweaks & Chef Notes',
          '',
          ...review.tweaks.map((t) => `- ${t}`),
          '',
          '### Online Sources Consulted',
          '',
          ...review.sourcesChecked.map(
            (src) => `- [${src.title}](${src.url}) — ${src.snippet}`
          )
        );
      }

      mdLines.push('');
      await fs.writeFile(filePath, mdLines.join('\n'), 'utf8');
      writtenRecipeFiles.push(filePath);
    }

    // Write 1 consolidated Shopping List Markdown file
    const shoppingListFile = path.join(this.outputDir, 'shopping-list.md');
    const categories = Array.from(new Set(shoppingList.items.map((i) => i.category || 'General')));

    const shopLines: string[] = [
      '# Consolidated Squad Meals Shopping List',
      '',
      `> ${shoppingList.summary}`,
      '',
      `- **Prompt:** "${userPrompt}"`,
      `- **Date Generated:** ${timestamp}`,
      `- **Ollama Model:** \`${model}\``,
      '',
      '## Planned Recipes (1 Markdown File Per Recipe)',
      '',
      ...recipes.map((r) => `- [${r.title}](recipes/${r.slug}.md) — *${r.description}*`),
      '',
      '---',
      '',
      '## Consolidated Grocery List (`@shopper`)',
      '',
    ];

    for (const cat of categories) {
      shopLines.push(`### ${cat}`, '');
      const itemsInCat = shoppingList.items.filter((i) => (i.category || 'General') === cat);
      for (const item of itemsInCat) {
        const usedIn =
          item.usedInRecipes && item.usedInRecipes.length > 0
            ? ` *(Used in: ${item.usedInRecipes.join(', ')})*`
            : '';
        const notes = item.notes ? ` — ${item.notes}` : '';
        shopLines.push(`- [ ] **${item.item}**: ${item.totalQuantity}${notes}${usedIn}`);
      }
      shopLines.push('');
    }

    await fs.writeFile(shoppingListFile, shopLines.join('\n'), 'utf8');

    // Append run record to .squad/decisions.md
    try {
      const decisionsPath = path.resolve(process.cwd(), '.squad/decisions.md');
      const entry = [
        '',
        `## Session Run (${new Date().toISOString()})`,
        `- **Prompt:** ${userPrompt}`,
        `- **Model:** \`${model}\``,
        `- **Recipes Planned:** ${recipes.map((r) => r.title).join(', ')}`,
        `- **Files Written by @scribe:**`,
        ...writtenRecipeFiles.map((f) => `  - \`${path.relative(process.cwd(), f)}\``),
        `  - \`${path.relative(process.cwd(), shoppingListFile)}\``,
        '',
      ].join('\n');
      await fs.appendFile(decisionsPath, entry, 'utf8');
    } catch {
      // Ignore if .squad/decisions.md is read-only
    }

    return {
      recipeFiles: writtenRecipeFiles,
      shoppingListFile,
      summary: `Wrote ${writtenRecipeFiles.length} recipe Markdown files in output/recipes/ and 1 consolidated shopping list in output/shopping-list.md`,
    };
  }
}
