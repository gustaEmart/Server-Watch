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

## Prioridade 3 - Probe Collector

### Monitoramento de redes e links

Objetivo:

- Criar uma pagina separada para redes, links de internet e equipamentos como MikroTik, pfSense, Fortigate e roteadores genericos.
- Coletar primeiro disponibilidade, latencia, perda de pacotes e jitter via Probe Collector.
- Evoluir depois para SNMP generico e templates por fabricante.
- Manter diferenca clara entre `link offline`, `link degradado` e `probe sem contato`.

Escopo inicial:

- Cadastro de dispositivos de rede por empresa.
- Cadastro de links por dispositivo.
- Checagem de links pelo probe local.
- Historico de falhas e recuperacoes.
- Cards e graficos simples na rota `/networks`.
- Validacao da funcionalidade em Docker com MongoDB antes da transferencia para outro servidor.

Documento tecnico:

- `docs/NETWORK_MONITORING.md`

### Metricas avancadas pelo probe

Objetivo:

- Evoluir alem do ping e das metricas basicas de host ja coletadas pelo collector.

Coletas implementadas em validacao:

- Particoes/volumes de disco.
- Portas TCP locais em escuta.
- Servicos conhecidos.
- Processos principais.
- Eventos criticos recentes.
- Inventario basico de virtualizacao quando o host expor Hyper-V ou Proxmox.

Ajustes pendentes para a proxima iteracao:

- Definir e documentar o criterio de "servicos criticos". A coleta atual usa uma lista fixa de nomes conhecidos, mas isso precisa virar configuracao por ambiente/empresa/servidor.
- Revisar "processos principais": hoje a coleta lista processos por consumo, mas isso nao significa criticidade operacional. Separar "top processos" de "processos criticos configurados".

Coletas futuras:

- SNMP dentro da LAN do cliente.
- Status de servicos especificos.

### Relatorios operacionais automaticos

Objetivo:

- Gerar, a partir do historico de metricas (disco, CPU, memoria, quedas e backups), relatorios profissionais por empresa com conclusoes prontas para o cliente final, em vez de apenas graficos brutos.

Estado atual:

- Botao "Relatorio" adicionado na aba Empresas (`public/app.js`, `renderGroups`) como placeholder — hoje apenas exibe um aviso de que a geracao automatica ainda esta em desenvolvimento, sem gerar nenhum relatorio real.

Funcionalidades sugeridas:

- Selecao de periodo (ultimos 7/30/60 dias) por empresa.
- Conclusoes automaticas geradas a partir do historico ja coletado, por exemplo:
  - "O processador do servidor X gera picos de uso durante o horario comercial (media Y% entre HHh-HHh)".
  - "Servidor X registrou mais quedas neste periodo se comparado ao anterior (N vs M ocorrencias)".
  - Particoes que cruzaram o limite de alerta de disco durante o periodo.
  - Janelas de backup fora do esperado.
- Exportacao em PDF/HTML com identidade visual (white label) da empresa.
- Agendamento opcional de envio periodico (mensal) por e-mail, dependente da futura integracao de notificacoes por e-mail (Prioridade 5).

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

### Topologia manual de hosts, virtualizadores e VMs

Objetivo:

- Registrar relacoes de dependencia entre servidores, VMs e seus hosts/virtualizadores.
- Evitar leitura errada quando uma VM aparece indisponivel porque o host pai esta offline ou com probe sem contato.

Funcionalidades implementadas:

- Tipo do item: servidor, host fisico, virtualizador, VM ou servico.
- Plataforma de infraestrutura: Proxmox, VMware, Hyper-V, bare metal, cloud ou outra.
- Host pai/virtualizador manual no cadastro do servidor.
- Indicador no dashboard quando um item esta afetado pelo host pai.
- Visualizacao expansivel no dashboard para abrir um virtualizador/host pai e ver as VMs dependentes.

### Descoberta automatica e topologia avancada

Objetivo:

- Evoluir a topologia manual para descoberta automatica e visualizacao mais completa.

Modelo futuro:

- `node_type`: `physical`, `hypervisor`, `cluster`, `vm`, `service`.
- `platform`: `proxmox`, `vmware`, `hyper-v`, `bare-metal`, `cloud`.
- `dependency_status`: calculado com base no status do item e dos pais.

UI sugerida:

- Visao em arvore.
- Agrupamento por cluster ou host.
- Indicador quando uma VM esta offline porque o host pai caiu.
- Filtro por plataforma e tipo de node.
