# Changelog

Resumo das versoes estaveis publicadas do ServerWatch.

## Unreleased

- Forca a troca da senha do administrador criado automaticamente no primeiro login.
- Adiciona endpoint autenticado para troca de senha com validacao minima de 8 caracteres.
- Extrai a logica de transicao de monitoramento para `services/monitor.js`.
- Adiciona testes unitarios nativos com `node:test` para tolerancia de falhas e recuperacao online.
- Adiciona workflow de CI com `npm ci`, `npm run check` e `npm test`.
- Permite configurar o token do Probe Collector pela variavel de ambiente `PROBE_TOKEN`.
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
