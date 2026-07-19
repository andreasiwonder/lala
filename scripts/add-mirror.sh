#!/usr/bin/env bash
# =============================================================================
# add-mirror.sh — publish this site to a second, neutral URL.
#
#   ./scripts/add-mirror.sh <org-name>
#
# Creates <org>/<org>.github.io, pushes main to it, turns on Pages, and wires
# the local `origin` remote to push to BOTH locations from then on. After this,
# a plain `git push` deploys to both URLs — there is no sync step to forget.
#
# Deliberately no mirroring GitHub Action and no personal access token: the
# only thing that must stay in step is the code, and a dual-push remote covers
# that without storing a credential anywhere. The monthly climatology refresh
# needs no syncing either — that workflow rebuilds the data from the public
# ERA5 archive, so each repo regenerates an identical file on its own schedule.
# =============================================================================

set -euo pipefail

ORG="${1:-}"
if [[ -z "$ORG" ]]; then
  echo "usage: $0 <org-name>" >&2
  echo "  e.g. $0 alsterwind   ->  https://alsterwind.github.io" >&2
  exit 1
fi

REPO="$ORG.github.io"
FULL="$ORG/$REPO"

echo "==> Checking org '$ORG'"
if ! gh api "orgs/$ORG" --jq '.login' >/dev/null 2>&1; then
  echo "ERROR: org '$ORG' not found, or your token can't see it." >&2
  echo "Create it at https://github.com/organizations/plan (choose Free), then re-run." >&2
  exit 1
fi
echo "    ok — $(gh api "orgs/$ORG" --jq '.login')"

echo "==> Creating $FULL"
if gh api "repos/$FULL" --jq '.name' >/dev/null 2>&1; then
  echo "    already exists, reusing"
else
  gh repo create "$FULL" --public \
    --description "Wind, rain and sailing conditions for the Außenalster in Hamburg" \
    >/dev/null
  echo "    created"
fi

echo "==> Pushing main"
git push -q "https://github.com/$FULL.git" main:main
echo "    pushed"

echo "==> Enabling GitHub Pages"
# GitHub auto-enables Pages for a repo named <org>.github.io, and the enable
# call then returns 409. Treat "already enabled" as success rather than fatal —
# the POST racing against GitHub's own setup is the normal path here, not an error.
if gh api "repos/$FULL/pages" --jq '.html_url' >/dev/null 2>&1; then
  echo "    already enabled (automatic for <org>.github.io)"
elif gh api -X POST "repos/$FULL/pages" \
       -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1; then
  echo "    enabled"
elif gh api "repos/$FULL/pages" --jq '.html_url' >/dev/null 2>&1; then
  echo "    enabled concurrently by GitHub"
else
  echo "ERROR: could not enable Pages on $FULL" >&2
  exit 1
fi

echo "==> Wiring origin to push to both remotes"
# Reset push URLs so re-running doesn't stack duplicates.
git remote set-url --delete --push origin '.*' 2>/dev/null || true
git remote set-url --push origin "https://github.com/andreasiwonder/hvm.git"
git remote set-url --add --push origin "https://github.com/$FULL.git"
echo "    git push now deploys to:"
git remote -v | grep push | sed 's/^/      /'

echo
echo "==> Waiting for the Pages build"
for i in $(seq 1 30); do
  S=$(gh api "repos/$FULL/pages/builds/latest" --jq '.status' 2>/dev/null || echo pending)
  printf "    %2ds  %s\n" $((i * 10)) "$S"
  [[ "$S" == "built" ]] && break
  [[ "$S" == "errored" ]] && { gh api "repos/$FULL/pages/builds/latest" --jq '.error.message'; exit 1; }
  sleep 10
done

URL="https://$ORG.github.io/"
echo
echo "Live: $URL"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 25 "$URL" || echo "000")
echo "HTTP $CODE"
