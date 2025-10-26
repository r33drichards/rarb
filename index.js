#!/usr/bin/env node

import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
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

// Convert JSON Schema to Zod schema (improved version with better handling)
function jsonSchemaToZod(schema) {
  if (!schema || typeof schema !== 'object') {
    return z.any();
  }

  // Handle union types (oneOf, anyOf)
  if (schema.oneOf || schema.anyOf) {
    const variants = schema.oneOf || schema.anyOf;
    if (variants.length === 0) return z.any();
    if (variants.length === 1) return jsonSchemaToZod(variants[0]);

    // For multiple variants, use z.union
    const zodSchemas = variants.map(v => jsonSchemaToZod(v));
    return z.union(zodSchemas);
  }

  // Handle object type
  if (schema.type === 'object' || schema.properties) {
    const shape = {};
    const requiredFields = new Set(schema.required || []);

    // Process properties
    if (schema.properties) {
      for (const [key, value] of Object.entries(schema.properties)) {
        let zodField = jsonSchemaToZod(value);

        // Make field optional if it's not in the required array
        if (!requiredFields.has(key)) {
          zodField = zodField.optional();
        }

        // Add default value if specified
        if (value.default !== undefined) {
          zodField = zodField.default(value.default);
        }

        shape[key] = zodField;
      }
    }

    // If no properties but type is object, allow any object
    if (Object.keys(shape).length === 0) {
      return z.record(z.any());
    }

    return z.object(shape);
  }

  if (schema.type === 'string') {
    let zodString = z.string();
    if (schema.enum) {
      zodString = z.enum(schema.enum);
    }
    return zodString;
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    return z.number();
  }

  if (schema.type === 'boolean') {
    return z.boolean();
  }

  if (schema.type === 'array') {
    return z.array(jsonSchemaToZod(schema.items || {}));
  }

  // Handle null type
  if (schema.type === 'null') {
    return z.null();
  }

  // If type is not specified but properties exist, treat as object
  if (schema.properties && !schema.type) {
    return jsonSchemaToZod({ ...schema, type: 'object' });
  }

  return z.any();
}

async function initializeMCPClient(serverUrl) {
  try {
    console.log(`\nConnecting to MCP server at ${serverUrl}...`);
    const transport = new StreamableHTTPClientTransport(new URL(serverUrl));

    const mcpClient = new Client(
      {
        name: 'mcp-agent-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await mcpClient.connect(transport);
    console.log('✓ Connected to MCP server');

    return {
      client: mcpClient,
      async tools() {
        const toolsList = await mcpClient.listTools();
        const tools = {};

        for (const mcpTool of toolsList.tools) {
          const zodSchema = mcpTool.inputSchema
            ? jsonSchemaToZod(mcpTool.inputSchema)
            : z.object({});

          tools[mcpTool.name] = tool({
            description: mcpTool.description || mcpTool.name,
            parameters: zodSchema,
            execute: async (args) => {
              const result = await mcpClient.callTool({
                name: mcpTool.name,
                arguments: args,
              });

              // Summarize browser screenshots to save tokens
              if (mcpTool.name === 'browser_screenshot' && result.content && result.content.length > 0) {
                for (const item of result.content) {
                  if (item.type === 'image' && item.data) {
                    try {
                      const { generateText } = await import('ai');
                      const { openai } = await import('@ai-sdk/openai');

                      // Format image data for AI SDK
                      // The data might be base64 string, convert to Buffer for AI SDK
                      let imageData = item.data;
                      const mimeType = item.mimeType || 'image/jpeg';

                      console.log(`📸 Raw data type: ${typeof imageData}, starts with: ${typeof imageData === 'string' ? imageData.substring(0, 50) : 'N/A'}`);

                      // Convert base64 string to Buffer if needed
                      if (typeof imageData === 'string') {
                        // Remove data URI prefix if present
                        if (imageData.startsWith('data:')) {
                          imageData = imageData.split(',')[1];
                        }
                        // Convert base64 to Buffer
                        imageData = Buffer.from(imageData, 'base64');
                      }

                      console.log(`📸 Summarizing screenshot... (image type: ${mimeType}, data is Buffer: ${Buffer.isBuffer(imageData)}, size: ${imageData.length} bytes)`);

                      const summary = await generateText({
                        model: openai('gpt-4o', {
                          apiKey: options.apiKey || process.env.OPENAI_API_KEY,
                        }),
                        messages: [{
                          role: 'user',
                          content: [
                            { type: 'text', text: 'Describe what you see on this webpage in 3-4 sentences. Focus on: 1) Main headings and titles 2) Links and their text 3) Any forms or interactive elements 4) Key content or listings visible. Be specific about text you can read.' },
                            { type: 'image', image: imageData, mimeType }
                          ]
                        }]
                      });

                      // Replace image data with summary
                      item.type = 'text';
                      item.text = `[Screenshot summary] ${summary.text}`;
                      delete item.data;
                      delete item.mimeType;
                      delete item.annotations;

                      console.log(`✓ Screenshot summarized: ${summary.text}`);
                    } catch (err) {
                      console.error(`Error summarizing screenshot: ${err.message}`);
                      // Fallback: just remove the image data
                      item.type = 'text';
                      item.text = '[Screenshot taken but could not be summarized]';
                      delete item.data;
                    }
                  }
                }
              }

              return result.content;
            },
          });
        }

        return tools;
      },
      async close() {
        if (mcpClient && typeof mcpClient.close === 'function') {
          await mcpClient.close();
        }
      }
    };
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

    const systemPrompt = `You are a browser automation expert. When navigating to URLs:

1. **Close any popups first**: If you see a popup or dialog, press Escape to close it
2. **Navigate to URLs properly**:
   - Use HOTKEY with ["control", "l"] to focus the address bar (or ["command", "l"] on Mac)
   - Then use TYPING with use_clipboard: true to type the URL
   - Then use HOTKEY with ["enter"] to navigate
3. **Key names**: Always use lowercase for keys (e.g., "enter" not "Enter", "escape" not "Escape")
4. **Wait for page loads**: After navigation, use WAIT action for 3-5 seconds to let the page load
5. **Take screenshots**: After waiting, take a screenshot to verify the page loaded correctly
6. **Be persistent**: If a navigation fails, try closing popups first, then repeat the navigation sequence

Common browser actions:
- Close popup: HOTKEY with ["escape"]
- Focus address bar: HOTKEY with ["control", "l"]
- Type URL: TYPING with use_clipboard: true
- Navigate: HOTKEY with ["enter"]
- Wait for load: WAIT with duration: 3-5

When scraping data:
- Read all visible items on the current page before scrolling
- Scroll down to load more items: HOTKEY with ["pagedown"] or execute scroll JavaScript
- Take screenshots after scrolling to verify new content loaded
- Extract data systematically, keeping track of what you've already collected`;

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
