# Instalação nativa no Linux

O instalador oficial prepara o ViperConnect em Debian ou Ubuntu com Node.js 24,
build Zapo-only, dependências de produção, o helper nativo de mídia
`relay-bridge`, FFmpeg, `qpdf` e serviço `systemd`. O `qpdf` é usado somente
quando o worker detecta um PDF legado gerado pelo Oracle Reports; documentos
comuns não executam conversão.

O helper é testado e compilado com um toolchain Go 1.25 oficial temporário. O
instalador valida o SHA-256 publicado em `go.dev` e remove o toolchain ao final;
não é necessário instalar Go previamente no servidor.

Redis/Valkey e RabbitMQ são serviços externos obrigatórios. O instalador não
altera a configuração deles: informe suas URLs no arquivo de ambiente.

Recomenda-se Debian 12 ou Ubuntu 24.04, dois núcleos e 4 GB de RAM para o build.
Em servidores menores, configure swap antes da instalação.

## Instalação em processo único

Baixe a tag imutável que contém o instalador corrigido e prepare o ambiente.
Substitua `vX.Y.Z` pela versão publicada desejada:

```sh
git clone --depth 1 --branch vX.Y.Z \
  https://github.com/ViperTecCorporation/ViperConnect.git
cd ViperConnect
cp deploy/native/viperconnect.env.example /root/viperconnect.env
nano /root/viperconnect.env
```

Execute a partir de um checkout do projeto:

```sh
sudo bash scripts/install-native-linux.sh \
  --tag vX.Y.Z \
  --env-file /root/viperconnect.env
```

Sem `--role`, a unit `viperconnect.service` inicia web, broker e worker Zapo.

## Processos separados

Execute uma vez para cada papel:

```sh
sudo bash scripts/install-native-linux.sh --tag vX.Y.Z --role web --env-file /root/viperconnect.env
sudo bash scripts/install-native-linux.sh --tag vX.Y.Z --role broker
sudo bash scripts/install-native-linux.sh --tag vX.Y.Z --role video
sudo bash scripts/install-native-linux.sh --tag vX.Y.Z --role worker
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
  current -> releases/vX.Y.Z
  releases/
    vX.Y.Z/
      vendor/zapo-voip/native/relay-bridge/relay-bridge
/var/lib/viperconnect/
  data/
/etc/viperconnect/
  viperconnect.env
```

O build é realizado numa pasta temporária. O link `current` só muda depois de
build, teste e compilação do `relay-bridge`, poda das dependências de
desenvolvimento e validações concluídas.
O `node_modules` usado em produção contém somente o grafo necessário ao runtime
Zapo.

O instalador preenche, quando ainda ausente, a variável abaixo no
`EnvironmentFile` compartilhado:

```dotenv
ZAPO_VOIP_RELAY_BRIDGE_PATH=/opt/viperconnect/current/vendor/zapo-voip/native/relay-bridge/relay-bridge
```

Uma configuração explícita já existente é preservada, permitindo manter um
binário externo em instalações personalizadas.

Para controlar a família das conexões de saída da sessão Zapo sem fixar o
prefixo IPv6 do host, adicione ao mesmo `EnvironmentFile`:

```dotenv
ZAPO_NETWORK_IP_FAMILY=auto
# Overrides opcionais; vazio herda a política global.
ZAPO_CHAT_SOCKET_IP_FAMILY=
ZAPO_MEDIA_UPLOAD_IP_FAMILY=
ZAPO_MEDIA_DOWNLOAD_IP_FAMILY=
ZAPO_LINK_PREVIEW_IP_FAMILY=
```

Use `ipv6first` para preferir IPv6 com fallback IPv4. Essa alteração exige
reiniciar somente o processo que possui as sessões Zapo; as sessões reconectam.

### Entrada IPv6 da API

No modo nativo, o worker usa diretamente a rota IPv6 do host. A publicação da
API deve terminar TLS em um proxy reverso que ouça em IPv4 e `[::]:443` e
encaminhe para `127.0.0.1:9876`. Não é necessário expor a porta Node diretamente
na Internet. O roteiro de rede, DNS, Nginx e firewall está em
[`docs-site/guide/network-ipv6.md`](../docs-site/guide/network-ipv6.md).

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
test -x /opt/viperconnect/current/vendor/zapo-voip/native/relay-bridge/relay-bridge
```

Antes de alterar o host, valide o plano:

```sh
bash scripts/install-native-linux.sh --dry-run --tag vX.Y.Z
```
