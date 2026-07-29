export type DistributionPlan = {
    valid: boolean;
    reason: "ok" | "percent_sum" | "insufficient";
    totalPercent: number;
    planned: Record<string, number>;
    shortages: string[];
};
export declare function computeDistributionPlan(distribution: Record<string, number>, totalNeeded: number, availability?: Record<string, number>): DistributionPlan;
export declare function scoreExam(correctCount: number, totalQuestions: number): number;
export declare function classifyScore(score: number): string;
export declare function secureShuffle<T>(items: readonly T[]): T[];
export declare function normalizeName(value: unknown): string;
export declare const INTEGRITY_EVENT_TYPES: readonly ["TAB_HIDDEN", "WINDOW_BLUR", "FULLSCREEN_EXIT", "COPY", "CUT", "PASTE", "CONTEXT_MENU", "PRINT_ATTEMPT", "SECOND_SESSION"];
export type IntegrityEventType = (typeof INTEGRITY_EVENT_TYPES)[number];
export type IntegrityPolicy = {
    maxFocusLosses: number;
    maxHiddenSeconds: number;
    enforcementAction: "WARN" | "FLAG" | "AUTO_SUBMIT";
};
export type IntegrityState = {
    integrityStatus: "NORMAL" | "WARNED" | "FLAGGED" | "AUTO_SUBMITTED";
    riskScore: number;
    violationCount: number;
    focusLossCount: number;
    hiddenDurationMs: number;
};
export type IntegrityDecision = IntegrityState & {
    action: "NONE" | "WARN" | "FLAG" | "AUTO_SUBMIT";
};
export declare function evaluateIntegrityEvent(current: IntegrityState, event: {
    eventType: IntegrityEventType;
    durationMs?: number | null;
}, policy: IntegrityPolicy): IntegrityDecision;
