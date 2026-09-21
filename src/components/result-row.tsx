import { Link } from "@tanstack/react-router";
import {
	ChefHat,
	Clock,
	Flame,
	Image as ImageIcon,
	Star,
	Trash2,
	Users,
} from "lucide-react";
import { Button } from "#/components/ui/button";
import { DifficultyBadge } from "#/components/ui/difficulty-badge";
import { isImageFile } from "#/lib/image-capture";
import {
	formatCaloriesPerServing,
	formatEstimatedTime,
	type Recipe,
} from "#/lib/recipe";
import { useSwipeRowActions } from "#/lib/use-swipe-row-actions";

export type PendingRow = {
	localId: string;
	prompt: string;
	status: "loading" | "error";
	message?: string;
	// True when the error is Groq's on-topic rejection rather than a
	// generation failure — retrying the exact same prompt would just fail
	// the same way again, so this row's Retry behaves differently (see
	// PendingResultRow below).
	offTopic?: boolean;
	// Present only for a photo-originated request — carries the compressed
	// image (so Retry can re-identify without asking the user to reselect a
	// photo) and a thumbnail to show in place of the flame icon while
	// loading. `stage` distinguishes the initial vision call from the normal
	// recipe generation that follows it, since there's no user-typed prompt
	// yet during "identifying".
	photo?: {
		previewUrl: string;
		dataUrl: string;
		stage: "identifying" | "generating";
	};
};

export function PendingResultRow({
	row,
	onRetry,
	onChoosePhoto,
}: {
	row: PendingRow;
	onRetry: (row: PendingRow) => void;
	// Only called for a photo that Groq identified as not being a dish —
	// there's no prompt text to hand back for editing there (unlike a typed
	// off-topic prompt), so instead of a "Retry" that would just repeat the
	// same rejection, this row goes straight into picking a different photo.
	onChoosePhoto: (row: PendingRow, file: File) => void;
}) {
	if (row.status === "loading") {
		return (
			<output className="card flex items-center gap-3 bg-card p-4">
				{row.photo ? (
					<img
						src={row.photo.previewUrl}
						alt=""
						className="size-10 shrink-0 rounded-[10px] object-cover"
					/>
				) : (
					<Flame
						className="flame-flicker size-5 shrink-0 text-accent"
						fill="currentColor"
						aria-hidden="true"
					/>
				)}
				<p className="text-sm text-ink-dim">
					{row.photo?.stage === "identifying"
						? "Identifying your photo…"
						: `Simmering your “${row.prompt}”…`}
				</p>
			</output>
		);
	}

	if (row.photo && row.offTopic) {
		return (
			<div className="card border-warn bg-warn-wash p-4">
				<p className="text-sm text-warn">{row.message}</p>
				<label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-input bg-transparent px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary">
					<ImageIcon className="size-4" aria-hidden="true" />
					Choose another photo
					<input
						type="file"
						accept="image/*"
						className="hidden"
						onChange={(event) => {
							const file = event.target.files?.[0];
							event.target.value = "";
							if (file && isImageFile(file)) onChoosePhoto(row, file);
						}}
					/>
				</label>
			</div>
		);
	}

	return (
		<div className="card border-warn bg-warn-wash p-4">
			<p className="text-sm text-warn">{row.message}</p>
			<Button variant="secondary" className="mt-3" onClick={() => onRetry(row)}>
				Retry
			</Button>
		</div>
	);
}

