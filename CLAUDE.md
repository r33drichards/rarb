# RARB Development Workflow

## Overview
This document outlines the development workflow for debugging and testing the RARB (Remote Agentic Reasoner Bot) Kubernetes cronjob deployment.

## Architecture
- **Docker Image**: Built via GitHub Actions, pushed to `wholelottahoopla/rarb:latest`
- **Kubernetes**: CronJob running in `default` namespace, executes every 5 minutes
- **MCP Server**: Accessible at `http://sandbox-mcp:8091/mcp`
- **API Key**: Stored in Kubernetes secret `mcp-agent-secrets-test`

## Development Workflow

### 1. Make Code Changes
Edit `index.js` locally with your changes.

### 2. Commit and Push
```bash
git add index.js
git commit -m "Your change description"
git push
```

The GitHub Actions workflow (`.github/workflows/docker-publish.yml`) automatically:
- Builds the Docker image
- Pushes to Docker Hub as `wholelottahoopla/rarb:latest`

### 3. Monitor GitHub Actions Build
```bash
# Authenticate with GitHub CLI (one-time)
gh auth login --web

# List recent runs
gh run list --limit 5

# Watch specific run
gh run watch <run-id> --exit-status
```

### 4. Create Manual Test Job
Once the build completes, create a manual test job from the cronjob:

```bash
kubectl create job mcp-agent-test-$(date +%s) --from=cronjob/mcp-agent-cronjob -n default
```

The cronjob is configured with `imagePullPolicy: Always`, so it automatically pulls the latest image.

### 5. Monitor Job Execution
```bash
# Check job status
kubectl get jobs -n default | grep mcp-agent

# Get pod name
kubectl get pods -n default | grep mcp-agent-test

# View logs
kubectl logs <pod-name> -n default --tail=500
```

### 6. Check Cronjob Execution
```bash
# View cronjob status
kubectl get cronjobs mcp-agent-cronjob -n default -o wide

# List all jobs created by the cronjob
kubectl get jobs -n default | grep mcp-agent-cronjob

# Get logs from latest cronjob execution
kubectl get jobs -n default --sort-by=.metadata.creationTimestamp | grep mcp-agent-cronjob | tail -1 | awk '{print $1}' | xargs -I {} kubectl logs job/{} -n default
```

### 7. Clean Up Test Jobs
```bash
# Delete specific test job
kubectl delete job <job-name> -n default

# Delete all completed jobs
kubectl delete jobs -n default --field-selector status.successful=1
```

## Common Issues Debugged

### Screenshot Summarization Fix (Oct 2025)
**Problem**: Browser screenshots were being taken but the AI model couldn't view the image content.

**Root Cause**: The AI SDK expected image data as a Buffer, not a data URI string.

**Solution** (see commits 290381e, bf44335, b71f0b3):
1. Convert base64 string to Buffer: `Buffer.from(base64Data, 'base64')`
2. Use gpt-4o instead of gpt-4o-mini for better vision capabilities
3. Pass mimeType as separate parameter

**Code**:
```javascript
// Convert base64 string to Buffer
if (typeof imageData === 'string') {
  if (imageData.startsWith('data:')) {
    imageData = imageData.split(',')[1];
  }
  imageData = Buffer.from(imageData, 'base64');
}

// Use gpt-4o with Buffer and mimeType
const summary = await generateText({
  model: openai('gpt-4o', { apiKey: process.env.OPENAI_API_KEY }),
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Describe what you see...' },
      { type: 'image', image: imageData, mimeType }
    ]
  }]
});
```

## Useful Commands

### View Cronjob Configuration
```bash
kubectl get cronjob mcp-agent-cronjob -n default -o yaml
```

### Update Cronjob Environment Variables
```bash
kubectl edit cronjob mcp-agent-cronjob -n default
```

### View Secret
```bash
kubectl get secret mcp-agent-secrets-test -n default -o yaml
```

### Suspend/Resume Cronjob
```bash
# Suspend
kubectl patch cronjob mcp-agent-cronjob -n default -p '{"spec":{"suspend":true}}'

# Resume
kubectl patch cronjob mcp-agent-cronjob -n default -p '{"spec":{"suspend":false}}'
```

## Debug Logging Best Practices

When debugging, add detailed console.log statements:
```javascript
console.log(`📸 Raw data type: ${typeof imageData}, starts with: ${imageData.substring(0, 50)}`);
console.log(`📸 Summarizing screenshot... (size: ${imageData.length} bytes)`);
console.log(`✓ Screenshot summarized: ${summary.text}`);
```

This helps identify issues in the Kubernetes pod logs without needing to rebuild/redeploy repeatedly.

## Testing Locally

To test the code locally without deploying to Kubernetes:
```bash
# Set environment variables
export OPENAI_API_KEY="your-key-here"
export MCP_URL="http://localhost:3000/mcp"

# Run in headless mode
node index.js --headless --prompt "your test prompt"

# Run in interactive mode
node index.js
```

## CI/CD Pipeline

The GitHub Actions workflow builds for multiple platforms:
- linux/amd64
- linux/arm64

Build cache is enabled for faster subsequent builds using GitHub Actions cache.
