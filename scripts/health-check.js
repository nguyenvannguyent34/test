"use strict";

const port = Number(process.env.PORT || 3000);
const request = require("node:http").get(
  `http://127.0.0.1:${port}/api/public/health`,
  (response) => {
    let body = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => {
      body += chunk;
    });
    response.on("end", () => {
      if (response.statusCode !== 200) {
        console.error(`Health check thất bại: HTTP ${response.statusCode}`);
        process.exitCode = 1;
        return;
      }
      console.log(body);
    });
  },
);

request.setTimeout(5000, () => request.destroy(new Error("Hết thời gian chờ")));
request.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

