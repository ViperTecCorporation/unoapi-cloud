# Telefonia Zapo

O ViperConnect mantém a única sessão Zapo e conecta o worker responsável ao
serviço de telefonia por `WS /v1/bridge/zapo`. O serviço VoIP não cria outro QR,
auth store ou socket. Se ele ficar offline, as mensagens continuam funcionando
e a telefonia aparece como indisponível.

## Configuração da Uno

```env
VOIP_SERVICE_URL=http://host.docker.internal:3097
VOIP_BRIDGE_URL=wss://voip.seudominio.com.br/v1/bridge/zapo
VOIP_SERVICE_TOKEN=gere-um-token-longo
VOIP_MAX_CONCURRENT_CALLS=2
```

No Compose público, declare `VOIP_BRIDGE_URL` explicitamente com `wss://` e
configure o proxy para aceitar WebSocket em `/v1/bridge/zapo`. Em uma rede
local sem TLS ela pode ser omitida; nesse caso a Uno deriva
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
  VOIP_BRIDGE_URL: wss://voip.seudominio.com.br/v1/bridge/zapo
  VOIP_SERVICE_TOKEN: gere-um-token-longo
```

Para executar a telefonia fora de container com pacote `.deb` e `systemd`, veja
[Telefonia em Linux nativo](/guide/install-voip-native-linux).

Os Composes para download já incluem essa topologia e o volume persistente do
serviço VoIP. Todos os containers ViperConnect usam a mesma imagem e tag;
`UNOAPI_PROCESS_ROLE=voip` seleciona o processo de telefonia, portanto não há
uma segunda imagem para baixar ou versionar.

Não declare `entrypoint` ou `command` no container de telefonia ou nos demais
serviços ViperConnect. O entrypoint oficial da imagem reconhece
`UNOAPI_PROCESS_ROLE=voip` e inicia o processo correto; sobrescrevê-lo também
impede o desligamento gracioso do worker Zapo.

## Fluxo de chamada

1. A sessão Zapo abre o bridge autenticado após ficar online.
2. Uma chamada recebida gera `call.incoming`, mas não é atendida automaticamente.
3. O serviço toca os ramais SIP/WebRTC ou SIP/RTP configurados.
4. Somente o primeiro ramal que atende dispara `call.command: accept`.
5. Áudio usa frames binários PCM Float32 mono a 16 kHz; nunca JSON, base64 ou RabbitMQ.
6. Encerramento em qualquer perna fecha WhatsApp, SIP e o stream daquela chamada.

Cada chamada é isolada por `session + callId`. O limite inicial recomendado é
2; limite cheio retorna erro explícito, sem fallback.

O roteador cria uma reserva exclusiva para cada saída. Um mesmo slot aceita até
`maxActiveCalls` chamadas e o encerramento de uma delas libera somente a própria
reserva. Para manter os dois limites coerentes, não configure `maxActiveCalls`
acima de `VOIP_MAX_CONCURRENT_CALLS`.

Se o número chamado também estiver conectado como sessão Zapo nesta instalação,
o WhatsApp gera uma perna recebida espelhada com o mesmo `callId`. Ela é
observada, mas não abre outro ramal, stream, gravação ou histórico. A perna de
saída continua sendo a dona da ponte de áudio, como numa chamada externa.

## API administrativa

- `GET /admin/voip/bootstrap`: linhas, chamadas, ramais e configuração agregada;
- `GET /admin/voip/calls`: chamadas ativas;
- `POST /admin/voip/calls`: inicia chamada com `session`, `peerJid` e `extensionId`;
- `POST /admin/voip/calls/{callId}/{command}`: `accept`, `reject`, `end` ou `mute`.
- `POST /admin/voip/console/calls/{callId}/transfer`: transfere para outro ramal;
- `PUT|DELETE /admin/voip/console/{resource}/{id}`: mantém empresas, linhas,
  grupos, sessões, ramais e usuários;
- `GET /admin/voip/console/history`: consulta histórico e gravações;
- `GET /admin/voip/recordings/{recordId}`: reproduz ou baixa uma gravação pelo
  proxy autenticado da Uno;
- `GET|PUT /admin/voip/console/recording/settings`: configura gravações;
- `GET /admin/voip/console/zapo-lines`: inventário de linhas descobertas pela bridge;
- `POST /admin/voip/console/zapo-lines/{session}/assign`: atribui a linha a uma
  empresa e pode criar conta, sessão, slot, grupos, rota e ramal básicos;
- `GET /admin/voip/console/extensions/{extensionId}/credentials`: recupera para
  administrador o usuário, senha, URI SIP e URLs WebRTC do ramal;
- `GET|PUT /admin/voip/console/license`: consulta ou atualiza a licença.

A página **Telefonia** do Manager usa abas, grids e modais para empresas,
linhas, ramais, grupos, sessões, chamadas, gravações e usuários. O JSON interno
não é exposto como editor de configuração. Segredos já configurados aparecem
apenas como indicadores e são preservados quando o campo secreto não é reenviado.

Uma sessão Zapo recém-conectada aparece primeiro como **Aguardando empresa**.
Ela não entra no roteamento até a ativação administrativa. Se existir uma única
empresa ativa, ela é usada; se não existir nenhuma, a ativação cria uma empresa
básica; com várias empresas, a escolha continua obrigatória. A operação é
idempotente. A rota básica cria os recursos mínimos, usa o número da sessão como
usuário do ramal e mostra a senha. Depois, o administrador pode usar o botão
**Credenciais** no grid de ramais para recuperar SIP e WebRTC.

O mesmo ramal pode ser registrado em vários telefones SIP e navegadores WebRTC.
Todos tocam na chamada recebida; o primeiro que atende fica com a chamada e as
outras pernas são canceladas como atendidas em outro lugar.

No histórico, gravações com estado `available` possuem os botões **Reproduzir**
e **Baixar**. A reprodução acontece em um player de áudio dentro do próprio
grid; o navegador recebe o áudio pela fachada autenticada da Uno e nunca conhece
o token interno do serviço VoIP.
