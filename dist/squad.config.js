import { defineSquad, defineTeam, defineAgent, defineRouting, defineDefaults, defineHooks, defineSkill, } from '@bradygaster/squad-sdk';
export const squadMealsConfig = defineSquad({
    version: '1.0.0',
    team: defineTeam({
        name: 'Squad Meals',
        description: 'Multi-agent culinary squad for meal planning, web recipe verification, ingredient consolidation, and Markdown recipe publishing.',
        projectContext: 'Uses a locally running Ollama LLM for reasoning and coordinates four specialized agents: Meal Planner, Researcher, Shopper, and Scribe.',
        members: ['@meal-planner', '@researcher', '@shopper', '@scribe'],
    }),
    defaults: defineDefaults({
        model: {
            preferred: process.env.OLLAMA_MODEL || 'ollama-auto',
            rationale: 'Local Ollama LLM reasoning with automatic model detection',
            fallback: 'llama3.2',
        },
    }),
    agents: [
        defineAgent({
            name: 'meal-planner',
            role: 'Meal Planner',
            description: 'Reviews initial requests, selects recipes to make based on available information, and drafts initial instructions and ingredient lists.',
            charter: '.squad/agents/meal-planner/charter.md',
            tools: ['propose_recipes'],
            capabilities: [
                { name: 'recipe-conception', level: 'expert' },
                { name: 'menu-planning', level: 'expert' },
            ],
            status: 'active',
        }),
        defineAgent({
            name: 'researcher',
            role: 'Researcher',
            description: 'Reviews Meal Planner suggestions, searches the web to verify ingredients/instructions against online recipes & reviews, and adds recipe tweak notes.',
            charter: '.squad/agents/researcher/charter.md',
            tools: ['web_recipe_search', 'annotate_recipe_tweaks'],
            capabilities: [
                { name: 'web-verification', level: 'expert' },
                { name: 'review-analysis', level: 'expert' },
            ],
            status: 'active',
        }),
        defineAgent({
            name: 'shopper',
            role: 'Shopper',
            description: 'Reviews needed ingredients across all recipes and consolidates duplicate items into a single unified shopping list.',
            charter: '.squad/agents/shopper/charter.md',
            tools: ['consolidate_shopping_list'],
            capabilities: [
                { name: 'ingredient-consolidation', level: 'expert' },
                { name: 'unit-normalization', level: 'proficient' },
            ],
            status: 'active',
        }),
        defineAgent({
            name: 'scribe',
            role: 'Scribe',
            description: 'Writes final output to disk: 1 separate Markdown file per recipe plus 1 consolidated shopping list Markdown file.',
            charter: '.squad/agents/scribe/charter.md',
            tools: ['write_recipe_markdown', 'write_shopping_list_markdown'],
            capabilities: [
                { name: 'markdown-documentation', level: 'expert' },
                { name: 'recipe-publishing', level: 'expert' },
            ],
            status: 'active',
        }),
    ],
    routing: defineRouting({
        rules: [
            {
                pattern: 'plan-*',
                agents: ['@meal-planner'],
                tier: 'standard',
                priority: 1,
                description: 'Route initial meal requests and recipe conception to Meal Planner.',
            },
            {
                pattern: 'research-*',
                agents: ['@researcher'],
                tier: 'standard',
                priority: 2,
                description: 'Route recipe web verification and review analysis to Researcher.',
            },
            {
                pattern: 'shop-*',
                agents: ['@shopper'],
                tier: 'standard',
                priority: 3,
                description: 'Route cross-recipe ingredient consolidation to Shopper.',
            },
            {
                pattern: 'write-*',
                agents: ['@scribe'],
                tier: 'direct',
                priority: 4,
                description: 'Route final Markdown file generation to Scribe.',
            },
        ],
        defaultAgent: '@meal-planner',
        fallback: 'coordinator',
    }),
    hooks: defineHooks({
        allowedWritePaths: ['output/**', '.squad/**'],
        scrubPii: false,
    }),
    skills: [
        defineSkill({
            name: 'meal-planning-pipeline',
            description: 'Four-stage collaborative meal planning workflow',
            domain: 'culinary-orchestration',
            confidence: 'high',
            source: 'manual',
            content: '1. Meal Planner drafts recipes -> 2. Researcher verifies online & adds tweaks -> 3. Shopper consolidates ingredients -> 4. Scribe writes 1 MD per recipe + 1 shopping list MD.',
        }),
    ],
});
export default squadMealsConfig;
