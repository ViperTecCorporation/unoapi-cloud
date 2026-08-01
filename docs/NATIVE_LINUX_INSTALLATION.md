# Instalação nativa no Linux

O instalador oficial prepara o ViperConnect em Debian ou Ubuntu com Node.js 24,
build Zapo-only, dependências de produção e serviço `systemd`.

Redis/Valkey e RabbitMQ são serviços externos obrigatórios. O instalador não
altera a configuração deles: informe suas URLs no arquivo de ambiente.

Recomenda-se Debian 12 ou Ubuntu 24.04, dois núcleos e 4 GB de RAM para o build.
Em servidores menores, configure swap antes da instalação.

## Instalação em processo único

Baixe a tag imutável e prepare o ambiente:

```sh
git clone --depth 1 --branch v4.0.1 \
  https://github.com/ViperTecCorporation/ViperConnect.git
cd ViperConnect
cp deploy/native/viperconnect.env.example /root/viperconnect.env
nano /root/viperconnect.env
```

Execute a partir de um checkout do projeto:

```sh
sudo bash scripts/install-native-linux.sh \
  --tag v4.0.1 \
  --env-file /root/viperconnect.env
```

Sem `--role`, a unit `viperconnect.service` inicia web, broker e worker Zapo.

## Processos separados

Execute uma vez para cada papel:

```sh
sudo bash scripts/install-native-linux.sh --tag v4.0.1 --role web --env-file /root/viperconnect.env
sudo bash scripts/install-native-linux.sh --tag v4.0.1 --role broker
sudo bash scripts/install-native-linux.sh --tag v4.0.1 --role worker
```

As units criadas são:

- `viperconnect-web.service`;
- `viperconnect-broker.service`;
- `viperconnect-worker.service`.

Todas compartilham `/opt/viperconnect/current`, `/var/lib/viperconnect/data` e
`/etc/viperconnect/viperconnect.env`.

## Estrutura

```text
/opt/viperconnect/
  current -> releases/v4.0.1
  releases/
    v4.0.1/
/var/lib/viperconnect/
  data/
/etc/viperconnect/
  viperconnect.env
```

O build é realizado numa pasta temporária. O link `current` só muda depois de
build, poda das dependências de desenvolvimento e validações concluídas.
O `node_modules` usado em produção contém somente o grafo necessário ao runtime
Zapo.

## Atualização e rollback

Para atualizar, execute o instalador com uma tag nova. Releases anteriores não
são apagadas.

Rollback manual:

```sh
sudo ln -sfn /opt/viperconnect/releases/TAG_ANTERIOR /opt/viperconnect/current.next
sudo mv -Tf /opt/viperconnect/current.next /opt/viperconnect/current
sudo systemctl restart viperconnect.service
```

Em instalações separadas, reinicie as três units.

## Diagnóstico

```sh
systemctl status viperconnect.service
journalctl -u viperconnect.service -f
curl http://127.0.0.1:9876/ping
```

Antes de alterar o host, valide o plano:

```sh
bash scripts/install-native-linux.sh --dry-run --tag v4.0.1
```
