import { Button } from "#/components/ui/button";
import type { Recipe } from "#/lib/recipe";

export type PendingRow = {
	localId: string;
	prompt: string;
	status: "loading" | "error";
	message?: string;
};

export function PendingResultRow({
	row,
	onRetry,
}: {
	row: PendingRow;
	onRetry: (prompt: string, localId: string) => void;
}) {
	if (row.status === "loading") {
		return (
			<output className="block rounded-[18px] border border-border bg-card p-4">
				<p className="text-sm text-muted-foreground">
					Simmering your “{row.prompt}”…
				</p>
			</output>
		);
	}

	return (
		<div className="rounded-[18px] border border-border bg-destructive/10 p-4">
			<p className="text-sm text-destructive">{row.message}</p>
			<Button
				variant="secondary"
				className="mt-3"
				onClick={() => onRetry(row.prompt, row.localId)}
			>
				Retry
			</Button>
		</div>
	);
}

export function RecipeResultRow({ recipe }: { recipe: Recipe }) {
	return (
		<div className="rounded-[18px] border border-border bg-card p-4">
			<h3 className="display-title text-lg">{recipe.title}</h3>
			<p className="mt-1 text-sm text-muted-foreground">{recipe.prompt}</p>
		</div>
	);
}
