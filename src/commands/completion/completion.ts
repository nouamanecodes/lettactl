/**
 * Shell completion scripts for lettactl
 */
import { output, error } from '../../lib/shared/logger';

const COMMANDS = [
  'apply',
  'get',
  'describe',
  'delete',
  'delete-all',
  'cleanup',
  'create',
  'update',
  'export',
  'import',
  'validate',
  'send',
  'reset-messages',
  'compact-messages',
  'cancel-messages',
  'health',
  'files',
  'run-delete',
  'completion',
];

const RESOURCES = ['agents', 'agent', 'blocks', 'block', 'archives', 'archive', 'tools', 'tool', 'folders', 'folder', 'files', 'file', 'mcp-servers'];

const GET_SUBCOMMANDS = [...RESOURCES, 'messages', 'runs', 'run', 'context'];

const bashCompletion = `
# lettactl bash completion
_lettactl_completions() {
    local cur prev commands resources
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"

    commands="${COMMANDS.join(' ')}"
    resources="${RESOURCES.join(' ')}"
    get_subcommands="${GET_SUBCOMMANDS.join(' ')}"

    case "\${prev}" in
        lettactl)
            COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
            return 0
            ;;
        get)
            COMPREPLY=( $(compgen -W "\${get_subcommands}" -- "\${cur}") )
            return 0
            ;;
        describe|delete|create|update|export)
            COMPREPLY=( $(compgen -W "\${resources}" -- "\${cur}") )
            return 0
            ;;
        cleanup)
            COMPREPLY=( $(compgen -W "blocks folders archives all" -- "\${cur}") )
            return 0
            ;;
        completion)
            COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
            return 0
            ;;
        -f|--file)
            COMPREPLY=( $(compgen -f -- "\${cur}") )
            return 0
            ;;
        -o|--output)
            COMPREPLY=( $(compgen -W "table json yaml" -- "\${cur}") )
            return 0
            ;;
    esac

    if [[ "\${cur}" == -* ]]; then
        COMPREPLY=( $(compgen -W "--help --version --verbose --quiet --no-spinner" -- "\${cur}") )
        return 0
    fi
}

complete -F _lettactl_completions lettactl
`;

const zshCompletion = `
#compdef lettactl

_lettactl() {
    local -a commands resources

    commands=(
        'apply:Deploy agents from configuration'
        'get:Display resources'
        'describe:Show detailed information about a resource'
        'delete:Delete a resource'
        'delete-all:Delete multiple agents'
        'cleanup:Delete orphaned resources'
        'create:Create a new agent'
        'update:Update an existing agent'
        'export:Export an agent to a file'
        'import:Import an agent from a file'
        'validate:Validate agent configuration'
        'send:Send a message to an agent'
        'reset-messages:Reset conversation history'
        'compact-messages:Compact conversation history'
        'cancel-messages:Cancel running message processes'
        'health:Check Letta server connectivity'
        'files:Show attached files'
        'run-delete:Delete/cancel a run'
        'completion:Generate shell completion script'
    )

    resources=(
        'agents:List all agents'
        'agent:Single agent'
        'blocks:Memory blocks'
        'archives:Archives'
        'block:Single block'
        'archive:Single archive'
        'tools:Tools'
        'tool:Single tool'
        'folders:Folders'
        'folder:Single folder'
        'files:Files'
        'file:Single file'
        'mcp-servers:MCP servers'
    )

    _arguments -C \\
        '(-h --help)'{-h,--help}'[Show help]' \\
        '(-V --version)'{-V,--version}'[Show version]' \\
        '(-v --verbose)'{-v,--verbose}'[Enable verbose output]' \\
        '(-q --quiet)'{-q,--quiet}'[Suppress progress output]' \\
        '--no-spinner[Disable loading spinners]' \\
        '1: :->command' \\
        '2: :->resource' \\
        '*:: :->args'

    case "$state" in
        command)
            _describe -t commands 'lettactl command' commands
            ;;
        resource)
            case "\${words[1]}" in
                get)
                    local -a get_subcommands
                    get_subcommands=(
                        'agents:List agents'
                        'blocks:List memory blocks'
                        'archives:List archives'
                        'tools:List tools'
                        'folders:List folders'
                        'files:List files'
                        'mcp-servers:List MCP servers'
                        'archival:List archival memory'
                        'messages:List conversation messages'
                        'runs:List async job runs'
                        'run:Get run details'
                        'context:Show token usage'
                    )
                    _describe -t get_subcommands 'get subcommand' get_subcommands
                    ;;
                describe|delete|create|update|export)
                    _describe -t resources 'resource type' resources
                    ;;
                cleanup)
                    _values 'resource' 'blocks' 'folders' 'archives' 'all'
                    ;;
                completion)
                    _values 'shell' 'bash' 'zsh' 'fish'
                    ;;
            esac
            ;;
    esac
}

_lettactl
`;

