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
VOIP_MAX_CONCURRENT_CALLS=2
```

O valor de `VOIP_BRIDGE_TOKEN` deve ser igual ao `VOIP_SERVICE_TOKEN` usado pela
Uno. O token nunca é enviado ao navegador.

## Docker e rede

No Docker Compose standalone, o serviço VoIP usa `network_mode: host` para SIP,
RTP e WebRTC, enquanto Uno, Valkey e RabbitMQ permanecem em bridge. O worker
Uno acessa o host por:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
environment:
  VOIP_SERVICE_URL: http://host.docker.internal:3097
  VOIP_BRIDGE_URL: wss://voip.seudominio.com.br/v1/bridge/zapo
  VOIP_SERVICE_TOKEN: gere-um-token-longo
  VOIP_MAX_CONCURRENT_CALLS: "2"
```

Para executar a telefonia fora de container com pacote `.deb` e `systemd`, veja
[Telefonia em Linux nativo](/guide/install-voip-native-linux).

SIP, RTP, WebRTC e o proxy de mídia suportam IPv4 e IPv6 em paralelo a partir
da telefonia `v0.1.61` e da imagem unificada `v4.0.15`. A configuração pública
por família, Coturn e os testes de aceite estão em
[VoIP dual-stack IPv4 e IPv6](/guide/voip-ipv6).

No Docker Swarm, não use `network_mode: host`. O worker e a telefonia se
encontram pelo DNS da overlay interna. `5060/udp` permanece em `mode: host`, e
as faixas fixas RTP/WebRTC usam a sintaxe compacta aceita pelo stack. O modelo
Traefik deixa HTTP e WebSocket nas overlays; o modelo Nginx publica também
`9876/tcp` e `3097/tcp` no nó de borda. Veja [Docker Swarm](/guide/docker-swarm)
para baixar os stacks completos.

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
2. A Uno consulta primeiro o contato por `peerJid` e depois pelo telefone confirmado no diretório da própria sessão.
3. Uma chamada recebida gera `call.incoming` com `callerPn`, `callerName` e `callerNameSource` quando disponíveis, mas não é atendida automaticamente.
4. O serviço toca todos os registros livres do ramal automático e os destinos imediatos do roteamento avançado.
5. Somente o primeiro registro ou destino que atende dispara `call.command: accept`; as outras pernas são canceladas com `answered_elsewhere`.
6. A Zapo conclui a sinalização e abre a mídia da chamada atendida.
7. Áudio usa frames binários PCM Float32 mono a 16 kHz; nunca JSON, base64 ou RabbitMQ.
8. Encerramento em qualquer perna fecha WhatsApp, SIP e o stream daquela chamada.

O nome segue a prioridade `displayName`, `pushName`, `username` e, por último,
o telefone confirmado. A resolução nunca cruza empresas ou sessões. O
`display-name` SIP e o `remote_identity.display_name` do WebRTC recebem o nome
normalizado; a URI SIP continua usando o número. CR/LF e caracteres de controle
são removidos, e aspas são escapadas com segurança. Sem telefone confirmado, o LID fica
somente em `remoteJid` para auditoria e não é apresentado como número.

Se o WhatsApp entregar um `<reject>` estranho para uma chamada recebida, o
worker o ignora porque a sessão não foi a iniciadora. Rejeição de uma chamada
de saída continua normal, e o cancelamento remoto de uma entrada continua vindo
por `<terminate>`. Esse guard não altera o caminho de mídia.

Cada chamada é isolada por `session + callId`. Não existem slots ou seleção de
dispositivo no roteamento ativo. `maxConcurrentCalls` é a capacidade única da
linha Zapo, compartilhada por locks de entrada (`inbound_call`) e saída
(`outbound_line`). O encerramento libera somente o lock da própria chamada.

O padrão é 2 e o valor pode ser ajustado entre 2 e 32. Capacidade cheia
retorna `line_capacity_exhausted`, sem fallback. A variável
`VOIP_MAX_CONCURRENT_CALLS` define a capacidade anunciada pelo worker; mantenha
o valor igual ou acima do configurado nas linhas.

Cada ramal também possui um **Modo de conexão SIP** independente da capacidade
da linha. **Ramal tradicional** permite uma chamada por registro conectado.
**Tronco SIP/PBX** permite vários diálogos pelo mesmo registro SIP/RTP, indicado
para Asterisk, FreePBX, Issabel e outros PABXs. O modo é explícito e nunca é
deduzido pelo `User-Agent`; configurações antigas permanecem como ramal
tradicional.

Em validação real de 2026-08-06, duas chamadas de saída simultâneas e duas
chamadas de entrada simultâneas foram mantidas na mesma linha, com áudio
bidirecional independente, encerramento normal e zero erro SRTP/Opus.

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

### Cadastro de linhas e sessões Zapo

- `GET /admin/voip/console/{resource}`: lista `companies`, `accounts`,
  `lineGroups`, `extensionGroups`, `sessions` ou `extensions`;
- `PUT /admin/voip/console/{resource}/{id}`: cria ou atualiza o recurso;
- `DELETE /admin/voip/console/{resource}/{id}`: remove o recurso;
- `GET /admin/voip/console/zapo-lines`: lista as linhas descobertas pela bridge;
- `POST /admin/voip/console/zapo-lines/{session}/assign`: altera posteriormente
  a empresa de uma linha já provisionada. `createBasicRoute` está depreciado e
  não controla mais a criação do ramal.

