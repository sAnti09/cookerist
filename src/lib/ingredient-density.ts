// Approximate ingredient densities (grams per milliliter), used to bridge
// mass and volume units for the same ingredient when merging the grocery
// list — e.g. "2 cups sugar" + "500 g sugar" both become a gram total, since
// nobody can buy "2 cups" of anything at a store. These are deliberately
// approximate (real density varies by brand, sifting, packing, etc.) — the
// goal is a shoppable estimate, not a precise conversion.
//
// Sourced from USDA FoodData Central's SR Legacy dataset (food_portion.csv,
// release 2018-04): for each food with a cup/tablespoon/teaspoon portion, we
// took its gram_weight and this module's own volume constants (see
// unit-conversion.ts — 1 cup = 236.588 mL, 1 tbsp = 14.7868 mL, 1 tsp =
// 4.92892 mL) to compute density = gram_weight / (amount * mL_per_unit).
// A handful of values are hand-corrected instead (search "manual:" below)
// where the raw SR Legacy portion doesn't represent what a recipe means by
// the ingredient — e.g. its only "heavy cream" cup portion is the aerated,
// already-whipped volume, not the pourable liquid a recipe measures out.
//
// Multi-word keys are checked before their single-word "generic" fallback
// (see lookupIngredientDensity), so a specific product (e.g. "brown sugar")
// gets its own value instead of falling through to the generic one
// ("sugar"). Each single-word generic was checked against the risk the
// existing "sugar snap peas" test documents — matching only the *last* word
// of an ingredient name means a generic entry like "cheese" or "milk" never
// fires on a phrase where that word is a modifier rather than the head noun
// (e.g. "cream cheese", "coconut milk" — both have their own explicit
// multi-word entry below, checked first regardless).
const DENSITY_TABLE: Record<string, number> = {
	// Multi-word overrides (checked before their single-word generic fallback)
	"active dry yeast": 0.811,
	"almond butter": 1.057,
	"baking powder": 0.933,
	"balsamic vinegar": 1.078,
	"bay leaf": 0.122,
	"bay leaves": 0.122,
	"beef broth": 1.014,
	"beef stock": 1.014,
	"black beans": 0.82,
	"black pepper": 0.467,
	"brazil nuts": 0.562,
	"bread crumbs": 0.457,
	"bread flour": 0.579,
	"brown sugar": 0.93,
	"buckwheat flour": 0.507,
	"cake flour": 0.579,
	"canola oil": 0.921,
	"cayenne pepper": 0.358,
	"cheddar cheese": 0.558,
	"chicken broth": 1.014,
	"chicken stock": 1.014,
	chickpeas: 0.845,
	"chili powder": 0.541,
	// No pure chocolate-chip portion in SR Legacy (only mixed trail mix);
	// manual: proxied from plain semisweet chocolate instead.
	"chocolate chips": 0.719,
	"coconut milk": 0.955,
	"coconut oil": 0.921,
	"confectioners sugar": 0.507,
	// No SR Legacy cup/tbsp/tsp portion for cottage cheese; manual: ~225 g per
	// cup is a widely-cited figure (nutrition labels, recipe conversion
	// charts) for this wet curd cheese — far closer to water than to the
	// generic "cheese" entry below (an aged/hard cheese, cheddar).
	"cottage cheese": 0.951,
	"cream cheese": 0.981,
	"cream of tartar": 0.609,
	"curry powder": 0.426,
	"dry milk": 0.541,
	"evaporated milk": 1.065,
	"feta cheese": 0.634,
	"flax seeds": 0.71,
	"garbanzo beans": 0.845,
	"garlic powder": 0.656,
	"half and half": 1.023,
	// manual: SR Legacy's only cup portion for heavy/whipping cream is the
	// post-whip, aerated volume (~0.51 g/mL) — not what a recipe means by "1
	// cup heavy cream". Using a liquid-cream value consistent with
	// half-and-half's real SR Legacy figure (1.023) instead.
	"heavy cream": 1.014,
	"kidney beans": 0.778,
	"light cream": 1.014,
	"macadamia nuts": 0.566,
	"maple sugar": 0.609,
	"milk powder": 0.541,
	"mozzarella cheese": 0.363,
	"navy beans": 0.879,
	"oat flour": 0.44,
	"olive oil": 0.913,
	"onion powder": 0.467,
	"parmesan cheese": 0.423,
	"peanut butter": 1.091,
	"peanut oil": 0.913,
	"pine nuts": 0.571,
	"pinto beans": 0.816,
	"poppy seeds": 0.595,
	"poultry seasoning": 0.298,
	"powdered milk": 0.541,
	"powdered sugar": 0.507,
	"pumpkin pie spice": 0.379,
	"pumpkin seeds": 0.545,
	"rice flour": 0.668,
	"ricotta cheese": 1.048,
	"self rising flour": 0.528,
	"sesame oil": 0.921,
	"sesame seeds": 0.609,
	"sour cream": 0.972,
	"soy sauce": 1.078,
	"sunflower seeds": 0.566,
	"swiss cheese": 0.558,
	"tomato sauce": 1.036,
	"vegetable broth": 0.934,
	"vegetable oil": 0.921,
	"vegetable stock": 0.934,
	"wheat bran": 0.245,
	"wheat germ": 0.486,
	// manual: same post-whip-volume issue as "heavy cream" above.
	"whipping cream": 1.014,
	"white pepper": 0.48,
	"whole wheat flour": 0.507,
	"worcestershire sauce": 1.162,

	// Single-word generics (fallback when no more specific phrase matches)
	allspice: 0.406,
	almonds: 0.613,
	barley: 0.845,
	basil: 0.142,
	// manual: no dry/packaged-breadcrumb portion in SR Legacy — its only
	// cup-based figure is for soft fresh crumbs, much fluffier than the
	// dense, dried breadcrumbs most recipes call for.
	breadcrumbs: 0.457,
	butter: 0.96,
	buttermilk: 1.036,
	cardamom: 0.392,
	cashews: 0.579,
	cheese: 0.558,
	chocolate: 0.769,
	cinnamon: 0.527,
	cocoa: 0.363,
	coriander: 0.338,
	cornmeal: 0.664,
	cornstarch: 0.541,
	couscous: 0.731,
	cumin: 0.406,
	dill: 0.21,
	flour: 0.528,
	gelatin: 0.473,
	ginger: 0.352,
	hazelnuts: 0.486,
	honey: 1.433,
	ketchup: 1.014,
	lentils: 0.811,
	mace: 0.358,
	margarine: 0.96,
	marjoram: 0.115,
	mayonnaise: 0.93,
	milk: 1.031,
	molasses: 1.424,
	mustard: 1.052,
	nutmeg: 0.473,
	oats: 0.342,
	oil: 0.921,
	oregano: 0.203,
	paprika: 0.46,
	pasta: 0.385,
	pecans: 0.465,
	pistachios: 0.52,
	raisins: 0.697,
	rice: 0.782,
	rosemary: 0.223,
	saffron: 0.142,
	sage: 0.135,
	salt: 1.234,
	semolina: 0.706,
	shortening: 0.867,
	sugar: 0.845,
	tarragon: 0.122,
	thyme: 0.183,
	turmeric: 0.636,
	vinegar: 1.01,
	walnuts: 0.494,
	yogurt: 1.036,
};

const MAX_PHRASE_WORDS = 3;

function normalize(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Looks up an approximate density for an ingredient name by trying
// decreasing-length word suffixes against the table — e.g. for "extra virgin
// olive oil" it tries "virgin olive oil" (no match), then "olive oil"
// (match). This favors precision (a specific multi-word product) while
// still falling back to a generic single-word match (e.g. "granulated
// sugar" -> "sugar"), and correctly finds nothing for a name that merely
// contains a table word as a modifier rather than its head noun (e.g.
// "sugar snap peas" tries "snap peas" then "peas" — never bare "sugar" —
// so it isn't mistaken for the sugar entry).
export function lookupIngredientDensity(name: string): number | null {
	const words = normalize(name).split(" ").filter(Boolean);
	if (words.length === 0) return null;

	const maxTake = Math.min(MAX_PHRASE_WORDS, words.length);
	for (let take = maxTake; take >= 1; take--) {
		const phrase = words.slice(words.length - take).join(" ");
		const density = DENSITY_TABLE[phrase];
		if (density !== undefined) return density;
	}
	return null;
}
