"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const app_module_1 = require("./app.module");
dotenv_1.default.config({ path: node_path_1.default.resolve(process.cwd(), ".env") });
dotenv_1.default.config({ path: node_path_1.default.resolve(process.cwd(), "../../.env") });
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const production = process.env.NODE_ENV === "production";
    const webOrigin = process.env.WEB_ORIGIN?.trim() ||
        (production ? "" : "http://127.0.0.1:5173");
    app.setGlobalPrefix("api");
    app.use((0, helmet_1.default)({
        crossOriginResourcePolicy: false,
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'"],
                imgSrc: ["'self'", "data:"],
                fontSrc: ["'self'"],
                connectSrc: ["'self'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                frameAncestors: ["'none'"],
            },
        },
        referrerPolicy: { policy: "no-referrer" },
    }));
    app.use((0, cookie_parser_1.default)());
    app.use((request, response, next) => {
        const unsafe = !["GET", "HEAD", "OPTIONS"].includes(request.method);
        const origin = request.headers.origin;
        let allowedOrigin = true;
        if (unsafe && origin) {
            if (webOrigin) {
                allowedOrigin = origin === webOrigin;
            }
            else {
                try {
                    allowedOrigin = new URL(origin).host === request.get("host");
                }
                catch {
                    allowedOrigin = false;
                }
            }
        }
        if (!allowedOrigin) {
            response.status(403).json({ message: "Nguồn yêu cầu không hợp lệ." });
            return;
        }
        next();
    });
    if (webOrigin) {
        app.enableCors({
            origin: webOrigin,
            credentials: true,
        });
    }
    app.enableShutdownHooks();
    const webDist = node_path_1.default.resolve(process.cwd(), process.env.WEB_DIST?.trim() || "public");
    const webIndex = node_path_1.default.join(webDist, "index.html");
    if (production && (0, node_fs_1.existsSync)(webIndex)) {
        app.use(express_1.default.static(webDist, {
            index: false,
            maxAge: "1d",
            setHeaders(response, filePath) {
                if (filePath.endsWith("index.html")) {
                    response.setHeader("Cache-Control", "no-store");
                }
            },
        }));
        app.use((request, response, next) => {
            if (request.method === "GET" &&
                !request.path.startsWith("/api/") &&
                request.path !== "/api") {
                response.setHeader("Cache-Control", "no-store");
                response.sendFile(webIndex);
                return;
            }
            next();
        });
    }
    await app.init();
    const port = Number(process.env.PORT ?? 3000);
    const host = process.env.HOST?.trim() || (production ? "0.0.0.0" : "127.0.0.1");
    await app.listen(port, host);
    console.log(`Thi CBKT đang chạy tại http://${host}:${port}`);
}
bootstrap().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
//# sourceMappingURL=main.js.map