# ServerWatch LinkProbe

LinkProbe e um agente especifico para monitorar links de internet de dentro para fora. Ele executa pings externos usando `source_ip` ou interface local, detecta o IP de saida com HTTP vinculado ao mesmo `source_ip` e envia o resultado ao ServerWatch em `POST /api/link-status`.

## Build

```bash
cd tools/linkprobe
go build -o linkprobe .
GOOS=windows GOARCH=amd64 go build -o linkprobe.exe .
GOOS=linux GOARCH=arm64 go build -o linkprobe-linux-arm64 .
```

O projeto usa apenas a biblioteca padrao do Go.

## Uso

```bash
./linkprobe --config config.json
./linkprobe --config config.json --once
```

O `--once` executa um ciclo unico e sai, util para validar roteamento.

## Configuracao

Copie `config.example.json` para `config.json`.

- `agent_id`: identificador unico do link no ServerWatch.
- `link_name`: nome amigavel exibido na tela de redes.
- `interface`: interface usada no Linux/macOS com `ping -I`.
- `source_ip`: IP local usado no Windows com `ping -S` e no HTTP de IP publico.
- `ping_targets`: 1 a 10 IPs externos.
- `ping_count`: pings por alvo.
- `ping_timeout`: timeout por ping em segundos.
- `check_interval`: intervalo entre ciclos.
- `online_threshold`: fracao minima de alvos respondendo para ONLINE.
- `ip_check_urls`: endpoints de fallback para detectar o IP de saida.
- `backend_url`: URL base do ServerWatch.
- `token`: token do Probe Collector/ServerWatch.
- `log_file`: vazio envia logs para stdout.

## Permissoes

No Linux, `ping` pode exigir permissao de raw socket dependendo da distribuicao. Use o `ping` do sistema com capability configurada ou rode o servico com permissao suficiente.

## systemd

```ini
[Unit]
Description=ServerWatch LinkProbe
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/opt/serverwatch-linkprobe/linkprobe --config /opt/serverwatch-linkprobe/config.json
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
```

## Windows com NSSM

```powershell
nssm install ServerWatchLinkProbe C:\ServerWatchLinkProbe\linkprobe.exe --config C:\ServerWatchLinkProbe\config.json
nssm start ServerWatchLinkProbe
```

## Roteamento necessario

O LinkProbe prende o teste no `source_ip`, mas quem garante que esse source sai pela WAN correta e o roteador/firewall.

### MikroTik RouterOS

Policy routing por mangle:

```routeros
/ip firewall mangle
add chain=prerouting src-address=192.168.10.50 action=mark-routing new-routing-mark=probe-link1 passthrough=yes comment="LinkProbe Link1"

/ip route
add dst-address=0.0.0.0/0 gateway=<WAN1-gateway> routing-mark=probe-link1
```

Alternativa simples para alvos fixos:

```routeros
/ip route
add dst-address=8.8.8.8/32 gateway=<WAN1-gateway>
add dst-address=1.1.1.1/32 gateway=<WAN1-gateway>
add dst-address=9.9.9.9/32 gateway=<WAN1-gateway>
add dst-address=208.67.222.222/32 gateway=<WAN1-gateway>
```

### pfSense / OPNsense

Crie uma regra Floating:

- Action: `Match`
- Interface: interface interna
- Source: `<source_ip>/32`
- Advanced Gateway: gateway do link testado

### Fortinet FortiGate

```fortigate
config router policy
    edit 1
        set comments "LinkProbe - Link WAN1"
        set input-device "internal"
        set src "192.168.10.50/32"
        set dst "0.0.0.0/0"
        set output-device "wan1"
        set gateway <IP-do-gateway-WAN1>
    next
end
```

Verificacao:

```fortigate
diagnose ip router policy list
```

## Exemplo de payload

```json
{
  "agent_id": "hcrv-vivo-wan1",
  "link_name": "Vivo Fibra - HCRV",
  "timestamp": "2026-06-04T14:30:00Z",
  "is_online": true,
  "success_rate": 0.833,
  "public_ip": "200.0.40.218",
  "ip_changed": false,
  "version": "1.0.0",
  "ping_results": [
    {
      "target": "8.8.8.8",
      "sent": 4,
      "received": 4,
      "lost_pct": 0,
      "avg_rtt_ms": 12.5,
      "min_rtt_ms": 10.1,
      "max_rtt_ms": 15.3,
      "reachable": true
    }
  ]
}
```
