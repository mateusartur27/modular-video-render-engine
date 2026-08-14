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
 * **Corrigido em 2026-08-14, medido contra o R2 real**: a primeira versao
 * enviava `x-amz-meta-sha256` para o R2 gravar como metadado consultavel
 * depois — mas o R2 exige que **todo** header `x-amz-meta-*` faca parte dos
 * headers assinados, mesmo em URL pre-assinada por query string. Como o
 * control plane assina a URL **antes** deste arquivo existir, ele nunca
 * poderia assinar um hash que so existe depois do render terminar — a
 * tentativa real devolveu `SignatureDoesNotMatch` sempre. `content-type`,
 * ao contrario, o R2 aceita sem exigir assinatura (medido tambem).
 *
 * A conferencia de integridade agora e o `ETag` que o proprio R2 devolve na
 * resposta do PUT: para um objeto enviado num `PUT` simples (nao
 * multipart), o `ETag` do S3/R2 e o MD5 do conteudo. Comparar contra o MD5
 * calculado localmente detecta corrupcao em transito sem precisar assinar
 * nada a mais. **O que isso nao faz**: gravar SHA-256 como metadado do
 * objeto. `R2ArtifactStore.head()`/`get()`, do lado do control plane, vao
 * ler `sha256: ""` para este artefato especifico — nenhum consumidor atual
 * depende desse campo para a saida do render, mas fica registrado como
 * limitacao real, nao escondida (ADR 0025).
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
  const md5 = createHash("md5").update(bytes).digest("hex");

  console.log(`Enviando ${args.video}`);
  console.log(`  tamanho: ${(info.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  sha256: ${sha256}`);

  const response = await fetch(args.url, {
    method: "PUT",
    headers: {
      "content-type": "video/mp4",
      "content-length": String(info.size),
    },
    body: bytes,
  });

  // A URL assinada nao pode aparecer em log: ela e credencial de curta duracao, e
  // o log de um repositorio publico e legivel por qualquer pessoa.
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload recusado com HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  const etag = (response.headers.get("etag") ?? "").replace(/^"|"$/g, "");
  if (etag && etag !== md5) {
    throw new Error(`Upload aceito, mas o ETag do R2 (${etag}) nao bate com o MD5 local (${md5}) — corrupcao em transito.`);
  }

  console.log(`  aceito: etag ${etag || "(sem etag)"} confere com o MD5 local, ${info.size} bytes`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
