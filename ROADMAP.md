# Roadmap e backlog

Este roadmap lista apenas evolucoes ainda pendentes para o ServerWatch. Itens ja implementados, como login, MongoDB, cadastro de usuarios, empresas, probes basicos, instaladores, white label, tema claro/escuro e rotas da interface foram removidos daqui.

## Prioridade 1 - Confianca operacional

### Estado do probe separado do estado do servidor

Objetivo:

- Diferenciar claramente falha do servidor monitorado e falha do Probe Collector.
- Exibir estados como `Online`, `Offline`, `Probe sem contato`, `Pausado` e `Sem status`.
- Evitar que o operador confunda uma maquina desligada com uma falha de rede ou falha do collector.

Funcionalidades sugeridas:

- Card de detalhe mostrando `Status do servidor` e `Status do probe`.
- Historico separado para eventos do probe: ultimo contato, perda de contato e retorno.
- Alertas com mensagens diferentes para:
  - servidor nao respondeu ao ping;
  - probe collector ficou sem contato;
  - probe collector voltou a se comunicar;
  - servidor voltou a responder.
- Filtro especifico para `Probes sem contato`.

### Pagina de detalhes do probe

Objetivo:

- Transformar a aba Probes em uma tela operacional completa, nao apenas uma lista.

Funcionalidades sugeridas:

- Abrir detalhe de um probe ao selecionar na lista.
- Exibir ultimo contato, IP, MAC, hostname, sistema operacional e versao do collector.
- Exibir servidores vinculados ao probe e seus status.
- Mostrar ultima falha de comunicacao ou erro reportado.
- Botao para copiar comando de reinstalacao ou reparo.
- Botao para desativar/remover um probe antigo.

### Alertas configuraveis

Objetivo:

- Permitir ajustar o comportamento de alertas conforme o cliente ou ambiente.

Funcionalidades sugeridas:

- Tempo sem contato para considerar um probe offline.
- Quantidade de falhas antes de marcar servidor como offline.
- Nivel de severidade por ambiente ou tag.
- Ativar/desativar som de alerta.
- Ativar/desativar notificacao do navegador.
- Marcar alerta como reconhecido.
- Campo de observacao no reconhecimento do alerta.

### Historico mais claro por servidor

Objetivo:

- Facilitar auditoria e diagnostico de incidentes.

Eventos sugeridos:

- Servidor ficou online.
- Servidor ficou offline.
- Probe ficou sem contato.
- Probe voltou.
- Checagem manual solicitada.
- Servidor editado.
- Servidor pausado ou reativado.
- Servidor excluido.

Melhorias de UI:

- Linha do tempo filtravel por servidor.
- Separar eventos tecnicos de eventos administrativos.
- Mostrar duracao de indisponibilidade quando houver recuperacao.

## Prioridade 2 - Operacao multi-cliente

### Permissoes por empresa

Objetivo:

- Permitir que usuarios nao administradores vejam apenas empresas autorizadas.

Funcionalidades sugeridas:

- Vincular usuarios a uma ou mais empresas.
- Perfis:
  - administrador global;
  - operador global;
  - operador por empresa;
  - somente leitura.
- Restringir dashboard, servidores, historico e alertas por empresa.
- Impedir acesso direto por URL a dados fora do escopo do usuario.

### Configuracoes por empresa

Objetivo:

- Tornar cada cliente mais autonomo dentro do ServerWatch.

Campos sugeridos:

- Nome da empresa.
- Logo da empresa.
- Contatos tecnicos.
- E-mails de alerta.
- Intervalo padrao de checagem.
- Limite padrao de falhas.
- Probes vinculados.
- Observacoes contratuais ou operacionais.

### Dashboard executivo

Objetivo:

- Dar uma visao mais rapida para operacao diaria.

Blocos sugeridos:

- Clientes com alerta aberto.
- Probes sem contato.
- Servidores criticos offline.
- Ultimas quedas.
- Recuperacoes recentes.
- Piores latencias.
- Disponibilidade por empresa.
- Total de servidores por ambiente.

## Prioridade 3 - Probe Collector

### Instalador mais inteligente

Objetivo:

