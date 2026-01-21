from flask import Flask, request, jsonify
from flask_cors import CORS
from functools import wraps
import redis
import subprocess
import os
import json
import requests
from datetime import datetime
import re

app = Flask(__name__)
CORS(app, origins=os.getenv('ALLOWED_ORIGINS', '').split(',') if os.getenv('ALLOWED_ORIGINS') else None)

# Redis connection
redis_client = None
try:
    redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
    redis_client = redis.from_url(redis_url, decode_responses=True)
    redis_client.ping()
    print('Redis connected successfully')
except Exception as e:
    print(f'Redis connection failed: {e}. Continuing without cache...')
    redis_client = None

# Rate limiting decorator
from collections import defaultdict
from time import time
rate_limits = defaultdict(list)

def rate_limit(max_requests=100, window=60):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            ip = request.remote_addr
            now = time()
            rate_limits[ip] = [req_time for req_time in rate_limits[ip] if now - req_time < window]
            
            if len(rate_limits[ip]) >= max_requests:
                return jsonify({'error': 'Rate limit exceeded'}), 429
            
            rate_limits[ip].append(now)
            return f(*args, **kwargs)
        return decorated_function
    return decorator

REPOS_DIR = os.getenv('REPOS_DIR', '/tmp/n8n-git-repos')
os.makedirs(REPOS_DIR, exist_ok=True)

def get_cache_key(prefix, **kwargs):
    """Generate cache key from prefix and kwargs"""
    parts = [prefix]
    for key, value in sorted(kwargs.items()):
        parts.append(f"{key}:{value}")
    return ":".join(parts)

def get_from_cache(key):
    """Get value from Redis cache"""
    if not redis_client:
        return None
    try:
        value = redis_client.get(key)
        return json.loads(value) if value else None
    except Exception as e:
        print(f'Cache get error: {e}')
        return None

def set_cache(key, value, ttl=300):
    """Set value in Redis cache with TTL"""
    if not redis_client:
        return False
    try:
        redis_client.setex(key, ttl, json.dumps(value))
        return True
    except Exception as e:
        print(f'Cache set error: {e}')
        return False

def get_repo_path(repo):
    """Get local path for repository"""
    safe_repo = repo.replace('/', '_')
    return os.path.join(REPOS_DIR, safe_repo)

def ensure_repo_cloned(repo):
    """Ensure repository is cloned locally"""
    repo_path = get_repo_path(repo)
    
    if os.path.exists(repo_path):
        # Update existing repo
        subprocess.run(['git', 'fetch'], cwd=repo_path, capture_output=True, check=False)
    else:
        # Clone new repo
        repo_url = f'https://github.com/{repo}.git'
        subprocess.run(['git', 'clone', repo_url, repo_path], capture_output=True, check=False)
    
    return repo_path

def git_log(repo_path, branch='main', limit=50, file_path=None):
    """Get git log for repository"""
    subprocess.run(['git', 'checkout', branch], cwd=repo_path, capture_output=True, check=False)
    
    cmd = ['git', 'log', f'--max-count={limit}', '--format=%H|%ai|%s|%an|%ae']
    if file_path:
        cmd.append('--')
        cmd.append(file_path)
    
    result = subprocess.run(cmd, cwd=repo_path, capture_output=True, text=True, check=False)
    
    commits = []
    for line in result.stdout.strip().split('\n'):
        if not line:
            continue
        parts = line.split('|', 4)
        if len(parts) >= 5:
            commits.append({
                'sha': parts[0],
                'date': parts[1],
                'message': parts[2],
                'author': {
                    'name': parts[3],
                    'email': parts[4]
                },
                'branch': branch
            })
    
    return commits

