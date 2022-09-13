const CleanCSS = require("clean-css");
const cssEsc = require("cssesc");
const CSSOM = require("cssom");
const fp = require("fastify-plugin");
const { JSDOM } = require("jsdom");

/**
 * @author Frazer Smith
 * @description Decorator plugin that adds function that parses,
 * tidies, and minifies CSS in `<style>` elements in HTML passed.
 * @param {object} server - Fastify instance.
 */
async function plugin(server) {
	const cssCleaner = new CleanCSS({ compatibility: "ie7" });

	/**
	 * @param {string} html - Valid HTML.
	 * @param {object} options - Function config values.
	 * @param {string=} options.backgroundColor - Color to replace document's original
	 * `background-color` CSS property for `<div>` elements with.
	 * @param {string=} options.fonts - Font to replace document's original font(s), can be
	 * single font or comma separated list i.e `Arial, Sans Serif`.
	 * @returns {string} HTML with tidied CSS.
	 */
	function tidyCss(html, options = {}) {
		const dom = new JSDOM(html);
		let styles = dom.window.document.querySelectorAll("style");

		let newBackgroundColor;
		if (options.backgroundColor) {
			newBackgroundColor = String(options.backgroundColor);
		}

		let newFonts;
		if (options.fonts) {
			newFonts = String(options.fonts);
		}

		// Create style element inside head if none already exist
		if (styles.length === 0 && (newFonts || newBackgroundColor)) {
			const element = dom.window.document.createElement("style");
			element.innerHTML = "div {}";
			dom.window.document.head.appendChild(element);

			styles = dom.window.document.querySelectorAll("style");
		}

		// Combine style elements into single element
		const combinedStyle = dom.window.document.createElement("style");
		styles.forEach((style) => {
			const element = style;
			combinedStyle.innerHTML += element.innerHTML;
			element.remove();
		});
		// element.remove() leaves behind empty lines
		dom.window.document.head.innerHTML =
			dom.window.document.head.innerHTML.replace(/^\s*[\r\n]/gm, "");

		let styleObj = CSSOM.parse(combinedStyle.innerHTML);
		styleObj.cssRules.forEach((styleRule) => {
			// Replace default font
			if (
				newFonts &&
				(styleRule.style["font-family"] || styles.length === 1)
			) {
				styleRule.style.setProperty("font-family", newFonts);
			}

			/**
			 * Font family names containing any non-alphabetical characters
			 * other than hyphens should be quoted.
			 * See https://www.w3.org/TR/css-fonts-4/#family-name-syntax
			 */
			if (styleRule.style["font-family"]) {
				const fonts = styleRule.style["font-family"].split(",");
				const parsedFonts = fonts.map((font) => {
					if (/[^a-zA-Z-]+/.test(font.trim())) {
						// Stop escaping of <style> elements and code injection
						return cssEsc(font.replace(/<\/style>/gm, "").trim(), {
							quotes: "double",
							wrap: true,
						});
					}
					return font.trim();
				});

				styleRule.style.setProperty(
					"font-family",
					parsedFonts.join(", ")
				);
			}

			/**
			 * Stop pages overrunning the next page, leading to overlapping text.
			 * "page-break-inside" is a legacy property, replaced by "break-inside".
			 * "page-break-inside" should be treated by browsers as an alias of "break-inside"
			 */
			if (styleRule.selectorText.substring(0, 3) === "div") {
				styleRule.style.setProperty("page-break-inside", "avoid");

				// Replace default color
				if (newBackgroundColor) {
					styleRule.style.setProperty(
						"background-color",
						newBackgroundColor
					);
				}
			}
		});

		/**
		 * Minifies output whilst also removing HTML comment tags
		 * wrapping CSS and redundant semi-colons generated by Poppler.
		 */
		styleObj = styleObj.toString();
		combinedStyle.innerHTML = cssCleaner.minify(styleObj).styles;

		dom.window.document.head.appendChild(combinedStyle);

		return dom.serialize();
	}

	server.decorate("tidyCss", tidyCss);
}

module.exports = fp(plugin, { fastify: "4.x", name: "tidy-css" });