A sessão Zapo já é a origem da telefonia e não exige cadastro de dispositivo,
QR code, ativação manual ou seleção adicional. No bootstrap, conexão,
`session.status` e reconexão, a Uno garante automaticamente empresa, linha,
sessão de telefonia e ramal com usuário igual ao número da sessão. A empresa já
vinculada é preservada; depois é considerada a empresa da conta/linha e, por
último, `empresa-padrao`, criada quando necessário. Recursos gerenciados usam
`provisioningSource=zapo_auto`.

O bootstrap expõe em cada linha:

```json
{
  "automatic": {
    "extensionId": "ext_5566999554300",
    "username": "5566999554300",
    "status": "active",
    "registrationCount": 3,
    "freeRegistrationCount": 2,
    "busyRegistrationCount": 1,
    "transports": ["sip", "webrtc"],
    "basicInboundEnabled": true
  },
  "advancedRoutingConfigured": true
}
```

Após 60 segundos offline, o ramal automático é desativado, ocultado e seus
registros são encerrados. A reconexão reativa o mesmo ID, usuário e senha. Cada
linha possui `maxConcurrentCalls` de 2 a 32, compartilhado entre entrada e
saída. Configurações antigas com slots podem ser lidas uma vez para migrar a
capacidade, mas esses campos não participam do roteador ativo e o Manager não os
cria nem edita.

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

Por padrão, o ramal automático toca junto com os destinos avançados imediatos;
regras com atraso mantêm seu tempo e um ramal repetido é deduplicado. Em uma
sessão avançada, `routing.basicInboundEnabled=false` corresponde a **Desativar
atendimento básico**: somente a entrada automática deixa de tocar, enquanto o
ramal continua registrado e pode originar chamadas. A opção exige um destino
avançado válido; ao remover o último destino, o básico é reativado.

### Histórico, gravações e IA

- `GET /admin/voip/console/history`: filtra por `page`, `pageSize` (máximo 100),
  `search`, `startDate` e `endDate`; a busca inclui nome e número do contato;
- `GET /admin/voip/recordings/{recordId}`: reproduz ou baixa uma gravação pela
  fachada autenticada da Uno;
- `GET /admin/voip/console/recording/summary`: resume arquivos e bytes por linha;
- `GET /admin/voip/console/recording/settings`: consulta a configuração sem
  devolver segredos;
- `PUT /admin/voip/console/recording/settings`: configura disco local ou S3
  compatível, formato, estéreo, retenção e URLs assinadas;
- `DELETE /admin/voip/console/recording/accounts/{accountId}`: remove as
  gravações armazenadas da linha e retorna `deleted` e `bytes`.

Na retenção, `0` desativa a exclusão automática. Um valor maior remove apenas
a mídia local ou S3 que esteja finalizada, com status `available`, e cuja data
de término seja anterior ao corte. A limpeza roda ao iniciar o serviço, a cada
6 horas e depois de salvar a configuração. O histórico da chamada é mantido e
somente os campos da gravação são limpos; uma falha no storage preserva esses
campos para nova tentativa. O intervalo pode ser ajustado no serviço VoIP com
`VOIP_CALL_RECORDING_RETENTION_CLEANUP_INTERVAL_MS`.

A página **Telefonia** do Manager usa abas, grids e modais para empresas,
linhas, ramais e **Roteamento avançado**. O grid de ramais distingue
**Automático** de **Avançado** e oculta automáticos offline por padrão.
**Chamadas e gravações** ficam numa
única aba: chamadas ativas, histórico, player, download, configuração e resumo
de armazenamento usam o mesmo fluxo, sem repetir filtros ou registros. O serviço
VoIP não possui frontend nem usuários administrativos próprios; a Uno é a
interface única. O JSON interno não é exposto como editor de configuração.
Segredos já configurados aparecem apenas como indicadores e são preservados
quando o campo secreto não é reenviado.

Não existe estado **Aguardando empresa** nem botão **Ativar linha**. O
provisionamento é idempotente, preserva empresa, senha, Chatwoot, IA, grupos e
rotas existentes e usa o número da sessão como usuário. O administrador usa
**Credenciais** no grid de ramais para recuperar SIP e WebRTC e selecionar
**Ramal tradicional** ou **Tronco SIP/PBX**. No automático, somente esse modo é
alterado; identidade, senha, empresa e vínculos continuam gerenciados.

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
grid; a coluna **Contato** mostra `remoteName · remoteNumber`, e `remoteJid` e
`remoteNameSource` preservam a fotografia auditável do início da chamada. O
Chatwoot continua procurando conversas pelo número, nunca pelo nome, e a IA
recebe nome e número como contexto quando disponíveis. O processamento da IA é
configurado por empresa e independe do Chatwoot; quando ambos estão ativos, a
publicação da nota é opcional e não bloqueia a transcrição nem o resumo. O
histórico possui busca, período e paginação. O navegador recebe o áudio
pela fachada autenticada da Uno e nunca conhece o token interno do serviço VoIP.
O Manager também mostra quantidade e tamanho por linha e exige confirmação
antes da limpeza em lote.
