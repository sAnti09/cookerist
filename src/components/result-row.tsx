import { Link } from "@tanstack/react-router";
import { Clock, Flame, Image as ImageIcon, Star } from "lucide-react";
import { Button } from "#/components/ui/button";
import { DifficultyBadge } from "#/components/ui/difficulty-badge";
import { isImageFile } from "#/lib/image-capture";
import {
	formatCaloriesPerServing,
	formatEstimatedTime,
	type Recipe,
} from "#/lib/recipe";

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
// nav-overhaul mockup, the row itself carries no action icons anymore
// (favorite/modify/delete all moved to the detail page's header); the
// favorite star here is a read-only status badge, shown only when the
// recipe is actually favorited.
export function RecipeResultRow({ recipe }: { recipe: Recipe }) {
	const date = new Date(recipe.createdAt).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});

	return (
		<Link
			to="/recipes/$recipeId"
			params={{ recipeId: recipe.id }}
			id={`recipe-${recipe.id}`}
			data-testid={`recipe-row-${recipe.id}`}
			className="card block scroll-mt-6 bg-card p-4 text-ink no-underline transition-colors hover:bg-bg2"
		>
			<h3 className="display-title text-lg text-ink">{recipe.title}</h3>
			<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-dim">
				<span>{date}</span>
				{recipe.difficulty ? (
					<DifficultyBadge difficulty={recipe.difficulty} />
				) : null}
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
		</Link>
	);
}
