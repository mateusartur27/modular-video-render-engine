/**
 * Espelho de tipos do `RenderManifest@2`, contrato produzido pelo control plane
 * privado. Este repositorio consome o manifesto e nao conhece canal, tema,
 * plataforma nem regra editorial: tudo chega como dado.
 *
 * Fonte do contrato: `schemas/render-manifest.schema.json` no control plane, e
 * a ADR 0012. Ao mudar o contrato la, atualizar aqui e bater a versao.
 */

export interface ArtifactRef {
  uri: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  expiresAt?: string;
}

export interface DurationCheck {
  declaredMinSeconds: number;
  declaredMaxSeconds: number;
  actualSeconds: number;
  withinDeclaredRange: boolean;
}

export interface CompositionSettings {
  width: number;
  height: number;
  fps: number;
  durationFrames: number;
  durationSeconds: number;
  narrationFrames: number;
  tailFrames: number;
  durationCheck: DurationCheck;
}

export interface AudioTrackMix {
  narration: { artifact: ArtifactRef; durationMs: number };
  music: {
    artifact: ArtifactRef;
    trackId: string;
    gainDb: number;
    duckUnderVoiceDb: number;
    fadeInMs: number;
    fadeOutMs: number;
  };
}

export interface TransitionSettings {
  type: string;
  durationFrames: number;
}

export interface EditingSettings {
  layout: string;
  cropMode: string;
  cutMode: string;
  shotSelection: string;
  minimumShotFrames: number;
  maximumShotFrames: number;
  defaultTransition: TransitionSettings;
  shotCount: number;
  assetsAvailable: number;
  assetsUsed: number;
  assetReuse: boolean;
}

export type ShotMediaKind = "video" | "image";

/**
 * Movimento sintetico de fotografia (Ken Burns), declarado pelo control plane.
 *
 * O renderizador **nao inventa movimento**: escolher aqui tornaria o render
 * irreproduzivel, porque o mesmo manifesto passaria a poder gerar videos
 * diferentes. A unica liberdade deste lado e limitar o deslocamento ao que as
 * dimensoes reais da imagem permitem, para nao revelar borda vazia.
 *
 * Deslocamento em fracao da imagem, 0.5 no centro. `scale` 1 preenche o quadro
 * com recorte; acima de 1, mais ampliado.
 */
export interface ShotMotion {
  type: "ken-burns";
  startScale: number;
  endScale: number;
  startXPercent: number;
  startYPercent: number;
  endXPercent: number;
  endYPercent: number;
  easing: string;
}

/**
 * Credito de licenca, ja resolvido pelo control plane — nunca template, nunca
 * montado aqui. Parte do acervo do Wikimedia Commons (ADR 0037) e CC BY / CC
 * BY-SA e exige credito visivel para uso legal.
 */
export interface ShotCredit {
  text: string;
}

export interface TimelineShot {
  order: number;
  assetId: string;
  artifact: ArtifactRef;
  source: {
    width: number;
    height: number;
    fps: number | null;
    durationMs: number;
    /** Ausente e lido como `"video"`, para manifesto antigo continuar valido. */
    kind?: ShotMediaKind;
  };
  startFrame: number;
  durationFrames: number;
  sourceTrimStartMs: number;
  transition: TransitionSettings;
  /** So chega para `source.kind === "image"`. */
  motion?: ShotMotion;
  /** So chega quando a midia do corte exige credito visivel. */
  credit?: ShotCredit;
}

export interface ColorGradingSettings {
  preset: string;
  contrast: number;
  brightness: number;
  saturation: number;
  vignette: number;
  grain: number;
}

export interface CaptionWord {
  id: string;
  word: string;
  startFrame: number;
  endFrame: number;
  phraseEndFrame?: number;
  position: { x: number; y: number; align: "left" | "center" | "right"; rotation: number };
  style: {
    fontFamily: string;
    fontWeight: number;
    fontSize: number;
    scale: number;
    color: string;
    strokeColor: string;
    strokeWidth: number;
    shadowBlur: number;
    italic: boolean;
  };
  animation: { entrance: string; exit: string; easing: string; durationFrames: number };
  semanticTag?: string;
}

export interface CaptionsTrack {
  enabled: boolean;
  trackId: string;
  /**
   * Unica fonte de estilo de legenda, e o **contrato** que as palavras obedecem:
   * o control plane recusa construir um manifesto cujas palavras desobedecam o
   * que este bloco declara (ADR 0020).
   */
  layout: {
    fontFamily: string;
    /** Campos explicitos novos; opcionais para abrir manifestos @2 antigos. */
    impactSerifFontFamily?: string;
    impactSansFontFamily?: string;
    /** Alias legado de impactSerifFontFamily. */
    highlightFontFamily: string;
    secondaryFontFamily: string;
    layoutMode: string;
    maxWordsPerPhrase: number;
    anticipationMs: number;
    safeAreaBottomPx: number;
    uppercase: boolean;
    fontSizePx: number;
    fontWeight: number;
    strokeColor: string;
    strokeWidthPx: number;
    lineHeightPx: number;
  };
  words: CaptionWord[];
}

export interface OverlaySettings {
  progressBar?: { color: string; y: number; marginX: number; heightPx: number };
  title?: {
    text: string;
    fontFamily: string;
    fontSizePx: number;
    color: string;
    y: number;
    uppercase: boolean;
    letterSpacingPx?: number;
  };
}

export interface RenderManifest {
  manifestVersion: "2.0.0";
  manifestId: string;
  jobId: string;
  videoId: string;
  channelId: string;
  channelConfigRevision: string;
  generatedAt: string;
  composition: CompositionSettings;
  audio: AudioTrackMix;
  editing: EditingSettings;
  timeline: TimelineShot[];
  captions: CaptionsTrack;
  output: {
    r2BucketBinding: string;
    objectKey: string;
    container: string;
    codec: string;
    pixelFormat: string;
    /** Qualidade de codificacao. Menor e melhor imagem e arquivo maior. */
    crf: number;
    /**
     * Teto de tamanho que o caminho de entrega aguenta, conferido **antes** do
     * upload. O control plane recebe o MP4 por URL assinada num Cloudflare
     * Worker, que aceita no maximo 100 MB de corpo.
     */
    maxSizeBytes: number;
  };
  colorGrading?: ColorGradingSettings;
  overlays?: OverlaySettings;
}

export const MANIFEST_VERSION = "2.0.0";

/**
 * Verificacao minima de forma. Nao substitui o schema do control plane, que e a
 * autoridade; serve para falhar cedo e com mensagem util quando o job recebe um
 * manifesto de outra versao ou incompleto.
 */
export function assertRenderManifest(value: unknown): RenderManifest {
  if (typeof value !== "object" || value === null) {
    throw new Error("Manifesto ausente ou nao e um objeto");
  }

  const manifest = value as Partial<RenderManifest>;

  if (manifest.manifestVersion !== MANIFEST_VERSION) {
    throw new Error(
      `Versao de manifesto nao suportada: ${String(manifest.manifestVersion)}. Este renderizador consome ${MANIFEST_VERSION}`,
    );
  }

  const required: Array<keyof RenderManifest> = ["composition", "audio", "editing", "timeline", "captions", "output"];
  for (const key of required) {
    if (manifest[key] === undefined) {
      throw new Error(`Manifesto sem o bloco obrigatorio "${key}"`);
    }
  }

  if (!Array.isArray(manifest.timeline) || manifest.timeline.length === 0) {
    throw new Error("Manifesto com timeline vazia: nao ha o que renderizar");
  }

  return manifest as RenderManifest;
}
