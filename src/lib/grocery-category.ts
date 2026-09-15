// Fixed set of store-aisle-style categories Groq picks from when tagging a
// generated ingredient (see the baseName/category rule in
// src/lib/groq/generate-recipe.ts) — used to group the grocery list by
// category (see grocery-list-detail.tsx). Kept intentionally small/compact:
// an earlier 13-category draft split shelf-stable pantry items into five
// near-identical buckets (grains/pasta/rice, canned/jarred, condiments,
// spices, baking/oils) that don't correspond to a real difference in where
// you'd walk in a store, and gave Groq too much room to inconsistently pick
// between near-duplicates for the same ingredient — collapsed into one
// "Pantry" bucket here instead.
export const GROCERY_CATEGORIES = [
	"Produce",
	"Meat & Seafood",
	"Dairy & Eggs",
	"Bakery",
	"Pantry",
	"Frozen",
	"Beverages",
	"Snacks",
	"Other",
] as const;

export type GroceryCategory = (typeof GROCERY_CATEGORIES)[number];

// Fallback for an ingredient with no category at all — either Groq's own
// catch-all pick, or an ingredient saved before this field existed (see
// `category?` on Ingredient/GroceryListItem).
export const DEFAULT_GROCERY_CATEGORY: GroceryCategory = "Other";
