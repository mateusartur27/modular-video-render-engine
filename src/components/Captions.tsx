import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { CaptionWord, CaptionsTrack } from "../manifest";

/**
 * Legendas motion graphic. Cada palavra e um objeto independente, posicionado e
 * estilizado pelo manifesto. Este componente nao decide fonte, cor, tamanho,
 * posicao nem duracao: ele apenas desenha o que foi declarado e interpola a
 * animacao pedida.
 *
 * A janela de exibicao de cada palavra vai de `startFrame` a `phraseEndFrame`,
 * quando existe, para que a frase inteira permaneca na tela enquanto e falada, em
 * vez de a palavra desaparecer sozinha.
 */
export const Captions: React.FC<{ captions: CaptionsTrack }> = ({ captions }) => {
  const frame = useCurrentFrame();

  if (!captions.enabled) {
    return null;
  }

  return (
    <>
      {captions.words.map((word) => {
        const exitFrame = word.phraseEndFrame ?? word.endFrame;
        if (frame < word.startFrame || frame > exitFrame) {
          return null;
        }
        return <CaptionWordLayer key={word.id} word={word} frame={frame} exitFrame={exitFrame} />;
      })}
    </>
  );
};

const CaptionWordLayer: React.FC<{ word: CaptionWord; frame: number; exitFrame: number }> = ({
  word,
  frame,
  exitFrame,
}) => {
  const entranceFrames = Math.max(1, word.animation.durationFrames);
  const local = frame - word.startFrame;
  const easing = easingFor(word.animation.easing);

  const progress = interpolate(local, [0, entranceFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });

  const entrance = entranceTransform(word.animation.entrance, progress);

  const framesToExit = exitFrame - frame;
  const exitOpacity = interpolate(framesToExit, [0, entranceFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Contorno real do glifo, com a pintura do traco atras do preenchimento.
  //
  // Dois detalhes descobertos medindo contra o video de referencia:
  //
  // 1. usar a forma abreviada `WebkitTextStroke`. Definir largura e cor em
  //    propriedades separadas faz o React aplicar so a largura, e o traco cai em
  //    `currentColor`, produzindo halo branco em vez de contorno preto;
  // 2. dobrar a largura declarada. O contorno CSS e centralizado no glifo, com
  //    metade para dentro, enquanto `strokeWidth` do contrato tem a semantica do
  //    contorno de legenda, inteiramente externo.
  const stroke = word.style.strokeWidth;
  const textShadow = word.style.shadowBlur > 0 ? `0 2px ${word.style.shadowBlur}px rgba(0,0,0,0.55)` : undefined;

  const translate = word.position.align === "center" ? "-50%" : word.position.align === "right" ? "-100%" : "0%";

  return (
    <div
      style={{
        position: "absolute",
        left: word.position.x,
        top: word.position.y,
        transform: [
          `translate(${translate}, -50%)`,
          `rotate(${word.position.rotation}deg)`,
          `scale(${word.style.scale * entrance.scale})`,
          `translateY(${entrance.translateY}px)`,
        ].join(" "),
        transformOrigin: "center center",
        opacity: Math.min(entrance.opacity, exitOpacity),
        filter: entrance.blur > 0 ? `blur(${entrance.blur}px)` : undefined,
        whiteSpace: "nowrap",
        fontFamily: fontStack(word.style.fontFamily),
        fontWeight: word.style.fontWeight,
        fontSize: word.style.fontSize,
        fontStyle: word.style.italic ? "italic" : "normal",
        color: word.style.color,
        WebkitTextStroke: stroke > 0 ? `${stroke * 2}px ${word.style.strokeColor}` : undefined,
        paintOrder: "stroke fill",
        textShadow,
        lineHeight: 1,
      }}
    >
      {word.word}
    </div>
  );
};

interface EntranceState {
  scale: number;
  translateY: number;
  opacity: number;
  blur: number;
}

function entranceTransform(entrance: string, progress: number): EntranceState {
  const base: EntranceState = { scale: 1, translateY: 0, opacity: 1, blur: 0 };

  switch (entrance) {
    case "scale-bounce":
    case "elastic-pop":
      return { ...base, scale: interpolate(progress, [0, 1], [0.72, 1]), opacity: progress };
    case "blur-reveal":
      return { ...base, opacity: progress, blur: interpolate(progress, [0, 1], [12, 0]) };
    case "slide-up":
      return { ...base, translateY: interpolate(progress, [0, 1], [60, 0]), opacity: progress };
    case "slide-down":
      return { ...base, translateY: interpolate(progress, [0, 1], [-60, 0]), opacity: progress };
    case "fade-in":
      return { ...base, opacity: progress };
    default:
      return { ...base, opacity: progress };
  }
}

function easingFor(name: string): (input: number) => number {
  switch (name) {
    case "ease-out-back":
      return Easing.bezier(0.34, 1.56, 0.64, 1);
    case "ease-out-elastic":
      return Easing.elastic(1.2);
    case "ease-out-cubic":
      return Easing.out(Easing.cubic);
    case "ease-in-out":
      return Easing.inOut(Easing.ease);
    case "linear":
      return Easing.linear;
    default:
      return Easing.out(Easing.cubic);
  }
}

/**
 * O manifesto declara a familia desejada. Se ela nao estiver disponivel no
 * ambiente de render, o fallback mantem o peso visual em vez de cair numa serifa
 * estreita. Familias ausentes sao uma divergencia de paridade conhecida e devem
 * ser resolvidas embarcando as fontes neste repositorio.
 */
function fontStack(family: string): string {
  return `"${family}", "Arial Black", "Segoe UI", Arial, sans-serif`;
}
