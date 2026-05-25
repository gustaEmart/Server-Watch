# ServerWatch Probe Collector

O Probe Collector e o modelo recomendado para monitorar varios clientes em redes diferentes sem VPN.

## Como funciona

O ServerWatch central fica publicado em um endereco HTTP/HTTPS. Em cada cliente, voce instala um Probe Collector dentro da rede local.

Fluxo:

```text
Servidores do cliente
        ^
        | ping, e futuramente SNMP, dentro da LAN
        |
ServerWatch Probe Collector
        |
        | HTTP/HTTPS de saida
        v
ServerWatch central
```

Com isso, o cliente nao precisa expor ICMP, SNMP ou portas internas na internet. O probe so precisa conseguir sair para o ServerWatch central, preferencialmente por HTTPS `443`.

## Token

O ServerWatch central usa um token compartilhado para autenticar probes.

Por padrao, o token fica em:

```text
data/serverwatch.json
```

No campo:

```text
settings.probeToken
```

Em producao, voce tambem pode definir:

```text
SERVERWATCH_PROBE_TOKEN=um-token-longo-e-seguro
```

## Configuracao de servidores

No cadastro de um servidor, escolha:

```text
Origem: Probe local do cliente
ID do probe: cliente-acme-sp
```

O `ID do probe` precisa ser igual ao `probeId` configurado no coletor instalado no cliente.

## Rodar manualmente

Copie `probe/config.example.json` para `probe/config.json` e ajuste:

```json
{
  "serverUrl": "https://serverwatch.example.com",
  "probeId": "cliente-acme-sp",
  "name": "Cliente ACME - Sao Paulo",
  "token": "cole-aqui-o-token-do-serverwatch",
  "intervalSeconds": 10,
  "timeoutMs": 2500
}
```

Depois rode:

```bash
node probe/collector.js --config probe/config.json
```

## Configuracao pela UI local

Para abrir a tela local de configuracao:

```bash
npm run probe:setup
```

Ou diretamente:

```bash
node probe/setup-server.js --config probe/config.json
```

Depois acesse:

```text
http://localhost:8777/setup
```

A tela salva o arquivo `config.json`. Depois disso, reinicie o processo, servico ou tarefa agendada do probe para aplicar a configuracao.

## Instalacao no Linux

Execute como root ou com `sudo`:

```bash
curl -fsSL https://serverwatch.example.com/downloads/probe/linux-installer | sudo bash -s -- \
  --server-url https://serverwatch.example.com \
  --probe-id cliente-acme-sp \
  --token cole-aqui-o-token-do-serverwatch
```

Esse comando nao precisa do repositorio clonado no servidor do cliente. O instalador baixa os arquivos necessarios do ServerWatch usando o token do probe.

O instalador cria:

```text
/opt/serverwatch-probe
/etc/systemd/system/serverwatch-probe.service
```

Comandos uteis:

```bash
sudo systemctl status serverwatch-probe
sudo journalctl -u serverwatch-probe -f
sudo systemctl restart serverwatch-probe
```

## Instalacao no Windows

Abra o PowerShell como Administrador:

```powershell
.\tools\probe\Install-ProbeCollector.ps1
```

Sem parametros, o instalador abre a UI local em:

```text
http://localhost:8777/setup
```

Preencha a configuracao, salve no navegador e volte ao PowerShell para finalizar a criacao da tarefa agendada.

Tambem e possivel instalar direto por parametros:

```powershell
.\tools\probe\Install-ProbeCollector.ps1 `
  -ServerUrl "https://serverwatch.example.com" `
  -ProbeId "cliente-acme-sp" `
  -Token "cole-aqui-o-token-do-serverwatch"
```

O instalador cria:

```text
C:\ProgramData\ServerWatchProbe
```

E registra uma tarefa agendada chamada:

```text
ServerWatch Probe Collector
```

## Instalador Windows .exe com UI

Para gerar um instalador `.exe` com interface nativa:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\tools\probe\windows\Build-ProbeInstaller.ps1 `
  -OutputDir dist\probe-installer-lite `
  -SkipBundledNode
```

O arquivo gerado fica em:

```text
dist\probe-installer-lite\ServerWatchProbeSetup.exe
```

Esse instalador deve ser executado como Administrador. Ele abre uma UI para informar:

- URL do ServerWatch;
- ID do probe;
- nome amigavel;
- token;
- intervalo;
- timeout.

Depois ele copia os arquivos para:

```text
C:\ProgramData\ServerWatchProbe
```

E cria/inicia a tarefa agendada:

```text
ServerWatch Probe Collector
```

O pacote usa um launcher sem console, entao a instalacao deve exibir apenas a janela grafica do instalador.

A versao `-SkipBundledNode` exige Node.js instalado no computador que vai receber o probe. Para uma versao totalmente autocontida, gere sem `-SkipBundledNode`; nesse caso o `node.exe` sera incluido no pacote, deixando o instalador maior.

## Requisitos de rede

No cliente:

- o probe precisa conseguir pingar os servidores internos;
- o probe precisa conseguir acessar o ServerWatch central por HTTP/HTTPS;
- nenhuma porta de entrada precisa ser aberta no cliente para o ServerWatch central.

No ServerWatch central:

- a porta web precisa estar acessivel para os probes;
- em producao, use HTTPS.

## Evolucao futura

O probe atual coleta disponibilidade por ping. A arquitetura permite adicionar depois:

- SNMP dentro da LAN do cliente;
- CPU, memoria, disco e interfaces;
- inventario basico;
- fila local para reenvio quando a internet cair;
- atualizacao automatica do probe.
