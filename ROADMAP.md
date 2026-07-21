# Roadmap do ServerWatch

Este documento acompanha apenas evolucoes futuras. As entregas concluidas ficam
registradas no changelog e servem como base para as proximas prioridades.

## Entregas consolidadas

- Plataforma Docker com MongoDB, autenticacao, usuarios e permissoes por empresa.
- Gestao de empresas, contratos, produtos com validade, logos e identidade white label.
- Probes de servidores para Windows e Linux, instaladores, comandos guiados, atualizacao e
  coleta de inventario/metricas do host.
- Distincao entre estado do servidor, estado do probe e verificacoes auxiliares de rede.
- Hierarquia manual de hosts, virtualizadores e VMs.
- Monitoramento de links por LinkProbe, scripts RouterOS/MikroTik e Network Probe SNMP,
  incluindo Fortigate SD-WAN e status por empresa.
- Integracao UniFi Network com sites, dispositivos e vinculo administrativo por empresa.
- Monitoramento de backups MSP Cloud Backup Pro e Proxmox Backup Server (PBS).
- Modulo de suporte com chamados, SLA, atualizacoes internas/publicas e regras automaticas.
- Relatorios operacionais por empresa com cobertura, disponibilidade, excecoes, vencimentos
  e tendencia diaria de backups.

## Prioridade 1 - Confiabilidade de dados e operacao

### Backup, restore e retencao do MongoDB

Objetivo: reduzir o risco operacional do banco em producao e tornar a recuperacao auditavel.

- Backup manual pelo painel e rotina automatica agendada.
- Retencao configuravel, download controlado e procedimento de restore testado.
- Exportacao de configuracoes essenciais para contingencia.
- Registro do resultado de cada backup e alerta quando a rotina falhar.

### Historico e desempenho em escala

Objetivo: manter consultas e dashboards confiaveis com crescimento de clientes, probes e eventos.

- Separar eventos, alertas, metricas e snapshots em colecoes proprias quando necessario.
- Criar indices por empresa, ativo, probe, origem e data.
- Definir retencao/compactacao para eventos de alto volume.
- Revisar idempotencia das regras automaticas de chamados para evitar duplicidades.
- Criar testes de regressao para permissao por empresa e calculos de disponibilidade/SLA.

## Prioridade 2 - Relatorios profissionais

### Entrega e automacao

Objetivo: transformar a tela de relatorios em material pronto para uso interno e com clientes.

- Exportacao em PDF e HTML com identidade visual da empresa.
- Exportacao CSV dos dados de apoio.
- Agendamento mensal/trimestral por empresa.
- Envio por e-mail quando a integracao SMTP estiver configurada.
- Seletor de periodo com comparacao ao periodo anterior.

### Analise e capacidade

Objetivo: evoluir de indicadores atuais para recomendacoes baseadas em tendencia.

- Variacao de uso do PBS e previsao de capacidade.
- Tendencias de CPU, memoria, disco e indisponibilidade por ativo.
- Destaques automaticos de piora, recuperacao e recorrencia.
- Sumario executivo e sumario tecnico no mesmo relatorio.

## Prioridade 3 - Notificacoes e integracoes externas

### Canais de notificacao

- SMTP por configuracao administrativa, com teste de envio.
- Destinatarios por empresa e regras por severidade.
- Resumo diario/semanal de disponibilidade, links e backups.
- Webhook generico para Teams, Discord, Slack ou automacoes externas.
- Integracao WhatsApp por provedor/API homologada, com controle de volume e horario.

### Integracoes operacionais

- Integracao com RMM para abrir acesso remoto a partir de um ativo.
- Webhooks ou integracao com GLPI para sincronizacao de chamados quando aplicavel.
- Documentar credenciais, escopos e auditoria de cada integracao.

## Prioridade 4 - Redes e conectividade avancada

### SNMP e equipamentos genericos

- Perfis SNMP reutilizaveis para MikroTik, pfSense, Fortigate e equipamentos genericos.
- Descoberta assistida de interfaces WAN e health-checks configurados no equipamento.
- Historico de perda, latencia, jitter, utilizacao e troca de link ativo.
- Separar claramente estado administrativo, link fisico e navegacao validada.

### Topologia de rede

- Vinculo entre equipamentos, links, servidores e empresas.
- Visualizacao de dependencia para distinguir falha de uplink, firewall e ativo interno.
- Mapa logico simples por empresa, sem substituir a leitura operacional por lista.

## Prioridade 5 - Probe Collector e inventario avancado

### Metricas configuraveis

- Transformar servicos/processos criticos em configuracao por empresa ou servidor.
- Separar top processos por consumo de processos efetivamente criticos.
- Regras de alerta por volume, servico, porta, evento e limite especifico do ambiente.
- Coleta opcional de SNMP dentro da LAN por probe autorizado.

### Descoberta de infraestrutura

- Descoberta assistida de hosts, virtualizadores, VMs e clusters.
- Sugestoes de vinculo de host pai baseadas em inventario Proxmox, Hyper-V ou VMware.
- Visao em arvore com filtro por plataforma, tipo de no e impacto de dependencia.

## Prioridade 6 - Operacao multiempresa e portal do cliente

- Aperfeicoar a visao restrita do cliente com foco em ativos, links, backups e chamados da
  propria empresa.
- Contatos tecnicos, destinatarios de alerta e observacoes operacionais por empresa.
- Importacao/exportacao CSV com pre-visualizacao, validacao de linhas e atualizacao em massa.
- Auditoria administrativa de alteracoes relevantes em empresas, contratos e acessos.

## Criterio para novas entregas

Uma funcionalidade so entra como concluida quando estiver validada na VM Docker, respeitar
permissoes por empresa, nao regredir os modulos existentes e possuir registro no changelog/tag.
