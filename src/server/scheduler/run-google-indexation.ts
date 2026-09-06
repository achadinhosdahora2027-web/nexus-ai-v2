/**
 * NEXUS — Runner do pipeline de indexação Google (entrypoint de cron).
 * Uso: npm run engine:google   (GitHub Actions a cada 4h / Vercel Cron)
 *
 * Exit codes:
 *   0 — pipeline executado (inclui rate_limited: fail-closed, não trava CI)
 *   2 — erro de configuração (credencial ausente) para sinalizar no CI
 */

import {
  runGoogleIndexationPipeline,
  type IndexationReport,
} from "./google-indexation-engine.js";

function render(report: IndexationReport): string {
  const lines: string[] = [
    "",
    "════════ NEXUS · GOOGLE INDEXATION REPORT ════════",
    `start ...: ${report.startedAt}  (${report.durationMs} ms)`,
    `urls ....: ${report.totalUrls}`,
    `status ..: ${report.ok ? "RUN" : "SKIP"}${report.reason ? ` (${report.reason})` : ""}`,
  ];
  for (const h of report.hosts) {
    lines.push(
      `  ${h.host}`.padEnd(34) +
        `sitemap=${h.sitemap} quota=${h.quotaGranted} insp=${h.inspected} ` +
        `idx=${h.indexed} pend=${h.pending} err=${h.errors}` +
        `${h.rateLimited ? " ⚠RATE" : ""}`,
    );
  }
  lines.push("══════════════════════════════════════════════════");
  return lines.join("\n");
}

runGoogleIndexationPipeline()
  .then((report) => {
    console.log(render(report));
    process.exit(report.reason === "missing_credentials" ? 2 : 0);
  })
  .catch((err: unknown) => {
    console.error(
      `[google-indexation] falha fatal (fail-closed): ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  });
