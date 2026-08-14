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
git clone --depth 1 --branch v4.0.2 \
  https://github.com/ViperTecCorporation/ViperConnect.git
cd ViperConnect
cp deploy/native/viperconnect.env.example /root/viperconnect.env
nano /root/viperconnect.env
```

Execute a partir de um checkout do projeto:

```sh
sudo bash scripts/install-native-linux.sh \
  --tag v4.0.2 \
  --env-file /root/viperconnect.env
```

Sem `--role`, a unit `viperconnect.service` inicia web, broker e worker Zapo.

## Processos separados

Execute uma vez para cada papel:

```sh
sudo bash scripts/install-native-linux.sh --tag v4.0.2 --role web --env-file /root/viperconnect.env
sudo bash scripts/install-native-linux.sh --tag v4.0.2 --role broker
sudo bash scripts/install-native-linux.sh --tag v4.0.2 --role video
sudo bash scripts/install-native-linux.sh --tag v4.0.2 --role worker
```

As units criadas são:

- `viperconnect-web.service`;
- `viperconnect-broker.service`;
- `viperconnect-video.service`;
- `viperconnect-worker.service`.

Todas compartilham `/opt/viperconnect/current`, `/var/lib/viperconnect/data` e
`/etc/viperconnect/viperconnect.env`.

Para usar a unit de vídeo, configure no ambiente compartilhado:

```dotenv
UNOAPI_VIDEO_WORKER_MODE=dedicated
```

Sem essa variável, o broker continua processando vídeos para preservar a
compatibilidade com instalações antigas. Em modo dedicado, a unit de vídeo faz
download por streaming e executa uma conversão FFmpeg por vez com prioridade
baixa. Se ela parar, os vídeos aguardam no RabbitMQ e o broker continua livre;
não existe fallback automático enquanto `dedicated` estiver configurado.

Esse isolamento evita que vídeos grandes disputem o mesmo limite de CPU usado
por webhooks e status. No teste de referência, um vídeo de 106,9 MB e 6min30s
ocupou um núcleo por aproximadamente 3min30s até gerar um MP4 de 13,9 MB.

## Estrutura

```text
/opt/viperconnect/
  current -> releases/v4.0.2
  releases/
    v4.0.2/
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

Em instalações separadas, reinicie as quatro units.

## Diagnóstico

```sh
systemctl status viperconnect.service
journalctl -u viperconnect.service -f
systemctl status viperconnect-video.service
systemctl status viperconnect-broker.service
curl http://127.0.0.1:9876/ping
```

Antes de alterar o host, valide o plano:

```sh
bash scripts/install-native-linux.sh --dry-run --tag v4.0.2
```
