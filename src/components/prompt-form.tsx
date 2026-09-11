import { Send } from "lucide-react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { PhotoPickerButton } from "#/components/photo-picker-button";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";

type PromptFormProps = {
	value: string;
	onChange: (value: string) => void;
	onSubmit: (prompt: string) => void;
	onPhotoSelected: (file: File) => void;
	disabled?: boolean;
};

export function PromptForm({
	value,
	onChange,
	onSubmit,
	onPhotoSelected,
	disabled,
}: PromptFormProps) {
	function trySubmit() {
		const trimmed = value.trim();
		if (!trimmed) return;
		onChange("");
		onSubmit(trimmed);
	}

	function handleSubmit(event: FormEvent) {
		event.preventDefault();
		trySubmit();
	}

	// Enter submits, same as clicking the button — Shift+Enter still inserts
	// a newline, matching the common chat-input convention.
	function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
		if (event.key !== "Enter" || event.shiftKey) return;
		event.preventDefault();
		trySubmit();
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="card flex items-center gap-2 rounded-[28px] bg-surface py-[0.4rem] pr-[0.4rem] pl-[0.4rem] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
		>
			<PhotoPickerButton
				onPhotoSelected={onPhotoSelected}
				disabled={disabled}
			/>
			<Textarea
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="What do you want to cook — or what's in your fridge?"
				rows={1}
				aria-label="Describe a dish"
				disabled={disabled}
				className="py-2 text-base"
			/>
			<Button
				type="submit"
				aria-label="Get recipe"
				disabled={disabled || value.trim().length === 0}
				className="size-10 shrink-0 rounded-full p-0"
			>
				<Send className="size-4" />
			</Button>
		</form>
	);
}
