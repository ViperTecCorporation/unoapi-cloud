<script setup lang="ts">
const curlExample = `curl --request POST \\
  --url https://api.seudominio.com/v15.0/5511999999999/messages \\
  --header 'Authorization: Bearer SEU_TOKEN' \\
  --header 'Content-Type: application/json' \\
  --data '{
    "messaging_product": "whatsapp",
    "to": "5511912008012",
    "type": "text",
    "text": { "body": "Olá! Mensagem enviada pelo ViperConnect." }
  }'`
</script>

<template>
  <div class="docs-home">
    <section class="docs-hero">
      <div class="docs-hero__copy">
        <span class="docs-eyebrow">ViperConnect API</span>
        <h1>Integre o WhatsApp ao seu sistema com uma API simples.</h1>
        <p>
          Instale, conecte uma sessão, envie qualquer tipo de mensagem e
          processe webhooks com um contrato único, documentado e testável.
        </p>
        <div class="docs-actions">
          <a class="docs-button docs-button--primary" href="/guide/installation">Começar agora <span>→</span></a>
          <a class="docs-button" href="/api-reference">Explorar endpoints</a>
        </div>
        <div class="docs-meta">
          <span><i /> API operacional</span>
          <span>92 operações</span>
          <span>Runtime Zapo</span>
        </div>
      </div>

      <div class="docs-code-window">
        <div class="docs-code-window__bar">
          <div class="docs-lights"><span /><span /><span /></div>
          <span>Enviar mensagem</span>
          <strong>POST</strong>
        </div>
        <pre><code>{{ curlExample }}</code></pre>
        <div class="docs-code-window__response">
          <span>200</span>
          <code>{ "messages": [{ "id": "wamid.HBg..." }] }</code>
        </div>
      </div>
    </section>

    <section class="docs-section">
      <div class="docs-section__heading">
        <span class="docs-eyebrow">Tudo que você precisa</span>
        <h2>Da instalação às operações avançadas</h2>
        <p>Guias diretos, exemplos copiáveis e referência sincronizada com o código real.</p>
      </div>
      <div class="docs-card-grid">
        <a class="docs-card docs-card--featured" href="/guide/installation">
          <span>01</span><h3>Instalação completa</h3>
          <p>Linux, Docker, Valkey ou Redis, RabbitMQ e proxy de borda.</p><strong>Abrir guia →</strong>
        </a>
        <a class="docs-card" href="/guide/connection">
          <span>02</span><h3>Conectar sessão</h3>
          <p>QR Code, pairing code e eventos Socket.IO corretamente ordenados.</p><strong>Conectar →</strong>
        </a>
        <a class="docs-card" href="/api-reference">
          <span>03</span><h3>Referência interativa</h3>
          <p>69 caminhos, 92 operações e playground alimentado pelo OpenAPI.</p><strong>Ver endpoints →</strong>
        </a>
      </div>
    </section>

    <section class="docs-callout">
      <div>
        <span class="docs-eyebrow">Fonte verificada</span>
        <h2>Documentação fiel ao runtime Zapo / CloudApi</h2>
        <p>O build compara o OpenAPI com router e controllers e falha se uma rota pública ficar de fora.</p>
      </div>
      <div><span>VitePress</span><span>Scalar</span><span>Docker</span><span>Socket.IO</span></div>
    </section>
  </div>
</template>
