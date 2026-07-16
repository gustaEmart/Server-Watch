# Auditoria de Segurança — ServerWatch

Revisão do código-fonte (`server.js`, `routes/`, `services/`, `public/app.js`, `probe/collector.js`, Docker) e da configuração de deploy, com foco no que precisa mudar antes do sistema virar um produto multi-cliente exposto na internet.

Não cobre pentest ativo (nenhum tráfego malicioso foi enviado ao servidor de produção) — é revisão estática de código e configuração.

---

## Resumo executivo

O sistema tem boas práticas pontuais (hash de senha com scrypt, proteção contra path traversal, WebSocket autenticado, Docker rodando como usuário não-root), mas tem **um problema arquitetural crítico de isolamento entre clientes** que precisa ser resolvido antes de expor o produto a múltiplos clientes: todos os probes de todos os clientes compartilham o mesmo token secreto, e esse token não restringe o acesso aos dados do próprio cliente. Além disso, o sistema roda inteiramente sem HTTPS, sem proteção contra força bruta no login, e com credenciais padrão fracas nos templates de configuração.

---

## 🔴 Crítico — corrigir antes de expor a clientes

### 1. Token de probe único e compartilhado entre TODOS os clientes, sem isolamento de dados

**Onde:** `server.js:3136-3144` (`getProbeToken`, `authorizeProbe`), `server.js:3982-4040` (`/api/probe/targets`, `/api/probe/results`)

Existe **um único token secreto** (`state.settings.probeToken` ou `SERVERWATCH_PROBE_TOKEN`) usado por **todos os probes de todos os clientes** para autenticar na API central. Esse token fica gravado em texto puro em `C:\ProgramData\ServerWatchProbe\config.json` em **cada máquina monitorada, de cada cliente**.

Qualquer pessoa com acesso a esse arquivo em **um único servidor de um único cliente** (acesso físico, RDP comprometido, backup vazado, etc.) obtém um token que:

- Autentica na API de **qualquer** probeId, de **qualquer** cliente (`/api/probe/targets?probeId=X` aceita qualquer `X`, sem validar que o token pertence àquele probe específico).
- Permite **enumerar infraestrutura de outros clientes**: nomes de servidor, hostnames e IPs monitorados (`server.js:4001-4007`).
- Permite **submeter resultados falsos** para servidores de outros clientes. A verificação de "mesma rede" (`sameProbeLan`, `server.js:2746-2752`) usa o campo `addresses` **auto-declarado pelo probe no registro**, não o IP real da conexão TCP (`req.socket.remoteAddress` só é usado como um dos três valores comparados, com `.some()` — basta declarar um IP falso na mesma faixa /24 do alvo para passar). Isso permite injetar status falso (ex.: marcar servidor de outro cliente como "online" para esconder uma queda real, ou como "offline" para gerar alarme falso).
- Dá acesso às rotas de download que dependem de `allowProbeToken: true` (`collector.js`, instaladores, runtime Node.js).

**Impacto:** comprometer um único endpoint de um único cliente pode afetar a integridade do monitoramento de todos os outros clientes na mesma instância.

**Recomendação:** gerar um token único por probe (ou por cliente/empresa) no momento do cadastro, validar que o token apresentado corresponde exatamente ao `probeId`/tenant sendo acessado, e nunca aceitar `addresses` auto-declaradas como prova de identidade — usar `req.socket.remoteAddress` como única fonte de verdade para verificação de rede.

### 2. Sistema roda inteiramente sobre HTTP, sem TLS

**Onde:** `docker-compose.yml:29-31`, ausência de qualquer configuração de reverse proxy/TLS no repositório

Não existe HTTPS em nenhuma camada — nem no Node.js, nem em proxy reverso (não há Nginx/Traefik/Caddy no `docker-compose.yml`). Login, cookie de sessão, o token de probe único (item 1) e todos os dados de monitoramento trafegam em texto puro. Qualquer um na mesma rede (Wi-Fi público, ISP, MITM) pode capturar credenciais e o token de probe.

