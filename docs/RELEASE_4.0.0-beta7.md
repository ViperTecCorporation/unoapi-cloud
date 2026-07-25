# ViperConnect 4.0.0-beta7

- torna a Zapo o runtime padrão e remove a Baileys do grafo e das dependências
  da imagem de produção;
- mantém o código Baileys isolado, testável e com procedimento documentado de
  reativação deliberada;
- adota `cloud.js` como entrypoint único, com papéis `web`, `broker` e `worker`;
- remove o entrypoint `standalone` e os atalhos redundantes de produção;
- entrega o novo frontend responsivo e componentizado para gerenciamento das
  sessões;
- preserva sessões Baileys como offline, permitindo somente `deregister` para
  limpeza segura dos dados legados;
- adiciona verificação automática para impedir imports Baileys no runtime Zapo;
- atualiza documentação e exemplos de implantação em container único ou com
  responsabilidades separadas.
- torna o teste de entrega do frontend independente de artefatos gerados antes
  do build;
- isola o teste HTTP de contatos com Express e controller reais, evitando
  interferência da aplicação completa entre workers paralelos do Jest.
