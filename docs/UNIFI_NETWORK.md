# Integracao com UniFi Network (multisite)

## Status da iniciativa

**Reativada em 23 de junho de 2026.**

O controlador foi migrado para UniFi OS Server com suporte a API oficial
local autenticada por chave. A validacao tecnica confirmou:

- UniFi Network 10.1.89;
- UniFi OS Server acessivel internamente em `10.10.10.39:11443`;
- API oficial sob `/proxy/network/integration/v1`;
- autenticacao pelo header `X-API-KEY`;
- certificado autoassinado protegido no ServerWatch por fingerprint
  SHA-256.

A listagem de sites, dispositivos, clientes e estatisticas depende de uma
API key ativa no UniFi OS. Se a chave for revogada, expirar ou for criada
para outro tipo de integracao, o ServerWatch exibira erro de autorizacao e
preservara o ultimo estado valido.

Continuam proibidos login automatizado, cookies de sessao e endpoints
legados ou nao oficiais. A implementacao usa exclusivamente a API oficial
local documentada pela Ubiquiti.

Este documento define o plano de implementacao do monitoramento de Access
Points, clientes sem fio e saude de rede via UniFi Network no ServerWatch.

O objetivo e adicionar o UniFi como uma nova fonte de dados dentro da pagina
`Redes`, sem alterar o funcionamento atual do LinkProbe (WAN/links de
internet). Os dois cobrem coisas diferentes:

- **LinkProbe** (ja existente): saude do link de internet (WAN), latencia,
  perda, jitter, IP publico.
- **UniFi Network** (este documento): saude do Wi-Fi/LAN do cliente -
  Access Points, switches, clientes conectados, canal/interferencia, uplink
  dos dispositivos.

## Objetivos

- consultar um unico controlador UniFi Network multisite (o que ja existe no
  ambiente do MSP), onde cada **Site** UniFi corresponde a um cliente;
- listar Access Points, switches e gateways por site, com status,
  modelo, uptime, clientes conectados e versao de firmware;
- listar clientes sem fio (estações) conectados, com sinal, banda e uso;
- herdar automaticamente a empresa a partir do Site UniFi (mesmo padrao que
  ja funciona hoje para o Proxmox Backup Server: `namespace`/`site` -> nome
  da empresa, com vinculo manual para quem nao bater);
- exibir saude geral por site (WAN do proprio UniFi, se aplicavel, RF,
  dispositivos adotando/atualizando/offline);
- adicionar um seletor de provedor **acima do conteudo da pagina Redes**,
  no mesmo padrao ja implementado em `Backups` (segmentado, oculta
  automaticamente o que nao estiver configurado);
- manter o controle de acesso por empresa ja aplicado no ServerWatch;
- nao expor a credencial do controlador ao frontend, seguindo o mesmo
  padrao de seguranca usado no Proxmox Backup Server (fixacao de
  certificado/CA confiavel, chave somente leitura quando possivel,
  configuracao via tela de Administracao restrita a administradores).

## Decisao de arquitetura

Existem duas formas de integrar com UniFi:

1. **Controlador local/UniFi OS Console multisite** (recomendado para este
   caso) - um unico UDM/UDM-Pro, Cloud Gateway ou Cloud Key Gen2+ hospeda a
   aplicacao UniFi Network com varios **Sites** configurados dentro dele,
   cada Site representando um cliente. A API REST do proprio controlador
   expõe todos os sites a partir de uma unica credencial/chave.
2. **UniFi Site Manager (api.ui.com, cloud)** - API oficial mais nova da
   Ubiquiti para gestao multisite via nuvem (`UI.com`), pensada para quem
   gerencia consoles fisicamente separados. Tem cobertura de endpoints mais
   limitada hoje (hosts, sites, metricas de ISP) e exige que cada console
   esteja vinculado a uma conta Ubiquiti na nuvem.

