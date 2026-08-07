import { Composition, staticFile } from "remotion";
import { VideoComposition, type VideoCompositionProps } from "./VideoComposition";
import { assertRenderManifest } from "./manifest";

/**
 * O formato do video nao esta declarado aqui. Largura, altura, fps e duracao saem
 * do manifesto por `calculateMetadata`, para que o mesmo renderizador sirva
 * qualquer canal sem alteracao de codigo.
 *
 * Os valores em `Composition` sao apenas o fallback usado quando nao existe
 * manifesto, situacao em que a composicao desenha uma tela de instrucao.
 */
export const Root: React.FC = () => {
  return (
    <Composition
      id="Video"
      component={VideoComposition}
      // O Remotion exige estes quatro valores na declaracao. Eles sao apenas o
      // fallback da tela de instrucao, quando nao existe manifesto, e sao
      // substituidos por `calculateMetadata`. Deliberadamente neutros: formato de
      // canal nao mora neste repositorio.
      durationInFrames={300}
      fps={30}
      width={1280}
      height={720}
      defaultProps={{ manifest: null } as VideoCompositionProps}
      calculateMetadata={async ({ props }) => {
        const manifest = props.manifest ?? (await loadStagedManifest());

        if (!manifest) {
          return { props };
        }

        const checked = assertRenderManifest(manifest);
        return {
          props: { ...props, manifest: checked },
          width: checked.composition.width,
          height: checked.composition.height,
          fps: checked.composition.fps,
          durationInFrames: checked.composition.durationFrames,
        };
      }}
    />
  );
};

/**
 * Carrega o manifesto preparado pelo passo anterior do job. Deixa o render
 * funcionar sem passar `--props`, que e como o workflow opera: o preparo grava
 * `public/manifest.json` e o render apenas consome.
 */
async function loadStagedManifest(): Promise<unknown | null> {
  try {
    const response = await fetch(staticFile("manifest.json"));
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}
