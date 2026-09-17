import type { LucideIcon } from "lucide-react";
import {
	CalendarRange,
	Camera,
	ChefHat,
	ListChecks,
	Lock,
	ShoppingCart,
	Smartphone,
	Sparkles,
	Wand2,
	WifiOff,
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
				"Describe any dish in plain language and get a full recipe back — measured ingredients and clear steps, scaled instantly to however many servings you need.",
		},
		{
			icon: Camera,
			title: "Snap a photo to cook it",
			description:
				"Not sure what a dish is called? Take or upload a photo and Cookerist identifies it and builds the recipe for you.",
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
			title: "Smart grocery lists",
			description:
				"Pull ingredients from several recipes into one list, organized by grocery-store aisle — matching quantities merge automatically.",
		},
		{
			icon: ListChecks,
			title: "Guided shopping mode",
			description:
				"A hands-free, checklist-style view for the store, so checking things off while you shop is as easy as checking them off at home.",
		},
		{
			icon: WifiOff,
			title: "Works offline",
			description:
				"Once a recipe is saved, it's yours to cook from with no signal and no connection required.",
		},
		{
			icon: Smartphone,
			title: "Install on any phone",
			description:
				"Add Cookerist to your home screen and use it like a native app — no app store needed.",
			action: <InstallAppButton />,
		},
		{
			icon: Lock,
			title: "Private by design",
			description: (
				<>
					Everything lives only in this browser — no accounts, nothing sent to a
					server. You can also{" "}
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
