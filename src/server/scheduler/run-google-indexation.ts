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
import { sendTelegramAlert } from "./telegram-notify.js";

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
  .then(async (report) => {
    console.log(render(report));
    // Esteira 5: resumo consolidado no Telegram (fail-closed, nunca quebra o run)
    const totals = report.hosts.reduce(
      (a, h) => ({
        inspected: a.inspected + h.inspected,
        indexed: a.indexed + h.indexed,
        pending: a.pending + h.pending,
      }),
      { inspected: 0, indexed: 0, pending: 0 },
    );
    await sendTelegramAlert(
      [
        "🛰️ PROJETO NEXUS - RELATÓRIO DE TELEMETRIA",
        `Job Executado: google_indexation (run consolidado)`,
        `Status da Operação: ${report.ok ? "ok" : "skip"}${report.reason ? ` (${report.reason})` : ""}`,
        `Total de URLs na fila: ${report.totalUrls}`,
        `URLs processadas no dia: ${totals.inspected}`,
        `Mensagem do Servidor: inspecionadas=${totals.inspected} indexadas=${totals.indexed} pendentes=${totals.pending} · ${report.hosts.map((h) => `${h.host}:sitemap=${h.sitemap}`).join(" | ")}`.slice(0, 100),
      ].join("\n"),
    );
    process.exit(report.reason === "missing_credentials" ? 2 : 0);
  })
  .catch((err: unknown) => {
    console.error(
      `[google-indexation] falha fatal (fail-closed): ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  });
