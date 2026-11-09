#!/bin/sh
# Publish ai-sdk-tool-cyberwarex to npm. Token: ~/.secrets/npm.env (NPM_TOKEN=npm_..., granular, read+write, 2FA bypass).
# Runs the offline tests first; the token only lives in a temp npmrc that is deleted on exit.
set -eu
cd "$(dirname "$0")/.."
TOK=$(grep -m1 -o 'npm_[A-Za-z0-9]\{20,\}' "$HOME/.secrets/npm.env") || { echo "no NPM_TOKEN in ~/.secrets/npm.env"; exit 1; }
RC=$(mktemp); trap 'rm -f "$RC"' EXIT; chmod 600 "$RC"
printf '//registry.npmjs.org/:_authToken=%s\n' "$TOK" > "$RC"
~/bin/npm test
~/bin/npm --userconfig "$RC" whoami
~/bin/npm --userconfig "$RC" publish --access public
sleep 5
curl -s https://registry.npmjs.org/ai-sdk-tool-cyberwarex | python3 -c "import json,sys;d=json.load(sys.stdin);print('npm latest', d['dist-tags']['latest'])"
