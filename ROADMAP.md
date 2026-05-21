# Roadmap e backlog

## Hierarquia de infraestrutura e clusters

Para futuras versoes, o ServerWatch deve permitir cadastrar relacoes entre servidores, clusters e maquinas virtuais.

Objetivo:

- Representar clusters de servidores fisicos, como clusters Proxmox.
- Indicar que um servidor monitorado e uma VM hospedada em um virtualizador especifico.
- Mostrar dependencias visuais no dashboard, por exemplo:
  - Cluster Proxmox
  - Host fisico Proxmox
  - VM dentro do host
  - Servicos ou servidores dependentes da VM
- Alertar de forma mais inteligente quando um host pai cair, evitando confusao com varias VMs offline ao mesmo tempo.

Modelo sugerido:

- `node_type`: `physical`, `hypervisor`, `cluster`, `vm`, `service`
- `parent_id`: servidor, host ou cluster do qual este item depende
- `platform`: `proxmox`, `vmware`, `hyper-v`, `bare-metal`, `cloud`, etc.
- `dependency_status`: calculado com base no status do item e dos pais

UI sugerida:

- Visao em arvore para hierarquia operacional.
- Agrupamento por cluster/host no dashboard.
- Indicador visual quando uma VM esta offline porque o virtualizador ou host pai caiu.
- Filtro por plataforma e por tipo de node.

Essa funcionalidade deve ser implementada depois do MVP basico de CRUD, ping, historico e alertas estar estavel.

## Identidade visual

Evoluir a interface para uma identidade visual mais proprietaria, misturando azul escuro com vermelho.

Direcao sugerida:

- Azul escuro como base institucional para navegacao, headers e superficies principais.
- Vermelho como cor de alerta, indisponibilidade, acoes destrutivas e pontos de atencao.
- Manter verde apenas para status ONLINE, sem deixar a paleta dominar a interface.
- Usar cinza neutro para estados pausados/desativados.
- Evitar excesso de saturacao para preservar legibilidade em uso operacional continuo.

## Login, banco de dados e dados por usuario

Adicionar autenticacao e persistencia real em banco de dados.

Objetivo:

- Tela de login com e-mail e senha.
- Cadastro inicial de usuario administrador.
- Banco de dados para guardar usuarios, servidores, historico, alertas e preferencias.
- Cada usuario deve acessar apenas os servidores permitidos para ele.
- Preparar o modelo para organizacoes/equipes no futuro.

Modelo inicial sugerido:

- `users`: nome, e-mail, senha com hash, papel/perfil, status ativo.
- `groups`: empresas, clientes, unidades ou grupos operacionais.
- `servers`: dados do servidor monitorado, empresa/grupo, dono/organizacao, status atual.
- `status_events`: historico de transicoes e checagens relevantes.
- `alerts`: alertas gerados e leitura/acknowledgement.
- `user_settings`: preferencias do usuario.

Recomendacao tecnica:

- Migrar a persistencia atual em JSON para SQLite no proximo passo simples, ou PostgreSQL se ja for preparar producao.
- Autenticacao com sessao ou JWT.
- Senhas com bcrypt/argon2.

## Configuracoes e notificacoes por e-mail

Adicionar uma tela de configuracoes do usuario com preferencias de notificacao.

Funcionalidades futuras:

- Ativar/desativar notificacoes diarias por e-mail.
- Configurar horario do resumo diario.
- Escolher quais eventos entram no e-mail: offline, recuperacoes, disponibilidade diaria, servidores pausados.
- Permitir destinatarios adicionais por usuario ou por grupo.
- Guardar preferencias em `user_settings`.

Resumo diario sugerido:

- Total de servidores monitorados.
- Quantos ficaram online/offline no periodo.
- Incidentes do dia.
- Servidores atualmente offline.
- Disponibilidade percentual por servidor ou grupo.

## Exportacao e importacao CSV

Adicionar a possibilidade de exportar e importar configuracoes em arquivo CSV.

Objetivo:

- Exportar empresas/grupos cadastrados.
- Exportar servidores monitorados, incluindo IP/hostname, empresa, ambiente, tags, intervalo e limite de falhas.
- Importar servidores em massa a partir de CSV.
- Atualizar servidores existentes quando houver correspondencia por identificador, hostname ou nome.
- Validar erros de importacao antes de aplicar mudancas.

Campos sugeridos para CSV de servidores:

```text
name,hostname,company,environment,location,tags,check_interval,failure_threshold,is_active
```

Cuidados:

- Mostrar pre-visualizacao antes de importar.
- Informar linhas com erro sem interromper toda a importacao.
- Criar empresas automaticamente apenas se o usuario confirmar.
- Gerar backup das configuracoes antes de importacao em massa.
