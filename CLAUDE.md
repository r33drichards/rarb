# RARB Development Workflow

## Overview
This document outlines the development workflow for debugging and testing the RARB (Remote Agentic Reasoner Bot) Kubernetes cronjob deployment.

## Architecture
- **Docker Image**: Built via GitHub Actions, pushed to `wholelottahoopla/rarb:latest`
- **Kubernetes**: CronJob running in `default` namespace, executes every 5 minutes
- **MCP Server**: Accessible at `http://sandbox-mcp:8091/mcp`
- **API Key**: Stored in Kubernetes secret `mcp-agent-secrets-test`

## Development Workflow

### Quick Reference: Main vs Branch Development

**Main Branch (Production):**
- Builds image tagged as `latest` and `<commit-sha>`
- Used by cronjob (pulls `latest`)

**Feature Branches/PRs (Testing):**
- Builds image tagged only as `<commit-sha>`
- Allows testing specific commits without affecting production
- Each PR commit gets its own docker image

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

# Get the commit SHA from recent run
gh run view <run-id> --json headSha -q .headSha
```

### 4. Testing Branch/PR Commits (Using Commit SHA)

When working on a feature branch or PR, you can test specific commits without affecting the production `latest` tag:

```bash
# 1. Get your commit SHA (full 40-character version)
COMMIT_SHA=$(git rev-parse HEAD)
echo "Testing commit: $COMMIT_SHA"

# 2. Wait for GitHub Actions to build and push the image
gh run watch --exit-status

# 3. Update the cronjob to use the specific commit SHA
kubectl set image cronjob/mcp-agent-cronjob -n default \
  mcp-agent=wholelottahoopla/rarb:$COMMIT_SHA

# 4. Create a test job from the updated cronjob
kubectl create job mcp-agent-test-$(date +%s) --from=cronjob/mcp-agent-cronjob -n default

# 5. Monitor the test job
kubectl get pods -n default | grep mcp-agent-test
kubectl logs <pod-name> -n default --tail=500

# 6. When done testing, restore cronjob to use 'latest'
kubectl set image cronjob/mcp-agent-cronjob -n default \
  mcp-agent=wholelottahoopla/rarb:latest
```

**Alternative: One-off test without modifying cronjob**
```bash
# Create a test job with a specific commit SHA without changing the cronjob
COMMIT_SHA=$(git rev-parse HEAD)
kubectl create job mcp-agent-test-$(date +%s) --from=cronjob/mcp-agent-cronjob -n default --dry-run=client -o yaml | \
  sed "s|wholelottahoopla/rarb:latest|wholelottahoopla/rarb:$COMMIT_SHA|g" | \
  kubectl apply -f -
```

### 5. Create Manual Test Job (Production/Latest)
Once the build completes, create a manual test job from the cronjob:

```bash
kubectl create job mcp-agent-test-$(date +%s) --from=cronjob/mcp-agent-cronjob -n default
```

The cronjob is configured with `imagePullPolicy: Always`, so it automatically pulls the latest image.

### 6. Monitor Job Execution
```bash
# Check job status
kubectl get jobs -n default | grep mcp-agent

# Get pod name
kubectl get pods -n default | grep mcp-agent-test

# View logs
kubectl logs <pod-name> -n default --tail=500
```

### 7. Check Cronjob Execution
```bash
# View cronjob status
kubectl get cronjobs mcp-agent-cronjob -n default -o wide

# List all jobs created by the cronjob
kubectl get jobs -n default | grep mcp-agent-cronjob

# Get logs from latest cronjob execution
kubectl get jobs -n default --sort-by=.metadata.creationTimestamp | grep mcp-agent-cronjob | tail -1 | awk '{print $1}' | xargs -I {} kubectl logs job/{} -n default
```

### 8. Clean Up Test Jobs
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

### Image Tagging Strategy

**Main Branch:**
- Tags: `latest`, `<full-commit-sha>`
- Pushes to: Docker Hub
- Used by: Production cronjob

**Feature Branches/PRs:**
- Tags: `<full-commit-sha>`
- Pushes to: Docker Hub
- Used by: Testing specific commits
- Does NOT update `latest` tag

This allows safe testing of branch commits without affecting production deployments.

## Branch Development & Testing Workflow

### Important: Flux CD Management

The `mcp-agent-cronjob` is managed by Flux CD, which automatically reconciles the cronjob configuration from the Git repository. This means:

1. **Direct kubectl changes will be reverted** - Flux will reset the cronjob to match the repository state
2. **Changes must be committed to Git** - All cronjob configuration changes need to be in `clusters/k3s/cronjob.yaml`
3. **Testing branches requires specific workflow** - See below for how to test branch commits

### Complete Branch Testing Workflow

When developing on a feature branch (example: `vk/7a32-save-output-to-p`):

```bash
# 1. Make your code changes
vim index.js db/tools.js  # or any files

