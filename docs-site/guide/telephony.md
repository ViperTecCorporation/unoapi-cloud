# Telefonia Zapo

O ViperConnect mantém a única sessão Zapo e conecta o worker responsável ao
serviço de telefonia por `WS /v1/bridge/zapo`. O serviço VoIP não cria outro QR,
repositório de credenciais ou socket de sessão. Se ele ficar offline, as
mensagens continuam funcionando e a telefonia aparece como indisponível.

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

## Onde cada parte roda

Uma única imagem e tag contém dois runtimes Node isolados:

| Processo | Responsabilidade |
| --- | --- |
| worker Zapo | sessão, sinalização da chamada, relay WhatsApp, RTP/SRTP e codec |
| telefonia | SIP/WebRTC, SIP/RTP, ramais, roteamento, gravação e bridge PCM |

O worker usa `zapo-js`, o plugin VoIP mantido dentro do ViperConnect,
`libmlow-wasm` e um pequeno helper nativo para o relay direto. A telefonia usa
seu próprio `package.json` e `node_modules`; bibliotecas WebRTC desse processo
atendem os ramais no navegador e não transportam a mídia do WhatsApp.

O transporte de relay segue contratos públicos validados para chamadas 1:1,
mas a sessão e a sinalização pertencem integralmente à Zapo. Entre os dois
processos trafegam apenas comandos de chamada e PCM mono a 16 kHz pelo bridge
autenticado.

## Fluxo de chamada

1. A sessão Zapo abre o bridge autenticado após ficar online.
2. Uma chamada recebida gera `call.incoming`, mas não é atendida automaticamente.
3. O serviço toca os ramais SIP/WebRTC ou SIP/RTP configurados.
4. Somente o primeiro ramal que atende dispara `call.command: accept`.
5. A Zapo conclui a sinalização e abre a mídia da chamada atendida.
6. Áudio usa frames binários PCM Float32 mono a 16 kHz; nunca JSON, base64 ou RabbitMQ.
7. Encerramento em qualquer perna fecha WhatsApp, SIP e o stream daquela chamada.

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

Todas as rotas abaixo passam pela Uno e usam a mesma autenticação
administrativa da API. O navegador não recebe `VOIP_SERVICE_TOKEN`.

### Estado, chamadas e transferência

- `GET /admin/voip/bootstrap`: retorna configuração, linhas Zapo, chamadas,
  reservas, registros SIP/WebRTC, histórico inicial e resumo de armazenamento;
- `GET /admin/voip/calls`: lista chamadas ativas;
- `POST /admin/voip/calls`: inicia chamada com `session`, `peerJid` e
  `extensionId`;
- `POST /admin/voip/calls/{callId}/{command}`: executa `accept`, `reject`, `end`
  ou `mute`;
- `POST /admin/voip/console/calls/{callId}/transfer`: transfere uma chamada
  ativa para `targetExtensionId`.

### Cadastro e slots bridge

- `GET /admin/voip/console/{resource}`: lista `companies`, `accounts`,
  `lineGroups`, `extensionGroups`, `sessions`, `extensions` ou `users`;
- `PUT /admin/voip/console/{resource}/{id}`: cria ou atualiza o recurso;
- `DELETE /admin/voip/console/{resource}/{id}`: remove o recurso;
- `PUT /admin/voip/console/accounts/{accountId}/slots/{slotId}`: cria ou atualiza
  um slot bridge com `label`, `enabled` e `maxActiveCalls`;
- `DELETE /admin/voip/console/accounts/{accountId}/slots/{slotId}`: remove um
  slot sem abrir ou apagar a sessão Zapo;
- `GET /admin/voip/console/zapo-lines`: lista as linhas descobertas pela bridge;
- `POST /admin/voip/console/zapo-lines/{session}/assign`: atribui a linha a uma
  empresa e, com `createBasicRoute=true`, cria conta, sessão, slot, grupos, rota
  e ramal básicos.

Slots representam capacidade simultânea da bridge, não aparelhos adicionais.
Cada slot pertence a uma linha e `maxActiveCalls` limita quantas chamadas ele
pode possuir ao mesmo tempo. A sessão escolhe os slots permitidos em
`deviceSlotIds`; não existe pareamento separado dentro da telefonia.

### Ramais, registros e roteamento

- `GET /admin/voip/console/extensions/{extensionId}/credentials`: retorna ao
  administrador usuário, senha, URI SIP e parâmetros WebRTC do ramal;
- `DELETE /admin/voip/console/extensions/{extensionId}/registrations/{registrationId}`:
  desconecta um registro ativo; use `type=webrtc` ou `type=sip_rtp` para limitar
  o transporte;
- `GET /admin/voip/console/extensionGroups/{extensionGroupId}/transfer-audio`:
  reproduz o áudio de transferência configurado;
- `PUT /admin/voip/console/extensionGroups/{extensionGroupId}/transfer-audio`:
  envia MP3 ou WAV binário, com até 15 MB, e aceita o nome em `X-File-Name`;
- `POST /admin/voip/console/router/resolve-inbound`: simula entrada com
  `sessionId` e `callId` opcional;
- `POST /admin/voip/console/router/resolve-outbound`: simula saída com
  `extensionId`, `target` e `callId` opcional;
- `GET /admin/voip/console/router/locks`: lista reservas ativas;
- `DELETE /admin/voip/console/router/locks/{lockId}`: libera uma reserva;
- `DELETE /admin/voip/console/router/calls/{callId}/locks`: libera todas as
  reservas pertencentes a uma chamada.

Ramais podem pertencer a vários grupos. `extensionGroupDistances` define a
prioridade numérica de cada grupo no roteamento: menor distância toca primeiro.
O simulador aplica as mesmas regras reais, mas não abre a chamada.

### Histórico, gravações e IA

- `GET /admin/voip/console/history`: filtra por `page`, `pageSize` (máximo 100),
  `search`, `startDate` e `endDate`;
- `GET /admin/voip/recordings/{recordId}`: reproduz ou baixa uma gravação pela
  fachada autenticada da Uno;
- `GET /admin/voip/console/recording/summary`: resume arquivos e bytes por linha;
- `GET /admin/voip/console/recording/settings`: consulta a configuração sem
  devolver segredos;
- `PUT /admin/voip/console/recording/settings`: configura disco local ou S3
  compatível, formato, estéreo, retenção e URLs assinadas;
- `DELETE /admin/voip/console/recording/accounts/{accountId}`: remove as
  gravações armazenadas da linha e retorna `deleted` e `bytes`.

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

Cada empresa pode configurar transcrição e resumo pós-chamada por IA. URLs,
modelos, idioma, prompt e a inclusão da transcrição são editáveis no Manager;
tokens já salvos não voltam para o navegador e um campo secreto vazio preserva
o valor existente. A configuração fica em `companies/{id}` dentro de
`aiSummary`, mantendo cada empresa isolada.

Cada linha também pode encaminhar a gravação ao Chatwoot. A opção
`chatwootRecording.privateNote` controla se o anexo entra como nota privada, e
o token salvo segue a mesma regra de preservação de segredo.

No histórico, gravações com estado `available` possuem os botões **Reproduzir**
e **Baixar**. A reprodução acontece em um player de áudio dentro do próprio
grid; o histórico possui busca, período e paginação. O navegador recebe o áudio
pela fachada autenticada da Uno e nunca conhece o token interno do serviço VoIP.
O Manager também mostra quantidade e tamanho por linha e exige confirmação
antes da limpeza em lote.
