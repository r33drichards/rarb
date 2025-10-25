# MCP Agent CLI

[![Docker Image](https://img.shields.io/badge/docker-wholelottahoopla%2Frarb-blue?logo=docker)](https://hub.docker.com/r/wholelottahoopla/rarb)
[![Build Status](https://github.com/r33drichards/rarb/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/r33drichards/rarb/actions/workflows/docker-publish.yml)

A command-line tool that connects to an MCP (Model Context Protocol) server and executes prompts using AI models via OpenAI's API. Available in both Node.js and Deno versions.

## Features

- **MCP Integration**: Connects to MCP servers via HTTP transport
- **AI-Powered**: Executes prompts with tool calling capabilities
- **Multiple Modes**: Headless, single-prompt, and interactive modes
- **Step-by-Step Logging**: Detailed output of tool calls and results
- **Graceful Shutdown**: Handles SIGINT and SIGTERM signals properly
- **Docker Support**: Pre-built multi-arch images available on Docker Hub
- **CI/CD**: Automated builds on every commit with GitHub Actions

## Prerequisites

Choose one of the following:
- **Node.js**: v22 or later
- **Deno**: v1.37 or later
- **Docker**: Latest version

Additionally:
- OpenAI API key
- An MCP server running (default: http://localhost:3000/mcp)

## Installation

### Option 1: Node.js (Recommended)

```bash
git clone https://github.com/r33drichards/rarb.git
cd rarb
npm install
```

### Option 2: Deno

```bash
git clone https://github.com/r33drichards/rarb.git
cd rarb
# No installation needed, dependencies are managed by Deno
```

### Option 3: Docker

**Pull from Docker Hub (recommended):**
```bash
docker pull wholelottahoopla/rarb:latest
```

**Or build locally:**
```bash
git clone https://github.com/r33drichards/rarb.git
cd rarb
docker build -t wholelottahoopla/rarb:latest .
```

**Available tags:**
- `latest` - Latest build from main branch
- `<commit-sha>` - Specific commit version (e.g., `abc123def456...`)

## Configuration

Set your OpenAI API key as an environment variable:

```bash
export OPENAI_API_KEY="your-api-key-here"
```

Or pass it via the `--api-key` flag when running the script.

## Usage

### Basic Usage

**Node.js:**
```bash
node index.js
```

**Deno:**
```bash
deno task start
# or
deno run --allow-net --allow-read --allow-write --allow-env main.ts
```

**Docker:**
```bash
docker run --rm \
  -e OPENAI_API_KEY="your-key" \
  --network host \
  wholelottahoopla/rarb:latest
```

### Command-Line Options

- `-u, --url <url>` - MCP server URL (default: http://localhost:3000/mcp)
- `-m, --model <model>` - AI model to use (default: gpt-4o)
- `-p, --prompt <prompt>` - Prompt to execute
- `--headless` - Run in headless mode (autonomous execution)
- `--max-steps <number>` - Maximum number of steps (default: 10)
- `--api-key <key>` - OpenAI API key (alternative to env var)

### Examples

#### Interactive Mode

**Node.js:**
```bash
node index.js
```

**Docker:**
```bash
docker run -it --rm \
  -e OPENAI_API_KEY="your-key" \
  --network host \
  wholelottahoopla/rarb:latest \
  --url "http://localhost:8080/mcp"
```

#### Single Prompt

**Node.js:**
```bash
node index.js \
  --prompt "go to craigslist and find free things in sf posted today"
```

**Docker:**
```bash
docker run --rm \
  -e OPENAI_API_KEY="your-key" \
  --network host \
  wholelottahoopla/rarb:latest \
  --prompt "go to craigslist and find free things in sf posted today"
```

#### Headless Mode with Output File

**Node.js:**
```bash
node index.js \
  --headless \
  --prompt "go to craigslist and find free things in sf posted today and write to items.csv"
```

**Docker with volume mount:**
```bash
docker run --rm \
  -e OPENAI_API_KEY="your-key" \
  --network host \
  -v $(pwd)/output:/output \
  wholelottahoopla/rarb:latest \
  --headless \
  --url "http://localhost:8080/mcp" \
  --prompt "go to craigslist and find free things in sf posted today and write to /output/items.csv"
```

#### Custom MCP Server

**Node.js:**
```bash
node index.js \
  --url "http://localhost:8080/mcp" \
  --prompt "your prompt here"
```

#### Different Model

**Node.js:**
```bash
node index.js \
  --model "gpt-4-turbo" \
  --prompt "your prompt here"
```

#### Using Docker Compose

Create a `.env` file with your API key:
```bash
echo "OPENAI_API_KEY=your-key-here" > .env
```

Then run:
```bash
docker-compose up
```

### Execution Modes

1. **Interactive Mode** (default when no prompt is given)
   - Provides a REPL for ongoing conversations
   - Type prompts and get responses interactively
   - Type `exit` or `quit` to stop

2. **Single Prompt Mode** (with `-p` flag)
   - Executes the given prompt
   - Then enters interactive mode

3. **Headless Mode** (with `--headless` flag)
   - Executes a single prompt autonomously
   - Exits after completion
   - Requires `-p` flag

## Example Use Case

The original prompt from the gist - finding free items on Craigslist:

**Node.js:**
```bash
node index.js \
  --url "http://localhost:8080/mcp" \
  --headless \
  --prompt "go to craigslist and find free things in sf posted today and then write the info to a csv in items.csv only include interesting things, if its junk i don't care. include the urls in the output. if already in items.csv don't include it twice"
```

**Docker:**
```bash
docker run --rm \
  -e OPENAI_API_KEY="your-key" \
  --network host \
  -v $(pwd)/output:/output \
  wholelottahoopla/rarb:latest \
  --url "http://localhost:8080/mcp" \
  --headless \
  --prompt "go to craigslist and find free things in sf posted today and write to /output/items.csv only include interesting things, include the urls"
```

This will:
1. Connect to the MCP server
2. Use the available tools to scrape Craigslist
3. Filter for interesting free items in San Francisco
4. Write results to a CSV file with URLs
5. Avoid duplicates

## Output

The tool displays:
- Connection status
- Available tools from MCP server
- Step-by-step execution with tool calls and results
- Final response text
- Usage statistics (tokens, steps, etc.)

## Development

**Node.js:**
```bash
npm install
node index.js
```

**Deno with auto-reload:**
```bash
deno task dev
```

**Docker development:**
```bash
docker build -t wholelottahoopla/rarb:dev .
docker run --rm -it \
  -e OPENAI_API_KEY="your-key" \
  --network host \
  wholelottahoopla/rarb:dev
```

## Docker Details

### Building the Image
```bash
docker build -t wholelottahoopla/rarb:latest .
```

### Running with Environment Variables
```bash
docker run --rm \
  -e OPENAI_API_KEY="your-key" \
  wholelottahoopla/rarb:latest --help
```

### Volume Mounts for Output Files
```bash
# Create output directory
mkdir -p output

# Run with volume mount
docker run --rm \
  -e OPENAI_API_KEY="your-key" \
  -v $(pwd)/output:/output \
  --network host \
  wholelottahoopla/rarb:latest \
  --url "http://localhost:8080/mcp" \
  --prompt "your prompt that writes to /output/file.csv"
```

### Docker Compose
The `docker-compose.yml` file provides an easy way to run the agent:

1. Create a `.env` file:
```bash
OPENAI_API_KEY=your-key-here
```

2. Edit `docker-compose.yml` to customize the command

3. Run:
```bash
docker-compose up
```

## Troubleshooting

**API Key Error:**
- Ensure `OPENAI_API_KEY` is set or pass `--api-key`
- For Docker: Pass via `-e OPENAI_API_KEY="your-key"`

**MCP Server Connection Failed:**
- Verify the MCP server is running
- Check the URL with `--url` flag
- For Docker: Use `--network host` to access localhost services
- Or use `host.docker.internal` instead of `localhost` in the URL

**Permission Errors (Deno):**
- Deno requires explicit permissions
- The script needs: `--allow-net`, `--allow-read`, `--allow-write`, `--allow-env`

**Docker File Access:**
- Use volume mounts (`-v`) to access files from the host
- Write output files to mounted directories

## License

Original script from [gist](https://gist.githubusercontent.com/r33drichards/fcf6777117a4bc483943aaec4de942e3/raw/ca1ed7baf9a7245749a7b9c902eaf39211c9a035/retail-arb.md)
