import { AbsoluteFill, Sequence } from "remotion";
import type { TimelineShot } from "../manifest";

/**
 * Credito de licenca, exigido por parte do acervo do Wikimedia Commons (ADR
 * 0037): material CC BY / CC BY-SA so pode ser usado com credito visivel ao
 * autor. `shot.credit` so existe quando o control plane resolveu que este
 * corte especifico exige credito — o texto ja vem pronto, com o nome do autor
 * substituido; este componente nunca monta nem decide se credita.
 *
 * Cada credito e uma `Sequence` presa aos frames do proprio corte, para
 * aparecer so enquanto aquela midia esta na tela e sumir com ela — nao com o
 * video inteiro.
 *
 * Posicao: canto inferior esquerdo, fora do bloco central onde as legendas
 * (`layoutMode: centered-phrase-stack`, ancoradas por volta do meio da tela)
 * normalmente ficam. Texto pequeno e discreto de proposito: e obrigacao
 * legal, nao elemento editorial.
 */
export const Credit: React.FC<{ timeline: TimelineShot[] }> = ({ timeline }) => (
  <>
    {timeline
      .filter((shot): shot is TimelineShot & { credit: NonNullable<TimelineShot["credit"]> } => shot.credit !== undefined)
      .map((shot) => (
        <Sequence
          key={`credit-${shot.order}-${shot.assetId}`}
          from={shot.startFrame}
          durationInFrames={shot.durationFrames}
          layout="none"
        >
          <AbsoluteFill>
            <div
              style={{
                position: "absolute",
                left: 28,
                bottom: 28,
                maxWidth: "62%",
                fontFamily: '"Montserrat", "Segoe UI", Arial, sans-serif',
                fontSize: 24,
                fontWeight: 500,
                lineHeight: 1.3,
                color: "rgba(255,255,255,0.85)",
                textShadow: "0 2px 6px rgba(0,0,0,0.65)",
              }}
            >
              {shot.credit.text}
            </div>
          </AbsoluteFill>
        </Sequence>
      ))}
  </>
);
