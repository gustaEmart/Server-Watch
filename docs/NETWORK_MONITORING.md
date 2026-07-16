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

A coleta de links deve acontecer preferencialmente pelo **LinkProbe** dentro da rede do cliente, com uma instancia por link/WAN quando for necessario determinar exatamente qual saida esta ativa.

Motivos:

- o ServerWatch central pode estar fora da rede do cliente;
- muitos roteadores/firewalls nao devem ficar expostos na internet;
- SNMP e APIs de roteadores normalmente ficam restritos a LAN/VPN;
- o teste de dentro para fora permite checar alvos externos reais do ponto de vista do cliente;
- o roteador/firewall pode aplicar policy routing para garantir que os alvos de cada instancia saiam pelo link correto.

O backend central deve apenas orquestrar configuracoes, receber resultados e exibir historico.

## Fase atual - LinkProbe de dentro para fora

O LinkProbe fica em `tools/linkprobe` e envia resultados para:

```text
POST /api/link-status
Authorization: Bearer <token-do-probe>
```

Fluxo recomendado:

1. Definir uma lista de alvos externos para cada link monitorado, evitando reaproveitar os mesmos alvos em links diferentes.
2. Configurar policy routing no MikroTik, pfSense/OPNsense ou Fortigate para que esses destinos saiam pela WAN correta.
3. Rodar uma instancia do LinkProbe por link, cada uma com seu `agent_id`, `link_name` e lista de `ping_targets`.
4. O LinkProbe pinga alvos externos, observa o IP publico como diagnostico e envia o payload para o ServerWatch.
5. O ServerWatch cria ou atualiza automaticamente o link com base no `agent_id`.

Este modelo substitui a tentativa anterior de descobrir o link real apenas a partir de pings feitos pelo Probe Collector contra gateways/IPs publicos. O cadastro antigo continua existindo para compatibilidade, mas a forma mais confiavel para WAN e o LinkProbe.

Exemplo de payload recebido pelo backend:

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

### Interpretacao no ServerWatch

- `agent_id` identifica o link e evita depender de cadastro manual previo.
- `is_online=false` marca o link como offline.
- `success_rate` abaixo de `1.0`, mas acima do threshold do agente, pode aparecer como degradado.
- `public_ip` vira o IP de saida observado.
- `ip_changed=true` gera evento de rede para alertar troca de saida.
- `ping_results` alimenta os cards de alvos externos testados.

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
target_hosts
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

- pelo menos um alvo respondeu;
- perda abaixo do limite;
- latencia abaixo do limite.

### Degradado

- alvo respondeu, mas com latencia acima do limite; ou
- perda de pacotes acima do limite; ou
- jitter acima do limite.

### Offline

- nenhum alvo respondeu apos 3 ciclos consecutivos.
- o padrao inicial para links deve ser uma checagem a cada 10 segundos.
- com o padrao `10s x 3 falhas`, um link cai para `offline` apos aproximadamente 30 segundos sem resposta.

## Multiplos IPs por link

Um link pode ter mais de um IP/alvo configurado.

Uso esperado:

- cliente com dois IPs publicos possiveis;
- failover onde apenas um IP responde no momento;
- roteador/firewall com mais de um endpoint publico;
- identificacao rapida de qual IP esta ativo.

Regra inicial:

- o probe ou o ServerWatch testa todos os IPs cadastrados;
- se qualquer IP responder, o link fica `online`;
- o probe tenta descobrir o IP publico de saida da rede;
- se o IP publico observado bater com um alvo cadastrado, este alvo vira `activeTargetHost` com `activeDetection = egress_ip`;
- se o alvo tiver mascara configurada, por exemplo `/30`, o probe compara o IP publico observado com o gateway dentro desta sub-rede;
- se apenas um gateway/alvo responder, este alvo vira `activeTargetHost` com `activeDetection = single_reachable`;
- se mais de um alvo responder e nao houver correspondencia com o IP publico de saida, o alvo com menor latencia vira `activeTargetHost` com `activeDetection = ping_best`;
- se nenhum IP responder em 3 ciclos consecutivos, o link vira `offline`.
- jitter nao deve ser calculado comparando gateways diferentes; em links com multiplos alvos, latencia/perda continuam validas, mas jitter e ignorado para evitar degradacao falsa.

Observacao operacional:

- pingar o IP publico configurado na propria interface do firewall pode continuar respondendo mesmo quando o link esta fora do SD-WAN ou com SLA degradado;
- para validar queda real do link, prefira usar o gateway do provedor, um alvo SLA externo forcado pela interface, ou uma integracao SNMP/API do roteador/firewall.

