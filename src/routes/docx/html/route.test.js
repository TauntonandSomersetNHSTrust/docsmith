const accepts = require("@fastify/accepts");
const fs = require("fs/promises");
const Fastify = require("fastify");
const isHtml = require("is-html");
const sensible = require("@fastify/sensible");
const route = require(".");
const getConfig = require("../../../config");
const sharedSchemas = require("../../../plugins/shared-schemas");

const tidyCss = require("../../../plugins/tidy-css");
const tidyHtml = require("../../../plugins/tidy-html");

describe("DOCX-to-HTML route", () => {
	let config;
	let server;

	beforeAll(async () => {
		config = await getConfig();

		server = Fastify();
		await server
			.register(accepts)
			.register(sensible)
			.register(sharedSchemas)
			.register(tidyCss)
			.register(tidyHtml)
			.register(route, config)
			.ready();
	});

	afterAll(async () => {
		await server.close();
	});

	it("Returns DOCX file converted to HTML", async () => {
		const response = await server.inject({
			method: "POST",
			url: "/",
			body: await fs.readFile(
				"./test_resources/test_files/valid_docx.docx"
			),
			query: {
				removeAlt: true,
			},
			headers: {
				accept: "application/json, text/html",
				"content-type":
					"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			},
		});

		expect(response.payload).toMatch(
			"Etiam vehicula luctus fermentum. In vel metus congue, pulvinar lectus vel, fermentum dui."
		);
		expect(isHtml(response.payload)).toBe(true);
		expect(response.headers).toMatchObject({
			"content-type": "text/html; charset=utf-8",
		});
		expect(response.statusCode).toBe(200);
	});

	it("Returns HTTP status code 415 if file is missing", async () => {
		const response = await server.inject({
			method: "POST",
			url: "/",

			headers: {
				accept: "application/json, text/html",
				"content-type":
					"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			},
		});

		expect(JSON.parse(response.payload)).toEqual({
			error: "Unsupported Media Type",
			message: "Unsupported Media Type",
			statusCode: 415,
		});
		expect(response.statusCode).toBe(415);
	});

	it("Returns HTTP status code 415 if file with '.docx' extension is not a valid DOCX file", async () => {
		const response = await server.inject({
			method: "POST",
			url: "/",
			body: await fs.readFile(
				"./test_resources/test_files/invalid_docx.docx"
			),
			query: {
				lastPageToConvert: 1,
			},
			headers: {
				accept: "application/json, text/html",
				"content-type":
					"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			},
		});

		expect(JSON.parse(response.payload)).toEqual({
			error: "Unsupported Media Type",
			message: "Unsupported Media Type",
			statusCode: 415,
		});
		expect(response.statusCode).toBe(415);
	});

	it("Returns HTTP status code 415 if file media type is not supported by route", async () => {
		const response = await server.inject({
			method: "POST",
			url: "/",
			body: await fs.readFile(
				"./test_resources/test_files/valid_empty_html.html"
			),
			headers: {
				accept: "application/json, text/html",
				"content-type": "application/html",
			},
		});

		expect(JSON.parse(response.payload)).toEqual({
			error: "Unsupported Media Type",
			message: "Unsupported Media Type: application/html",
			statusCode: 415,
		});
		expect(response.statusCode).toBe(415);
	});

	it("Returns HTTP status code 406 if media type in `Accept` request header is unsupported", async () => {
		const response = await server.inject({
			method: "POST",
			url: "/",
			body: await fs.readFile(
				"./test_resources/test_files/valid_docx.docx"
			),
			headers: {
				accept: "application/javascript",
				"content-type":
					"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			},
		});

		expect(JSON.parse(response.payload)).toEqual({
			error: "Not Acceptable",
			message: "Not Acceptable",
			statusCode: 406,
		});
		expect(response.statusCode).toBe(406);
	});
});