Como o ambiente atual ja e **um controlador multisite proprio** (nao varios
consoles fisicos separados), a Fase 0 deste plano valida e implementa pela
**opcao 1 (API local do controlador)**. A opcao 2 fica registrada como
evolucao futura caso o MSP passe a administrar consoles de clientes que nao
estejam dentro do mesmo controlador.

O ServerWatch continuara responsavel por:

- executar a coleta periodica (polling, nao webhook - a API local do UniFi
  nao oferece webhooks nativos confiaveis para todos os modelos);
- normalizar os dados do controlador;
- aplicar regras de status;
- persistir o ultimo estado valido e o historico relevante;
- aplicar o escopo de empresas;
- apresentar os dados no frontend, com o mesmo seletor de provedor usado em
  Backups.

## Identificacao de sites e dispositivos

Assim como o Proxmox Backup Server usa `namespace` para identificar o
cliente, o UniFi usa **Site** (cada site tem um `name` interno curto, ex.
`default`, `cliente-a`, e um `desc` com nome de exibicao).

Chave recomendada para cada dispositivo monitorado:

```text
site_id (id interno do site no UniFi)
device_mac (identificador estavel do AP/switch/gateway)
```

Chave recomendada para cada cliente sem fio:

```text
site_id
client_mac
```

`device_mac`/`client_mac` sao estaveis mesmo se o dispositivo for renomeado,
diferente do `name`, que pode mudar.

## Modelo de dados proposto

Mesma logica ja usada no Proxmox Backup Server: persistir dentro do
documento de estado atual do MongoDB nesta primeira fase, sem nova colecao.

### Configuracao do controlador (unica, como o PBS)

```json
{
  "configured": true,
  "baseUrl": "https://unifi.exemplo.local",
  "apiKey": "valor-protegido",
  "verifyTls": true,
  "tlsFingerprint": "AA:BB:CC:DD",
  "lastSyncAt": null,
  "lastSyncStatus": "pending",
  "lastError": null
}
```

`apiKey` (ou usuario/senha local, se o controlador ainda nao suportar API
Key nativa) nunca e enviado ao frontend, apenas `configured: true/false` e a
origem (`environment` ou `configured`), no mesmo padrao do PBS.

### Site normalizado

```json
{
  "id": "unifi:5f2a...:site",
  "siteId": "5f2a...",
  "siteName": "cliente-a",
  "siteDesc": "Cliente A - Matriz",
  "groupId": "empresa-cliente-a",
  "deviceCount": 6,
  "clientCount": 42,
  "healthSummary": "ok"
}
```

`groupId` resolvido automaticamente por nome (`siteName`/`siteDesc` ->
empresa) com a mesma funcao de correspondencia (`normalizeMatchKey`) ja
usada no Proxmox, e com vinculo manual de fallback quando nao bater -
seguindo exatamente o padrao ja aprovado e em produçao.

### Dispositivo (AP/switch/gateway) normalizado

```json
{
  "id": "unifi:5f2a...:dc:9f:db:11:22:33",
  "siteId": "5f2a...",
  "groupId": "empresa-cliente-a",
  "mac": "dc:9f:db:11:22:33",
  "name": "AP-Recepcao",
  "model": "U6-Lite",
  "type": "uap",
  "state": "connected",
  "adopted": true,
  "upgradable": false,
  "uptimeSeconds": 432000,
  "clientCount": 14,
  "satisfaction": 98,
  "uplinkType": "wire",
  "uplinkName": "Switch-01",
  "firmwareVersion": "6.6.55",
  "lastSeenAt": "2026-06-22T18:00:00.000Z"
}
```

`type` mapeia os tipos do UniFi (`uap` = access point, `usw` = switch,
`ugw`/`udm` = gateway). `state` segue os codigos do proprio controlador
(0 = offline, 1 = connected, 4 = upgrading, 5 = provisioning/adopting, etc.;
os valores exatos devem ser confirmados na Fase 0).

