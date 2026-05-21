# Metricas SNMP futuras

Este documento define como o ServerWatch deve evoluir do uso inicial de `sysUpTime.0` para coleta de outros recursos via SNMP.

## Objetivo

O primeiro passo do SNMP no ServerWatch deve ser disponibilidade por uptime. Mesmo assim, a instalacao dos agentes e o modelo de configuracao devem permitir coletar metricas adicionais depois sem reinstalar tudo do zero.

Recursos planejados:

- disponibilidade por `sysUpTime.0`;
- identificacao do sistema, nome e descricao;
- CPU por processador;
- memoria e discos pelo `HOST-RESOURCES-MIB`;
- interfaces de rede pelo `IF-MIB` e `IF-MIB::ifXTable`;
- contadores de trafego, erros e status operacional de interfaces;
- espaco usado por volumes;
- perfis especificos por fabricante em uma etapa posterior.

## Perfis

Os perfis planejados ficam em:

```text
config/snmp/profiles/
```

Cada perfil e um JSON declarativo com:

- identificador do perfil;
- descricao;
- tipo de dispositivo alvo;
- OIDs escalares;
- tabelas SNMP;
- unidade esperada;
- tipo da metrica;
- orientacao de calculo futuro.

Esses arquivos ainda nao sao consumidos pelo backend atual. Eles existem para guiar a implementacao futura do coletor SNMP e evitar que os OIDs fiquem espalhados pelo codigo.

## Modelo sugerido no banco

Quando o projeto migrar para SQLite/PostgreSQL, a parte de SNMP deve separar configuracao, metricas e amostras:

```text
snmp_profiles
snmp_metric_definitions
snmp_device_profiles
snmp_metric_samples
snmp_interface_inventory
snmp_storage_inventory
```

Campos sugeridos para `snmp_metric_definitions`:

- `id`
- `profile_id`
- `key`
- `name`
- `kind`: `scalar`, `table`, `computed`
- `oid`
- `unit`
- `value_type`: `integer`, `float`, `string`, `counter`, `timeticks`, `enum`
- `poll_interval_seconds`
- `is_enabled`

Campos sugeridos para `snmp_metric_samples`:

- `id`
- `server_id`
- `metric_key`
- `instance`
- `value_number`
- `value_text`
- `unit`
- `collected_at`

## Coleta

Para a primeira versao do coletor:

- consultar `sysUpTime.0` com `snmpget`;
- marcar online se responder;
- marcar offline se falhar por timeout/erro repetido;
- guardar `last_snmp_uptime` e `last_snmp_error`.

Para a segunda versao:

- carregar perfis JSON;
- executar `snmpget` para escalares;
- executar `snmpwalk` para tabelas;
- normalizar valores por `metric_key`;
- salvar amostras numericas em historico proprio;
- calcular deltas para contadores, como octetos de interface por segundo.

## Thresholds futuros

Alertas SNMP devem ser configuraveis por servidor, grupo ou perfil:

- CPU acima de X% por N coletas;
- memoria acima de X%;
- volume acima de X%;
- interface administrativamente ativa, mas operacionalmente down;
- crescimento de erros de interface;
- agente SNMP sem resposta;
- reboot detectado quando uptime diminui.

## OIDs base planejados

Os perfis iniciais usam apenas MIBs comuns:

- `SNMPv2-MIB`: informacoes do sistema e uptime.
- `HOST-RESOURCES-MIB`: CPU, storage, memoria e inventario basico.
- `IF-MIB`: interfaces, status, erros e contadores.

Esses OIDs tendem a funcionar bem em Linux com Net-SNMP e em muitos equipamentos de rede. No Windows, a disponibilidade das metricas depende da versao do Windows e do agente SNMP instalado.

## Seguranca

Mesmo com metricas adicionais, a community SNMP v2c deve continuar somente leitura e restrita ao IP do ServerWatch.

Para ambientes sensiveis, o perfil de producao deve usar SNMP v3 com autenticacao e criptografia antes de ampliar a coleta.
