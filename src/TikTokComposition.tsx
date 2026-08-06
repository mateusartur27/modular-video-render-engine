import React from "react";
import { AbsoluteFill } from "remotion";

export interface TikTokCompositionProps {
  title: string;
  narrationAudioUrl?: string;
  backgroundVideoUrls?: string[];
}

export const TikTokComposition: React.FC<TikTokCompositionProps> = ({ title }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000", justifyContent: "center", alignItems: "center" }}>
      <div style={{ color: "#FFFFFF", fontFamily: "sans-serif", fontSize: 48, fontWeight: "bold" }}>
        {title}
      </div>
    </AbsoluteFill>
  );
};
