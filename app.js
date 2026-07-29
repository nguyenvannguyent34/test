"use strict";

process.env.NODE_ENV ||= "production";
process.env.DATABASE_URL ||= "file:./production.db";
process.env.WEB_DIST ||= "public";
process.env.HOST ||= "0.0.0.0";

require("./dist/main.js");

