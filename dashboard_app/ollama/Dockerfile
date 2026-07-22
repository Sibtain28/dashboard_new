FROM ollama/ollama:latest

# Install curl for entrypoint health check and pulling the model
RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*

# Copy the entrypoint script into the container
COPY entrypoint.sh /entrypoint.sh

# Make the entrypoint script executable
RUN chmod +x /entrypoint.sh

# Set the custom entrypoint
ENTRYPOINT ["/entrypoint.sh"]
