// Client-side downscale before a photo goes to Groq for dish identification —
// keeps the request small (Groq caps images at 20MB and counts every image as
// a flat ~2048 input tokens regardless of size) and keeps mobile upload fast
// on a cellular connection. 1280px longest edge is generous for identifying a
// dish; there's no need to send a full-resolution photo for that.
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.8;

export function isImageFile(file: File): boolean {
	return file.type.startsWith("image/");
}

export function computeResizedDimensions(
	width: number,
	height: number,
	maxDimension: number = MAX_DIMENSION,
): { width: number; height: number } {
	if (width <= maxDimension && height <= maxDimension) {
		return { width, height };
	}
	const scale = maxDimension / Math.max(width, height);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

export async function compressImageToDataUrl(
	file: File,
	maxDimension: number = MAX_DIMENSION,
	quality: number = JPEG_QUALITY,
): Promise<string> {
	const bitmap = await createImageBitmap(file);
	try {
		const { width, height } = computeResizedDimensions(
			bitmap.width,
			bitmap.height,
			maxDimension,
		);
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			throw new Error("Could not get a 2D canvas context");
		}
		ctx.drawImage(bitmap, 0, 0, width, height);
		return canvas.toDataURL("image/jpeg", quality);
	} finally {
		bitmap.close();
	}
}
