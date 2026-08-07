import { staticFile } from "remotion";
import type { ArtifactRef } from "./manifest";

/**
 * Resolve uma referencia de artefato do manifesto em uma URL que o Chromium do
 * Remotion consegue carregar.
 *
 * - `https://`: URL temporaria assinada pelo control plane, usada direto;
 * - `r2://` e `file://`: o passo de preparacao baixa ou copia o arquivo para
 *   `public/assets/<sha256>.<ext>` antes do render, e aqui viramos `staticFile`.
 *
 * O nome local e o SHA-256, entao dois takes iguais compartilham arquivo e o
 * conteudo e verificavel pelo proprio nome.
 */
export function localAssetName(ref: ArtifactRef): string {
  return `assets/${ref.sha256}${extensionFor(ref)}`;
}

export function resolveAssetSrc(ref: ArtifactRef): string {
  if (ref.uri.startsWith("https://")) {
    return ref.uri;
  }
  return staticFile(localAssetName(ref));
}

function extensionFor(ref: ArtifactRef): string {
  const fromMime: Record<string, string> = {
    "video/mp4": ".mp4",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
  };

  const known = fromMime[ref.mimeType];
  if (known) {
    return known;
  }

  const withoutQuery = ref.uri.split("?")[0] ?? "";
  const match = /\.([a-z0-9]{2,5})$/i.exec(withoutQuery);
  return match ? `.${match[1]!.toLowerCase()}` : "";
}

/** Converte ganho em decibeis para volume linear, como o Remotion espera. */
export function dbToVolume(db: number): number {
  return Math.pow(10, db / 20);
}
