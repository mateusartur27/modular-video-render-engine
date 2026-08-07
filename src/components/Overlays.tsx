import { useCurrentFrame, useVideoConfig } from "remotion";
import type { OverlaySettings } from "../manifest";

/**
 * Camadas graficas fixas declaradas pelo canal.
 *
 * A barra de progresso e derivada do frame corrente, nao de uma lista de eventos
 * pre-computada: o manifesto declara cor, posicao, margem e altura, e o avanco
 * sai de `frame / durationInFrames`.
 *
 * O titulo vem do plano de producao. Se o plano nao trouxe titulo, o control
 * plane omite o bloco e nada e desenhado; nenhum texto e inventado aqui.
 */
export const Overlays: React.FC<{ overlays: OverlaySettings | undefined }> = ({ overlays }) => {
  const frame = useCurrentFrame();
  const { width, durationInFrames } = useVideoConfig();

  if (!overlays) {
    return null;
  }

  const bar = overlays.progressBar;
  const title = overlays.title;
  const progress = durationInFrames > 1 ? Math.min(1, (frame + 1) / durationInFrames) : 1;

  return (
    <>
      {bar ? (
        <div
          style={{
            position: "absolute",
            left: bar.marginX,
            top: bar.y - bar.heightPx / 2,
            width: (width - bar.marginX * 2) * progress,
            height: bar.heightPx,
            backgroundColor: bar.color,
          }}
        />
      ) : null}

      {title ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: title.y,
            width: "100%",
            textAlign: "center",
            transform: "translateY(-50%)",
            fontFamily: `"${title.fontFamily}", "Segoe UI", Arial, sans-serif`,
            fontSize: title.fontSizePx,
            fontWeight: 700,
            letterSpacing: title.letterSpacingPx ?? 0,
            color: title.color,
            textShadow: "0 2px 6px rgba(0,0,0,0.55)",
          }}
        >
          {title.text}
        </div>
      ) : null}
    </>
  );
};
