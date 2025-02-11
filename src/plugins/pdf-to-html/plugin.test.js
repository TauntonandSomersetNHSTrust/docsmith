/* eslint-disable security/detect-non-literal-fs-filename */
const fs = require("fs/promises");
const Fastify = require("fastify");
const isHtml = require("is-html");
const { JSDOM } = require("jsdom");
const sensible = require("@fastify/sensible");
const plugin = require(".");
const getConfig = require("../../config");

/**
 * Used to check that common incorrectly converted Windows-1252
 * to UTF-8 values are removed by the `fix-utf8` module
 */
const artifacts =
	/â‚¬|â€š|Æ’|â€ž|â€¦|â€¡|Ë†|â€°|â€¹|Å½|â€˜|â€™|â€œ|â€¢|â€“|â€”|Ëœ|Å¡|Å¾|Å¸|Â¯|Â·|Â´|Â°|Ã‚|ï‚·|âˆš|�|Ã€|Ãƒ|Ã„|Ã…|Ã†|Ã‡|Ãˆ|Ã‰|ÃŠ|Ã‹|ÃŒ|ÃŽ|Ã‘|Ã’|Ã“|Ã”|Ã•|Ã–|Ã—|Ã˜|Ã™|Ãš|Ã›|Ãœ|Ãž|ÃŸ|Ã¡|Ã¢|Ã£|Ã¤|Ã¥|Ã¦|Ã§|Ã¨|Ã©|Ãª|Ã«|Ã¬|Ã­|Ã®|Ã¯|Ã°|Ã±|Ã²|Ã³|Ã´|Ãµ|Ã¶|Ã·|Ã¸|Ã¹|Ãº|Ã»|Ã¼|Ã½|Ã¾|Ã¿|â‰¤|â‰¥|Â|Ã|â€|�/g;

describe("PDF-to-HTML conversion plugin", () => {
	let config;
	let server;

	beforeAll(async () => {
		config = await getConfig();
		config.poppler.tempDir = "./src/temp-test-pdf-to-html/";

		server = Fastify();

		server.addContentTypeParser(
			"application/pdf",
			{ parseAs: "buffer" },
			async (_req, payload) => payload
		);

		await server.register(sensible).register(plugin, config.poppler);

		server.post("/", (req, res) => {
			res.header("content-type", "application/json").send(
				req.conversionResults
			);
		});

		await server.ready();
	});

	afterAll(async () => {
		await Promise.all([
			fs.rm(config.poppler.tempDir, { recursive: true }),
			server.close(),
		]);
	});

	// TODO: use `it.concurrent.each()` once it is no longer experimental
	it.each([
		{
			testName: "Converts PDF file to HTML",
		},
		{
			testName:
				"Converts PDF file to HTML and ignore invalid `test` query string param",
			query: {
				test: "test",
			},
		},
	])(`$testName`, async ({ query }) => {
		const response = await server.inject({
			method: "POST",
			url: "/",
			body: await fs.readFile(
				"./test_resources/test_files/pdf_1.3_NHS_Constitution.pdf"
			),
			query: {
				lastPageToConvert: 2,
				ignoreImages: false,
				...query,
			},
			headers: {
				"content-type": "application/pdf",
			},
		});

		const { body, docLocation } = JSON.parse(response.payload);
		const dom = new JSDOM(body);

		expect(body).not.toMatch(artifacts);
		expect(isHtml(body)).toBe(true);
		// Check only one meta and title element exists
		expect(dom.window.document.querySelectorAll("meta")).toHaveLength(1);
		expect(dom.window.document.querySelectorAll("title")).toHaveLength(1);
		// Check head element contains only a meta and title element in the correct order
		expect(dom.window.document.head.firstChild.tagName).toBe("META");
		expect(dom.window.document.head.firstChild).toMatchObject({
			content: expect.stringMatching(/^text\/html; charset=utf-8$/i),
			httpEquiv: expect.stringMatching(/^content-type$/i),
		});
		expect(
			dom.window.document.head.querySelector("title").textContent
		).toMatch(/^docsmith_pdf-to-html_/);
		// String found in first paragraph of the test document
		expect(dom.window.document.querySelector("p").textContent).toMatch(
			/for\sEngland\s/
		);
		// String found in last paragraph of the test document
		expect(
			dom.window.document.querySelectorAll("p")[
				dom.window.document.querySelectorAll("p").length - 1
			].textContent
		).toMatch(
			/a\sfull\sand\stransparent\sdebate\swith\sthe\spublic,\spatients\sand\sstaff.\s$/
		);
		// Check the docLocation object contains the expected properties
		expect(docLocation).toMatchObject({
			directory: expect.any(String),
			html: expect.stringMatching(/-html\.html$/i),
			id: expect.stringMatching(/^docsmith_pdf-to-html_/),
		});
		// Check the HTML file has been removed from the temp directory
		await expect(fs.readFile(docLocation.html)).rejects.toThrow();
		await expect(fs.readdir(config.poppler.tempDir)).resolves.toHaveLength(
			0
		);
		expect(response.statusCode).toBe(200);
	});

	// TODO: use `it.concurrent.each()` once it is no longer experimental
	it.each([
		{ testName: "is missing" },
		{
			testName: "is not a valid PDF file",
			readFile: true,
		},
	])(
		"Returns HTTP status code 400 if PDF file $testName",
		async ({ readFile }) => {
			const response = await server.inject({
				method: "POST",
				url: "/",
				headers: {
					"content-type": "application/pdf",
				},
				body: readFile
					? await fs.readFile(
							"./test_resources/test_files/invalid_pdf.pdf"
					  )
					: undefined,
			});

			expect(JSON.parse(response.payload)).toEqual({
				error: "Bad Request",
				message: "Bad Request",
				statusCode: 400,
			});
			expect(response.statusCode).toBe(400);
		}
	);
});
