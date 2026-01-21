FROM python:3.11-slim

WORKDIR /app

# Install git
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create repos directory
RUN mkdir -p /tmp/n8n-git-repos

# Expose port (default 80 for Easypanel, but configurable via PORT env var)
EXPOSE 80

# Health check (uses PORT env var or defaults to 80)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import os, requests; port = os.getenv('PORT', '80'); requests.get(f'http://localhost:{port}/health')"

# Start server
CMD ["python", "app.py"]

