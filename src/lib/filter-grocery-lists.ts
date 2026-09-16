import type { GroceryList } from "./grocery-list";

// Simple client-side name filter for the Grocery Lists screen — mirrors
// filter-recipes.ts's shape, but grocery lists have no other filterable
// dimension today (no difficulty/favorites equivalent).
export function filterGroceryLists(
	lists: GroceryList[],
	search: string,
): GroceryList[] {
	const query = search.trim().toLowerCase();
	if (!query) return lists;
	return lists.filter((list) => list.name.toLowerCase().includes(query));
}
