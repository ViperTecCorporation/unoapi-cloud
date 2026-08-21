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
          <a class="docs-button docs-button--primary" href="/guide/quickstart">Enviar a primeira mensagem <span>→</span></a>
          <a class="docs-button" href="/api-reference">Explorar endpoints</a>
        </div>
        <div class="docs-meta">
          <span><i /> API operacional</span>
          <span>PT-BR e English</span>
          <span>Contrato validado no build</span>
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
        <span class="docs-eyebrow">Escolha seu caminho</span>
        <h2>Encontre a resposta pelo que você quer fazer</h2>
        <p>Comece pelo resultado esperado e aprofunde somente quando precisar.</p>
      </div>
      <div class="docs-card-grid docs-card-grid--paths">
        <a class="docs-card docs-card--featured" href="/guide/quickstart">
          <span>01</span><h3>Primeira integração</h3>
          <p>Valide o token, envie texto e confirme o webhook ponta a ponta.</p><strong>Começar →</strong>
        </a>
        <a class="docs-card" href="/guide/installation">
          <span>02</span><h3>Implantar a plataforma</h3>
          <p>Escolha Compose, Swarm ou Linux nativo com os componentes corretos.</p><strong>Escolher implantação →</strong>
        </a>
        <a class="docs-card" href="/guide/messages">
          <span>03</span><h3>Enviar mensagens</h3>
          <p>Texto, mídia, Base64, interativas, enquetes, pedidos e pagamentos.</p><strong>Ver formatos →</strong>
        </a>
        <a class="docs-card" href="/guide/webhooks">
          <span>04</span><h3>Receber eventos</h3>
          <p>Mensagens, status, identidades, segurança, deduplicação e retries.</p><strong>Entender webhooks →</strong>
        </a>
        <a class="docs-card" href="/api-reference">
          <span>05</span><h3>Testar a API</h3>
          <p>Troque URL e token e execute exemplos gerados pelo OpenAPI.</p><strong>Abrir playground →</strong>
        </a>
        <a class="docs-card docs-card--featured" href="/guide/telephony">
          <span>06</span><h3>Ativar telefonia</h3>
          <p>SIP, WebRTC, RTP, ramais, troncos, gravações e dual-stack.</p><strong>Abrir telefonia →</strong>
        </a>
      </div>
    </section>

    <section class="docs-callout">
      <div>
        <span class="docs-eyebrow">Documentação verificável</span>
        <h2>Guias para aprender. Referência para conferir.</h2>
        <p>O build valida rotas, exemplos, links, idiomas e modelos de implantação antes da publicação.</p>
      </div>
      <div><span>Quickstart</span><span>Guias por tarefa</span><span>OpenAPI</span><span>Troubleshooting</span></div>
    </section>
  </div>
</template>
