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
exports.AttemptsService = void 0;
const common_1 = require("@nestjs/common");
const exam_engine_1 = require("@cbkt/exam-engine");
const auth_service_1 = require("./auth.service");
const prisma_service_1 = require("./prisma.service");
const security_service_1 = require("./security.service");
let AttemptsService = class AttemptsService {
    prisma;
    auth;
    security;
    constructor(prisma, auth, security) {
        this.prisma = prisma;
        this.auth = auth;
        this.security = security;
    }
    async currentCycle() {
        const now = new Date();
        const cycle = await this.prisma.examCycle.findFirst({
            where: { status: "OPEN", startAt: { lte: now }, endAt: { gte: now } },
            orderBy: { startAt: "desc" },
        });
        if (!cycle)
            throw new common_1.ForbiddenException("Kỳ kiểm tra hiện không mở.");
        return cycle;
    }
    async assertEligible(cycleId, participantId) {
        const roster = await this.prisma.examRoster.findUnique({
            where: {
                examCycleId_participantId: {
                    examCycleId: cycleId,
                    participantId,
                },
            },
        });
        if (!roster || roster.status !== "ELIGIBLE") {
            throw new common_1.ForbiddenException("Bạn không có trong danh sách dự thi.");
        }
    }
    async start(session, integrityAccepted, deviceSessionId) {
        const participant = session.participant;
        if (!participant)
            throw new common_1.ForbiddenException("Thiếu thông tin thí sinh.");
        if (integrityAccepted !== true) {
            throw new common_1.BadRequestException("Bạn cần xác nhận cam kết trung thực trước khi bắt đầu.");
        }
        const normalizedDeviceSessionId = String(deviceSessionId ?? "").trim();
        if (!/^[A-Za-z0-9_-]{16,100}$/.test(normalizedDeviceSessionId)) {
            throw new common_1.BadRequestException("Mã phiên thiết bị không hợp lệ.");
        }
        const cycle = await this.currentCycle();
        await this.assertEligible(cycle.id, participant.id);
        const policy = await this.security.policyForCycle(cycle.id);
        const existing = await this.prisma.attempt.findUnique({
            where: {
                examCycleId_participantId: {
                    examCycleId: cycle.id,
                    participantId: participant.id,
                },
            },
        });
        if (existing) {
            if (!existing.integrityAcceptedAt) {
                await this.prisma.attempt.update({
                    where: { id: existing.id },
                    data: {
                        integrityAcceptedAt: new Date(),
                        securityVersion: policy.version,
                        deviceSessionId: normalizedDeviceSessionId,
                    },
                });
            }
            if (existing.status === "IN_PROGRESS") {
                await this.security.assertDevice(existing.id, participant.id, deviceSessionId);
            }
            if (existing.status === "IN_PROGRESS" && existing.expiresAt <= new Date()) {
                return this.submit(session, existing.id, `expired-${existing.id}`);
            }
            return this.get(session, existing.id);
        }
        const unitDistributions = await this.prisma.examDistribution.findMany({
            where: { examCycleId: cycle.id, unitId: participant.unitId },
        });
        const distributions = unitDistributions.length
            ? unitDistributions
            : await this.prisma.examDistribution.findMany({
                where: { examCycleId: cycle.id, unitId: null },
            });
        const questions = await this.prisma.question.findMany({
            where: {
                status: "APPROVED",
                OR: [
                    { effectiveFrom: null },
                    { effectiveFrom: { lte: new Date() } },
                ],
                AND: [
                    {
                        OR: [
                            { effectiveUntil: null },
                            { effectiveUntil: { gte: new Date() } },
                        ],
                    },
                ],
            },
            include: { category: true },
        });
        if (questions.length < cycle.totalQuestions) {
            throw new common_1.ConflictException(`Ngân hàng chỉ có ${questions.length}/${cycle.totalQuestions} câu hỏi hợp lệ.`);
        }
        const availability = {};
        for (const question of questions) {
            availability[String(question.categoryId)] =
                (availability[String(question.categoryId)] ?? 0) + 1;
        }
        const distributionRecord = Object.fromEntries(distributions.map((item) => [String(item.categoryId), item.percentage]));
        const plan = (0, exam_engine_1.computeDistributionPlan)(distributionRecord, cycle.totalQuestions, availability);
        if (!plan.valid) {
            throw new common_1.ConflictException(plan.reason === "percent_sum"
                ? `Tổng tỷ lệ câu hỏi phải bằng 100% (hiện tại ${plan.totalPercent}%).`
                : `Ngân hàng câu hỏi không đủ theo cơ cấu: ${plan.shortages.join(", ")}.`);
        }
        const selected = Object.entries(plan.planned).flatMap(([categoryId, count]) => (0, exam_engine_1.secureShuffle)(questions.filter((question) => question.categoryId === Number(categoryId))).slice(0, count));
        const ordered = (0, exam_engine_1.secureShuffle)(selected);
        const labels = ["A", "B", "C", "D"];
        const expiresAt = new Date(Math.min(cycle.endAt.getTime(), Date.now() + cycle.durationMinutes * 60 * 1000));
        const attempt = await this.prisma.$transaction(async (tx) => {
            const created = await tx.attempt.create({
                data: {
                    examCycleId: cycle.id,
                    participantId: participant.id,
                    expiresAt,
                    totalQuestions: cycle.totalQuestions,
                    deviceSessionId: normalizedDeviceSessionId,
                    securityVersion: policy.version,
                    integrityAcceptedAt: new Date(),
                },
            });
            for (const [index, question] of ordered.entries()) {
                const originalOptions = {
                    A: question.optionA,
                    B: question.optionB,
                    C: question.optionC,
                    D: question.optionD,
                };
                const originalOrder = (0, exam_engine_1.secureShuffle)(labels);
                const optionMapping = {};
                const displayOptions = {};
                labels.forEach((displayLabel, optionIndex) => {
                    const originalLabel = originalOrder[optionIndex];
                    optionMapping[displayLabel] = originalLabel;
                    displayOptions[displayLabel] = originalOptions[originalLabel];
                });
                const correctDisplayOption = labels.find((displayLabel) => optionMapping[displayLabel] === question.correctOption) ?? "A";
                await tx.attemptQuestion.create({
                    data: {
                        attemptId: created.id,
                        questionId: question.id,
                        displayOrder: index + 1,
                        questionSnapshot: {
                            content: question.content,
                            categoryName: question.category.name,
                            options: displayOptions,
                            legalBasis: question.legalBasis,
                        },
                        optionMapping,
                        correctDisplayOption,
                    },
                });
            }
            return created;
        });
        await this.auth.audit("CANDIDATE", participant.id, "START", "Attempt", String(attempt.id));
        return this.get(session, attempt.id);
    }
    async current(session, deviceSessionId) {
        if (!session.participantId) {
            throw new common_1.ForbiddenException("Thiếu thông tin thí sinh.");
        }
        const cycle = await this.currentCycle().catch(() => null);
        const attempt = await this.prisma.attempt.findFirst({
            where: {
                participantId: session.participantId,
                ...(cycle ? { examCycleId: cycle.id } : {}),
            },
            orderBy: { startedAt: "desc" },
        });
        if (!attempt)
            return { attempt: null };
        if (attempt.status === "IN_PROGRESS" && !attempt.integrityAcceptedAt) {
            return { attempt: null };
        }
        if (attempt.status === "IN_PROGRESS") {
            await this.security.assertDevice(attempt.id, session.participantId, deviceSessionId);
        }
        return this.get(session, attempt.id);
    }
    async get(session, attemptId, requestedOrder) {
        const attempt = await this.prisma.attempt.findUnique({
            where: { id: attemptId },
            include: {
                examCycle: true,
                participant: { include: { unit: true } },
                questions: {
                    include: { answer: true },
                    orderBy: { displayOrder: "asc" },
                },
            },
        });
        if (!attempt)
            throw new common_1.NotFoundException("Không tìm thấy lượt thi.");
        if (session.role !== "ADMIN" &&
            attempt.participantId !== session.participantId) {
            throw new common_1.ForbiddenException("Bạn không có quyền xem lượt thi này.");
        }
        if (attempt.status === "IN_PROGRESS" && attempt.expiresAt <= new Date()) {
            return this.submit(session, attempt.id, `expired-${attempt.id}`);
        }
        const showResult = attempt.status === "SUBMITTED";
        const policy = await this.security.policyForCycle(attempt.examCycleId);
        const questionStatuses = attempt.questions.map((question) => ({
            id: question.id,
            displayOrder: question.displayOrder,
            answered: Boolean(question.answer?.selectedOption),
            selectedOption: question.answer?.selectedOption ?? null,
            isFlagged: question.answer?.isFlagged ?? false,
        }));
        const firstUnanswered = questionStatuses.find((question) => !question.answered)?.displayOrder ?? 1;
        const safeRequestedOrder = Number.isInteger(requestedOrder) &&
            Number(requestedOrder) >= 1 &&
            Number(requestedOrder) <= attempt.totalQuestions
            ? Number(requestedOrder)
            : firstUnanswered;
        const visibleQuestions = showResult ||
            session.role === "ADMIN" ||
            policy.questionDeliveryMode === "ALL"
            ? attempt.questions
            : attempt.questions.filter((question) => question.displayOrder === safeRequestedOrder);
        return {
            attempt: {
                id: attempt.id,
                status: attempt.status,
                startedAt: attempt.startedAt,
                expiresAt: attempt.expiresAt,
                submittedAt: attempt.submittedAt,
                version: attempt.version,
                totalQuestions: attempt.totalQuestions,
                correctCount: attempt.correctCount,
                score: attempt.score,
                passState: attempt.passState,
                passed: attempt.passed,
                integrityStatus: attempt.integrityStatus,
                riskScore: attempt.riskScore,
                violationCount: attempt.violationCount,
                focusLossCount: attempt.focusLossCount,
                hiddenDurationMs: attempt.hiddenDurationMs,
                lastHeartbeatAt: attempt.lastHeartbeatAt,
                securityPolicy: this.security.publicPolicy(policy),
                questionStatuses,
                exam: {
                    id: attempt.examCycle.id,
                    title: attempt.examCycle.title,
                    durationMinutes: attempt.examCycle.durationMinutes,
                    passScore: attempt.examCycle.passScore,
                },
                participant: {
                    id: attempt.participant.id,
                    fullName: attempt.participant.fullName,
                    position: attempt.participant.position,
                    unit: attempt.participant.unit,
                },
                questions: visibleQuestions.map((question) => {
                    const snapshot = question.questionSnapshot;
                    return {
                        id: question.id,
                        displayOrder: question.displayOrder,
                        content: snapshot.content,
                        categoryName: snapshot.categoryName,
                        options: snapshot.options,
                        selectedOption: question.answer?.selectedOption ?? null,
                        isFlagged: question.answer?.isFlagged ?? false,
                        ...(showResult
                            ? {
                                correctOption: question.correctDisplayOption,
                                legalBasis: snapshot.legalBasis,
                                isCorrect: question.answer?.selectedOption ===
                                    question.correctDisplayOption,
                            }
                            : {}),
                    };
                }),
            },
        };
    }
    async getQuestion(session, attemptId, displayOrder, deviceSessionId) {
        if (!session.participantId) {
            throw new common_1.ForbiddenException("Thiếu thông tin thí sinh.");
        }
        await this.security.assertDevice(attemptId, session.participantId, deviceSessionId);
        return this.get(session, attemptId, displayOrder);
    }
    async saveAnswers(session, attemptId, version, answers, deviceSessionId) {
        if (!session.participantId) {
            throw new common_1.ForbiddenException("Thiếu thông tin thí sinh.");
        }
        await this.security.assertDevice(attemptId, session.participantId, deviceSessionId);
        const attempt = await this.prisma.attempt.findUnique({
            where: { id: attemptId },
            include: { questions: { select: { id: true } } },
        });
        if (!attempt)
            throw new common_1.NotFoundException("Không tìm thấy lượt thi.");
        if (attempt.participantId !== session.participantId) {
            throw new common_1.ForbiddenException("Bạn không có quyền sửa lượt thi này.");
        }
        if (attempt.status !== "IN_PROGRESS") {
            throw new common_1.ConflictException("Bài thi đã được nộp.");
        }
        if (attempt.expiresAt <= new Date()) {
            return this.submit(session, attempt.id, `expired-${attempt.id}`);
        }
        const allowedIds = new Set(attempt.questions.map((item) => item.id));
        const sanitized = answers.filter((answer) => allowedIds.has(answer.questionId));
        const nextVersion = await this.prisma.$transaction(async (tx) => {
            const updated = await tx.attempt.updateMany({
                where: {
                    id: attemptId,
                    version: Number(version),
                    status: "IN_PROGRESS",
                },
                data: { version: { increment: 1 } },
            });
            if (!updated.count) {
                throw new common_1.ConflictException("Bài thi đã được cập nhật ở phiên khác. Vui lòng tải lại.");
            }
            for (const answer of sanitized) {
                const selectedOption = answer.selectedOption
                    ? String(answer.selectedOption).toUpperCase()
                    : null;
                if (selectedOption &&
                    !["A", "B", "C", "D"].includes(selectedOption)) {
                    continue;
                }
                await tx.attemptAnswer.upsert({
                    where: { attemptQuestionId: answer.questionId },
                    create: {
                        attemptQuestionId: answer.questionId,
                        selectedOption,
                        isFlagged: Boolean(answer.isFlagged),
                    },
                    update: {
                        selectedOption,
                        isFlagged: Boolean(answer.isFlagged),
                        answeredAt: new Date(),
                    },
                });
            }
            return Number(version) + 1;
        });
        return { ok: true, version: nextVersion, savedAt: new Date() };
    }
    async submit(session, attemptId, idempotencyKey) {
        const attempt = await this.prisma.attempt.findUnique({
            where: { id: attemptId },
            include: { questions: { include: { answer: true } } },
        });
        if (!attempt)
            throw new common_1.NotFoundException("Không tìm thấy lượt thi.");
        if (session.role !== "ADMIN" &&
            attempt.participantId !== session.participantId) {
            throw new common_1.ForbiddenException("Bạn không có quyền nộp lượt thi này.");
        }
        if (attempt.status === "SUBMITTED")
            return this.get(session, attempt.id);
        const correctCount = attempt.questions.filter((question) => question.answer?.selectedOption === question.correctDisplayOption).length;
        const score = (0, exam_engine_1.scoreExam)(correctCount, attempt.totalQuestions);
        const cycle = await this.prisma.examCycle.findUniqueOrThrow({
            where: { id: attempt.examCycleId },
        });
        const key = idempotencyKey?.trim() || `submit-${attempt.id}`;
        await this.prisma.attempt.update({
            where: { id: attempt.id },
            data: {
                status: "SUBMITTED",
                submittedAt: new Date(),
                correctCount,
                score,
                passState: (0, exam_engine_1.classifyScore)(score),
                passed: score >= cycle.passScore,
                idempotencyKey: key,
                version: { increment: 1 },
            },
        });
        await this.auth.audit("CANDIDATE", attempt.participantId, "SUBMIT", "Attempt", String(attempt.id), undefined, { correctCount, score });
        return this.get(session, attempt.id);
    }
};
exports.AttemptsService = AttemptsService;
exports.AttemptsService = AttemptsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        auth_service_1.AuthService,
        security_service_1.SecurityService])
], AttemptsService);
//# sourceMappingURL=attempts.service.js.map