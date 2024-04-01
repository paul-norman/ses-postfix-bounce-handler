'use strict';

import DotEnv					from 'dotenv';
import Fastify					from 'fastify';
import postgres					from '@fastify/postgres';
import mysql					from '@fastify/mysql';
import { loadErrorHandlers }	from './errorHandlers.js';
import SES						from './ses.js';

// Cannot change the Fastify logger later, so need to do this here
DotEnv.config();

const loggerConfig = {
	development: {
		transport: {
			target: 'pino-pretty',
			options: {
				translateTime:	'HH:MM:ss Z',
				ignore:			'pid,hostname,reqId',
				singleLine:		true,
			},
		},
		level: 'debug'
	},
	production: true,
	test: false,
}

// Global config options
const fastify = Fastify({
	logger: loggerConfig[process.env.NODE_ENV] ?? true
});

const databases = [];

if ('DB_POSTFIX_HOST' in process.env) {
	databases.push({
		host: process.env.DB_POSTFIX_HOST,
		type: process.env.DB_POSTFIX_TYPE,
		port: process.env.DB_POSTFIX_PORT,
		user: process.env.DB_POSTFIX_USER,
		pass: process.env.DB_POSTFIX_PASS,
		name: process.env.DB_POSTFIX_NAME,
	});
} else {
	console.log('Postfix admin database not specified')
	process.exit(1);
}

let i = 1;
let found = true;
while (found) {
	if ('DB' + i + '_DOMAIN' in process.env) {
		databases.push({
			domain: process.env['DB' + i + '_DOMAIN'],
			host: process.env['DB' + i + '_HOST'],
			type: process.env['DB' + i + '_TYPE'].toLowerCase(),
			port: process.env['DB' + i + '_PORT'],
			user: process.env['DB' + i + '_USER'],
			pass: process.env['DB' + i + '_PASS'],
			name: process.env['DB' + i + '_NAME'],
		});
	} else {
		found = false;
	}
	
	i++;
}

for (const database of databases) {
	const name = ('domain' in database) ? database.domain : 'postfix';
	
	if (database.type === 'postgres') {
		fastify.register(postgres, {
			name,
			host:		database.host,
			user:		database.user,
			password:	database.pass,
			port:		database.port,
			database:	database.name,
		});
	} else if (database.type === 'mysql' || database.type.startsWith('maria') || database.type.startsWith('aurora')) {
		fastify.register(mysql, {
			name,
			host:		database.host,
			user:		database.user,
			password:	database.pass,
			port:		database.port,
			database:	database.name,
		});
	}
}

fastify.get('/', async function (request, reply) {
	return reply.header('Content-Type', 'application/json; charset=utf-8').send({ running: true });
});
fastify.post('/bounce/', async function(request, reply) {
	return (new SES(fastify, request, reply)).bounce();
});
fastify.post('/complaint/', async function(request, reply) {
	return (new SES(fastify, request, reply)).complaint();
});
fastify.post('/delivery/', async function(request, reply) {
	return (new SES(fastify, request, reply)).delivery();
});

loadErrorHandlers(fastify);

// Start Fastify
const start = async () => {
	try {
		await fastify.listen({
			host: process.env.HOST,
			port: process.env.PORT,
		});
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};
await start();