### Cliente sem fio normalizado (opcional na primeira entrega)

```json
{
  "siteId": "5f2a...",
  "mac": "aa:bb:cc:dd:ee:ff",
  "hostname": "notebook-financeiro",
  "apMac": "dc:9f:db:11:22:33",
  "essid": "Cliente A - Corporativo",
  "signal": -58,
  "rxRateMbps": 866,
  "txRateMbps": 866,
  "uptimeSeconds": 3600
}
```

Este nivel de detalhe (lista de clientes individuais) e opcional para a
primeira entrega - o valor imediato esta em saber se os **APs** estao
saudaveis. Pode entrar como melhoria depois (Fase 5).

## Camada de provedores

Reaproveitar o mesmo padrao ja criado para backups
(`services/proxmoxBackup.js` + `routes/proxmoxBackups.js`), agora para rede:

```text
services/unifiNetwork.js
routes/unifiNetwork.js
```

Contrato sugerido (mesma forma do Proxmox):

```js
export async function fetchUnifiNetworkSummary(config) {}
export function emptyUnifiNetworkState() {}
export function unifiDeviceStatus(device) {}
export { normalizeMatchKey } from "./proxmoxBackup.js"; // reutilizar, nao duplicar
```

A funcao `normalizeMatchKey` (normalizacao de nome para correspondencia)
deve ser **reaproveitada** do modulo do Proxmox (ou extraida para um modulo
compartilhado `services/matching.js`) em vez de duplicada, ja que a logica e
identica.

## Endpoints externos consultados

O ambiente validado usa a API oficial local do UniFi Network 10.1.89:

```text
Base: https://CONTROLADOR:11443/proxy/network/integration
Header: X-API-KEY: <chave>

GET /v1/sites
GET /v1/sites/{siteId}/devices
GET /v1/sites/{siteId}/devices/{deviceId}/statistics/latest
GET /v1/sites/{siteId}/clients
```

Nao existe fallback para login, cookie de sessao ou endpoints legados.
Ambientes sem a API oficial devem permanecer como nao configurados.

## Autenticacao e seguranca

Mesmos requisitos ja aplicados ao Proxmox Backup Server:

- preferir API Key somente leitura quando o firmware suportar; caso
  contrario, usuario local dedicado com perfil **somente leitura**
  (`Read Only` no UniFi Network), nunca o admin principal;
- nunca enviar a credencial ao frontend; expor apenas `configured` e a
  origem (`environment`/`configured`);
- nunca gravar a credencial em log;
- validar certificado TLS por fingerprint fixado (pinning), igual ao PBS,
  ja que controladores UniFi tambem usam certificado autoassinado por
  padrao - **nao desabilitar `rejectUnauthorized` sem a checagem
  compensatoria de fingerprint**, mesma regra aplicada ao PBS;
- timeout e limite de resposta por chamada;
- registrar auditoria de criacao/alteracao/teste/remocao da credencial;
- bloquear acesso de usuarios nao administradores a tela de configuracao
  (igual ao item ja implementado para Proxmox/MSP: secao oculta e
  recolhida, visivel somente para `role: admin`).

## Regras de status

### Saudavel (online)

- dispositivo `adopted = true` e `state = connected`;
- sem alerta de firmware critico pendente;
- uplink presente (com fio ou malha) quando esperado.

### Atencao

- dispositivo `upgrading`/`provisioning` por tempo prolongado;
- `satisfaction` (indice de qualidade do proprio UniFi) abaixo de um limite
  configuravel (ex. < 80);
- numero de clientes muito acima da capacidade tipica do modelo (info,
  nao bloqueante).

### Erro (offline)

- `state` indica desconectado/offline;
- dispositivo nao reporta ha mais tempo que a janela esperada;
- site inteiro sem nenhum dispositivo respondendo (possível controlador ou
  rede do cliente fora do ar).

### Sem monitoramento

