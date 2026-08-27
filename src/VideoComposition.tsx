import { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";
import { loadDeclaredFonts } from "./fonts";
import { AudioMix } from "./components/AudioMix";
import { Captions } from "./components/Captions";
import { Credit } from "./components/Credit";
import { Grade } from "./components/Grade";
import { Overlays } from "./components/Overlays";
import { Shots } from "./components/Shots";
import { assertRenderManifest, type RenderManifest } from "./manifest";

/**
 * O Remotion exige que as props da composicao sejam indexaveis por string, para
 * poder recebe-las por `--props` ou pelo Studio. Daí o `Record` na assinatura.
 */
export interface VideoCompositionProps extends Record<string, unknown> {
  manifest: RenderManifest | null;
}

/**
 * Composicao generica. Ela nao conhece canal, plataforma, tema nem estilo: todo
 * formato, corte, cor, legenda, audio e overlay vem do `RenderManifest@2`.
 *
 * Ordem das camadas, de baixo para cima: cortes de video, tratamento de cor,
 * legendas, credito de licenca, overlays. Cor fica sob as legendas de
 * proposito, para que o grading nao altere as cores declaradas do texto — e
 * pela mesma razao o credito tambem fica acima da cor.
 */
export const VideoComposition: React.FC<VideoCompositionProps> = ({ manifest }) => {
  // O render espera as fontes carregarem antes de desenhar o primeiro frame.
  //
  // Sem `delayRender` o Remotion renderiza com o que estiver disponivel, e o
  // resultado seria o de antes: pilha CSS correta, mas fallback usado antes de
  // uma fonte que ainda estava baixando. Falha real de uma face e tolerada: as
  // demais continuam carregando e a pilha CSS assume somente naquele caso.
  const [handle] = useState(() =>
    delayRender("Carregando as fontes do manifesto", { timeoutInMilliseconds: 60_000 }),
  );

  useEffect(() => {
    if (!manifest) {
      continueRender(handle);
      return;
    }

    loadDeclaredFonts(manifest)
      .then(({ loaded, failed }) => {
        console.info(
          `Fontes carregadas: ${loaded.map((font) => `${font.family} ${font.style} ${font.weight}`).join(", ")}`,
        );
        for (const failure of failed) {
          console.warn(`[font-fallback] ${failure.reason}`);
        }
        continueRender(handle);
      })
      .catch((error: unknown) => {
        // Defesa final: um defeito inesperado do loader nao pode derrubar o
        // video. A pilha CSS continua determinando o fallback do quadro.
        console.warn(`[font-fallback] Falha inesperada ao preparar fontes: ${String(error)}`);
        continueRender(handle);
      });
  }, [handle, manifest]);

  if (!manifest) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#101010",
          color: "#FFFFFF",
          fontFamily: "Arial, sans-serif",
          fontSize: 36,
          padding: 80,
          justifyContent: "center",
        }}
      >
        Nenhum manifesto recebido. Rode o preparo do job antes do render: ele grava
        `public/manifest.json` e os artefatos em `public/assets/`.
      </AbsoluteFill>
    );
  }

  const checked = assertRenderManifest(manifest);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <Grade grading={checked.colorGrading}>
        <Shots timeline={checked.timeline} editing={checked.editing} />
      </Grade>
      <Captions captions={checked.captions} />
      <Credit timeline={checked.timeline} safeAreaBottomPx={checked.captions.layout.safeAreaBottomPx} />
      <Overlays overlays={checked.overlays} />
      <AudioMix audio={checked.audio} composition={checked.composition} />
    </AbsoluteFill>
  );
};
