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

O estado final das dependencias, do protocolo de relay e da validacao de midia
esta consolidado em `docs/voip-zapo-runtime.md`.

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
6. Manter RabbitMQ fora do caminho de voz. Controle e áudio seguem pelo bridge
   WebSocket da sessão; as filas existentes continuam atendendo mensagens.
7. Criar a fachada administrativa usada pelo Manager para agregar estado da
   sessão, ramais, filas, chamadas, gravações, licença e atualização.
8. Incorporar a área Telefonia ao frontend atual.
9. Atualizar OpenAPI, documentação pública, exemplos de Compose e health
   checks.

## Organização implementada

```text
src/services/zapo/voice/
  zapo_voice_types.ts
  zapo_voice_adapter.ts
  zapo_voice_bridge_client.ts
  zapo_voice_bridge_codec.ts
src/controllers/voip_controller.ts
src/services/voip_service.ts
frontend/pages/voip.ts
```

`src/services/client_zapo.ts` permanece uma fachada fina: registra o plugin,
liga o lifecycle da sessão aos módulos de voz e delega as operações.

## Fluxo

```text
Manager
  -> API ViperConnect
       -> HTTP interno -> viperconnect-voip-service
                              -> WS /v1/bridge/zapo
                                   -> worker da sessão Zapo
                                        -> client.voip
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

O roteador usa uma reserva única por chamada outbound e permite até
`maxConcurrentCalls` reservas na mesma linha Zapo, entre 1 e 32, com padrão 2.
A finalização libera o lock pelo ID da reserva, nunca todas as reservas da
linha. Quando o destino também é uma sessão Zapo
local, a perna inbound espelhada com o mesmo `callId` é observada sem criar uma
segunda ponte SIP, gravação ou registro de histórico.

Limite cheio retorna erro explícito `line_capacity_exhausted`; não existe
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

## Contrato implementado na Uno

O `voip-bridge/v1` está isolado em `src/services/zapo/voice` e ligado ao
lifecycle real das sessões:

- `zapo_voice_types.ts`: tipos dos envelopes de controle e constantes de
  áudio;
- `zapo_voice_bridge_codec.ts`: validação/serialização JSON e codec do frame
  binário;
- `zapo_voice_adapter.ts`: única borda sobre `client.voip`;
- `zapo_voice_bridge_client.ts`: conexão, geração, heartbeat, comandos,
  backpressure e mídia por chamada;
- testes de codec, adapter, WebSocket real, fachada e frontend.

Cada frame de áudio possui 3.856 bytes: cabeçalho `VPA1` de 16 bytes seguido
por 960 amostras Float32 little-endian, mono, 16 kHz. O cabeçalho contém versão,
direção, flags reservadas, `streamId` e sequência. O PCM não é serializado como
JSON nem transportado pelo RabbitMQ.

O serviço VoIP possui o mesmo vetor binário, registry autenticado, media port,
integração com gravação/histórico e transferência de chamada para outro ramal.
A validação real de áudio foi concluída em 2026-08-05 com oito chamadas
bidirecionais de entrada e saída em iPhone 16 e Galaxy S9e. Em 2026-08-06, duas
saídas simultâneas e duas entradas simultâneas foram validadas na mesma linha,
com áudio independente, encerramento normal e zero erro SRTP/Opus. O failover
forçado de relay permanece como critério separado antes da promoção definitiva.

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

- Uno: `codex/zapo-voip-bridge`;
- VoIP: `codex/zapo-uno-voice-bridge`.

## Imagem única

O workflow da Uno incorpora o código do serviço VoIP e publica somente
`ghcr.io/viperteccorporation/viperconnect:<tag>`. Web, broker, worker e
telefonia continuam em processos/containers separados; o papel
`UNOAPI_PROCESS_ROLE=voip` inicia a telefonia com rede host. Isso preserva o
isolamento de SIP/RTP sem criar uma segunda imagem ou tag de produção.

## Manager avançado

A página Telefonia agrega o bootstrap do console, bridges, chamadas, histórico
e resumo de gravações em abas e modais alinhados ao frontend principal. A aba
**Chamadas e gravações** concentra chamadas ativas, histórico, player, download,
configuração e armazenamento sem repetir o grid. Empresas, linhas, grupos de
linhas, grupos de ramais, sessões, ramais e gravação possuem formulários de CRUD,
sem editor JSON como interface principal. A gestão de usuários e o frontend
administrativo próprio do serviço VoIP foram removidos; a Uno é a interface
única. Linhas descobertas pela bridge ficam pendentes até a ativação administrativa. Uma
empresa única é selecionada automaticamente, nenhuma empresa gera um cadastro
básico e várias empresas exigem escolha explícita. A ativação provisiona rota e
ramal idempotentes; as credenciais SIP/WebRTC ficam recuperáveis por administrador.
Gravações disponíveis podem ser reproduzidas no grid ou baixadas pela fachada
autenticada da Uno. Chamadas ativas também podem ser transferidas sem o navegador
conhecer o token ou a URL interna do processo VoIP.