- Reduzir falhas de instalacao e facilitar suporte remoto.

Melhorias sugeridas:

- Testar conexao com o ServerWatch antes de instalar.
- Validar token antes da instalacao.
- Exibir log de instalacao na propria interface.
- Botao de reparar instalacao.
- Botao de remover servico.
- Mostrar progresso por etapa.
- Detectar Node.js ausente ou versao incompatibil sem erro tecnico cru.

### Atualizacao automatica do probe

Objetivo:

- Manter collectors atualizados sem reinstalacao manual em cada servidor.

Funcionalidades sugeridas:

- Collector informar versao atual.
- ServerWatch indicar probes desatualizados.
- Comando de atualizacao por Linux e Windows.
- Modo de atualizacao segura, com rollback simples.
- Registro no historico quando o probe for atualizado.

### Fila local do probe

Objetivo:

- Preservar resultados quando a internet do cliente cair.

Funcionalidades sugeridas:

- Salvar resultados localmente quando o ServerWatch central estiver indisponivel.
- Reenviar resultados quando a conexao voltar.
- Limite de tamanho da fila local.
- Registro de tempo em que o probe ficou sem conseguir enviar dados.

### Metricas adicionais pelo probe

Objetivo:

- Evoluir alem do ping.

Coletas futuras:

- CPU.
- Memoria.
- Disco.
- Interfaces de rede.
- Uptime.
- Inventario basico.
- SNMP dentro da LAN do cliente.
- Status de servicos especificos.

## Prioridade 4 - Dados, backup e retencao

### Backup e restore

Objetivo:

- Reduzir risco operacional com MongoDB em producao.

Funcionalidades sugeridas:

- Backup manual pelo painel.
- Rotina automatica de backup.
- Download do backup.
- Restore documentado.
- Retencao configuravel dos backups.
- Exportacao de configuracoes principais em JSON.

### Exportacao e importacao CSV

Objetivo:

- Facilitar carga inicial e manutencao em massa.

Escopo sugerido:

- Exportar empresas.
- Exportar servidores.
- Importar servidores em massa.
- Atualizar servidores existentes por identificador, hostname ou nome.
- Pre-visualizar mudancas antes de aplicar.
- Validar linhas com erro sem cancelar toda a importacao.
- Criar empresas automaticamente apenas com confirmacao.

Campos sugeridos para CSV de servidores:

```text
name,hostname,company,environment,location,tags,check_source,probe_id,check_interval,failure_threshold,is_active
```

### Historico em colecoes proprias

Objetivo:

- Preparar o MongoDB para crescimento.

Melhorias sugeridas:

- Separar eventos e alertas em colecoes proprias.
- Criar indices por servidor, empresa, probe e data.
- Definir politica de retencao de eventos.
- Manter snapshot atual separado do historico.
- Criar rotina de compactacao/limpeza.

## Prioridade 5 - Notificacoes externas

### Notificacoes por e-mail

Objetivo:

- Enviar incidentes e resumo diario para responsaveis.

Funcionalidades sugeridas:

- Configurar SMTP.
- Destinatarios por empresa.
- Eventos enviados: offline, recuperacao, probe sem contato.
- Resumo diario com disponibilidade.
- Teste de envio pela interface.

### Integrações futuras

Opcoes:

- Telegram.
- Discord.
- Slack.
- Microsoft Teams.
- Webhook generico.
- GLPI para abertura de chamado.

## Prioridade 6 - Hierarquia de infraestrutura

### Clusters, hosts fisicos e VMs

Objetivo:

- Representar dependencias entre servidores, hosts fisicos, clusters e maquinas virtuais.

Modelo sugerido:

- `node_type`: `physical`, `hypervisor`, `cluster`, `vm`, `service`.
- `parent_id`: servidor, host ou cluster do qual o item depende.
- `platform`: `proxmox`, `vmware`, `hyper-v`, `bare-metal`, `cloud`.
- `dependency_status`: calculado com base no status do item e dos pais.

UI sugerida:

- Visao em arvore.
- Agrupamento por cluster ou host.
- Indicador quando uma VM esta offline porque o host pai caiu.
- Filtro por plataforma e tipo de node.
