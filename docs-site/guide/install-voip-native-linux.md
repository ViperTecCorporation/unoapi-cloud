# Telefonia em Linux nativo

O serviço de telefonia pode rodar diretamente em Debian 12 ou Ubuntu 24.04,
gerenciado pelo `systemd`. Nesse modo a Uno pode continuar em Docker: somente o
processo de telefonia sai do container e passa a escutar diretamente no host.

## Imagem única ou pacote nativo

A imagem `ghcr.io/viperteccorporation/viperconnect:latest` já contém a Uno e o
serviço VoIP compilado. Em Docker, `UNOAPI_PROCESS_ROLE=voip` seleciona o
processo de telefonia.

Linux nativo não instala essa imagem. Ele usa o pacote
`viperconnect-voip-service_<versão>_amd64.deb`, gerado pelo mesmo código e
publicado como artefato da release do serviço. O pacote contém a aplicação
compilada, dependências de produção, atualizador, template de ambiente e unidade
`systemd`; não compila o projeto no servidor de destino.

## 1. Baixar e verificar o pacote

Baixe na release fornecida pela ViperTec os dois arquivos da mesma versão:

<a class="compose-download" href="https://github.com/ViperTecCorporation/viperconnect-voip-service/releases">Abrir releases da telefonia →</a>

```text
viperconnect-voip-service_<versão>_amd64.deb
viperconnect-voip-service_<versão>_amd64.deb.sha256
```

Depois verifique o checksum:

```bash
cd /tmp
VOIP_VERSION="INFORME_A_VERSAO"
DEB="viperconnect-voip-service_${VOIP_VERSION}_amd64.deb"
sha256sum -c "${DEB}.sha256"
```

Não instale o pacote se o checksum não retornar `OK`.

## 2. Instalar

```bash
VOIP_VERSION="INFORME_A_VERSAO"
DEB="viperconnect-voip-service_${VOIP_VERSION}_amd64.deb"
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg ffmpeg
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
sudo apt install "./${DEB}"
```

O `node --version` precisa informar versão 24 ou superior. O servidor não
compila o TypeScript: Node.js apenas executa o JavaScript já compilado presente
no pacote.

O pacote cria:

```text
/opt/viperconnect-voip-service                 aplicação compilada
/etc/viperconnect-voip-service/voip.env        configuração protegida
/var/lib/viperconnect-voip-service              SQLite, gravações e atualizações
/lib/systemd/system/viperconnect-voip-service.service
```

O serviço roda com o usuário restrito `viperconnect-voip` e grava somente no
diretório persistente.

## 3. Configurar o ambiente

Edite:

```bash
sudo nano /etc/viperconnect-voip-service/voip.env
```

Modelo equivalente ao perfil usado em produção:

```dotenv
NODE_ENV=production
PORT=3097
VOIP_SERVICE_TOKEN=GERE_UM_TOKEN_LONGO_E_ALEATORIO
VOIP_BRIDGE_TOKEN=GERE_UM_TOKEN_LONGO_E_ALEATORIO
VOIP_MAX_CONCURRENT_CALLS=2
VOIP_CALL_ENGINE=zapo_native
VOIP_NATIVE_LOG_LEVEL=info

VOIP_DOMAIN=sip.seudominio.com.br
VOIP_PUBLIC_WS_URL=wss://voip.seudominio.com.br/sip/ws
VOIP_LAN_DOMAIN=192.168.0.50
VOIP_STUN_URL=stun:sip.seudominio.com.br:3478
VOIP_TURN_URL=turn:sip.seudominio.com.br:3478
VOIP_TURN_USERNAME=TROQUE_O_USUARIO_TURN
VOIP_TURN_CREDENTIAL=TROQUE_A_SENHA_TURN

CALL_HISTORY_STORAGE=sqlite
VOIP_SQLITE_PATH=/var/lib/viperconnect-voip-service/voip.sqlite
VOIP_APP_STORAGE=sqlite
VOICE_CONFIG_STORAGE=sqlite
VOIP_MEMORY_RESTART_RSS_MB=0

SIP_RTP_ENABLED=true
SIP_RTP_BIND_HOST=0.0.0.0
SIP_RTP_PUBLIC_IP=sip.seudominio.com.br
SIP_RTP_PUBLIC_ADVERTISE_IP=203.0.113.10
SIP_RTP_LAN_IP=192.168.0.50
SIP_RTP_PORT=5060
SIP_RTP_MEDIA_PORT_MIN=12000
SIP_RTP_MEDIA_PORT_MAX=13000
SIP_WEBRTC_UDP_PORT_MIN=13001
SIP_WEBRTC_UDP_PORT_MAX=14000
SIP_RTP_CODECS=PCMU,PCMA
SIP_REGISTER_EXPIRES_SECONDS=60

VOIP_AUTO_UPDATE_ENABLED=true
VOIP_AUTO_UPDATE_APPLY_ENABLED=true
VOIP_AUTO_UPDATE_MODE=native
VOIP_AUTO_UPDATE_CHANNEL=stable
```

