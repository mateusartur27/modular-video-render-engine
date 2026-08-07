import { AbsoluteFill, OffthreadVideo, Sequence } from "remotion";
import { resolveAssetSrc } from "../assets";
import type { EditingSettings, TimelineShot } from "../manifest";

/**
 * Camada de video. Cada corte e uma `Sequence` posicionada exatamente nos frames
 * que o manifesto declarou; nada de duracao inferida aqui.
 *
 * `cropMode` do manifesto decide o ajuste do quadro. `cover-smart-center`
 * preenche a moldura e corta o excedente pelo centro, que e o comportamento
 * necessario para levar take horizontal a moldura vertical sem borda.
 */
export const Shots: React.FC<{ timeline: TimelineShot[]; editing: EditingSettings }> = ({ timeline, editing }) => {
  const objectFit = editing.cropMode.startsWith("cover") ? "cover" : "contain";

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {timeline.map((shot) => (
        <Sequence
          key={`${shot.order}-${shot.assetId}`}
          from={shot.startFrame}
          durationInFrames={shot.durationFrames}
          layout="none"
        >
          <AbsoluteFill>
            <OffthreadVideo
              src={resolveAssetSrc(shot.artifact)}
              muted
              // O manifesto ainda declara sempre 0; quando passar a escolher
              // trecho dentro do take, este e o unico ponto que muda.
              trimBefore={shot.sourceTrimStartMs > 0 ? Math.round((shot.sourceTrimStartMs / 1000) * 30) : undefined}
              style={{ width: "100%", height: "100%", objectFit }}
            />
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
