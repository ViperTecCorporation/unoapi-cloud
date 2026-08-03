# Telefonia Zapo

O ViperConnect mantém a única sessão Zapo e conecta o worker responsável ao
serviço de telefonia por `WS /v1/bridge/zapo`. O serviço VoIP não cria outro QR,
auth store ou socket. Se ele ficar offline, as mensagens continuam funcionando
e a telefonia aparece como indisponível.

## Configuração da Uno

```env
VOIP_SERVICE_URL=http://host.docker.internal:3097
VOIP_SERVICE_TOKEN=gere-um-token-longo
VOIP_MAX_CONCURRENT_CALLS=2
```

`VOIP_BRIDGE_URL` é opcional. Quando omitida, a Uno deriva
`ws://host.docker.internal:3097/v1/bridge/zapo` de `VOIP_SERVICE_URL`.

## Configuração do serviço VoIP

```env
PORT=3097
VOIP_SERVICE_TOKEN=gere-um-token-longo
VOIP_BRIDGE_TOKEN=gere-um-token-longo
VOIP_ZAPO_ONLY=true
VOIP_STANDALONE_AUTO_START=false
```

O valor de `VOIP_BRIDGE_TOKEN` deve ser igual ao `VOIP_SERVICE_TOKEN` usado pela
Uno. O token nunca é enviado ao navegador.

## Docker e rede

O serviço VoIP pode usar `network_mode: host` para SIP, RTP e WebRTC, enquanto
Uno, Valkey e RabbitMQ permanecem em bridge. O worker Uno acessa o host por:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
environment:
  VOIP_SERVICE_URL: http://host.docker.internal:3097
```

Os Composes para download já incluem essa topologia e o volume persistente do
serviço VoIP. Todos os containers ViperConnect usam a mesma imagem e tag;
`UNOAPI_PROCESS_ROLE=voip` seleciona o processo de telefonia, portanto não há
uma segunda imagem para baixar ou versionar.

## Fluxo de chamada

1. A sessão Zapo abre o bridge autenticado após ficar online.
2. Uma chamada recebida gera `call.incoming`, mas não é atendida automaticamente.
3. O serviço toca os ramais SIP/WebRTC ou SIP/RTP configurados.
4. Somente o primeiro ramal que atende dispara `call.command: accept`.
5. Áudio usa frames binários PCM Float32 mono a 16 kHz; nunca JSON, base64 ou RabbitMQ.
6. Encerramento em qualquer perna fecha WhatsApp, SIP e o stream daquela chamada.

Cada chamada é isolada por `session + callId`. O limite inicial recomendado é
2; limite cheio retorna erro explícito, sem fallback.

## API administrativa

- `GET /admin/voip/bootstrap`: linhas, chamadas, ramais e configuração agregada;
- `GET /admin/voip/calls`: chamadas ativas;
- `POST /admin/voip/calls`: inicia chamada com `session`, `peerJid` e `extensionId`;
- `POST /admin/voip/calls/{callId}/{command}`: `accept`, `reject`, `end` ou `mute`.
- `POST /admin/voip/console/calls/{callId}/transfer`: transfere para outro ramal;
- `PUT|DELETE /admin/voip/console/{resource}/{id}`: mantém empresas, linhas,
  grupos, sessões, ramais e usuários;
- `GET /admin/voip/console/history`: consulta histórico e gravações;
- `GET|PUT /admin/voip/console/recording/settings`: configura gravações;
- `GET|PUT /admin/voip/console/license`: consulta ou atualiza a licença.

A página **Telefonia** do Manager consome somente essas rotas da Uno. O modo
avançado fica na mesma página e permite editar o contrato integral em JSON,
sem expor o endereço ou o token interno do serviço no navegador. Segredos já
configurados aparecem apenas como indicadores e são preservados quando o campo
secreto não é reenviado.
