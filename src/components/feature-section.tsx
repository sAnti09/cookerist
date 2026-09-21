import type { LucideIcon } from "lucide-react";
import {
	CalendarRange,
	ChefHat,
	Lock,
	RefreshCw,
	ShoppingCart,
	Smartphone,
	Sparkles,
	Wand2,
} from "lucide-react";
import type { ReactNode } from "react";
import { InstallAppButton } from "#/components/install-app-button";
import { cn } from "#/lib/utils";

type Feature = {
	icon: LucideIcon;
	title: string;
	description: ReactNode;
	action?: ReactNode;
};

function buildFeatures(onResetData: () => void): Feature[] {
	return [
		{
			icon: Sparkles,
			title: "AI-powered recipes",
			description:
				"Describe a dish — or snap a photo of one — and Cookerist builds a full recipe: measured ingredients, clear steps, and its own illustrative photo, scaled to however many servings you need.",
		},
		{
			icon: Wand2,
			title: "Refine any recipe",
			description:
				"Ask for a change — spicier, dairy-free, swap an ingredient — and get back a revised recipe with the differences highlighted before you accept it.",
		},
		{
			icon: ChefHat,
			title: "Cook mode",
			description:
				"A focused, full-screen walkthrough of your steps while you cook, with built-in timers for each one, so you never lose your place.",
		},
		{
			icon: CalendarRange,
			title: "Plan your week",
			description:
				"Generate a full week of meals at once — breakfast, lunch, and dinner — then swap in any dish you'd rather cook instead.",
		},
		{
			icon: ShoppingCart,
			title: "Grocery lists",
			description:
				"Pull ingredients from several recipes into one aisle-organized list — matching quantities merge automatically — then check them off hands-free while you're at the store.",
		},
		{
			icon: Smartphone,
			title: "Take it anywhere",
			description:
				"Install Cookerist on your home screen and use it like a native app — once a recipe is saved, it's yours to cook from with no signal required.",
			action: <InstallAppButton />,
		},
		{
			icon: RefreshCw,
			title: "Sync & share",
			description:
				"Pair your own devices to keep everything in sync, or share a single recipe, grocery list, or meal plan with someone else — no account or sign-up needed.",
		},
		{
			icon: Lock,
			title: "Private by design",
			description: (
				<>
					Your recipes live in this browser by default — nothing syncs anywhere
					unless you turn it on, and even then it's tied to a private code, not
					an account. You can also{" "}
					<button
						type="button"
						className="font-medium text-accent underline underline-offset-2 hover:text-ink"
						onClick={onResetData}
					>
						reset all data
					</button>{" "}
					anytime for a clean slate.
				</>
			),
		},
	];
}

export function FeatureSection({
	onResetData,
	className,
}: {
	onResetData: () => void;
	className?: string;
}) {
	const features = buildFeatures(onResetData);

	return (
		<div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", className)}>
			{features.map((feature) => (
				<div
					key={feature.title}
					className="card flex flex-col gap-2 bg-surface p-5 text-left"
				>
					<div className="flex items-center gap-2">
						<feature.icon
							className="size-5 shrink-0 text-accent"
							aria-hidden="true"
						/>
						<h3 className="display-title text-base font-semibold text-ink">
							{feature.title}
						</h3>
					</div>
					<p className="text-sm text-ink-dim">{feature.description}</p>
					{feature.action ? <div className="mt-1">{feature.action}</div> : null}
				</div>
			))}
		</div>
	);
}
