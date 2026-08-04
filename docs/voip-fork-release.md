# Fork VoIP mantido pela ViperTec

A UnoAPI usa o pacote `@vipertec/zapo-voip`, mantido no fork
[`ViperTecCorporation/zapo-voip`](https://github.com/ViperTecCorporation/zapo-voip).

Versao atualmente integrada: `1.0.0-viper.1`.

O pacote e incorporado ao build por `vendor/vipertec-zapo-voip-1.0.0-viper.1.tgz`
para tornar a imagem reproduzivel sem depender do registry npm durante o build.

Principais ajustes do fork:

- descoberta explicita dos dispositivos do destinatario antes da oferta;
- inscricao em todos os SSRCs de audio anunciados pelo peer;
- propagacao dos PIDs reais no relay SCTP;
- atualizacao da inscricao quando o SSRC aceito diverge do inicialmente anunciado;
- testes do envelope da oferta e da configuracao de relay.

O relay de midia continua usando a porta `3478`, conforme o fluxo oficial do
plugin. A UnoAPI nao deve forcar a midia para `3480`.

Release: <https://github.com/ViperTecCorporation/zapo-voip/releases/tag/voip-v1.0.0-viper.1>
