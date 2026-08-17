# Plano futuro: proxy SOCKS5 IPv6 por sessão

## Objetivo

Criar um serviço de proxy SOCKS5 com saída exclusivamente IPv6 e um painel
WebAdmin para provisionar, bloquear e acompanhar uma credencial por sessão da
UnoAPI. A primeira operadora será a Starlink; a Conecta poderá ser adicionada
depois que a delegação IPv6 dela for confirmada.

Este documento é um plano. Antes da implementação, o estado da RB, o prefixo
delegado, as rotas, o firewall e os recursos da VPS devem ser auditados novamente.

## Estado de rede conhecido

- RouterOS 7 em uma RB4011, com IPv4 e IPv6 em operação.
- Último bloco Starlink observado/delegado: `2803:9810:4ebf:4300::/56`.
- A LAN utilizou um `/64` desse bloco.
- O prefixo Starlink é dinâmico e pode mudar.
- A VPS utilizada pelos serviços estava em `192.168.0.50` na LAN.
- A Conecta ainda precisa ser validada quanto a DHCPv6-PD.

Não codificar o prefixo acima como permanente. O sistema deve descobrir e
armazenar o prefixo corrente.

## Arquitetura proposta

```text
WebAdmin/API de controle
   |-- banco de contas, limites e auditoria
   |-- alocador de sufixos IPv6
   |-- gerador e validador de configuração
   |-- atualizador da sessão UnoAPI
   `-- observabilidade
               |
               v
         3proxy na VPS
               |
        pool IPv6 roteado pela RB
               |
          WAN Starlink
