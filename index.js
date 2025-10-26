#!/usr/bin/env node

import { generateText, tool, experimental_createMCPClient } from 'ai';
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

// Sanitize JSON Schema for GPT-5 strict validation
function sanitizeJsonSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const sanitized = { ...schema };

  // Remove additionalProperties if it doesn't have a type
  if (sanitized.additionalProperties !== undefined) {
    if (typeof sanitized.additionalProperties === 'object' && !sanitized.additionalProperties.type) {
      delete sanitized.additionalProperties;
    } else if (sanitized.additionalProperties === true) {
      // Convert true to proper schema
      delete sanitized.additionalProperties;
    } else if (sanitized.additionalProperties === false) {
      // Keep false as is
    } else if (typeof sanitized.additionalProperties === 'object') {
      sanitized.additionalProperties = sanitizeJsonSchema(sanitized.additionalProperties);
    }
  }

  // Recursively sanitize properties
  if (sanitized.properties) {
    sanitized.properties = Object.fromEntries(
      Object.entries(sanitized.properties).map(([key, value]) => [
        key,
        sanitizeJsonSchema(value)
      ])
    );
  }

  // Recursively sanitize items (for arrays)
  if (sanitized.items) {
    sanitized.items = sanitizeJsonSchema(sanitized.items);
  }

  // Recursively sanitize oneOf/anyOf/allOf
  if (sanitized.oneOf) {
    sanitized.oneOf = sanitized.oneOf.map(s => sanitizeJsonSchema(s));
  }
  if (sanitized.anyOf) {
    sanitized.anyOf = sanitized.anyOf.map(s => sanitizeJsonSchema(s));
  }
  if (sanitized.allOf) {
    sanitized.allOf = sanitized.allOf.map(s => sanitizeJsonSchema(s));
  }

  return sanitized;
}

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
