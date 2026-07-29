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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityService = void 0;
const common_1 = require("@nestjs/common");
const exam_engine_1 = require("@cbkt/exam-engine");
const node_crypto_1 = require("node:crypto");
const auth_service_1 = require("./auth.service");
const prisma_service_1 = require("./prisma.service");
const allowedEventTypes = new Set(exam_engine_1.INTEGRITY_EVENT_TYPES);
const allowedEnforcementActions = new Set(["WARN", "FLAG", "AUTO_SUBMIT"]);
const allowedDeliveryModes = new Set(["ALL", "ONE_AT_A_TIME"]);
const clampInteger = (value, minimum, maximum, fallback) => {
    const parsed = Number(value);
    return Number.isInteger(parsed)
        ? Math.max(minimum, Math.min(maximum, parsed))
        : fallback;
};
let SecurityService = class SecurityService {
    prisma;
    auth;
    constructor(prisma, auth) {
        this.prisma = prisma;
        this.auth = auth;
    }
    async policyForCycle(examCycleId) {
        return this.prisma.examSecurityPolicy.upsert({
            where: { examCycleId },
            create: { examCycleId },
            update: {},
        });
    }
    publicPolicy(policy) {
        return {
            enabled: policy.enabled,
            requireFullscreen: policy.requireFullscreen,
            blockClipboard: policy.blockClipboard,
            blockContextMenu: policy.blockContextMenu,
            blockPrint: policy.blockPrint,
            disableTextSelection: policy.disableTextSelection,
            watermarkEnabled: policy.watermarkEnabled,
            questionDeliveryMode: policy.questionDeliveryMode,
            heartbeatIntervalSeconds: policy.heartbeatIntervalSeconds,
            integrityAgreement: policy.integrityAgreement,
            version: policy.version,
        };
    }
    normalizeDeviceSessionId(value) {
        const deviceSessionId = String(value ?? "").trim();
        if (!/^[A-Za-z0-9_-]{16,100}$/.test(deviceSessionId)) {
            throw new common_1.BadRequestException("Mã phiên thiết bị không hợp lệ.");
        }
        return deviceSessionId;
    }
    async assertDevice(attemptId, participantId, rawDeviceSessionId) {
        const deviceSessionId = this.normalizeDeviceSessionId(rawDeviceSessionId);
        let attempt = await this.prisma.attempt.findUnique({
            where: { id: attemptId },
        });
        if (!attempt)
            throw new common_1.NotFoundException("Không tìm thấy lượt thi.");
        if (attempt.participantId !== participantId) {
            throw new common_1.ForbiddenException("Bạn không có quyền truy cập lượt thi này.");
        }
        if (attempt.status !== "IN_PROGRESS")
            return { attempt, deviceSessionId };
        if (!attempt.deviceSessionId) {
            await this.prisma.attempt.updateMany({
                where: { id: attemptId, deviceSessionId: null },
                data: { deviceSessionId },
            });
            attempt = await this.prisma.attempt.findUniqueOrThrow({
                where: { id: attemptId },
            });
        }
        if (attempt.deviceSessionId !== deviceSessionId) {
            const policy = await this.policyForCycle(attempt.examCycleId);
            const decision = (0, exam_engine_1.evaluateIntegrityEvent)({
                integrityStatus: attempt.integrityStatus,
                riskScore: attempt.riskScore,
                violationCount: attempt.violationCount,
                focusLossCount: attempt.focusLossCount,
                hiddenDurationMs: attempt.hiddenDurationMs,
            }, { eventType: "SECOND_SESSION" }, {
                maxFocusLosses: policy.maxFocusLosses,
                maxHiddenSeconds: policy.maxHiddenSeconds,
                enforcementAction: policy.enforcementAction,
            });
            await this.prisma.$transaction([
                this.prisma.antiCheatEvent.create({
                    data: {
                        attemptId,
                        eventType: "SECOND_SESSION",
                        sequenceNumber: -(0, node_crypto_1.randomInt)(1, 2_000_000_000),
                        clientOccurredAt: new Date(),
                        deviceSessionId,
                        metadata: { rejected: true },
                    },
                }),
                this.prisma.attempt.update({
                    where: { id: attemptId },
                    data: {
                        integrityStatus: decision.integrityStatus,
                        riskScore: decision.riskScore,
                        violationCount: decision.violationCount,
                    },
                }),
            ]);
            throw new common_1.ConflictException("Bài thi đang được khóa trên một thiết bị khác. Hãy liên hệ cán bộ coi thi.");
        }
        return { attempt, deviceSessionId };
    }
    requestEvidence(request) {
        const userAgent = String(request.headers["user-agent"] ?? "");
        return {
            ipAddress: request.ip?.slice(0, 100),
            userAgentHash: userAgent
                ? (0, node_crypto_1.createHash)("sha256").update(userAgent).digest("hex")
                : undefined,
        };
    }
    safeMetadata(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return undefined;
        }
        const serialized = JSON.stringify(value);
        if (serialized.length > 2_000) {
            throw new common_1.BadRequestException("Dữ liệu sự kiện quá lớn.");
        }
        return JSON.parse(serialized);
    }
    async recordEvents(session, attemptId, rawDeviceSessionId, incoming, request) {
        if (!session.participantId) {
            throw new common_1.ForbiddenException("Thiếu thông tin thí sinh.");
        }
        const { attempt, deviceSessionId } = await this.assertDevice(attemptId, session.participantId, rawDeviceSessionId);
        if (attempt.status !== "IN_PROGRESS") {
            return { action: "NONE", integrityStatus: attempt.integrityStatus };
        }
        const events = Array.isArray(incoming) ? incoming : [];
        if (!events.length || events.length > 20) {
            throw new common_1.BadRequestException("Mỗi lần chỉ được gửi từ 1 đến 20 sự kiện.");
        }
        const policy = await this.policyForCycle(attempt.examCycleId);
        if (!policy.enabled) {
            return { action: "NONE", integrityStatus: attempt.integrityStatus };
        }
        let state = {
            integrityStatus: attempt.integrityStatus,
            riskScore: attempt.riskScore,
            violationCount: attempt.violationCount,
            focusLossCount: attempt.focusLossCount,
            hiddenDurationMs: attempt.hiddenDurationMs,
        };
        let action = "NONE";
        const evidence = this.requestEvidence(request);
        await this.prisma.$transaction(async (tx) => {
            for (const raw of events) {
                const eventType = String(raw.eventType ?? "");
                const sequenceNumber = Number(raw.sequenceNumber);
                if (!allowedEventTypes.has(eventType) ||
                    !Number.isInteger(sequenceNumber) ||
                    sequenceNumber < 1 ||
                    sequenceNumber > 2_000_000_000) {
                    throw new common_1.BadRequestException("Loại hoặc số thứ tự sự kiện không hợp lệ.");
                }
                const duplicate = await tx.antiCheatEvent.findUnique({
                    where: {
                        attemptId_deviceSessionId_sequenceNumber: {
                            attemptId,
                            deviceSessionId,
                            sequenceNumber,
                        },
                    },
                });
                if (duplicate)
                    continue;
                const clientOccurredAt = new Date(String(raw.clientOccurredAt ?? ""));
                if (Number.isNaN(clientOccurredAt.getTime())) {
                    throw new common_1.BadRequestException("Thời điểm sự kiện không hợp lệ.");
                }
                const durationMs = raw.durationMs == null
                    ? undefined
                    : clampInteger(raw.durationMs, 0, 3_600_000, 0);
                const pageOrder = raw.pageOrder == null
                    ? undefined
                    : clampInteger(raw.pageOrder, 1, attempt.totalQuestions, 1);
                await tx.antiCheatEvent.create({
                    data: {
                        attemptId,
                        eventType,
                        sequenceNumber,
                        clientOccurredAt,
                        durationMs,
                        pageOrder,
                        metadata: this.safeMetadata(raw.metadata),
                        deviceSessionId,
                        ...evidence,
                    },
                });
                const decision = (0, exam_engine_1.evaluateIntegrityEvent)(state, { eventType, durationMs }, {
                    maxFocusLosses: policy.maxFocusLosses,
                    maxHiddenSeconds: policy.maxHiddenSeconds,
                    enforcementAction: policy.enforcementAction,
                });
                state = {
                    integrityStatus: decision.integrityStatus,
                    riskScore: decision.riskScore,
                    violationCount: decision.violationCount,
                    focusLossCount: decision.focusLossCount,
                    hiddenDurationMs: decision.hiddenDurationMs,
                };
                if (decision.action === "AUTO_SUBMIT")
                    action = "AUTO_SUBMIT";
                else if (decision.action === "FLAG" && action !== "AUTO_SUBMIT") {
                    action = "FLAG";
                }
                else if (decision.action === "WARN" && action === "NONE") {
                    action = "WARN";
                }
            }
            await tx.attempt.update({
                where: { id: attemptId },
                data: state,
            });
        });
        return { action, ...state };
    }
    async heartbeat(session, attemptId, rawDeviceSessionId) {
        if (!session.participantId) {
            throw new common_1.ForbiddenException("Thiếu thông tin thí sinh.");
        }
        const { attempt } = await this.assertDevice(attemptId, session.participantId, rawDeviceSessionId);
        if (attempt.status === "IN_PROGRESS") {
            await this.prisma.attempt.update({
                where: { id: attemptId },
                data: { lastHeartbeatAt: new Date() },
            });
        }
        return { ok: true, serverTime: new Date() };
    }
    async dashboard() {
        const cycle = await this.prisma.examCycle.findFirst({
            orderBy: { startAt: "desc" },
        });
        if (!cycle)
            throw new common_1.NotFoundException("Chưa có kỳ kiểm tra.");
        const policy = await this.policyForCycle(cycle.id);
        const attempts = await this.prisma.attempt.findMany({
            where: { examCycleId: cycle.id },
            include: {
                participant: { include: { unit: true } },
                _count: { select: { antiCheatEvents: true } },
            },
            orderBy: [{ riskScore: "desc" }, { lastHeartbeatAt: "desc" }],
        });
        return {
            policy,
            attempts: attempts.map((attempt) => ({
                id: attempt.id,
                status: attempt.status,
                participant: attempt.participant,
                integrityStatus: attempt.integrityStatus,
                riskScore: attempt.riskScore,
                violationCount: attempt.violationCount,
                focusLossCount: attempt.focusLossCount,
                hiddenDurationMs: attempt.hiddenDurationMs,
                lastHeartbeatAt: attempt.lastHeartbeatAt,
                deviceLocked: Boolean(attempt.deviceSessionId),
                eventCount: attempt._count.antiCheatEvents,
            })),
        };
    }
    async updatePolicy(session, body) {
        const cycle = await this.prisma.examCycle.findFirst({
            orderBy: { startAt: "desc" },
        });
        if (!cycle)
            throw new common_1.NotFoundException("Chưa có kỳ kiểm tra.");
        const current = await this.policyForCycle(cycle.id);
        const enforcementAction = String(body.enforcementAction ?? current.enforcementAction);
        const questionDeliveryMode = String(body.questionDeliveryMode ?? current.questionDeliveryMode);
        if (!allowedEnforcementActions.has(enforcementAction)) {
            throw new common_1.BadRequestException("Cách xử lý vi phạm không hợp lệ.");
        }
        if (!allowedDeliveryModes.has(questionDeliveryMode)) {
            throw new common_1.BadRequestException("Chế độ cấp câu hỏi không hợp lệ.");
        }
        const integrityAgreement = String(body.integrityAgreement ?? current.integrityAgreement).trim();
        if (integrityAgreement.length < 20 || integrityAgreement.length > 1_000) {
            throw new common_1.BadRequestException("Nội dung cam kết phải từ 20 đến 1.000 ký tự.");
        }
        const booleanValue = (key) => typeof body[key] === "boolean" ? Boolean(body[key]) : Boolean(current[key]);
        const updated = await this.prisma.examSecurityPolicy.update({
            where: { examCycleId: cycle.id },
            data: {
                enabled: booleanValue("enabled"),
                requireFullscreen: booleanValue("requireFullscreen"),
                blockClipboard: booleanValue("blockClipboard"),
                blockContextMenu: booleanValue("blockContextMenu"),
                blockPrint: booleanValue("blockPrint"),
                disableTextSelection: booleanValue("disableTextSelection"),
                watermarkEnabled: booleanValue("watermarkEnabled"),
                questionDeliveryMode,
                maxFocusLosses: clampInteger(body.maxFocusLosses, 1, 20, current.maxFocusLosses),
                maxHiddenSeconds: clampInteger(body.maxHiddenSeconds, 5, 3_600, current.maxHiddenSeconds),
                maxConcurrentSessions: 1,
                enforcementAction,
                heartbeatIntervalSeconds: clampInteger(body.heartbeatIntervalSeconds, 5, 120, current.heartbeatIntervalSeconds),
                integrityAgreement,
                version: { increment: 1 },
            },
        });
        await this.auth.audit("ADMIN", session.userId ?? null, "UPDATE_SECURITY_POLICY", "ExamSecurityPolicy", String(updated.id), current, updated);
        return { policy: updated };
    }
    async events(attemptId) {
        const attempt = await this.prisma.attempt.findUnique({
            where: { id: attemptId },
            include: { participant: { include: { unit: true } } },
        });
        if (!attempt)
            throw new common_1.NotFoundException("Không tìm thấy lượt thi.");
        const events = await this.prisma.antiCheatEvent.findMany({
            where: { attemptId },
            orderBy: { serverReceivedAt: "desc" },
            take: 200,
        });
        return { attempt, events };
    }
    async unlock(session, attemptId) {
        const attempt = await this.prisma.attempt.update({
            where: { id: attemptId },
            data: { deviceSessionId: null },
        });
        await this.auth.audit("ADMIN", session.userId ?? null, "UNLOCK_DEVICE", "Attempt", String(attemptId));
        return { ok: true };
    }
};
exports.SecurityService = SecurityService;
exports.SecurityService = SecurityService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        auth_service_1.AuthService])
], SecurityService);
//# sourceMappingURL=security.service.js.map