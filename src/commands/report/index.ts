import { validateResourceType } from '../../lib/validation/validators';
import { withErrorHandling } from '../../lib/shared/error-handler';
import { getSpinnerEnabled } from '../../lib/ux/spinner';
import { SUPPORTED_REPORT_TYPES, ReportOptions } from './types';
import { reportMemory } from './memory';

async function reportCommandImpl(
  reportType: string,
  agentName: string | undefined,
  options: ReportOptions,
  command: any
) {
  validateResourceType(reportType, SUPPORTED_REPORT_TYPES);

  const spinnerEnabled = getSpinnerEnabled(command);

  switch (reportType) {
    case 'memory':
      await reportMemory(agentName, options, spinnerEnabled);
      break;
  }
}

export default withErrorHandling('Report command', reportCommandImpl);