```

O painel deve permanecer separado do processo principal da UnoAPI inicialmente.
O proxy será o plano de dados e o WebAdmin será o plano de controle.

## Endereçamento

Reservar, se possível, um `/64` exclusivo do `/56` Starlink e roteá-lo para a
VPS. Um `/56` contém 256 redes `/64`. Não criar milhares de entradas Neighbor
Discovery nem adicionar cada `/128` manualmente na RB.

Cada conta deve guardar um sufixo estável, e não o endereço completo:

```text
sessao A -> ::1001
sessao B -> ::1002
```

O endereço efetivo será calculado combinando o prefixo atual com esse sufixo.
Assim, uma mudança de prefixo não altera a identidade lógica da conta.

O espaço de endereços não será o limite de clientes. Um `/64` contém `2^64`
endereços. Os limites reais serão banda, conexões simultâneas, CPU, memória,
reputação do bloco e políticas da operadora e dos destinos.

## Provisionamento por sessão

Cada conta deve conter, no mínimo:

- sessão/telefone UnoAPI associado;
- usuário e senha forte;
- sufixo IPv6 exclusivo;
- estado ativo, bloqueado ou expirado;
- limite de conexões e, opcionalmente, de banda;
- data de criação, expiração e última utilização;
- contadores de tráfego e eventos de auditoria.

Fluxo de criação:

1. Gerar usuário e senha aleatórios.
2. Reservar atomicamente um sufixo IPv6 livre.
3. Gerar a regra do 3proxy que associa o usuário ao IPv6 de saída.
4. Validar a configuração antes de publicá-la.
5. Aplicar por arquivo temporário e troca atômica.
6. Recarregar o proxy sem interromper contas não alteradas, quando possível.
7. Gravar o `proxyUrl` na sessão UnoAPI.
8. Testar autenticação, DNS IPv6 e endereço externo.
9. Registrar o resultado no histórico administrativo.

Exemplo de URL entregue à sessão:

```text
socks5h://usuario:senha@proxy6.vipertec.net:1080
```

O 3proxy suporta selecionar um endereço externo por ACL/usuário com `extip`.
A configuração final deve ser gerada e testada na versão efetivamente instalada.

## API administrativa sugerida

```text
POST   /api/proxy-accounts
GET    /api/proxy-accounts
GET    /api/proxy-accounts/:id
PATCH  /api/proxy-accounts/:id
POST   /api/proxy-accounts/:id/rotate-password
POST   /api/proxy-accounts/:id/disable
POST   /api/proxy-accounts/:id/test
GET    /api/proxy-status
GET    /api/proxy-prefix
```

Nunca retornar hash de senha. Se for necessário exibir a senha inicial, mostrá-la
somente uma vez e armazenar o segredo com criptografia apropriada para permitir a
integração com a UnoAPI, ou gerar uma nova senha em vez de recuperá-la.

## Integração UnoAPI

A UnoAPI já possui configuração `proxyUrl` por sessão. Na Zapo, o agente SOCKS
abrange WebSocket, upload/download de mídia e geração de preview. Confirmar esse
contrato no código e nos testes no momento da implementação.

O proxy atual não deve ser considerado transporte do áudio VoIP: UDP, DTLS, SCTP
e o relay de mídia da chamada possuem caminho próprio. Essa parte deve continuar
usando as regras de roteamento e firewall já validadas.

No modo IPv6 estrito, destinos que ofereçam somente IPv4 falharão. NAT64 pode
fornecer compatibilidade, mas deixa de representar uma saída IPv6 nativa ponta a
ponta e deve ser uma decisão separada.

## DNS e acesso externo

Criar um registro semelhante a:

```text
proxy6.vipertec.net  AAAA  <IPv6 de entrada do proxy>
```

O registro deverá ficar como **DNS only** na Cloudflare. A nuvem laranja comum
não encaminha SOCKS5 arbitrário. Spectrum seria uma alternativa para TCP genérico,
mas precisa de avaliação comercial e técnica.

Não é necessário um domínio por cliente. Todos podem usar o mesmo hostname e a
mesma porta; a autenticação escolhe o IPv6 de saída. Subdomínios por cliente serão
apenas uma opção organizacional.

## Mudança automática do prefixo Starlink

Um watcher deve acompanhar o prefixo delegado e, quando ele mudar:

1. Confirmar que o novo prefixo está válido e roteável.
2. Atualizar o estado de prefixo no WebAdmin.
3. Recalcular o IPv6 de entrada e os endereços de saída.
4. Aplicar as rotas e a configuração do proxy.
5. Atualizar o registro AAAA na Cloudflare.
6. Executar testes de saúde antes de marcar a migração como concluída.

Conexões TCP abertas no endereço antigo cairão e precisarão reconectar. O watcher
deve manter logs, tentativas com backoff e proteção contra atualizações parciais.

## RouterOS

- Preferir um `/64` dedicado, roteado para a VPS, sem NAT66.
- Fixar a saída do pool Starlink pela tabela/rota da Starlink usando o endereço
  IPv6 de origem.
- Impedir fallback silencioso desse pool para a Conecta.
- Preservar ICMPv6 necessário ao funcionamento do protocolo.
- Permitir entrada somente na porta e no endereço destinados ao proxy.
- Bloquear acesso do proxy à LAN, loopback, link-local e redes administrativas.
- Excluir o tráfego marcado para tabela alternativa do FastTrack, se aplicável.

## Segurança

SOCKS5 com usuário e senha não cifra o transporte por si só. Para publicação na
Internet, prever:

- credenciais fortes, rotação e revogação;
- firewall e lista de IPs de origem quando disponível;
- rate limit, limite de conexões e proteção contra brute force;
- permitir apenas `CONNECT`; desabilitar `BIND` e `UDP ASSOCIATE` se não usados;
- bloqueio explícito de LAN, ULA, link-local, loopback e serviços de metadados;
- logs com retenção e sem registrar senhas;
- painel administrativo protegido por HTTPS, autenticação forte e auditoria;
- opção futura de WireGuard para clientes controlados.

Para sessões UnoAPI dentro da infraestrutura, preferir o endpoint privado. O
hostname público deve ser usado apenas por clientes externos que realmente
precisem dele.

## Capacidade e implantação gradual

A primeira meta deve ser conservadora:

- piloto com 5 contas;
- primeira etapa operacional com até 50 sessões ativas;
- limite global inicial em torno de 5.000 conexões TCP;
- expansão apenas após observar CPU, memória, banda, latência, erros e reputação.

O número final de clientes deve ser definido por teste de carga e métricas, não
pelo tamanho do bloco IPv6.

## Fases futuras

1. Auditoria somente de leitura da RB, prefixos e VPS.
2. Reserva e roteamento de um `/64` Starlink para a VPS.
3. Piloto manual do 3proxy com cinco usuários e IPv6 exclusivos.
4. Teste de segurança, vazamento IPv4, DNS e troca de prefixo.
5. Implementação do backend WebAdmin e banco de contas.
6. Integração automatizada com `proxyUrl` da UnoAPI.
7. Publicação do AAAA em modo DNS only e endurecimento do firewall.
8. Teste de carga, métricas e definição da capacidade comercial.
9. Validação do DHCPv6-PD da Conecta e eventual suporte a dois pools.

## Critérios de aceite do piloto

- Cada usuário sai pelo `/128` que lhe foi atribuído.
- Não há saída IPv4 nem fallback para outro provedor.
- Uma conta não consegue acessar o IPv6 reservado a outra conta como origem.
- Destinos internos e administrativos estão bloqueados.
- Revogação e rotação funcionam sem reiniciar toda a UnoAPI.
- Troca simulada de prefixo atualiza proxy e DNS de forma recuperável.
- O `proxyUrl` de uma sessão Zapo funciona para WebSocket e operações HTTP
  cobertas pelo agente SOCKS.
- Áudio VoIP permanece independente e sem regressão.

## Referências técnicas

- 3proxy: <https://github.com/3proxy/3proxy/wiki/3proxy.cfg>
- Cloudflare DNS proxy: <https://developers.cloudflare.com/dns/proxy-status/limitations/>
- Cloudflare Spectrum: <https://developers.cloudflare.com/spectrum/>
- RouterOS Policy Routing: <https://help.mikrotik.com/docs/spaces/ROS/pages/59965508/Policy%20Routing>

