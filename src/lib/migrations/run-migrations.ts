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

// A migration normally just returns void/undefined, which marks it
// completed unconditionally (see runMigrations) — the right default for a
// local, synchronous data rewrite that can't meaningfully "fail" outside a
// code bug. A migration that calls out to a network (Groq, currently only
// categorize-recipe-ingredients.ts) can genuinely fail for reasons that have
// nothing to do with its own logic — e.g. a mobile browser suspending a
// background fetch when the tab is backgrounded/screen-locked mid-request,
// which is exactly what happened in production: the migration "completed"
// having categorized zero ingredients, and — since completed is forever —
// never got another chance. Returning `{ retry: true }` instead tells
// runMigrations not to mark this attempt as done, so it tries again on the
// next page load rather than silently giving up forever on a transient
// failure. Reserve this for "made no progress at all" — a migration that
// got *some* real work done should still mark itself completed even if a
// few stragglers didn't make it, same "no entry beats a wrong guess"
// trade-off as everywhere else — otherwise a persistently-failing subset
// would retry every single load forever.
// Every existing migration's `run()` is typed `: void` (the natural type
// for "no return statement"), and that's still the common/default case
// here; only categorize-recipe-ingredients.ts's run() opts into the
// `{ retry }` arm.
// biome-ignore lint/suspicious/noConfusingVoidType: intentional, see above.
export type MigrationRunResult = void | { retry?: boolean };

export type Migration = {
	// Permanent, unique id — never reuse or rename once shipped, since this
	// is what marks the migration as already run for a given browser. A
	// renamed/reused id makes it run again (or never), not migrate in place.
	id: string;
	// May return a Promise — e.g. categorize-recipe-ingredients.ts calls out
	// to Groq — in which case runMigrations awaits it before moving on to the
	// next migration, but never blocks the caller itself (see index.tsx,
	// which fires runMigrations without awaiting it).
	run: () => MigrationRunResult | Promise<MigrationRunResult>;
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
// yet, in array order, awaiting each in turn — a synchronous migration's own
// localStorage side effects still happen before this function's first
// `await`, i.e. before it yields control back to an unawaited caller (see
// index.tsx), so it behaves exactly as it did when this runner was
// synchronous; only a genuinely async migration (network calls) actually
// defers. Each migration is marked completed once it returns or throws —
// including on a throw, since a broken migration retrying (and potentially
// re-corrupting data) on every single page load is worse than a one-time
// data gap — with one exception: a migration that explicitly returns
// `{ retry: true }` (see MigrationRunResult) is left off the completed list
// so it gets another attempt next time, for a failure that's plausibly
// transient (a network call) rather than a code bug. Completed ids are
// persisted immediately after each migration, not batched until the end, so
// a page closed mid-run doesn't lose credit for migrations that did finish.
// Errors are logged, never thrown, so one bad migration can't block the rest
// or the app itself.
export async function runMigrations(
	migrations: readonly Migration[],
): Promise<void> {
	const completed = loadCompletedMigrationIds();

	for (const migration of migrations) {
		if (completed.has(migration.id)) continue;
		let shouldRetry = false;
		try {
			const result = await migration.run();
			shouldRetry = result?.retry === true;
		} catch (error) {
			console.error(`Migration "${migration.id}" failed:`, error);
		}
		if (shouldRetry) continue;
		completed.add(migration.id);
		persistCompletedMigrationIds(completed);
	}
}
