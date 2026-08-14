/**
 * Envia o MP4 renderizado direto para o R2, por URL pre-assinada nativa
 * (S3-compatible, SigV4) emitida pelo control plane com prazo curto e escopo
 * de uma chave so (ADR 0025 do control plane).
 *
 * Este repositorio e publico e nao guarda credencial de nuvem nenhuma; a
 * autoridade para gravar vem inteira da assinatura ja embutida na URL. Ate
 * 2026-08-13 o destino era uma rota do proprio Worker do control plane, que
 * proxeava os bytes pelo corpo da requisicao — e por isso tinha teto de
 * 100 MB. Agora o PUT vai direto no R2, sem esse teto.
 *
 * O hash e calculado aqui e enviado como `x-amz-meta-sha256`, a convencao S3
 * de metadado customizado: o R2 grava isso como metadado do objeto, o mesmo
 * campo que o control plane ja confere em toda leitura. Uma escrita S3 bem
 * sucedida devolve 200 vazio com `ETag`, nao um corpo JSON — nao ha o que
 * conferir aqui alem do HTTP status; a conferencia de hash acontece do lado
 * de quem le o objeto depois.
 *
 * Uso:
 *   node scripts/upload-output.mjs --video out/video-1.mp4 --url https://...
 */
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (key) {
      args[key] = argv[i + 1];
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.video || !args.url) {
    throw new Error("Informe --video <caminho> e --url <url assinada>");
  }

  const path = resolve(process.cwd(), args.video);
  const info = await stat(path);
  const bytes = await readFile(path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  console.log(`Enviando ${args.video}`);
  console.log(`  tamanho: ${(info.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  sha256: ${sha256}`);

  const response = await fetch(args.url, {
    method: "PUT",
    headers: {
      "content-type": "video/mp4",
      "content-length": String(info.size),
      "x-amz-meta-sha256": sha256,
    },
    body: bytes,
  });

  // A URL assinada nao pode aparecer em log: ela e credencial de curta duracao, e
  // o log de um repositorio publico e legivel por qualquer pessoa.
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload recusado com HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  console.log(`  aceito: etag ${response.headers.get("etag") ?? "(sem etag)"}, ${info.size} bytes`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
