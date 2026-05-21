# Documentacao de implementacao - ServerWatch MVP

Este documento descreve o que e necessario para implantar e testar o ServerWatch MVP em rede local.

## Resposta curta

Para o MVP atual, voce nao precisa obrigatoriamente de um servidor Linux.

Ele pode rodar em:

- Windows 10/11
- Windows Server
- Linux
- Uma VM
- Um mini PC dedicado
- Um servidor fisico ja existente

Porem, para uso continuo em ambiente de empresa, o mais recomendado e usar um servidor Linux, porque ele costuma ser mais simples de manter ligado 24/7, automatizar, monitorar, atualizar e futuramente rodar com Docker, PostgreSQL e Nginx.

## O que voce precisa para o MVP atual

### Maquina central do ServerWatch

Uma maquina que fique ligada enquanto o monitoramento precisar funcionar.

Requisitos minimos sugeridos:

- CPU: 1 vCPU ou superior
- RAM: 1 GB minimo, 2 GB recomendado
- Disco: 1 GB livre para MVP, mais se guardar muito historico
- Sistema: Windows ou Linux
- Node.js 20 ou superior
- Acesso de rede aos servidores que serao monitorados

### Rede

A maquina central precisa conseguir pingar os servidores monitorados.

Checklist:

- O ServerWatch esta na mesma rede/VLAN dos servidores, ou possui rota ate eles.
- Firewall dos servidores permite ICMP Echo/Ping.
- Firewall da maquina do ServerWatch libera acesso de entrada na porta da aplicacao.
- O IP da maquina do ServerWatch deve ser fixo ou reservado no DHCP.

Porta usada pelo MVP:

```text
3000/TCP
```

Exemplo de acesso:

```text
http://IP-DO-SERVERWATCH:3000
```

## Como rodar o MVP

Na pasta do projeto:

```powershell
npm start
```

O terminal deve mostrar algo parecido com:

```text
ServerWatch MVP em execucao
Local: http://localhost:3000
LAN:   http://192.168.0.45:3000
```

Outros computadores da rede acessam pelo endereco `LAN`.

## Como rodar com Docker Compose

O projeto inclui `Dockerfile`, `docker-compose.yml` e `.dockerignore`.

Comando:

```bash
docker compose up -d --build
```

A aplicacao fica disponivel em:

```text
http://localhost:3000
```

Para alterar a porta exposta no host:

```bash
cp .env.example .env
```

Edite:

```text
SERVERWATCH_PORT=3000
```

O Compose usa um volume Docker para persistir dados:

```text
serverwatch_data:/app/data
```

Observacao sobre ping em container:

- O Compose adiciona `NET_RAW` para permitir ICMP/ping.
- Em ambientes mais restritivos, pode ser necessario ajustar politicas do host ou do runtime de container.

Health check:

```text
GET /health
```

## Implantacao em Windows

Para teste e MVP, Windows funciona bem.

Voce precisa:

- Instalar Node.js 20+
- Abrir a porta `3000/TCP` no Firewall do Windows
- Garantir que a maquina nao entre em suspensao
- Rodar o ServerWatch em uma janela de terminal ou configurar como servico

Comando para liberar a porta no Firewall do Windows, executado como Administrador:

```powershell
New-NetFirewallRule -DisplayName "ServerWatch MVP" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

Para uso continuo no Windows, o ideal e transformar o processo em servico usando uma ferramenta como NSSM, PM2 ou Task Scheduler.

## Implantacao em Linux

Linux e a recomendacao para rodar de forma permanente.

Distribuicoes sugeridas:

- Ubuntu Server 22.04 LTS ou 24.04 LTS
- Debian 12

Requisitos:

- Node.js 20+
- Porta `3000/TCP` liberada no firewall
- Permissao para executar `ping`

Comandos conceituais:

```bash
sudo apt update
sudo apt install -y nodejs npm
npm start
```

Em producao futura, o ideal sera usar:

- Docker Compose
- PostgreSQL
- Nginx como proxy reverso
- HTTPS com certificado TLS
- Servico systemd para iniciar automaticamente

## Dados e persistencia no MVP

O MVP atual guarda os dados em arquivo local:

```text
data/serverwatch.json
```

Esse arquivo contem:

- empresas/grupos cadastrados
- servidores cadastrados
- status atual
- historico de eventos
- alertas

Importante:

- Faca backup desse arquivo se estiver usando o MVP em ambiente real.
- Para producao, a proxima evolucao recomendada e migrar para SQLite ou PostgreSQL.

## Quando usar banco de dados

Use banco de dados quando precisar de:

- login de usuarios
- servidores separados por usuario ou equipe
- historico maior
- relatorios
- auditoria
- notificacoes por e-mail
- dashboards por grupo/cliente/organizacao

Sugestao de evolucao:

1. MVP local com JSON, como esta agora.
2. SQLite para instalacao simples em um unico servidor.
3. PostgreSQL para producao e multiusuario.

## Requisitos para login futuro

Para adicionar login e dados por usuario, sera necessario implementar:

- tabela de usuarios
- senha com hash seguro
- sessao ou JWT
- tela de login
- permissao por usuario ou organizacao
- associacao dos servidores ao usuario/organizacao

Estrutura futura sugerida:

```text
users
organizations
servers
status_events
alerts
user_settings
```

## Requisitos para e-mail futuro

Para alertas ou resumo diario por e-mail, sera necessario:

- servidor SMTP
- conta/remetente de e-mail
- configuracoes por usuario
- rotina agendada para envio diario

Variaveis futuras esperadas:

```text
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
SMTP_FROM
```

## Recomendacao de ambiente por fase

### Teste rapido

Use a propria maquina Windows.

Bom para:

- validar interface
- cadastrar alguns servidores
- testar ping
- ajustar requisitos

### Piloto em rede local

Use uma VM ou maquina dedicada.

Bom para:

- deixar ligado o dia todo
- permitir acesso de outros usuarios
- testar alertas reais

### Producao

Use um servidor Linux.

Recomendado:

- Ubuntu Server LTS
- Docker Compose
- PostgreSQL
- Nginx
- HTTPS
- backup automatico
- servico de inicializacao automatica

## Checklist de implantacao do MVP

- [ ] Escolher maquina central.
- [ ] Instalar Node.js 20+.
- [ ] Copiar o projeto ServerWatch.
- [ ] Rodar `npm start`.
- [ ] Abrir porta `3000/TCP` no firewall.
- [ ] Acessar pelo navegador usando o IP da LAN.
- [ ] Cadastrar empresas/grupos, se houver mais de uma empresa ou unidade.
- [ ] Cadastrar servidores.
- [ ] Associar cada servidor a uma empresa/grupo quando aplicavel.
- [ ] Conferir no Dashboard se os servidores aparecem agrupados por empresa.
- [ ] Confirmar que a maquina central consegue pingar cada servidor.
- [ ] Ativar notificacoes no navegador, se desejado.
- [ ] Fazer backup periodico de `data/serverwatch.json`.

## Resumo da recomendacao

Para agora: pode rodar no Windows onde ja esta funcionando.

Para um piloto mais serio: use uma VM ou maquina dedicada, Windows ou Linux.

Para producao: sim, recomendo um servidor Linux.
