<script setup lang="ts">
const curlExample = `curl --request POST \\
  --url https://api.yourdomain.com/v15.0/15551234567/messages \\
  --header 'Authorization: Bearer YOUR_TOKEN' \\
  --header 'Content-Type: application/json' \\
  --data '{
    "messaging_product": "whatsapp",
    "to": "15557654321",
    "type": "text",
    "text": { "body": "Hello from ViperConnect!" }
  }'`
</script>

<template>
  <div class="docs-home">
    <section class="docs-hero">
      <div class="docs-hero__copy">
        <span class="docs-eyebrow">ViperConnect API</span>
        <h1>Connect WhatsApp to your system through a straightforward API.</h1>
        <p>
          Install the service, connect a session, send supported messages and
          process webhooks through one documented and testable contract.
        </p>
        <div class="docs-actions">
          <a class="docs-button docs-button--primary" href="/en/guide/quickstart">Send the first message <span>→</span></a>
          <a class="docs-button" href="/en/api-reference">Explore endpoints</a>
        </div>
        <div class="docs-meta">
          <span><i /> Operational API</span>
          <span>PT-BR and English</span>
          <span>Build-validated contract</span>
        </div>
      </div>

      <div class="docs-code-window">
        <div class="docs-code-window__bar">
          <div class="docs-lights"><span /><span /><span /></div>
          <span>Send message</span>
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
        <span class="docs-eyebrow">Choose your path</span>
        <h2>Find the answer by what you want to accomplish</h2>
        <p>Start from the expected outcome and go deeper only when necessary.</p>
      </div>
      <div class="docs-card-grid docs-card-grid--paths">
        <a class="docs-card docs-card--featured" href="/en/guide/quickstart">
          <span>01</span><h3>First integration</h3>
          <p>Verify the token, send text and confirm the webhook end to end.</p><strong>Start →</strong>
        </a>
        <a class="docs-card" href="/en/guide/installation">
          <span>02</span><h3>Deploy the platform</h3>
          <p>Choose Compose, Swarm or native Linux with the right components.</p><strong>Choose deployment →</strong>
        </a>
        <a class="docs-card" href="/en/guide/messages">
          <span>03</span><h3>Send messages</h3>
          <p>Text, media, Base64, interactives, polls, orders and payments.</p><strong>View formats →</strong>
        </a>
        <a class="docs-card" href="/en/guide/webhooks">
          <span>04</span><h3>Receive events</h3>
          <p>Messages, statuses, identities, security, deduplication and retries.</p><strong>Learn webhooks →</strong>
        </a>
        <a class="docs-card" href="/en/api-reference">
          <span>05</span><h3>Test the API</h3>
          <p>Edit URL and token, then run examples generated from OpenAPI.</p><strong>Open playground →</strong>
        </a>
        <a class="docs-card docs-card--featured" href="/en/guide/telephony">
          <span>06</span><h3>Enable telephony</h3>
          <p>SIP, WebRTC, RTP, extensions, trunks, recordings and dual stack.</p><strong>Open telephony →</strong>
        </a>
      </div>
    </section>

    <section class="docs-callout">
      <div>
        <span class="docs-eyebrow">Verifiable documentation</span>
        <h2>Guides to learn. Reference to verify.</h2>
        <p>The build validates routes, examples, links, languages and deployment models before publishing.</p>
      </div>
      <div><span>Quickstart</span><span>Task guides</span><span>OpenAPI</span><span>Troubleshooting</span></div>
    </section>
  </div>
</template>
