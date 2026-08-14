# ViperConnect v4.0.11

Resumo das mudanças publicadas entre **v4.0.1** (31/07/2026) e **v4.0.11** (07/08/2026).

[Ver comparação completa: v4.0.1...v4.0.11](https://github.com/ViperTecCorporation/ViperConnect/compare/v4.0.1...v4.0.11)

## Destaques

- Telefonia WhatsApp/Zapo integrada ao ViperConnect, com bridge autenticada para o serviço VoIP e sem criar uma segunda sessão ou exigir outro QR Code.
- Manager de Telefonia para linhas, ramais SIP/WebRTC, empresas, roteamento, chamadas, gravações e configurações de IA pós-chamada.
- Chamadas de entrada e saída com áudio bidirecional, isolamento por chamada e suporte a chamadas simultâneas na mesma linha.
- Correções de compatibilidade Typebot/Meta para IDs de telefone, aliases, status de webhook e prevenção de loops por eco de mensagens enviadas.
- Resolução de contatos Zapo mais segura, idempotente e consistente entre telefone, PN e LID.
- Melhorias no frontend administrativo, no build da imagem unificada, no Compose, na documentação e nos testes automatizados.

## Adicionado

### Telefonia Zapo/VoIP

- Bridge autenticada `WS /v1/bridge/zapo` entre o worker Zapo e o serviço de telefonia.
- Controle de chamadas por eventos e comandos, mantendo o áudio fora de JSON e RabbitMQ.
- Transporte binário PCM Float32 mono a 16 kHz, isolado por `session + callId + streamId`.
- Suporte a chamadas recebidas e originadas por ramais SIP ou WebRTC.
- Transporte nativo do relay WhatsApp com DTLS, SCTP, DataChannel, RTP, RTCP, SRTP e SRTCP.
- Negociação de codec por chamada, incluindo MLow e RFC Opus.
- Recuperação sequencial de relay em falhas de transporte ou ausência inicial de mídia, sem abrir relays concorrentes.
- Capacidade configurável por linha com `maxConcurrentCalls`, compartilhada entre chamadas de entrada e saída.
- Provisionamento automático e idempotente da empresa, linha, sessão de telefonia e ramal para cada sessão Zapo conectada.
- Vários registros SIP/WebRTC no mesmo ramal; o primeiro que atende assume a chamada e os demais são encerrados como `answered_elsewhere`.
- Identificação do chamador por `displayName`, `pushName`, `username` e telefone confirmado, sem misturar empresas ou sessões.
- Histórico de chamadas com busca, período, paginação, nome e número do contato.
- Gravações locais ou em armazenamento S3 compatível, com reprodução, download, retenção, resumo de consumo e limpeza por conta.
- Envio opcional de gravações ao Chatwoot, inclusive como nota privada.
- Transcrição e resumo pós-chamada por IA configuráveis por empresa.
- Áudio de espera/transferência por grupo de ramais e transferência de chamadas ativas.
- Simulador de roteamento inbound/outbound e gerenciamento de locks de chamada.

### API administrativa

- Fachada autenticada `/admin/voip`, sem expor `VOIP_SERVICE_TOKEN` ao navegador.
- Bootstrap agregado de configuração, linhas Zapo, chamadas, registros, histórico, locks e armazenamento.
- Rotas para iniciar, aceitar, rejeitar, encerrar, silenciar e transferir chamadas.
- CRUD administrativo de empresas, contas, grupos de linhas, grupos de ramais, sessões e ramais.
- Rotas para credenciais de ramal, registros ativos, gravações, áudio de transferência e simulação de roteamento.

### Manager

- Nova página **Telefonia** integrada ao Manager principal.
- Abas para empresas, linhas Zapo, ramais, roteamento avançado, chamadas, gravações e configurações.
- Indicadores de linhas online/offline, registros livres/ocupados e transportes SIP/WebRTC.
- Busca sem diferenciação de maiúsculas, minúsculas ou acentos nas telas de linhas, ramais e roteamento.
- Oculta ramais automáticos offline por padrão e diferencia ramais automáticos de ramais avançados.
- Preserva tokens e outros segredos quando o campo secreto não é reenviado.

## Alterado

### Runtime e distribuição VoIP

- A mesma imagem e tag do ViperConnect agora contêm dois runtimes Node isolados: worker Zapo e telefonia.
- `UNOAPI_PROCESS_ROLE=voip` seleciona o processo de telefonia no entrypoint oficial.
- O serviço VoIP não mantém outra sessão WhatsApp: credenciais, Signal, JIDs/LIDs, sinalização e relay continuam pertencendo exclusivamente ao worker Zapo.
- O vendor de mídia Zapo passou a ser mantido e versionado dentro do ViperConnect.
- O build fixa a revisão do serviço VoIP e valida o runtime compilado para impedir o retorno do roteamento legado baseado em slots.
- Configurações antigas de slots podem ser lidas para migração, mas slots e seleção de dispositivo deixaram de participar do roteamento ativo.
- Se o serviço VoIP ficar indisponível, as mensagens da sessão continuam funcionando e apenas a telefonia fica indisponível.

### Typebot e compatibilidade Meta

- Normalização de `phone_number_id` e aliases numéricos sem adicionar `+` ao identificador da credencial.
- Normalização de erros e status enviados aos webhooks Meta-like.
- Mensagens enviadas pela própria sessão não são encaminhadas novamente ao webhook Typebot, evitando loops de resposta; webhooks comuns, como Chatwoot e auditoria, continuam recebendo os ecos configurados.

### Contatos Zapo

- Normalização centralizada de telefones brasileiros, preservando telefones fixos e números internacionais.
- Resolução telefone ↔ LID por `queriedJid`, sem depender da posição da resposta da rede.
- Consulta em lote limitada por requisição, com uso do store local recente para reduzir consultas repetidas e risco de restrição da sessão.
- Importação idempotente, substituição segura de LID obsoleto e retorno `503` para indisponibilidade transitória.
- Contagem separada de contatos canônicos, chaves brutas e registros ignorados.
- Resolução de nome do chamador também funciona quando o Redis está desativado.

### Interface e operação

- IDs necessários para integrações passaram a ser exibidos no Manager.
- Atualizações automáticas da interface deixaram de fechar modais em uso.
- Manager de Telefonia consolidado como única interface administrativa; o serviço VoIP não mantém frontend ou usuários administrativos paralelos.
- Documentação, OpenAPI, exemplos de Compose e instruções de instalação foram atualizados para a arquitetura integrada.

## Corrigido

- Falha ao localizar o `phone_number_id` do Typebot quando a Uno recebia o mesmo ID com ou sem `+`.
- Repetição excessiva de falhas em webhooks Typebot e risco de o bot responder ao próprio eco.
- Divergências entre telefone e LID na validação e importação de contatos Zapo.
- Instabilidade do ciclo de vida da bridge VoIP durante conexão, reconexão e desligamento gracioso do worker.
- Chamadas atendidas em outro aparelho ou registro local.
- Fluxo de webhook para chamadas Zapo rejeitadas.
- Compatibilidade do relay com o protocolo usado pelo runtime WASM.
- Falhas de áudio causadas pelo transporte WebRTC/ICE inadequado ao relay WhatsApp, substituído pelo transporte nativo direto.
- `<reject>` indevido em chamadas recebidas, preservando o tratamento normal de rejeição em chamadas originadas.
- Duplicação de perna, ramal, stream, gravação ou histórico em chamadas entre duas sessões Zapo locais.
- Limitações do roteamento antigo baseado em slots, substituído por capacidade única da linha e locks por chamada.
- Consultas de identidade que tentavam usar Redis mesmo quando o armazenamento Redis estava desativado.
- Filtros, associações e apresentação de quantidades no Manager de Telefonia.
- Pipeline de CI/build e publicação da imagem unificada com o runtime VoIP.

## Configuração para telefonia

Para habilitar a integração, configure a Uno e o processo VoIP com o mesmo token:

```env
# Uno / worker Zapo
VOIP_SERVICE_URL=http://host.docker.internal:3097
VOIP_BRIDGE_URL=wss://voip.seudominio.com.br/v1/bridge/zapo
VOIP_SERVICE_TOKEN=gere-um-token-longo
VOIP_MAX_CONCURRENT_CALLS=2

# Processo de telefonia
PORT=3097
VOIP_BRIDGE_TOKEN=gere-um-token-longo
VOIP_MAX_CONCURRENT_CALLS=2
```

> `VOIP_BRIDGE_TOKEN` deve ter o mesmo valor de `VOIP_SERVICE_TOKEN`. Em produção, use `wss://` e permita upgrade de WebSocket no proxy para `/v1/bridge/zapo`.

## Histórico por versão

### [v4.0.2](https://github.com/ViperTecCorporation/ViperConnect/releases/tag/v4.0.2)

- Correções Typebot/Meta para IDs, aliases e status de webhook.
- Resolução e importação de contatos Zapo mais seguras.
- IDs de integração expostos no frontend e preservação de modais.
- Plano de integração VoIP documentado.

### [v4.0.3](https://github.com/ViperTecCorporation/ViperConnect/releases/tag/v4.0.3)

- Primeira entrega da bridge Zapo/VoIP, serviços, codecs, controller, rotas e página de Telefonia.
- Imagem, entrypoint, Compose, OpenAPI e documentação preparados para o processo VoIP.

### [v4.0.4](https://github.com/ViperTecCorporation/ViperConnect/releases/tag/v4.0.4)

- Estabilização do runtime da bridge, stores, reconexão e desligamento gracioso.
- Tratamento de chamadas atendidas em outro aparelho local.

### [v4.0.5](https://github.com/ViperTecCorporation/ViperConnect/releases/tag/v4.0.5)

- Correções no pipeline de CI e preparação da release.

### [v4.0.6](https://github.com/ViperTecCorporation/ViperConnect/releases/tag/v4.0.6)

- Restauração do webhook de rejeição de chamadas Zapo.
- Vendor de mídia mantido pela ViperTec e integração VoIP consolidada.
- Proteção do Typebot contra ecos de mensagens enviadas.
- Ajustes do relay ao protocolo do runtime WASM.

### [v4.0.7](https://github.com/ViperTecCorporation/ViperConnect/releases/tag/v4.0.7)

- Substituição do transporte anterior pelo relay nativo direto do WhatsApp.
- Estabilização de DTLS/SCTP/DataChannel, RTP/SRTP e mídia bidirecional.

### [v4.0.8](https://github.com/ViperTecCorporation/ViperConnect/releases/tag/v4.0.8)

- Congelamento do estado validado da mídia Zapo.
- Manager de Telefonia completo, com cadastro, roteamento, registros, chamadas, gravações e IA.
- Fachada administrativa e documentação de instalação/runtime ampliadas.

### [v4.0.9](https://github.com/ViperTecCorporation/ViperConnect/releases/tag/v4.0.9)

- Provisionamento automático da telefonia para sessões Zapo.
- Capacidade por linha e chamadas simultâneas sem slots de dispositivo.
- Unificação do fluxo de chamadas e remoção dos usuários administrativos legados do VoIP.
- Identidade do chamador e nome do contato integrados ao SIP/WebRTC, histórico, IA e Chatwoot.

### [v4.0.10](https://github.com/ViperTecCorporation/ViperConnect/releases/tag/v4.0.10)

- Correção da resolução de identidade Zapo quando Redis está desativado.

### [v4.0.11](https://github.com/ViperTecCorporation/ViperConnect/releases/tag/v4.0.11)

- Correções de roteamento e apresentação no Manager de Telefonia.
- Busca por linhas, ramais, registros, grupos, empresas e destinos.
- Contadores de registros livres/ocupados, associações de grupos e paginação do histórico mais claras.
- Documentação e referências de instalação atualizadas para `4.0.11`.

## Validação e escopo

- 26 commits no intervalo completo, sendo 21 commits sem merges.
- 266 arquivos alterados.
- 42.889 adições e 2.589 remoções.
- 49 arquivos de teste adicionados ou alterados, cobrindo controllers, rotas, frontend, stores, contatos Zapo, bridge, codec, relay, sinalização, SRTP e gerenciamento de chamadas.
- Validações registradas com áudio bidirecional em chamadas de entrada e saída, inclusive duas chamadas simultâneas na mesma linha, sem erros SRTP/Opus nos cenários documentados.

## Atualização

```bash
docker pull ghcr.io/viperteccorporation/viperconnect:4.0.11
```

Consulte também a [documentação de Telefonia](../docs-site/guide/telephony.md) e as [notas completas da v4.0.11](https://github.com/ViperTecCorporation/ViperConnect/releases/tag/v4.0.11).
