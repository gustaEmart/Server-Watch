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

Para requisitos de implantacao, ambiente recomendado, portas, firewall e proximos passos de producao, veja `IMPLEMENTACAO.md`.

Para monitorar clientes em redes diferentes sem VPN, veja `docs/PROBE_COLLECTOR.md`.

Para usar MongoDB no backend, veja `docs/MONGODB.md`.

A aplicacao sobe em `0.0.0.0:3000`, entao pode ser acessada pela propria maquina em:

```text
http://localhost:3000
```

E por outros dispositivos na rede local usando o IP exibido no terminal:

```text
http://SEU-IP-DA-LAN:3000
```

## Como rodar com Docker

```bash
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

O Docker Compose cria um volume chamado `serverwatch_data` para persistir os dados.

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

## O que esta implementado

- Cadastro, edicao, ativacao e desativacao de servidores
- Exclusao logica de servidores, removendo o item do monitoramento sem apagar o historico interno
- Cadastro de empresas/grupos e associacao de servidores a uma empresa
- Dashboard geral com servidores agrupados por empresa e grafico de rosca por status
- Atalhos laterais para visualizar todos os servidores ou filtrar por empresa
- Monitoramento automatico via ping com intervalo por servidor
- Monitoramento direto pelo ServerWatch central ou por Probe Collector instalado na rede do cliente
- UI local para configurar o Probe Collector em `http://localhost:8777/setup`
- Instalador Windows `.exe` com UI para o Probe Collector
- Tela de login e cadastro de usuarios por administrador
- Tolerancia a falhas consecutivas antes de marcar offline
- Dashboard com filtros por status, ambiente e busca
- Atualizacao em tempo real via WebSocket
- Historico de transicoes online/offline
- Alertas internos e notificacoes do navegador para queda abrupta
- Persistencia local em `data/serverwatch.json` ou no caminho definido por `DATA_DIR`
- Dockerfile e Docker Compose para execucao em container

## Observacoes

- Em alguns ambientes Linux, ping ICMP pode exigir permissao elevada ou capability no binario de `ping`.
- O MVP usa armazenamento em JSON para simplificar a operacao local. Para producao, a arquitetura do documento recomenda PostgreSQL, autenticacao JWT e deploy via Docker Compose.
- Notificacoes do navegador precisam ser ativadas pelo botao `Notificacoes` na interface.
- Ideias para proximas versoes estao registradas em `ROADMAP.md`.
- A exportacao/importacao CSV esta registrada no roadmap como melhoria futura.
