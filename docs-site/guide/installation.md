# Instalação

Escolha o formato de implantação da Uno. A telefonia pode acompanhar a imagem
única no Docker ou usar seu pacote nativo versionado separadamente. Os dois
modos mantêm o mesmo contrato entre Uno e serviço VoIP.

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
