export function scaleQuantity(
	baseQuantity: number,
	baseServings: number,
	currentServings: number,
): number {
	if (baseServings <= 0) return baseQuantity;
	return (baseQuantity * currentServings) / baseServings;
}

export function formatQuantity(quantity: number): string {
	const rounded = Math.round(quantity * 100) / 100;
	return rounded.toString();
}
