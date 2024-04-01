# SES PostfixAdmin Bounce Handler

A very simple system to facilitate gaining SES production access for a domain *(i.e. getting out of Sandbox mode)*. Production use isn't granted without bounce / complaint handling and this allows a very basic method of handling SNS topic webhooks that will pass the SES customer service checks.

This system assumes that you are using Postfix and PostfixAdmin to manage a simple mailserver and wish to relay outgoing emails using SES as one of the channels. 

## Dependencies

This project requires a *PostgreSQL* or *MySQL / MariaDB / Aurora* database in order to run. It also expects [PostfixAdmin](https://github.com/postfixadmin/postfixadmin) to be used and configured.

## Installation

Install [Node.js](https://nodejs.org/en/download) and [PM2](https://pm2.io/) (globally) to manage the application:
 
`npm i pm2 -g`

Install the project dependencies:

`npm i`

Create a `.env` file *(starting from the `.env-sample`)* file and place it in the project root. Ensure that database details are configured. Any number of domains may be added, but the PostfixAdmin database must be configured, along with database credentials for each other domain used *(they may all be the same)* - see the SQL queries below.

To start the application in dev mode:

`npm run dev`

Or to start in production mode:

`npm start`

Open [http://localhost:4010](http://localhost:4010) to view it in the browser.

## Additional Tables Required

The system logs the emails in the site databases, but also adds rules to the Postfix transport maps so that the users are not contacted again from the Postfix server *(in the case of bounces / complaints)*. 

### PostfixAdmin database

The following tables should be manually added to the PostfixAdmin database:

#### PostgreSQL

```sql
CREATE TABLE IF NOT EXISTS "transport_option"
(
	"transport_option_id" serial CONSTRAINT "transport_option_transport_option_id_pk" PRIMARY KEY,
	"name"                varchar,
	"description"         varchar
);

INSERT INTO "public"."transport_option" 
	("transport_option_id", "name", "description") 
		VALUES 
	(1, 'REJECT', 'Prevents sending and generates a notice to the sender'),
	(2, 'DISCARD', 'Prevents sending by silently removing the message'),
	(3, 'LOCAL', 'Enforces delivering the email to the local server, not to a relay'),
	(4, 'RELAY:[smtp-relay.sendinblue.com]:587', 'Relays this email to SendInBlue'),
	(5, 'RELAY:[email-smtp.eu-west-2.amazonaws.com]:587', 'Relays this email to SES');

ALTER SEQUENCE "transport_option_transport_option_id_seq" RESTART WITH 6;

CREATE TABLE IF NOT EXISTS "transport_maps"
(
	"domain"              varchar,
	"username"            varchar,
	"transport_option_id" integer,
	"active"              boolean,
	
	CONSTRAINT "transport_maps_domain_username_key" UNIQUE ("domain", "username")
);

CREATE INDEX IF NOT EXISTS "transport_maps_domain_username_idx" ON "transport_maps" ("domain", "username");
CREATE INDEX IF NOT EXISTS "transport_maps_domain_username_active_idx" ON "transport_maps" ("domain", "username", "active");
CREATE INDEX IF NOT EXISTS "transport_maps_domain_idx" ON "transport_maps" ("domain");
CREATE INDEX IF NOT EXISTS "transport_maps_transport_option_id_idx" ON "transport_maps" ("transport_option_id");
```

#### MySQL

```sql
CREATE TABLE IF NOT EXISTS `transport_option` (
	`transport_option_id` int(11) NOT NULL AUTO_INCREMENT,
	`name`                varchar(255) NOT NULL,
	`description`         varchar(255) NOT NULL,
	
	PRIMARY KEY (`transport_option_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  
INSERT INTO `transport_option` 
	(`transport_option_id`, `name`, `description`)
		VALUES
	(1, 'REJECT', 'Prevents sending and generates a notice to the sender'),
	(2, 'DISCARD', 'Prevents sending by silently removing the message'),
	(3, 'LOCAL', 'Enforces delivering the email to the local server, not to a relay'),
	(4, 'RELAY:[smtp-relay.sendinblue.com]:587', 'Relays this email to SendInBlue'),
	(5, 'RELAY:[email-smtp.eu-west-2.amazonaws.com]:587', 'Relays this email to SES');

CREATE TABLE IF NOT EXISTS `transport_maps` (
	`domain`              varchar(255) NOT NULL,
	`username`            varchar(255) NOT NULL,
	`transport_option_id` int(11) NOT NULL,
	`active`              tinyint(1) NOT NULL DEFAULT 1,
	
	UNIQUE KEY `unique_domain_username` (`domain`,`username`),
	KEY `username` (`username`),
	KEY `index_domain_username` (`domain`,`username`) USING BTREE,
	KEY `domain` (`domain`) USING BTREE,
	KEY `index_domain_username_active` (`domain`,`username`,`active`),
	KEY `transport_option_id` (`transport_option_id`)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

### Domain specific database

The following tables should be manually added to **each** domain's database:

#### PostgreSQL

```sql
CREATE TABLE IF NOT EXISTS "email_bounce"
(
	"message_id" serial CONSTRAINT "email_bounce_message_id_pk" PRIMARY KEY,
	"date"       timestamp,
	"service"    varchar,
	"domain"     varchar,
	"email"      varchar,
	"from"       varchar,
	"subject"    varchar,
	"ip"         varchar,
	"type"       varchar,
	"status"     varchar,
	"details"    varchar
);

CREATE INDEX IF NOT EXISTS "email_bounce_date_idx" ON "email_bounce" ("date");
CREATE INDEX IF NOT EXISTS "email_bounce_domain_idx" ON "email_bounce" ("domain");
CREATE INDEX IF NOT EXISTS "email_bounce_email_idx" ON "email_bounce" ("email");

CREATE TABLE IF NOT EXISTS "email_complaint"
(
	"message_id" serial CONSTRAINT "email_complaint_message_id_pk" PRIMARY KEY,
	"date"       timestamp,
	"service"    varchar,
	"domain"     varchar,
	"email"      varchar,
	"from"       varchar,
	"subject"    varchar,
	"ip"         varchar,
	"type"       varchar
);

CREATE INDEX IF NOT EXISTS "email_complaint_date_idx" ON "email_complaint" ("date");
CREATE INDEX IF NOT EXISTS "email_complaint_domain_idx" ON "email_complaint" ("domain");
CREATE INDEX IF NOT EXISTS "email_complaint_email_idx" ON "email_complaint" ("email");

CREATE TABLE IF NOT EXISTS "email_delivery"
(
	"message_id" serial CONSTRAINT "email_delivery_message_id_pk" PRIMARY KEY,
	"date"       timestamp,
	"service"    varchar,
	"domain"     varchar,
	"email"      varchar,
	"from"       varchar,
	"subject"    varchar,
	"ip"         varchar
);

CREATE INDEX IF NOT EXISTS "email_delivery_date_idx" ON "email_delivery" ("date");
CREATE INDEX IF NOT EXISTS "email_delivery_domain_idx" ON "email_delivery" ("domain");
CREATE INDEX IF NOT EXISTS "email_delivery_email_idx" ON "email_delivery" ("email");
```

#### MySQL

```sql
CREATE TABLE IF NOT EXISTS `email_bounce` (
	`message_id`  varchar(255) NOT NULL,
	`date`        datetime NOT NULL,
	`service`     varchar(255) NOT NULL,
	`domain`      varchar(255) NOT NULL,
	`email`       varchar(255) NOT NULL,
	`from`        varchar(255) NOT NULL,
	`subject`     varchar(255) NOT NULL,
	`ip`          varchar(255) NOT NULL,
	`type`        varchar(255) NOT NULL,
	`status`      varchar(255) NOT NULL,
	`details`     varchar(255) NOT NULL,
	
	PRIMARY KEY (`message_id`),
	KEY `email` (`email`),
	KEY `domain` (`domain`),
	KEY `date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE IF NOT EXISTS `email_complaint` (
	`message_id` varchar(255) NOT NULL,
	`date`       datetime NOT NULL,
	`service`    varchar(255) NOT NULL,
	`domain`     varchar(255) NOT NULL,
	`email`      varchar(255) NOT NULL,
	`from`       varchar(255) NOT NULL,
	`subject`    varchar(255) NOT NULL,
	`ip`         varchar(255) NOT NULL,
	`type`       varchar(255) NOT NULL,
	
	PRIMARY KEY (`message_id`),
	KEY `email` (`email`),
	KEY `domain` (`domain`),
	KEY `date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE IF NOT EXISTS `email_delivery` (
  `message_id` varchar(255) NOT NULL,
  `date`       datetime NOT NULL,
  `service`    varchar(255) NOT NULL,
  `domain`     varchar(255) NOT NULL,
  `email`      varchar(255) NOT NULL,
  `from`       varchar(255) NOT NULL,
  `subject`    varchar(255) NOT NULL,
  `ip`         varchar(255) NOT NULL,
  
  PRIMARY KEY (`message_id`),
  KEY `email` (`email`),
  KEY `domain` (`domain`),
  KEY `date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;
```

## Postfix SQL Files

It is assumed that if you are using this system, that you are using SES from Postfix and using Postfix Admin to manage it, thus you will have most of the virtual aliases configured already. Only a couple of extra queries will be needed to add the transport maps related queries to it.

You will need two additional files *(your locations may vary!)*:

### PostgreSQL

```sh
sudo nano /etc/postfix/sql/transport_maps_email.cf
```

```
user     = postfixadmin_database_user
password = postfixadmin_database_password
hosts    = localhost
dbname   = postfixadmin_database_name
query    = SELECT name AS transport FROM transport_maps INNER JOIN transport_option ON transport_option.transport_option_id = transport_maps.transport_option_id WHERE username = '%s' AND domain = '%d' AND active = true LIMIT 1
```

```sh
sudo nano /etc/postfix/sql/transport_maps_domain.cf
```

```
user     = postfixadmin_database_user
password = postfixadmin_database_password
hosts    = localhost
dbname   = postfixadmin_database_name
query    = SELECT name AS transport FROM transport_maps INNER JOIN transport_option ON transport_option.transport_option_id = transport_maps.transport_option_id WHERE domain = '%s' AND username = '' AND active = true LIMIT 1
```

Add these to the main Postfix config file:

```sh
sudo nano /etc/postfix/main.cf
```

```
transport_maps = hash:/etc/postfix/transport,
                 proxy:pgsql:/etc/postfix/sql/transport_maps_email.cf,
                 proxy:pgsql:/etc/postfix/sql/transport_maps_domain.cf
```

### MySQL

Almost identical to the PostgreSQL version, but not quite...

```sh
sudo nano /etc/postfix/sql/transport_maps_email.cf
```

```
user     = postfixadmin_database_user
password = postfixadmin_database_password
hosts    = localhost
dbname   = postfixadmin_database_name
query    = SELECT name AS transport FROM transport_maps INNER JOIN transport_option ON transport_option.transport_option_id = transport_maps.transport_option_id WHERE username = '%s' AND domain = '%d' AND active = 1 LIMIT 1
```

```sh
sudo nano /etc/postfix/sql/transport_maps_domain.cf
```

```
user     = postfixadmin_database_user
password = postfixadmin_database_password
hosts    = localhost
dbname   = postfixadmin_database_name
query    = SELECT name AS transport FROM transport_maps INNER JOIN transport_option ON transport_option.transport_option_id = transport_maps.transport_option_id WHERE domain = '%s' AND username = '' AND active = 1 LIMIT 1
```

Add these to the main Postfix config file:

```sh
sudo nano /etc/postfix/main.cf
```

```
transport_maps = hash:/etc/postfix/transport,
                 proxy:mysql:/etc/postfix/sql/transport_maps_email.cf,
                 proxy:mysql:/etc/postfix/sql/transport_maps_domain.cf
```

## Linking to SES

**Before doing this, the service must be configured and running.**

It is assumed that you will use a secure, reverse proxy to make this service publicly available *(e.g. Nginx, Apache, Lighttpd, Caddy, IIS etc)* and that the service will be available on a subdomain; for this example we will use: `ses.mydomain.com`. Setting this up is outside the scope of this readme, but Nginx, Let's Encrypt and Route 53 have plenty of guides.

You will have 3 POST endpoints for this service:

 - https://ses.mydomain.com/bounces/
 - https://ses.mydomain.com/complaints/
 - https://ses.mydomain.com/deliveries/
 
SES is regional, so for this guide I'm going to assume my home region of London (`eu-west-2`), but you should use the one where you will be sending from.

On your [SES homepage](https://eu-west-2.console.aws.amazon.com/ses/home?region=eu-west-2), choose *"Identities"* from the menu and scroll down until there are tabs. From there choose *"Notifications"* and select *"Edit"* from the *"Feedback notifications"* section. This is the interface where 3 separate SNS topics must be added for each of the above endpoints **per domain**.

Link each item in turn by clicking on "Create SNS topic" and defining sensible ARNs / display names, for example:

 - ARN: `ses_mydomain_com-bounces`
 - Display name: `MyDomain_Bounce_Notificatons`

 - ARN: `ses_mydomain_com-complaints`
 - Display name: `MyDomain_Complaint_Notificatons`
 
 - ARN: `ses_mydomain_com-deliveries`
 - Display name: `MyDomain_Delivery_Notificatons`

Then attach these to the matching SES feedback items, including the original email headers.

In the [SNS dashboard](https://eu-west-2.console.aws.amazon.com/sns/v3/home?region=eu-west-2#/dashboard), choose *"Topics"* from the menu and the topics from above should be listed there. For each one, a subscription needs to be added.

Click on each topic in turn and press "Create subscription". Choose HTTPS as the Protocol and enter the relevant endpoint in the box. Press "Create subscription".

Lines for each will appear in the app logs starting with:

```
 SUBSCRIPTION REQUEST: 
 ```
 
The logs can easily be tailed with the command:

```
npm run logs
```