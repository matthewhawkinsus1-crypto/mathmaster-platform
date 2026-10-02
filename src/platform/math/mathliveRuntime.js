/*
 * THE ONE PLACE THE MATH EDITOR IS LOADED — WITH ITS FONTS.
 *
 * MathLive draws with the KaTeX fonts. Left to itself it fetches them from
 * `./fonts/` beside its own script: /assets/fonts/ in a production build,
 * where the build publishes nothing. Hosting answers every one of those
 * requests with index.html, MathLive gives up ("The math fonts could not be
 * loaded", body class ML__fonts-did-not-load), and every math field a student
 * types in falls back to system fonts — fractions, radicals and exponents laid
 * out with the wrong metrics. Importing the package's own @font-face sheet
 * makes the build publish the fonts beside the rest of the assets; MathLive
 * then finds the families already registered and never fetches.
 *
 * Every component that mounts a math field or renders with MathLive imports
 * this instead of 'mathlive' (tests/platform/mathliveFonts.test.mjs), and
 * tests/browser/mathFontsProduction.mjs checks a production build.
 */
import 'mathlive';
import 'mathlive/fonts.css';
