# Instalação

Escolha o formato de implantação da Uno. A telefonia pode acompanhar a imagem
única no Docker ou usar seu pacote nativo versionado separadamente. Os dois
modos mantêm o mesmo contrato entre Uno e serviço VoIP.

## Qual opção escolher?

| Cenário | Recomendação | Motivo |
| --- | --- | --- |
| uma VPS ou ambiente de homologação | [Docker Compose](/guide/docker-compose) | menor quantidade de peças para operar |
| cluster com serviços distribuídos | [Docker Swarm](/guide/docker-swarm) | placement, overlay e atualização por serviço |
| execução sem Docker | [Linux nativo](/guide/install-native-linux) | releases imutáveis, `systemd` e rollback |
| telefonia diretamente no host | [Telefonia Linux nativa](/guide/install-voip-native-linux) | acesso previsível às portas SIP e de mídia |

Se esta é sua primeira instalação, comece por Docker Compose. Depois de o
serviço responder, siga o [início rápido](/guide/quickstart); não é necessário
ler todos os guias de implantação antes de testar a API.

## Instalador Linux oficial

Indicado para Debian 12 ou Ubuntu 24.04. O instalador prepara Node.js 24, compila
uma tag imutável, mantém releases para rollback e cria o serviço `systemd`.

[Abrir instalação nativa →](/guide/install-native-linux)

O serviço de telefonia possui um pacote `.deb` próprio, já compilado, para quem
quer manter a Uno em Docker e executar SIP/RTP/WebRTC diretamente no host.

[Abrir telefonia em Linux nativo →](/guide/install-voip-native-linux)

## Docker Compose

Indicado para execução em containers. O modelo completo inclui ViperConnect,
Valkey, RabbitMQ, persistência, healthchecks e publicação local para o proxy de
borda.

[Abrir Docker Compose →](/guide/docker-compose)

## Docker Swarm

Indicado para cluster Swarm. Os modelos próprios usam redes overlay, placement
para dados e telefonia, labels do Traefik no nível correto e publicação
host-mode das portas individuais, com faixas compactas para mídia RTP/WebRTC.

[Abrir Docker Swarm →](/guide/docker-swarm)

## Requisitos de infraestrutura

| Recurso | Mínimo recomendado |
| --- | --- |
| CPU | 2 núcleos |
| Memória | 4 GB durante o build nativo |
| Banco de estado | Valkey 9 ou Redis compatível |
| Fila | RabbitMQ 4 |
| Porta HTTP | `9876` |

Não publique Valkey ou RabbitMQ na internet. O TLS e o domínio devem permanecer
no proxy de borda.

## Critério de conclusão

Antes de integrar, confirme que a API responde em HTTPS, `/sessions` aceita o
token, os volumes são persistentes e os workers necessários estão saudáveis.
Telefonia e worker de vídeo podem ser validados separadamente do primeiro envio
de texto.
