import type { LucideIcon } from "lucide-react";
import {
	ChefHat,
	Lock,
	ShoppingCart,
	Smartphone,
	Sparkles,
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
				"Describe any dish in plain language and get a full recipe back — measured ingredients and clear steps, generated for you.",
		},
		{
			icon: ChefHat,
			title: "Cook mode",
			description:
				"A focused, full-screen walkthrough of your steps while you cook, so you never lose your place.",
		},
		{
			icon: ShoppingCart,
			title: "Smart grocery lists",
			description:
				"Pull ingredients from several recipes into one list — matching quantities merge automatically.",
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