Use o mesmo valor em `VOIP_SERVICE_TOKEN` e `VOIP_BRIDGE_TOKEN`. Troque os
domínios, IP público, IP LAN e credenciais TURN pelos valores reais. O endereço
`203.0.113.10` é apenas um exemplo reservado para documentação.

## 4. Conectar a Uno ao serviço nativo

Na Uno, configure o mesmo token:

```dotenv
VOIP_SERVICE_URL=http://host.docker.internal:3097
VOIP_BRIDGE_URL=ws://host.docker.internal:3097/v1/bridge/zapo
VOIP_SERVICE_TOKEN=GERE_UM_TOKEN_LONGO_E_ALEATORIO
VOIP_MAX_CONCURRENT_CALLS=2
```

`VOIP_MAX_CONCURRENT_CALLS` usa 2 por padrão e aceita valores de 1 a 32. Defina
o mesmo teto no serviço nativo e no worker Zapo; cada linha pode usar um valor
igual ou menor no Manager.

Se a Uno estiver em Docker Linux, adicione no serviço web e no worker Zapo:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Se Uno e telefonia estiverem instaladas nativamente no mesmo host, use
`http://127.0.0.1:3097` e `ws://127.0.0.1:3097/v1/bridge/zapo`.

## 5. Portas e firewall

```bash
sudo ufw allow 3097/tcp
sudo ufw allow 5060/udp
sudo ufw allow 12000:13000/udp
sudo ufw allow 13001:14000/udp
```

Se houver coturn no mesmo host, libere também as portas configuradas para
STUN/TURN e use uma faixa de relay diferente das faixas RTP acima. Firewall do
provedor, NAT e roteador precisam encaminhar as mesmas portas UDP.

No proxy de borda, encaminhe `voip.seudominio.com` para
`http://IP_DO_SERVIDOR:3097`, habilite WebSocket e preserve o upgrade da rota
`/sip/ws` e da bridge `/v1/bridge/zapo`. O proxy entrega TLS público; SIP/RTP e
as faixas UDP continuam indo diretamente ao host, sem passar pelo proxy HTTP.

## 6. Iniciar e validar

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now viperconnect-voip-service
sudo systemctl status viperconnect-voip-service --no-pager
curl -fsS http://127.0.0.1:3097/health
sudo journalctl -u viperconnect-voip-service -f
```

Depois confirme no Manager:

1. a linha Zapo aparece conectada;
2. o ramal registra por SIP ou WebRTC;
3. os registros ativos aparecem no grid do ramal;
4. uma chamada toca e possui áudio nos dois sentidos;
5. histórico, gravação e configuração persistem após reiniciar o serviço;
6. o simulador de roteamento resolve a linha e o ramal esperados sem abrir chamada.

## Atualizar e remover

Para atualizar, instale o novo `.deb` por cima. O arquivo `voip.env` é tratado
como configuração e não deve ser substituído silenciosamente:

```bash
NOVA_VERSAO="INFORME_A_NOVA_VERSAO"
sudo apt install "./viperconnect-voip-service_${NOVA_VERSAO}_amd64.deb"
sudo systemctl restart viperconnect-voip-service
```

Para remover a aplicação mantendo os dados:

```bash
sudo apt remove viperconnect-voip-service
```

Os dados permanecem em `/var/lib/viperconnect-voip-service` até serem removidos
explicitamente pelo administrador.
