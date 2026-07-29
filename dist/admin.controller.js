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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const admin_service_1 = require("./admin.service");
const auth_service_1 = require("./auth.service");
const attempts_service_1 = require("./attempts.service");
let AdminController = class AdminController {
    admin;
    auth;
    attempts;
    constructor(admin, auth, attempts) {
        this.admin = admin;
        this.auth = auth;
        this.attempts = attempts;
    }
    session(request) {
        return this.auth.require(request, "ADMIN");
    }
    mutationSession(request) {
        return this.auth.requireMutation(request, "ADMIN");
    }
    async dashboard(request) {
        await this.session(request);
        return this.admin.dashboard();
    }
    async updateExam(request, body) {
        return this.admin.updateExam(await this.mutationSession(request), body);
    }
    async setExamStatus(request, id, body) {
        return this.admin.setExamStatus(await this.mutationSession(request), Number(id), String(body.status ?? ""));
    }
    async participants(request, cycleId, unitId) {
        await this.session(request);
        return this.admin.participants(cycleId ? Number(cycleId) : undefined, unitId ? Number(unitId) : undefined);
    }
    async addUnit(request, body) {
        return this.admin.addUnit(await this.mutationSession(request), body);
    }
    async updateUnit(request, id, body) {
        return this.admin.updateUnit(await this.mutationSession(request), Number(id), body);
    }
    async removeUnit(request, id) {
        return this.admin.removeUnit(await this.mutationSession(request), Number(id));
    }
    async addParticipant(request, body) {
        return this.admin.addParticipant(await this.mutationSession(request), body);
    }
    async removeParticipant(request, id) {
        return this.admin.removeParticipant(await this.mutationSession(request), Number(id));
    }
    async updateParticipant(request, id, body) {
        return this.admin.updateParticipant(await this.mutationSession(request), Number(id), body);
    }
    async setRoster(request, participantId, body) {
        return this.admin.setRoster(await this.mutationSession(request), Number(body.cycleId), Number(participantId), String(body.status ?? ""));
    }
    async results(request, cycleId, unitId, keyword) {
        await this.session(request);
        return this.admin.results(cycleId ? Number(cycleId) : undefined, unitId ? Number(unitId) : undefined, keyword);
    }
    async resultDetail(request, id) {
        const session = await this.session(request);
        return this.attempts.get(session, Number(id));
    }
    async questions(request, categoryId, keyword) {
        await this.session(request);
        return this.admin.questions(categoryId ? Number(categoryId) : undefined, keyword);
    }
    async importQuestions(request, file) {
        if (!file)
            throw new Error("Vui lòng chọn tệp Excel.");
        return this.admin.validateQuestionImport(await this.mutationSession(request), file.originalname, file.buffer);
    }
    async commitImport(request, batchId) {
        return this.admin.commitQuestionImport(await this.mutationSession(request), Number(batchId));
    }
    async exportResults(request, response, cycleId) {
        await this.session(request);
        const buffer = await this.admin.exportResults(cycleId ? Number(cycleId) : undefined);
        response
            .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            .attachment("ket-qua-thi-cbkt.xlsx")
            .send(buffer);
    }
    async exportAttendance(request, response, cycleId) {
        await this.session(request);
        const buffer = await this.admin.exportAttendance(cycleId ? Number(cycleId) : undefined);
        response
            .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            .attachment("diem-danh-thi-cbkt.xlsx")
            .send(buffer);
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)("dashboard"),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "dashboard", null);
__decorate([
    (0, common_1.Put)("exam"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateExam", null);
__decorate([
    (0, common_1.Post)("exam/:id/status"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "setExamStatus", null);
__decorate([
    (0, common_1.Get)("participants"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)("cycleId")),
    __param(2, (0, common_1.Query)("unitId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "participants", null);
__decorate([
    (0, common_1.Post)("units"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "addUnit", null);
__decorate([
    (0, common_1.Put)("units/:id"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateUnit", null);
__decorate([
    (0, common_1.Delete)("units/:id"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "removeUnit", null);
__decorate([
    (0, common_1.Post)("participants"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "addParticipant", null);
__decorate([
    (0, common_1.Delete)("participants/:id"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "removeParticipant", null);
__decorate([
    (0, common_1.Put)("participants/:id"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateParticipant", null);
__decorate([
    (0, common_1.Put)("roster/:participantId"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("participantId")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "setRoster", null);
__decorate([
    (0, common_1.Get)("results"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)("cycleId")),
    __param(2, (0, common_1.Query)("unitId")),
    __param(3, (0, common_1.Query)("keyword")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "results", null);
__decorate([
    (0, common_1.Get)("results/:id"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "resultDetail", null);
__decorate([
    (0, common_1.Get)("questions"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)("categoryId")),
    __param(2, (0, common_1.Query)("keyword")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "questions", null);
__decorate([
    (0, common_1.Post)("questions/import"),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)("file", { limits: { fileSize: 10 * 1024 * 1024 } })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "importQuestions", null);
__decorate([
    (0, common_1.Post)("questions/import/:batchId/commit"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("batchId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "commitImport", null);
__decorate([
    (0, common_1.Get)("exports/results.xlsx"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Query)("cycleId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "exportResults", null);
__decorate([
    (0, common_1.Get)("exports/attendance.xlsx"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Query)("cycleId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "exportAttendance", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)("admin"),
    __metadata("design:paramtypes", [admin_service_1.AdminService,
        auth_service_1.AuthService,
        attempts_service_1.AttemptsService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map