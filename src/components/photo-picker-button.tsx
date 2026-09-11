import { Camera, Image as ImageIcon } from "lucide-react";
import type { ChangeEvent } from "react";
import { useRef } from "react";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { isImageFile } from "#/lib/image-capture";

type PhotoPickerButtonProps = {
	onPhotoSelected: (file: File) => void;
	disabled?: boolean;
};

// Two entry points into the same feature, shown differently per platform
// since they aren't actually equivalent everywhere:
//  - Mobile has two genuinely distinct native experiences (the camera app vs.
//    the photo library), so it gets a menu and a camera icon (the more novel
//    of the two actions).
//  - Desktop mostly doesn't have a real camera hand-off — `capture` is
//    unreliable there and browsers just reopen the same file dialog — so a
//    second option would be a dead end. Desktop skips the menu entirely and
//    opens the file picker directly, with an image icon (there's only one
//    action: attach a photo).
// Both ultimately hand off to the browser/OS's own picker UI — nothing here
// renders a custom gallery or camera view.
export function PhotoPickerButton({
	onPhotoSelected,
	disabled,
}: PhotoPickerButtonProps) {
	const galleryInputRef = useRef<HTMLInputElement | null>(null);
	const cameraInputRef = useRef<HTMLInputElement | null>(null);

	function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		// Reset immediately so choosing the same file again still fires onChange.
		event.target.value = "";
		if (file && isImageFile(file)) {
			onPhotoSelected(file);
		}
	}

	return (
		<>
			<input
				ref={galleryInputRef}
				type="file"
				accept="image/*"
				onChange={handleFileChange}
				className="hidden"
				aria-hidden="true"
				tabIndex={-1}
			/>
			<input
				ref={cameraInputRef}
				type="file"
				accept="image/*"
				capture="environment"
				onChange={handleFileChange}
				className="hidden"
				aria-hidden="true"
				tabIndex={-1}
			/>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="secondary"
						aria-label="Add a photo"
						disabled={disabled}
						className="size-10 shrink-0 rounded-full border-0 bg-transparent p-0 text-ink-dim hover:bg-bg2 sm:hidden"
					>
						<Camera className="size-[18px]" aria-hidden="true" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					<DropdownMenuItem onSelect={() => cameraInputRef.current?.click()}>
						<Camera className="size-4" aria-hidden="true" />
						Take Photo
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => galleryInputRef.current?.click()}>
						<ImageIcon className="size-4" aria-hidden="true" />
						Choose from Gallery
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Button
				type="button"
				variant="secondary"
				aria-label="Add a photo"
				disabled={disabled}
				onClick={() => galleryInputRef.current?.click()}
				className="hidden size-10 shrink-0 rounded-full border-0 bg-transparent p-0 text-ink-dim hover:bg-bg2 sm:inline-flex"
			>
				<ImageIcon className="size-[18px]" aria-hidden="true" />
			</Button>
		</>
	);
}