# 2. Commit and push to create a PR
git add .
git commit -m "Your changes"
git push --set-upstream origin your-branch-name

# 3. Create PR (triggers Docker build)
gh pr create --title "Your title" --body "Description"

# 4. Wait for build and get the commit SHA
gh run watch --exit-status  # Wait for build to complete
COMMIT_SHA=$(gh run view --json headSha -q .headSha)

# Or get SHA from build logs:
gh run view <run-id> --log | grep "wholelottahoopla/rarb:" | head -1 | grep -oE '[0-9a-f]{40}'

# 5. Test with the specific commit image
# Option A: Create one-off test job without modifying cronjob
kubectl create job mcp-agent-test-$(date +%s) --from=cronjob/mcp-agent-cronjob -n default \
  --dry-run=client -o yaml | \
  sed "s|wholelottahoopla/rarb:latest|wholelottahoopla/rarb:$COMMIT_SHA|g" | \
  kubectl apply -f -

# Option B: Temporarily update cronjob (will be reverted by Flux)
kubectl set image cronjob/mcp-agent-cronjob -n default \
  mcp-agent=wholelottahoopla/rarb:$COMMIT_SHA
kubectl create job mcp-agent-test-$(date +%s) --from=cronjob/mcp-agent-cronjob -n default

# 6. Monitor the test
POD_NAME=$(kubectl get pods -n default | grep mcp-agent-test | tail -1 | awk '{print $1}')
kubectl logs -f $POD_NAME -n default

# 7. Check results
kubectl get jobs -n default | grep mcp-agent-test
kubectl logs $POD_NAME -n default | grep -E "(Error|success|database)"
```

### Testing Database Features

When testing database-related changes:

```bash
# Initialize the database (one time)
kubectl apply -f clusters/k3s/db-init-job.yaml

# Monitor database initialization
kubectl get jobs -n default | grep rarb-db-init
kubectl logs <db-init-pod-name> -n default

# Query database to verify data
kubectl run -it --rm pg-client --image=postgres:16-alpine --restart=Never \
  --env="PGPASSWORD=CHANGE_ME" -- \
  psql -h postgres -U sandbox -d rarb_outputs -c \
  "SELECT id, title, url, created_at FROM agent_outputs ORDER BY created_at DESC LIMIT 10;"
```

### Common Debugging Steps on Branch

1. **Check if tools are loaded correctly:**
```bash
kubectl logs $POD_NAME -n default | grep "Loaded.*tools"
# Should show: "✓ Loaded 14 tools (10 MCP + 4 database)"
```

2. **Check database connection:**
```bash
kubectl logs $POD_NAME -n default | head -20
# Should show database initialization messages
```

3. **Check for schema errors:**
```bash
kubectl logs $POD_NAME -n default | grep -E "(schema|Error)"
```

4. **View full execution flow:**
```bash
kubectl logs $POD_NAME -n default --tail=500
```

### Troubleshooting

**Issue**: Cronjob keeps reverting to old configuration
**Cause**: Flux CD is managing the cronjob and syncing from Git
**Solution**: Commit changes to `clusters/k3s/cronjob.yaml` in your branch

**Issue**: `--max-steps` error
**Cause**: Old cronjob configuration in Git
**Solution**: Update `clusters/k3s/cronjob.yaml` to remove --max-steps argument

**Issue**: Database tools not loading
**Cause**: Missing DB environment variables
**Solution**: Ensure cronjob.yaml includes DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD

**Issue**: Zod schema validation error "type: None"
**Cause**: Using `.optional()` in Zod schemas with AI SDK
**Solution**: Use required strings with `.describe()` that mention "(can be empty string)"

### Merging to Production

Once testing is complete on your branch:

```bash
# 1. Merge PR to main
gh pr merge --squash  # or --merge or --rebase

# 2. Flux will automatically:
#    - Detect the changes in main branch
#    - Update the cronjob configuration
#    - Pull the new 'latest' Docker image

# 3. Verify deployment
kubectl get cronjob mcp-agent-cronjob -n default -o yaml | grep image:
# Should show: image: wholelottahoopla/rarb:latest

# 4. Monitor next scheduled run
kubectl get cronjobs mcp-agent-cronjob -n default -o wide
```


