# n8n GitHub Backup Extension

A Chrome/Edge browser extension that adds a "Push to GitHub" button to your n8n workflow editor, allowing you to backup workflows to GitHub with one click.

## Features

- 🚀 **One-Click Backup**: Push workflows to GitHub directly from the n8n UI
- 🔒 **Secure Storage**: API keys stored locally using Chrome's secure storage
- 🔄 **Smart Updates**: Automatically updates existing files using GitHub's SHA-based versioning
- ⚙️ **Easy Configuration**: Inline settings panel accessible from n8n
- 🌐 **Multi-Instance Support**: Configure different GitHub repositories for different n8n instances

## Installation

### From Source (Unpacked Extension)

1. **Clone or download this repository**
   ```bash
   git clone <repository-url>
   cd n8n-backup-extension
   ```

2. **Load the Extension in Chrome/Edge**
   
   **Note:** Icons are optional for testing. Chrome will use a default icon if none are provided.
   
   (Optional) To add custom icons later, create icon files in the `icons/` directory:
   - `icon16.png` (16x16 pixels)
   - `icon48.png` (48x48 pixels)
   - `icon128.png` (128x128 pixels)
   
   - Open Chrome/Edge and navigate to `chrome://extensions/` (or `edge://extensions/`)
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `n8n-backup-extension` folder

## Configuration

### Step 1: Get Your n8n API Key

1. Log into your n8n instance
2. Go to **Settings** > **API**
3. Create a new API key or use an existing one
4. Copy the API key

### Step 2: Get Your GitHub Personal Access Token

1. Go to GitHub.com
2. Navigate to **Settings** > **Developer settings** > **Personal access tokens** > **Tokens (classic)**
3. Click **Generate new token (classic)**
4. Give it a name (e.g., "n8n Backup")
5. Select the `repo` scope (full control of private repositories)
6. Click **Generate token**
7. **Copy the token immediately** (you won't see it again)

### Step 3: Configure the Extension

1. Open your n8n workflow editor
2. Click the **⚙️ Settings** button (injected by the extension)
3. Fill in the configuration:
   - **n8n Instance URL**: Your n8n base URL (e.g., `https://n8n.example.com` or `http://localhost:5678`)
   - **n8n API Key**: The API key from Step 1
   - **GitHub Repository**: Format `owner/repo` (e.g., `myusername/my-workflows`)
   - **GitHub Personal Access Token**: The token from Step 2
   - **GitHub Path Pattern**: Default is `workflows/{workflow-name}.json`
     - Use `{workflow-name}` for the workflow name
     - Use `{workflow-id}` for the workflow ID
4. Click **Save**

## Usage

1. Open any workflow in n8n
2. Click the **🚀 Push to GitHub** button (appears in the header)
3. The extension will:
   - Fetch the workflow JSON from n8n API
   - Check if the file exists in GitHub
   - Create or update the file in your repository
4. You'll see a success notification when complete

## GitHub Path Pattern

The path pattern determines where workflows are stored in your repository. Examples:

- `workflows/{workflow-name}.json` - Stores in `workflows/` folder with workflow name
- `backups/{workflow-id}.json` - Stores in `backups/` folder with workflow ID
- `{workflow-name}/{workflow-name}.json` - Creates a folder per workflow
- `workflows/{year}/{month}/{workflow-name}.json` - Organizes by date (requires custom logic)

## Security Notes

- **API keys are stored locally** in Chrome's encrypted storage (not synced)
- **HTTPS is required** for GitHub API calls
- **No credentials are sent** to any third-party servers
- The extension only communicates with:
  - Your configured n8n instance
  - GitHub API

## Troubleshooting

### Button doesn't appear

- Make sure you're on a workflow page (URL contains `/workflow/`)
- Refresh the page
- Check the browser console for errors (F12)

### "Failed to fetch workflow from n8n"

- Verify your n8n Instance URL is correct
- Check that your n8n API key is valid
- Ensure your n8n instance is accessible from your browser

### "Failed to push to GitHub"

- Verify your GitHub repository exists and is accessible
- Check that your GitHub token has the `repo` scope
- Ensure the repository format is correct (`owner/repo`)
- Check GitHub API rate limits (60 requests/hour for unauthenticated, 5000/hour for authenticated)

### Settings not saving

- Check browser console for errors
- Try reloading the extension
- Clear browser storage and reconfigure

## Development

### Project Structure

```
n8n-backup-extension/
├── manifest.json          # Extension manifest (Manifest V3)
├── content.js             # Content script (injects UI)
├── background.js          # Service worker (API calls)
├── styles.css             # Styles for injected UI
├── icons/                 # Extension icons
└── README.md              # This file
```

### Testing

1. Load the extension in developer mode
2. Open your n8n instance
3. Navigate to a workflow
4. Check browser console (F12) for any errors
5. Test the push functionality with a test workflow

## License

MIT License - feel free to modify and distribute

## Contributing

Contributions welcome! Please open an issue or pull request.

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

