# n8n Git API Backend (Flask)

Backend service for the n8n GitHub Backup Extension that provides Git operations and caching.

## Features

- Fast Git operations using local repository clones
- Redis caching for improved performance
- GitHub API fallback when local clones unavailable
- Rate limiting and CORS protection
- Webhook support for cache invalidation

## Prerequisites

- Python 3.11+
- Redis 7+
- Git installed on system

## Installation

1. Clone or copy this directory to your VPS
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

4. Start Redis (if not using Docker):
   ```bash
   redis-server
   ```

## Running

### Development
```bash
export FLASK_ENV=development
python app.py
```

### Production
```bash
export FLASK_ENV=production
gunicorn -w 4 -b 0.0.0.0:3000 app:app
```

### Docker Compose
```bash
docker-compose up -d
```

## API Endpoints

### GET /health
Health check endpoint.

### GET /api/commits
Get commit history for a repository.

**Query Parameters:**
- `repo` (required): Repository in format `owner/repo`
- `branch` (optional): Branch name (default: `main`)
- `limit` (optional): Number of commits (default: 50)

**Headers:**
- `x-github-token`: GitHub personal access token

**Example:**
```bash
curl -H "x-github-token: YOUR_TOKEN" \
  "http://localhost:3000/api/commits?repo=owner/repo&branch=main&limit=20"
```

### GET /api/commit-graph
Get commit graph data for visualization.

**Query Parameters:**
- `repo` (required): Repository in format `owner/repo`
- `branch` (optional): Branch name (default: `main`)

**Headers:**
- `x-github-token`: GitHub personal access token

### GET /api/branches
List all branches for a repository.

**Query Parameters:**
- `repo` (required): Repository in format `owner/repo`

**Headers:**
- `x-github-token`: GitHub personal access token

### GET /api/file-history
Get commit history for a specific file.

**Query Parameters:**
- `repo` (required): Repository in format `owner/repo`
- `path` (required): File path in repository
- `branch` (optional): Branch name (default: `main`)

**Headers:**
- `x-github-token`: GitHub personal access token

### POST /api/webhook
GitHub webhook endpoint for cache invalidation.

## Configuration

### Environment Variables

- `FLASK_ENV`: Environment (development/production)
- `PORT`: Server port (default: 3000)
- `REDIS_URL`: Redis connection URL
- `REPOS_DIR`: Directory for Git repository clones
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins

## Deployment

### Using Docker

1. Build and run:
   ```bash
   docker-compose up -d
   ```

2. View logs:
   ```bash
   docker-compose logs -f
   ```

### Using Gunicorn

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:3000 app:app
```

### Using Nginx Reverse Proxy

Example Nginx configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Security

- Rate limiting: 100 requests/minute per IP
- CORS protection
- Token validation (GitHub tokens validated via API)
- No credential storage on server

## Troubleshooting

### Redis Connection Failed
- Ensure Redis is running: `redis-cli ping`
- Check `REDIS_URL` environment variable
- Service will continue without cache (slower)

### Git Clone Failed
- Ensure Git is installed: `git --version`
- Check repository access permissions
- Service will fallback to GitHub API

### High Memory Usage
- Repository clones are stored in `REPOS_DIR`
- Consider periodic cleanup of old/unused repositories
- Set up cron job to clean repos older than 7 days

## License

MIT