const fishCompletion = `
# lettactl fish completion

# Disable file completion by default
complete -c lettactl -f

# Commands
complete -c lettactl -n __fish_use_subcommand -a apply -d 'Deploy agents from configuration'
complete -c lettactl -n __fish_use_subcommand -a get -d 'Display resources'
complete -c lettactl -n __fish_use_subcommand -a describe -d 'Show detailed information'
complete -c lettactl -n __fish_use_subcommand -a delete -d 'Delete a resource'
complete -c lettactl -n __fish_use_subcommand -a delete-all -d 'Delete multiple agents'
complete -c lettactl -n __fish_use_subcommand -a cleanup -d 'Delete orphaned resources'
complete -c lettactl -n __fish_use_subcommand -a create -d 'Create a new agent'
complete -c lettactl -n __fish_use_subcommand -a update -d 'Update an existing agent'
complete -c lettactl -n __fish_use_subcommand -a export -d 'Export an agent to a file'
complete -c lettactl -n __fish_use_subcommand -a import -d 'Import an agent from a file'
complete -c lettactl -n __fish_use_subcommand -a validate -d 'Validate agent configuration'
complete -c lettactl -n __fish_use_subcommand -a send -d 'Send a message to an agent'
complete -c lettactl -n __fish_use_subcommand -a reset-messages -d 'Reset conversation history'
complete -c lettactl -n __fish_use_subcommand -a compact-messages -d 'Compact conversation history'
complete -c lettactl -n __fish_use_subcommand -a cancel-messages -d 'Cancel running messages'
complete -c lettactl -n __fish_use_subcommand -a health -d 'Check server connectivity'
complete -c lettactl -n __fish_use_subcommand -a files -d 'Show attached files'
complete -c lettactl -n __fish_use_subcommand -a run-delete -d 'Delete/cancel a run'
complete -c lettactl -n __fish_use_subcommand -a completion -d 'Generate shell completion'

# Subcommands for get
complete -c lettactl -n '__fish_seen_subcommand_from get' -a 'agents blocks archives tools folders files mcp-servers archival messages runs run context' -d 'Resource type'

# Resources for describe/delete/create/update/export
complete -c lettactl -n '__fish_seen_subcommand_from describe delete create update export' -a 'agents agent blocks block archives archive tools tool folders folder files file mcp-servers' -d 'Resource type'

# Cleanup resources
complete -c lettactl -n '__fish_seen_subcommand_from cleanup' -a 'blocks folders archives all' -d 'Resource type'

# Completion shells
complete -c lettactl -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish' -d 'Shell type'

# Global options
complete -c lettactl -s h -l help -d 'Show help'
complete -c lettactl -s V -l version -d 'Show version'
complete -c lettactl -s v -l verbose -d 'Enable verbose output'
complete -c lettactl -s q -l quiet -d 'Suppress progress output'
complete -c lettactl -l no-spinner -d 'Disable loading spinners'

# Apply options
complete -c lettactl -n '__fish_seen_subcommand_from apply' -s f -l file -d 'Configuration file' -r
complete -c lettactl -n '__fish_seen_subcommand_from apply' -l agent -d 'Filter by agent pattern'
complete -c lettactl -n '__fish_seen_subcommand_from apply' -l match -d 'Match existing agents'
complete -c lettactl -n '__fish_seen_subcommand_from apply' -l dry-run -d 'Show what would be created'
complete -c lettactl -n '__fish_seen_subcommand_from apply' -l root -d 'Root directory for paths' -r

# Output format
complete -c lettactl -n '__fish_seen_subcommand_from get describe' -s o -l output -a 'table json yaml' -d 'Output format'
`;

export function completionCommand(shell: string) {
  switch (shell) {
    case 'bash':
      output(bashCompletion.trim());
      break;
    case 'zsh':
      output(zshCompletion.trim());
      break;
    case 'fish':
      output(fishCompletion.trim());
      break;
    default:
      error(`Unknown shell: ${shell}`);
      error('Supported shells: bash, zsh, fish');
      error('');
      error('Usage:');
      error('  # Bash');
      error('  lettactl completion bash >> ~/.bashrc');
      error('');
      error('  # Zsh');
      error('  lettactl completion zsh >> ~/.zshrc');
      error('');
      error('  # Fish');
      error('  lettactl completion fish > ~/.config/fish/completions/lettactl.fish');
      process.exit(1);
  }
}
