#!/usr/bin/env node

import { generateText, tool } from 'ai';
import { experimental_createMCPClient } from '@ai-sdk/mcp';
import { openai } from '@ai-sdk/openai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Command } from 'commander';
import { createInterface } from 'readline';
import { z } from 'zod';

const program = new Command();

program
  .name('mcp-agent')
  .description('CLI agent for MCP tools with HTTP transport')
  .version('1.0.0')
  .option('-u, --url <url>', 'MCP server URL', 'http://localhost:3000/mcp')
  .option('-m, --model <model>', 'AI model to use', 'gpt-5')
  .option('-p, --prompt <prompt>', 'Prompt to execute')
  .option('--headless', 'Run in headless mode (autonomous execution)', false)
  .option('--max-steps <number>', 'Maximum number of steps', '20')
  .option('--api-key <key>', 'OpenAI API key (or set OPENAI_API_KEY env var)')
  .parse(process.argv);

const options = program.opts();

// Validate API key
if (!options.apiKey && !process.env.OPENAI_API_KEY) {
  console.error('Error: OpenAI API key required. Set OPENAI_API_KEY environment variable or use --api-key option.');
  process.exit(1);
}

let client;

async function initializeMCPClient(serverUrl) {
  try {
    console.log(`\nConnecting to MCP server at ${serverUrl}...`);
    const transport = new StreamableHTTPClientTransport(new URL(serverUrl));

    const mcpClient = await experimental_createMCPClient({
      transport,
    });

    console.log('✓ Connected to MCP server');
    return mcpClient;
  } catch (error) {
    console.error(`Failed to connect to MCP server: ${error.message}`);
    throw error;
  }
}

async function executePrompt(prompt, tools, modelName, maxSteps) {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Prompt: ${prompt}`);
    console.log(`${'='.repeat(60)}\n`);

    const systemPrompt = ``;

    const response = await generateText({
      model: openai(modelName, {
        apiKey: options.apiKey || process.env.OPENAI_API_KEY,
      }),
      tools,
      maxSteps: parseInt(maxSteps),
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }],
        },
      ],
      onStepFinish: (step) => {
        console.log(`\n--- Step ${step.stepNumber} ---`);
        if (step.toolCalls && step.toolCalls.length > 0) {
          console.log('Tool Calls:');
          step.toolCalls.forEach((call) => {
            console.log(`  - ${call.toolName}(${JSON.stringify(call.args, null, 2)})`);
          });
        }
        if (step.toolResults && step.toolResults.length > 0) {
          console.log('Tool Results:');
          step.toolResults.forEach((result) => {
            console.log(`  - ${result.toolName}: ${JSON.stringify(result.result, null, 2)}`);
          });
        }
        if (step.text) {
          console.log(`Response: ${step.text}`);
        }
      },
    });

    console.log(`\n${'='.repeat(60)}`);
    console.log('Final Response:');
    console.log(`${'='.repeat(60)}`);
    console.log(response.text);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Total Steps: ${response.steps.length}`);
    console.log(`Finish Reason: ${response.finishReason}`);
    console.log(`Usage: ${JSON.stringify(response.usage, null, 2)}`);
    console.log(`${'='.repeat(60)}\n`);

    return response;
  } catch (error) {
    console.error(`Error executing prompt: ${error.message}`);
    throw error;
  }
}

async function interactiveMode(tools, modelName, maxSteps) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n> ',
  });

  console.log('\n=== Interactive Mode ===');
  console.log('Type your prompts below. Type "exit" or "quit" to stop.\n');

  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();

    if (input === 'exit' || input === 'quit') {
      console.log('Exiting...');
      rl.close();
      break;
    }

    if (!input) {
      rl.prompt();
      continue;
    }

    try {
      await executePrompt(input, tools, modelName, maxSteps);
    } catch (error) {
      console.error('Error:', error.message);
    }

    rl.prompt();
  }
}

async function main() {
  try {
    // Initialize MCP client
    client = await initializeMCPClient(options.url);

    // Get tools from MCP server
    console.log('Fetching tools from MCP server...');
    const tools = await client.tools();
    const toolNames = Object.keys(tools);
    console.log(`✓ Loaded ${toolNames.length} tools: ${toolNames.join(', ')}\n`);

    if (options.headless && !options.prompt) {
      console.error('Error: --prompt is required when running in headless mode');
      process.exit(1);
    }

    if (options.headless) {
      // Headless mode: execute prompt and exit
      console.log('Running in headless mode...');
      await executePrompt(options.prompt, tools, options.model, options.maxSteps);
    } else if (options.prompt) {
      // Execute single prompt and then start interactive mode
      await executePrompt(options.prompt, tools, options.model, options.maxSteps);
      await interactiveMode(tools, options.model, options.maxSteps);
    } else {
      // Interactive mode only
      await interactiveMode(tools, options.model, options.maxSteps);
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    if (client) {
      console.log('\nClosing MCP client...');
      await client.close();
      console.log('✓ MCP client closed');
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nReceived SIGINT, shutting down gracefully...');
  if (client) {
    await client.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\nReceived SIGTERM, shutting down gracefully...');
  if (client) {
    await client.close();
  }
  process.exit(0);
});

main();
