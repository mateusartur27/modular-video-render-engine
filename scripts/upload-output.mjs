/**
 * Envia o MP4 renderizado para o control plane, por URL assinada.
 *
 * Este repositorio e publico e nao guarda credencial de nuvem. A autoridade para
 * gravar vem da assinatura HMAC na propria URL, emitida pelo control plane com
 * prazo curto e escopo de uma chave so.
 *
 * O hash e calculado aqui e declarado no cabecalho. O control plane recalcula e
 * recusa divergencia: upload truncado tem hash diferente, e sem essa conferencia
 * ele viraria um MP4 quebrado seguindo adiante em silencio.
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
      "x-artifact-sha256": sha256,
    },
    body: bytes,
  });

  const text = await response.text();

  // A URL assinada nao pode aparecer em log: ela e credencial de curta duracao, e
  // o log de um repositorio publico e legivel por qualquer pessoa.
  if (!response.ok) {
    throw new Error(`Upload recusado com HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  const body = JSON.parse(text);
  if (body.sha256 !== sha256) {
    throw new Error(`O destino registrou hash diferente: ${body.sha256}`);
  }

  console.log(`  aceito: chave ${body.key}, ${body.sizeBytes} bytes`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