// Collapsed-only row — tapping navigates to the recipe's full-screen detail
// page (/recipes/$recipeId) instead of expanding in place. Per the
// nav-overhaul mockup, the row itself carries no *tappable* action icons
// (favorite/modify all moved to the detail page's header); the favorite star
// here is a read-only status badge, shown only when the recipe is actually
// favorited. Delete and (when the recipe has steps to cook) Cook are instead
// reached via swipe — see use-swipe-row-actions.ts — mirroring
// meal-plan-entry-row.tsx's gesture. `onCook` is omitted entirely for a
// recipe with no steps (nothing for "Start Cooking" to do), which also
// disables the right-swipe drag itself rather than revealing a dead panel.
export function RecipeResultRow({
	recipe,
	shared = false,
	onDelete,
	onCook,
}: {
	recipe: Recipe;
	// True when this recipe was shared *to* this account by someone else —
	// see CLAUDE.md's "Per-resource sharing" roadmap item.
	shared?: boolean;
	onDelete: () => void;
	onCook?: () => void;
}) {
	const date = new Date(recipe.createdAt).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
	const swipe = useSwipeRowActions<HTMLAnchorElement>({
		onSwipeLeft: onDelete,
		onSwipeRight: onCook,
	});

	return (
		<div className="relative overflow-hidden rounded-[18px]">
			{onCook ? (
				<div
					aria-hidden="true"
					className="absolute inset-y-0 left-0 flex w-[72px] flex-col items-center justify-center gap-1 bg-accent text-[11px] font-semibold text-primary-foreground"
				>
					<ChefHat className="size-4" aria-hidden="true" />
					Cook
				</div>
			) : null}
			<div
				aria-hidden="true"
				className="absolute inset-y-0 right-0 flex w-[72px] flex-col items-center justify-center gap-1 bg-warn text-[11px] font-semibold text-warn-wash"
			>
				<Trash2 className="size-4" aria-hidden="true" />
				Delete
			</div>
			<Link
				ref={swipe.ref}
				to="/recipes/$recipeId"
				params={{ recipeId: recipe.id }}
				id={`recipe-${recipe.id}`}
				data-testid={`recipe-row-${recipe.id}`}
				{...swipe.handlers}
				className="card flex min-h-28 translate-x-0 scroll-mt-6 items-stretch gap-3 overflow-hidden bg-card text-ink no-underline transition-transform duration-200"
			>
				{recipe.thumbnailUrl ? (
					// Full-bleed to the card's own edges (top/bottom/left) rather than
					// an inset square — the card's overflow-hidden + rounded-[18px]
					// clips the outer corners to match, so no rounding is needed here.
					// Width matches the row's min-h-28 floor so it renders as a
					// consistent square across every row regardless of how much
					// metadata a given recipe has (see the title's truncate above —
					// together these keep row height, and thus this crop, predictable
					// instead of varying per recipe).
					<img
						src={recipe.thumbnailUrl}
						alt=""
						className="w-28 shrink-0 object-cover"
					/>
				) : (
					// Placeholder while a thumbnail is pending/never generated — never
					// a broken-image icon, and never collapses away (would cause
					// layout shift the moment a real thumbnail does arrive). No retry
					// affordance here — that lives on the detail screen (see
					// _tabs.recipes_.$recipeId.tsx) rather than competing with this
					// row's own tap/swipe gestures.
					<div
						aria-hidden="true"
						className="flex w-28 shrink-0 items-center justify-center bg-bg2"
					>
						<Flame className="size-5 text-ink-dim" aria-hidden="true" />
					</div>
				)}
				<div className="flex min-w-0 flex-1 flex-col justify-center py-4 pr-4">
					<div className="flex items-center gap-1.5">
						<h3 className="display-title min-w-0 truncate text-lg text-ink">
							{recipe.title}
						</h3>
						{shared ? (
							<Users
								className="size-[15px] shrink-0 text-ink-dim"
								aria-label="Shared with you"
							/>
						) : null}
					</div>
					<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-dim">
						<span>{date}</span>
						{recipe.difficulty ? (
							<DifficultyBadge difficulty={recipe.difficulty} />
						) : null}
					</div>
					{recipe.estimatedMinutes != null ||
					recipe.caloriesPerServing != null ||
					recipe.favorite ? (
						<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-dim">
							{recipe.estimatedMinutes != null ? (
								<span className="inline-flex items-center gap-1 tabular-nums">
									<Clock className="size-3" aria-hidden="true" />
									{formatEstimatedTime(recipe.estimatedMinutes)}
								</span>
							) : null}
							{recipe.caloriesPerServing != null ? (
								<span className="inline-flex items-center gap-1 tabular-nums">
									<Flame className="size-3" aria-hidden="true" />
									{formatCaloriesPerServing(recipe.caloriesPerServing)}
								</span>
							) : null}
							{recipe.favorite ? (
								<Star
									className="size-3 fill-accent text-accent"
									aria-label="Favorited"
								/>
							) : null}
						</div>
					) : null}
				</div>
			</Link>
		</div>
	);
}