- site existente no UniFi mas sem empresa vinculada ainda (mesmo
  comportamento do "sem empresa" do Proxmox: aparece em uma lista separada
  para vinculo manual, nao conta como erro);
- dispositivo explicitamente desativado/ignorado pelo administrador.

### Sem dados (coleta)

- controlador nao configurado;
- credencial invalida;
- controlador inacessivel (rede/TLS);
- diferenciar sempre **"dispositivo com problema"** de **"coleta sem
  contato"**, mesma distincao ja aplicada ao Proxmox e aos probes.

## API interna do ServerWatch

Mesma forma das rotas de Proxmox, adaptada:

```text
GET  /api/unifi-network
POST /api/unifi-network/refresh
POST /api/unifi-network/link-site      { siteId, groupId }
POST /api/unifi-network/link-device    { siteId, mac, serverId }   (opcional)
```

Rotas de configuracao (somente admin), dentro de `/api/settings`, no mesmo
padrao ja criado para `cloudbackup` e `proxmox`:

```text
PUT /api/settings/unifi   { baseUrl, apiKey, tlsFingerprint }
```

Todas as respostas de leitura filtradas pelas empresas permitidas ao
usuario (`canAccessSection(user, "networks")`, reaproveitando o gate de
permissao por secao ja implementado).

## Interface

### Seletor de provedor em Redes

Replicar exatamente o componente ja construido para `Backups`:

```text
[Links e conectividade]   [UniFi Network]
```

Comportamento (igual ao de Backups):

- o seletor (`.provider-toggle`) so aparece quando **mais de um** provedor
  de rede estiver configurado (hoje: LinkProbe/MikroTik sempre disponivel +
  UniFi quando configurado);
- cada segmento (`.provider-segment`) fica oculto se aquele provedor nao
  estiver configurado, igual ao `backupProviderConfigured()`/
  `updateBackupProviderVisibility()` ja implementado;
- se nenhum provedor de UniFi estiver configurado, a area de UniFi nem
  aparece - a pagina Redes continua mostrando soh os links/LinkProbe, como
  hoje;
- view ativa persistida em `state.networkProvider` (mesmo padrao de
  `state.backupProvider`);
- view "Links e conectividade" preserva 100% do comportamento atual
  (nenhuma regressao no LinkProbe/MikroTik).

### Visao UniFi Network

Widgets principais (mesma estrutura do card de capacidade ja implementado
para o PBS):

- total de sites, total de APs, APs com problema, clientes conectados;
- capacidade/saude por site (cards agrupados por empresa, reaproveitando
  `.proxmox-groups-grid`/`.proxmox-group-card` generalizados para
  `.provider-groups-grid` compartilhado entre Proxmox e UniFi);
- lista de dispositivos por site com status, modelo, clientes conectados,
  uptime;
- secao "Sem empresa vinculada" com vinculo manual via `<select>`, mesmo
  padrao do Proxmox;
- filtro por status (Online / Atencao / Offline).

### Administracao (Configuracoes)

Adicionar ao MESMO bloco recolhivel `<details>` "Integracoes" (admin-only)
ja criado para MSP Cloud Backup e Proxmox Backup Server:

- URL do controlador UniFi;
- API Key (ou usuario/senha local, se aplicavel);
- fingerprint TLS;
- origem da configuracao (`environment`/`configurado`);
- botao de salvar (aciona sincronizacao imediata, mesmo padrao ja
  implementado).

## Sincronizacao

Fluxo recomendado (mesmo ciclo de 5 minutos ja usado para MSP e Proxmox):

1. autenticar (API Key ou login local, conforme detectado na Fase 0);
2. listar sites (`/api/self/sites`);
3. para cada site: listar dispositivos (`stat/device`) e saude
   (`stat/health`);
4. opcional (Fase 5): listar clientes sem fio (`stat/sta`);
5. resolver empresa por site (automatico por nome + vinculo manual);
6. calcular status por dispositivo;
7. persistir ultimo estado valido;
8. gerar eventos apenas em transicao de status;
9. atualizar frontend em tempo real (broadcast snapshot, mesmo mecanismo
   ja usado).

