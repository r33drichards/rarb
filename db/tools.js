import { tool } from 'ai';
import { z } from 'zod';
import { saveOutput, saveOutputBatch, getRecentOutputs, itemExists } from './database.js';

/**
 * Create database tools for the MCP agent
 * These tools allow the agent to interact with the PostgreSQL database
 */
export function createDatabaseTools() {
  return {
    saveItemToDatabase: tool({
      description: 'Save a single item to the database. Automatically prevents duplicates based on title and URL. Returns the saved item with ID and timestamps. Optional fields can be empty strings.',
      inputSchema: z.object({
        title: z.string().describe('Title of the item (required)'),
        description: z.string().describe('Description of the item (can be empty string)'),
        url: z.string().describe('URL of the item (can be empty string)'),
        category: z.string().describe('Category of the item like "free stuff" (can be empty string)'),
      }),
      execute: async ({ title, description, url, category }) => {
        try {
          const result = await saveOutput({
            title,
            description: description || undefined,
            url: url || undefined,
            category: category || undefined
          });
          return {
            success: true,
            message: 'Item saved successfully',
            item: result,
          };
        } catch (error) {
          if (error.message.includes('duplicate')) {
            return {
              success: false,
              message: 'Item already exists in database (duplicate)',
              error: error.message,
            };
          }
          throw error;
        }
      },
    }),

    saveItemsToDatabase: tool({
      description: 'Save multiple items to the database in a single batch operation. More efficient than saving items one by one. Automatically prevents duplicates and provides a summary of results. Optional fields can be empty strings.',
      inputSchema: z.object({
        items: z.array(z.object({
          title: z.string().describe('Title of the item'),
          description: z.string().describe('Description (can be empty string)'),
          url: z.string().describe('URL (can be empty string)'),
          category: z.string().describe('Category (can be empty string)'),
        })).describe('Array of items to save'),
      }),
      execute: async ({ items }) => {
        // Clean up empty strings to undefined for database
        const cleanedItems = items.map(item => ({
          title: item.title,
          description: item.description || undefined,
          url: item.url || undefined,
          category: item.category || undefined,
        }));
        const results = await saveOutputBatch(cleanedItems);
        return {
          success: true,
          message: `Batch save completed: ${results.saved} saved, ${results.updated} updated, ${results.failed} failed`,
          summary: results,
        };
      },
    }),

    getRecentItems: tool({
      description: 'Get recently saved items from the database. Useful for checking what has already been saved to avoid duplicates.',
      inputSchema: z.object({
        limit: z.number().describe('Maximum number of items to return (default: 100)').default(100),
        days: z.number().describe('Number of days to look back (default: 7)').default(7),
      }),
      execute: async ({ limit = 100, days = 7 }) => {
        const items = await getRecentOutputs(limit, days);
        return {
          success: true,
          count: items.length,
          items: items,
        };
      },
    }),

    checkItemExists: tool({
      description: 'Check if an item with a specific URL already exists in the database. Returns true if exists, false otherwise.',
      inputSchema: z.object({
        url: z.string().describe('URL to check for existence'),
      }),
      execute: async ({ url }) => {
        const exists = await itemExists(url);
        return {
          success: true,
          exists: exists,
          message: exists ? 'Item exists in database' : 'Item not found in database',
        };
      },
    }),
  };
}
