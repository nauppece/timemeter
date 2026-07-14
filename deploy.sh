#!/bin/zsh
set -e

# Deploy the built plugin files to your Obsidian vault's plugin folder.
#
# Set the destination via the TIMEMETER_PLUGIN_DIR environment variable, e.g.:
#   export TIMEMETER_PLUGIN_DIR="/path/to/YourVault/.obsidian/plugins/timemeter"
#
# For convenience you can put that line in a local, gitignored `deploy.local.sh`
# next to this script; it will be sourced automatically.

here="$(cd "$(dirname "$0")" && pwd)"
[ -f "$here/deploy.local.sh" ] && source "$here/deploy.local.sh"

DEST="${TIMEMETER_PLUGIN_DIR:?Set TIMEMETER_PLUGIN_DIR to your vault's .obsidian/plugins/timemeter (see deploy.sh header)}"

mkdir -p "$DEST"
cp main.js manifest.json styles.css "$DEST/"
echo "deployed to $DEST"
