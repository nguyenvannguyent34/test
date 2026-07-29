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
exports.AttemptsController = void 0;
const common_1 = require("@nestjs/common");
const attempts_service_1 = require("./attempts.service");
const auth_service_1 = require("./auth.service");
const security_service_1 = require("./security.service");
let AttemptsController = class AttemptsController {
    attempts;
    auth;
    security;
    constructor(attempts, auth, security) {
        this.attempts = attempts;
        this.auth = auth;
        this.security = security;
    }
    async start(request, deviceSessionId, body) {
        return this.attempts.start(await this.auth.requireMutation(request, "CANDIDATE"), body.integrityAccepted, deviceSessionId);
    }
    async current(request, deviceSessionId) {
        return this.attempts.current(await this.auth.require(request, "CANDIDATE"), deviceSessionId);
    }
    async get(request, id, deviceSessionId) {
        const session = await this.auth.require(request);
        if (session.role === "CANDIDATE" && session.participantId) {
            await this.security.assertDevice(Number(id), session.participantId, deviceSessionId);
        }
        return this.attempts.get(session, Number(id));
    }
    async question(request, id, order, deviceSessionId) {
        return this.attempts.getQuestion(await this.auth.require(request, "CANDIDATE"), Number(id), Number(order), deviceSessionId);
    }
    async saveAnswers(request, id, deviceSessionId, body) {
        return this.attempts.saveAnswers(await this.auth.requireMutation(request, "CANDIDATE"), Number(id), Number(body.version), Array.isArray(body.answers) ? body.answers : [], deviceSessionId);
    }
    async submit(request, id, idempotencyKey, deviceSessionId) {
        const session = await this.auth.requireMutation(request);
        if (session.role === "CANDIDATE" && session.participantId) {
            await this.security.assertDevice(Number(id), session.participantId, deviceSessionId);
        }
        return this.attempts.submit(session, Number(id), idempotencyKey);
    }
};
exports.AttemptsController = AttemptsController;
__decorate([
    (0, common_1.Post)("start"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Headers)("x-device-session")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AttemptsController.prototype, "start", null);
__decorate([
    (0, common_1.Get)("current"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Headers)("x-device-session")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AttemptsController.prototype, "current", null);
__decorate([
    (0, common_1.Get)(":id"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Headers)("x-device-session")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], AttemptsController.prototype, "get", null);
__decorate([
    (0, common_1.Get)(":id/questions/:order"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Param)("order")),
    __param(3, (0, common_1.Headers)("x-device-session")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], AttemptsController.prototype, "question", null);
__decorate([
    (0, common_1.Patch)(":id/answers"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Headers)("x-device-session")),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], AttemptsController.prototype, "saveAnswers", null);
__decorate([
    (0, common_1.Post)(":id/submit"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Headers)("idempotency-key")),
    __param(3, (0, common_1.Headers)("x-device-session")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], AttemptsController.prototype, "submit", null);
exports.AttemptsController = AttemptsController = __decorate([
    (0, common_1.Controller)("attempts"),
    __metadata("design:paramtypes", [attempts_service_1.AttemptsService,
        auth_service_1.AuthService,
        security_service_1.SecurityService])
], AttemptsController);
//# sourceMappingURL=attempts.controller.js.map