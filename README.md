# Modular Video Render Engine

Renderizador publico do sistema modular de video. Ele recebe um `RenderManifest@2`
e produz um MP4. Nada mais.

Este repositorio **nao** escolhe temas, nao busca midia, nao publica, nao conhece
canal nem plataforma e nao guarda credencial de nuvem. Todo formato, corte, cor,
legenda, audio e overlay chega como dado no manifesto, emitido pelo control plane
privado.

Decisao de arquitetura correspondente: ADR 0011 e ADR 0012 no repositorio do
control plane.

## Como um job funciona

1. o control plane grava o manifesto e os artefatos no R2 e emite URLs assinadas
   de vida curta;
2. dispara este repositorio por `workflow_dispatch`, passando `jobId`, `videoId` e
   a URL assinada do manifesto;
3. `scripts/stage-job.mjs` baixa o manifesto e cada artefato, **confere o SHA-256
   de todos** e grava em `public/`;
4. `npx remotion render` produz o MP4, com formato, fps e duracao derivados do
   manifesto por `calculateMetadata`;
5. `scripts/verify-output.mjs` mede o resultado com `ffprobe` e falha se
   resolucao, fps, codec ou contagem de frames divergirem do manifesto.

O envio do MP4 de volta ao R2 depende de uma URL assinada de escrita que o
control plane ainda nao emite; ate lá o arquivo sai como artefato do Actions.
Nenhum passo do workflow simula sucesso.

## Estrutura

```
src/manifest.ts              espelho de tipos do RenderManifest@2 e checagem de versao
src/assets.ts                resolucao de artefato para URL e conversao de dB em volume
src/Root.tsx                 formato e duracao derivados do manifesto
src/VideoComposition.tsx     composicao generica, sem regra de canal
src/components/Shots.tsx     cortes, nos frames declarados, com crop do manifesto
src/components/Grade.tsx     tratamento de cor e presets nomeados
src/components/Captions.tsx  legendas palavra a palavra, com estilo e animacao
src/components/Overlays.tsx  barra de progresso e titulo
src/components/AudioMix.tsx  narracao e musica, com ganho e fades do manifesto
scripts/stage-job.mjs        preparo do job, com verificacao de hash
scripts/verify-output.mjs    conferencia do MP4 contra o manifesto
```

## Desenvolvimento local

Requer Node.js 22 ou superior e FFmpeg no PATH.

```bash
npm install
node scripts/stage-job.mjs --manifest ../caminho/manifest.json --asset-root ../control-plane
npx remotion studio src/index.ts
```

`--asset-root` existe para o modo local, quando o manifesto traz referencias
`file://` relativas ao repositorio do control plane. Referencias `r2://` sao
rejeitadas de proposito: resolve-las exigiria credencial neste repositorio
publico.

Render de um arquivo e conferencia:

```bash
npx remotion render src/index.ts Video out/video.mp4
node scripts/verify-output.mjs --video out/video.mp4
```

## Limites conhecidos

Registrados aqui para nao serem confundidos com qualidade aprovada:

- **Fontes**: a composicao pede a familia declarada no manifesto e cai em um
  fallback quando ela nao existe no ambiente de render. O runner do Actions tem
  menos fontes que uma maquina Windows, entao a paridade tipografica exige
  embarcar as fontes neste repositorio. Ainda nao foi feito.
- **Presets de cor**: `cinematic-teal-orange` e implementado aqui como capacidade
  nomeada do renderizador, e o canal apenas escolhe pelo nome. A implementacao
  aproxima o balanco de cor por faixa tonal; nao e identica ao filtro FFmpeg que
  produziu os videos anteriores.
- **Grao**: estatico, por exigencia de determinismo do render. O caminho anterior
  usava grao temporal, que muda a cada quadro e a cada execucao.
- **Trecho dentro do take**: o manifesto declara `sourceTrimStartMs` sempre zero,
  entao todo corte comeca no primeiro frame do arquivo.
