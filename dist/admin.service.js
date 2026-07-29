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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const exam_engine_1 = require("@cbkt/exam-engine");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const exceljs_1 = __importDefault(require("exceljs"));
const auth_service_1 = require("./auth.service");
const prisma_service_1 = require("./prisma.service");
const normalizeName = (value) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi")
    .replace(/\s+/g, " ")
    .trim();
const slug = (value) => normalizeName(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
const cellText = (value) => {
    if (value == null)
        return "";
    if (typeof value === "object" && value && "text" in value) {
        return String(value.text).trim();
    }
    if (typeof value === "object" && value && "result" in value) {
        return String(value.result ?? "").trim();
    }
    return String(value).trim();
};
let AdminService = class AdminService {
    prisma;
    auth;
    constructor(prisma, auth) {
        this.prisma = prisma;
        this.auth = auth;
    }
    async activeOrLatestCycle() {
        const cycle = (await this.prisma.examCycle.findFirst({
            where: { status: "OPEN" },
            orderBy: { startAt: "desc" },
        })) ??
            (await this.prisma.examCycle.findFirst({
                orderBy: { startAt: "desc" },
            }));
        if (!cycle)
            throw new common_1.NotFoundException("Chưa có kỳ kiểm tra.");
        return cycle;
    }
    async dashboard() {
        const cycle = await this.activeOrLatestCycle();
        const [categories, units, distributions, rosterCount, attemptGroups] = await Promise.all([
            this.prisma.questionCategory.findMany({
                where: { isActive: true },
                include: {
                    _count: {
                        select: {
                            questions: { where: { status: "APPROVED" } },
                        },
                    },
                },
                orderBy: { name: "asc" },
            }),
            this.prisma.unit.findMany({
                where: { isActive: true },
                include: {
                    _count: {
                        select: { participants: { where: { isActive: true } } },
                    },
                },
                orderBy: { name: "asc" },
            }),
            this.prisma.examDistribution.findMany({
                where: { examCycleId: cycle.id, unitId: null },
                include: { category: true },
                orderBy: { category: { name: "asc" } },
            }),
            this.prisma.examRoster.count({
                where: { examCycleId: cycle.id, status: "ELIGIBLE" },
            }),
            this.prisma.attempt.groupBy({
                by: ["status"],
                where: { examCycleId: cycle.id },
                _count: { _all: true },
            }),
        ]);
        const submitted = attemptGroups.find((item) => item.status === "SUBMITTED")?._count._all ?? 0;
        const inProgress = attemptGroups.find((item) => item.status === "IN_PROGRESS")?._count._all ?? 0;
        const passCount = await this.prisma.attempt.count({
            where: { examCycleId: cycle.id, status: "SUBMITTED", passed: true },
        });
        const aggregate = await this.prisma.attempt.aggregate({
            where: { examCycleId: cycle.id, status: "SUBMITTED" },
            _avg: { score: true },
        });
        return {
            cycle,
            categories: categories.map((category) => ({
                id: category.id,
                code: category.code,
                name: category.name,
                questionCount: category._count.questions,
            })),
            distributions: distributions.map((distribution) => ({
                id: distribution.id,
                categoryId: distribution.categoryId,
                categoryName: distribution.category.name,
                percentage: distribution.percentage,
            })),
            units: units.map((unit) => ({
                id: unit.id,
                code: unit.code,
                name: unit.name,
                participantCount: unit._count.participants,
            })),
            stats: {
                rosterCount,
                submitted,
                inProgress,
                notStarted: Math.max(0, rosterCount - submitted - inProgress),
                passCount,
                passRate: submitted ? Number(((passCount / submitted) * 100).toFixed(1)) : 0,
                averageScore: Number((aggregate._avg.score ?? 0).toFixed(1)),
            },
        };
    }
    async updateExam(session, body) {
        const cycle = await this.prisma.examCycle.findUnique({
            where: { id: Number(body.id) },
        });
        if (!cycle)
            throw new common_1.NotFoundException("Không tìm thấy kỳ kiểm tra.");
        const totalQuestions = Math.max(1, Math.min(200, Number(body.totalQuestions)));
        const durationMinutes = Math.max(1, Math.min(240, Number(body.durationMinutes)));
        const passScore = Number(body.passScore);
        const startAt = new Date(String(body.startAt));
        const endAt = new Date(String(body.endAt));
        if (!Number.isFinite(totalQuestions) ||
            !Number.isFinite(durationMinutes) ||
            !Number.isFinite(passScore) ||
            Number.isNaN(startAt.getTime()) ||
            Number.isNaN(endAt.getTime()) ||
            endAt <= startAt) {
            throw new common_1.BadRequestException("Thông số kỳ kiểm tra không hợp lệ.");
        }
        const distributions = Array.isArray(body.distributions)
            ? body.distributions.map((item) => ({
                categoryId: Number(item.categoryId),
                percentage: Number(item.percentage),
            }))
            : [];
        const categories = await this.prisma.questionCategory.findMany({
            where: { isActive: true },
            include: {
                _count: {
                    select: { questions: { where: { status: "APPROVED" } } },
                },
            },
        });
        const availability = Object.fromEntries(categories.map((category) => [
            String(category.id),
            category._count.questions,
        ]));
        const plan = (0, exam_engine_1.computeDistributionPlan)(Object.fromEntries(distributions.map((item) => [
            String(item.categoryId),
            item.percentage,
        ])), totalQuestions, availability);
        if (!plan.valid) {
            throw new common_1.BadRequestException(plan.reason === "percent_sum"
                ? `Tổng tỷ lệ phải bằng 100% (hiện tại ${plan.totalPercent}%).`
                : `Không đủ câu hỏi: ${plan.shortages.join(", ")}.`);
        }
        await this.prisma.$transaction(async (tx) => {
            const updated = await tx.examCycle.updateMany({
                where: { id: cycle.id, version: Number(body.version) },
                data: {
                    title: String(body.title ?? "").trim(),
                    welcomeContent: String(body.welcomeContent ?? "").trim(),
                    examMonth: Number(body.examMonth),
                    examRound: Number(body.examRound),
                    startAt,
                    endAt,
                    totalQuestions,
                    durationMinutes,
                    passScore,
                    version: { increment: 1 },
                },
            });
            if (!updated.count) {
                throw new common_1.ConflictException("Cấu hình đã được người khác cập nhật. Vui lòng tải lại.");
            }
            await tx.examDistribution.deleteMany({
                where: { examCycleId: cycle.id, unitId: null },
            });
            await tx.examDistribution.createMany({
                data: distributions.map((item) => ({
                    examCycleId: cycle.id,
                    categoryId: item.categoryId,
                    percentage: item.percentage,
                })),
            });
        });
        await this.auth.audit("ADMIN", session.userId ?? null, "UPDATE", "ExamCycle", String(cycle.id), cycle, body);
        return this.dashboard();
    }
    async setExamStatus(session, id, status) {
        if (!["DRAFT", "OPEN", "CLOSED"].includes(status)) {
            throw new common_1.BadRequestException("Trạng thái kỳ kiểm tra không hợp lệ.");
        }
        const before = await this.prisma.examCycle.findUnique({ where: { id } });
        if (!before)
            throw new common_1.NotFoundException("Không tìm thấy kỳ kiểm tra.");
        const cycle = await this.prisma.examCycle.update({
            where: { id },
            data: { status, version: { increment: 1 } },
        });
        await this.auth.audit("ADMIN", session.userId ?? null, "STATUS", "ExamCycle", String(id), before, cycle);
        return cycle;
    }
    async participants(cycleId, unitId) {
        const cycle = cycleId
            ? await this.prisma.examCycle.findUnique({ where: { id: cycleId } })
            : await this.activeOrLatestCycle();
        if (!cycle)
            throw new common_1.NotFoundException("Không tìm thấy kỳ kiểm tra.");
        const participants = await this.prisma.participant.findMany({
            where: {
                isActive: true,
                ...(unitId ? { unitId } : {}),
            },
            include: {
                unit: true,
                rosters: { where: { examCycleId: cycle.id } },
                attempts: { where: { examCycleId: cycle.id } },
            },
            orderBy: [{ unit: { name: "asc" } }, { fullName: "asc" }],
        });
        return {
            cycleId: cycle.id,
            participants: participants.map((participant) => ({
                id: participant.id,
                fullName: participant.fullName,
                position: participant.position,
                unit: participant.unit,
                rosterStatus: participant.rosters[0]?.status ?? "NOT_LISTED",
                attemptStatus: participant.attempts[0]?.status ?? "NOT_STARTED",
            })),
        };
    }
    normalizeUnitInput(body) {
        const name = String(body.name ?? "").replace(/\s+/g, " ").trim();
        const code = String(body.code ?? slug(name))
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9_-]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 30);
        if (name.length < 2 || name.length > 200 || code.length < 2) {
            throw new common_1.BadRequestException("Tên Đội phải từ 2 đến 200 ký tự và mã Đội phải có ít nhất 2 ký tự.");
        }
        return { code, name };
    }
    async addUnit(session, body) {
        const data = this.normalizeUnitInput(body);
        const duplicate = await this.prisma.unit.findFirst({
            where: {
                OR: [{ code: data.code }, { name: data.name }],
            },
        });
        if (duplicate?.isActive) {
            throw new common_1.ConflictException("Mã hoặc tên Đội đã tồn tại.");
        }
        const unit = duplicate
            ? await this.prisma.unit.update({
                where: { id: duplicate.id },
                data: { ...data, isActive: true },
            })
            : await this.prisma.unit.create({ data });
        await this.auth.audit("ADMIN", session.userId ?? null, duplicate ? "REACTIVATE" : "CREATE", "Unit", String(unit.id), duplicate, unit);
        return unit;
    }
    async updateUnit(session, id, body) {
        const before = await this.prisma.unit.findUnique({ where: { id } });
        if (!before?.isActive) {
            throw new common_1.NotFoundException("Không tìm thấy Đội.");
        }
        const data = this.normalizeUnitInput(body);
        const duplicate = await this.prisma.unit.findFirst({
            where: {
                id: { not: id },
                OR: [{ code: data.code }, { name: data.name }],
            },
        });
        if (duplicate) {
            throw new common_1.ConflictException("Mã hoặc tên Đội đã được sử dụng.");
        }
        const unit = await this.prisma.unit.update({
            where: { id },
            data,
        });
        await this.auth.audit("ADMIN", session.userId ?? null, "UPDATE", "Unit", String(id), before, unit);
        return unit;
    }
    async removeUnit(session, id) {
        const unit = await this.prisma.unit.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { participants: { where: { isActive: true } } },
                },
            },
        });
        if (!unit?.isActive)
            throw new common_1.NotFoundException("Không tìm thấy Đội.");
        if (unit._count.participants > 0) {
            throw new common_1.ConflictException(`Đội còn ${unit._count.participants} thí sinh. Hãy chuyển hoặc xóa các thí sinh trước.`);
        }
        await this.prisma.unit.update({
            where: { id },
            data: { isActive: false },
        });
        await this.auth.audit("ADMIN", session.userId ?? null, "DEACTIVATE", "Unit", String(id), unit, { isActive: false });
        return { ok: true, unitId: id };
    }
    async addParticipant(session, body) {
        const fullName = String(body.fullName ?? "").replace(/\s+/g, " ").trim();
        const accessCode = String(body.accessCode ?? "").trim();
        if (!fullName || accessCode.length < 4) {
            throw new common_1.BadRequestException("Họ tên là bắt buộc và mã truy cập cần ít nhất 4 ký tự.");
        }
        const cycle = body.examCycleId
            ? await this.prisma.examCycle.findUnique({
                where: { id: Number(body.examCycleId) },
            })
            : await this.activeOrLatestCycle();
        if (!cycle)
            throw new common_1.NotFoundException("Không tìm thấy kỳ kiểm tra.");
        const unitId = Number(body.unitId);
        const unit = await this.prisma.unit.findFirst({
            where: { id: unitId, isActive: true },
        });
        if (!unit)
            throw new common_1.BadRequestException("Đội được chọn không hợp lệ.");
        const normalizedName = normalizeName(fullName);
        const existing = await this.prisma.participant.findUnique({
            where: { unitId_normalizedName: { unitId, normalizedName } },
        });
        if (existing?.isActive) {
            throw new common_1.ConflictException("Thí sinh này đã có trong Đội.");
        }
        const accessCodeHash = await bcryptjs_1.default.hash(accessCode, 12);
        const participant = existing
            ? await this.prisma.participant.update({
                where: { id: existing.id },
                data: {
                    fullName,
                    position: String(body.position ?? "").trim() || null,
                    accessCodeHash,
                    isActive: true,
                },
                include: { unit: true },
            })
            : await this.prisma.participant.create({
                data: {
                    unitId,
                    fullName,
                    normalizedName,
                    position: String(body.position ?? "").trim() || null,
                    accessCodeHash,
                },
                include: { unit: true },
            });
        await this.prisma.examRoster.upsert({
            where: {
                examCycleId_participantId: {
                    examCycleId: cycle.id,
                    participantId: participant.id,
                },
            },
            create: {
                examCycleId: cycle.id,
                participantId: participant.id,
                status: "ELIGIBLE",
            },
            update: { status: "ELIGIBLE" },
        });
        await this.auth.audit("ADMIN", session.userId ?? null, "CREATE", "Participant", String(participant.id), undefined, { fullName, unitId: participant.unitId });
        return participant;
    }
    async updateParticipant(session, id, body) {
        const before = await this.prisma.participant.findUnique({
            where: { id },
        });
        if (!before?.isActive) {
            throw new common_1.NotFoundException("Không tìm thấy thí sinh.");
        }
        const fullName = String(body.fullName ?? "")
            .replace(/\s+/g, " ")
            .trim();
        const unitId = Number(body.unitId);
        if (!fullName || !Number.isInteger(unitId)) {
            throw new common_1.BadRequestException("Họ tên và Đội là bắt buộc.");
        }
        const unit = await this.prisma.unit.findFirst({
            where: { id: unitId, isActive: true },
        });
        if (!unit)
            throw new common_1.BadRequestException("Đội được chọn không hợp lệ.");
        const normalizedName = normalizeName(fullName);
        const duplicate = await this.prisma.participant.findFirst({
            where: {
                id: { not: id },
                unitId,
                normalizedName,
            },
        });
        if (duplicate) {
            throw new common_1.ConflictException("Đội đã có thí sinh cùng họ tên.");
        }
        if (unitId !== before.unitId) {
            const attemptCount = await this.prisma.attempt.count({
                where: { participantId: id },
            });
            if (attemptCount > 0) {
                throw new common_1.ConflictException("Không thể chuyển Đội vì thí sinh đã có lịch sử làm bài. Hãy giữ hồ sơ cũ và tạo thí sinh mới ở Đội mới.");
            }
        }
        const accessCode = String(body.accessCode ?? "").trim();
        if (accessCode && accessCode.length < 4) {
            throw new common_1.BadRequestException("Mã truy cập cần ít nhất 4 ký tự.");
        }
        const participant = await this.prisma.participant.update({
            where: { id },
            data: {
                unitId,
                fullName,
                normalizedName,
                position: String(body.position ?? "").trim() || null,
                ...(accessCode
                    ? { accessCodeHash: await bcryptjs_1.default.hash(accessCode, 12) }
                    : {}),
            },
            include: { unit: true },
        });
        await this.auth.audit("ADMIN", session.userId ?? null, "UPDATE", "Participant", String(id), before, {
            unitId,
            fullName,
            position: participant.position,
            accessCodeChanged: Boolean(accessCode),
        });
        return participant;
    }
    async removeParticipant(session, id) {
        const attemptCount = await this.prisma.attempt.count({
            where: { participantId: id },
        });
        const participant = await this.prisma.participant.update({
            where: { id },
            data: { isActive: false },
        });
        await this.prisma.examRoster.updateMany({
            where: { participantId: id },
            data: { status: "REMOVED" },
        });
        await this.auth.audit("ADMIN", session.userId ?? null, "DEACTIVATE", "Participant", String(id), undefined, { attemptCount });
        return { ok: true, participantId: participant.id, attemptCount };
    }
    async setRoster(session, cycleId, participantId, status) {
        if (!["ELIGIBLE", "REMOVED"].includes(status)) {
            throw new common_1.BadRequestException("Trạng thái danh sách không hợp lệ.");
        }
        const roster = await this.prisma.examRoster.upsert({
            where: { examCycleId_participantId: { examCycleId: cycleId, participantId } },
            create: { examCycleId: cycleId, participantId, status },
            update: { status },
        });
        await this.auth.audit("ADMIN", session.userId ?? null, "ROSTER", "ExamRoster", String(roster.id), undefined, { status });
        return roster;
    }
    async results(cycleId, unitId, keyword) {
        const cycle = cycleId
            ? await this.prisma.examCycle.findUnique({ where: { id: cycleId } })
            : await this.activeOrLatestCycle();
        if (!cycle)
            throw new common_1.NotFoundException("Không tìm thấy kỳ kiểm tra.");
        const attempts = await this.prisma.attempt.findMany({
            where: {
                examCycleId: cycle.id,
                ...(unitId ? { participant: { unitId } } : {}),
            },
            include: {
                participant: { include: { unit: true } },
                questions: { include: { answer: true } },
            },
            orderBy: [{ submittedAt: "desc" }, { startedAt: "desc" }],
        });
        const normalizedKeyword = String(keyword ?? "").toLocaleLowerCase("vi").trim();
        return {
            cycle,
            results: attempts
                .filter((attempt) => !normalizedKeyword ||
                attempt.participant.fullName
                    .toLocaleLowerCase("vi")
                    .includes(normalizedKeyword) ||
                attempt.participant.unit.name
                    .toLocaleLowerCase("vi")
                    .includes(normalizedKeyword))
                .map((attempt) => ({
                id: attempt.id,
                fullName: attempt.participant.fullName,
                position: attempt.participant.position,
                unitName: attempt.participant.unit.name,
                status: attempt.status,
                startedAt: attempt.startedAt,
                submittedAt: attempt.submittedAt,
                correctCount: attempt.correctCount,
                totalQuestions: attempt.totalQuestions,
                unanswered: attempt.questions.filter((question) => !question.answer?.selectedOption).length,
                score: attempt.score,
                passState: attempt.passState,
                passed: attempt.passed,
            })),
        };
    }
    async questions(categoryId, keyword) {
        return this.prisma.question.findMany({
            where: {
                ...(categoryId ? { categoryId } : {}),
                ...(keyword
                    ? {
                        OR: [
                            { content: { contains: keyword } },
                            { legalBasis: { contains: keyword } },
                        ],
                    }
                    : {}),
            },
            include: { category: true },
            orderBy: [{ category: { name: "asc" } }, { legacyStt: "asc" }],
        });
    }
    async validateQuestionImport(session, filename, buffer) {
        const workbook = new exceljs_1.default.Workbook();
        await workbook.xlsx.load(buffer);
        const sheet = workbook.getWorksheet("NganHangCauHoi") ?? workbook.worksheets[0];
        if (!sheet)
            throw new common_1.BadRequestException("Tệp Excel không có trang dữ liệu.");
        const rows = [];
        const issues = [];
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1)
                return;
            const item = {
                legacyStt: Number(cellText(row.getCell(1).value)) || null,
                categoryName: cellText(row.getCell(2).value),
                content: cellText(row.getCell(3).value),
                optionA: cellText(row.getCell(4).value),
                optionB: cellText(row.getCell(5).value),
                optionC: cellText(row.getCell(6).value),
                optionD: cellText(row.getCell(7).value),
                correctOption: cellText(row.getCell(8).value).toUpperCase(),
                legalBasis: cellText(row.getCell(9).value),
            };
            if (!item.content && !item.categoryName)
                return;
            const missing = [
                ["chuyên đề", item.categoryName],
                ["nội dung", item.content],
                ["đáp án A", item.optionA],
                ["đáp án B", item.optionB],
                ["đáp án C", item.optionC],
                ["đáp án D", item.optionD],
                ["căn cứ", item.legalBasis],
            ].filter(([, value]) => !value);
            for (const [field] of missing) {
                issues.push({
                    row: rowNumber,
                    severity: "ERROR",
                    message: `Thiếu ${field}.`,
                });
            }
            if (!["A", "B", "C", "D"].includes(item.correctOption)) {
                issues.push({
                    row: rowNumber,
                    severity: "ERROR",
                    message: "Đáp án đúng phải là A, B, C hoặc D.",
                });
            }
            rows.push(item);
        });
        const seen = new Map();
        rows.forEach((row, index) => {
            const key = normalizeName(row.content);
            if (seen.has(key)) {
                issues.push({
                    row: index + 2,
                    severity: "WARNING",
                    message: `Nội dung trùng với dòng ${(seen.get(key) ?? 0) + 2}.`,
                });
            }
            else {
                seen.set(key, index);
            }
        });
        const batch = await this.prisma.questionImportBatch.create({
            data: {
                filename,
                createdBy: session.userId ?? 0,
                payload: rows,
                issues: issues,
                status: issues.some((issue) => issue.severity === "ERROR")
                    ? "INVALID"
                    : "VALIDATED",
            },
        });
        return {
            batchId: batch.id,
            status: batch.status,
            rowCount: rows.length,
            issues,
        };
    }
    async commitQuestionImport(session, batchId) {
        const batch = await this.prisma.questionImportBatch.findUnique({
            where: { id: batchId },
        });
        if (!batch)
            throw new common_1.NotFoundException("Không tìm thấy đợt nhập.");
        if (batch.status !== "VALIDATED") {
            throw new common_1.ConflictException("Đợt nhập có lỗi hoặc đã được ghi nhận.");
        }
        const rows = batch.payload;
        await this.prisma.$transaction(async (tx) => {
            for (const row of rows) {
                let category = await tx.questionCategory.findUnique({
                    where: { name: row.categoryName },
                });
                if (!category) {
                    const baseCode = slug(row.categoryName) || `CATEGORY_${Date.now()}`;
                    const existingCode = await tx.questionCategory.findUnique({
                        where: { code: baseCode },
                    });
                    category = await tx.questionCategory.create({
                        data: {
                            name: row.categoryName,
                            code: existingCode ? `${baseCode}_${Date.now()}` : baseCode,
                        },
                    });
                }
                await tx.question.create({
                    data: {
                        legacyStt: row.legacyStt,
                        categoryId: category.id,
                        content: row.content,
                        optionA: row.optionA,
                        optionB: row.optionB,
                        optionC: row.optionC,
                        optionD: row.optionD,
                        correctOption: row.correctOption,
                        legalBasis: row.legalBasis,
                        status: "APPROVED",
                    },
                });
            }
            await tx.questionImportBatch.update({
                where: { id: batch.id },
                data: { status: "COMMITTED", committedAt: new Date() },
            });
        });
        await this.auth.audit("ADMIN", session.userId ?? null, "IMPORT", "Question", String(batch.id), undefined, { rowCount: rows.length });
        return { ok: true, imported: rows.length };
    }
    async exportResults(cycleId) {
        const data = await this.results(cycleId);
        const workbook = new exceljs_1.default.Workbook();
        const sheet = workbook.addWorksheet("KetQua");
        sheet.columns = [
            { header: "STT", key: "stt", width: 8 },
            { header: "Họ và tên", key: "fullName", width: 28 },
            { header: "Chức vụ", key: "position", width: 20 },
            { header: "Đơn vị", key: "unitName", width: 38 },
            { header: "Trạng thái", key: "status", width: 16 },
            { header: "Số câu đúng", key: "correctCount", width: 14 },
            { header: "Tổng câu", key: "totalQuestions", width: 12 },
            { header: "Điểm", key: "score", width: 10 },
            { header: "Xếp loại", key: "passState", width: 16 },
            { header: "Thời gian nộp", key: "submittedAt", width: 22 },
        ];
        data.results.forEach((result, index) => {
            sheet.addRow({ stt: index + 1, ...result });
        });
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFB91C1C" },
        };
        sheet.autoFilter = { from: "A1", to: "J1" };
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        return Buffer.from(await workbook.xlsx.writeBuffer());
    }
    async exportAttendance(cycleId) {
        const cycle = cycleId
            ? await this.prisma.examCycle.findUnique({ where: { id: cycleId } })
            : await this.activeOrLatestCycle();
        if (!cycle)
            throw new common_1.NotFoundException("Không tìm thấy kỳ kiểm tra.");
        const roster = await this.prisma.examRoster.findMany({
            where: { examCycleId: cycle.id, status: "ELIGIBLE" },
            include: {
                participant: {
                    include: {
                        unit: true,
                        attempts: { where: { examCycleId: cycle.id } },
                    },
                },
            },
            orderBy: { participant: { fullName: "asc" } },
        });
        const workbook = new exceljs_1.default.Workbook();
        const sheet = workbook.addWorksheet("DiemDanh");
        sheet.columns = [
            { header: "STT", key: "stt", width: 8 },
            { header: "Họ và tên", key: "fullName", width: 28 },
            { header: "Đơn vị", key: "unitName", width: 38 },
            { header: "Tình trạng", key: "status", width: 18 },
            { header: "Bắt đầu", key: "startedAt", width: 22 },
            { header: "Nộp bài", key: "submittedAt", width: 22 },
        ];
        roster.forEach(({ participant }, index) => {
            const attempt = participant.attempts[0];
            sheet.addRow({
                stt: index + 1,
                fullName: participant.fullName,
                unitName: participant.unit.name,
                status: attempt?.status === "SUBMITTED"
                    ? "Đã nộp"
                    : attempt?.status === "IN_PROGRESS"
                        ? "Đang làm"
                        : "Chưa dự thi",
                startedAt: attempt?.startedAt ?? "",
                submittedAt: attempt?.submittedAt ?? "",
            });
        });
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFB91C1C" },
        };
        return Buffer.from(await workbook.xlsx.writeBuffer());
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        auth_service_1.AuthService])
], AdminService);
//# sourceMappingURL=admin.service.js.map