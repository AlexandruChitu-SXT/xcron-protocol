import * as http from "http";
import { HealthTracker, HealthMetrics } from "./logger";
import { RelayerService } from "./relayer";

/**
 * KeeperDashboard — Lightweight HTTP server for keeper monitoring.
 * 
 * Endpoints:
 *   GET /           → HTML dashboard with real-time metrics
 *   GET /health     → JSON health check (for uptime monitors)
 *   GET /metrics    → Full JSON metrics
 * 
 * Default port: 3300 (configurable)
 */
export class KeeperDashboard {
    private server: http.Server | null = null;
    private healthTracker: HealthTracker;
    private getTaskCounts: () => { pending: number; tracked: number };
    private relayer?: RelayerService;

    constructor(
        healthTracker: HealthTracker,
        getTaskCounts: () => { pending: number; tracked: number }
    ) {
        this.healthTracker = healthTracker;
        this.getTaskCounts = getTaskCounts;
    }

    setRelayer(relayer: RelayerService): void {
        this.relayer = relayer;
    }

    start(port: number = 3300): void {
        this.server = http.createServer((req, res) => {
            const url = req.url || "/";
            const method = req.method || "GET";

            // CORS headers for relay endpoint
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type");

            if (method === "OPTIONS") {
                res.writeHead(204);
                return res.end();
            }

            if (url === "/health") {
                return this.handleHealth(res);
            }
            if (url === "/metrics") {
                return this.handleMetrics(res);
            }
            if (url === "/relay" && method === "POST") {
                return this.handleRelay(req, res);
            }
            return this.handleDashboard(res);
        });

        this.server.listen(port, () => {
            console.log(`📊 Keeper Dashboard: http://localhost:${port}`);
        });

        this.server.on("error", (err: any) => {
            if (err.code === "EADDRINUSE") {
                console.log(`⚠️  Dashboard port ${port} in use, trying ${port + 1}`);
                this.start(port + 1);
            } else {
                console.error("Dashboard server error:", err);
            }
        });
    }

    stop(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }

    private getMetricsData(): HealthMetrics {
        const counts = this.getTaskCounts();
        return this.healthTracker.getMetrics(counts.pending, counts.tracked);
    }

    private handleHealth(res: http.ServerResponse): void {
        const m = this.getMetricsData();
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({
            status: "ok",
            uptime: m.uptimeSeconds,
            executions: m.totalExecutions,
            successRate: m.successRate,
        }));
    }

    private handleMetrics(res: http.ServerResponse): void {
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify(this.getMetricsData(), null, 2));
    }

    /**
     * POST /relay — Relayed V3 gasless transactions.
     * Accepts a user-signed transaction JSON, adds relayer signature, broadcasts.
     */
    private handleRelay(req: http.IncomingMessage, res: http.ServerResponse): void {
        if (!this.relayer) {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "Relayer service not configured" }));
            return;
        }

        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", async () => {
            try {
                const request = JSON.parse(body);
                if (!request.transaction) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: false, error: "Missing 'transaction' field" }));
                    return;
                }

                const result = await this.relayer!.relay(request);
                const statusCode = result.success ? 200 : 400;
                res.writeHead(statusCode, { "Content-Type": "application/json" });
                res.end(JSON.stringify(result));
            } catch (err: any) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, error: `Invalid request: ${err.message}` }));
            }
        });
    }

    private handleDashboard(res: http.ServerResponse): void {
        const m = this.getMetricsData();
        const hrs = Math.floor(m.uptimeSeconds / 3600);
        const mins = Math.floor((m.uptimeSeconds % 3600) / 60);
        const secs = m.uptimeSeconds % 60;
        const uptime = `${hrs}h ${mins}m ${secs}s`;
        const successColor = m.successRate === "N/A" ? "#888" :
            parseFloat(m.successRate) >= 90 ? "#00e676" :
                parseFloat(m.successRate) >= 50 ? "#ffa726" : "#ff5252";

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="10">
<title>XCron Keeper Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0f1a; color: #e0e0e0; font-family: 'Inter', system-ui, sans-serif; padding: 24px; }
  h1 { color: #00e5ff; font-size: 1.4rem; margin-bottom: 8px; }
  .subtitle { color: #888; font-size: 0.8rem; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px; }
  .card .label { font-size: 0.7rem; text-transform: uppercase; color: #888; letter-spacing: 0.5px; margin-bottom: 6px; }
  .card .value { font-size: 1.6rem; font-weight: 700; color: #fff; }
  .card .value.accent { color: #00e5ff; }
  .card .value.success { color: ${successColor}; }
  .last-exec { background: rgba(0,229,255,0.06); border: 1px solid rgba(0,229,255,0.15); border-radius: 10px; padding: 16px; }
  .last-exec .label { font-size: 0.7rem; text-transform: uppercase; color: #00e5ff; letter-spacing: 0.5px; margin-bottom: 8px; }
  .last-exec .row { display: flex; gap: 20px; font-size: 0.85rem; }
  .last-exec .row span { color: #888; }
  .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .status-dot.ok { background: #00e676; box-shadow: 0 0 8px #00e676; }
  .footer { margin-top: 24px; color: #555; font-size: 0.7rem; text-align: center; }
</style>
</head>
<body>
<h1>⚡ XCron Keeper Dashboard</h1>
<p class="subtitle"><span class="status-dot ok"></span>Online — auto-refreshes every 10s</p>
<div class="grid">
  <div class="card"><div class="label">Uptime</div><div class="value accent">${uptime}</div></div>
  <div class="card"><div class="label">Poll Cycles</div><div class="value">${m.cycleCount.toLocaleString()}</div></div>
  <div class="card"><div class="label">Executions</div><div class="value">${m.totalExecutions}</div></div>
  <div class="card"><div class="label">Success Rate</div><div class="value success">${m.successRate}</div></div>
  <div class="card"><div class="label">Successes</div><div class="value" style="color:#00e676">${m.totalSuccesses}</div></div>
  <div class="card"><div class="label">Failures</div><div class="value" style="color:${m.totalFailures > 0 ? '#ff5252' : '#888'}">${m.totalFailures}</div></div>
  <div class="card"><div class="label">Pending Tasks</div><div class="value">${m.pendingTasks}</div></div>
  <div class="card"><div class="label">Tracked Tasks</div><div class="value">${m.trackedTasks}</div></div>
</div>
<div class="last-exec">
  <div class="label">Last Execution</div>
  <div class="row">
    <div>Task: <strong>${m.lastExecutionTaskId ?? "—"}</strong></div>
    <div>Result: <strong style="color:${m.lastExecutionSuccess ? '#00e676' : m.lastExecutionSuccess === false ? '#ff5252' : '#888'}">${m.lastExecutionSuccess === true ? '✅ Success' : m.lastExecutionSuccess === false ? '❌ Failed' : '—'}</strong></div>
    <div><span>At:</span> ${m.lastExecutionAt ?? "—"}</div>
  </div>
</div>
<div class="footer">XCron Protocol — Started ${m.startedAt} — <a href="/metrics" style="color:#00e5ff">JSON Metrics</a> · <a href="/health" style="color:#00e5ff">Health Check</a></div>
</body>
</html>`;

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
    }
}
