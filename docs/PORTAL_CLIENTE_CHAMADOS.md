# Portal do Cliente e Chamados

## Objetivo

Criar uma visao de cliente no mesmo ServerWatch para usuarios com papel `user` vinculados a uma ou mais empresas. Essa visao permite acompanhar e abrir chamados sem expor operacoes administrativas, dados de outras empresas ou comunicacao interna da equipe.

O portal deve usar a identidade e os componentes existentes do ServerWatch, com uma pagina de chamado em area expandida. A abertura nao deve acontecer somente em uma barra lateral ou dialogo compacto.

## Regras de negocio definidas

| Tema | Regra |
| --- | --- |
| Identidade | Todo usuario nao administrador ja cadastrado como `user` e cliente. |
| Escopo | O cliente enxerga apenas empresas as quais esta vinculado. |
| Contrato | Somente empresas com contrato `Suporte` podem abrir chamados. |
| Sem contrato | A area de suporte permanece visivel, mas mostra aviso de servico nao contratado e nao exibe o comando de abertura. |
| Abertura | Campos obrigatorios: titulo, empresa, localizacao, categoria, prioridade e descricao. Anexo e opcional. |
| Acompanhamento | O cliente pode adicionar mensagens publicas depois da abertura. |
| Encerramento pelo cliente | O cliente pode marcar que nao precisa mais de apoio; o chamado e fechado automaticamente e essa transicao entra no historico. |
| Comunicacao interna | Administradores podem adicionar mensagens internas que nunca aparecem para usuarios `user`. |
| Visao de chamado | Abertura, leitura e acompanhamento acontecem em uma tela expandida, com historico e painel de dados. |

## Premissa de privacidade

Como nao foi definido ainda se todos os usuarios de uma empresa podem ver os chamados uns dos outros, a primeira versao deve aplicar a regra mais segura:

- Administradores veem todos os chamados.
- Usuarios `user` veem somente chamados que eles mesmos abriram, dentro das empresas vinculadas.
- A estrutura guarda `requesterUserId`, permitindo habilitar uma visao compartilhada por empresa futuramente sem migracao de dados.

## Experiencia do cliente

### Navegacao

Para usuarios `user`, a navegacao deve conter somente os modulos autorizados para as empresas vinculadas. `Suporte` abre uma pagina propria, nao um painel administrativo reaproveitado.

Estados principais:

1. Lista de chamados: filtros simples por empresa, status e pesquisa.
2. Novo chamado: pagina expandida com formulario orientado.
3. Detalhe do chamado: cabecalho, dados do pedido, linha do tempo e compositor de mensagem.
4. Sem contrato: aviso objetivo do contrato ausente, sem campos de abertura.
5. Sem chamados: estado vazio com comando para abrir o primeiro chamado quando houver contrato.

### Pagina de abertura

Rota proposta: `/suporte/novo`.

Layout em duas colunas no desktop e uma coluna no mobile:

- Coluna principal: titulo, categoria, descricao e anexos.
- Coluna lateral: empresa, localizacao, prioridade e resumo do que sera enviado.
- A empresa vem preselecionada quando o usuario possui apenas uma vinculada.
- Se houver varias empresas, o seletor mostra somente empresas permitidas e com contrato de suporte.
- O botao final cria o chamado, redireciona para o detalhe e mostra o codigo gerado.

### Pagina de detalhe

Rota proposta: `/suporte/chamados/:ticketId`.

Elementos:

- Cabecalho com codigo, titulo, empresa, status, prioridade e data de abertura.
- Painel de contexto: localizacao, categoria, solicitante e ativo relacionado quando houver.
- Linha do tempo cronologica com somente entradas publicas para o cliente.
- Compositor de mensagem publica com anexo opcional.
- Acao `Nao preciso mais de apoio`, com confirmacao clara. Ao confirmar, define o status como `closed` e registra uma entrada de sistema no historico.
- Mensagens internas nao entram no HTML, no payload ou no contador visivel ao cliente.

## Modelo de dados

### Empresa

Reutilizar os contratos ja existentes na empresa e normalizar a verificacao em um helper unico:

```js
group.contracts?.support === true
```

Caso o armazenamento atual use outro formato, o helper deve encapsular esse detalhe. Nenhuma regra de contrato deve ficar duplicada em frontend e backend.

### Chamado

Adicionar ou normalizar os campos abaixo, preservando chamados existentes:

```js
{
  id: "uuid",
  code: "SW-2026-00001",
  groupId: "empresa-id",
  requesterUserId: "user-id",
  requesterName: "Nome exibido",
  title: "Internet indisponivel",
  location: "Matriz - Recepcao",
  category: "network",
  priority: "high",
  description: "Descricao inicial",
  status: "open",
  attachments: [],
  updates: [],
  createdAt: "ISO",
  updatedAt: "ISO",
  closedAt: null,
  closedBy: null
}
```

### Atualizacao de chamado

Toda entrada precisa ter visibilidade explicita:

```js
{
  id: "uuid",
  kind: "comment" | "resolution" | "status_change" | "customer_closed",
  visibility: "public" | "internal",
  message: "texto opcional",
  attachments: [],
  authorUserId: "user-id",
  authorName: "Nome exibido",
  createdAt: "ISO"
}
```

Mensagens criadas pelo cliente sao sempre `public`. A API deve rejeitar qualquer tentativa de um usuario `user` enviar `internal`.

### Anexos

Criar metadados separados do arquivo:

```js
{
  id: "uuid",
  originalName: "foto-erro.png",
  mimeType: "image/png",
  sizeBytes: 12345,
  storageKey: "tickets/<ticket-id>/<uuid>",
  uploadedAt: "ISO",
  uploadedBy: "user-id"
}
```

