"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTEGRITY_EVENT_TYPES = void 0;
exports.computeDistributionPlan = computeDistributionPlan;
exports.scoreExam = scoreExam;
exports.classifyScore = classifyScore;
exports.secureShuffle = secureShuffle;
exports.normalizeName = normalizeName;
exports.evaluateIntegrityEvent = evaluateIntegrityEvent;
const node_crypto_1 = require("node:crypto");
function computeDistributionPlan(distribution, totalNeeded, availability = {}) {
    const entries = Object.entries(distribution)
        .map(([category, value]) => ({
        category,
        percent: Math.max(0, Number(value) || 0),
    }))
        .filter((item) => item.percent > 0);
    const totalPercent = Number(entries.reduce((sum, item) => sum + item.percent, 0).toFixed(2));
    if (!entries.length || totalPercent !== 100) {
        return {
            valid: false,
            reason: "percent_sum",
            totalPercent,
            planned: {},
            shortages: [],
        };
    }
    const raw = entries.map((item) => ({
        ...item,
        exact: (item.percent / 100) * totalNeeded,
    }));
    const planned = {};
    let assigned = 0;
    for (const item of raw) {
        planned[item.category] = Math.floor(item.exact);
        assigned += planned[item.category];
    }
    raw.sort((a, b) => {
        const fractionDifference = b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact));
        return Math.abs(fractionDifference) > 1e-9
            ? fractionDifference
            : a.category.localeCompare(b.category, "vi");
    });
    for (let index = 0; assigned < totalNeeded; index += 1) {
        planned[raw[index % raw.length].category] += 1;
        assigned += 1;
    }
    const shortages = Object.entries(planned)
        .filter(([category, count]) => (availability[category] ?? count) < count)
        .map(([category, count]) => `${category} thiếu ${count - (availability[category] ?? 0)} câu`);
    return {
        valid: shortages.length === 0,
        reason: shortages.length ? "insufficient" : "ok",
        totalPercent,
        planned,
        shortages,
    };
}
function scoreExam(correctCount, totalQuestions) {
    if (!Number.isFinite(totalQuestions) || totalQuestions <= 0)
        return 0;
    return Number(((Math.max(0, correctCount) / totalQuestions) * 10).toFixed(1));
}
function classifyScore(score) {
    if (score < 5)
        return "Yếu";
    if (score < 7)
        return "Trung bình";
    if (score < 9)
        return "Khá";
    return "Xuất sắc";
}
function secureShuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = (0, node_crypto_1.randomInt)(index + 1);
        [result[index], result[swapIndex]] = [
            result[swapIndex],
            result[index],
        ];
    }
    return result;
}
function normalizeName(value) {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, " ");
}
exports.INTEGRITY_EVENT_TYPES = [
    "TAB_HIDDEN",
    "WINDOW_BLUR",
    "FULLSCREEN_EXIT",
    "COPY",
    "CUT",
    "PASTE",
    "CONTEXT_MENU",
    "PRINT_ATTEMPT",
    "SECOND_SESSION",
];
const riskWeights = {
    TAB_HIDDEN: 20,
    WINDOW_BLUR: 10,
    FULLSCREEN_EXIT: 25,
    COPY: 15,
    CUT: 15,
    PASTE: 15,
    CONTEXT_MENU: 10,
    PRINT_ATTEMPT: 10,
    SECOND_SESSION: 40,
};
function evaluateIntegrityEvent(current, event, policy) {
    const focusLoss = event.eventType === "TAB_HIDDEN" || event.eventType === "WINDOW_BLUR";
    const next = {
        integrityStatus: current.integrityStatus,
        riskScore: Math.min(100, current.riskScore + riskWeights[event.eventType]),
        violationCount: current.violationCount + 1,
        focusLossCount: current.focusLossCount + (focusLoss ? 1 : 0),
        hiddenDurationMs: current.hiddenDurationMs +
            (event.eventType === "TAB_HIDDEN"
                ? Math.max(0, Math.min(Number(event.durationMs) || 0, 3_600_000))
                : 0),
    };
    const mustAutoSubmit = policy.enforcementAction === "AUTO_SUBMIT" &&
        (next.focusLossCount >= Math.max(1, policy.maxFocusLosses) ||
            next.hiddenDurationMs >= Math.max(1, policy.maxHiddenSeconds) * 1000);
    if (mustAutoSubmit) {
        return {
            ...next,
            integrityStatus: "AUTO_SUBMITTED",
            action: "AUTO_SUBMIT",
        };
    }
    const shouldFlag = policy.enforcementAction !== "WARN" &&
        (next.focusLossCount >= Math.max(2, policy.maxFocusLosses - 1) ||
            next.riskScore >= 40);
    if (shouldFlag) {
        return {
            ...next,
            integrityStatus: "FLAGGED",
            action: "FLAG",
        };
    }
    return {
        ...next,
        integrityStatus: "WARNED",
        action: "WARN",
    };
}
