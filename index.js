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
  .option('-m, --model <model>', 'AI model to use', 'gpt-4o')
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

    const systemPrompt = `You are an autonomous AI agent with access to tools for browser automation, file operations, code execution, and more.

CRITICAL INSTRUCTIONS:
- You MUST use tools to complete the task - do not just describe what you would do
- After receiving tool results, immediately use more tools to continue the task
- Keep executing tools step-by-step until the ENTIRE task is 100% complete
- Do not stop until you have fully accomplished what was requested
- Do not just plan or describe steps - EXECUTE them using tools

Your approach:
1. Use tools to gather information or perform actions
2. Analyze the results
3. Use more tools to continue toward the goal
4. Repeat until task is complete

If you encounter errors, work around them. If a task is impossible, explain why after attempting alternatives.

REMEMBER: You have access to many steps (${maxSteps} total). Use as many as needed to finish the job completely.`;

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

        // Debug: log the full step structure
        console.log('Step finish reason:', step.finishReason);
        console.log('Step has toolCalls:', !!step.toolCalls);
        console.log('Step has toolResults:', !!step.toolResults);

        if (step.toolCalls && step.toolCalls.length > 0) {
          console.log('Tool Calls:');
          step.toolCalls.forEach((call) => {
            // In AI SDK 5.0, use 'input' instead of 'args'
            console.log(`  - ${call.toolName}(${JSON.stringify(call.input || call.args, null, 2)})`);
          });
        }
        if (step.toolResults && step.toolResults.length > 0) {
          console.log('Tool Results:');
          step.toolResults.forEach((result) => {
            // In AI SDK 5.0, use 'output' instead of 'result'
            const output = result.output || result.result;
            console.log(`  - ${result.toolName}: ${JSON.stringify(output, null, 2)}`);
          });
        }
        if (step.text) {
          console.log(`Response: ${step.text}`);
        }

        // Log response messages for debugging
        if (step.responseMessages && step.responseMessages.length > 0) {
          console.log(`Response messages count: ${step.responseMessages.length}`);
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
    console.log(`\n--- Debug: Steps Detail ---`);
    response.steps.forEach((step, idx) => {
      console.log(`Step ${idx + 1}:`);
      console.log(`  - stepType: ${step.stepType}`);
      console.log(`  - finishReason: ${step.finishReason}`);
      console.log(`  - toolCalls: ${step.toolCalls?.length || 0}`);
      console.log(`  - toolResults: ${step.toolResults?.length || 0}`);
      console.log(`  - text length: ${step.text?.length || 0}`);
      console.log(`  - isContinued: ${step.isContinued}`);
      console.log(`  - warnings: ${JSON.stringify(step.warnings)}`);
    });
    console.log(`\n--- Debug: Response Object Analysis ---`);
    console.log(`Object.keys: ${Object.keys(response).join(', ')}`);
    console.log(`Object.getOwnPropertyNames: ${Object.getOwnPropertyNames(response).join(', ')}`);
    console.log(`\nProperty values:`);
    console.log(`  - response.text type: ${typeof response.text}, value: ${response.text?.substring(0, 100) || 'undefined/empty'}`);
    console.log(`  - response.finishReason: ${response.finishReason}`);
    console.log(`  - response.usage: ${JSON.stringify(response.usage)}`);
    console.log(`  - response.resolvedOutput type: ${typeof response.resolvedOutput}`);
    console.log(`  - response.resolvedOutput value: ${JSON.stringify(response.resolvedOutput)?.substring(0, 200)}`);
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
