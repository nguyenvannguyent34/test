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
exports.PublicController = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("./prisma.service");
const security_service_1 = require("./security.service");
let PublicController = class PublicController {
    prisma;
    security;
    constructor(prisma, security) {
        this.prisma = prisma;
        this.security = security;
    }
    health() {
        return {
            status: "ok",
            service: "Thi CBKT API",
            timestamp: new Date().toISOString(),
        };
    }
    async examStatus() {
        const now = new Date();
        const exam = await this.prisma.examCycle.findFirst({
            where: {
                status: "OPEN",
                startAt: { lte: now },
                endAt: { gte: now },
            },
            include: {
                distributions: {
                    where: { unitId: null },
                    include: { category: true },
                    orderBy: { category: { name: "asc" } },
                },
            },
            orderBy: { startAt: "desc" },
        });
        if (!exam)
            return { open: false, exam: null };
        const securityPolicy = await this.security.policyForCycle(exam.id);
        return {
            open: true,
            exam: {
                id: exam.id,
                title: exam.title,
                welcomeContent: exam.welcomeContent,
                examMonth: exam.examMonth,
                examRound: exam.examRound,
                startAt: exam.startAt,
                endAt: exam.endAt,
                totalQuestions: exam.totalQuestions,
                durationMinutes: exam.durationMinutes,
                passScore: exam.passScore,
                securityPolicy: this.security.publicPolicy(securityPolicy),
                distributions: exam.distributions.map((item) => ({
                    categoryId: item.categoryId,
                    categoryName: item.category.name,
                    percentage: item.percentage,
                })),
            },
        };
    }
    async units() {
        return this.prisma.unit.findMany({
            where: { isActive: true },
            select: { id: true, code: true, name: true },
            orderBy: { name: "asc" },
        });
    }
    async participants(unitId) {
        const now = new Date();
        const cycle = await this.prisma.examCycle.findFirst({
            where: { status: "OPEN", startAt: { lte: now }, endAt: { gte: now } },
            orderBy: { startAt: "desc" },
        });
        if (!cycle)
            throw new common_1.NotFoundException("Không có kỳ kiểm tra đang mở.");
        const roster = await this.prisma.examRoster.findMany({
            where: {
                examCycleId: cycle.id,
                status: "ELIGIBLE",
                participant: { unitId: Number(unitId), isActive: true },
            },
            include: {
                participant: {
                    include: {
                        attempts: { where: { examCycleId: cycle.id }, select: { status: true } },
                    },
                },
            },
            orderBy: { participant: { fullName: "asc" } },
        });
        return roster.map(({ participant }) => ({
            id: participant.id,
            fullName: participant.fullName,
            position: participant.position,
            attemptStatus: participant.attempts[0]?.status ?? "NOT_STARTED",
        }));
    }
};
exports.PublicController = PublicController;
__decorate([
    (0, common_1.Get)("health"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PublicController.prototype, "health", null);
__decorate([
    (0, common_1.Get)("exam-status"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PublicController.prototype, "examStatus", null);
__decorate([
    (0, common_1.Get)("units"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PublicController.prototype, "units", null);
__decorate([
    (0, common_1.Get)("units/:unitId/participants"),
    __param(0, (0, common_1.Param)("unitId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PublicController.prototype, "participants", null);
exports.PublicController = PublicController = __decorate([
    (0, common_1.Controller)("public"),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        security_service_1.SecurityService])
], PublicController);
//# sourceMappingURL=public.controller.js.map