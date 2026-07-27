# Instalação

Escolha o formato de implantação. Os dois usam a mesma versão do ViperConnect,
o mesmo contrato HTTP e dependem de Valkey/Redis e RabbitMQ.

## Instalador Linux oficial

Indicado para Debian 12 ou Ubuntu 24.04. O instalador prepara Node.js 24, compila
uma tag imutável, mantém releases para rollback e cria o serviço `systemd`.

[Abrir instalação nativa →](/guide/install-native-linux)

## Docker Compose

Indicado para execução em containers. O modelo completo inclui ViperConnect,
Valkey, RabbitMQ, persistência, healthchecks e publicação local para o proxy de
borda.

[Abrir Docker Compose →](/guide/docker-compose)

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
