"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityController = void 0;
const common_1 = require("@nestjs/common");
const attempts_service_1 = require("./attempts.service");
const auth_service_1 = require("./auth.service");
const security_service_1 = require("./security.service");
let SecurityController = class SecurityController {
    security;
    attempts;
    auth;
    constructor(security, attempts, auth) {
        this.security = security;
        this.attempts = attempts;
        this.auth = auth;
    }
    async events(request, id, deviceSessionId, body) {
        const session = await this.auth.requireMutation(request, "CANDIDATE");
        const result = await this.security.recordEvents(session, Number(id), deviceSessionId, body.events, request);
        if (result.action === "AUTO_SUBMIT") {
            return {
                ...result,
                ...(await this.attempts.submit(session, Number(id), `integrity-${id}`)),
            };
        }
        return result;
    }
    async heartbeat(request, id, deviceSessionId) {
        return this.security.heartbeat(await this.auth.requireMutation(request, "CANDIDATE"), Number(id), deviceSessionId);
    }
    async dashboard(request) {
        await this.auth.require(request, "ADMIN");
        return this.security.dashboard();
    }
    async updatePolicy(request, body) {
        return this.security.updatePolicy(await this.auth.requireMutation(request, "ADMIN"), body);
    }
    async attemptEvents(request, id) {
        await this.auth.require(request, "ADMIN");
        return this.security.events(Number(id));
    }
    async unlock(request, id) {
        return this.security.unlock(await this.auth.requireMutation(request, "ADMIN"), Number(id));
    }
    async submit(request, id) {
        const session = await this.auth.requireMutation(request, "ADMIN");
        return this.attempts.submit(session, Number(id), `admin-security-${id}`);
    }
};
exports.SecurityController = SecurityController;
__decorate([
    (0, common_1.Post)("attempts/:id/security-events"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Headers)("x-device-session")),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "events", null);
__decorate([
    (0, common_1.Post)("attempts/:id/heartbeat"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Headers)("x-device-session")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "heartbeat", null);
__decorate([
    (0, common_1.Get)("admin/security"),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "dashboard", null);
__decorate([
    (0, common_1.Put)("admin/security/policy"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "updatePolicy", null);
__decorate([
    (0, common_1.Get)("admin/security/attempts/:id/events"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "attemptEvents", null);
__decorate([
    (0, common_1.Post)("admin/security/attempts/:id/unlock"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "unlock", null);
__decorate([
    (0, common_1.Post)("admin/security/attempts/:id/submit"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "submit", null);
exports.SecurityController = SecurityController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [security_service_1.SecurityService,
        attempts_service_1.AttemptsService,
        auth_service_1.AuthService])
], SecurityController);
//# sourceMappingURL=security.controller.js.map