Formato do cadastro na UI:

- cada alvo possui campos separados de `Nome do link` e `IP monitorado`;
- cada alvo pode receber uma mascara opcional, como `/30`, `/29` ou `/28`, para associar o IP publico de saida ao gateway do link;
- o botao `+` adiciona novos alvos ate o limite de 10;
- o botao `-` remove apenas o alvo daquela linha;
- o primeiro alvo permanece obrigatorio e nao pode ser removido;
- dados antigos em texto continuam validos para compatibilidade.

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

## Solucao de problemas - Network Probe (SNMP)

### O dispositivo detectado automaticamente nao e o equipamento certo (gateway padrao != IP do roteador SNMP)

**Sintoma:** o probe se registra normalmente e reporta `discoveredGatewayIp`, mas esse IP nao e o roteador/firewall que voce quer monitorar via SNMP. Ou o dispositivo cadastrado a partir da sugestao automatica nunca fica `SNMP OK`.

**Causa:** o Network Probe detecta apenas a **rota padrao** (`0.0.0.0/0`) da maquina onde ele esta instalado, via `ip route`/`Get-NetRoute`. Isso e so uma sugestao de conveniencia para o banner de descoberta - nao e um requisito do sistema. Em maquinas com mais de uma interface de rede, ou quando o equipamento SNMP nao e o gateway padrao da maquina do probe (por exemplo, um servidor cujo trafego de internet sai por um firewall, mas que tambem enxerga um MikroTik de gerenciamento em outra sub-rede), o IP detectado nao bate com o IP real do equipamento.

**Como confirmar:** compare o `discoveredGatewayIp` mostrado no cadastro do probe com o IP real do equipamento (`/ip address print` no RouterOS, por exemplo). Se forem diferentes, esse e o problema.

**Correcao:** cadastre o dispositivo de rede manualmente em `Redes -> Adicionar dispositivo`, usando o IP real do equipamento no campo "IP de gerenciamento" - ignore a sugestao automatica. Nada no backend exige que esse IP corresponda ao gateway detectado; a unica exigencia real e que a maquina onde o Network Probe esta instalado consiga alcançar esse IP via UDP `161`.

**Antes de cadastrar, valide a conectividade UDP** (nao TCP - `Test-NetConnection -Port 161` sempre falha para SNMP porque testa TCP por padrao, e SNMP e UDP; essa falha nao significa que o SNMP esta bloqueado). Rode no Windows, na maquina onde o probe esta instalado, reaproveitando o Node.js e o cliente SNMP ja instalados junto do probe:

```powershell
@'
import { snmpGet } from "C:/ProgramData/ServerWatchNetworkProbe/snmp/client.js";

const host = process.argv[2];
const community = process.argv[3];

if (!host || !community) {
  console.log("Uso: node snmp-test-client.mjs <ip> <community>");
  process.exit(1);
}

console.log(`Testando SNMP GET sysDescr contra ${host}:161 community=${community}`);
try {
  const result = await snmpGet(host, 161, community, ["1.3.6.1.2.1.1.1.0", "1.3.6.1.2.1.1.5.0"], { timeoutMs: 4000, retries: 1 });
  console.log("OK:", JSON.stringify(result, null, 2));
} catch (error) {
  console.log("FALHOU:", error.message);
}
'@ | Set-Content -Path "$env:TEMP\snmp-test.mjs" -Encoding UTF8

& "C:\ProgramData\ServerWatchNetworkProbe\node\node.exe" "$env:TEMP\snmp-test.mjs" <IP_DO_EQUIPAMENTO> <COMMUNITY>
```

No Linux, use o mesmo script trocando o caminho do modulo para `/opt/serverwatch-network-probe/snmp/client.js` e o binario Node para `/opt/serverwatch-network-probe/node/bin/node`.

Se retornar `OK` com o `sysDescr` do equipamento, o cadastro manual no ServerWatch vai funcionar. Se retornar `FALHOU: Timeout`, o problema e conectividade/firewall/community no equipamento - ver a secao de firewall do RouterOS mais abaixo (`/ip firewall filter print`, `/tool sniffer quick port=161`) ou o equivalente no fabricante em questao.

## Fora do escopo inicial

- configuracao automatica de MikroTik/pfSense/Fortigate;
- alteracao de rotas/firewall;
- gerencia de VPN;
- descoberta automatica completa;
- API especifica por fabricante;
- coleta SNMPv3 completa com criptografia de segredos.
