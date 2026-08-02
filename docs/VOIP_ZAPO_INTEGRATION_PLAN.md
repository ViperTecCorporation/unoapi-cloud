# Integração ViperConnect VoIP com sessões Zapo

## Decisão

O ViperConnect continuará sendo o único dono da sessão Zapo. O serviço
`viperconnect-voip-service` permanecerá separado para executar SIP/WebRTC/RTP,
ramais, roteamento, gravação, histórico, licenciamento e atualização.

A integração será apresentada no Manager como uma única área de Telefonia, sem
segundo QR, credencial ou socket no serviço VoIP e sem fallback para outro
motor.

O plano detalhado e o contrato `voip-bridge/v1` estão registrados na branch
`codex/zapo-uno-voice-bridge` do repositório `unoapi-voip-service`, em
`docs/zapo-uno-voice-bridge-plan.md`.

## O que muda na Uno

1. Configurar o plugin de voz Zapo com limite concorrente explícito:

   ```ts
   voipPlugin({ maxConcurrentCalls })
   ```

2. Criar `ZapoVoiceAdapter` sobre `client.voip`, sem expor detalhes do plugin
   para controllers, jobs ou frontend.
3. Manter um WebSocket autenticado por sessão para o serviço VoIP.
4. Encaminhar eventos `incoming`, `state`, `ended`, `error` e áudio PCM.
5. Executar `start`, `accept`, `reject`, `end`, `mute` e `feedLiveAudio` na
   sessão correta.
6. Usar RabbitMQ somente para controle até o worker dono da sessão; áudio deve
   seguir diretamente no WebSocket binário.
7. Criar a fachada administrativa usada pelo Manager para agregar estado da
   sessão, ramais, filas, chamadas, gravações, licença e atualização.
8. Incorporar a área Telefonia ao frontend atual.
9. Atualizar OpenAPI, documentação pública, exemplos de Compose e health
   checks.

## Organização prevista

```text
src/services/zapo/voice/
  zapo_voice_types.ts
  zapo_voice_adapter.ts
  zapo_voice_bridge_client.ts
  zapo_voice_bridge_codec.ts
  zapo_voice_media.ts

src/controllers/voip_controller.ts
frontend/pages/voip.ts
```

`src/services/client_zapo.ts` permanece uma fachada fina: registra o plugin,
liga o lifecycle da sessão aos módulos de voz e delega as operações.

## Fluxo

```text
Manager
  -> API ViperConnect
       -> RabbitMQ -> worker da sessão Zapo
                         -> client.voip
                         -> WS /v1/bridge/zapo
                                 -> viperconnect-voip-service
                                      -> SIP/ramais/gravação
```

O worker Zapo inicia a conexão com o serviço VoIP. Isso evita que o serviço
precise descobrir a réplica/worker que possui a lease da sessão.

## Concorrência

O primeiro canário usa limite 1. Depois de validar inbound, outbound e áudio,
o limite passa para 2 e deve provar:

- duas inbound simultâneas;
- uma inbound e uma outbound;
- duas outbound;
- áudio bidirecional independente;
- encerramento de uma chamada sem afetar a outra;
- isolamento por `session + callId`.

Limite cheio retorna erro explícito `concurrent_call_limit`; não existe
fallback.

## Fases coordenadas

1. Contrato JSON/binário e testes nos dois repositórios.
2. Registry/servidor WebSocket no serviço VoIP.
3. Cliente WebSocket por sessão na Uno.
4. Lifecycle inbound e comandos.
5. Áudio PCM bidirecional.
6. Outbound.
7. Múltiplas chamadas.
8. Frontend unificado.
9. Compose, documentação, canário e promoção.

## Critérios da parte Uno

- sessão conecta e registra um único bridge;
- reload troca a geração sem bridge fantasma;
- VoIP offline não derruba mensagens;
- comandos nunca alcançam sessão diferente;
- PCM não passa por RabbitMQ nem JSON/base64;
- frontend não conhece token nem URL interna do serviço;
- nenhuma operação usa socket/auth alternativo;
- testes focados, suite completa e build passam;
- endpoints e recursos só são documentados após adapter e teste.

## Branches

- Uno: `codex/zapo-provider-workers` no momento do planejamento;
- VoIP: `codex/zapo-uno-voice-bridge`.

Antes de iniciar a implementação na Uno, criar uma branch dedicada a partir da
branch Zapo atual se for necessário separar o ciclo de revisão/release.
