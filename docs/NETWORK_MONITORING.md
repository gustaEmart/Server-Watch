# Monitoramento de redes e links

Este documento define o plano inicial para adicionar ao ServerWatch uma area separada de monitoramento de redes, links de internet e equipamentos como MikroTik, pfSense, Fortigate e roteadores genericos.

## Objetivo

Criar uma pagina `Redes` separada do dashboard de servidores, focada em:

- status dos links de internet por cliente;
- latencia, perda de pacotes e jitter;
- quedas e recuperacoes de links;
- saude basica do roteador/firewall;
- descoberta futura de interfaces via SNMP;
- suporte a multiplos fabricantes sem prender o sistema a uma API especifica.

## Principio de arquitetura

A coleta deve acontecer preferencialmente pelo Probe Collector dentro da rede do cliente.

Motivos:

- o ServerWatch central pode estar fora da rede do cliente;
- muitos roteadores/firewalls nao devem ficar expostos na internet;
- SNMP e APIs de roteadores normalmente ficam restritos a LAN/VPN;
- o probe ja resolve o problema de alcance local.

O backend central deve apenas orquestrar configuracoes, receber resultados e exibir historico.

## Fase 1 - Links por probe e ping

Primeira entrega recomendada, antes de SNMP.

### Entidades

#### Dispositivo de rede

Representa roteador, firewall ou switch gerenciavel.

Campos sugeridos:

```text
id
name
company_id
vendor
model
management_ip
probe_id
environment
tags
notes
is_active
created_at
updated_at
```

Valores iniciais para `vendor`:

```text
mikrotik
pfsense
fortigate
generic
other
```

#### Link de rede

Representa um link de internet, MPLS, VPN ou circuito monitorado.

Campos sugeridos:

```text
id
network_device_id
company_id
name
provider
link_type
interface_name
target_host
expected_public_ip
contracted_download_mbps
contracted_upload_mbps
probe_id
check_interval_seconds
failure_threshold
degraded_latency_ms
degraded_packet_loss_percent
is_active
created_at
updated_at
```

Valores iniciais para `link_type`:

```text
internet
mpls
vpn
radio
fiber
cellular
other
```

#### Resultado de checagem de link

Estado atual e historico recente.

Campos sugeridos:

```text
id
link_id
checked_at
status
latency_ms
packet_loss_percent
jitter_ms
public_ip
probe_id
error
raw
```

Valores de `status`:

```text
online
degraded
offline
unknown
paused
probe_unreachable
```

## Criterio inicial de status

### Online

- alvo respondeu;
- perda abaixo do limite;
- latencia abaixo do limite.

### Degradado

- alvo respondeu, mas com latencia acima do limite; ou
- perda de pacotes acima do limite; ou
- jitter acima do limite.

### Offline

- alvo nao respondeu apos 3 pings consecutivos.
- o padrao inicial para links deve ser uma checagem a cada 10 segundos.
- com o padrao `10s x 3 falhas`, um link cai para `offline` apos aproximadamente 30 segundos sem resposta.

### Probe sem contato

- o probe responsavel pelo link nao enviou resultados dentro do limite esperado.
- neste caso o link nao deve virar automaticamente `offline`.
- a UI deve diferenciar `link offline` de `probe sem contato`.

## Coleta pelo Probe Collector

O probe deve receber do backend uma lista de links que ele deve testar.

Fluxo:

1. Probe inicia e se registra.
2. Probe busca configuracoes pendentes:

```text
GET /api/probe/config
```

3. Backend retorna servidores e links atribuIds ao probe.
4. Probe executa checagens locais.
5. Probe envia resultados junto dos resultados normais de servidores:

```text
POST /api/probe/results
```

Payload sugerido:

```json
{
  "probeId": "cliente-acme",
  "collectedAt": "2026-06-03T12:00:00.000Z",
  "links": [
    {
      "linkId": "link-vivo-fibra",
      "targetHost": "1.1.1.1",
      "status": "online",
      "latencyMs": 12,
      "packetLossPercent": 0,
      "jitterMs": 2,
      "publicIp": "203.0.113.10"
    }
  ]
}
```

## Pagina Redes

Rota sugerida:

```text
/networks
```

Subpaginas futuras:

```text
/networks/devices
/networks/links
/networks/alerts
/networks/:id
```

### Dashboard da pagina

Cards principais:

- links online;
- links degradados;
- links offline;
- clientes com falha de internet;
- maior latencia atual;
- perdas nas ultimas 24h.

Graficos:

- falhas por hora nas ultimas 24h;
- latencia media por link;
- perda de pacotes por link;
- disponibilidade por operadora.

### Lista de links

Colunas recomendadas:

```text
Empresa
Link
Operadora
Dispositivo
Interface
Status
Latencia
Perda
Ultima checagem
Probe
```

### Detalhe do link

Informacoes recomendadas:

- status atual;
- alvo monitorado;
- operadora;
- interface;
- IP publico atual;
- IP publico esperado;
- latencia 24h;
- perda 24h;
- quedas recentes;
- probe responsavel;
- eventos e alertas.

## Fase 2 - SNMP generico

