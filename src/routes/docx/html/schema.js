const S = require("fluent-json-schema");

const tags = ["DOCX"];

/**
 * Fastify uses AJV for JSON Schema Validation,
 * see https://www.fastify.io/docs/latest/Validation-and-Serialization/
 *
 * This validation protects against XSS and HPP attacks.
 */
const docxToHtmlPostSchema = {
	tags,
	summary: "Convert DOCX documents to HTML format",
	operationId: "postDocxToHtml",
	consumes: [
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	],
	produces: ["text/html"],
	query: S.object().prop(
		"removeAlt",
		S.boolean().description("Remove the alt attribute from image tags")
	),
	response: {
		200: S.string(),
	},
};

module.exports = { docxToHtmlPostSchema };
