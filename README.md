# Remotion Video Render Engine

A React and Remotion project for programmatically generating and rendering short-form video compositions using dynamic props, React components, and automated video processing.

## 🚀 Features

- **Programmatic Video Generation**: Renders vertical video compositions (1080x1920 at 30 FPS) with dynamic text, audio, and visual overlays using React.
- **Remotion Integration**: Built on top of Remotion for frame-accurate video rendering and H.264 MP4 output.
- **Automated Workflows**: Includes GitHub Actions workflow for automated background video compilation.

## 🛠️ Usage

### Prerequisites

- Node.js 20+
- FFmpeg 6.0+

### Installation & Commands

```bash
# Install dependencies
npm install

# Build the Remotion bundle
npm run build

# Render video locally
npx remotion render src/index.ts TikTokVideo out/video.mp4
```
