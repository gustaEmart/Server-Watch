# Backup do banco MongoDB

O ServerWatch executa backup nativo do MongoDB em um container separado (`mongodb-backup`). Os archives usam o formato compactado do `mongodump` e ficam no volume Docker `serverwatch_db_backups`, isolado do volume do banco em producao.

## Operacao pela interface

Em **Integracoes > Backup do MongoDB**, um administrador pode:

- habilitar ou pausar a rotina diaria;
- escolher a hora de execucao e a retencao em dias;
- gerar um backup manual;
- baixar um archive para guarda externa;
- restaurar um archive mediante a confirmacao `RESTAURAR`.

Antes de toda restauracao, o worker cria obrigatoriamente um archive `pre-restore`. A restauracao usa `mongorestore --drop`, substituindo o conteudo atual do banco; use-a somente em uma janela de manutencao.

## Operacao no host

Verificar a rotina:

```bash
docker compose ps
docker compose logs --tail=100 mongodb-backup
```

Os arquivos podem ser listados sem entrar no container da aplicacao:

```bash
docker compose exec mongodb-backup ls -lah /backups/archives
```

Mantenha ao menos uma copia dos archives em armazenamento externo. O volume Docker protege contra reinicios e atualizacoes do Compose, mas nao substitui uma estrategia de recuperacao fora da VM.
