// Serve os arquivos de verificacao do Yandex com 200 NA URL EXATA (.html),
// sem o 308 de clean-URLs do Pages (o verificador do Yandex exige 200 direto).
// Rota especifica: so executa para /yandex_<code>.html (invocacoes ~zero/dia).
export async function onRequestGet(context) {
  const code = String(context.params.code || '').replace(/[^a-f0-9]/gi, '');
  if (!/^[a-f0-9]{16}$/.test(code)) return context.next();
  const body = '<html>\n    <head>\n        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">\n    </head>\n    <body>Verification: ' + code + '</body>\n</html>\n';
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'public, max-age=300' } });
}
