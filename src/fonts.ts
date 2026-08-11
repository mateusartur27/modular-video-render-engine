import { getAvailableFonts } from "@remotion/google-fonts";
import type { RenderManifest } from "./manifest";

/**
 * Carrega as familias tipograficas que o manifesto declara.
 *
 * Existe porque declarar a fonte nao a fazia aparecer. O manifesto pedia
 * `Montserrat`, `Bebas Neue` e `Oswald`, o componente montava a pilha CSS
 * corretamente, e o Chrome headless do runner **nao tem nenhuma delas
 * instalada**. O resultado caia no sans generico do sistema, e o video saia com
 * uma tipografia que ninguem escolheu.
 *
 * Nenhum nome de fonte vive aqui: as familias vem do manifesto, que as recebe do
 * JSON do canal. Este arquivo so resolve o nome contra o catalogo do Google
 * Fonts e carrega.
 *
 * Fonte que nao existe no catalogo e **ignorada em silencio**, de proposito: a
 * pilha CSS ja tem fallback, e derrubar um render inteiro porque uma familia
 * mudou de nome seria pior que desenhar com a fonte seguinte.
 */
export function familiesDeclaredBy(manifest: RenderManifest): string[] {
  const declared = [
    manifest.captions.layout.fontFamily,
    manifest.captions.layout.highlightFontFamily,
    manifest.captions.layout.secondaryFontFamily,
    manifest.overlays?.title?.fontFamily,
    // O estilo por palavra pode nomear familia propria; o layout e a regra, mas
    // quem desenha e o estilo, entao ambos precisam existir.
    ...manifest.captions.words.map((word) => word.style.fontFamily),
  ];

  return [...new Set(declared.filter((name): name is string => typeof name === "string" && name.length > 0))];
}

export async function loadDeclaredFonts(manifest: RenderManifest): Promise<string[]> {
  const catalog = getAvailableFonts();
  const loaded: string[] = [];

  for (const family of familiesDeclaredBy(manifest)) {
    const entry = catalog.find((item) => item.fontFamily === family);
    if (!entry) continue;

    const font = await entry.load();
    font.loadFont();
    loaded.push(family);
  }

  return loaded;
}
