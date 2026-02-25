import * as fs from "fs";
import * as path from "path";

/**
 * ═══════════════════════════════════════════════════════════
 *  Persistent Logger — JSON append-mode with daily rotation
 * ═══════════════════════════════════════════════════════════
 */
export class Logger {
    private logDir: string;
    private currentFile: string = "";
    private stream: fs.WriteStream | null = null;

    constructor(logDir: string = "./keeper-logs") {
        this.logDir = logDir;
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
        this.rotateIfNeeded();
    }

    /**
     * Log a structured event to both console and JSON log file.
     */
    log(level: "INFO" | "WARN" | "ERROR" | "DEBUG", component: string, message: string, data?: Record<string, any>): void {
        const entry = {
            ts: new Date().toISOString(),
            level,
            component,
            message,
            ...(data ? { data } : {}),
        };

        // Console output (human-readable)
        const prefix = level === "ERROR" ? "❌" : level === "WARN" ? "⚠️" : level === "DEBUG" ? "🔍" : "📋";
        console.log(`[${entry.ts}] ${prefix} [${component}] ${message}`);

        // File output (JSON lines)
        this.rotateIfNeeded();
        if (this.stream) {
            this.stream.write(JSON.stringify(entry) + "\n");
        }
    }

    info(component: string, message: string, data?: Record<string, any>): void {
        this.log("INFO", component, message, data);
    }

    warn(component: string, message: string, data?: Record<string, any>): void {
        this.log("WARN", component, message, data);
    }

    error(component: string, message: string, data?: Record<string, any>): void {
        this.log("ERROR", component, message, data);
    }

    debug(component: string, message: string, data?: Record<string, any>): void {
        this.log("DEBUG", component, message, data);
    }

    /**
     * Rotate log file daily (one file per day).
     */
    private rotateIfNeeded(): void {
        const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
        const expectedFile = path.join(this.logDir, `keeper-${today}.jsonl`);

        if (this.currentFile !== expectedFile) {
            if (this.stream) {
                this.stream.end();
            }
            this.currentFile = expectedFile;
            this.stream = fs.createWriteStream(expectedFile, { flags: "a" });
        }
    }

    close(): void {
        if (this.stream) {
            this.stream.end();
            this.stream = null;
        }
    }
}

/**
 * ═══════════════════════════════════════════════════════════
 *  Health Metrics — uptime, success rate, last execution
 * ═══════════════════════════════════════════════════════════
 */
export interface HealthMetrics {
    startedAt: string;
    uptimeSeconds: number;
    cycleCount: number;
    totalExecutions: number;
    totalSuccesses: number;
    totalFailures: number;
    successRate: string;
    lastExecutionAt: string | null;
    lastExecutionTaskId: number | null;
    lastExecutionSuccess: boolean | null;
    pendingTasks: number;
    trackedTasks: number;
}

export class HealthTracker {
    private startTime: Date;
    cycleCount: number = 0;
    totalExecutions: number = 0;
    totalSuccesses: number = 0;
    totalFailures: number = 0;
    lastExecutionAt: Date | null = null;
    lastExecutionTaskId: number | null = null;
    lastExecutionSuccess: boolean | null = null;

    constructor() {
        this.startTime = new Date();
    }

    recordExecution(taskId: number, success: boolean): void {
        this.totalExecutions++;
        if (success) {
            this.totalSuccesses++;
        } else {
            this.totalFailures++;
        }
        this.lastExecutionAt = new Date();
        this.lastExecutionTaskId = taskId;
        this.lastExecutionSuccess = success;
    }

    getMetrics(pendingTasks: number, trackedTasks: number): HealthMetrics {
        const now = new Date();
        const uptimeSeconds = Math.floor((now.getTime() - this.startTime.getTime()) / 1000);
        const successRate = this.totalExecutions > 0
            ? ((this.totalSuccesses / this.totalExecutions) * 100).toFixed(1) + "%"
            : "N/A";

        return {
            startedAt: this.startTime.toISOString(),
            uptimeSeconds,
            cycleCount: this.cycleCount,
            totalExecutions: this.totalExecutions,
            totalSuccesses: this.totalSuccesses,
            totalFailures: this.totalFailures,
            successRate,
            lastExecutionAt: this.lastExecutionAt?.toISOString() || null,
            lastExecutionTaskId: this.lastExecutionTaskId,
            lastExecutionSuccess: this.lastExecutionSuccess,
            pendingTasks,
            trackedTasks,
        };
    }

    getSummaryLine(pendingTasks: number, trackedTasks: number): string {
        const m = this.getMetrics(pendingTasks, trackedTasks);
        const hrs = Math.floor(m.uptimeSeconds / 3600);
        const mins = Math.floor((m.uptimeSeconds % 3600) / 60);
        return `uptime=${hrs}h${mins}m | cycles=${m.cycleCount} | exec=${m.totalSuccesses}/${m.totalExecutions} (${m.successRate}) | pending=${m.pendingTasks}`;
    }
}

/**
 * ═══════════════════════════════════════════════════════════
 *  Retry with Exponential Backoff
 * ═══════════════════════════════════════════════════════════
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    opts: { maxRetries?: number; baseDelayMs?: number; maxDelayMs?: number; label?: string } = {}
): Promise<T> {
    const { maxRetries = 3, baseDelayMs = 500, maxDelayMs = 30_000, label = "operation" } = opts;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            lastError = err;
            if (attempt < maxRetries) {
                const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
                const jitter = Math.random() * delay * 0.2; // ±20% jitter
                const totalDelay = Math.floor(delay + jitter);
                console.log(`[Retry] ${label} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${totalDelay}ms: ${err.message}`);
                await new Promise((resolve) => setTimeout(resolve, totalDelay));
            }
        }
    }

    throw lastError!;
}
