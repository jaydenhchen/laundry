#!/bin/bash
cd "$(dirname "$0")"

if [ ! -f "index.html" ] || [ ! -f "styles.css" ] || [ ! -f "app.js" ]; then
  echo "Keep index.html, styles.css, and app.js in the same folder."
  read -r -p "Press Return to close. "
  exit 1
fi

PORT=48760
python3 -m http.server "$PORT" >/tmp/freshfold-server.log 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null' EXIT
sleep 0.4

URL="http://127.0.0.1:${PORT}/index.html"
if /usr/bin/osascript -e 'id of application "Google Chrome"' >/dev/null 2>&1; then
  open -a "Google Chrome" "$URL"
else
  open "$URL"
fi

echo "Fresh Fold is open in Chrome."
echo "Keep this window open while you play."
echo "Press Control-C when you are done."
wait "$SERVER"
