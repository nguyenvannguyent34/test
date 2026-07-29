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
exports.AuthService = exports.SESSION_COOKIE = void 0;
const common_1 = require("@nestjs/common");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("./prisma.service");
exports.SESSION_COOKIE = "cbkt_session";
let AuthService = class AuthService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    cookieOptions(expiresAt) {
        return {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production" &&
                process.env.COOKIE_SECURE !== "false",
            path: "/",
            expires: expiresAt,
        };
    }
    async createSession(response, role, subject) {
        const expiresAt = new Date(Date.now() + (role === "ADMIN" ? 8 : 24) * 60 * 60 * 1000);
        const session = await this.prisma.session.create({
            data: {
                id: (0, node_crypto_1.randomBytes)(32).toString("hex"),
                role,
                expiresAt,
                ...subject,
            },
        });
        response.cookie(exports.SESSION_COOKIE, session.id, this.cookieOptions(expiresAt));
        return session;
    }
    async loginAdmin(response, email, password) {
        const normalizedEmail = String(email ?? "").trim().toLocaleLowerCase();
        const user = await this.prisma.user.findUnique({
            where: { email: normalizedEmail },
        });
        if (!user?.isActive ||
            !(await bcryptjs_1.default.compare(String(password ?? ""), user.passwordHash))) {
            throw new common_1.UnauthorizedException("Email hoặc mật khẩu không đúng.");
        }
        await this.createSession(response, "ADMIN", { userId: user.id });
        await this.audit("ADMIN", user.id, "LOGIN", "Session");
        return {
            role: "ADMIN",
            user: { id: user.id, email: user.email, displayName: user.displayName },
        };
    }
    async changeAdminPassword(session, currentPassword, newPassword) {
        if (!session.userId || !session.user) {
            throw new common_1.ForbiddenException("Thiếu thông tin tài khoản quản trị.");
        }
        const nextPassword = String(newPassword ?? "");
        if (nextPassword.length < 10 || nextPassword.length > 200) {
            throw new common_1.ForbiddenException("Mật khẩu mới phải có từ 10 đến 200 ký tự.");
        }
        if (!(await bcryptjs_1.default.compare(String(currentPassword ?? ""), session.user.passwordHash))) {
            throw new common_1.UnauthorizedException("Mật khẩu hiện tại không đúng.");
        }
        if (await bcryptjs_1.default.compare(nextPassword, session.user.passwordHash)) {
            throw new common_1.ForbiddenException("Mật khẩu mới phải khác mật khẩu hiện tại.");
        }
        await this.prisma.user.update({
            where: { id: session.userId },
            data: { passwordHash: await bcryptjs_1.default.hash(nextPassword, 12) },
        });
        await this.audit("ADMIN", session.userId, "CHANGE_PASSWORD", "User", String(session.userId));
        return { ok: true };
    }
    async loginCandidate(response, participantId, accessCode, examCycleId) {
        const participant = await this.prisma.participant.findUnique({
            where: { id: Number(participantId) },
            include: { unit: true },
        });
        if (!participant?.isActive ||
            !(await bcryptjs_1.default.compare(String(accessCode ?? ""), participant.accessCodeHash))) {
            throw new common_1.UnauthorizedException("Thông tin thí sinh hoặc mã truy cập không đúng.");
        }
        const now = new Date();
        const cycle = examCycleId
            ? await this.prisma.examCycle.findUnique({
                where: { id: Number(examCycleId) },
            })
            : await this.prisma.examCycle.findFirst({
                where: { status: "OPEN", startAt: { lte: now }, endAt: { gte: now } },
                orderBy: { startAt: "desc" },
            });
        if (!cycle || cycle.status !== "OPEN" || cycle.endAt < now) {
            throw new common_1.ForbiddenException("Hiện không có kỳ kiểm tra đang mở.");
        }
        const roster = await this.prisma.examRoster.findUnique({
            where: {
                examCycleId_participantId: {
                    examCycleId: cycle.id,
                    participantId: participant.id,
                },
            },
        });
        if (!roster || roster.status !== "ELIGIBLE") {
            throw new common_1.ForbiddenException("Thí sinh không có trong danh sách dự thi của kỳ này.");
        }
        await this.createSession(response, "CANDIDATE", {
            participantId: participant.id,
        });
        await this.audit("CANDIDATE", participant.id, "LOGIN", "Session");
        return {
            role: "CANDIDATE",
            examCycleId: cycle.id,
            participant: {
                id: participant.id,
                fullName: participant.fullName,
                position: participant.position,
                unit: participant.unit,
            },
        };
    }
    async logout(request, response) {
        const sessionId = request.cookies?.[exports.SESSION_COOKIE];
        if (sessionId) {
            await this.prisma.session.deleteMany({ where: { id: sessionId } });
        }
        response.clearCookie(exports.SESSION_COOKIE, { path: "/" });
        return { ok: true };
    }
    async optional(request) {
        const sessionId = request.cookies?.[exports.SESSION_COOKIE];
        if (!sessionId)
            return null;
        const session = await this.prisma.session.findUnique({
            where: { id: sessionId },
            include: {
                user: true,
                participant: { include: { unit: true } },
            },
        });
        if (!session || !session.csrfToken || session.expiresAt <= new Date()) {
            if (sessionId) {
                await this.prisma.session.deleteMany({ where: { id: sessionId } });
            }
            return null;
        }
        return session;
    }
    async require(request, role) {
        const session = await this.optional(request);
        if (!session)
            throw new common_1.UnauthorizedException("Phiên đăng nhập đã hết hạn.");
        if (role && session.role !== role) {
            throw new common_1.ForbiddenException("Bạn không có quyền thực hiện thao tác này.");
        }
        return session;
    }
    requireCsrf(request, session) {
        const supplied = String(request.headers["x-csrf-token"] ?? "");
        const expected = session.csrfToken;
        if (!expected) {
            throw new common_1.ForbiddenException("Phiên đăng nhập cũ không còn hợp lệ. Vui lòng đăng nhập lại.");
        }
        const suppliedBuffer = Buffer.from(supplied);
        const expectedBuffer = Buffer.from(expected);
        if (!supplied ||
            suppliedBuffer.length !== expectedBuffer.length ||
            !(0, node_crypto_1.timingSafeEqual)(suppliedBuffer, expectedBuffer)) {
            throw new common_1.ForbiddenException("Yêu cầu bảo mật không hợp lệ. Vui lòng tải lại trang.");
        }
    }
    async requireMutation(request, role) {
        const session = await this.require(request, role);
        this.requireCsrf(request, session);
        return session;
    }
    async me(request) {
        const session = await this.optional(request);
        if (!session)
            return { authenticated: false };
        return {
            authenticated: true,
            csrfToken: session.csrfToken,
            role: session.role,
            user: session.user
                ? {
                    id: session.user.id,
                    email: session.user.email,
                    displayName: session.user.displayName,
                }
                : null,
            participant: session.participant
                ? {
                    id: session.participant.id,
                    fullName: session.participant.fullName,
                    position: session.participant.position,
                    unit: session.participant.unit,
                }
                : null,
        };
    }
    async audit(actorType, actorId, action, entityType, entityId, beforeData, afterData, ipAddress) {
        await this.prisma.auditLog.create({
            data: {
                actorType,
                actorId,
                action,
                entityType,
                entityId,
                beforeData: beforeData,
                afterData: afterData,
                ipAddress,
            },
        });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AuthService);
//# sourceMappingURL=auth.service.js.map