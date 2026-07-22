# ServerWatch MVP

MVP local do ServerWatch para monitoramento de disponibilidade por ping ICMP, com API HTTP, WebSocket, dashboard em tempo real, historico e notificacoes no navegador.

## Requisitos

- Node.js 20 ou superior
- Permissao do sistema para executar `ping`

## Como rodar

```bash
npm start
```

No primeiro start, se ainda nao existir usuario cadastrado, o sistema cria um administrador inicial:

```text
E-mail: admin@serverwatch.local
Senha: admin123
```

Para trocar esses valores antes da primeira execucao, defina `SERVERWATCH_ADMIN_EMAIL` e `SERVERWATCH_ADMIN_PASSWORD`.

Importante: quando o administrador inicial for criado automaticamente, o primeiro login exigira a troca imediata da senha antes de liberar o dashboard.

Para requisitos de implantacao, ambiente recomendado, portas, firewall e proximos passos de producao, veja `IMPLEMENTACAO.md`.

Para monitorar clientes em redes diferentes sem VPN, veja `docs/PROBE_COLLECTOR.md`.

Para planejar monitoramento de links, roteadores e firewalls, veja `docs/NETWORK_MONITORING.md`.

Para usar MongoDB no backend, veja `docs/MONGODB.md`.

Para o plano de integracao com Proxmox VE e Proxmox Backup Server, veja
`docs/PROXMOX_BACKUP_SERVER.md`.

A aplicacao sobe em `0.0.0.0:3000`, entao pode ser acessada pela propria maquina em:

```text
http://localhost:3000
```

E por outros dispositivos na rede local usando o IP exibido no terminal:

```text
http://SEU-IP-DA-LAN:3000
```

## Como rodar com Docker

Para um servidor novo, use o Docker Compose. Ele sobe o ServerWatch e um MongoDB local em containers separados:

```bash
cp .env.example .env
docker compose up -d --build
```

A aplicacao ficara disponivel em:

```text
http://localhost:3000
```

Para alterar a porta externa, copie `.env.example` para `.env` e ajuste:

```text
SERVERWATCH_PORT=3000
```

Antes de expor fora da rede local, ajuste no `.env` pelo menos:

```text
MONGO_INITDB_ROOT_PASSWORD=uma-senha-forte
MONGODB_URI=mongodb://serverwatch:uma-senha-forte@mongodb:27017/serverwatch?authSource=admin
SERVERWATCH_ADMIN_EMAIL=seu-email
SERVERWATCH_ADMIN_PASSWORD=uma-senha-inicial-forte
SERVERWATCH_PROBE_TOKEN=um-token-forte-para-os-probes
```

O Compose cria os volumes `serverwatch_data`, `mongodb_data` e `serverwatch_db_backups`. Em deploys novos, os dados da aplicacao ficam no MongoDB. A pasta local `downloads/` e montada em `/app/downloads` para servir artefatos grandes do Probe Collector, como o instalador Windows e runtimes Node.js, sem precisar rebuildar a imagem. O volume `serverwatch_db_backups` guarda archives compactados criados pela rotina administrativa de backup do MongoDB; veja `docs/DATABASE_BACKUPS.md`.

Comandos uteis:

```bash
docker compose ps
docker compose logs -f serverwatch
docker compose logs -f mongodb
```

## Como rodar no Linux com systemd

Em Ubuntu Server ou Debian com Node.js 20+ instalado:

```bash
sudo bash tools/serverwatch/install-linux-service.sh
```

Por padrao, o instalador copia a aplicacao para `/opt/serverwatch`, guarda dados em `/var/lib/serverwatch` e cria o servico `serverwatch`.

Variaveis aceitas pelo instalador:

```bash
SERVERWATCH_PORT=3000 SERVERWATCH_DATA_DIR=/var/lib/serverwatch sudo -E bash tools/serverwatch/install-linux-service.sh
```

Comandos uteis:

```bash
sudo systemctl status serverwatch
sudo journalctl -u serverwatch -f
```

## Health check

```text
GET /health
```

Resposta esperada:

```json
{
  "status": "ok",
  "service": "serverwatch"
}
```

## Versoes e historico

O historico de recursos, correcoes e versoes estaveis fica centralizado em `CHANGELOG.md`.

## Observacoes

- Em alguns ambientes Linux, ping ICMP pode exigir permissao elevada ou capability no binario de `ping`.
- O MVP usa armazenamento em JSON para simplificar a operacao local. Para producao, a arquitetura do documento recomenda PostgreSQL, autenticacao JWT e deploy via Docker Compose.
- Notificacoes do navegador precisam ser ativadas pelo botao `Notificacoes` na interface.
- Ideias para proximas versoes estao registradas em `ROADMAP.md`.
- A exportacao/importacao CSV esta registrada no roadmap como melhoria futura.