Aplicar:

- trava contra sincronizacoes simultaneas;
- timeout por chamada;
- cache do ultimo resultado valido (erro de coleta nao apaga o ultimo
  estado bom, mesma regra do Proxmox).

## Eventos e alertas

```text
unifi_device_offline
unifi_device_recovered
unifi_device_upgrading_stuck
unifi_site_unreachable
unifi_site_recovered
unifi_collection_lost
unifi_collection_recovered
```

Mesmas regras de nao duplicacao ja aplicadas a alertas existentes: abrir na
transicao, atualizar enquanto persistir, fechar na recuperacao.

## Fases de implementacao

### Fase 0 - Validacao tecnica

- confirmar versao da aplicacao UniFi Network e do UniFi OS;
- criar uma API Key oficial na pagina Integrations;
- testar `GET /proxy/network/integration/v1/sites` e capturar o formato
  real da resposta;
- testar dispositivos, clientes e estatisticas em pelo menos 2 sites reais;
- capturar o fingerprint TLS do controlador (mesmo procedimento usado para
  o PBS via `openssl s_client`);
- registrar amostras sanitizadas de dispositivo online, offline e
  adotando/atualizando.

Entrega: matriz de endpoints validados + amostras reais + fingerprint TLS.

### Fase 1 - Backend (servico + rotas)

- criar `services/unifiNetwork.js` (autenticacao, coleta, normalizacao,
  `unifiDeviceStatus`) e `routes/unifiNetwork.js`, no mesmo molde do
  Proxmox;
- extrair `normalizeMatchKey` para um modulo compartilhado, usado por
  Proxmox e UniFi (evitar duplicacao);
- adicionar `scopedUnifiNetwork(user)` com o mesmo gate de secao
  (`canAccessSection(user, "networks")`) e escopo por empresa;
- adicionar `unifiNetwork` ao `snapshot()`;
- adicionar `PUT /api/settings/unifi` ao `routes/settings.js`, reaproveitando
  o padrao de `normalizeProxmoxSettings`.

Entrega: dados reais do UniFi disponiveis via API interna, sem nada na
interface ainda.

### Fase 2 - Correspondencia e vinculo manual

- resolver empresa por nome do site (automatico) com fallback de vinculo
  manual (`group.unifiSiteId`, mesmo padrao de `group.proxmoxNamespace`);
- vinculo manual de dispositivo a servidor, se fizer sentido para o caso de
  uso (opcional - normalmente AP nao precisa virar "servidor").

Entrega: sites batendo automaticamente com empresas existentes, com tela
para resolver o que nao bateu.

### Fase 3 - Interface: seletor de provedor em Redes

- generalizar `.provider-toggle`/`.provider-segment`/
  `applyBackupProvider`/`updateBackupProviderVisibility` para um helper
  reutilizavel (`applyProviderView(scope, provider)`), usado tanto por
  Backups quanto por Redes - evitar duplicar a logica de
  mostrar/ocultar/persistir segmento;
- adicionar o seletor acima do conteudo atual de Redes;
- criar a visao UniFi (cards por empresa, lista de dispositivos, KPIs),
  reaproveitando os componentes visuais ja criados para o Proxmox.

Entrega: alternancia funcional entre "Links e conectividade" e
"UniFi Network", sem regressao no LinkProbe.

### Fase 4 - Configuracao administrativa

- adicionar o formulario UniFi ao bloco `<details>` "Integracoes" em
  Configuracoes, junto de MSP/Proxmox;
- testar troca de credencial em tempo real (sem precisar reiniciar o
  container).

Entrega: administrador configura/atualiza a credencial do UniFi pela
interface, igual ja funciona para MSP e Proxmox.

### Fase 5 - Clientes sem fio e alertas

