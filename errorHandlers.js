'use strict';

export function loadErrorHandlers(fastify) {
	// General error handler
	fastify.setErrorHandler(function (error, request, reply) {
		this.log.error(error);

		const errorStatusCodes = {
			400: 'Bad Request',
			401: 'Unauthorised',
			402: 'Payment Required',
			403: 'Forbidden',
			404: 'Not Found',
			405: 'Method Not Allowed',
			406: 'Not Acceptable',
			407: 'Proxy Authentication Required',
			408: 'Request Timeout',
			409: 'Conflict',
			410: 'Gone',
			411: 'Length Required',
			412: 'Precondition Failed',
			413: 'Payload Too Large',
			414: 'URI Too Long',
			415: 'Unsupported Media Type',
			416: 'Range Not Satisfiable',
			417: 'Expectation Failed',
			418: 'I\'m a teapot',
			421: 'Misdirected Request',
			422: 'Unprocessable Content',
			423: 'Locked',
			424: 'Failed Dependency',
			425: 'Too Early',
			426: 'Upgrade Required',
			428: 'Precondition Required',
			429: 'Too Many Requests',
			431: 'Request Header Fields Too Large',
			451: 'Unavailable For Legal Reasons',
			500: 'Internal Server Error',
			501: 'Not Implemented',
			502: 'Bad Gateway',
			503: 'Service Unavailable',
			504: 'Gateway Timeout',
			505: 'HTTP Version Not Supported',
			506: 'Variant Also Negotiates',
			507: 'Insufficient Storage',
			508: 'Loop Detected',
			510: 'Not Extended',
			511: 'Network Authentication Required',
		};

		error.statusCode	= ('statusCode' in error) ? error.statusCode : 500;
		error.publicMessage = 'Sorry, an error has occurred on our system. Our team has been notified with the details and we will look into it ASAP.';

		return reply.status(error.statusCode).send({
			error: error
		});
	});

	// 404 handler
	fastify.setNotFoundHandler({
			preValidation: (req, reply, done) => {
				done();
			},
			preHandler: (req, reply, done) => {
				done();
			}
		},
		function (request, reply) {
			let error = new Error('Route not found: `' + request.url + '`');
			this.log.info(error);

			error.statusCode	= 404;
			error.publicMessage = error.message;

			return reply.status(404).send({
				error: error
			});
		}
	);
}