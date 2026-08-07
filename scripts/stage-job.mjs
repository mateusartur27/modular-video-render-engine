/**
 * Prepara um job de renderizacao.
 *
 * Le um RenderManifest@2, resolve cada artefato referenciado e grava tudo em
 * `public/`, que e a raiz estatica do Remotion:
 *
 *   public/manifest.json          o manifesto consumido pela composicao
 *   public/assets/<sha256>.<ext>  narracao, musica e takes
 *
 * Esquemas aceitos nas referencias:
 *   https://  baixa (URL temporaria assinada pelo control plane)
 *   file://   copia de --asset-root, para execucao local
 *   r2://     ainda nao suportado aqui de proposito: o control plane deve
 *             entregar URLs assinadas em vez de exigir credencial neste
 *             repositorio publico
 *
 * Uso:
 *   node scripts/stage-job.mjs --manifest ../caminho/manifest.json --asset-root ../controle-plane
 *   node scripts/stage-job.mjs --manifest-url https://... (assinada)
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const publicDir = join(repoRoot, "public");
const assetsDir = join(publicDir, "assets");

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

function localName(ref) {
  const byMime = {
    "video/mp4": ".mp4",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
  };
  const fromMime = byMime[ref.mimeType];
  if (fromMime) {
    return `${ref.sha256}${fromMime}`;
  }
  const match = /\.([a-z0-9]{2,5})$/i.exec((ref.uri ?? "").split("?")[0] ?? "");
  return `${ref.sha256}${match ? `.${match[1].toLowerCase()}` : ""}`;
}

async function loadManifest(args) {
  if (args["manifest-url"]) {
    const response = await fetch(args["manifest-url"]);
    if (!response.ok) {
      throw new Error(`Falha ao baixar o manifesto: HTTP ${response.status}`);
    }
    return await response.json();
  }
  if (!args.manifest) {
    throw new Error("Informe --manifest <caminho> ou --manifest-url <url assinada>");
  }
  return JSON.parse(await readFile(resolve(process.cwd(), args.manifest), "utf8"));
}

function collectRefs(manifest) {
  const refs = [manifest.audio.narration.artifact, manifest.audio.music.artifact];
  for (const shot of manifest.timeline) {
    refs.push(shot.artifact);
  }

  const unique = new Map();
  for (const ref of refs) {
    unique.set(ref.sha256, ref);
  }
  return [...unique.values()];
}

async function fetchRef(ref, assetRoot) {
  if (ref.uri.startsWith("https://")) {
    const response = await fetch(ref.uri);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ao baixar ${ref.sha256}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  if (ref.uri.startsWith("file://")) {
    if (!assetRoot) {
      throw new Error("Referencias file:// exigem --asset-root");
    }
    const relative = ref.uri.slice("file://".length);
    return await readFile(join(assetRoot, relative));
  }

  if (ref.uri.startsWith("r2://")) {
    throw new Error(
      `Referencia r2:// nao e resolvida aqui: ${ref.uri}. O control plane deve entregar URL assinada, para este repositorio publico nao guardar credencial.`,
    );
  }

  throw new Error(`Esquema de URI nao suportado: ${ref.uri}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const manifest = await loadManifest(args);

  if (manifest.manifestVersion !== "2.0.0") {
    throw new Error(`Versao de manifesto nao suportada: ${manifest.manifestVersion}`);
  }

  const assetRoot = args["asset-root"] ? resolve(process.cwd(), args["asset-root"]) : undefined;

  await rm(assetsDir, { recursive: true, force: true });
  await mkdir(assetsDir, { recursive: true });

  const refs = collectRefs(manifest);
  let verified = 0;
  let mismatched = 0;

  for (const ref of refs) {
    const bytes = await fetchRef(ref, assetRoot);
    const digest = createHash("sha256").update(bytes).digest("hex");

    if (digest === ref.sha256) {
      verified += 1;
    } else {
      mismatched += 1;
      console.warn(`  aviso: hash divergente em ${ref.uri}`);
      console.warn(`         manifesto ${ref.sha256}`);
      console.warn(`         arquivo   ${digest}`);
    }

    await writeFile(join(assetsDir, localName(ref)), bytes);
  }

  await writeFile(join(publicDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Job ${manifest.jobId} preparado para o video ${manifest.videoId}`);
  console.log(`  artefatos: ${refs.length} (hash conferido: ${verified}, divergente: ${mismatched})`);
  console.log(`  formato: ${manifest.composition.width}x${manifest.composition.height} @ ${manifest.composition.fps}fps`);
  console.log(`  duracao: ${manifest.composition.durationFrames} frames (${manifest.composition.durationSeconds}s)`);
  console.log(`  cortes: ${manifest.timeline.length}, palavras de legenda: ${manifest.captions.words.length}`);

  if (mismatched > 0) {
    console.error("\nArtefato com hash divergente do manifesto. Nao publique este render.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
