import { AbsoluteFill } from "remotion";
import type { ColorGradingSettings } from "../manifest";

/**
 * Tratamento de imagem.
 *
 * Divisao de responsabilidade: o canal declara **valores** (contraste, brilho,
 * saturacao, vinheta, grao) e escolhe um **preset pelo nome**. A definicao do
 * preset e capacidade deste renderizador, do mesmo jeito que o tipo de transicao
 * e capacidade dele. O canal nao carrega matriz de cor.
 *
 * Equivalencia registrada: `cinematic-teal-orange` reproduz a intencao do filtro
 * FFmpeg que gerou os videos de 2026-08-06,
 * `colorbalance=rs=0.08:gs=0.02:bs=-0.06:rh=0.06:gh=-0.02:bh=-0.05`, que empurra
 * vermelho para cima e azul para baixo. A matriz aqui aplica esse deslocamento de
 * forma global, e nao separada por faixa tonal; a diferenca esta declarada como
 * limite conhecido no README.
 *
 * O grao e estatico de proposito. O caminho FFmpeg anterior usava `noise=allf=t+u`,
 * temporal, que muda a cada quadro e a cada execucao; isso quebraria a exigencia
 * de render deterministico do projeto.
 */
const FILTER_ID = "grade-preset";

interface ChannelMatrix {
  rGain: number;
  rOffset: number;
  gGain: number;
  gOffset: number;
  bGain: number;
  bOffset: number;
}

const PRESETS: Record<string, ChannelMatrix> = {
  "cinematic-teal-orange": {
    rGain: 1.06,
    rOffset: 0.03,
    gGain: 1.0,
    gOffset: 0.0,
    bGain: 0.94,
    bOffset: -0.02,
  },
  "cool-night": {
    rGain: 0.95,
    rOffset: -0.01,
    gGain: 1.0,
    gOffset: 0.0,
    bGain: 1.08,
    bOffset: 0.03,
  },
};

export const Grade: React.FC<{ grading: ColorGradingSettings | undefined; children: React.ReactNode }> = ({
  grading,
  children,
}) => {
  if (!grading) {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  const preset = PRESETS[grading.preset];

  const filter = [
    `contrast(${grading.contrast})`,
    `brightness(${1 + grading.brightness})`,
    `saturate(${grading.saturation})`,
    preset ? `url(#${FILTER_ID})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AbsoluteFill>
      {preset ? (
        <svg width={0} height={0} style={{ position: "absolute" }}>
          <defs>
            <filter id={FILTER_ID} colorInterpolationFilters="sRGB">
              <feColorMatrix
                type="matrix"
                values={[
                  `${preset.rGain} 0 0 0 ${preset.rOffset}`,
                  `0 ${preset.gGain} 0 0 ${preset.gOffset}`,
                  `0 0 ${preset.bGain} 0 ${preset.bOffset}`,
                  "0 0 0 1 0",
                ].join(" ")}
              />
            </filter>
          </defs>
        </svg>
      ) : null}

      <AbsoluteFill style={{ filter }}>{children}</AbsoluteFill>

      {grading.vignette > 0 ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,${grading.vignette * 2}) 100%)`,
          }}
        />
      ) : null}

      {grading.grain > 0 ? (
        <AbsoluteFill
          style={{
            opacity: grading.grain,
            backgroundImage: `url("${GRAIN_TILE}")`,
            backgroundRepeat: "repeat",
            mixBlendMode: "overlay",
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

const GRAIN_TILE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">
       <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7" stitchTiles="stitch"/></filter>
       <rect width="160" height="160" filter="url(#n)"/>
     </svg>`,
  );
