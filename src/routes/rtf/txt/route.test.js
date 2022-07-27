const accepts = require("@fastify/accepts");
const fs = require("fs/promises");
const Fastify = require("fastify");
const isHtml = require("is-html");
const sensible = require("@fastify/sensible");
const route = require(".");
const getConfig = require("../../../config");
const sharedSchemas = require("../../../plugins/shared-schemas");

describe("RTF-to-TXT route", () => {
	let config;
	let server;

	beforeAll(async () => {
		config = await getConfig();

		server = Fastify();
		await server
			.register(accepts)
			.register(sensible)
			.register(sharedSchemas)
			.register(route, config)
			.ready();
	});

	afterAll(async () => {
		await server.close();
	});

	test("Should return RTF file converted to TXT", async () => {
		const response = await server.inject({
			method: "POST",
			url: "/",
			body: await fs.readFile(
				"./test_resources/test_files/valid_rtf.rtf"
			),
			headers: {
				accept: "application/json, text/plain",
				"content-type": "application/rtf",
			},
		});

		expect(response.payload).toEqual(
			expect.stringContaining("Ask not what your country can do for you")
		);
		expect(isHtml(response.payload)).toBe(false);
		expect(response.headers).toMatchObject({
			"content-type": "text/plain",
		});
		expect(response.statusCode).toBe(200);
	});

	test("Should return HTTP status code 415 if file is missing", async () => {
		const response = await server.inject({
			method: "POST",
			url: "/",

			headers: {
				accept: "application/json, text/plain",
				"content-type": "application/rtf",
			},
		});

		expect(JSON.parse(response.payload)).toEqual({
			error: "Unsupported Media Type",
			message: "Unsupported Media Type",
			statusCode: 415,
		});
		expect(response.statusCode).toBe(415);
	});

	test("Should return HTTP status code 415 if file with '.rtf' extension is not a valid RTF file", async () => {
		const response = await server.inject({
			method: "POST",
			url: "/",
			body: await fs.readFile(
				"./test_resources/test_files/invalid_rtf.rtf"
			),
			query: {
				lastPageToConvert: 1,
			},
			headers: {
				accept: "application/json, text/plain",
				"content-type": "application/rtf",
			},
		});

		expect(JSON.parse(response.payload)).toEqual({
			error: "Unsupported Media Type",
			message: "Unsupported Media Type",
			statusCode: 415,
		});
		expect(response.statusCode).toBe(415);
	});

	test("Should return HTTP status code 415 if file media type is not supported by route", async () => {
		const response = await server.inject({
			method: "POST",
			url: "/",
			body: await fs.readFile(
				"./test_resources/test_files/valid_empty_html.html"
			),
			headers: {
				accept: "application/json, text/plain",
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

	test("Should return HTTP status code 406 if media type in `Accept` request header is unsupported", async () => {
		const response = await server.inject({
			method: "POST",
			url: "/",
			body: await fs.readFile(
				"./test_resources/test_files/valid_rtf.rtf"
			),
			headers: {
				accept: "application/javascript",
				"content-type": "application/rtf",
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
