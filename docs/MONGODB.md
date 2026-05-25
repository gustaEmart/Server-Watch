# MongoDB backend

O ServerWatch suporta duas formas de persistencia:

- `json`: padrao atual, usando `data/serverwatch.json`;
- `mongodb`: persistencia central em MongoDB.

## Configuracao

Variaveis:

```bash
SERVERWATCH_STORAGE=mongodb
MONGODB_URI=mongodb://127.0.0.1:27017/serverwatch
MONGODB_DB=serverwatch
```

Se `MONGODB_URI` estiver definido, a aplicacao usa MongoDB automaticamente, mesmo sem `SERVERWATCH_STORAGE`.

## Migracao do JSON para MongoDB

Sempre faca backup antes:

```bash
cp data/serverwatch.json data/serverwatch.backup-$(date +%F-%H%M%S).json
```

Depois rode:

```bash
MONGODB_URI="mongodb://127.0.0.1:27017/serverwatch" \
MONGODB_DB="serverwatch" \
npm run migrate:json-to-mongo
```

Na primeira fase, o ServerWatch salva o estado inteiro na colecao `app_state`, no documento `_id: serverwatch-state`. Essa abordagem permite migrar com baixo risco antes de separar colecoes como `servers`, `probes`, `events`, `alerts` e `users`.

## MongoDB local sem Docker

Quando Docker ou systemd nao estiverem disponiveis, o MongoDB pode rodar localmente pelo usuario:

```bash
tools/serverwatch/start-mongodb-local.sh
tools/serverwatch/start-serverwatch-mongodb.sh
```

Para iniciar apos reboot sem sudo, use o crontab do usuario:

```bash
@reboot /home/gustavo/apps/Server-Watch/tools/serverwatch/start-serverwatch-mongodb.sh
```

## Requisito de CPU

MongoDB 5.0+ exige suporte a AVX em x86_64. Em VMs QEMU/Proxmox, configure a CPU da VM como `host` ou use uma VM/host que exponha AVX. Sem AVX, o `mongod` pode falhar com `Illegal instruction`.
