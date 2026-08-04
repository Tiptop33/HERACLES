#!/usr/bin/env bash
# Joue le harnais, toutes les migrations puis tous les tests dans une base
# jetable. À lancer contre n'importe quel PostgreSQL — celui de la pile
# Supabase locale, ou un serveur nu :
#
#   ./supabase/tests/executer.sh
#   PGHOST=localhost PGPORT=54332 PGUSER=postgres ./supabase/tests/executer.sh
#
# La base de test est créée puis supprimée : rien n'est touché ailleurs.

set -euo pipefail

ici="$(cd "$(dirname "$0")" && pwd)"
base="${BASE_TEST:-heracles_test}"

echo "Base de test : $base"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $base" >/dev/null
psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database $base" >/dev/null

nettoyer() {
  psql -q -d postgres -c "drop database if exists $base" >/dev/null 2>&1 || true
}
trap nettoyer EXIT

echo "Harnais Supabase…"
psql -v ON_ERROR_STOP=1 -q -d "$base" -f "$ici/harnais.sql"

echo "Migrations…"
for migration in "$ici"/../migrations/*.sql; do
  echo "  $(basename "$migration")"
  psql -v ON_ERROR_STOP=1 -q -d "$base" -f "$migration"
done

echo "Tests…"
for test in "$ici"/*.test.sql; do
  echo "  $(basename "$test")"
  psql -v ON_ERROR_STOP=1 -q -d "$base" -f "$test"
done

echo
echo "Tout est passé."
