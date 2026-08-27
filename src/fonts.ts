import { getAvailableFonts } from "@remotion/google-fonts";
import type { RenderManifest } from "./manifest";

export interface FontRequest {
  family: string;
  style: "normal" | "italic";
  weight: string;
}

export interface FontLoadVariant extends FontRequest {
  subsets: string[];
}

export interface FontLoadFailure {
  family: string;
  style?: "normal" | "italic";
  weight?: string;
  reason: string;
}

export interface FontLoadReport {
  loaded: FontLoadVariant[];
  failed: FontLoadFailure[];
}

interface GoogleFontInfo {
  fonts: Record<string, Record<string, Record<string, string>>>;
}

interface GoogleFontModule {
  getInfo: () => GoogleFontInfo;
  loadFont: (
    style?: string,
    options?: { weights?: string[]; subsets?: string[]; ignoreTooManyRequestsWarning?: boolean },
  ) => { waitUntilDone: () => Promise<undefined> };
}

export interface FontCatalogEntry {
  fontFamily: string;
  load: () => Promise<unknown>;
}

/**
 * Variantes que o quadro realmente pode desenhar.
 *
 * O layout entra mesmo quando um papel nao apareceu nas palavras deste plano:
 * uma familia declarada pelo canal deve ser validada antes do render, em vez de
 * ficar dormente ate uma execucao futura cair silenciosamente no fallback.
 */
export function fontRequestsDeclaredBy(manifest: RenderManifest): FontRequest[] {
  const requests: FontRequest[] = [];
  const add = (family: unknown, style: "normal" | "italic", weight: number): void => {
    if (typeof family !== "string" || family.trim().length === 0) return;
    requests.push({ family, style, weight: String(weight) });
  };

  const layout = manifest.captions.layout;
  add(layout.fontFamily, "normal", layout.fontWeight);
  add(layout.impactSerifFontFamily ?? layout.highlightFontFamily, "italic", 900);
  add(layout.impactSansFontFamily ?? layout.fontFamily, "normal", 900);
  add(layout.secondaryFontFamily, "normal", 700);

  for (const word of manifest.captions.words) {
    add(word.style.fontFamily, word.style.italic ? "italic" : "normal", word.style.fontWeight);
  }

  add(manifest.overlays?.title?.fontFamily, "normal", 700);

  return uniqueBy(requests, (request) => `${request.family}\u0000${request.style}\u0000${request.weight}`);
}

export function familiesDeclaredBy(manifest: RenderManifest): string[] {
  return uniqueBy(
    fontRequestsDeclaredBy(manifest).map((request) => request.family),
    (family) => family,
  );
}

/**
 * Traduz peso/estilo CSS para variantes que a familia oferece de verdade.
 *
 * Algumas familias de display (Bebas Neue, por exemplo) so publicam peso 400 e
 * estilo normal, embora o manifesto use 900/italico. O navegador sintetiza
 * peso e inclinacao a partir da face disponivel; o importante aqui e carregar a
 * familia correta. Sempre pedimos apenas os subconjuntos necessarios para texto
 * latino, evitando dezenas de downloads de cirilico/vietnamita por familia.
 */
export function resolveFontLoadPlan(requests: FontRequest[], info: GoogleFontInfo): FontLoadVariant[] {
  const variants: FontLoadVariant[] = [];

  for (const request of requests) {
    const availableStyles = Object.keys(info.fonts);
    const style = info.fonts[request.style]
      ? request.style
      : info.fonts.normal
        ? "normal"
        : availableStyles[0];

    if (!style) {
      throw new Error(`A familia ${request.family} nao publica nenhuma variante`);
    }

    const byWeight = info.fonts[style]!;
    const availableWeights = Object.keys(byWeight);
    const weight = nearestAvailableWeight(request.weight, availableWeights);
    if (!weight) {
      throw new Error(`A familia ${request.family} nao publica nenhum peso no estilo ${style}`);
    }

    const availableSubsets = Object.keys(byWeight[weight]!);
    const latinSubsets = ["latin", "latin-ext"].filter((subset) => availableSubsets.includes(subset));
    const subsets = latinSubsets.length > 0 ? latinSubsets : availableSubsets;
    if (subsets.length === 0) {
      throw new Error(`A familia ${request.family} nao publica subconjuntos para ${style} ${weight}`);
    }

    variants.push({ family: request.family, style: style as "normal" | "italic", weight, subsets });
  }

  return uniqueBy(variants, (variant) => `${variant.family}\u0000${variant.style}\u0000${variant.weight}`);
}

/**
 * Carrega e aguarda todas as faces usadas pelo manifesto.
 *
 * A carga e best effort: cada familia e tentada independentemente e as falhas
 * sao devolvidas ao chamador. Assim uma fonte indisponivel nao impede que as
 * demais sejam carregadas nem derruba o video; o CSS usa sua pilha de fallback
 * somente para as faces que realmente falharam.
 */
export async function loadDeclaredFonts(
  manifest: RenderManifest,
  catalog: readonly FontCatalogEntry[] = getAvailableFonts(),
): Promise<FontLoadReport> {
  const requests = fontRequestsDeclaredBy(manifest);
  const loaded: FontLoadVariant[] = [];
  const failed: FontLoadFailure[] = [];

  for (const family of familiesDeclaredBy(manifest)) {
    const entry = catalog.find((item) => item.fontFamily === family);
    if (!entry) {
      failed.push({ family, reason: `Fonte declarada nao existe no Google Fonts: ${family}` });
      continue;
    }

    let fontModule: GoogleFontModule;
    let plan: FontLoadVariant[];
    try {
      fontModule = (await entry.load()) as GoogleFontModule;
      const familyRequests = requests.filter((request) => request.family === family);
      plan = resolveFontLoadPlan(familyRequests, fontModule.getInfo());
    } catch (error) {
      failed.push({ family, reason: errorMessage(error) });
      continue;
    }

    for (const variant of plan) {
      try {
        const pending = fontModule.loadFont(variant.style, {
          weights: [variant.weight],
          subsets: variant.subsets,
        });
        await pending.waitUntilDone();
        loaded.push(variant);
      } catch (error) {
        failed.push({
          family: variant.family,
          style: variant.style,
          weight: variant.weight,
          reason: `Falha ao carregar a fonte declarada ${variant.family} (${variant.style} ${variant.weight}): ${errorMessage(error)}`,
        });
      }
    }
  }

  return { loaded, failed };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nearestAvailableWeight(requested: string, available: string[]): string | undefined {
  if (available.includes(requested)) return requested;

  const requestedNumber = Number(requested);
  const numeric = available
    .map((weight) => ({ weight, value: Number(weight) }))
    .filter((item) => Number.isFinite(item.value));

  if (Number.isFinite(requestedNumber) && numeric.length > 0) {
    numeric.sort((left, right) => {
      const distance = Math.abs(left.value - requestedNumber) - Math.abs(right.value - requestedNumber);
      return distance !== 0 ? distance : right.value - left.value;
    });
    return numeric[0]!.weight;
  }

  return available[0];
}

function uniqueBy<T>(values: T[], keyOf: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = keyOf(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
