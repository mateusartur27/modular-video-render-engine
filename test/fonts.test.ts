import { describe, expect, it, vi } from "vitest";
import {
  familiesDeclaredBy,
  fontRequestsDeclaredBy,
  loadDeclaredFonts,
  resolveFontLoadPlan,
  type FontCatalogEntry,
} from "../src/fonts";
import type { RenderManifest } from "../src/manifest";

const manifest = {
  captions: {
    layout: {
      fontFamily: "Montserrat",
      impactSerifFontFamily: "Playfair Display",
      impactSansFontFamily: "Bebas Neue",
      highlightFontFamily: "Playfair Display",
      secondaryFontFamily: "Oswald",
      fontWeight: 800,
    },
    words: [
      { style: { fontFamily: "Montserrat", fontWeight: 800, italic: false } },
      { style: { fontFamily: "Playfair Display", fontWeight: 900, italic: true } },
      { style: { fontFamily: "Bebas Neue", fontWeight: 900, italic: false } },
      { style: { fontFamily: "Oswald", fontWeight: 700, italic: false } },
    ],
  },
  overlays: { title: { fontFamily: "Montserrat" } },
} as unknown as RenderManifest;

describe("fontes declaradas pelo manifesto", () => {
  it("coleta as familias e variantes que realmente podem chegar ao quadro", () => {
    expect(familiesDeclaredBy(manifest)).toEqual(["Montserrat", "Playfair Display", "Bebas Neue", "Oswald"]);
    expect(fontRequestsDeclaredBy(manifest)).toEqual([
      { family: "Montserrat", style: "normal", weight: "800" },
      { family: "Playfair Display", style: "italic", weight: "900" },
      { family: "Bebas Neue", style: "normal", weight: "900" },
      { family: "Oswald", style: "normal", weight: "700" },
      { family: "Montserrat", style: "normal", weight: "700" },
    ]);
  });

  it("usa a face mais proxima quando uma fonte de display so publica peso 400 normal", () => {
    expect(
      resolveFontLoadPlan(
        [{ family: "Bebas Neue", style: "italic", weight: "900" }],
        {
          fonts: {
            normal: {
              "400": { latin: "bebas-latin.woff2", "latin-ext": "bebas-latin-ext.woff2" },
            },
          },
        },
      ),
    ).toEqual([
      {
        family: "Bebas Neue",
        style: "normal",
        weight: "400",
        subsets: ["latin", "latin-ext"],
      },
    ]);
  });

  it("carrega so as variantes latinas necessarias e espera todas terminarem", async () => {
    const calls: Array<{ family: string; style?: string; weights?: string[]; subsets?: string[] }> = [];
    const waited: string[] = [];

    const catalog = [
      catalogEntry("Montserrat", {
        normal: {
          "700": subsets("montserrat-700"),
          "800": subsets("montserrat-800"),
        },
      }),
      catalogEntry("Playfair Display", { italic: { "900": subsets("playfair-900-italic") } }),
      catalogEntry("Bebas Neue", { normal: { "400": subsets("bebas-400") } }),
      catalogEntry("Oswald", { normal: { "700": subsets("oswald-700") } }),
    ];

    for (const entry of catalog) {
      const originalLoad = entry.load;
      entry.load = async () => {
        const module = (await originalLoad()) as ReturnType<typeof fakeModule>;
        const originalLoadFont = module.loadFont;
        module.loadFont = (style, options) => {
          calls.push({ family: entry.fontFamily, style, weights: options?.weights, subsets: options?.subsets });
          const pending = originalLoadFont(style, options);
          return {
            waitUntilDone: async () => {
              await pending.waitUntilDone();
              waited.push(`${entry.fontFamily}-${style}-${options?.weights?.[0]}`);
              return undefined;
            },
          };
        };
        return module;
      };
    }

    const report = await loadDeclaredFonts(manifest, catalog);

    expect(calls).toEqual([
      { family: "Montserrat", style: "normal", weights: ["800"], subsets: ["latin", "latin-ext"] },
      { family: "Montserrat", style: "normal", weights: ["700"], subsets: ["latin", "latin-ext"] },
      { family: "Playfair Display", style: "italic", weights: ["900"], subsets: ["latin", "latin-ext"] },
      { family: "Bebas Neue", style: "normal", weights: ["400"], subsets: ["latin", "latin-ext"] },
      { family: "Oswald", style: "normal", weights: ["700"], subsets: ["latin", "latin-ext"] },
    ]);
    expect(waited).toHaveLength(5);
    expect(report.loaded).toHaveLength(5);
    expect(report.failed).toEqual([]);
  });

  it("registra familia ausente e continua com as familias disponiveis", async () => {
    const catalog = [catalogEntry("Montserrat", { normal: { "800": subsets("montserrat") } })];

    const report = await loadDeclaredFonts(manifest, catalog);

    expect(report.loaded).toHaveLength(1);
    expect(report.failed).toEqual([
      { family: "Playfair Display", reason: "Fonte declarada nao existe no Google Fonts: Playfair Display" },
      { family: "Bebas Neue", reason: "Fonte declarada nao existe no Google Fonts: Bebas Neue" },
      { family: "Oswald", reason: "Fonte declarada nao existe no Google Fonts: Oswald" },
    ]);
  });

  it("registra download incompleto e ainda carrega as outras familias", async () => {
    const failing = catalogEntry("Montserrat", {
      normal: { "700": subsets("montserrat-700"), "800": subsets("montserrat-800") },
    });
    failing.load = async () => {
      const module = fakeModule({
        normal: { "700": subsets("montserrat-700"), "800": subsets("montserrat-800") },
      });
      module.loadFont = () => ({ waitUntilDone: vi.fn().mockRejectedValue(new Error("network")) });
      return module;
    };

    const report = await loadDeclaredFonts(manifest, [
      failing,
      catalogEntry("Playfair Display", { italic: { "900": subsets("playfair") } }),
      catalogEntry("Bebas Neue", { normal: { "400": subsets("bebas") } }),
      catalogEntry("Oswald", { normal: { "700": subsets("oswald") } }),
    ]);

    expect(report.loaded.map((font) => font.family)).toEqual(["Playfair Display", "Bebas Neue", "Oswald"]);
    expect(report.failed).toHaveLength(2);
    expect(report.failed[0]?.reason).toContain("Falha ao carregar a fonte declarada Montserrat (normal 800)");
  });
});

function subsets(prefix: string): Record<string, string> {
  return {
    latin: `${prefix}-latin.woff2`,
    "latin-ext": `${prefix}-latin-ext.woff2`,
    vietnamese: `${prefix}-vietnamese.woff2`,
  };
}

function catalogEntry(
  fontFamily: string,
  fonts: Record<string, Record<string, Record<string, string>>>,
): FontCatalogEntry {
  return { fontFamily, load: async () => fakeModule(fonts) };
}

function fakeModule(fonts: Record<string, Record<string, Record<string, string>>>) {
  return {
    getInfo: () => ({ fonts }),
    loadFont: (_style?: string, _options?: { weights?: string[]; subsets?: string[] }) => ({
      waitUntilDone: async () => undefined,
    }),
  };
}