Primeira versao recomendada:

- Limite de 10 MB por arquivo e 3 arquivos por mensagem.
- Tipos permitidos: PDF, PNG, JPG, JPEG, WEBP, TXT e LOG.
- Arquivos fora do MongoDB, em volume Docker persistente. MongoDB armazena somente metadados.
- Downloads autenticados e sempre validados pelo escopo do chamado.

## Autorizacao de API

Criar helpers de autorizacao centralizados em vez de condicoes espalhadas pelas rotas.

```js
canViewTicket(sessionUser, ticket)
canCreateTicket(sessionUser, groupId)
canCommentOnTicket(sessionUser, ticket)
canCloseTicketAsRequester(sessionUser, ticket)
canManageTicket(sessionUser)
```

Regras esperadas:

- `admin`: acesso global, mensagens publicas e internas, atribuicao, edicao e exclusao conforme a politica atual.
- `user`: somente empresas vinculadas, contrato de suporte obrigatorio, somente seus chamados, somente mensagens publicas, fechamento do proprio chamado.
- Nunca confiar no `groupId` enviado pelo navegador sem validar o vinculo do usuario na API.

## Endpoints propostos

### Cliente

| Metodo | Endpoint | Funcao |
| --- | --- | --- |
| `GET` | `/api/client/support/availability` | Empresas permitidas e estado de contrato. |
| `GET` | `/api/client/tickets` | Lista paginada de chamados do proprio usuario. |
| `POST` | `/api/client/tickets` | Abre chamado validando empresa e contrato. |
| `GET` | `/api/client/tickets/:id` | Detalhe filtrado sem entradas internas. |
| `POST` | `/api/client/tickets/:id/messages` | Adiciona mensagem publica e anexos. |
| `POST` | `/api/client/tickets/:id/close` | Fecha chamado a pedido do solicitante e grava historico. |
| `POST` | `/api/client/tickets/:id/attachments` | Envia anexo autenticado. |
| `GET` | `/api/client/ticket-attachments/:id` | Download autenticado. |

### Administracao

As rotas atuais de administracao continuam sendo a fonte global. Completar com:

- Visibilidade da mensagem (`public` ou `internal`).
- Localizacao e anexos no formulario administrativo.
- Identificacao do solicitante e do usuario de fechamento.
- Filtro por empresa, responsavel, status, categoria, prioridade e origem.

## Ordem de implementacao

### Fase 1 - Fundacao segura

1. Normalizar contratos de empresa e criar `hasSupportContract(group)`.
2. Acrescentar `requesterUserId`, `location`, `attachments`, `visibility` e `closedBy` ao modelo de chamado.
3. Garantir compatibilidade de chamados antigos com valores seguros.
4. Criar helpers de escopo e testes manuais de autorizacao.
5. Proteger mensagens internas no backend antes de criar a tela do cliente.

### Fase 2 - API do cliente

1. Criar endpoints `client/support/availability` e `client/tickets`.
2. Validar empresa vinculada e contrato em toda abertura.
3. Implementar comentario publico e fechamento pelo solicitante.
4. Criar upload persistente de anexos, com limites e download autenticado.
5. Registrar eventos de auditoria para abertura, mensagem, anexo e fechamento.

### Fase 3 - Interface expandida

1. Adicionar rotas de frontend para lista, novo chamado e detalhe.
2. Criar pagina `/suporte/novo` em area expandida.
3. Criar detalhe com timeline publica e compositor de mensagem.
4. Criar estado de contrato ausente inspirado na area de backups: explicativo, discreto e sem acao indisponivel.
5. Ajustar responsividade para tela unica, sem perder contexto ou cortar acoes em mobile.

### Fase 4 - Ajustes administrativos

1. Incluir alternancia publica/interna ao atualizar um chamado.
2. Separar visualmente mensagens internas no workbench administrativo.
3. Incluir localizacao, anexos e solicitante no detalhe do tecnico.
4. Adicionar indicadores compactos: aguardando cliente, sem responsavel e SLA vencido.

### Fase 5 - Validacao e rollout

1. Criar um usuario `user` de teste vinculado a uma empresa com suporte.
2. Testar tentativa de abertura para empresa sem suporte e confirmar bloqueio.
3. Testar acesso direto ao ID de chamado de outro usuario e confirmar `403` ou `404` sem vazamento.
4. Testar mensagem interna criada por admin e confirmar ausencia total no portal cliente.
5. Testar upload, download e exclusao logica de anexos.
6. Testar fechamento pelo cliente e registrar a transicao na timeline administrativa e publica.

## Criterios de aceite

- Usuario `user` sem contrato de suporte nao consegue abrir chamado por interface nem API.
- Usuario `user` so enxerga empresas vinculadas e os proprios chamados.
- O chamado e aberto em uma pagina expandida e possui todos os campos obrigatorios definidos.
- Cliente pode publicar acompanhamento e anexar arquivos autorizados.
- Cliente consegue encerrar o proprio chamado, com registro rastreavel.
- Mensagens internas sao invisiveis e inacessiveis pela API do cliente.
- Administradores preservam o workbench atual, agora com mensagens e contexto completos.
- Desktop e mobile permanecem coesos com os tokens visuais existentes do ServerWatch.

## Evolucoes futuras

- Visao compartilhada de chamados por empresa, com permissao opcional por usuario.
- E-mail e WhatsApp para atualizacoes publicas.
- Base de conhecimento e sugestoes antes da abertura.
- SLA por contrato e calendario de atendimento.
- Relatorios de tempo de primeira resposta, resolucao e reabertura.
