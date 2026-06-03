# Changelog

Resumo das versoes estaveis publicadas do ServerWatch.

## Unreleased

- Ajusta a deteccao de link ativo para cenarios com gateways de operadora: quando apenas um alvo responde ele e marcado como ativo; quando mais de um responde, a UI mostra melhor resposta ao ping em vez de indicar certeza operacional.
- Adiciona mascara por alvo de link, como `/30`, `/29` ou `/28`, para associar o IP publico de saida ao gateway correto.
- Corrige o calculo de jitter em links com multiplos alvos para nao comparar latencias de gateways diferentes.
- Melhora o destaque visual do link ativo e passa a exibir motivo de deteccao e latencia simultaneamente nos cards de IP.
- Reorganiza o dashboard inicial com colunas mais simetricas, painel de redes monitoradas e rolagem interna para listas longas.
- Padroniza espacamentos, padding e altura dos paineis do dashboard inicial para reduzir assimetria visual.
- Atualiza o Probe Collector para `0.6.7`.

## v2.0.0 - 2026-06-03

- Adiciona monitoramento de redes e links em pagina dedicada.
- Permite cadastrar dispositivos de rede e links por empresa, operadora, tipo, probe responsavel e limites de latencia/perda.
- Adiciona monitoramento continuo de links pelo Probe Collector a cada 10 segundos, com queda confirmada apos 3 falhas consecutivas.
- Permite cadastrar ate 10 alvos por link com campos separados de nome e IP monitorado.
- Adiciona botoes `+` e `-` no cadastro de links para adicionar/remover alvos dinamicamente, mantendo o primeiro alvo obrigatorio.
- Identifica o link ativo comparando o IP publico de saida observado pelo probe com os IPs cadastrados.
- Mantem fallback por melhor resposta ao ping quando o IP publico de saida nao corresponde a nenhum alvo cadastrado.
- Exibe cards visuais por IP testado, destacando online em verde, offline em vermelho e o alvo ativo.
- Mostra resumo de links no dashboard inicial, incluindo total monitorado e problemas de rede.
- Atualiza a documentacao de redes com orientacao operacional sobre ping de IP publico da propria interface, gateway do provedor e alvos SLA.

- Forca a troca da senha do administrador criado automaticamente no primeiro login.
- Adiciona endpoint autenticado para troca de senha com validacao minima de 8 caracteres.
- Extrai a logica de transicao de monitoramento para `services/monitor.js`.
- Adiciona testes unitarios nativos com `node:test` para tolerancia de falhas e recuperacao online.
- Adiciona workflow de CI com `npm ci`, `npm run check` e `npm test`.
- Permite configurar o token do Probe Collector pela variavel de ambiente `PROBE_TOKEN`.
- Inicia a modularizacao do `server.js` extraindo WebSocket para `ws/handler.js` e alertas/eventos para `services/alert.js`.
- Move a rota de downloads para `routes/downloads.js`, mantendo as mesmas regras de autenticacao.
- Extrai helpers HTTP para `services/http.js` e o payload de health check para `routes/health.js`.
- Move a entrega de arquivos estaticos para `routes/static.js`, preservando o tema inicial aplicado no HTML.
- Move as rotas de configuracao para `routes/settings.js`, preservando permissoes de tema, alertas e branding.
- Move o CRUD administrativo de usuarios para `routes/users.js`.
- Move o CRUD de empresas/grupos para `routes/groups.js`.
- Move listagem, reconhecimento e limpeza de alertas para `routes/alerts.js`.
- Move endpoints de resumo, snapshot e eventos para `routes/meta.js`.
- Move rotas administrativas de probes para `routes/probes.js`.
- Move leituras, historico, criacao, edicao, exclusao e pausa/reativacao de servidores para `routes/servers.js`.
- Corrige retorno dos helpers HTTP para evitar respostas duplicadas e reinicios do backend.
- Refina o visual do frontend com hierarquia mais clara para KPIs, dashboard executivo, lista e detalhes de servidores.
- Melhora a leitura da pagina de servidores com secoes de inventario, perfil e dados coletados mais segmentadas.
- Refina telas administrativas, alertas, historico, configuracoes e formularios para maior consistencia visual.
- Ajusta hierarquia visual de topbar, acoes principais, KPIs e cards da visao executiva.
- Conclui pontos pendentes do redesign com KPIs dinamicos, secoes de detalhe, barras de metricas e listas com linhas alternadas.
- Adiciona indicadores visuais de latencia e destaca campos de tolerancia operacional nos detalhes dos servidores.
- Faz os cards da visao executiva reagirem ao estado real, diferenciando vazio saudavel, alerta, atencao e recuperacao.
- Adiciona dashboard inicial simplificado e recolhe a visao operacional detalhada para reduzir poluicao visual.
- Adiciona graficos rapidos ao dashboard inicial com falhas 24h, distribuicao de status e saude por empresa.
- Resume o README e centraliza o historico de versoes neste arquivo.

## v1.2.1 - 2026-05-29

- Corrige a selecao de VMs no editor de virtualizador.
- Substitui o campo `select multiple` por checkboxes, permitindo marcar varias VMs sem usar Ctrl/Shift.
- Mantem a regra de que servidores marcados ali passam a depender do virtualizador e mudam automaticamente para o tipo VM.

## v1.2.0 - 2026-05-28

- Adiciona topologia de infraestrutura com servidores, virtualizadores, VMs e relacao de host pai.
- Exibe dependencias no dashboard com expansao por virtualizador/host pai.
- Adiciona botao para expandir ou recolher todas as dependencias visiveis.
- Restringe o campo Host pai para itens marcados como Virtualizador.
- Permite vincular servidores a um virtualizador pelo editor do host.
- Adiciona alternancia de comando de instalacao Linux/Proxmox para o Probe Collector.

## v1.1.3 - 2026-05-28

- Adiciona visao executiva do dashboard.
- Consolida indicadores de operacao para leitura rapida do ambiente.

## v1.1.2 - 2026-05-27

- Adiciona visao operacional detalhada do probe.
- Adiciona regras configuraveis de alerta.
- Melhora a linha do tempo de historico dos servidores.

## v1.1.1 - 2026-05-27

- Separa o status de conectividade do probe do status do servidor monitorado.
- Adiciona verificacao por peers locais quando um probe fica sem contato.
- Aplica o tema salvo antes da tela inicial do app.

## v1.1.0 - 2026-05-27

- Adiciona armazenamento backend com MongoDB.
- Restringe acoes administrativas para usuarios administradores.
- Reorganiza a UI com rotas internas, filtros recolhidos e tema escuro configuravel.
- Melhora a pagina de probes, copia para area de transferencia e tratamento de probes sem contato.
- Atualiza o roadmap para refletir o backlog pendente.

## v1.0.0 - 2026-05-25

- Primeira versao estavel do ServerWatch.
- Consolida a base de monitoramento, cadastro, autenticacao, probes e instaladores para ambiente de teste.