def git_branches(repo_path):
    """Get list of branches"""
    result = subprocess.run(['git', 'branch', '-a'], cwd=repo_path, capture_output=True, text=True, check=False)
    
    branches = []
    current_branch = None
    
    for line in result.stdout.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        
        if line.startswith('*'):
            current_branch = line.replace('*', '').strip()
            branches.append({
                'name': current_branch,
                'type': 'local',
                'current': True
            })
        elif not line.startswith('remotes/origin/HEAD'):
            branch_name = line.replace('remotes/origin/', '').strip()
            if branch_name and branch_name not in [b['name'] for b in branches]:
                branches.append({
                    'name': branch_name,
                    'type': 'remote',
                    'current': False
                })
    
    # Get last commit for each branch
    for branch in branches:
        try:
            subprocess.run(['git', 'checkout', branch['name']], cwd=repo_path, capture_output=True, check=False)
            log_result = subprocess.run(['git', 'log', '-1', '--format=%H|%s|%ai'], 
                                      cwd=repo_path, capture_output=True, text=True, check=False)
            if log_result.stdout:
                parts = log_result.stdout.strip().split('|')
                if len(parts) >= 3:
                    branch['lastCommit'] = {
                        'sha': parts[0],
                        'message': parts[1],
                        'date': parts[2]
                    }
        except:
            pass
    
    return branches

def github_api_get(url, token):
    """Make GitHub API request"""
    headers = {
        'Authorization': f'token {token}',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'n8n-git-api'
    }
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json()

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'timestamp': str(datetime.now())})

@app.route('/api/commits', methods=['GET'])
@rate_limit()
def get_commits():
    repo = request.args.get('repo')
    branch = request.args.get('branch', 'main')
    limit = int(request.args.get('limit', 50))
    github_token = request.headers.get('x-github-token')
    
    if not repo or not github_token:
        return jsonify({'error': 'Missing required parameters'}), 400
    
    if not re.match(r'^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$', repo):
        return jsonify({'error': 'Invalid repository format'}), 400
    
    cache_key = get_cache_key('commits', repo=repo, branch=branch, limit=limit)
    cached = get_from_cache(cache_key)
    if cached:
        return jsonify(cached)
    
    try:
        repo_path = ensure_repo_cloned(repo)
        commits = git_log(repo_path, branch, limit)
    except Exception as e:
        print(f'Git clone failed, using GitHub API: {e}')
        # Fallback to GitHub API
        owner, repo_name = repo.split('/')
        url = f'https://api.github.com/repos/{owner}/{repo_name}/commits?sha={branch}&per_page={limit}'
        github_commits = github_api_get(url, github_token)
        commits = [{
            'sha': c['sha'],
            'message': c['commit']['message'].split('\n')[0],
            'author': {
                'name': c['commit']['author']['name'],
                'email': c['commit']['author']['email']
            },
            'date': c['commit']['author']['date'],
            'branch': branch
        } for c in github_commits]
    
    set_cache(cache_key, commits, 300)
    return jsonify(commits)

@app.route('/api/branches', methods=['GET'])
@rate_limit()
def get_branches():
    repo = request.args.get('repo')
    github_token = request.headers.get('x-github-token')
    
    if not repo or not github_token:
        return jsonify({'error': 'Missing required parameters'}), 400
    
    if not re.match(r'^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$', repo):
        return jsonify({'error': 'Invalid repository format'}), 400
    
    cache_key = get_cache_key('branches', repo=repo)
    cached = get_from_cache(cache_key)
    if cached:
        return jsonify(cached)
    
    try:
        repo_path = ensure_repo_cloned(repo)
        branches = git_branches(repo_path)
    except Exception as e:
        print(f'Git clone failed, using GitHub API: {e}')
        # Fallback to GitHub API
        owner, repo_name = repo.split('/')
        url = f'https://api.github.com/repos/{owner}/{repo_name}/branches'
        github_branches = github_api_get(url, github_token)
        repo_info = github_api_get(f'https://api.github.com/repos/{owner}/{repo_name}', github_token)
        default_branch = repo_info.get('default_branch', 'main')
        
        branches = [{
            'name': b['name'],
            'type': 'remote',
            'current': b['name'] == default_branch,
            'lastCommit': {
                'sha': b['commit']['sha'],
                'message': b['commit']['commit']['message'].split('\n')[0] if b['commit'].get('commit') else '',
                'date': b['commit']['commit']['author']['date'] if b['commit'].get('commit') else ''
            }
        } for b in github_branches]
    
    set_cache(cache_key, branches, 300)
    return jsonify(branches)

