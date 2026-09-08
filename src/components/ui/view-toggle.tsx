import { BookOpen, ShoppingCart } from "lucide-react";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

export type ResultsView = "recipes" | "grocery";

const OPTIONS: Array<{
	value: ResultsView;
	label: string;
	icon: typeof BookOpen;
}> = [
	{ value: "recipes", label: "Recipes", icon: BookOpen },
	{ value: "grocery", label: "Grocery lists", icon: ShoppingCart },
];

export function ViewToggle({
	value,
	onChange,
}: {
	value: ResultsView;
	onChange: (view: ResultsView) => void;
}) {
	return (
		<fieldset className="inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1">
			<legend className="sr-only">Results view</legend>
			{OPTIONS.map((option) => {
				const active = option.value === value;
				const Icon = option.icon;
				return (
					<Button
						key={option.value}
						variant={active ? "primary" : "secondary"}
						aria-pressed={active}
						aria-label={option.label}
						className={cn(
							"rounded-full border-0 px-3 py-1.5",
							!active && "bg-transparent",
						)}
						onClick={() => onChange(option.value)}
					>
						<Icon className="size-4" aria-hidden="true" />
					</Button>
				);
			})}
		</fieldset>
	);
}
