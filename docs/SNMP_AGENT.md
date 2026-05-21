# Agente SNMP para ServerWatch

Este documento descreve a abordagem recomendada para preparar servidores Linux e Windows para responder ao ServerWatch via SNMP.

## Conceito

No SNMP, o ServerWatch atua como gerente/coletor SNMP. Cada servidor monitorado precisa ter um agente SNMP respondendo consultas.

Para a primeira fase, nao e necessario criar um daemon SNMP proprio. A alternativa mais simples e mais confiavel e configurar agentes padrao do sistema:

- Linux: Net-SNMP (`snmpd`)
- Windows: recurso/servico SNMP nativo quando disponivel
- Equipamentos de rede: agente SNMP do proprio fabricante

O ServerWatch deve consultar inicialmente o OID padrao de uptime:

```text
1.3.6.1.2.1.1.3.0
```

Tambem conhecido como `sysUpTime.0`.

Se a consulta responder, o item pode ser considerado online pelo metodo SNMP. Se a consulta falhar por timeout ou erro repetido, o item pode ser considerado offline pelo metodo SNMP.

## Requisitos de rede

- O servidor onde o ServerWatch roda deve acessar os hosts monitorados pela rede.
- Os hosts monitorados devem liberar UDP `161` apenas para o IP do ServerWatch.
- A community SNMP v2c deve ser somente leitura.
- SNMP nao deve ser exposto diretamente para a internet.

## Instalacao em Linux

Execute no servidor que sera monitorado:

```bash
sudo bash tools/snmp/install-snmp-linux.sh --manager 192.168.1.50 --community serverwatch-ro
```

Substitua:

- `192.168.1.50` pelo IP do servidor onde o ServerWatch roda.
- `serverwatch-ro` por uma community forte e diferente do padrao `public`.

O script:

- instala `snmpd` quando possivel;
- cria backup de `/etc/snmp/snmpd.conf`;
- configura acesso somente leitura para o IP do ServerWatch;
- restringe a view a OIDs padrao de monitoramento: sistema, interfaces, host resources e contadores estendidos de interface;
- tenta liberar UDP `161` no firewall local quando `ufw` ou `firewalld` estiverem disponiveis;
- reinicia e habilita o servico.

## Instalacao em Windows

Abra o PowerShell como Administrador no servidor que sera monitorado:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\tools\snmp\Install-SnmpAgent.ps1 -ManagerAddress 192.168.1.50 -Community serverwatch-ro
```

Substitua:

- `192.168.1.50` pelo IP do servidor onde o ServerWatch roda.
- `serverwatch-ro` por uma community forte e diferente do padrao `public`.

O script:

- tenta instalar o recurso SNMP nativo do Windows quando disponivel;
- registra uma community somente leitura;
- permite consultas apenas a partir do IP do ServerWatch;
- cria uma regra de firewall para UDP `161`;
- reinicia e habilita o servico SNMP.

Observacao: em algumas edicoes/versoes do Windows, o recurso SNMP nativo pode nao estar disponivel. Nesse caso, sera necessario usar um agente SNMP de terceiros ou migrar a estrategia para um agente HTTP proprio no futuro.

## Teste manual

A partir do servidor onde o ServerWatch roda, teste:

```bash
snmpget -v2c -c serverwatch-ro 192.168.1.10 1.3.6.1.2.1.1.3.0
```

Resposta esperada:

```text
DISMAN-EVENT-MIB::sysUpTimeInstance = Timeticks: (...)
```

Se houver timeout:

- confira se o IP do ServerWatch foi usado como `--manager`/`-ManagerAddress`;
- confira firewall local no host monitorado;
- confira se a community esta correta;
- confira se o servico SNMP esta em execucao;
- confirme conectividade UDP `161` entre ServerWatch e host.

## Integracao futura com o ServerWatch

Quando o backend passar a suportar SNMP, o cadastro do servidor deve incluir:

- metodo de checagem: `ping`, `snmp` ou `ping_snmp`;
- versao SNMP;
- porta SNMP;
- community SNMP v2c;
- OID consultado;
- timeout;
- ultimo uptime retornado;
- ultimo erro SNMP.

Na primeira implementacao do ServerWatch, a consulta SNMP pode ser limitada ao `sysUpTime.0`. Isso ja permite usar SNMP como criterio de disponibilidade sem coletar metricas adicionais.

Para preparar a evolucao alem de uptime, os perfis de metricas planejados ficam em `config/snmp/profiles/` e o desenho tecnico esta em `docs/SNMP_METRICS.md`.

## Seguranca

SNMP v2c e simples, mas a community trafega sem criptografia. Use apenas em LAN/VPN confiavel, com firewall restringindo o IP do ServerWatch.

Para ambientes mais sensiveis, a evolucao correta e SNMP v3 com autenticacao e privacidade/criptografia.
