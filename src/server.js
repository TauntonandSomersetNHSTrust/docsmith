const autoLoad = require("@fastify/autoload");
const fp = require("fastify-plugin");
const path = require("upath");
const secJSON = require("secure-json-parse");

// Import plugins
const accepts = require("@fastify/accepts");
const bearer = require("@fastify/bearer-auth");
const compress = require("@fastify/compress");
const helmet = require("@fastify/helmet");
const disableCache = require("fastify-disablecache");
const flocOff = require("fastify-floc-off");
const rateLimit = require("@fastify/rate-limit");
const sensible = require("@fastify/sensible");
const staticPlugin = require("@fastify/static");
const swagger = require("@fastify/swagger");
const underPressure = require("@fastify/under-pressure");
const serializeJsonToXml = require("./plugins/serialize-json-to-xml");
const sharedSchemas = require("./plugins/shared-schemas");

// Import local decorator plugins
const embedHtmlImages = require("./plugins/embed-html-images");
const imageToTxt = require("./plugins/image-to-txt");
const tidyCss = require("./plugins/tidy-css");
const tidyHtml = require("./plugins/tidy-html");

/**
 * @author Frazer Smith
 * @description Build Fastify instance.
 * @param {object} server - Fastify instance.
 * @param {object} config - Fastify configuration values.
 */
async function plugin(server, config) {
	// Register plugins
	await server
		// Accept header handler
		.register(accepts)

		// Support Content-Encoding
		.register(compress, { inflateIfDeflated: true })

		// Set response headers to disable client-side caching
		.register(disableCache)

		// Opt-out of Google's FLoC advertising-surveillance network
		.register(flocOff)

		// Use Helmet to set response security headers: https://helmetjs.github.io/
		.register(helmet, config.helmet)

		// Utility functions and error handlers
		.register(sensible, { errorHandler: false })

		// Serialization support for XML responses
		.register(serializeJsonToXml)

		// Reusable schemas
		.register(sharedSchemas)

		// Generate OpenAPI/Swagger schemas
		.register(swagger, config.swagger)

		// Process load and 503 response handling
		.register(underPressure, config.processLoad)

		// HTML and CSS parsing plugins used in routes
		.register(embedHtmlImages, config.poppler)
		.register(tidyCss)
		.register(tidyHtml);

	if (config.tesseract.enabled === true) {
		await server.register(imageToTxt, config.tesseract);
	}

	await server
		// Rate limiting and 429 response handling
		.register(rateLimit, config.rateLimit);

	// Register routes
	await server
		/**
		 * `x-xss-protection` and `content-security-policy` is set by default by Helmet.
		 * These are only useful for HTML/XML content; the only CSP directive that
		 * is of use to other content is "frame-ancestors 'none'" to stop responses
		 * from being wrapped in iframes and used for clickjacking attacks
		 */
		.addHook("onSend", async (req, res, payload) => {
			if (
				!res.getHeader("content-type")?.includes("html") &&
				!res.getHeader("content-type")?.includes("xml")
			) {
				res.header(
					"content-security-policy",
					"default-src 'self';frame-ancestors 'none'"
				);
				res.raw.removeHeader("x-xss-protection");
			}
			return payload;
		})

		// Import and register admin routes
		.register(autoLoad, {
			dir: path.joinSafe(__dirname, "routes", "admin"),
			options: { ...config, prefix: "admin" },
		})

		/**
		 * Encapsulate plugins and routes into a secured child context, so that admin and
		 * docs routes do not inherit the bearer token auth plugin.
		 * See https://fastify.io/docs/latest/Reference/Encapsulation/ for more info
		 */
		.register(async (securedContext) => {
			if (config.bearerTokenAuthKeys) {
				await securedContext.register(bearer, {
					keys: config.bearerTokenAuthKeys,
					errorResponse: (err) => ({
						statusCode: 401,
						error: "Unauthorized",
						message: err.message,
					}),
				});
			}

			await securedContext
				// Import and register service routes
				.register(autoLoad, {
					dir: path.joinSafe(__dirname, "routes"),
					ignorePattern: /(admin|docs)/,
					options: config,
				});
		})

		/**
		 * Encapsulate the docs routes into a child context, so that the
		 * CSP can be relaxed, and cache enabled, without impacting
		 * security of other routes
		 */
		.register(async (publicContext) => {
			const relaxedHelmetConfig = secJSON.parse(
				JSON.stringify(config.helmet)
			);
			Object.assign(
				relaxedHelmetConfig.contentSecurityPolicy.directives,
				{
					"script-src": ["'self'", "'unsafe-inline'"],
					"style-src": ["'self'", "'unsafe-inline'"],
					"child-src": ["'self'"],
				}
			);

			await publicContext
				// Set relaxed response headers
				.register(helmet, relaxedHelmetConfig)

				// Register static files in public
				.register(staticPlugin, {
					root: path.joinSafe(__dirname, "public"),
					immutable: true,
					maxAge: "365 days",
				})
				.register(autoLoad, {
					dir: path.joinSafe(__dirname, "routes", "docs"),
					options: { ...config, prefix: "docs" },
				});
		})

		// Rate limit 404 responses
		.setNotFoundHandler(
			{
				preHandler: server.rateLimit(),
			},
			(req, res) => {
				res.notFound(`Route ${req.method}:${req.url} not found`);
			}
		)

		// Errors thrown by routes and plugins are caught here
		.setErrorHandler(async (err, req, res) => {
			if (
				(err.statusCode >= 500 &&
					/* istanbul ignore next: under-pressure plugin throws valid 503s */
					err.statusCode !== 503) ||
				/**
				 * Uncaught errors will have a res.statusCode but not
				 * an err.statusCode as @fastify/sensible sets that
				 */
				(res.statusCode === 200 && !err.statusCode)
			) {
				res.log.error(err);
				return res.internalServerError();
			}

			throw err;
		});
}

module.exports = fp(plugin, { fastify: "4.x", name: "server" });
