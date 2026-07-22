#!/bin/sh

ollama serve &

echo "Waiting for Ollama..."

until curl -fs http://localhost:11434/api/tags >/dev/null; do
    sleep 1
done

if ! ollama list | grep -q "llama3.2"; then
    echo "Downloading llama3.2 model (this will take a few minutes, progress logs below)..."
    ollama pull llama3.2
    echo "Download completed successfully!"
else
    echo "llama3.2 already installed. Ready to use."
fi

wait