**Recomendação:** TLS obrigatório antes de expor a clientes — reverse proxy (Caddy/Traefik/Nginx) com certificado válido (Let's Encrypt), redirecionamento forçado de HTTP para HTTPS, e cookie de sessão com flag `Secure`.

### 3. Credenciais padrão fracas e previsíveis

**Onde:** `docker-compose.yml:15,18,55`, `.env.example`, `server.js:148-149`

- `SERVERWATCH_ADMIN_PASSWORD` default: `admin123`
- `MONGODB_URI`/`MONGO_INITDB_ROOT_PASSWORD` default: `troque-essa-senha` (literalmente "troque essa senha")

Se um novo deploy for feito sem sobrescrever essas variáveis (cenário provável ao entregar o produto para revenda/instalação por terceiros), o admin e o MongoDB ficam com credenciais públicas e previsíveis, exatamente o tipo de coisa que scanners automatizados (Shodan, etc.) encontram e exploram em massa.

**Recomendação:** o app deve **recusar iniciar** (ou forçar troca obrigatória) se as variáveis de senha estiverem ausentes/com o valor padrão em `NODE_ENV=production`. Nunca versionar um valor de senha "padrão" que pareça uma senha real.

---

## 🟠 Alto

### 4. Sem rate limiting / proteção contra força bruta no login

**Onde:** `server.js:3903-3919` (`POST /api/auth/login`)

Não há limite de tentativas, atraso progressivo, nem bloqueio de conta. Um atacante pode tentar credenciais ilimitadamente contra `/api/auth/login`. Combinado com o item 3 (senha padrão previsível), isso facilita takeover de conta admin em instalações não endurecidas.

**Recomendação:** rate limiting por IP e por conta (ex.: exponential backoff, bloqueio temporário após N tentativas), e considerar 2FA para contas admin.

### 5. Corpo de requisição sem limite de tamanho (DoS)

**Onde:** `services/http.js:1-7` (`readBody`)

```js
export async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  ...
```

Nenhum limite de tamanho antes de acumular tudo em memória e rodar `JSON.parse`. Uma requisição com corpo gigante (ou muitas requisições simultâneas) pode esgotar a memória do processo. Isso vale tanto para rotas autenticadas quanto para as rotas de probe (`/api/probe/results`, que aceitam POST sem sessão, só com o token compartilhado).

**Recomendação:** impor um limite de tamanho (ex.: 1–5MB dependendo da rota) e abortar a conexão se excedido, antes de acumular o buffer inteiro.

### 6. Nenhum cabeçalho de segurança HTTP

**Onde:** todas as respostas (`services/http.js`, `routes/static.js`)

Não há `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options: nosniff`, nem `Strict-Transport-Security`. Isso deixa o painel vulnerável a clickjacking (carregar o dashboard dentro de um `<iframe>` malicioso) e reduz a defesa em profundidade contra XSS caso algum ponto de escape seja esquecido no futuro.

**Recomendação:** adicionar esses cabeçalhos globalmente na resposta HTTP (CSP restritiva, `X-Frame-Options: DENY`, `nosniff`, HSTS assim que HTTPS estiver ativo).

---

## 🟡 Médio

### 7. Comparação do token de probe não é resistente a timing attack

**Onde:** `server.js:3143-3144`

```js
return (token && token === getProbeToken()) || (probeTokenHeader && probeTokenHeader === getProbeToken());
```

Comparação direta de string (`===`) vaza informação por tempo de execução, permitindo em teoria adivinhar o token caractere a caractere. Dado que esse token já é criticamente sensível (item 1), vale usar `timingSafeEqual` (já importado e usado corretamente em `services/auth.js` para senha) também aqui.

### 8. Sessão WebSocket não revalida após logout/expiração

**Onde:** `ws/handler.js:25-44`

A autenticação do WebSocket só é checada no handshake (`handleUpgrade`). Depois disso, `broadcast()` busca o usuário por `userId` (`getFreshUser`), mas não valida se a sessão específica ainda existe/não expirou. Se um usuário faz logout mas a aba do navegador continua aberta, a conexão WS pode continuar recebendo atualizações em tempo real até ser fechada manualmente.

**Recomendação:** verificar a sessão (não só o userId) a cada broadcast, ou fechar ativamente os sockets associados a um token quando a sessão for revogada/expirar.

### 9. Timing side-channel para enumeração de e-mail no login

**Onde:** `server.js:3903-3910`

Login com e-mail inexistente retorna rápido (sem rodar scrypt); login com e-mail existente e senha errada roda `scryptSync` (deliberadamente lento) antes de responder. A diferença de tempo permite inferir quais e-mails têm conta cadastrada.

**Recomendação:** rodar um hash "dummy" com custo equivalente mesmo quando o usuário não existe, para igualar o tempo de resposta.

### 10. `.env` não está no `.gitignore`

**Onde:** `.gitignore`

Só `.env.example` é ignorado implicitamente por não existir um `.env` real; mas `.env` (o arquivo real com segredos) não está listado no `.gitignore`. Hoje não há nenhum `.env` real commitado (verificado no histórico do git), mas é um acidente esperando para acontecer.

**Recomendação:** adicionar `.env` e variantes (`.env.local`, `.env.*.local`) ao `.gitignore`.

---

## 🟢 Baixo / hardening

- **`routes/static.js:30`** — a checagem de path traversal (`filePath.startsWith(publicDir)`) é efetiva, mas tecnicamente vulnerável a bypass via diretório irmão com prefixo igual (ex.: `publicDir` = `/app/public` também "bate" com `/app/public-evil`). Baixíssimo risco aqui porque não existe esse diretório irmão, mas o padrão correto é comparar com separador: `filePath.startsWith(publicDir + sep)`.
- **Conta admin com `mustChangePassword: true`** força troca no primeiro login — bom, mas a conta fica ativa com a senha padrão até alguém logar. Considerar gerar uma senha aleatória no primeiro boot em vez de um valor fixo conhecido (`admin123`), publicada só nos logs de inicialização.
- **`npm audit`**: nenhuma vulnerabilidade conhecida nas dependências atuais (`mongodb` é a única dependência de produção — superfície de supply chain pequena, o que é positivo).

---

## ✅ O que já está bem feito

- Hash de senha com `scrypt` + `timingSafeEqual` para comparação (`services/auth.js`).
- Cookie de sessão com `HttpOnly` e `SameSite=Lax` (falta só `Secure`, que depende do item 2/TLS).
- Proteção contra path traversal nos arquivos estáticos.
- `spawn()` usado com `shell: false` e argumentos em array (não string concatenada) em todo lugar que executa comandos externos (ping, PowerShell) — evita injeção de shell.
- Escaping de HTML (`escapeHtml()`) aplicado de forma consistente nos templates do frontend — não encontrei pontos óbvios de XSS armazenado.
- WebSocket exige sessão válida no handshake e aplica filtro por usuário/tenant nos broadcasts.
- Rotas administrativas (`/api/users/*`) corretamente protegidas por `requireAdmin`.
- Docker roda como usuário `node` (não root), superfície de dependências mínima (só `mongodb` como dependência de produção, zero vulnerabilidades conhecidas via `npm audit`).
- Fingerprint de certificado TLS fixado (`checkServerIdentity`) nas integrações com Proxmox Backup Server e UniFi — evita MITM nessas chamadas de saída.

---

## Ordem recomendada de correção

1. **Isolamento por token de probe** (item 1) — é o único item que afeta diretamente a segurança entre clientes diferentes; bloqueante para modelo multi-tenant.
2. **TLS obrigatório** (item 2) — bloqueante para qualquer exposição pública.
3. **Credenciais padrão + rate limiting de login** (itens 3 e 4) — bloqueantes antes de qualquer deploy que terceiros possam repetir sem supervisão.
4. Cabeçalhos de segurança, limite de corpo de requisição, timing-safe compare (itens 5, 6, 7) — endurecimento de defesa em profundidade, fazer antes do lançamento mas não bloqueiam um piloto controlado.
5. Itens médios/baixos restantes — podem entrar no roadmap pós-lançamento.
