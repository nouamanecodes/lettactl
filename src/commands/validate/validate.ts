import { FleetParser } from '../../lib/apply/fleet-parser';
import { SupabaseStorageBackend } from '../../lib/storage/storage-backend';
import { output, error } from '../../lib/shared/logger';

export async function validateCommand(options: { file: string }) {
  try {
    output(`Validating configuration: ${options.file}`);

    // Initialize Supabase backend if environment variables are available
    let supabaseBackend: SupabaseStorageBackend | undefined;

    try {
      if (process.env.SUPABASE_URL || process.env.SUPABASE_ANON_KEY) {
        supabaseBackend = new SupabaseStorageBackend();
        output('Supabase backend configured for validation');
      }
    } catch (err: any) {
      error(`Supabase configuration error: ${err.message}`);
      process.exit(1);
    }

    const parser = new FleetParser(options.file, { supabaseBackend });
    await parser.parseFleetConfig(options.file);

    output('Configuration is valid.');
  } catch (err: any) {
    error('Configuration validation failed:');
    error(err.message);
    process.exit(1);
  }
}
