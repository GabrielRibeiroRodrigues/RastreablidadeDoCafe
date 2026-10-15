# Documentação do TraceFlow

| Documento                                                  | Conteúdo                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| [arquitetura.md](arquitetura.md)                           | Visão geral, módulos, fluxo de requisição, deploy planejado    |
| [dominio.md](dominio.md)                                   | Entidades, regras de negócio e glossário PT ↔ EN               |
| [modelo-de-dados.md](modelo-de-dados.md)                   | Tabelas, convenções, diagrama ER e seed                        |
| [autenticacao.md](autenticacao.md)                         | Fluxo do token, perfis, modo simulado e configuração           |
| [multi-tenancy.md](multi-tenancy.md)                       | Como o isolamento entre empresas é garantido e testado         |
| [cadastros.md](cadastros.md)                               | Rotas, filtros e regras dos cadastros                          |
| [estoque.md](estoque.md)                                   | Lotes, recebimento, movimentações, estorno e saldo             |
| [anexos.md](anexos.md)                                     | Anexos de lotes: upload pré-assinado no S3/MinIO, segurança    |
| [producao-rastreabilidade.md](producao-rastreabilidade.md) | Ordens de produção, genealogia e rastreio para trás/frente     |
| [expedicao.md](expedicao.md)                               | Expedição para clientes: regras, rotas, correção por estorno   |
| [etiqueta-pagina-publica.md](etiqueta-pagina-publica.md)   | Etiqueta PDF com QR code, token público e página de rastreio   |
| [relatorios-importacao.md](relatorios-importacao.md)       | Dashboard, relatórios CSV e importação de cadastros            |
| [seguranca.md](seguranca.md)                               | Segurança e produção: rate limit, proxy, CORS, códigos de erro |
| [desenvolvimento.md](desenvolvimento.md)                   | Como rodar, scripts, convenções, solução de problemas          |
| [web.md](web.md)                                           | Front-end: estrutura, autenticação, variáveis de ambiente      |
| [adr/](adr/README.md)                                      | Registro das decisões de arquitetura                           |
| [progresso.md](progresso.md)                               | O que foi feito em cada etapa e o que falta                    |
