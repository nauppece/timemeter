#!/bin/zsh
set -e
DEST=""
mkdir -p "$DEST"
cp main.js manifest.json styles.css "$DEST/"
echo "deployed to $DEST"
