import { GROCERY_CATEGORIES } from "#/lib/grocery-category";

// Shared between every prompt that asks Groq to name/categorize a grocery
// ingredient — recipe generation, continuation, modification, and the
// categorize-ingredients migration's cleanup pass (see
// src/lib/migrations/categorize-recipe-ingredients.ts) — so the rule's
// wording can never drift out of sync between call sites, and a later
// rewording only has to happen once.
export const BASENAME_RULE = `baseName rule: baseName is what a shopper would look for or ask for at a grocery store — never a preparation method. Different prep styles of the same product share ONE baseName, with the prep pushed into description instead (e.g. "garlic, chopped" and "garlic, minced" are both baseName "garlic" — you can't buy "chopped garlic" or "minced garlic" as a distinct grocery item, only garlic prepared differently). But genuinely different products, cuts, or forms get their OWN baseName, even when the everyday ingredient name overlaps: this covers cuts (e.g. "chicken breast" and "chicken legs" are different baseNames, not "chicken" + a description, because they're sold as separate cuts/products at the store) and equally covers buyable form (e.g. "black pepper" (peppercorns) and "black pepper, ground" are different baseNames, not baseName "black pepper" + description "ground" — a jar of peppercorns and a jar of ground pepper are different things to shop for, unlike a same-day kitchen step; same logic for garlic vs. garlic powder, or fresh tomatoes vs. canned tomatoes). baseName should also default to singular for a countable ingredient (e.g. "onion", "egg", "carrot" — not "onions"/"eggs"/"carrots") so the same ingredient keeps one consistent baseName no matter how many a given recipe calls for — the quantity field already carries the count; the one exception is an ingredient only ever referred to in plural form in everyday grocery language (e.g. "oats", "noodles", "grits", "greens") — use whichever form a shopper would actually recognize.`;

// Built from the shared category list (src/lib/grocery-category.ts) rather
// than spelled out by hand in each prompt, so the prompt text can never
// drift out of sync with what the schema actually accepts.
export const GROCERY_CATEGORY_ENUM_LIST = GROCERY_CATEGORIES.map(
	(category) => `"${category}"`,
).join(" | ");

export const CATEGORY_RULE = `category rule: pick whichever of the listed categories the ingredient would actually be shelved under at a grocery store (e.g. chicken breast -> "Meat & Seafood", milk -> "Dairy & Eggs", flour -> "Pantry", frozen peas -> "Frozen"). Use "Other" only when none of the rest genuinely fit.`;
