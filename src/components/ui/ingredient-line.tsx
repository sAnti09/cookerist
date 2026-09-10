import { cn } from "#/lib/utils";

type IngredientLineProps = {
	quantity: string;
	name: string;
	checked?: boolean;
	className?: string;
};

// Renders an ingredient/grocery item's quantity+unit visually separate from
// its name (dimmed, so the name reads as the primary text) rather than as
// one combined string.
export function IngredientLine({
	quantity,
	name,
	checked,
	className,
}: IngredientLineProps) {
	return (
		<span className={cn(checked && "text-ink-dim line-through", className)}>
			<span className="mr-1.5 whitespace-nowrap tabular-nums text-ink-dim">
				{quantity}
			</span>
			<span>{name}</span>
		</span>
	);
}
