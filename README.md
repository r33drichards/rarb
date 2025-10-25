# MCP Agent CLI (Deno)

A Deno-based command-line tool that connects to an MCP (Model Context Protocol) server and executes prompts using AI models via OpenAI's API.

## Features

- **MCP Integration**: Connects to MCP servers via HTTP transport
- **AI-Powered**: Executes prompts with tool calling capabilities
- **Multiple Modes**: Headless, single-prompt, and interactive modes
- **Step-by-Step Logging**: Detailed output of tool calls and results
- **Graceful Shutdown**: Handles SIGINT and SIGTERM signals properly

## Prerequisites

- [Deno](https://deno.land/) installed (v1.37 or later recommended)
- OpenAI API key
- An MCP server running (default: http://localhost:3000/mcp)

## Installation

Clone or download this project:

```bash
cd /home/gem/workspace/rarb
```

## Configuration

Set your OpenAI API key as an environment variable:

```bash
export OPENAI_API_KEY="your-api-key-here"
```

Or pass it via the `--api-key` flag when running the script.

## Usage

### Basic Usage

Run in interactive mode:

```bash
deno task start
```

Or run directly:

```bash
deno run --allow-net --allow-read --allow-write --allow-env main.ts
```

### Command-Line Options

- `-u, --url <url>` - MCP server URL (default: http://localhost:3000/mcp)
- `-m, --model <model>` - AI model to use (default: gpt-4o)
- `-p, --prompt <prompt>` - Prompt to execute
- `--headless` - Run in headless mode (autonomous execution)
- `--max-steps <number>` - Maximum number of steps (default: 10)
- `--api-key <key>` - OpenAI API key (alternative to env var)

### Examples

**Interactive Mode:**
```bash
deno task start
```

**Single Prompt:**
```bash
deno run --allow-net --allow-read --allow-write --allow-env main.ts \
  --prompt "go to craigslist and find free things in sf posted today"
```

**Headless Mode:**
```bash
deno run --allow-net --allow-read --allow-write --allow-env main.ts \
  --headless \
  --prompt "go to craigslist and find free things in sf posted today and write to items.csv"
```

**Custom MCP Server:**
```bash
deno run --allow-net --allow-read --allow-write --allow-env main.ts \
  --url "http://localhost:8080/mcp" \
  --prompt "your prompt here"
```

**Different Model:**
```bash
deno run --allow-net --allow-read --allow-write --allow-env main.ts \
  --model "gpt-4-turbo" \
  --prompt "your prompt here"
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

The original prompt from the gist:

```bash
deno run --allow-net --allow-read --allow-write --allow-env main.ts \
  --prompt "go to craigslist and find free things in sf posted today and then write the info to a csv in /home/gem/workspace/items.csv only include interesting things, if its junk i don't care. include the urls in the output. if already in items.csv don't include it twice"
```

This will:
1. Connect to the MCP server
2. Use the available tools to scrape Craigslist
3. Filter for interesting free items in San Francisco
4. Write results to a CSV file
5. Avoid duplicates

## Output

The tool displays:
- Connection status
- Available tools from MCP server
- Step-by-step execution with tool calls and results
- Final response text
- Usage statistics (tokens, steps, etc.)

## Development

Run with auto-reload on file changes:

```bash
deno task dev
```

## Troubleshooting

**API Key Error:**
- Ensure `OPENAI_API_KEY` is set or pass `--api-key`

**MCP Server Connection Failed:**
- Verify the MCP server is running
- Check the URL with `--url` flag

**Permission Errors:**
- Deno requires explicit permissions
- The script needs: `--allow-net`, `--allow-read`, `--allow-write`, `--allow-env`

## License

Original script from [gist](https://gist.githubusercontent.com/r33drichards/fcf6777117a4bc483943aaec4de942e3/raw/ca1ed7baf9a7245749a7b9c902eaf39211c9a035/retail-arb.md)