- listar clientes conectados por AP (`stat/sta`);
- eventos de transicao de status com alerta;
- limites configuraveis (satisfaction minimo, tempo maximo em
  upgrading/provisioning).

Entrega: operacao diaria com visibilidade de clientes e alertas confiaveis.

## Testes obrigatorios

### Unitarios

- normalizacao de resposta do UniFi (device/site/health);
- calculo de status por dispositivo (online/atencao/offline);
- correspondencia automatica de site por nome + fallback manual;
- filtro por empresa permitida ao usuario;
- erro de coleta nao sobrescreve ultimo estado valido.

### Integracao

- API Key valida e invalida;
- fingerprint TLS correto e incorreto (deve rejeitar conexao);
- controlador UniFi OS Console vs. classico (deteccao automatica de path);
- site sem nenhum dispositivo;
- dispositivo offline ha mais tempo que a janela esperada;
- timeout do controlador.

### Interface

- seletor de provedor aparecendo somente quando ha mais de uma fonte
  configurada;
- area UniFi totalmente oculta quando nao configurado;
- usuario comum sem ver a secao de configuracao (admin-only);
- vinculo manual de site sem empresa;
- tema claro e escuro.

## Criterios de aceite

- o LinkProbe/MikroTik continuam funcionando sem nenhuma regressao;
- o administrador cadastra a credencial do UniFi pela tela de
  Configuracoes, sem precisar editar `.env` manualmente (mas `.env`
  continua funcionando e tendo prioridade, para portabilidade entre
  ambientes);
- os sites aparecem automaticamente vinculados a empresa certa na maioria
  dos casos, com vinculo manual para o restante;
- o seletor de provedor em Redes some quando o UniFi nao estiver
  configurado, e aparece quando estiver;
- usuarios comuns nunca veem a credencial nem a tela de configuracao da
  integracao;
- erro de coleta (controlador fora do ar) e visualmente diferente de
  dispositivo realmente offline.

## Riscos e mitigacoes

### Versoes diferentes de UniFi Network / UniFi OS

Mitigacao: validar `/api/self/sites` com fallback de path na Fase 0;
adaptador tolerante a campos ausentes; registrar a versao testada.

### Controlador com certificado autoassinado

Mitigacao: mesmo mecanismo de fixacao de fingerprint TLS ja usado no PBS;
nunca desabilitar verificacao sem essa checagem compensatoria.

### API Key nao suportada na versao instalada

Mitigacao: fallback para usuario local somente leitura dedicado +
sessao/CSRF; documentar exatamente qual metodo o ambiente usa.

### Volume de clientes sem fio (sites grandes)

Mitigacao: tornar a coleta de `stat/sta` opcional/configuravel (Fase 5);
focar a primeira entrega em dispositivos (APs/switches), que e o dado de
maior valor operacional.

### Duplicacao de logica com o modulo Proxmox

Mitigacao: extrair `normalizeMatchKey` e os componentes de UI
(`provider-toggle`, cards de grupo) para modulos compartilhados antes de
implementar UniFi, em vez de copiar e colar (ver Fase 1 e Fase 3).

## Ordem recomendada

1. Validar endpoints reais no controlador UniFi (Fase 0).
2. Construir o backend (servico + rotas + escopo por empresa).
3. Resolver correspondencia automatica de sites + vinculo manual.
4. Generalizar o seletor de provedor (reutilizado por Backups e Redes) e
   construir a tela UniFi.
5. Adicionar a configuracao administrativa em Configuracoes.
6. Adicionar clientes sem fio e alertas por ultimo.

## Referencias oficiais

- UniFi Network Application: https://www.ui.com/download/unifi
- UniFi API (comunidade, nao oficial mas amplamente usada como referencia):
  https://ubntwiki.com/products/software/unifi-controller/api
- UniFi Site Manager API (cloud, evolucao futura):
  https://developer.ui.com/site-manager-api/
