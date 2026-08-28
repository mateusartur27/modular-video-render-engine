import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
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
 *
 * `layoutMode: "horizontal-flow"` desenha uma frase inteira num unico
 * contêiner flex, com o Chromium decidindo onde cada palavra cai e quando
 * quebrar linha — o control plane nao mede texto, de proposito (ADR 0027 do
 * repositorio privado). Qualquer outro `layoutMode` (ou nenhum) preserva o
 * caminho historico: uma palavra por linha, posicionada em pixel absoluto.
 */
export const Captions: React.FC<{ captions: CaptionsTrack }> = ({ captions }) => {
  const frame = useCurrentFrame();

  if (!captions.enabled) {
    return null;
  }

  if (captions.layout.layoutMode === "horizontal-flow") {
    return <HorizontalFlowCaptions captions={captions} frame={frame} />;
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
  const visual = wordVisual(word, frame, exitFrame);
  const translate = word.position.align === "center" ? "-50%" : word.position.align === "right" ? "-100%" : "0%";

  return (
    <div
      style={{
        position: "absolute",
        left: word.position.x,
        top: word.position.y,
        // Cada palavra tem a propria linha, sem vizinho a colidir: escalar por
        // `transform` (que nao move layout) e seguro aqui.
        transform: [
          `translate(${translate}, -50%)`,
          `rotate(${word.position.rotation}deg)`,
          `scale(${visual.scale})`,
          `translateY(${visual.translateY}px)`,
        ].join(" "),
        transformOrigin: "center center",
        opacity: visual.opacity,
        filter: visual.filter,
        whiteSpace: "nowrap",
        ...visual.textStyle,
      }}
    >
      {word.word}
    </div>
  );
};

/**
 * Agrupa palavras por `phraseGroup` e desenha um unico contêiner por frase,
 * ancorado no ponto que toda palavra da frase compartilha (o control plane
 * emite o mesmo `position.x`/`position.y` para todas quando o layout e
 * horizontal). Dentro do contêiner, `flexWrap` deixa o Chromium fluir as
 * palavras lado a lado e quebrar linha sozinho — cada palavra continua com a
 * propria animacao de entrada/saida, so a posicao deixa de ser absoluta.
 *
 * Palavra ainda nao visivel (fora da janela `startFrame`..`phraseEndFrame`)
 * nao entra no contêiner: a frase cresce palavra a palavra, mesmo efeito de
 * revelacao progressiva do caminho absoluto, só que fluindo em vez de empilhar.
 */
const HorizontalFlowCaptions: React.FC<{ captions: CaptionsTrack; frame: number }> = ({ captions, frame }) => {
  const { width } = useVideoConfig();
  const maxWidthRatio = captions.layout.maxWidthRatio ?? 0.86;

  const groups = new Map<number, CaptionWord[]>();
  captions.words.forEach((word, index) => {
    const key = word.phraseGroup ?? index;
    const list = groups.get(key);
    if (list) {
      list.push(word);
    } else {
      groups.set(key, [word]);
    }
  });

  return (
    <>
      {[...groups.entries()].map(([groupKey, words]) => {
        const visibleWords = words.filter((word) => {
          const exitFrame = word.phraseEndFrame ?? word.endFrame;
          return frame >= word.startFrame && frame <= exitFrame;
        });
        if (visibleWords.length === 0) {
          return null;
        }

        const anchor = words[0]!.position;
        return (
          <div
            key={groupKey}
            style={{
              position: "absolute",
              left: anchor.x,
              top: anchor.y,
              transform: "translate(-50%, -50%)",
              maxWidth: width * maxWidthRatio,
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              alignContent: "center",
              // Sem isto o flex cai no padrao `stretch`: uma palavra de
              // impacto, maior que as vizinhas, nivelava pelo topo da linha
              // em vez de compartilhar a linha de base do texto -- visivel
              // como "David Rolfe" (maior, dourado) grudado no topo de
              // "decidiu apostar no programador" em vez de sentado na mesma
              // base. `baseline` alinha pela linha de base real da fonte,
              // que e como toda tipografia com tamanhos mistos se comporta.
              alignItems: "baseline",
              rowGap: 8,
              columnGap: "0.4em",
            }}
          >
            {visibleWords.map((word) => {
              const exitFrame = word.phraseEndFrame ?? word.endFrame;
              const visual = wordVisual(word, frame, exitFrame);
              const fontSize = visual.textStyle.fontSize;
              return (
                <span
                  key={word.id}
                  style={{
                    display: "inline-block",
                    // Palavras vizinhas no mesmo contêiner flex: escalar por
                    // `transform` so pinta maior, sem reservar espaco, e a
                    // palavra de enfase invade a vizinha. Aqui a enfase entra
                    // no `fontSize`, que o flex de fato mede, e o transform
                    // carrega so o deslocamento transitorio da entrada.
                    transform: `translateY(${visual.translateY}px)`,
                    opacity: visual.opacity,
                    filter: visual.filter,
                    whiteSpace: "pre",
                    ...visual.textStyle,
                    fontSize: typeof fontSize === "number" ? fontSize * visual.scale : fontSize,
                  }}
                >
                  {word.word}
                </span>
              );
            })}
          </div>
        );
      })}
    </>
  );
};

interface WordVisual {
  /** Combina `word.style.scale` (enfase declarada) e o "pop" da entrada. */
  scale: number;
  translateY: number;
  opacity: number;
  filter: string | undefined;
  textStyle: React.CSSProperties;
}

/**
 * Progresso de entrada/saida e estilo de texto de uma palavra, sem nenhuma
 * posicao — o que muda entre o caminho absoluto (uma palavra por linha) e o
 * horizontal (fluindo dentro de um contêiner) e so como essa palavra e
 * posicionada, nunca como ela anima ou aparenta.
 */
function wordVisual(word: CaptionWord, frame: number, exitFrame: number): WordVisual {
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

  return {
    scale: word.style.scale * entrance.scale,
    translateY: entrance.translateY,
    opacity: Math.min(entrance.opacity, exitOpacity),
    filter: entrance.blur > 0 ? `blur(${entrance.blur}px)` : undefined,
    textStyle: {
      fontFamily: fontStack(word.style.fontFamily),
      fontWeight: word.style.fontWeight,
      fontSize: word.style.fontSize,
      fontStyle: word.style.italic ? "italic" : "normal",
      color: word.style.color,
      WebkitTextStroke: stroke > 0 ? `${stroke * 2}px ${word.style.strokeColor}` : undefined,
      paintOrder: "stroke fill",
      textShadow,
      lineHeight: 1,
    },
  };
}

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
 * O manifesto declara a familia desejada, e `loadDeclaredFonts` tenta carrega-la
 * antes do primeiro frame. Esta pilha e o fallback deliberado quando a familia
 * ou uma face nao estiver disponivel; o loader registra o ocorrido no job.
 */
function fontStack(family: string): string {
  return `"${family}", "Arial Black", "Segoe UI", Arial, sans-serif`;
}
