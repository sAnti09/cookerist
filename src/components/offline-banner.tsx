import { WifiOff } from "lucide-react";

type OfflineBannerProps = {
	isOnline: boolean;
};

export function OfflineBanner({ isOnline }: OfflineBannerProps) {
	if (isOnline) return null;

	return (
		<output className="card mt-4 flex items-center gap-2 border-warn bg-warn-wash p-3">
			<WifiOff className="size-4 shrink-0 text-warn" aria-hidden="true" />
			<p className="text-sm text-warn">
				You're offline — AI features (recipe search and modification) aren't
				available right now, but your saved recipes are still here.
			</p>
		</output>
	);
}
