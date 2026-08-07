/**
 * Confere o MP4 renderizado contra o que o manifesto pediu.
 *
 * Mede com `ffprobe` e compara resolucao, fps, duracao e codec. Falha quando
 * divergir, para que nenhum arquivo fora de especificacao siga adiante como se
 * estivesse correto.
 *
 * Uso: node scripts/verify-output.mjs --video out/video.mp4
 */
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

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

function probe(videoPath) {
  const raw = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,r_frame_rate,codec_name,nb_read_packets",
      "-show_entries",
      "format=duration",
      "-count_packets",
      "-of",
      "json",
      videoPath,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(raw);
}

function frameRateOf(stream) {
  const [num, den] = String(stream.r_frame_rate ?? "0/1").split("/");
  return Number(num) / Number(den || "1");
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.video) {
    throw new Error("Informe --video <caminho do mp4>");
  }

  const videoPath = resolve(process.cwd(), args.video);
  const manifest = JSON.parse(await readFile(join(repoRoot, "public", "manifest.json"), "utf8"));
  const expected = manifest.composition;

  const probed = probe(videoPath);
  const stream = probed.streams?.[0] ?? {};
  const measured = {
    width: Number(stream.width),
    height: Number(stream.height),
    fps: frameRateOf(stream),
    codec: String(stream.codec_name),
    frames: Number(stream.nb_read_packets),
    durationSeconds: Number(probed.format?.duration),
  };

  const sizeBytes = (await stat(videoPath)).size;
  const failures = [];

  if (measured.width !== expected.width || measured.height !== expected.height) {
    failures.push(`resolucao ${measured.width}x${measured.height}, esperada ${expected.width}x${expected.height}`);
  }
  if (Math.abs(measured.fps - expected.fps) > 0.01) {
    failures.push(`fps ${measured.fps.toFixed(3)}, esperado ${expected.fps}`);
  }
  if (measured.codec !== manifest.output.codec) {
    failures.push(`codec ${measured.codec}, esperado ${manifest.output.codec}`);
  }
  if (Math.abs(measured.frames - expected.durationFrames) > 1) {
    failures.push(`${measured.frames} frames, esperados ${expected.durationFrames}`);
  }
  if (sizeBytes < 1024) {
    failures.push(`arquivo com apenas ${sizeBytes} bytes`);
  }

  console.log(`Video ${manifest.videoId} do job ${manifest.jobId}`);
  console.log(`  medido: ${measured.width}x${measured.height} @ ${measured.fps.toFixed(3)}fps, ${measured.codec}`);
  console.log(`  frames: ${measured.frames} (manifesto: ${expected.durationFrames})`);
  console.log(`  duracao: ${measured.durationSeconds?.toFixed(2)}s (manifesto: ${expected.durationSeconds}s)`);
  console.log(`  tamanho: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB`);

  // Registrado, nao corrigido aqui: a faixa de duracao e responsabilidade do
  // roteiro e do TTS, no control plane. O renderizador so reporta.
  if (expected.durationCheck && !expected.durationCheck.withinDeclaredRange) {
    console.warn(
      `  aviso: o manifesto declara duracao fora da faixa do canal (${expected.durationCheck.actualSeconds}s contra ${expected.durationCheck.declaredMinSeconds} a ${expected.durationCheck.declaredMaxSeconds}s)`,
    );
  }

  if (failures.length > 0) {
    console.error("\nSaida divergente do manifesto:");
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log("\nSaida conforme o manifesto.");
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