@app.route('/api/commit-graph', methods=['GET'])
@rate_limit()
def get_commit_graph():
    repo = request.args.get('repo')
    branch = request.args.get('branch', 'main')
    github_token = request.headers.get('x-github-token')
    
    if not repo or not github_token:
        return jsonify({'error': 'Missing required parameters'}), 400
    
    if not re.match(r'^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$', repo):
        return jsonify({'error': 'Invalid repository format'}), 400
    
    cache_key = get_cache_key('graph', repo=repo, branch=branch)
    cached = get_from_cache(cache_key)
    if cached:
        return jsonify(cached)
    
    try:
        repo_path = ensure_repo_cloned(repo)
        commits = git_log(repo_path, branch, 100)
        branches = git_branches(repo_path)
        branch_list = [b['name'] for b in branches]
        
        graph_data = {
            'commits': commits,
            'branches': branch_list,
            'branchCommits': {}
        }
    except Exception as e:
        print(f'Git clone failed, using GitHub API: {e}')
        # Fallback to GitHub API
        owner, repo_name = repo.split('/')
        commits_url = f'https://api.github.com/repos/{owner}/{repo_name}/commits?sha={branch}&per_page=100'
        github_commits = github_api_get(commits_url, github_token)
        commits = [{
            'sha': c['sha'],
            'message': c['commit']['message'].split('\n')[0],
            'author': {'name': c['commit']['author']['name'], 'email': c['commit']['author']['email']},
            'date': c['commit']['author']['date'],
            'branch': branch
        } for c in github_commits]
        
        branches_url = f'https://api.github.com/repos/{owner}/{repo_name}/branches'
        github_branches = github_api_get(branches_url, github_token)
        branch_list = [b['name'] for b in github_branches]
        
        graph_data = {
            'commits': commits,
            'branches': branch_list,
            'branchCommits': {}
        }
    
    set_cache(cache_key, graph_data, 300)
    return jsonify(graph_data)

@app.route('/api/file-history', methods=['GET'])
@rate_limit()
def get_file_history():
    repo = request.args.get('repo')
    path = request.args.get('path')
    branch = request.args.get('branch', 'main')
    github_token = request.headers.get('x-github-token')
    
    if not repo or not path or not github_token:
        return jsonify({'error': 'Missing required parameters'}), 400
    
    if not re.match(r'^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$', repo):
        return jsonify({'error': 'Invalid repository format'}), 400
    
    cache_key = get_cache_key('file-history', repo=repo, path=path, branch=branch)
    cached = get_from_cache(cache_key)
    if cached:
        return jsonify(cached)
    
    try:
        repo_path = ensure_repo_cloned(repo)
        commits = git_log(repo_path, branch, 50, path)
    except Exception as e:
        print(f'Git clone failed, using GitHub API: {e}')
        # Fallback to GitHub API
        owner, repo_name = repo.split('/')
        url = f'https://api.github.com/repos/{owner}/{repo_name}/commits?sha={branch}&path={path}&per_page=50'
        github_commits = github_api_get(url, github_token)
        commits = [{
            'sha': c['sha'],
            'message': c['commit']['message'].split('\n')[0],
            'author': {
                'name': c['commit']['author']['name'],
                'email': c['commit']['author']['email']
            },
            'date': c['commit']['author']['date']
        } for c in github_commits]
    
    set_cache(cache_key, commits, 300)
    return jsonify(commits)

@app.route('/api/webhook', methods=['POST'])
def webhook():
    data = request.json
    repository = data.get('repository', {})
    ref = data.get('ref', '')
    
    if not repository.get('full_name'):
        return jsonify({'error': 'Invalid webhook payload'}), 400
    
    repo = repository['full_name']
    branch = ref.replace('refs/heads/', '') if ref.startswith('refs/heads/') else 'main'
    
    # Invalidate cache
    patterns = [
        f'commits:{repo}:*',
        f'graph:{repo}:*',
        f'branches:{repo}',
        f'file-history:{repo}:*'
    ]
    
    if redis_client:
        for pattern in patterns:
            try:
                keys = redis_client.keys(pattern)
                if keys:
                    redis_client.delete(*keys)
            except Exception as e:
                print(f'Cache invalidation error: {e}')
    
    return jsonify({'success': True, 'message': 'Cache invalidated'})

if __name__ == '__main__':
    port = int(os.getenv('PORT', 3000))
    app.run(host='0.0.0.0', port=port, debug=os.getenv('FLASK_ENV') == 'development')

