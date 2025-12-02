import { FleetParser } from '../lib/fleet-parser';
import { LettaClientWrapper } from '../lib/letta-client';
import * as fs from 'fs';
import * as path from 'path';

export async function applyCommand(options: { file: string; agent?: string; dryRun?: boolean }, command: any) {
  const verbose = command.parent?.opts().verbose || false;
  try {
    console.log(`Applying configuration from ${options.file}`);
    
    if (options.dryRun) {
      console.log('Dry-run mode enabled');
    }

    if (options.agent) {
      if (verbose) console.log(`Filtering agents by pattern: ${options.agent}`);
    }

    const parser = new FleetParser(options.file);
    const config = await parser.parseFleetConfig(options.file);
    
    if (verbose) console.log(`Found ${config.agents.length} agents in configuration`);
    
    if (options.dryRun) {
      for (const agent of config.agents) {
        console.log(`Would create/update agent: ${agent.name}`);
        if (agent.folders) {
          for (const folder of agent.folders) {
            console.log(`  Would create folder: ${folder.name} with ${folder.files.length} files`);
          }
        }
      }
      return;
    }

    const client = new LettaClientWrapper();
    const createdFolders = new Map<string, string>(); // folder name -> folder id
    
    // Register required tools
    if (verbose) console.log('Registering tools...');
    const toolNameToId = await parser.registerRequiredTools(config, client, verbose);
    
    // Create/get all folders with duplicate prevention
    if (verbose) console.log('Processing folders...');
    const foldersResponse = await client.listFolders();
    const existingFolders = Array.isArray(foldersResponse) ? foldersResponse : (foldersResponse as any).items || [];
    
    for (const agent of config.agents) {
      if (options.agent && !agent.name.includes(options.agent)) continue;
      
      if (agent.folders) {
        for (const folderConfig of agent.folders) {
          if (createdFolders.has(folderConfig.name)) {
            if (verbose) console.log(`Using existing folder: ${folderConfig.name}`);
            continue;
          }
          
          // Check if folder already exists
          let folder = existingFolders.find((f: any) => f.name === folderConfig.name);
          
          if (!folder) {
            if (verbose) console.log(`Creating folder: ${folderConfig.name}`);
            folder = await client.createFolder({
              name: folderConfig.name,
              embedding: agent.embedding || "letta/letta-free"
            });
            console.log(`Created folder: ${folderConfig.name}`);
            createdFolders.set(folderConfig.name, folder.id);
            
            // Upload files only to newly created folders
            if (verbose) console.log(`Uploading ${folderConfig.files.length} files...`);
            for (const filePath of folderConfig.files) {
              try {
                const resolvedPath = path.resolve(parser.basePath, filePath);
                
                if (!fs.existsSync(resolvedPath)) {
                  console.warn(`File not found, skipping: ${filePath}`);
                  continue;
                }

                if (verbose) console.log(`  Uploading ${filePath}...`);
                const fileStream = fs.createReadStream(resolvedPath);
                
                await client.uploadFileToFolder(
                  fileStream,
                  folder.id,
                  path.basename(filePath)
                );
                
                if (verbose) console.log(`  Uploaded: ${filePath}`);
              } catch (error: any) {
                console.error(`  Failed to upload ${filePath}:`, error.message);
              }
            }
          } else {
            if (verbose) console.log(`Using existing folder: ${folderConfig.name}`);
            if (verbose) console.log('  (Skipping file upload - files already exist)');
            createdFolders.set(folderConfig.name, folder.id);
          }
        }
      }
    }
    
    // Create agents with memory blocks
    if (verbose) console.log('Processing agents...');
    for (const agent of config.agents) {
      if (options.agent && !agent.name.includes(options.agent)) continue;

      console.log(`Processing agent: ${agent.name}`);
      if (verbose) {
        console.log(`  Description: ${agent.description}`);
        console.log(`  Tools: ${agent.tools.join(', ')}`);
        console.log(`  Memory blocks: ${agent.memory_blocks?.length || 0}`);
        console.log(`  Folders: ${agent.folders?.length || 0}`);
      }
      
      try {
        // Create memory blocks
        const blockIds: string[] = [];
        
        if (agent.memory_blocks) {
          for (const block of agent.memory_blocks) {
            if (verbose) console.log(`  Creating memory block: ${block.name}`);
            const createdBlock = await client.createBlock({
              label: block.name,
              description: block.description,
              value: block.value || '',
              limit: block.limit
            });
            blockIds.push(createdBlock.id);
            if (verbose) console.log(`  Created block: ${block.name}`);
          }
        }

        // Create agent
        if (verbose) console.log(`  Creating agent...`);
        
        // Resolve tool names to IDs
        const toolIds: string[] = [];
        if (agent.tools) {
          for (const toolName of agent.tools) {
            const toolId = toolNameToId.get(toolName);
            if (toolId) {
              toolIds.push(toolId);
            } else {
              console.warn(`  Tool not found: ${toolName}`);
            }
          }
        }
        
        const createdAgent = await client.createAgent({
          name: agent.name,
          model: agent.llm_config?.model || "google_ai/gemini-2.5-pro",
          embedding: agent.embedding || "letta/letta-free",
          system: agent.system_prompt.value || '',
          blockIds: blockIds,
          toolIds: toolIds,
          contextWindowLimit: agent.llm_config?.context_window || 64000
        });
        
        // Attach folders to agent
        if (agent.folders) {
          for (const folderConfig of agent.folders) {
            const folderId = createdFolders.get(folderConfig.name);
            if (folderId) {
              if (verbose) console.log(`  Attaching folder ${folderConfig.name}`);
              await client.attachFolderToAgent(createdAgent.id, folderId);
              if (verbose) console.log(`  Folder attached`);
            }
          }
        }
        
        console.log(`Agent ${agent.name} created successfully`);
        
      } catch (error: any) {
        console.error(`Failed to create agent ${agent.name}:`, error.message);
        throw error;
      }
    }

    console.log('Apply completed successfully');
    
  } catch (error) {
    console.error('Apply failed:', error);
    process.exit(1);
  }
}