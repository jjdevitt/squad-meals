export type AgentId = 'meal-planner' | 'researcher' | 'shopper' | 'scribe';

export type AgentStatus = 'idle' | 'processing' | 'done' | 'error';

export interface AgentRuntimeState {
  id: AgentId;
  name: string;
  handle: string;
  role: string;
  status: AgentStatus;
  statusLabel: string;
  consideration: string;
  feedbackLines: string[];
  charterSummary: string;
}

export interface IngredientItem {
  name: string;
  quantity: string;
  unit: string;
  notes?: string;
  category?: string;
}

export interface InitialRecipe {
  title: string;
  slug: string;
  description: string;
  prepTime: string;
  cookTime: string;
  servings: number;
  ingredients: IngredientItem[];
  instructions: string[];
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ResearcherReview {
  recipeSlug: string;
  recipeTitle: string;
  verificationStatus: 'Verified Solid' | 'Tweaks Recommended';
  searchQuery: string;
  sourcesChecked: WebSearchResult[];
  similarityAssessment: string;
  communityFeedbackSummary: string;
  tweaks: string[];
  ingredientAdjustments: IngredientItem[];
}

export interface ConsolidatedShoppingItem {
  item: string;
  totalQuantity: string;
  category: string;
  usedInRecipes: string[];
  notes?: string;
}

export interface ShoppingListResult {
  summary: string;
  items: ConsolidatedShoppingItem[];
}

export interface ScribeOutputResult {
  recipeFiles: string[];
  shoppingListFile: string;
  summary: string;
}

export interface SquadPipelineResult {
  prompt: string;
  model: string;
  recipes: InitialRecipe[];
  reviews: ResearcherReview[];
  shoppingList: ShoppingListResult;
  scribeOutput: ScribeOutputResult;
}
