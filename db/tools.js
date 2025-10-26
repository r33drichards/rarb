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
      description: 'Save a single item to the database. Automatically prevents duplicates based on title and URL. Returns the saved item with ID and timestamps.',
      parameters: z.object({
        title: z.string().describe('Title of the item (required)'),
        description: z.string().optional().describe('Description of the item'),
        url: z.string().optional().describe('URL of the item'),
        category: z.string().optional().describe('Category of the item (e.g., "free stuff", "furniture", "electronics")'),
      }),
      execute: async ({ title, description, url, category }) => {
        try {
          const result = await saveOutput({ title, description, url, category });
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
      description: 'Save multiple items to the database in a single batch operation. More efficient than saving items one by one. Automatically prevents duplicates and provides a summary of results.',
      parameters: z.object({
        items: z.array(z.object({
          title: z.string().describe('Title of the item'),
          description: z.string().optional().describe('Description of the item'),
          url: z.string().optional().describe('URL of the item'),
          category: z.string().optional().describe('Category of the item'),
        })).describe('Array of items to save'),
      }),
      execute: async ({ items }) => {
        const results = await saveOutputBatch(items);
        return {
          success: true,
          message: `Batch save completed: ${results.saved} saved, ${results.updated} updated, ${results.failed} failed`,
          summary: results,
        };
      },
    }),

    getRecentItems: tool({
      description: 'Get recently saved items from the database. Useful for checking what has already been saved to avoid duplicates.',
      parameters: z.object({
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
      parameters: z.object({
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
