import { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";
import { loadDeclaredFonts } from "./fonts";
import { AudioMix } from "./components/AudioMix";
import { Captions } from "./components/Captions";
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
 * legendas, overlays. Cor fica sob as legendas de proposito, para que o grading
 * nao altere as cores declaradas do texto.
 */
export const VideoComposition: React.FC<VideoCompositionProps> = ({ manifest }) => {
  // O render espera as fontes carregarem antes de desenhar o primeiro frame.
  //
  // Sem `delayRender` o Remotion renderiza com o que estiver disponivel, e o
  // resultado seria o de antes: pilha CSS correta, fonte ausente, sans generico
  // no lugar do que o canal declarou. O `continueRender` acontece mesmo quando o
  // carregamento falha, porque um render sem a fonte certa e melhor que nenhum.
  const [handle] = useState(() => delayRender("Carregando as fontes do manifesto"));

  useEffect(() => {
    if (!manifest) {
      continueRender(handle);
      return;
    }

    loadDeclaredFonts(manifest)
      .catch((error: unknown) => {
        console.warn(`Falha ao carregar fontes declaradas: ${String(error)}`);
      })
      .finally(() => continueRender(handle));
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
      <Overlays overlays={checked.overlays} />
      <AudioMix audio={checked.audio} composition={checked.composition} />
    </AbsoluteFill>
  );
};
