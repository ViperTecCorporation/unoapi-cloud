# Plugin VoIP dedicado mantido pela ViperTec

A UnoAPI usa o pacote `@vipertec/zapo-voip`, mantido diretamente em
`vendor/zapo-voip` dentro do ViperConnect. Ele nao depende de acompanhar um fork
completo do repositorio Zapo.

Versao atualmente integrada: `1.0.0-viper.1`.

O pacote e incorporado ao build por `file:vendor/zapo-voip`. A pasta contem o
codigo-fonte auditavel e o `dist` usado em producao, tornando a imagem
reproduzivel sem depender do registry npm durante o build.

Principais ajustes locais:

- descoberta explicita dos dispositivos do destinatario antes da oferta;
- inscricao em todos os SSRCs de audio anunciados pelo peer;
- propagacao dos PIDs reais no relay SCTP;
- atualizacao da inscricao quando o SSRC aceito diverge do inicialmente anunciado;
- fallback seletivo do relay web-token em `3480` quando o ACK usa `authTokenId=0`
  ou identifica um relay FOPS;
- testes do envelope da oferta e da configuracao de relay.

O relay principal continua em `3478`. A variante `3480` e aberta somente quando
os metadados do ACK indicam o fluxo web-token, reproduzindo o comportamento do
motor nativo que ja funcionava.
