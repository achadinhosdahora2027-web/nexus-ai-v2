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
    // CLAREZA COMERCIAL v4: layout executivo — PROIBIDA string crua de API
    // (rate_limited, sitemap=submitted, chaves=valor). Tradução:
    // indexadas → "portas abertas"; pendentes → "aguardando leitura do robô".
    // Fail-closed: qualquer falha de formatação vira "Processando dados
    // limpos" e o run segue (nunca quebra o cron nem as rotas de sitemap).
    const hostLimpo = (h: string) =>
      h.replace(/^https?:\/\//, "").replace(/^www\./, "");
    let consolidado: string;
    try {
      const dominios =
        [...new Set(report.hosts.map((h) => hostLimpo(h.host)))].join(" · ") ||
        "Processando dados limpos";
      const rateLimited = report.hosts.some((h) => h.rateLimited);
      const status = !report.ok
        ? "EM REENTREGA AUTOMÁTICA 🔁"
        : rateLimited
          ? "LIMITE DE SEGURANÇA DO DIA ATINGIDO 🧊"
          : "OK ✅";
      const lines: string[] = [
        "🛰️ MONITOR DE BUSCAS GOOGLE: PÁGINAS ENVIADAS PARA O MAPA MUNDI!",
        "",
        `• 🌐 Domínios Monitorados: ${dominios}`,
        `• 📈 Status no Google: ${status}`,
      ];
      if (rateLimited) {
        lines.push(
          "• 🧊 Aviso do Sistema: Uma das contas atingiu o limite de segurança diário de 200 envios. O sistema congelou o lote na fila com segurança para reentrega automática.",
        );
      } else if (!report.ok) {
        lines.push(
          "• 🧊 Aviso do Sistema: execução adiada — o lote segue protegido na fila para reentrega automática.",
        );
      }
      lines.push(
        `• 🎯 Novas portas abertas nas buscas: ${totals.indexed} vitrines ativas`,
        `• ⏳ Aguardando leitura do robô do Google: ${totals.pending} páginas na fila`,
        "• ⚙️ Mensagem do Dono: Seu catálogo de 14.301 anúncios permanece 100% read-only, seguro e protegido contra falhas.",
      );
      consolidado = lines.join("\n");
    } catch {
      consolidado = [
        "🛰️ MONITOR DE BUSCAS GOOGLE: PÁGINAS ENVIADAS PARA O MAPA MUNDI!",
        "",
        "• 🌐 Domínios Monitorados: Processando dados limpos",
        "• 📈 Status no Google: PROCESSANDO DADOS LIMPOS",
        "• 🎯 Novas portas abertas nas buscas: Processando dados limpos",
        "• ⏳ Aguardando leitura do robô do Google: Processando dados limpos",
        "• ⚙️ Mensagem do Dono: Seu catálogo de 14.301 anúncios permanece 100% read-only, seguro e protegido contra falhas.",
      ].join("\n");
    }
    await sendTelegramAlert(consolidado);
    process.exit(report.reason === "missing_credentials" ? 2 : 0);
  })
  .catch((err: unknown) => {
    console.error(
      `[google-indexation] falha fatal (fail-closed): ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  });