Depois da Fase 1, adicionar SNMP como metodo opcional.

SNMP deve ser executado pelo probe, nao pelo backend central.

Coletas iniciais:

- interfaces disponiveis;
- status da interface: up/down;
- trafego RX/TX;
- erros e descartes;
- uptime do equipamento;
- CPU e memoria quando disponivel;
- nome/modelo quando disponivel.

### Configuracao SNMP

Campos sugeridos no dispositivo:

```text
snmp_enabled
snmp_version
snmp_host
snmp_port
snmp_community
snmp_username
snmp_auth_protocol
snmp_auth_password
snmp_priv_protocol
snmp_priv_password
```

Observacao:

- SNMPv2c e simples, mas menos seguro.
- SNMPv3 deve ser suportado no futuro para ambientes mais exigentes.
- Credenciais devem ser armazenadas de forma protegida quando o sistema evoluir para criptografia de segredos.

## Fase 3 - Templates por fabricante

Criar templates para melhorar a experiencia por fabricante, mas sem tornar isso obrigatorio.

### MikroTik

Prioridade alta por ser comum nos clientes.

Opcoes:

- SNMP para interfaces e trafego;
- RouterOS API em fase futura para dados mais ricos.

Possiveis dados:

- interfaces WAN;
- rotas default;
- PPPoE status;
- DHCP client status;
- trafego por interface;
- uptime e versao RouterOS.

### pfSense

Prioridade media.

Opcoes:

- SNMP primeiro;
- API apenas se o ambiente ja tiver plugin adequado.

Possiveis dados:

- interfaces WAN;
- gateways;
- status de VPN;
- trafego;
- perda/latencia de gateway.

### Fortigate

Prioridade media.

Opcoes:

- SNMP primeiro;
- API REST apenas em fase futura.

Possiveis dados:

- interfaces WAN;
- SD-WAN health quando disponivel;
- VPN status;
- trafego;
- CPU/memoria.

## Backend

Endpoints iniciais sugeridos:

```text
GET    /api/network/devices
POST   /api/network/devices
PUT    /api/network/devices/:id
DELETE /api/network/devices/:id

GET    /api/network/links
POST   /api/network/links
PUT    /api/network/links/:id
DELETE /api/network/links/:id

GET    /api/network/events
POST   /api/probe/results
GET    /api/probe/targets
```

Regras:

- usuario comum so deve ver empresas permitidas;
- somente administrador deve cadastrar dispositivos, links, credenciais e probes;
- resultados de probe devem exigir token valido;
- links com probe sem contato nao devem ser marcados automaticamente como offline.

## MongoDB

Para deploy novo em Docker, criar colecoes proprias em MongoDB.

Colecoes sugeridas:

```text
network_devices
network_links
network_link_status
network_link_events
network_snmp_snapshots
```

Indices recomendados:

```text
network_devices.company_id
network_devices.probe_id
network_links.company_id
network_links.probe_id
network_links.network_device_id
network_link_status.link_id
network_link_status.checked_at
network_link_events.company_id
network_link_events.link_id
network_link_events.created_at
```

Retencao inicial:

- manter status detalhado por 30 dias;
- manter eventos agregados por 180 dias;
- manter estado atual sem expiracao.

## Docker

Antes de transferir o sistema para outro servidor, garantir:

- Dockerfile copiando `routes`, `services`, `ws`, `probe`, `scripts` e `tools/probe/install-linux.sh`;
- `docker-compose.yml` subindo ServerWatch e MongoDB;
- `cap_add: NET_RAW` mantido para ping dentro do container central quando necessario;
- pasta `downloads/` montada em `/app/downloads`;
- MongoDB como persistencia padrao para deploy novo;
- variaveis no `.env` para admin inicial e token dos probes.

Para a Fase 1, a imagem atual precisa apenas de:

- Node.js 20;
- `iputils` para ping;
- acesso HTTP/WebSocket entre probes e ServerWatch;
- MongoDB.

Para a Fase 2 com SNMP, avaliar uma destas opcoes:

- biblioteca Node.js para SNMP dentro do probe; ou
- binarios `snmp`/`snmpwalk` instalados no ambiente do probe.

Recomendacao:

- preferir biblioteca Node.js no probe para manter o instalador mais controlado;
- evitar exigir pacotes extras nos clientes na primeira versao.

## Ordem de implementacao recomendada

1. Criar modelos/estado de `network_devices` e `network_links`.
2. Criar rotas REST de cadastro e consulta.
3. Criar pagina `/networks` com lista e cards simples.
4. Expandir configuracao enviada ao probe.
5. Implementar checagem de links por ping no probe.
6. Receber resultados de rede em `/api/probe/results`.
7. Gerar eventos e alertas para link offline/degradado/recuperado.
8. Criar graficos 24h na pagina Redes.
9. Validar tudo em Docker com MongoDB.
10. So depois iniciar SNMP generico.

## Fora do escopo inicial

- configuracao automatica de MikroTik/pfSense/Fortigate;
- alteracao de rotas/firewall;
- gerencia de VPN;
- descoberta automatica completa;
- API especifica por fabricante;
- coleta SNMPv3 completa com criptografia de segredos.
