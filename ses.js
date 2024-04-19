'use strict';

import crypto from 'crypto';

export default class SES {
	constructor(fastify, request, reply) {
		this._fastify	= fastify;
		this._request	= request;
		this._reply		= reply;

		this._connections = {};
	}

	async bounce() {
		const post = await this.parse();

		if ('Timestamp' in post) {
			const data = {
				timestamp:			post.Timestamp,
				notification_type:	post.Message.notificationType,
				bounce_type:		post.Message.bounce.bounceType,
				bounce_sub_type:	post.Message.bounce.bounceSubType,
				bounced_recipients:	post.Message.bounce.bouncedRecipients,
				message_id:			post.Message.mail.messageId,
				ip:					post.Message.mail.sourceIp,
				from:				post.Message.mail.source,
				subject:			post.Message.mail.commonHeaders.subject,
				emails:				[],
				details:			[],
			};

			for (const bounced_recipients of data.bounced_recipients) {
				data.emails.push(bounced_recipients.emailAddress);
				data.details[bounced_recipients.emailAddress] = bounced_recipients;
			}

			const sender_domain = data.from.split('@', 2)[1];

			for (const email of data.emails) {
				let [username, domain] = email.split('@');

				if (data.bounce_type === 'Permanent') {
					await this.query('postfix', 'transport_maps', {
						domain:					domain,
						username:				username,
						transport_option_id: 	2,
						active: 				true
					});
				}

				await this.query(sender_domain, 'email_bounce', {
					message_id: data.message_id,
					date:		data.timestamp,
					service:	'SES',
					domain:		domain,
					email:		email,
					from:		data.from,
					subject:	data.subject,
					ip:			data.ip,
					type:		data.bounce_type,
					status:		data.details[email].status,
					details:	data.details[email].diagnosticCode
				});
			}

			return this.response({ message: 'Bounce logged' });
		}

		return this.response();
	}

	async complaint() {
		const post = await this.parse();

		if ('Timestamp' in post) {
			const data = {
				timestamp:				post.Timestamp,
				notification_type:		post.Message.notificationType,
				complaint_type:			post.Message.complaint.complaintFeedbackType,
				complaint_sub_type:		post.Message.complaint.complaintSubType,
				complaint_recipients:	post.Message.complaint.complainedRecipients,
				message_id:				post.Message.mail.messageId,
				ip:						post.Message.mail.sourceIp,
				from:					post.Message.mail.source,
				subject:				post.Message.mail.commonHeaders.subject,
				emails:					[],
			};

			for (const complaint_recipients of data.complaint_recipients) {
				data.emails.push(complaint_recipients.emailAddress);
			}

			const sender_domain = data.from.split('@', 2)[1];

			for (const email of data.emails) {
				let [username, domain] = email.split('@');

				await this.query('postfix', 'transport_maps', {
					domain:					domain,
					username:				username,
					transport_option_id: 	2,
					active: 				true
				});

				await this.query(sender_domain, 'email_complaint', {
					message_id: data.message_id,
					date:		data.timestamp,
					service:	'SES',
					domain:		domain,
					email:		email,
					from:		data.from,
					subject:	data.subject,
					ip:			data.ip,
					type:		data.complaint_type
				});
			}

			return this.response({ message: 'Complaint logged' });
		}

		return this.response();
	}

	async delivery() {
		const post = await this.parse();

		if ('Timestamp' in post) {
			const data = {
				timestamp:	post.Timestamp,
				message_id:	post.Message.mail.messageId,
				ip:			post.Message.mail.sourceIp,
				from:		post.Message.mail.source,
				subject:	post.Message.mail.commonHeaders.subject,
				emails:		post.Message.mail.destination,
			};

			const sender_domain = data.from.split('@', 2)[1];

			for (const email of data.emails) {
				let [username, domain] = email.split('@');

				await this.query(sender_domain, 'email_delivery', {
					message_id: data.message_id,
					date:		data.timestamp,
					service:	'SES',
					domain:		domain,
					email:		email,
					from:		data.from,
					subject:	data.subject,
					ip:			data.ip
				});
			}

			return this.response({ message: 'Delivery logged' });
		}

		return this.response();
	}

	async parse() {
		let post = this._request.body;
		if (typeof post === 'string') {
			post = JSON.parse(post);
		}

		const valid = await this.validate(post);

		if (valid) {
			if (post.Type === 'SubscriptionConfirmation') {
				this._request.log.info('SUBSCRIPTION REQUEST: ' + post.SubscribeURL);
				return {};
			}

			post.Message = JSON.parse(post.Message);

			return post;
		}

		return {};
	}
	
	async validate(post) {
		const mustContain = ['Signature', 'SignatureVersion', 'SigningCertURL', 'Message', 'MessageId', 'Timestamp', 'TopicArn', 'Type'];
		for (const item of mustContain) {
			if (!(item in post)) {
				return false;
			}
		}

		if (!/^https:\/\/sns\.[a-zA-Z0-9-]{3,}\.amazonaws\.com(\.cn)?\/SimpleNotificationService-[a-zA-Z0-9]{32}\.pem$/.test(post.SigningCertURL)) {
			return false;
		}

		let validationFields = [];
		if (post.Type === 'SubscriptionConfirmation' || post.Type === 'UnsubscribeConfirmation') {
			validationFields = ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
		} else {
			validationFields = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'];
		}

		const response		= await fetch(post.SigningCertURL);
		const certificate	= await response.text();

		const verify = crypto.createVerify('sha1WithRSAEncryption');
		for (const validationField of validationFields) {
			if (validationField in post) {
				verify.write(`${validationField}\n${post[validationField]}\n`);
			}
		}
		verify.end();

		return verify.verify(certificate, post.Signature, 'base64');
	}

	response(data) {
		const def = {
			status:		200,
			message:	'ok',
		};

		return this._reply
			.header('Content-Type', 'application/json; charset=utf-8')
			.send(Object.assign({}, def, data));
	}

	async query(connection_name, table, data) {
		if ('pg' in this._fastify && connection_name in this._fastify.pg) {
			if (!(connection_name in this._connections)) {
				this._connections[connection_name] = await this._fastify.pg[connection_name].connect();
			}

			const params		= [];
			const fields		= [];
			const placeholders	= [];

			let i = 1;
			for (const [field, value] of Object.entries(data)) {
				fields.push('"' + field + '"');
				params.push(value);
				placeholders.push('$' + i);
				i++;
			}

			const sql = `INSERT INTO "` + table + `" (` + fields.join(', ') + `) VALUES (` + placeholders.join(', ') + `) ON CONFLICT DO NOTHING`;

			return await this._connections[connection_name].query(sql, params);
		} else if ('mysql' in this._fastify && connection_name in this._fastify.mysql) {
			if (!(connection_name in this._connections)) {
				this._connections[connection_name] = await this._fastify.mysql[connection_name].getConnection();
			}

			const params		= [];
			const fields		= [];
			const placeholders	= [];

			for (const [field, value] of Object.entries(data)) {
				fields.push('`' + field + '`');
				params.push(value);
				placeholders.push('?');
			}

			const sql = "INSERT IGNORE INTO `" + table + "` (" + fields.join(', ') + ") VALUES (" + placeholders.join(', ') + ")";

			return await this._connections[connection_name].query(sql, params);
		}

		this._fastify.log.error('No database handler defined named: ' + connection_name);

		return 0;
	}
}