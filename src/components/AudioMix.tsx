import { Audio, interpolate, useVideoConfig } from "remotion";
import { dbToVolume, resolveAssetSrc } from "../assets";
import type { AudioTrackMix, CompositionSettings } from "../manifest";

/**
 * Mistura de audio declarada pelo manifesto: narracao em volume cheio e musica
 * atenuada pelo ganho do canal, com fade de entrada e de saida e abaixamento
 * adicional enquanto ha narracao.
 *
 * Nenhum valor de volume vive neste arquivo. `gainDb` e `duckUnderVoiceDb` sao
 * decisao do canal; aqui apenas convertemos decibeis em volume linear.
 */
export const AudioMix: React.FC<{ audio: AudioTrackMix; composition: CompositionSettings }> = ({
  audio,
  composition,
}) => {
  const { fps, durationInFrames } = useVideoConfig();

  const fadeInFrames = Math.max(1, Math.round((audio.music.fadeInMs / 1000) * fps));
  const fadeOutFrames = Math.max(1, Math.round((audio.music.fadeOutMs / 1000) * fps));
  const baseVolume = dbToVolume(audio.music.gainDb);
  const duckedVolume = dbToVolume(audio.music.gainDb + audio.music.duckUnderVoiceDb);
  const narrationFrames = composition.narrationFrames;

  return (
    <>
      <Audio src={resolveAssetSrc(audio.narration.artifact)} />
      <Audio
        src={resolveAssetSrc(audio.music.artifact)}
        // Sem isto a faixa toca uma vez e fica em silencio pelo resto do
        // video quando e mais curta que a duracao total -- nunca apareceu nos
        // videos curtos (a faixa sempre durava mais que 45-75s), mas ficou
        // audivel de verdade no primeiro documentario de 5 min publicado
        // (2026-08-18). `loopVolumeCurveBehavior="extend"` mantem o `frame`
        // recebido pela curva de volume abaixo como a posicao absoluta no
        // video, nao reiniciado a cada repeticao -- senao o fade de entrada e
        // saida (que dependem de `frame` contra `durationInFrames`) dispararia
        // de novo a cada vez que a faixa reiniciasse.
        loop
        loopVolumeCurveBehavior="extend"
        volume={(frame) => {
          const target = frame < narrationFrames ? duckedVolume : baseVolume;
          const fadeIn = interpolate(frame, [0, fadeInFrames], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const fadeOut = interpolate(frame, [durationInFrames - fadeOutFrames, durationInFrames], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return target * fadeIn * fadeOut;
        }}
      />
    </>
  );
};
