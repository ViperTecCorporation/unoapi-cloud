# Instalador Linux oficial

O script `scripts/install-native-linux.sh` instala ou atualiza o ViperConnect
em Debian/Ubuntu. Ele instala Node.js 24 e as dependências de compilação, cria um
usuário de serviço, compila uma tag imutável e só troca a release ativa depois
de todas as validações.

Valkey/Redis e RabbitMQ são externos e precisam estar acessíveis antes de
iniciar o serviço.

## 1. Baixar a última versão publicada

```bash
LATEST_TAG="$(curl -fsSLI -o /dev/null -w '%{url_effective}' \
  https://github.com/ViperTecCorporation/ViperConnect/releases/latest |
  sed 's#.*/tag/##')"

test -n "$LATEST_TAG"

git clone --depth 1 --branch "$LATEST_TAG" \
  https://github.com/ViperTecCorporation/ViperConnect.git
cd ViperConnect
```

`LATEST_TAG` aponta para a release marcada como **Latest** no GitHub. Quando uma
nova release assumir esse canal, uma instalação nova passa a usá-la sem editar
este exemplo.

## 2. Preparar o ambiente

```bash
cp deploy/native/viperconnect.env.example /root/viperconnect.env
nano /root/viperconnect.env
```

Exemplo mínimo:

```dotenv
REDIS_URL=redis://:SENHA_FORTE@127.0.0.1:6379
AMQP_URL=amqp://viperconnect:SENHA_FORTE@127.0.0.1:5672
BASE_URL=https://unoapi.seudominio.com.br
UNOAPI_AUTH_TOKEN=TOKEN_LONGO_E_ALEATORIO
WHATSAPP_ENGINE=zapo
UNOAPI_WORKER_ENGINE=zapo
PORT=9876
LOG_LEVEL=info
UNO_LOG_LEVEL=info
BASE_STORE=/var/lib/viperconnect/data
```

## 3. Conferir sem alterar o servidor

```bash
bash scripts/install-native-linux.sh \
  --dry-run \
  --tag "$LATEST_TAG" \
  --env-file /root/viperconnect.env
```

O comando mostra tag, papel, diretório da release, diretório persistente e nome
do serviço. No modo `--dry-run`, nada é instalado.

## 4. Instalar

Para a maioria dos ambientes, use um processo único:

```bash
sudo bash scripts/install-native-linux.sh \
  --tag "$LATEST_TAG" \
  --env-file /root/viperconnect.env
```

Sem `--role`, o serviço `viperconnect.service` executa HTTP, filas e sessões.

Em instalações maiores, os papéis podem ser separados:

```bash
sudo bash scripts/install-native-linux.sh \
  --tag "$LATEST_TAG" --role web \
  --env-file /root/viperconnect.env

sudo bash scripts/install-native-linux.sh \
  --tag "$LATEST_TAG" --role broker

sudo bash scripts/install-native-linux.sh \
  --tag "$LATEST_TAG" --role worker
```

Isso cria `viperconnect-web.service`, `viperconnect-broker.service` e
`viperconnect-worker.service`. As três units compartilham o mesmo ambiente,
estado e release.

## Estrutura criada

```text
/opt/viperconnect/
  current -> releases/TAG_PUBLICADA
  releases/
    TAG_PUBLICADA/
/var/lib/viperconnect/
  data/
    medias/
    logs/
/etc/viperconnect/
  viperconnect.env
```

O arquivo de ambiente recebe permissão `0600`. O processo executa com o usuário
sem shell `viperconnect`, e o serviço só pode gravar no diretório de estado.

## Atualizar

Baixe ou acesse o checkout da nova tag e execute novamente o mesmo instalador:

```bash
sudo bash scripts/install-native-linux.sh \
  --tag NOVA_TAG \
  --env-file /root/viperconnect.env
```

Releases anteriores permanecem em `/opt/viperconnect/releases`.

## Rollback

```bash
sudo ln -sfn \
  /opt/viperconnect/releases/TAG_ANTERIOR \
  /opt/viperconnect/current.next

sudo mv -Tf \
  /opt/viperconnect/current.next \
  /opt/viperconnect/current

sudo systemctl restart viperconnect.service
```

Se os papéis estiverem separados, reinicie os três serviços.

## Diagnóstico

```bash
systemctl status viperconnect.service
journalctl -u viperconnect.service -f
curl http://127.0.0.1:9876/ping
```

O instalador aceita ainda `--no-start`, `--install-root`, `--state-root`,
`--service-user` e `--repo`. Execute `bash scripts/install-native-linux.sh
--help` para consultar todas as opções.
