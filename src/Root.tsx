import { Composition } from "remotion";
import { TikTokComposition } from "./TikTokComposition";

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="TikTokVideo"
        component={TikTokComposition}
        durationInFrames={1800}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          title: "DIQUE DE CABEDELO",
          narrationAudioUrl: "",
          backgroundVideoUrls: [],
        }}
      />
    </>
  );
};
