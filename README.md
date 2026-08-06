# Modular Video Render Engine

Este repositório é a **Engine de Renderização Genérica e Pública** para a plataforma de automação de vídeos modulares. Ela é acionada automaticamente via **GitHub Actions** (`workflow_dispatch`) a partir do Control Plane hospedado no Cloudflare Workers.

## 📐 Arquitetura e Funcionamento

1. O **Control Plane** (privado) orquestra os módulos de IA, narração e mídia, gerando um manifesto imutável (`RenderManifest`).
2. O Cloudflare Worker notifica este repositório enviando o identificador do job (`jobId`).
3. O **GitHub Actions** executa este repositório, baixa o manifesto e assets do Cloudflare R2, renderiza o vídeo via Remotion / FFmpeg em 1080x1920 a 30 FPS e devolve o arquivo MP4 final para o Cloudflare R2.

> [!NOTE]
> Este repositório é totalmente agnóstico de canal. Nenhuma regra de canal, cor, fonte ou instrução de IA fica neste repositório. O layout e os estilos são orientados estritamente pelo manifesto recebido no momento da execução.

## 🛠️ Comandos Locais

```bash
# Instalar dependências
npm install

# Compilar o bundle do Remotion
npm run build

# Renderizar um vídeo de teste
npm run render
```
