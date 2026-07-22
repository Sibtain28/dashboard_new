#!/bin/sh

ollama serve &
OLLAMA_PID=$!

echo "Waiting for Ollama server..."
until curl -fs http://localhost:11434/api/tags >/dev/null; do
  sleep 1
done

if ! ollama list | grep -q "llama3.2"; then
  echo "Downloading llama3.2..."
  ollama pull llama3.2
else
  echo "llama3.2 already installed."
fi

wait $OLLAMA_PID