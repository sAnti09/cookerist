// Generic one-time data migration runner. Cookerist has no backend/accounts
// (see CLAUDE.md) — every user's data lives only in their own browser's
// localStorage, already computed and persisted (e.g. a grocery list's items
// carry their own quantity/unit, not just references back to the recipes
// they were built from). When a computation changes — like the grocery list
// always displaying mass/volume in metric now — data saved under the old
// rule doesn't fix itself; it needs a one-time pass over what's already
// stored. `runMigrations` tracks which migrations have already run (per
// browser) so each one applies exactly once, ever.
//
// To add a new migration: write a module under this folder exporting a
// function that reads/rewrites the affected localStorage-backed data (see
// metric-grocery-units.ts for the shape), then add it to the `MIGRATIONS`
// array in index.ts with its own permanent id.

const COMPLETED_MIGRATIONS_STORAGE_KEY = "cookerist:completed-migrations";

export type Migration = {
	// Permanent, unique id — never reuse or rename once shipped, since this
	// is what marks the migration as already run for a given browser. A
	// renamed/reused id makes it run again (or never), not migrate in place.
	id: string;
	run: () => void;
};

function loadCompletedMigrationIds(): Set<string> {
	try {
		const raw = window.localStorage.getItem(COMPLETED_MIGRATIONS_STORAGE_KEY);
		if (!raw) return new Set();
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? new Set(parsed) : new Set();
	} catch {
		return new Set();
	}
}

function persistCompletedMigrationIds(ids: Set<string>): void {
	window.localStorage.setItem(
		COMPLETED_MIGRATIONS_STORAGE_KEY,
		JSON.stringify(Array.from(ids)),
	);
}

// Runs every migration in `migrations` that hasn't completed in this browser
// yet, in array order, then records it as completed — including when it
// throws, since a broken migration retrying (and potentially re-corrupting
// data) on every single page load is worse than a one-time data gap. Errors
// are logged, never thrown, so one bad migration can't block the rest or the
// app itself from loading.
export function runMigrations(migrations: readonly Migration[]): void {
	const completed = loadCompletedMigrationIds();
	let anyRun = false;

	for (const migration of migrations) {
		if (completed.has(migration.id)) continue;
		try {
			migration.run();
		} catch (error) {
			console.error(`Migration "${migration.id}" failed:`, error);
		}
		completed.add(migration.id);
		anyRun = true;
	}

	if (anyRun) persistCompletedMigrationIds(completed);
}
