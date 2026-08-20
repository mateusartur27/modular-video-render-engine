import { AbsoluteFill, Easing, Img, OffthreadVideo, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveAssetSrc } from "../assets";
import type { EditingSettings, ShotMotion, TimelineShot } from "../manifest";

/**
 * Curvas aceitas no campo `easing` do manifesto. Um nome desconhecido cai em
 * `ease-in-out` em vez de quebrar o render: manifesto novo com curva que este
 * renderizador ainda nao conhece deve produzir video, nao falha.
 */
function easingByName(name: string): (input: number) => number {
  switch (name) {
    case "linear":
      return Easing.linear;
    case "ease-in":
      return Easing.in(Easing.ease);
    case "ease-out":
      return Easing.out(Easing.ease);
    case "ease-in-out":
    default:
      return Easing.inOut(Easing.ease);
  }
}

/**
 * Fotografia com movimento sintetico (Ken Burns).
 *
 * A geometria e calculada explicitamente em vez de delegada a `objectFit`,
 * porque deslocar uma imagem em `cover` sem conhecer o excedente revelaria
 * borda vazia. Aqui o excedente e derivado das dimensoes reais, e o
 * deslocamento e uma **fracao desse excedente** — o que torna impossivel sair
 * da imagem para qualquer valor entre 0 e 1 que o manifesto declare.
 *
 * `useCurrentFrame` dentro da `Sequence` devolve o quadro relativo ao inicio do
 * corte, entao o movimento comeca junto com o corte, nao com o video.
 */
const ImageShot: React.FC<{ shot: TimelineShot; motion: ShotMotion }> = ({ shot, motion }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Um corte de 1 quadro nao tem intervalo para animar; `interpolate` recusaria
  // um dominio degenerado.
  const lastFrame = Math.max(1, shot.durationFrames - 1);
  const progress = interpolate(frame, [0, lastFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easingByName(motion.easing),
  });

  const scale = interpolate(progress, [0, 1], [motion.startScale, motion.endScale]);
  const centerX = interpolate(progress, [0, 1], [motion.startXPercent, motion.endXPercent]);
  const centerY = interpolate(progress, [0, 1], [motion.startYPercent, motion.endYPercent]);

  // Escala que faz a imagem cobrir o quadro inteiro; a partir dela, `scale`
  // amplia. Sem dimensao declarada nao ha como calcular cobertura, entao cai
  // para 1 e o `objectFit` do elemento resolve o enquadramento.
  const hasSourceSize = shot.source.width > 0 && shot.source.height > 0;
  const coverScale = hasSourceSize
    ? Math.max(width / shot.source.width, height / shot.source.height)
    : 1;

  const displayWidth = shot.source.width * coverScale * scale;
  const displayHeight = shot.source.height * coverScale * scale;

  // Excedente em cada eixo. Deslocar por uma fracao dele mantem a imagem
  // sempre cobrindo o quadro: em 0 encosta uma borda, em 1 a outra.
  const overflowX = Math.max(0, displayWidth - width);
  const overflowY = Math.max(0, displayHeight - height);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={resolveAssetSrc(shot.artifact)}
        style={{
          position: "absolute",
          width: hasSourceSize ? displayWidth : "100%",
          height: hasSourceSize ? displayHeight : "100%",
          left: hasSourceSize ? -overflowX * centerX : 0,
          top: hasSourceSize ? -overflowY * centerY : 0,
          objectFit: "cover",
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * Camada de video. Cada corte e uma `Sequence` posicionada exatamente nos frames
 * que o manifesto declarou; nada de duracao inferida aqui.
 *
 * `cropMode` do manifesto decide o ajuste do quadro. `cover-smart-center`
 * preenche a moldura e corta o excedente pelo centro, que e o comportamento
 * necessario para levar take horizontal a moldura vertical sem borda.
 *
 * Desde a ADR 0037 um corte pode ser **fotografia** em vez de video, porque
 * entidade nomeada ("Einstein", "Titanic") so existe em acervo historico e
 * banco de video de stock nao a cobre. Foto usa `Img` mais o movimento
 * declarado no manifesto; video segue exatamente como antes.
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
            {shot.source.kind === "image" ? (
              shot.motion ? (
                <ImageShot shot={shot} motion={shot.motion} />
              ) : (
                // Foto sem movimento declarado: o canal desligou o Ken Burns.
                <Img
                  src={resolveAssetSrc(shot.artifact)}
                  style={{ width: "100%", height: "100%", objectFit }}
                />
              )
            ) : (
              <OffthreadVideo
                src={resolveAssetSrc(shot.artifact)}
                muted
                // O manifesto ainda declara sempre 0; quando passar a escolher
                // trecho dentro do take, este e o unico ponto que muda.
                trimBefore={shot.sourceTrimStartMs > 0 ? Math.round((shot.sourceTrimStartMs / 1000) * 30) : undefined}
                style={{ width: "100%", height: "100%", objectFit }}
              />
            )}
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
