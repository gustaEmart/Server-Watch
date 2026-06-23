# Changelog

Resumo das versoes estaveis publicadas do ServerWatch.

## Unreleased

## v3.1.0 - 2026-06-23

- Adiciona a pagina administrativa `Integracoes` para centralizar APIs e credenciais de provedores externos.
- Permite que administradores visualizem e editem a API do MSP Cloud Backup Pro e as credenciais do Proxmox Backup Server.
- Oculta a aba Backups, provedores e widgets relacionados quando nenhum monitoramento correspondente estiver configurado.
- Permite marcar os contratos `Suporte`, `Backup MSP` e `Backup Proxmox` no cadastro e na edicao das empresas.
- Exibe os contratos ativos como etiquetas na aba Empresas, sem alterar os vinculos ou a visualizacao de usuarios.
- Adiciona a integracao com Proxmox Backup Server, incluindo datastores, snapshots, vinculo de namespaces a empresas e associacao dos backups aos servidores monitorados.
- Reorganiza a visualizacao do PBS com indicadores contrastantes, espacamento padronizado e lista vertical agrupada por empresa.
- Exibe em cada empresa os totais de backups com sucesso, atencao e falha.
- Mantem as empresas do PBS em blocos responsivos de altura uniforme, com suas VMs e rolagem interna.
- Adiciona um widget de backups na visao expandida das empresas na pagina Servidores, com saude, totais e acesso direto aos detalhes do cliente vinculado.
- Restaura a barra lateral com icones e secoes, alem dos cards de backup no dashboard, apos uma implantacao baseada em arquivos locais desatualizados.
- Corrige a taxa de sucesso dos backups para considerar somente jobs efetivamente monitorados.
- Separa os jobs sem monitoramento dos totais monitorados em dashboards e detalhes por cliente.
- Adiciona no topo da pagina de Backups um botao de atualizacao manual com horario da ultima sincronizacao da API.

## v3.0.0 - 2026-06-19

- Adiciona o modulo de monitoramento de backups integrado a API do MSP Cloud Backup Pro.
- Adiciona a pagina `Backups` com resumo executivo, indicadores de sucesso, erros, alertas e conjuntos sem monitoramento.
- Exibe tentativas de backup nas ultimas 24 horas, saude por cliente e clientes que precisam de atencao.
- Adiciona detalhamento expandido por cliente com status, destinos, resumo operacional, ultima tentativa, ultimo sucesso e lista de trabalhos.
- Permite vincular clientes retornados pela API de backup as empresas cadastradas no ServerWatch.
- Restringe a atualizacao manual e o gerenciamento de vinculos de backup aos administradores.
- Aplica o escopo de empresas dos usuarios aos dados de backup exibidos.
- Preserva a posicao de rolagem das listas e do painel expandido durante atualizacoes em tempo real.
- Corrige contraste dos cards neutros, textos fora dos blocos e organizacao visual da lista de trabalhos de backup.
- Mantem altura controlada e rolagem interna para listas extensas de clientes e trabalhos.

- Adiciona o agente LinkProbe em Go para monitoramento de links de dentro para fora com multiplos alvos, policy route no firewall e envio para `POST /api/link-status`.
- Adiciona recebimento backend de status do LinkProbe, criando ou atualizando links automaticamente pelo `agent_id`.
- Publica binarios LinkProbe para Windows x64, Linux x64 e Linux ARM64 na area de downloads do ServerWatch.
- Adiciona instalador Linux por linha de comando para o LinkProbe, criando um servico `systemd` por `agent_id`.
- Torna genericos os exemplos do LinkProbe e agrupa links por empresa na pagina de Redes.
- Isola o binario do LinkProbe por `agent_id` para permitir multiplas instancias no mesmo Linux sem conflito de arquivo em uso.
- Permite abrir o detalhe consolidado de uma empresa na pagina de Redes e exibe o motivo de status degradado/offline por link.
- Adiciona IP/Gateway WAN e mascara no cadastro de links para confirmar a saida ativa comparando com o IP publico observado.
- Corrige o fluxo do LinkProbe para aplicar a confirmacao de saida ativa por rede WAN tambem nos resultados recebidos e no snapshot da UI.
- Atualiza o LinkProbe para `1.0.1`, corrigindo o parser de ping para ignorar respostas ICMP de erro como `Rede de destino inacessivel`.
- Corrige o instalador Windows do Probe Collector para registrar a versao real do `collector.js` embutido e publicar automaticamente o `.exe` recompilado em `downloads`.
- Organiza alfabeticamente listas e seletores operacionais de empresas, servidores, VMs, probes, usuarios, dispositivos e links.
- Permite remover empresas escolhendo entre desvincular servidores/links/dispositivos ou excluir tambem os cadastros vinculados.
- Ajusta a deteccao de link ativo para cenarios com gateways de operadora: quando apenas um alvo responde ele e marcado como ativo; quando mais de um responde, a UI mostra melhor resposta ao ping em vez de indicar certeza operacional.
- Adiciona mascara por alvo de link, como `/30`, `/29` ou `/28`, para associar o IP publico de saida ao gateway correto.
- Corrige o calculo de jitter em links com multiplos alvos para nao comparar latencias de gateways diferentes.
- Melhora o destaque visual do link ativo e passa a exibir motivo de deteccao e latencia simultaneamente nos cards de IP.
- Reorganiza o dashboard inicial com colunas mais simetricas, painel de redes monitoradas e rolagem interna para listas longas.
- Padroniza espacamentos, padding e altura dos paineis do dashboard inicial para reduzir assimetria visual.
- Adiciona cache-buster nos assets principais para garantir que alteracoes visuais cheguem ao navegador apos deploy.
- Corrige o espacamento entre os blocos reais do dashboard aplicando o ritmo visual no container de conteudo renderizado.
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
