"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const admin_controller_1 = require("./admin.controller");
const admin_service_1 = require("./admin.service");
const app_controller_1 = require("./app.controller");
const attempts_controller_1 = require("./attempts.controller");
const attempts_service_1 = require("./attempts.service");
const auth_controller_1 = require("./auth.controller");
const auth_service_1 = require("./auth.service");
const prisma_service_1 = require("./prisma.service");
const public_controller_1 = require("./public.controller");
const security_controller_1 = require("./security.controller");
const security_service_1 = require("./security.service");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        controllers: [
            app_controller_1.AppController,
            auth_controller_1.AuthController,
            public_controller_1.PublicController,
            attempts_controller_1.AttemptsController,
            admin_controller_1.AdminController,
            security_controller_1.SecurityController,
        ],
        providers: [
            prisma_service_1.PrismaService,
            auth_service_1.AuthService,
            security_service_1.SecurityService,
            attempts_service_1.AttemptsService,
            admin_service_1.AdminService,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map