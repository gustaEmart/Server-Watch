#!/bin/sh
set -eu

ROOT="${DATABASE_BACKUPS_DIR:-/backups}"
ARCHIVES="$ROOT/archives"
REQUESTS="$ROOT/requests"
CONFIG="$ROOT/worker.env"
ACTIVITY="$ROOT/activity.log"
CURRENT_JOB="$ROOT/current-job"
LAST_SCHEDULE="$ROOT/last-scheduled-date"
MONGO_URI="${MONGODB_URI:?MONGODB_URI precisa estar definido}"

mkdir -p "$ARCHIVES" "$REQUESTS"
touch "$ACTIVITY"

log_activity() {
  printf '%s|%s|%s|%s|%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "$3" "$4" >> "$ACTIVITY"
  tail -n 100 "$ACTIVITY" > "$ACTIVITY.tmp" && mv "$ACTIVITY.tmp" "$ACTIVITY"
}

load_config() {
  ENABLED=1
  SCHEDULE_HOUR=2
  RETENTION_DAYS=14
  if [ -f "$CONFIG" ]; then
    # Arquivo gerado exclusivamente pelo ServerWatch; sem expansao de comandos.
    . "$CONFIG"
  fi
  case "$SCHEDULE_HOUR" in ''|*[!0-9]*) SCHEDULE_HOUR=2 ;; esac
  case "$RETENTION_DAYS" in ''|*[!0-9]*) RETENTION_DAYS=14 ;; esac
  [ "$SCHEDULE_HOUR" -le 23 ] || SCHEDULE_HOUR=2
  [ "$RETENTION_DAYS" -ge 1 ] || RETENTION_DAYS=14
}

archive_name() {
  printf 'serverwatch-%s-%s.archive.gz' "$1" "$(date -u +%Y%m%dT%H%M%SZ)"
}

prune_archives() {
  find "$ARCHIVES" -type f -name 'serverwatch-*.archive.gz' -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
}

run_dump() {
  reason="$1"
  filename="$(archive_name "$reason")"
  target="$ARCHIVES/$filename"
  temp="$target.tmp"
  printf 'backup|%s|%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$filename" > "$CURRENT_JOB"
  if mongodump --uri="$MONGO_URI" --archive="$temp" --gzip; then
    mv "$temp" "$target"
    prune_archives
    log_activity backup success "$filename" "Backup MongoDB concluido"
    rm -f "$CURRENT_JOB"
    return 0
  fi
  rm -f "$temp" "$CURRENT_JOB"
  log_activity backup failed "" "Falha ao executar mongodump; consulte os logs do worker"
  return 1
}

run_restore() {
  filename="$1"
  target="$ARCHIVES/$filename"
  case "$filename" in serverwatch-*.archive.gz) ;; *) log_activity restore failed "" "Arquivo de restauracao invalido"; return 1 ;; esac
  [ -f "$target" ] || { log_activity restore failed "$filename" "Arquivo de restauracao nao encontrado"; return 1; }
  printf 'restore|%s|%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$filename" > "$CURRENT_JOB"
  if ! run_dump pre-restore; then
    log_activity restore failed "$filename" "Restauracao cancelada: nao foi possivel gerar ponto de seguranca"
    return 1
  fi
  printf 'restore|%s|%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$filename" > "$CURRENT_JOB"
  if mongorestore --uri="$MONGO_URI" --archive="$target" --gzip --drop; then
    log_activity restore success "$filename" "Banco MongoDB restaurado"
    rm -f "$CURRENT_JOB"
    return 0
  fi
  rm -f "$CURRENT_JOB"
  log_activity restore failed "$filename" "Falha ao executar mongorestore; o ponto de seguranca foi preservado"
  return 1
}

process_requests() {
  for request in "$REQUESTS"/*.request; do
    [ -f "$request" ] || break
    processing="$request.processing"
    mv "$request" "$processing"
    IFS='|' read -r action requested_at filename < "$processing" || true
    case "$action" in
      backup) run_dump manual || true ;;
      restore) run_restore "$filename" || true ;;
      *) log_activity "$action" failed "" "Solicitacao de backup invalida" ;;
    esac
    rm -f "$processing"
  done
}

process_schedule() {
  [ "$ENABLED" = "1" ] || return 0
  current_hour="$(date +%H | sed 's/^0//')"
  [ -n "$current_hour" ] || current_hour=0
  [ "$current_hour" -eq "$SCHEDULE_HOUR" ] || return 0
  today="$(date +%F)"
  last="$(cat "$LAST_SCHEDULE" 2>/dev/null || true)"
  [ "$last" = "$today" ] && return 0
  printf '%s\n' "$today" > "$LAST_SCHEDULE"
  run_dump scheduled || true
}

while true; do
  load_config
  process_requests
  process_schedule
  sleep 15
done
